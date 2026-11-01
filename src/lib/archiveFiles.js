// What the Archive keeps of a document, shared by the backup ZIP (lib/archive.js) and the
// automatic Google Drive backup (netlify/lib/driveBackup.mjs). No Firebase here.

// The calendar day (YYYY-MM-DD) in the Philippines, wherever the code runs (a phone, a Netlify
// server in UTC): toISOString().slice(0, 10) gives the UTC day, the day before until 8 a.m.
export const localDay = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// Processed (in the Archive): its route is done; or it is a supporting document (with no route of
// its own) of a document that is processed: it goes into the Archive with it (parentProcessedAt,
// added when the documents are read: withParents).
export const isArchived = (d) => d?.workflow?.state === 'done' || Boolean(d?.parentProcessedAt);
export const processedAt = (d) => [...(d?.workflow?.events || [])].reverse().find((e) => e.type === 'completed')?.at || d?.parentProcessedAt || '';

// Supporting documents follow their main document: those whose main document (among parents) is
// processed get its processed date. Not stored: worked out each time the documents are read.
export function withParents(docs, parents = docs) {
  const done = new Map(parents.filter((p) => p?.workflow?.state === 'done').map((p) => [p.id, processedAt(p)]));
  return docs.map((d) => (d?.supports?.id && !d.workflow && done.has(d.supports.id) ? { ...d, parentProcessedAt: done.get(d.supports.id) } : d));
}

export const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

// Every file of a document: its PDF versions, the files attached to its checklist and other
// attachments, and the files its route steps uploaded. name may hold a subfolder (attachments/...).
export function filesOf(d) {
  const out = [];
  (d.pdf?.files || []).forEach((f, i) => out.push({ path: f.path, name: `PDF ${String(i + 1).padStart(2, '0')} ${f.kind}.pdf`, pdf: true }));
  for (const list of Object.values(d.links || {})) {
    for (const l of list || []) if (l?.kind === 'file' && l.path) out.push({ path: l.path, name: `attachments/${safe(l.name) || 'file'}` });
  }
  for (const f of d.stepFiles || []) if (f?.path) out.push({ path: f.path, name: `step files/${safe(f.label)} ${safe(f.name)}` });
  // Supplemental documents (files that go with it, not on its checklist).
  for (const f of d.supplements || []) if (f?.path) out.push({ path: f.path, name: `supplements/${safe(f.label || f.name) || 'file'}` });
  return out;
}

// The folder of a document in a backup: year processed / type / control no. and payee.
export const docFolder = (d) => [processedAt(d) ? localDay(processedAt(d)).slice(0, 4) : 'undated', safe(d.typeCode) || 'DOC', safe(`${d.controlNo} ${d.title}`)];
