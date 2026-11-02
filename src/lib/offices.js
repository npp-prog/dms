// A person's offices. users/{uid}.office (and .head) is the office they act for now: documents,
// folders, signing, office-head rights and the security rules all follow it. users/{uid}.offices
// lists every office an administrator gave them ([{ office, head }]); they switch among those (top
// bar), which sets office and head to one of them (firestore.rules allow nothing else).
export const OFFICE_LIMIT = 10;

// Every office of a profile, the current one included (once each).
export function officesOf(p) {
  const out = [];
  const add = (office, head) => {
    const o = String(office || '').trim();
    if (o && !out.some((x) => x.office === o)) out.push({ office: o, head: Boolean(head) });
  };
  if (p?.office) add(p.office, p.head);
  for (const e of p?.offices || []) add(e?.office, e?.head);
  return out.slice(0, OFFICE_LIMIT);
}

// The other offices (not the current one).
export const otherOffices = (p) => officesOf(p).filter((e) => e.office !== (p?.office || ''));

// The profile fields after an administrator's change: office/head (current) and offices (all).
// others: the other offices as edited (default: as they were).
export function officesPatch(u, patch = {}, others = otherOffices(u)) {
  const next = { ...u, ...patch };
  if (next.role === 'payee' || !next.office) return { ...patch, offices: [] };
  // Made current: an office from the list keeps its head setting (unless changed with it), and the
  // office they were acting for stays in the list. Another office instead replaces it (a move).
  const was = others.find((e) => e.office === next.office);
  const kept = was && u.office && u.office !== next.office ? [{ office: u.office, head: Boolean(u.head) }] : [];
  const list = [...others, ...kept].filter((e) => e.office !== next.office);
  const head = 'head' in patch ? Boolean(patch.head) : was && 'office' in patch ? was.head : Boolean(next.head);
  const offices = officesOf({ office: next.office, head, offices: list });
  return { ...patch, head, offices };
}

// The {office, head} entries exactly as stored (the rules compare them as maps).
export const entryOf = (e) => ({ office: String(e.office), head: Boolean(e.head) });
