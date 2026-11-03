// DV pre-audit check (AI): what is sent to Claude, the instructions, and reading its answer. Pure:
// no Firebase, no network (netlify/functions/precheck-background.mjs does the work).
// The check only points things out: it never approves, returns, routes or signs anything.

export const PRECHECK_TYPES = ['DV'];
export const PRECHECK_MODEL = 'claude-sonnet-5-5';
// What one check may read (cost and time): PDFs, pages and bytes in all.
export const PRECHECK_LIMITS = { files: 15, pages: 80, bytes: 24 * 1024 * 1024 };
export const SEVERITIES = { high: 'Must fix', medium: 'Check', low: 'Note' };

const s = (v) => (v === undefined || v === null ? '' : String(v));

// The PDFs to read, in order: the DV's current PDF, then each checklist item's attachments, the step
// uploads and the supplemental documents. Each: { label, path } (a file of this document) or
// { label, docId } (a DMS document linked: its own current PDF).
export function precheckFiles(d) {
  const out = [];
  const current = (d.pdf?.files || []).at(-1);
  if (current?.path) out.push({ label: `The DV itself (${d.controlNo || 'this document'})`, path: current.path, main: true });
  const items = Object.fromEntries((d.transaction?.items || []).map((i) => [i.id, i.label]));
  for (const [itemId, list] of Object.entries(d.links || {})) {
    for (const l of list || []) {
      const label = `Checklist item "${items[itemId] || itemId}": ${l.label || l.name || l.controlNo || 'attachment'}`;
      if (l?.kind === 'fts' && l.id) out.push({ label: `${label} (${l.typeCode || ''} ${l.controlNo || ''})`.trim(), docId: l.id });
      else if (l?.path && /\.pdf$/i.test(l.path)) out.push({ label, path: l.path });
    }
  }
  for (const f of d.stepFiles || []) if (f?.path && /\.pdf$/i.test(f.path)) out.push({ label: `Uploaded at a route step: ${f.label || f.name}`, path: f.path });
  for (const f of d.supplements || []) {
    if (f?.kind === 'fts' && f.id) out.push({ label: `Supplemental: ${f.label || f.controlNo}`, docId: f.id });
    else if (f?.path && /\.pdf$/i.test(f.path)) out.push({ label: `Supplemental: ${f.label || f.name}`, path: f.path });
  }
  return out;
}

// The checklist as the preparer ticked it: each item, Y / N/A / not ticked, and what is linked.
export function checklistRows(d) {
  return (d.transaction?.items || []).map((i) => ({
    item: i.label, required: Boolean(i.required),
    ticked: d.checklist?.[i.id] === 'NA' ? 'N/A' : d.checklist?.[i.id] === 'Y' || d.checklist?.[i.id] === true ? 'Y (attached)' : 'not ticked',
    linked: (d.links?.[i.id] || []).map((l) => l.controlNo || l.label || l.name).filter(Boolean),
  }));
}

// What changed since the last check: its PDF, attachments, details and checklist.
export function precheckBasis(d) {
  return JSON.stringify([
    (d.pdf?.files || []).at(-1)?.path || '',
    Object.entries(d.links || {}).map(([k, v]) => [k, (v || []).map((l) => l.path || l.id || '')]),
    (d.supplements || []).map((l) => l.path || l.id || ''), (d.stepFiles || []).map((f) => f.path || ''),
    d.data || {}, d.checklist || {}, d.transaction?.code || '',
  ]);
}

export const PRECHECK_SYSTEM = `You assist the Municipal Accounting Office of the Municipal Government of Candoni (Negros Occidental, Philippines) with the pre-audit of Disbursement Vouchers (DV), under COA rules and the Government Accounting Manual for LGUs.

You receive the DV's details as encoded in DMS, its checklist of requirements as the preparer ticked it, and the PDFs: the DV itself first, then its attachments, each titled with what it is supposed to be.

Check the DV against its attachments and the checklist, as a careful pre-auditor would, and report only what you can see in what was given. Look in particular for:
- amounts: the amount in figures and in words; the particulars adding up to the total; deductions and the net amount; the same amounts on the OBR/FURS, invoice, receipt, PO/contract and inspection report;
- the payee: the same name (and TIN) on the DV, OBR, invoice or receipt, PO or contract;
- dates in a sensible order (request, order or contract, delivery and inspection, invoice, obligation, DV), and documents dated after the DV or expired at its date;
- the OBR/FURS: present, with the same amount, fund and payee;
- the boxes of the DV: Box A (certified by the head of the requesting office), and whether the documents that must be signed are signed;
- the checklist: a required item not ticked; an item ticked as attached with nothing linked; an attachment that is not what its checklist item says (for example an official receipt where an inspection report is expected); illegible, blank or cut pages;
- arithmetic, wrong or missing details, and anything else a pre-auditor would return the DV for.

Do not invent problems. If something cannot be checked from what was given (a page is unreadable, an attachment is missing), say so as a finding. You never approve or reject the DV: the Accounting Office decides. Write in plain English, briefly.

Answer with JSON only, no other text, in exactly this form:
{"summary": "one or two sentences", "verdict": "no_issues" | "issues" | "cannot_check", "findings": [{"severity": "high" | "medium" | "low", "area": "Amounts" | "Payee" | "Dates" | "OBR" | "Signatures" | "Checklist" | "Attachments" | "Details" | "Other", "finding": "what is wrong or must be checked", "where": "which document and page", "evidence": "what you saw, quoted briefly"}]}
high: the DV should not pass pre-audit as it is; medium: to check or correct; low: a minor note. No findings: an empty list and verdict "no_issues".`;

// The text part of the request: the encoded details and the checklist.
export function precheckBrief(d, read = [], skipped = []) {
  const data = d.data || {};
  const parts = (data.particulars || []).map((p) => `- ${s(p.explanation || p.description || p.particulars)}: ${s(p.amount)}`).join('\n');
  const adj = (data.adjustments || []).map((a) => `- ${s(a.explanation || a.description)}: ${s(a.amount)}`).join('\n');
  const rows = checklistRows(d).map((r) => `- ${r.item}${r.required ? ' (required)' : ''}: ${r.ticked}${r.linked.length ? `; linked: ${r.linked.join(', ')}` : ''}`).join('\n');
  return `DV ${s(d.controlNo)}${data.dvNo ? `, DV No. ${s(data.dvNo)}` : ''}${data.dvDate ? `, dated ${s(data.dvDate)}` : ''}
Payee: ${s(data.payee)}${data.tinNo ? `, TIN ${s(data.tinNo)}` : ''}${data.address ? `, ${s(data.address)}` : ''}
Fund: ${s(data.fund)}. OBR No.: ${s(data.obrNo) || '(none encoded)'}. Responsibility center: ${s(data.respCenter)}
Box A certified by: ${s(data.certA)}${data.certAPos ? `, ${s(data.certAPos)}` : ''}. Approver: ${s(data.approver)}
Amount due (encoded): ${s(data.amountDue)}
Particulars:
${parts || '(none encoded)'}
Deductions / adjustments:
${adj || '(none)'}
${data.checkNo ? `Check/ADA No. ${s(data.checkNo)}, ${s(data.checkDate)}, ${s(data.bankName)}\n` : ''}Type of transaction: ${s(d.transaction?.code)} ${s(d.transaction?.title)}
Checklist as ticked:
${rows || '(no checklist)'}

PDFs given, in order: ${read.map((f, i) => `${i + 1}. ${f.label}`).join('; ') || 'none'}.${skipped.length ? `\nNot given (too many pages, not readable or no access): ${skipped.map((f) => `${f.label}${f.why ? ` (${f.why})` : ''}`).join('; ')}.` : ''}`;
}

// Claude's answer → { summary, verdict, findings } (findings cleaned; anything else dropped).
export function parsePrecheck(text) {
  const t = String(text || '');
  const start = t.indexOf('{'); const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The check gave no readable answer. Please try again.');
  const j = JSON.parse(t.slice(start, end + 1));
  const sev = (v) => (['high', 'medium', 'low'].includes(v) ? v : 'medium');
  const findings = (Array.isArray(j.findings) ? j.findings : []).slice(0, 40).map((f) => ({
    severity: sev(f?.severity), area: s(f?.area).slice(0, 40) || 'Other', finding: s(f?.finding).slice(0, 600),
    where: s(f?.where).slice(0, 200), evidence: s(f?.evidence).slice(0, 400),
  })).filter((f) => f.finding);
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    summary: s(j.summary).slice(0, 600),
    verdict: ['no_issues', 'issues', 'cannot_check'].includes(j.verdict) ? j.verdict : (findings.length ? 'issues' : 'no_issues'),
    findings,
  };
}
