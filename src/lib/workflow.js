// Document workflow: the route a document follows after it is encoded. Admins set the route of
// each document type (Administration > Workflow: documentType.route); a type without one follows
// its processing guide ("How to process this document"). Pure functions, no Firebase.
//
// document.workflow = {
//   state: 'in-progress' | 'done' | 'cancelled',
//   stage: index of the current step,
//   received: always true now (documents are no longer received; older ones may have false),
//   steps: [{ office (as in the guide), action, routedTo (office in Settings, or '' = preparer),
//            sign (the office must sign the PDF before routing it) }],
//   events: [{ type: 'started' | 'received' | 'released' | 'returned' | 'completed' | 'cancelled'
//              | 'route' | 'referred' | 'referral received' | 'referral back', stage, office, by, uid, at, remarks }],
//   choose: true while the preparer has yet to choose the office of the steps with alternates
//          (steps[i].alternates: other offices that may handle the step; routedTo: the one chosen),
//   referral: { uid, name, office, fromOffice, by, byUid, at, note, received } while the document is
//          with a person outside the route (referred by the office holding it); they send it back.
// }
// document.currentOffice: the office holding it (what the Inbox and the security rules use), or
// 'person:<uid>' while it is referred to a person;
// document.atPreparer: it is at a step of the preparer's office (only the preparer and the office
// head see it then, not the preparer's colleagues);
// document.routeOffices: the offices on the route the document has reached so far (their office
// heads can open the document).

import { viceApproves } from './approver.js';

// Steps done by the preparer's own office (or by people it deals with directly).
const PREPARER = /requesting|claimant|supervisor|payee|custodian|traveler|supplier|end[- ]?user/i;

// Guide wording -> office in Settings.
const KEYWORDS = [
  [/treasur|disbursing/i, (o) => /treasur/i.test(o)],
  [/accounting|accountant/i, (o) => /accounting/i.test(o)],
  [/budget/i, (o) => /budget/i.test(o)],
  [/vice mayor/i, (o) => /vice mayor/i.test(o)],
  [/mayor/i, (o) => /municipal mayor/i.test(o) && !/vice/i.test(o)],
  [/\bgso\b|general services|inspection|\bbac\b/i, (o) => /general services/i.test(o)],
  [/sangguniang|\bsb\b/i, (o) => /sangguniang/i.test(o)],
  [/assessor/i, (o) => /assessor/i.test(o)],
  [/engineer/i, (o) => /engineering/i.test(o)],
  [/hrm|human resource/i, (o) => /human resource/i.test(o)],
];

// The office (as named in Settings) that handles a step; '' means the preparer's office.
export function resolveOffice(stepOffice, offices = []) {
  const name = String(stepOffice || '').trim();
  if (!name || PREPARER.test(name)) return '';
  const exact = offices.find((o) => o.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  for (const [re, pick] of KEYWORDS) {
    if (re.test(name)) {
      const found = offices.find(pick);
      if (found) return found;
    }
  }
  return name;
}

// Who holds a step: the office it is routed to, or the preparer's office.
// A route step for a third party (not an office): a supplier, payee or other person outside the
// route's offices, whom the preparer designates (step.party: { uid, name }) before routing it.
export const THIRD_PARTY = '@third-party';
export const isThirdParty = (step) => step?.office === THIRD_PARTY;

// Who holds a step: the office it is routed to, the third party's name, or the preparer's office.
export const officeOf = (step, doc) => (isThirdParty(step) ? step.party?.name || 'Third party (to be chosen)' : step?.routedTo || doc?.office || '');
// What currentOffice holds for a step: an office, or 'person:<uid>' for a third party.
const holderOf = (step, doc) => (isThirdParty(step) ? `person:${step.party?.uid || ''}` : officeOf(step, doc));

// The route suggested by a type's processing guide, as the admin route editor starts it.
export function routeFromGuide(type, offices = []) {
  return (type?.processing || []).map((p) => ({
    office: resolveOffice(p.office, offices), action: p.action || '', sign: false,
    ...(p.assign ? { assign: p.assign } : {}), ...(p.fills?.length ? { fills: p.fills } : {}), ...(p.upload ? { upload: p.upload } : {}),
  }));
}

// The steps a new document of this type follows: the admin's route, else the processing guide.
// A step may name alternate offices (e.g. the Vice Mayor instead of the Mayor); the preparer
// chooses which office handles it before first releasing the document.
export function routeSteps(type, offices = []) {
  const steps = type?.route?.length ? type.route : routeFromGuide(type, offices);
  return steps.map((s) => ({
    office: s.office || 'Requesting office', action: s.action || '', routedTo: s.office || '', sign: Boolean(s.sign),
    // a third party: designated by the preparer (chooseOffices)
    ...(s.office === THIRD_PARTY ? { thirdParty: true } : {}),
    ...(s.alternates?.length ? { alternates: s.alternates.filter((o) => o !== (s.office || '')) } : {}),
    // Who in the office acts on it (positions, Users); none: anyone in the office.
    ...(s.positions?.length && s.office ? { positions: [...s.positions] } : {}),
    // The reference no. this office assigns (when the office first opens the document) (e.g. the DV No.).
    ...(s.assign?.field ? { assign: { field: s.assign.field, dateField: s.assign.dateField || '', pattern: s.assign.pattern || '' } } : {}),
    // Fields this office fills in (e.g. Check/ADA No., date, bank) and a file it must upload
    // (e.g. the DV signed by the payee in Box E), both before it releases the document.
    ...(s.fills?.length ? { fills: [...s.fills] } : {}),
    ...(s.upload ? { upload: String(s.upload) } : {}),
  }));
}

// Fields a step's office assigns as a reference no. (and its date) once the PDF is made: from the
// document's own route, else the type's route or processing guide.
export function assignedFields(type, doc) {
  const steps = doc?.workflow?.steps || (type?.route?.length ? type.route : type?.processing || []);
  return new Set(steps.flatMap((s) => (s.assign?.field ? [s.assign.field, s.assign.dateField].filter(Boolean) : [])));
}

// A step that may go to the Mayor's or the Vice Mayor's office, routed to the other one than the
// approver chosen on the form (Approved by): { stage, office } of the one it should go to, or null.
export function approverMismatch(doc) {
  const wf = doc?.workflow;
  if (!wf || !doc.data?.approver) return null;
  const vice = viceApproves(doc.data);
  for (const [i, s] of wf.steps.entries()) {
    const options = [s.office, ...(s.alternates || [])].filter(Boolean);
    const viceOffice = options.find((o) => /vice mayor/i.test(o));
    const mayorOffice = options.find((o) => /mayor/i.test(o) && !/vice/i.test(o));
    if (!viceOffice || !mayorOffice) continue;
    const want = vice ? viceOffice : mayorOffice;
    if ((s.routedTo || s.office) !== want) return { stage: i, office: want };
  }
  return null;
}

export function buildWorkflow(type, doc, offices, user, at = new Date().toISOString()) {
  // The Vice Mayor approves: their office is chosen already where it is an alternate.
  const steps = routeSteps(type, offices).map((s) => {
    const vice = viceApproves(doc?.data) && s.alternates?.find((o) => /vice mayor/i.test(o));
    return vice ? { ...s, routedTo: vice } : s;
  });
  if (!steps.length) return null;
  const workflow = {
    state: 'in-progress', stage: 0, received: true, steps,
    // Steps with alternate offices, or for a third party: the preparer chooses before routing it.
    ...(steps.some((s) => s.alternates?.length || isThirdParty(s)) ? { choose: true } : {}),
    events: [{ type: 'started', stage: 0, office: officeOf(steps[0], doc), by: user.displayName || user.email, uid: user.uid, at, remarks: '' }],
  };
  return { workflow, ...placement(workflow, doc) };
}

// currentOffice, atPreparer and routeOffices for the security rules and the Inbox.
// routeOffices: only the offices the document has reached so far (the furthest step it was
// released to, even if returned since), not those still ahead on its route.
export function placement(workflow, doc) {
  const reached = workflow.state === 'done' ? workflow.steps.length - 1
    : Math.max(workflow.stage, ...(workflow.events || []).filter((e) => e.type === 'released').map((e) => e.stage + 1));
  // (offices only: a third party reads it through currentOffice and the referred list)
  const offices = [...new Set(workflow.steps.slice(0, reached + 1).filter((s) => !isThirdParty(s)).map((s) => officeOf(s, doc)).filter(Boolean))];
  const moving = workflow.state === 'in-progress';
  if (moving && workflow.referral) return { currentOffice: `person:${workflow.referral.uid}`, atPreparer: false, routeOffices: offices };
  const current = moving ? holderOf(workflow.steps[workflow.stage], doc) : '';
  return { currentOffice: current, atPreparer: moving && !workflow.steps[workflow.stage].routedTo, routeOffices: offices };
}

// Does the user hold a position the step names (or does it name none)? The office head always may.
export const holdsPosition = (step, positions = [], isHead = false) => isHead || !step?.positions?.length
  || step.positions.some((p) => positions.includes(p));

// Is this user its preparer, or an editor the office head gave it to (the document, or its folder:
// grant = their folderAccess entry)? An editor does what the preparer does.
export function isPreparer(doc, { uid, office = '', grant = null } = {}) {
  if (!doc || !uid) return false;
  if (doc.createdBy === uid) return true;
  const inFolder = Boolean(grant?.edit && !doc.restricted && (grant.all || (grant.types || []).includes(doc.typeCode)));
  // An editor of these folders in every office (given by an administrator).
  if (inFolder && grant.office === '*') return true;
  if (!office || doc.office !== office) return false;
  if ((doc.editors || []).includes(uid)) return true;
  // Not through a folder to a restricted document.
  return inFolder && grant.office === office;
}

// May this user act on the document's current step?
// At the preparer's step: the preparer (or their office head). At a routed step: the office, or
// only its people in the positions the step names (e.g. the Reviewer).
export function canAct(doc, { uid, office, isAdmin, isHead = false, positions = [], grant = null }) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress') return false;
  if (isAdmin) return true;
  if (wf.referral) return wf.referral.uid === uid;
  const step = wf.steps[wf.stage];
  if (isThirdParty(step)) return Boolean(uid) && step.party?.uid === uid;
  const holder = officeOf(step, doc);
  // At the preparer's step only while it is with their own office (as firestore.rules: an editor
  // of folders of every office opens and edits another office's document, but its office routes it).
  if (!step.routedTo) return (isPreparer(doc, { uid, office, grant }) && (!holder || holder === office)) || (isHead && Boolean(office) && office === holder);
  return Boolean(office) && office === holder && holdsPosition(step, positions, isHead);
}

// The actions available on the current step.
export function availableActions(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress') return [];
  // No receiving: released to an office (or referred to a person), it is there to act on.
  if (wf.referral) return ['back'];
  const last = wf.stage === wf.steps.length - 1;
  return [last ? 'complete' : 'release', ...(wf.stage > 0 ? ['return'] : [])];
}

// PDF versions still in effect. A 'restored' version (to change an assigned reference no. that was
// already put on the PDF) is a copy of an earlier version: the versions between them are withdrawn.
// Each kept entry has i, its index in pdf.files.
export function liveFiles(files = []) {
  const out = [];
  files.forEach((f, i) => {
    if (f.kind !== 'restored') { out.push({ ...f, i }); return; }
    while (out.length && out.at(-1).i > f.restores) out.pop();
  });
  return out;
}
export const withdrawnFiles = (files = []) => {
  const live = new Set(liveFiles(files).map((f) => f.i));
  return new Set(files.map((f, i) => i).filter((i) => !live.has(i) && files[i].kind !== 'restored'));
};

// The reference no. this step put on the PDF can still be changed: the document is still at the
// step, and everything added to the PDF since the number went on was added at this step. Returns
// the index (in pdf.files) of the version to go back to, or -1.
export function refUndoBase(doc) {
  const wf = doc?.workflow;
  const step = wf?.state === 'in-progress' && !wf.referral ? wf.steps[wf.stage] : null;
  if (!step?.assign?.field || doc.refNos?.[step.assign.field]?.stage !== wf.stage || refStampMissing(doc)) return -1;
  const live = liveFiles(doc.pdf?.files);
  const at = live.findIndex((f) => f.refStage === wf.stage);
  if (at < 1 || live.slice(at).some((f) => f.stage !== wf.stage || f.kind === 'generated' || f.kind === 'uploaded')) return -1;
  return live[at - 1].i;
}

// A step that requires a signature: is this step's signature on the current PDF? (PDF versions
// record the step they were added at; lib/api.js addPdfVersion.) A document returned and sent
// back unchanged needs no new signature; once it is converted to PDF again (a new PDF, with no
// signatures), the step signs again. Signatures from before steps were recorded count for the
// first step (the preparer's).
export function signatureMissing(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress' || !wf.steps[wf.stage]?.sign) return false;
  const files = liveFiles(doc.pdf?.files);
  // Since the last new PDF (converted, or uploaded as the document itself).
  const current = files.slice(Math.max(...files.map((f, i) => (f.kind === 'generated' || f.kind === 'uploaded' ? i : -1))) + 1);
  // A PNPKI signature or an e-signature (signature mark, for a signatory without a certificate).
  return !current.some((f) => (f.kind === 'signed' || f.kind === 'esigned') && !f.referral && (f.stage === wf.stage || (f.stage == null && wf.stage === 0)));
}

// The reference no. this step assigned (e.g. the DV No.) and is still to put on the face of the PDF
// ({ field, label, value, date } or null). It is put there with this step's signature, or stamped on
// its own (PDF versions record refStage). A PDF converted again after the number was assigned
// prints it in the form.
export function refStampMissing(doc) {
  const wf = doc?.workflow;
  const step = wf?.state === 'in-progress' && !wf.referral ? wf.steps[wf.stage] : null;
  const r = step?.assign?.field ? doc.refNos?.[step.assign.field] : null;
  if (!r || r.stage !== wf.stage) return null;
  const files = liveFiles(doc.pdf?.files);
  const lastNew = Math.max(-1, ...files.map((f, i) => (f.kind === 'generated' || f.kind === 'uploaded' ? i : -1)));
  if (lastNew >= 0 && files[lastNew].kind === 'generated' && files[lastNew].at > r.at) return null;
  if (files.slice(lastNew + 1).some((f) => f.refStage === wf.stage)) return null;
  const date = step.assign.dateField ? doc.refNos?.[step.assign.dateField]?.value : '';
  return { field: step.assign.field, label: r.label, value: r.value, date: date || '' };
}

// Fields the current step's office must fill in that are still empty.
export function fillsMissing(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress') return [];
  return (wf.steps[wf.stage].fills || []).filter((k) => !String(doc.data?.[k] ?? '').trim());
}

// The current step must upload a file (e.g. the DV signed in Box E) and none is there yet. Like a
// signature, one uploaded at this step still counts when the document comes back to it.
export function uploadMissing(doc) {
  const wf = doc?.workflow;
  if (!wf || wf.state !== 'in-progress' || !wf.steps[wf.stage].upload) return false;
  return !(doc.stepFiles || []).some((f) => f.stage === wf.stage);
}

// Applies an action; returns the fields to write ({ workflow, currentOffice, routeOffices }).
export function applyAction(doc, action, user, remarks = '', at = new Date().toISOString()) {
  const wf = doc.workflow;
  if (!availableActions(doc).includes(action)) throw new Error(`"${action}" is not possible at this step.`);
  // The PDF is what travels: the preparer's office converts the document before it leaves.
  if (action === 'release' && wf.stage === 0 && !(doc.pdf?.files || []).length) {
    throw new Error('Convert the document to PDF (PDF and digital signatures) before routing it.');
  }
  if ((action === 'release' || action === 'complete') && fillsMissing(doc).length) {
    throw new Error('Fill in this step\'s details (in the Workflow card) before routing it.');
  }
  // (A step's upload, e.g. the DV signed by the payee in Box E, is optional: it does not hold the
  // document back.)
  if ((action === 'release' || action === 'complete') && assignPending(doc)) {
    throw new Error('This step assigns a reference no. that is not assigned yet: assign it (Workflow card), put it on the PDF, then route it.');
  }
  if ((action === 'release' || action === 'complete') && refStampMissing(doc)) {
    throw new Error(`Put the ${refStampMissing(doc).label} on the PDF (PDF and digital signatures) before routing it.`);
  }
  if ((action === 'release' || action === 'complete') && signatureMissing(doc)) {
    throw new Error('This step requires a signature: sign the PDF (PDF and digital signatures) before routing it.');
  }
  if (action === 'release' && wf.stage === 0 && wf.choose) throw new Error('Choose the office of each step with alternates, and the third party, before routing it.');
  if (action === 'release' && isThirdParty(wf.steps[wf.stage + 1]) && !wf.steps[wf.stage + 1].party?.uid) {
    throw new Error(`Choose the third party of step ${wf.stage + 2} before routing it.`);
  }
  if (action === 'release' && wf.stage === 0 && !wf.events.some((e) => e.type === 'released') && approverMismatch(doc)) {
    const m = approverMismatch(doc);
    throw new Error(`Approved by and the route differ: step ${m.stage + 1} should go to ${m.office}. Choose it in the Workflow card.`);
  }
  if (action === 'return' && !String(remarks).trim()) throw new Error('Say why the document is returned.');
  const event = (type, stage) => ({ type, stage, office: officeOf(wf.steps[stage], doc), by: user.displayName || user.email, uid: user.uid, at, remarks: String(remarks || '').trim() });
  let next;
  if (wf.referral) {
    // With a person outside the route: they act (e.g. sign), and send it back.
    const r = wf.referral;
    const ev = (type) => ({ ...event(type, wf.stage), office: r.office || r.name });
    if (action === 'back') {
      const { referral, ...rest } = wf;
      next = { ...rest, events: [...wf.events, ev('referral back')] };
    }
    return { workflow: next, ...placement(next, doc) };
  }
  if (action === 'release') next = { ...wf, stage: wf.stage + 1, received: true, events: [...wf.events, event('released', wf.stage)] };
  if (action === 'return') next = { ...wf, stage: wf.stage - 1, received: true, events: [...wf.events, event('returned', wf.stage)] };
  if (action === 'complete') next = { ...wf, state: 'done', events: [...wf.events, event('completed', wf.stage)] };
  return { workflow: next, ...placement(next, doc) };
}

// Refers the document to a person outside the route (an active user): it waits for them to
// act on it and send it back to the office holding it, then the route goes on.
export function referDocument(doc, to, note, user, at = new Date().toISOString()) {
  const wf = doc.workflow;
  if (!wf || wf.state !== 'in-progress' || wf.referral) throw new Error('This document cannot be referred now.');
  if (!to?.uid) throw new Error('Choose the person to refer it to.');
  if (to.uid === user.uid) throw new Error('Choose someone other than yourself.');
  const fromOffice = officeOf(wf.steps[wf.stage], doc);
  const referral = { uid: to.uid, name: to.displayName || to.email || '', office: to.office || '', fromOffice, by: user.displayName || user.email, byUid: user.uid, at, note: String(note || '').trim(), received: true };
  const next = { ...wf, referral, events: [...wf.events, { type: 'referred', stage: wf.stage, office: fromOffice, by: user.displayName || user.email, uid: user.uid, at, remarks: `to ${referral.name}${referral.office ? ` (${referral.office})` : ''}${referral.note ? ` — ${referral.note}` : ''}` }] };
  return { workflow: next, ...placement(next, doc) };
}

// The preparer chooses, for each step with alternates, which office handles it ({ stage: office }),
// while the document is still at the first step and before it was first released.
export function chooseOffices(doc, picks, user, at = new Date().toISOString()) {
  const wf = doc.workflow;
  if (!wf || wf.state !== 'in-progress' || wf.stage !== 0 || wf.referral || wf.events.some((e) => e.type === 'released')) {
    throw new Error('The offices can only be chosen before the document is first routed.');
  }
  const changed = [];
  const steps = wf.steps.map((s, i) => {
    // A third party: the person the preparer designates ({ uid, name }).
    if (isThirdParty(s)) {
      const pick = picks[i] ?? s.party;
      if (!pick?.uid) throw new Error(`Step ${i + 1}: choose the third party (supplier, payee…).`);
      const party = { uid: pick.uid, name: pick.name || pick.displayName || pick.email || 'Third party' };
      if (party.uid !== s.party?.uid) changed.push(`Step ${i + 1}: ${party.name}`);
      return { ...s, party };
    }
    if (!s.alternates?.length) return s;
    const main = s.office === 'Requesting office' ? '' : s.office;
    const pick = picks[i] ?? s.routedTo;
    if (![main, ...s.alternates].includes(pick)) throw new Error(`Step ${i + 1}: choose one of its offices.`);
    if (pick !== s.routedTo) changed.push(`Step ${i + 1}: ${pick || 'Preparer\'s office'}`);
    return { ...s, routedTo: pick };
  });
  const remarks = steps.map((s, i) => (isThirdParty(s) ? `Step ${i + 1}: ${s.party.name}` : s.alternates?.length ? `Step ${i + 1}: ${s.routedTo || 'Preparer\'s office'}` : '')).filter(Boolean).join('; ');
  const next = { ...wf, steps, choose: false, events: [...wf.events, { type: 'route', stage: 0, office: officeOf(steps[0], doc), by: user.displayName || user.email, uid: user.uid, at, remarks }] };
  return { workflow: next, ...placement(next, doc), changed };
}

export function cancelWorkflow(doc, user, at = new Date().toISOString()) {
  const wf = doc.workflow;
  if (!wf || wf.state !== 'in-progress') return null;
  const { referral, ...rest } = wf;
  const next = { ...rest, state: 'cancelled', events: [...wf.events, { type: 'cancelled', stage: wf.stage, office: officeOf(wf.steps[wf.stage], doc), by: user.displayName || user.email, uid: user.uid, at, remarks: '' }] };
  return { workflow: next, ...placement(next, doc) };
}

// One line for lists: where the document is.
export function whereIs(doc) {
  const wf = doc?.workflow;
  if (!wf) return '';
  if (wf.state === 'done') return 'Processed';
  if (wf.state === 'cancelled') return 'Cancelled';
  if (wf.referral) return `${wf.referral.name} (referred)`;
  return officeOf(wf.steps[wf.stage], doc) || 'Requesting office';
}

// The preparer may still change the document while it is at the first step (their office).
export function editableByPreparer(doc) {
  const wf = doc?.workflow;
  if (!wf) return true;
  return wf.state === 'in-progress' && wf.stage === 0 && !wf.referral;
}

// Documents are no longer received: released to an office, it is there (older documents still
// waiting "to receive" count as there too).
export const isReceived = (wf) => Boolean(wf);

// Workflow events no longer shown (receiving, from before it was dropped).
export const HIDDEN_EVENTS = new Set(['received', 'referral received']);

// The current step assigns a reference no. (e.g. the DV No.) that it has not assigned yet: DMS
// assigns it when the office holding the document opens it.
export function assignPending(doc) {
  const wf = doc?.workflow;
  const step = wf?.state === 'in-progress' && !wf.referral ? wf.steps[wf.stage] : null;
  return Boolean(step?.assign?.field && !String(doc.data?.[step.assign.field] || '').trim());
}

export const ACTION_LABELS = { release: 'Route', return: 'Return', complete: 'Mark processed', back: 'Send back' };

