// Signature requests (as in eGovDoc): for a document outside any route (for example an uploaded
// certificate), its preparer chooses who signs it, in what order, and where on the PDF each one
// signs. documents/{id}.signRequest:
//   { state: 'open' | 'done' | 'declined' | 'cancelled', current, by, byUid, at, note,
//     steps: [{ uid, name, office, position, label, page, rect: [x1, y1, x2, y2] (PDF points),
//               status: 'pending' | 'signed' | 'declined', at, remarks }] }
// documents/{id}.signers: their uids (they may open it; the Documents list finds it by them).
// They sign one after the other: the person at `current` signs where their box is (e-signature or
// PNPKI), which records their step and passes it on; the preparer is told when all have signed.
export const SIGN_BOX = { w: 150, h: 48 }; // a box's size on the PDF, in points
export const SIGNER_LIMIT = 10;

export function buildSignRequest(steps, note, user, at = new Date().toISOString()) {
  const list = (steps || []).filter((s) => s?.uid);
  if (!list.length) throw new Error('Add at least one person to sign.');
  if (list.length > SIGNER_LIMIT) throw new Error(`At most ${SIGNER_LIMIT} people can be asked to sign.`);
  const missing = list.find((s) => !Array.isArray(s.rect) || s.rect.length !== 4 || !Number.isInteger(s.page));
  if (missing) throw new Error(`Tap the PDF where ${missing.name || 'each person'} signs.`);
  if (new Set(list.map((s) => s.uid)).size !== list.length) throw new Error('Each person can be asked once.');
  return {
    state: 'open', current: 0, by: user.displayName || user.email || '', byUid: user.uid, at, note: String(note || '').trim().slice(0, 500),
    steps: list.map((s) => ({
      uid: s.uid, name: String(s.name || '').slice(0, 120), office: String(s.office || ''), position: String(s.position || '').slice(0, 120),
      label: String(s.label || '').trim().slice(0, 60), page: s.page, rect: s.rect.map((n) => Math.round(Number(n) * 100) / 100), status: 'pending',
    })),
  };
}

export const openRequest = (d) => (d?.signRequest?.state === 'open' ? d.signRequest : null);
export const currentSigner = (d) => { const r = openRequest(d); return r ? r.steps[r.current] || null : null; };
export const isMyTurn = (d, uid) => Boolean(uid) && currentSigner(d)?.uid === uid;

// The current person signed: their step is done; the next one's turn, or the request is done.
export function afterSigned(r, at = new Date().toISOString()) {
  const steps = r.steps.map((s, i) => (i === r.current ? { ...s, status: 'signed', at } : s));
  const current = r.current + 1;
  return { ...r, steps, current, state: current >= steps.length ? 'done' : 'open' };
}
// The current person declined (with why): the request stops; the preparer is told.
export function afterDeclined(r, remarks, at = new Date().toISOString()) {
  if (!String(remarks || '').trim()) throw new Error('Say why you decline to sign.');
  const steps = r.steps.map((s, i) => (i === r.current ? { ...s, status: 'declined', at, remarks: String(remarks).trim().slice(0, 500) } : s));
  return { ...r, steps, state: 'declined' };
}
// The mark (w × h) centred in a step's box.
export function markInBox(step, w, h) {
  const [x1, y1, x2, y2] = step.rect;
  const cx = (x1 + x2) / 2; const cy = (y1 + y2) / 2;
  return { page: step.page, rect: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2] };
}
