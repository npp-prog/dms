// Emails for a document that has just reached an office (or a person) on its route
// (functions/email.mjs, { arrived: id }). The browser of whoever routed it asks; nothing is sent
// unless the document's newest route event is that user's move, made in the last minutes, so no
// one can make DMS email anything but a real move of theirs, to the people now holding it.

const MOVES = { released: 'routed', returned: 'returned', referred: 'referred', 'referral back': 'sent back' };
export const ARRIVAL_WINDOW_MS = 15 * 60 * 1000;

// doc: the document (plain values), uid: who asks. → null, or { key, holder, person, wanted, text, link }
export function arrivalPlan(doc, uid, now = Date.now()) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress' || !Array.isArray(wf.events)) return null;
  const ev = wf.events.at(-1);
  if (!ev || ev.uid !== uid || !MOVES[ev.type]) return null;
  const t = Date.parse(ev.at || '');
  if (!Number.isFinite(t) || now - t > ARRIVAL_WINDOW_MS || t - now > 60 * 1000) return null;
  const holder = String(doc.currentOffice || '');
  if (!holder) return null;
  const person = holder.startsWith('person:') ? holder.slice(7) : '';
  // Back at the preparer's own step: the preparer is told already (their notification).
  if (!person && doc.atPreparer) return null;
  const step = wf.steps?.[wf.stage] || {};
  const name = [doc.typeCode, doc.controlNo].filter(Boolean).join(' ') + (doc.title ? ` (${String(doc.title).slice(0, 80)})` : '');
  const by = `${ev.by || 'Someone'}${ev.office ? ` (${ev.office})` : ''}`;
  const where = person ? 'is now with you' : `is now with your office (${holder})`;
  const what = !person && step.action ? ` for: ${step.action}` : '';
  const why = ev.remarks ? ` Remarks: ${String(ev.remarks).slice(0, 200)}` : '';
  return {
    key: `arrived/${doc.id || ''}/${wf.events.length}`,
    holder, person,
    // who in the office acts on the step (positions; the office head always may)
    wanted: person || wf.referral ? [] : (step.positions || []),
    text: `${name} was ${MOVES[ev.type]} by ${by} and ${where}${what}.${why}`.slice(0, 500),
    link: `/documents/${doc.id || ''}`,
  };
}

// entries: directory entries ({ uid, email, office, head, positions, emailOff, external }) of the
// holder (its office's, or the person's). → the email addresses to send to.
export function arrivalRecipients(entries, plan, senderUid) {
  return [...new Set((entries || []).filter((p) => p?.email && p.uid !== senderUid && !p.emailOff
    && (plan.person ? p.uid === plan.person
      : p.office === plan.holder && !p.external
        && (!plan.wanted.length || p.head === true || (p.positions || []).some((x) => plan.wanted.includes(x)))))
    .map((p) => p.email))];
}
