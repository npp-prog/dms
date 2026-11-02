import {
  addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, getDoc, getDocs, limit, orderBy, query,
  runTransaction, serverTimestamp, setDoc, startAfter, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { deleteObject, getBytes, getDownloadURL, getMetadata, ref as storageRef, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase.js';
import { isOwnerEmail } from './owner.js';
import { controlNumber, DEFAULT_REF_PATTERN, refNumber } from './naming.js';
import { CHECKLIST_LIBRARY_VERSION, DEFAULT_SETTINGS, FORMAT_KEYS, STARTER_TYPES, positionsOf } from './defaults.js';
import { checkRecord, pdfIsPublic } from './publicRecord.js';
import { applyAction, assignPending, buildWorkflow, cancelWorkflow, officeOf, chooseOffices, placement, referDocument as referPatch, refStampMissing } from './workflow.js';
import { withApprover } from './approver.js';
import { copiedData } from './forms.js';
import { localDay, withParents } from './archiveFiles.js';
import { notify } from './social.js';

// ---------- Users ----------

// Creates the profile on first sign-in. The owner's email (lib/owner.js), once
// verified by Firebase, is the superadmin; everyone else starts inactive until an
// admin approves them. The Firestore rules enforce the same.
// ---------- Users added in advance (invites/{email}) ----------
// An administrator adds a person by email with their office, role and positions; on their first
// sign-in with that email, verified (Google, or the link emailed at registration), they get them.
export const inviteKey = (email) => String(email || '').trim().toLowerCase();

export async function listInvites() {
  const snap = await getDocs(collection(db, 'invites'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.email.localeCompare(b.email));
}

export function saveInvite(inv, user) {
  const email = inviteKey(inv.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Type a valid email address.');
  const payee = inv.role === 'payee';
  return setDoc(doc(db, 'invites', email), {
    email, displayName: String(inv.displayName || '').trim(), role: inv.role || 'user',
    office: payee ? '' : inv.office || '', positions: payee ? [] : inv.positions || [],
    head: !payee && Boolean(inv.head) && Boolean(inv.office), canRefer: !payee && Boolean(inv.canRefer),
    by: user.uid, byName: user.displayName || user.email || '', at: new Date().toISOString(),
  });
}

export function deleteInvite(email) {
  return deleteDoc(doc(db, 'invites', inviteKey(email)));
}

// The invitation for this signed-in user's email, if any (their own only).
export async function myInvite(user) {
  if (!user?.email) return null;
  const s = await getDoc(doc(db, 'invites', inviteKey(user.email))).catch(() => null);
  return s?.exists() ? s.data() : null;
}

const fromInvite = (inv) => ({
  role: inv.role, office: inv.office || '', positions: inv.positions || [], head: Boolean(inv.head), canRefer: Boolean(inv.canRefer), active: true,
});

export async function ensureUserProfile(user, extra = {}) {
  const ref = doc(db, 'users', user.uid);
  const owner = isOwnerEmail(user.email) && user.emailVerified;
  const existing = await getDoc(ref);
  // Added in advance, and the email is verified: the account is set up as the administrator said.
  const invite = !owner && user.emailVerified && !(existing.exists() && existing.data().active) ? await myInvite(user) : null;
  if (existing.exists()) {
    const p = existing.data();
    if (owner && (p.role !== 'superadmin' || !p.active)) {
      await updateDoc(ref, { role: 'superadmin', active: true });
      return { id: user.uid, ...p, role: 'superadmin', active: true };
    }
    if (invite && !p.active) {
      const patch = { ...fromInvite(invite), ...(invite.displayName ? { displayName: invite.displayName } : {}) };
      await updateDoc(ref, patch);
      return { id: user.uid, ...p, ...patch };
    }
    return { id: user.uid, ...p };
  }
  if (invite) {
    const profile = {
      email: user.email, displayName: invite.displayName || extra.displayName || user.displayName || user.email,
      requestedOffice: extra.office || '', ...fromInvite(invite), createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return { id: user.uid, ...profile };
  }
  const profile = {
    email: user.email,
    displayName: extra.displayName || user.displayName || user.email,
    // The office decides which documents the user sees, so an admin assigns it; what the
    // user typed at registration is only a request.
    office: '',
    requestedOffice: extra.office || '',
    role: owner ? 'superadmin' : 'user',
    active: owner,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
}

export async function listUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// The preparer's position and ID no. (My Profile), kept on the documents they prepare and printed
// under their name.
const preparerExtras = (user) => ({
  ...(user.position ? { createdByPosition: user.position } : {}),
  ...(user.idNo ? { createdByIdNo: user.idNo } : {}),
});

// ---------- Directory (names and offices, to forward a document to someone) ----------
// directory/{uid}: { displayName, office, email, external (a supplier or payee), position, idNo, photo (My Profile) }. Each active user keeps their own entry up to
// date when they sign in; every active user can read it (to forward or refer a document to
// someone by name or email; no roles).
export const directoryEntry = (p) => ({
  displayName: p.displayName || '', office: p.office || '', email: p.email || '', external: p.role === 'payee',
  position: p.position || '', idNo: p.idNo || '', photo: p.photo || '',
});

export async function syncDirectoryEntry(uid, profile) {
  if (!profile?.active) return;
  const entry = directoryEntry(profile);
  const ref = doc(db, 'directory', uid);
  const cur = await getDoc(ref).catch(() => null);
  if (!cur?.exists() || Object.keys(entry).some((k) => cur.data()[k] !== entry[k])) await setDoc(ref, entry);
}

// Administrators: every active user in the directory (also those who have not signed in since it
// existed, or were just approved), as in their profile; inactive users out of it.
export async function syncDirectory(users) {
  const all = users || await listUsers();
  const cur = Object.fromEntries((await getDocs(collection(db, 'directory'))).docs.map((d) => [d.id, d.data()]));
  const writes = [];
  for (const u of all) {
    const uid = u.id || u.uid;
    if (u.active) {
      const entry = directoryEntry(u);
      if (!cur[uid] || Object.keys(entry).some((k) => cur[uid][k] !== entry[k])) writes.push((b) => b.set(doc(db, 'directory', uid), entry));
    } else if (cur[uid]) writes.push((b) => b.delete(doc(db, 'directory', uid)));
  }
  // In batches of 15: each entry's check reads its user's profile, and a batch may read only 20.
  for (let i = 0; i < writes.length; i += 15) {
    const batch = writeBatch(db);
    writes.slice(i, i + 15).forEach((w) => w(batch));
    await batch.commit();
  }
}

export async function listDirectory() {
  const snap = await getDocs(collection(db, 'directory'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function updateUser(uid, patch) {
  return updateDoc(doc(db, 'users', uid), patch);
}

// ---------- Messages between users ----------
// conversations/{a_b} (the two uids, sorted): { members: [a, b], names: { uid: name }, lastText,
// lastAt, lastBy, readAt: { uid: iso } }; conversations/{id}/messages/{id}: { from, text, at }.
// Only the two members read or write them (firestore.rules).

export const conversationId = (a, b) => [a, b].sort().join('_');

// Live list of the user's conversations, newest first. Returns the unsubscribe function.
export function watchConversations(uid, onChange, onError) {
  // includeMetadataChanges: also hear when a new conversation reaches the server (saved turns true)
  return onSnapshot(query(collection(db, 'conversations'), where('members', 'array-contains', uid)), { includeMetadataChanges: true },
    // saved: false while a new conversation is still on its way to the server
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data(), saved: !d.metadata.hasPendingWrites })).sort((x, y) => (y.lastAt || '').localeCompare(x.lastAt || ''))),
    onError);
}

export function watchMessages(id, onChange, onError) {
  return onSnapshot(query(collection(db, 'conversations', id, 'messages'), orderBy('at'), limit(500)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function sendMessage(me, other, text) {
  const body = String(text || '').trim().slice(0, 2000);
  if (!body) return;
  const id = conversationId(me.uid, other.uid);
  const at = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(db, 'conversations', id), {
    members: [me.uid, other.uid].sort(),
    names: { [me.uid]: me.displayName || me.email || '', [other.uid]: other.displayName || other.email || '' },
    lastText: body.slice(0, 140), lastAt: at, lastBy: me.uid,
    readAt: { [me.uid]: at },
  }, { merge: true });
  batch.set(doc(collection(db, 'conversations', id, 'messages')), { from: me.uid, text: body, at });
  await batch.commit();
}

export function markConversationRead(id, uid) {
  return updateDoc(doc(db, 'conversations', id), { [`readAt.${uid}`]: new Date().toISOString() });
}

// Has a conversation a message the user has not seen?
export const isUnread = (c, uid) => Boolean(c.lastAt && c.lastBy !== uid && (!c.readAt?.[uid] || c.readAt[uid] < c.lastAt));

// ---------- Personal notes (Dashboard) ----------
// users/{uid}/notes/{id}: { text, due ('YYYY-MM-DD' or ''), done, createdAt, doneAt }. Checked
// notes are archived (shown apart, under Archived).

export async function listNotes(uid) {
  const snap = await getDocs(collection(db, 'users', uid, 'notes'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addNote(uid, text, due = '') {
  const note = { text: String(text).trim().slice(0, 1000), due: due || '', done: false, createdAt: new Date().toISOString(), doneAt: '' };
  const ref = await addDoc(collection(db, 'users', uid, 'notes'), note);
  return { id: ref.id, ...note };
}

export function setNoteDone(uid, id, done) {
  return updateDoc(doc(db, 'users', uid, 'notes', id), { done, doneAt: done ? new Date().toISOString() : '' });
}

export function deleteNote(uid, id) {
  return deleteDoc(doc(db, 'users', uid, 'notes', id));
}

// ---------- Settings ----------

// The settings as last read or saved (the numbering of new documents uses them).
let settingsCache = null;
export async function getSettings() {
  const snap = await getDoc(doc(db, 'meta', 'settings'));
  settingsCache = snap.exists() ? snap.data() : {};
  return settingsCache;
}

// The Data Protection Officer's contact for the privacy notice (meta/privacy: public).
export async function getPrivacy() {
  const snap = await getDoc(doc(db, 'meta', 'privacy'));
  return snap.exists() ? snap.data() : {};
}
export function savePrivacy(p) {
  return setDoc(doc(db, 'meta', 'privacy'), { dpoName: '', dpoEmail: '', dpoPhone: '', ...p, updatedAt: serverTimestamp() }, { merge: true });
}

// Adds a position to the list (Settings); returns the new list.
export async function addPosition(settings, name) {
  if (/^records officer$/i.test(String(name).trim())) throw new Error('Records Officer is a role, not a position: choose it under Role in Users.');
  const positions = [...new Set([...positionsOf(settings), name])];
  await saveSettings({ positions });
  return positions;
}

export function saveSettings(settings) {
  settingsCache = { ...(settingsCache || {}), ...settings };
  return setDoc(doc(db, 'meta', 'settings'), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

// ---------- Document types ----------

export async function listDocumentTypes({ activeOnly = false } = {}) {
  const snap = await getDocs(collection(db, 'documentTypes'));
  const types = snap.docs.map((d) => withApprover({ id: d.id, ...d.data() }));
  types.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  return activeOnly ? types.filter((t) => t.active !== false) : types;
}

export async function getDocumentType(id) {
  const snap = await getDoc(doc(db, 'documentTypes', id));
  return snap.exists() ? withApprover({ id: snap.id, ...snap.data() }) : null;
}

export async function saveDocumentType(id, data, user) {
  linkOnceCache = null; // "May be linked to only one document" may have changed
  const { id: _ignored, createdAt, ...clean } = data;
  const payload = { ...clean, updatedAt: serverTimestamp(), updatedBy: user.uid };
  if (id) {
    await updateDoc(doc(db, 'documentTypes', id), { ...payload, version: (Number(data.version) || 1) + 1 });
    return id;
  }
  const ref = await addDoc(collection(db, 'documentTypes'), {
    ...payload, version: 1, createdAt: serverTimestamp(), createdBy: user.uid,
  });
  return ref.id;
}

// The route of a document type (Administration > Workflow). Not part of the format: saving it
// does not change the format's version, and starter-format updates keep it.
const cleanSteps = (route) => route.map((s) => ({
  office: s.office || '', action: String(s.action || '').trim(), sign: Boolean(s.sign),
  ...(s.assign?.field ? { assign: { field: s.assign.field, dateField: s.assign.dateField || '', pattern: String(s.assign.pattern || '').trim() } } : {}),
  ...(s.fills?.length ? { fills: [...s.fills] } : {}),
  ...(String(s.upload || '').trim() ? { upload: String(s.upload).trim() } : {}),
  // who in the office acts on it (positions); none: anyone in the office
  ...(s.positions?.length && s.office ? { positions: [...new Set(s.positions)] } : {}),
  // other offices that may handle the step instead (the preparer chooses)
  ...(s.alternates?.filter((o) => o !== (s.office || '')).length ? { alternates: [...new Set(s.alternates.filter((o) => o !== (s.office || '')))] } : {}),
}));
// The route of a type; a step may have alternate offices.
export async function saveRoute(typeId, route, user) {
  await updateDoc(doc(db, 'documentTypes', typeId), {
    route: cleanSteps(route),
    routeName: deleteField(), altRoutes: deleteField(),
    routeUpdatedAt: serverTimestamp(), routeUpdatedBy: user.displayName || user.email,
  });
}

export function deleteDocumentType(id) {
  return deleteDoc(doc(db, 'documentTypes', id));
}

export async function importDocumentTypes(types, user) {
  const batch = writeBatch(db);
  for (const t of types) {
    const { id, createdAt, updatedAt, ...clean } = t;
    batch.set(doc(collection(db, 'documentTypes')), {
      ...clean, version: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid,
    });
  }
  await batch.commit();
}

// ---------- Checklist library ----------
// One document per checklist, keyed by its checklist number (e.g. "1613").

export async function listChecklists() {
  const snap = await getDocs(collection(db, 'checklists'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.code.localeCompare(b.code));
}

export async function getChecklist(code) {
  const snap = await getDoc(doc(db, 'checklists', code));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function saveChecklist(checklist, user) {
  const { id, createdAt, ...clean } = checklist;
  // edited: changed in the editor, so library updates leave it alone.
  return setDoc(doc(db, 'checklists', clean.code), { ...clean, edited: true, updatedAt: serverTimestamp(), updatedBy: user.uid });
}

export function deleteChecklist(code) {
  return deleteDoc(doc(db, 'checklists', code));
}

// Writes many checklists (e.g. the bundled library), overwriting same-numbered ones.
export async function importChecklists(list, user) {
  for (let i = 0; i < list.length; i += 400) {
    const batch = writeBatch(db);
    for (const c of list.slice(i, i + 400)) {
      const { id, createdAt, updatedAt, ...clean } = c;
      batch.set(doc(db, 'checklists', clean.code), { ...clean, edited: false, updatedAt: serverTimestamp(), updatedBy: user.uid });
    }
    await batch.commit();
  }
}

// The checklist library from the Municipal Accounting Office, bundled with the app.
// Loaded on demand so it is not part of the main bundle.
export async function loadBundledChecklists() {
  return (await import('../data/checklists.json')).default;
}

// ---------- Setup and updates ----------

// Replaces a document type's format with the starter format DMS ships (e.g. the redrawn DV).
// Documents already prepared keep their own frozen copy.
export function applyStarterFormat(id, starter) {
  return updateDoc(doc(db, 'documentTypes', id), {
    ...Object.fromEntries(FORMAT_KEYS.map((k) => [k, starter[k] ?? null])),
    starterVersion: starter.starterVersion || 1,
    updatedAt: serverTimestamp(),
  });
}

// Runs when an admin signs in. On a new site it installs what DMS needs: the starter formats
// (DV, OBR, PR, PO, ...), the checklist library and the LGU settings. On an existing site it
// brings in what DMS has revised since: starter formats nobody has edited (version 1 = never
// saved in the editor) and library checklists nobody has edited. Returns what it did.
export async function setupSite(user) {
  const done = [];
  const types = await listDocumentTypes();
  if (!types.length) {
    await importDocumentTypes(STARTER_TYPES, user);
    done.push(`installed ${STARTER_TYPES.length} document formats (${STARTER_TYPES.map((t) => t.code).join(', ')})`);
  } else {
    const updated = [];
    for (const t of types) {
      const starter = STARTER_TYPES.find((s) => s.code === t.code);
      if (starter && (t.starterVersion || 1) < (starter.starterVersion || 1) && (Number(t.version) || 1) === 1) {
        await applyStarterFormat(t.id, starter);
        updated.push(t.code);
      }
    }
    if (updated.length) done.push(`updated the ${updated.join(', ')} format`);
  }

  // Documents routed before atPreparer existed: set it, so the office they wait in can see them.
  const moving = await getDocs(query(collection(db, 'documents'), where('workflow.state', '==', 'in-progress')));
  const older = moving.docs.filter((d) => d.data().atPreparer === undefined);
  for (const d of older) await updateDoc(d.ref, { atPreparer: placement(d.data().workflow, d.data()).atPreparer });
  // Offices still ahead on a route no longer see the document: only the offices it has reached.
  const ahead = moving.docs.filter((d) => JSON.stringify(d.data().routeOffices || []) !== JSON.stringify(placement(d.data().workflow, d.data()).routeOffices));
  for (const d of ahead) await updateDoc(d.ref, { routeOffices: placement(d.data().workflow, d.data()).routeOffices });
  if (ahead.length) done.push(`limited ${ahead.length} routed document(s) to the offices they have reached`);
  if (older.length) done.push(`updated ${older.length} routed document(s) for the new office access`);

  const settings = await getSettings();
  // Documents saved before restricting existed: not restricted (folder access finds them).
  if (!settings.restrictedField) {
    const all = await getDocs(collection(db, 'documents'));
    const missing = all.docs.filter((d) => d.data().restricted === undefined);
    for (let i = 0; i < missing.length; i += 400) {
      const batch = writeBatch(db);
      missing.slice(i, i + 400).forEach((d) => batch.update(d.ref, { restricted: false }));
      await batch.commit();
    }
    await saveSettings({ restrictedField: true });
  }
  if (settings.lguName && !settings.offices) {
    await saveSettings({ offices: DEFAULT_SETTINGS.offices });
    done.push('added the list of offices (Settings)');
  }
  if (settings.lguName && !settings.officeContacts) {
    await saveSettings({ officeContacts: DEFAULT_SETTINGS.officeContacts });
    done.push('added the Office of the Mayor\'s letterhead (Settings)');
  }
  const libraryVersion = settings.checklistLibraryVersion || 1;
  if ((await getDocs(query(collection(db, 'checklists'), limit(1)))).empty) {
    const library = await loadBundledChecklists();
    await importChecklists(library, user);
    done.push(`installed ${library.length} checklists`);
  } else if (libraryVersion < CHECKLIST_LIBRARY_VERSION) {
    const edited = new Set((await listChecklists()).filter((c) => c.edited).map((c) => c.code));
    const library = (await loadBundledChecklists()).filter((c) => !edited.has(c.code));
    await importChecklists(library, user);
    done.push(`updated ${library.length} checklists to the latest version`);
  }

  if (!settings.lguName) {
    await saveSettings({ ...DEFAULT_SETTINGS, ...settings, checklistLibraryVersion: CHECKLIST_LIBRARY_VERSION });
    done.push('installed the LGU settings and signatories');
  } else if (libraryVersion < CHECKLIST_LIBRARY_VERSION) {
    await saveSettings({ checklistLibraryVersion: CHECKLIST_LIBRARY_VERSION });
  }
  return done;
}

// ---------- Documents ----------

// Control number: one series for every document type, per year, e.g. DMS-2026-000001.
// 2026 continues the counter used before (counters/FTS: the FTS-/DMS-###### numbers), so no
// number repeats; each later year starts at 1 (counters/DMS-2027, ...).

// As set in Settings → Numbering (lib/naming.js controlNumber).
async function nextControlNo() {
  const settings = settingsCache || await getSettings().catch(() => ({}));
  const { counterId, format } = controlNumber(settings);
  const ref = doc(db, 'counters', counterId);
  const value = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? snap.data().value + 1 : 1;
    tx.set(ref, { value: next });
    return next;
  });
  return format(value);
}

// A document that already exists as a file (scanned, or made outside DMS): it gets a control
// number and follows the route of its type like a prepared one; its file is its PDF.
export async function createUploadedDocument(type, { title, fund = '', notes = '', fileName, contentText = '', copiedFrom = null }, user) {
  const controlNo = await nextControlNo();
  const ref = await addDoc(collection(db, 'documents'), {
    restricted: false,
    typeId: type.id || '',
    typeCode: type.code,
    typeName: type.name,
    typeVersion: type.version || 1,
    typeSnapshot: snapshotType(type),
    controlNo,
    data: { payee: title, fund, notes },
    checklist: {},
    additionalDocs: [],
    links: {},
    transaction: null,
    signatories: null,
    status: 'draft', // complete once its file is stored
    uploaded: { name: fileName, at: new Date().toISOString() },
    // The text read from the PDF, to find it by its contents (lib/docSearch.js).
    ...(contentText ? { contentText } : {}),
    ...(copiedFrom ? { copiedFrom } : {}),
    title,
    createdBy: user.uid,
    createdByName: user.displayName || user.email,
    ...preparerExtras(user),
    office: user.office || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    history: [historyEntry('uploaded', user, fileName)],
  });
  return { id: ref.id, controlNo };
}

// Tells the preparer what happened to their document (Notifications): never fails the action.
function tellPreparer(d, id, text, user) {
  if (!d?.createdBy || d.createdBy === user.uid) return;
  const name = `${d.controlNo || ''}${d.title ? ` (${d.title})` : ''}`.trim();
  notify(d.createdBy, { kind: 'document', text: `${name}: ${text}`, link: `/documents/${id}` }, user).catch(() => {});
}

function historyEntry(action, user, note = '') {
  return { action, note, by: user.displayName || user.email, uid: user.uid, at: new Date().toISOString() };
}

export async function createDocument(type, { data, checklist, additionalDocs = [], links = {}, transaction = null, signatories = null, status, copiedFrom = null }, user) {
  const controlNo = await nextControlNo();
  const ref = doc(collection(db, 'documents'));
  // Linked in the wizard: documents of a link-once type are claimed for this new document.
  await claimLinks({ id: ref.id, controlNo }, [], linkedDocs({ links }), user);
  await setDoc(ref, {
    restricted: false,
    typeId: type.id,
    typeCode: type.code,
    typeName: type.name,
    typeVersion: type.version || 1,
    // Frozen copy of the format so the document always prints as prepared,
    // even after admins revise the document type.
    typeSnapshot: snapshotType(type),
    controlNo,
    data,
    checklist,
    additionalDocs,
    links,
    transaction,
    // Officials as they were when the document was prepared, so reprints match.
    signatories,
    status,
    title: summarize(type, data),
    createdBy: user.uid,
    createdByName: user.displayName || user.email,
    ...preparerExtras(user),
    office: user.office || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(copiedFrom ? { copiedFrom } : {}),
    history: [historyEntry('created', user, copiedFrom ? `draft, copied from ${copiedFrom.controlNo}` : status)],
  });
  return ref.id;
}

// Copy as new draft: a new document of the same type (as it is now) with the details the preparer
// encoded on src, in the user's office, to edit and complete like any draft.
export async function copyDocument(src, user, signatories) {
  const type = src.typeId ? await getDocumentType(src.typeId) : null;
  if (!type || type.active === false || type.uploadOnly) throw new Error(`${src.typeName || 'This document type'} is no longer prepared in DMS, so this document cannot be copied.`);
  return createDocument(type, {
    data: copiedData(type, src), checklist: {}, additionalDocs: [], links: {}, transaction: src.transaction || null,
    signatories, status: 'draft', copiedFrom: { id: src.id, controlNo: src.controlNo || '' },
  }, user);
}

export async function updateDocument(id, type, { data, checklist, additionalDocs = [], links = {}, transaction = null, status }, user, history = []) {
  await withLinkClaims(id, { links }, user, (st) => updateDoc(doc(db, 'documents', id), {
    data,
    checklist,
    additionalDocs,
    links: st.links,
    transaction,
    status,
    title: summarize(type, data),
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('updated', user, status)],
  }));
}

// ---- Linking a document to one document only (document type: linkOnce) ----
// linkClaims/{linked doc id}: { parent, parentControlNo }: where a document of such a type is
// linked. A second link (to another document, or again to the same one) is refused; removing the
// link frees it. Documents of other types may be linked any number of times.
let linkOnceCache = null;
async function linkOnceCodes() {
  if (!linkOnceCache || Date.now() - linkOnceCache.at > 5 * 60e3) {
    const types = await listDocumentTypes().catch(() => []);
    linkOnceCache = { at: Date.now(), codes: new Set(types.filter((t) => t.linkOnce).map((t) => t.code)) };
  }
  return linkOnceCache.codes;
}
// Every DMS document linked from a document: checklist items and attachments (links), and
// supplemental documents. [{ id, controlNo, typeCode }], one entry per link.
export const linkedDocs = ({ links = {}, supplements = [] } = {}) => [
  ...Object.values(links || {}).flat(),
  ...(supplements || []),
].filter((l) => l?.kind === 'fts' && l.id);

// Before saving the document's links: claims each newly linked document of a link-once type
// (throws if it is linked elsewhere, or twice here).
async function claimLinks(parent, before, after, user) {
  const once = await linkOnceCodes();
  if (!once.size) return;
  const count = new Map();
  for (const l of after.filter((x) => once.has(x.typeCode))) {
    count.set(l.id, (count.get(l.id) || 0) + 1);
    if (count.get(l.id) > 1) throw new Error(`${l.controlNo} (${l.typeCode}) may be linked to one document only, once.`);
  }
  const had = new Set(before.map((l) => l.id));
  for (const l of after.filter((x) => once.has(x.typeCode) && !had.has(x.id))) {
    const ref = doc(db, 'linkClaims', l.id);
    await runTransaction(db, async (tx) => {
      const c = (await tx.get(ref)).data();
      if (c && c.parent !== parent.id) throw new Error(`${l.controlNo} (${l.typeCode}) is already linked to ${c.parentControlNo || 'another document'}: a ${l.typeCode} may be linked to one document only.`);
      tx.set(ref, { parent: parent.id, parentControlNo: parent.controlNo || '', by: user.displayName || user.email || '', at: new Date().toISOString() });
    });
  }
}
// After saving: frees the documents no longer linked from it.
async function releaseLinks(parentId, before, after) {
  const still = new Set(after.map((l) => l.id));
  for (const id of new Set(before.map((l) => l.id).filter((x) => !still.has(x)))) {
    const ref = doc(db, 'linkClaims', id);
    const c = await getDoc(ref).then((s) => s.data()).catch(() => null);
    if (c?.parent === parentId) await deleteDoc(ref).catch(() => {});
  }
}
// Each link added now gets atEvent (how many route events the document has): once it is routed
// on after that, the link is kept (lib/workflow.js linkLocked). Links already there keep theirs.
const linkKey = (l) => `${l?.kind}:${l?.path || l?.id || l?.url || l?.ref || ''}`;
function stampNew(before = [], after = [], at = 0) {
  const left = new Map();
  for (const l of before || []) left.set(linkKey(l), (left.get(linkKey(l)) || 0) + 1);
  return (after || []).map((l) => {
    const n = left.get(linkKey(l)) || 0;
    if (n > 0) { left.set(linkKey(l), n - 1); return l; }
    return l.atEvent !== undefined ? l : { ...l, atEvent: at };
  });
}
// The document's links change (to links and/or supplements): links added now are stamped, and
// documents of a link-once type claimed before, freed after. write(stamped) saves.
async function withLinkClaims(id, next, user, write) {
  const cur = (await getDoc(doc(db, 'documents', id))).data() || {};
  const at = (cur.workflow?.events || []).length;
  const stamped = {};
  if (next.links) stamped.links = Object.fromEntries(Object.entries(next.links).map(([k, list]) => [k, stampNew(cur.links?.[k], list, at)]));
  if (next.supplements) stamped.supplements = stampNew(cur.supplements, next.supplements, at);
  const before = linkedDocs(cur);
  const after = linkedDocs({ links: stamped.links ?? cur.links, supplements: stamped.supplements ?? cur.supplements });
  await claimLinks({ id, controlNo: cur.controlNo }, before, after, user);
  await write(stamped);
  await releaseLinks(id, before, after);
}

// Links to supporting documents, added or removed on a saved document (also after it is
// complete). A newly linked item is ticked Y.
export async function saveDocumentLinks(id, { links, checklist }, user, history = [], note = '') {
  await withLinkClaims(id, { links }, user, (st) => updateDoc(doc(db, 'documents', id), {
    links: st.links,
    checklist,
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('linked', user, note)],
  }));
}

// Attachments that are not on the checklist (extraItems: [{ id, label }], their links in links[id]),
// added without changing the checklist.
export async function saveExtraItems(id, { extraItems, links }, user, history = [], note = '') {
  await withLinkClaims(id, { links }, user, (st) => updateDoc(doc(db, 'documents', id), {
    extraItems,
    links: st.links,
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('attachments', user, note)],
  }));
}

// A supporting document uploaded to a checklist item (a scanned PDF or a photo), kept at
// documents/{docId}/attachments/{itemId}/{time}-{name}. Returns the link stored on the item.
export const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/zip'];
// dmsDoc: the supporting document the file is (lib/supporting.js), so its QR page can open it.
export async function uploadAttachment(docId, itemId, file, user, onProgress, dmsDoc = '') {
  if (!ATTACHMENT_TYPES.includes(file.type)) throw new Error('Upload a PDF, a picture (JPG or PNG) or a ZIP file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('The file is larger than 20 MB. Scan it at a lower resolution.');
  const name = file.name.replace(/[^\w.\- ()]+/g, '_').slice(-80) || 'file';
  const path = `documents/${docId}/attachments/${itemId}/${Date.now()}-${name}`;
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type, ...(dmsDoc ? { customMetadata: { dmsDoc } } : {}) });
    task.on('state_changed', (s) => onProgress?.(s.bytesTransferred / (s.totalBytes || 1)), (e) => reject(storageError(e, 'upload', 'uploading the file')), resolve);
  });
  return { kind: 'file', path, name: file.name, type: file.type, size: file.size, by: user.displayName || user.email, at: new Date().toISOString() };
}

// A file uploaded to a checklist item is also a DMS document of its own (All Documents, with a
// control no. and the QR code), supporting the document it was uploaded to. Its file stays with
// that document (documents/{parent}/attachments/...), so everyone who sees the checklist opens it.
// Step 1: the record (draft until its file is stored).
export async function createSupportingDocument(parent, item, { typeCode = '', fileName }, user) {
  const controlNo = await nextControlNo();
  const typeName = String(item.label || 'Supporting document').slice(0, 120);
  const ref = await addDoc(collection(db, 'documents'), {
    restricted: false,
    typeId: '', typeCode: typeCode || 'DOC', typeName, typeVersion: 1,
    // a supporting document of a document whose PDF is not public (Payroll) is not public either
    typeSnapshot: { code: typeCode || 'DOC', name: typeName, fields: [], steps: [], processing: [], template: '', ...(pdfIsPublic(parent) ? {} : { publicPdf: false }) },
    controlNo,
    data: { payee: parent.title || '', fund: parent.data?.fund || '', notes: `Supporting document of ${parent.controlNo}` },
    checklist: {}, additionalDocs: [], links: {}, transaction: null, signatories: null,
    status: 'draft', uploaded: { name: fileName, at: new Date().toISOString() },
    supports: { id: parent.id, controlNo: parent.controlNo, typeCode: parent.typeCode, item: typeName },
    title: parent.title || typeName,
    createdBy: user.uid, createdByName: user.displayName || user.email, ...preparerExtras(user), office: user.office || '',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    history: [historyEntry('uploaded', user, `${fileName} · supporting ${parent.controlNo}`)],
  });
  return { id: ref.id, controlNo };
}

// Step 2: its file (already stored with the parent), its verification and public records.
export async function finishSupportingDocument(id, link, bytes, user) {
  const ref = doc(db, 'documents', id);
  const file = { path: link.path, size: bytes.length, sha256: await sha256(bytes), kind: 'uploaded', method: 'dms', reason: '', stage: null, at: link.at, by: link.by, uid: user.uid, signer: null };
  const verifyRef = doc(db, 'verifications', file.sha256);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    const known = (await tx.get(verifyRef)).exists();
    if (!known) tx.set(verifyRef, { docId: id, controlNo: d.controlNo, typeCode: d.typeCode, typeName: d.typeName, version: 1, kind: 'uploaded', signer: '', signatures: 0, by: file.by, at: file.at });
    const next = { ...d, pdf: { basis: null, basisV: null, files: [file] }, status: 'complete' };
    // Its file under the DMS name (Fund_Payee_No._Type_Control No.); the name it came with is kept.
    const uploaded = { ...(d.uploaded || {}), name: link.name, original: d.uploaded?.name || '' };
    tx.update(ref, { pdf: next.pdf, uploaded, status: 'complete', updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry('complete', user, `${link.name} (uploaded as ${uploaded.original})`)] });
    tx.set(doc(db, 'checks', id), checkRecord(next));
  });
}

// Supplemental documents of a document (not on its checklist): the list on the document, each a
// supporting DMS document of its own (lib/supporting.js). Removing one keeps that document.
export async function saveSupplements(id, supplements, user, note) {
  const ref = doc(db, 'documents', id);
  await withLinkClaims(id, { supplements }, user, (st) => runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    tx.update(ref, { supplements: st.supplements, updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry('supplemental', user, note)] });
  }));
}

export async function getFileBytes(path) {
  try {
    return new Uint8Array(await getBytes(storageRef(storage, path)));
  } catch (e) {
    throw storageError(e, 'download', 'opening the file');
  }
}

// The Accounting Office's entries on a saved document (DV No., date, deductions).
export async function saveAccountingEntries(id, data, user, history = []) {
  await updateDoc(doc(db, 'documents', id), {
    data,
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry('accounting', user, 'DV No., date or deductions')],
  });
}

// ---------- Workflow ----------

// The public record of a document (checks/{id}: what the QR code on its PDF opens), kept up to
// date with every PDF version and workflow step, in the same transaction. Only once it is in PDF.
function publishCheck(tx, id, d) {
  if ((d.pdf?.files || []).length) tx.set(doc(db, 'checks', id), checkRecord(d));
}

// A document converted before public records existed gets one when someone handling it opens it
// (and one from before the record named its PDF is brought up to date).
export async function ensureCheck(id, d) {
  if (!(d.pdf?.files || []).length) return;
  const rec = await getCheck(id);
  if (rec && rec.pdf === checkRecord(d).pdf) return;
  await setDoc(doc(db, 'checks', id), checkRecord(d));
}

// The public record, for the QR page (anyone, signed in or not).
export async function getCheck(id) {
  const snap = await getDoc(doc(db, 'checks', id));
  return snap.exists() ? snap.data() : null;
}

// Starts the route of a document (when it is marked complete): it sits with the preparer's office,
// which releases it to the next office.
// Starts the route set for the document's type now (Administration > Workflow), not the one
// frozen in the document's copy of its format.
export async function startWorkflow(id, type, user, offices) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d || d.workflow) return;
    const live = d.typeId ? (await tx.get(doc(db, 'documentTypes', d.typeId))).data() : null;
    const start = buildWorkflow(live || type, d, offices, user);
    if (!start) return;
    tx.update(ref, { ...start, updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry('routing started', user)] });
    publishCheck(tx, id, { ...d, ...start });
  });
}

// The preparer chooses the office of each step with alternates ({ stage: office }) before the
// document is first released (e.g. the Vice Mayor instead of the Mayor).
export async function chooseStepOffices(id, picks, user) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    const { changed, ...patch } = chooseOffices(d, picks, user);
    tx.update(ref, { ...patch, updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry('offices chosen', user, patch.workflow.events.at(-1).remarks)] });
    publishCheck(tx, id, { ...d, ...patch });
  });
}

// The office holding the document refers it to a person outside the route (users allowed to:
// admins, and users with "May route documents to any person"). They send it back.
export async function referDocument(id, to, note, user) {
  const ref = doc(db, 'documents', id);
  let d;
  await runTransaction(db, async (tx) => {
    d = (await tx.get(ref)).data();
    // referred: everyone it was referred to, who may still read it after sending it back.
    const patch = { ...referPatch(d, to, note, user), referred: [...new Set([...(d.referred || []), to.uid])] };
    tx.update(ref, { ...patch, updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry('referred', user, patch.workflow.events.at(-1).remarks)] });
    publishCheck(tx, id, { ...d, ...patch });
  });
  tellPreparer(d, id, `referred by ${user.displayName || user.email} to ${to.displayName || to.email}${note ? ` — ${note}` : ''}.`, user);
}

// Release, return or complete the current step. Runs as a transaction: the step must
// still be the one the user saw (another office may have acted meanwhile).
export async function workflowAction(id, action, user, { stage, remarks = '' } = {}) {
  const ref = doc(db, 'documents', id);
  let d;
  let patch;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    d = snap.data();
    if (!d?.workflow) throw new Error('This document has no workflow.');
    if (stage !== undefined && d.workflow.stage !== stage) throw new Error('Someone else acted on this document first. The page has been refreshed.');
    patch = applyAction(d, action, user, remarks);
    // Released to a third party (a step of the route): they keep reading it afterwards.
    if (patch.currentOffice?.startsWith('person:') && !patch.workflow.referral) {
      patch.referred = [...new Set([...(d.referred || []), patch.currentOffice.slice(7)])];
    }
    const label = d.workflow.referral ? { back: 'sent back' }[action]
      : { release: 'routed', return: 'returned', complete: 'processed' }[action];
    const history = [...(d.history || []), historyEntry(label, user, remarks)];
    tx.update(ref, { ...patch, updatedAt: serverTimestamp(), history });
    publishCheck(tx, id, { ...d, ...patch });
  });
  const who = `${user.displayName || user.email}${user.office ? ` (${user.office})` : ''}`;
  const at = (wf) => officeOf(wf.steps[wf.stage], d) || 'your office';
  const why = remarks ? ` — ${remarks}` : '';
  const text = {
    release: () => `routed by ${who} to ${at(patch.workflow)}${why}.`,
    return: () => `returned by ${who} to ${at(patch.workflow)}${why}.`,
    complete: () => `processed by ${who}: its route is complete${why}.`,
    back: () => `sent back by ${who} to ${at(patch.workflow)}${why}.`,
  }[action];
  if (text) tellPreparer(d, id, text(), user);
}

// The office holding the document opens it at a step that assigns a reference no. (e.g.
// Accounting, the DV No.): the next number of its series and today's date, unless the field
// already has one.
export async function assignRefNo(id, user) {
  const ref = doc(db, 'documents', id);
  let assigned = null;
  try {
    await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (!d || !assignPending(d)) return;
    const patch = {};
    const history = [...(d.history || [])];
    const step = d.workflow.steps[d.workflow.stage];
    const assign = step.assign;
    const field = (d.typeSnapshot?.fields || []).find((f) => f.key === assign.field);
    const now = new Date();
    const series = refNumber(assign.pattern || DEFAULT_REF_PATTERN, { fund: d.data?.fund, date: now });
    const counterRef = doc(db, 'counters', `${d.typeCode}_${series.counterId}`.slice(0, 140));
    const counter = await tx.get(counterRef);
    const value = (counter.exists() ? counter.data().value : 0) + 1;
    const number = series.format(value);
    const iso = now.toISOString();
    const data = { ...(d.data || {}), [assign.field]: number, ...(assign.dateField ? { [assign.dateField]: localDay(now) } : {}) };
    const who = { stage: d.workflow.stage, office: step.routedTo || d.office || '', by: user.displayName || user.email, at: iso };
    // Every data field set here is listed in refNos (the security rules allow only those).
    const refNos = {
      ...(d.refNos || {}),
      [assign.field]: { value: number, label: field?.label || assign.field, ...who },
      ...(assign.dateField ? { [assign.dateField]: { value: localDay(now), label: 'Date', of: assign.field, ...who } } : {}),
    };
    tx.set(counterRef, { value });
    patch.data = data;
    patch.refNos = refNos;
    patch.workflow = { ...d.workflow, events: [...d.workflow.events, { type: 'assigned', stage: d.workflow.stage, office: step.routedTo || d.office || '', by: user.displayName || user.email, uid: user.uid, at: iso, remarks: `${field?.label || assign.field} ${number}` }] };
    history.push(historyEntry('assigned', user, `${field?.label || assign.field} ${number}`));
    assigned = { d, text: `${field?.label || assign.field} ${number} assigned by ${user.displayName || user.email} (${step.routedTo || d.office || ''}).` };
    tx.update(ref, { ...patch, updatedAt: serverTimestamp(), history });
    publishCheck(tx, id, { ...d, ...patch });
    });
  } catch (e) {
    // Someone else (or another tab) assigned it at the same moment: their save went through and
    // ours was refused (it would have reused the number). Nothing left to do.
    const now = await getDoc(ref).catch(() => null);
    if (e?.code === 'permission-denied' && now?.exists() && !assignPending(now.data())) return;
    throw e;
  }
  if (assigned) tellPreparer(assigned.d, id, assigned.text, user);
}

// ---------- PDF and digital signatures ----------
// document.pdf = { basis, files: [{ path, size, sha256, kind: 'generated' | 'signed',
//   method: 'dms' | 'upload', at, by, uid, reason, signer: { name, email, issuer, pnpki, serial, signedAt } }] }
// The newest file is the current PDF. Files in Storage are never replaced (storage.rules).

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => toHex(await crypto.subtle.digest('SHA-256', bytes));

// What the PDF was made from: if this changes, the PDF no longer shows the document as it is.
// Keys sorted: Firestore may return a map's fields in another order than they were written.
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    : JSON.stringify(v ?? null));
// Left out: empty fields, and reference numbers assigned along the workflow (they are recorded in
// refNos and shown on the assigning office's signature), so assigning one is not a change.
export const BASIS_VERSION = 3;
export async function documentBasis(d) {
  const data = Object.fromEntries(Object.entries(d.data || {})
    .filter(([k, v]) => !(d.refNos || {})[k] && v !== '' && v != null && !(Array.isArray(v) && !v.length)));
  const text = stable([data, d.checklist || {}, d.additionalDocs || [], d.transaction?.code || '', d.signatories || {}]);
  return (await sha256(new TextEncoder().encode(text))).slice(0, 16);
}

// What DMS recorded about a PDF, by the SHA-256 of the file (anyone may look one up).
export async function lookupVerification(hash) {
  const snap = await getDoc(doc(db, 'verifications', hash));
  return snap.exists() ? snap.data() : null;
}

export const sha256Hex = sha256;

// Storage errors in words an admin can act on.
const SETUP = 'See the README, Setup steps 5 to 7.';
function storageError(e, doing, what = doing === 'download' ? 'opening the file' : 'saving the file') {
  const code = e?.code || '';
  if (code === 'storage/unauthorized') {
    return new Error(`Firebase Storage refused ${what}. An admin must publish the latest storage.rules (Firebase console → Storage → Rules). ${SETUP}`);
  }
  if (['storage/retry-limit-exceeded', 'storage/unknown', 'storage/bucket-not-found', 'storage/project-not-found'].includes(code)) {
    return new Error(doing === 'download'
      ? `Could not download from Firebase Storage (${what}). If this keeps happening, an admin must allow downloads (CORS) for the storage bucket. ${SETUP}`
      : `Firebase Storage is not set up for this site yet, so DMS cannot save files. An admin must open the Firebase console → Storage → Get started (it needs the Blaze plan), then publish storage.rules. ${SETUP}`);
  }
  return e;
}

// ---------- The signatory's saved certificate ----------
// certificates/{uid}/signing.p12: the PNPKI .p12/.pfx file a user chose to keep in DMS, so they
// sign with their password only. Only that user can read, replace or remove it (storage.rules);
// the password is never stored. Who it belongs to is kept in the file's metadata.
const certRef = (uid) => storageRef(storage, `certificates/${uid}/signing.p12`);

export async function getSavedCertificate(uid) {
  try {
    const meta = await getMetadata(certRef(uid));
    const m = meta.customMetadata || {};
    return { name: m.name || '', email: m.email || '', issuer: m.issuer || '', pnpki: m.pnpki === 'true', notAfter: m.notAfter || '', serial: m.serial || '', savedAt: meta.timeCreated };
  } catch (e) {
    if (e?.code === 'storage/object-not-found') return null;
    throw storageError(e, 'download', 'checking your registered certificate');
  }
}

export async function getSavedCertificateBytes(uid) {
  try {
    return new Uint8Array(await getBytes(certRef(uid)));
  } catch (e) {
    throw storageError(e, 'download', 'reading your registered certificate');
  }
}

export async function saveCertificate(uid, bytes, info) {
  try {
    await uploadBytes(certRef(uid), bytes, {
      contentType: 'application/x-pkcs12',
      customMetadata: { name: info.name || '', email: info.email || '', issuer: info.issuer || '', pnpki: String(Boolean(info.pnpki)), notAfter: info.notAfter || '', serial: info.serial || '' },
    });
  } catch (e) {
    throw storageError(e, 'upload', 'saving your certificate');
  }
}

export async function removeSavedCertificate(uid) {
  try {
    await deleteObject(certRef(uid));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw storageError(e, 'upload', 'removing your certificate');
  }
}

// The signatory's signature mark (an image of their handwritten signature), owner only too.
const markRef = (uid) => storageRef(storage, `certificates/${uid}/mark.png`);

// The user's profile picture: avatars/{uid}/photo.jpg (a square JPEG made on the device). Its
// download address is kept in their profile and the directory, so everyone sees it.
export async function savePhoto(uid, jpegBlob) {
  try {
    const r = storageRef(storage, `avatars/${uid}/photo.jpg`);
    await uploadBytes(r, jpegBlob, { contentType: 'image/jpeg' });
    return await getDownloadURL(r);
  } catch (e) {
    throw storageError(e, 'upload', 'saving your profile picture');
  }
}

export async function removePhoto(uid) {
  try {
    await deleteObject(storageRef(storage, `avatars/${uid}/photo.jpg`));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw storageError(e, 'upload', 'removing your profile picture');
  }
}

export async function getSavedMark(uid) {
  try {
    return new Uint8Array(await getBytes(markRef(uid)));
  } catch (e) {
    if (e?.code === 'storage/object-not-found') return null;
    throw storageError(e, 'download', 'reading your signature mark');
  }
}

export async function saveMark(uid, pngBytes) {
  try {
    await uploadBytes(markRef(uid), pngBytes, { contentType: 'image/png' });
  } catch (e) {
    throw storageError(e, 'upload', 'saving your signature mark');
  }
}

export async function removeSavedMark(uid) {
  try {
    await deleteObject(markRef(uid));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw storageError(e, 'upload', 'removing your signature mark');
  }
}

// Checks, in a few seconds, that PDFs can be stored, before spending time drawing one.
// Reading a file that does not exist answers "not found" when Storage and its rules are in place.
export async function checkStorage(docId) {
  try {
    await getMetadata(storageRef(storage, `documents/${docId}/0-generated.pdf`));
  } catch (e) {
    if (e?.code === 'storage/object-not-found') return;
    throw storageError(e, 'upload', 'checking that PDFs can be saved');
  }
}

export async function getPdfBytes(path) {
  try {
    return new Uint8Array(await getBytes(storageRef(storage, path)));
  } catch (e) {
    throw storageError(e, 'download', 'opening the PDF');
  }
}

// Stores a new version of the document's PDF (converted, or signed) and records it.
export async function addPdfVersion(id, bytes, user, { kind, method = 'dms', signer = null, reason = '', note = '', refStage = null, restores = null, basis = null, onProgress }) {
  const docRef = doc(db, 'documents', id);
  const current = (await getDoc(docRef)).data();
  const n = current?.pdf?.files?.length || 0;
  // Files are never overwritten (storage.rules). A file can already be in this version's place if
  // an earlier attempt was stored but not recorded (e.g. the record was refused): use the next
  // free name, so that attempt cannot block signing for good.
  let slot = n;
  for (; slot < n + 20; slot++) {
    try {
      await getMetadata(storageRef(storage, `documents/${id}/${slot}-${kind}.pdf`));
    } catch (e) {
      if (e?.code === 'storage/object-not-found') break;
      throw storageError(e, 'download', 'checking where to save the PDF');
    }
  }
  const path = `documents/${id}/${slot}-${kind}.pdf`;
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), bytes, { contentType: 'application/pdf' });
    task.on('state_changed', (s) => onProgress?.(s.bytesTransferred / (s.totalBytes || 1)), (e) => reject(storageError(e, 'upload', 'saving the PDF')), resolve);
  });
  const wf = current?.workflow;
  const file = {
    path, size: bytes.length, sha256: await sha256(bytes), kind, method, reason,
    ...(note ? { note } : {}), // text the signatory added on the PDF with this signature
    ...(refStage != null ? { refStage } : {}), // the step whose reference no. it put on the PDF
    ...(restores != null ? { restores } : {}), // a copy of this earlier version (lib/workflow.js liveFiles)
    stage: wf?.state === 'in-progress' ? wf.stage : null, // the workflow step it was signed at
    // signed by a person the document was referred to: not the step's own signature
    ...(wf?.state === 'in-progress' && wf.referral ? { referral: true } : {}),
    at: new Date().toISOString(), by: user.displayName || user.email, uid: user.uid, signer,
  };
  const verifyRef = doc(db, 'verifications', file.sha256);
  let d;
  await runTransaction(db, async (tx) => {
    d = (await tx.get(docRef)).data();
    const known = (await tx.get(verifyRef)).exists();
    const files = d.pdf?.files || [];
    if (files.length !== n) throw new Error('Someone else added a version of this PDF first. Reload the page and try again.');
    // Public record of this exact file, for anyone verifying a copy (the Verify page).
    if (!known) tx.set(verifyRef, {
      docId: id, controlNo: d.controlNo, typeCode: d.typeCode, typeName: d.typeName, version: n + 1, kind,
      signer: signer?.name || '', signatures: files.filter((f) => f.kind === 'signed' || f.kind === 'esigned').length + (kind === 'signed' || kind === 'esigned' ? 1 : 0),
      by: file.by, at: file.at,
    });
    const note = kind === 'signed' ? `${signer?.name || ''}${method === 'upload' ? ' — uploaded' : ''}` : kind === 'esigned' ? `${signer?.name || ''} — e-signature` : '';
    const pdf = { basis: basis ?? d.pdf?.basis ?? null, basisV: basis ? BASIS_VERSION : d.pdf?.basisV ?? null, files: [...files, file] };
    publishCheck(tx, id, { ...d, pdf });
    tx.update(docRef, {
      // basisV: how the basis was computed (bases computed another way are not compared).
      pdf,
      updatedAt: serverTimestamp(),
      history: [...(d.history || []), historyEntry(kind === 'signed' || kind === 'esigned' ? 'signed' : kind === 'stamped' ? (reason === 'QR code' ? 'QR code put on the PDF' : 'reference no. put on the PDF') : kind === 'restored' ? `PDF back to version ${restores + 1}` : 'converted to PDF', user, kind === 'restored' ? reason : note)],
    });
  });
  if (kind === 'signed' || kind === 'esigned') tellPreparer(d, id, `${kind === 'esigned' ? 'e-signed' : 'signed'} by ${signer?.name || user.displayName || user.email}${reason ? ` — ${reason}` : ''}.`, user);
  return file;
}

// The reference no. assigned on receiving (e.g. the DV No.) is a suggestion: the office may change
// the number and its date until it is on the PDF.
export async function editRefNo(id, user, { stage, value, date }) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    if (d.workflow?.stage !== stage) throw new Error('Someone else acted on this document first. Reload the page.');
    const pending = refStampMissing(d);
    if (!pending) throw new Error('It is already on the PDF and can no longer be changed.');
    const number = String(value || '').trim();
    if (!number) throw new Error(`Type the ${pending.label.replace(/\.$/, '')}.`);
    const { assign } = d.workflow.steps[stage];
    const at = new Date().toISOString();
    const data = { ...(d.data || {}), [assign.field]: number };
    const refNos = { ...(d.refNos || {}), [assign.field]: { ...d.refNos[assign.field], value: number, by: user.displayName || user.email, at } };
    if (assign.dateField && date) {
      data[assign.dateField] = date;
      refNos[assign.dateField] = { ...d.refNos[assign.dateField], value: date, at };
    }
    const patch = { data, refNos };
    const changes = [number !== pending.value && `${pending.label} ${pending.value} → ${number}`, assign.dateField && date && date !== pending.date && `date ${pending.date || '—'} → ${date}`].filter(Boolean);
    if (!changes.length) return;
    tx.update(ref, { ...patch, updatedAt: serverTimestamp(), history: [...(d.history || []), historyEntry('changed', user, changes.join('; '))] });
    publishCheck(tx, id, { ...d, ...patch });
  });
}

// The details the current step's office fills in (e.g. Check/ADA No., date, bank), recorded like
// assigned numbers (refNos: who, when, which office) so they are not a change to the signed PDF.
export async function fillStepFields(id, values, user, stage) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    if (d.workflow?.stage !== stage) throw new Error('Someone else acted on this document first. Reload the page.');
    const step = d.workflow.steps[stage];
    const keys = (step.fills || []).filter((k) => k in values);
    const fields = d.typeSnapshot?.fields || [];
    const at = new Date().toISOString();
    const who = { stage, office: step.routedTo || d.office || '', by: user.displayName || user.email, at };
    const clean = Object.fromEntries(keys.map((k) => [k, String(values[k] ?? '').trim()]));
    const label = (k) => fields.find((f) => f.key === k)?.label || k;
    tx.update(ref, {
      data: { ...(d.data || {}), ...clean },
      refNos: { ...(d.refNos || {}), ...Object.fromEntries(keys.map((k) => [k, { value: clean[k], label: label(k), filled: true, ...who }])) },
      updatedAt: serverTimestamp(),
      history: [...(d.history || []), historyEntry('filled in', user, keys.map((k) => `${label(k)}: ${clean[k]}`).join('; '))],
    });
  });
}

// A file the current step uploads (e.g. the DV signed by the payee in Box E, scanned).
export async function addStepFile(id, stage, link, user) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    if (d.workflow?.stage !== stage) throw new Error('Someone else acted on this document first. Reload the page.');
    const label = d.workflow.steps[stage].upload || 'File';
    tx.update(ref, {
      stepFiles: [...(d.stepFiles || []), { ...link, stage, label }],
      updatedAt: serverTimestamp(),
      history: [...(d.history || []), historyEntry('uploaded', user, `${label}: ${link.name}`)],
    });
  });
}

// Forwards a document to a DMS user (e.g. the payment details to the payee's office): they can
// open it and its PDF, and find it in their Inbox under "Forwarded to you".
// kind 'review': a draft sent for initial review, before it is converted to PDF (optional).
export async function forwardDocument(id, to, note, user, kind = '') {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    const at = new Date().toISOString();
    tx.update(ref, {
      sharedWith: [...new Set([...(d.sharedWith || []), to.uid])],
      forwards: [...(d.forwards || []), { to: to.uid, toName: to.displayName, toOffice: to.office || '', note: String(note || '').trim(), by: user.displayName || user.email, uid: user.uid, at, ...(kind ? { kind } : {}) }],
      updatedAt: serverTimestamp(),
      history: [...(d.history || []), historyEntry(kind === 'review' ? 'sent for review' : 'forwarded', user, `to ${to.displayName}${note ? ` — ${String(note).trim()}` : ''}`)],
    });
  });
}

// ---- Access given by the office head: viewer (opens it) or editor (does what its preparer does) ----
// To one document of the office: people of the office besides its preparer. role: 'viewer',
// 'editor', or '' (no access).
export async function setDocumentAccess(id, person, role, user) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    const access = (d.access || []).filter((u) => u !== person.uid);
    const editors = (d.editors || []).filter((u) => u !== person.uid);
    const was = (d.editors || []).includes(person.uid) ? 'editor' : (d.access || []).includes(person.uid) ? 'viewer' : '';
    if (was === role) return;
    const name = person.displayName || person.email;
    tx.update(ref, {
      access: role ? [...access, person.uid] : access,
      editors: role === 'editor' ? [...editors, person.uid] : editors,
      history: [...(d.history || []), historyEntry(role ? 'access given' : 'access removed', user, role ? `${name}, ${role}` : name)],
    });
  });
}

// Restricts a document: no one gets at it through folder access (the preparer, the office head,
// administrators, the Records Officer and the people given it one by one still do).
export async function setDocumentRestricted(id, restricted, user) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    if (Boolean(d.restricted) === restricted) return;
    tx.update(ref, { restricted, history: [...(d.history || []), historyEntry(restricted ? 'restricted' : 'restriction lifted', user, '')] });
  });
}

// The office's restricted folders (document types): folderRules/{office}.
export async function getFolderRules(office) {
  const s = await getDoc(doc(db, 'folderRules', office));
  return { restricted: [], ...(s.exists() ? s.data() : {}) };
}

export async function setRestrictedFolders(office, restricted, user) {
  const list = [...new Set(restricted)].sort();
  await setDoc(doc(db, 'folderRules', office), {
    restricted: list, by: user.uid, byName: user.displayName || user.email || '', at: new Date().toISOString(),
  });
  // The copies of the office's folder access in the profiles (what Storage checks) follow.
  const grants = await listFolderAccess(office);
  // 15 at a time: each copy's check reads its person's folderAccess, and a batch may read 20.
  for (let i = 0; i < grants.length; i += 15) {
    const batch = writeBatch(db);
    grants.slice(i, i + 15).forEach((g) => batch.update(doc(db, 'users', g.uid), { folderGrant: grantCopy(g, list) }));
    await batch.commit();
  }
}

// folderGrant in the profile: a copy of folderAccess/{uid}, with the folders the office restricted
// (blocked), so that Storage rules (which may look up only two documents) can check folder access.
const grantCopy = (g, blocked = []) => ({
  office: g.office, all: Boolean(g.all), types: g.types || [], edit: Boolean(g.edit), blocked: g.office === EVERY_OFFICE ? [] : blocked,
});
const sameCopy = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

// Records Officer was a position under the office; it is a role now. The superadmin or an Admin,
// on signing in: a User who held the position becomes a Records Officer, and the position is
// dropped from everyone (and from the list in Settings).
export async function recordsPositionToRole(users, settings) {
  // Once (Settings remembers it), and only for active users.
  const s0 = settings || await getSettings().catch(() => null);
  if (!s0 || s0.recordsRoleMigrated) return;
  const all = users || await listUsers();
  for (const u of all.filter((x) => x.active && (x.positions || []).includes('Records Officer'))) {
    const patch = { positions: u.positions.filter((p) => p !== 'Records Officer') };
    if (u.role === 'user') patch.role = 'records';
    await updateDoc(doc(db, 'users', u.id || u.uid), patch).catch(() => {});
  }
  await saveSettings({ recordsRoleMigrated: true, ...(s0.positions?.includes('Records Officer') ? { positions: s0.positions.filter((p) => p !== 'Records Officer') } : {}) }).catch(() => {});
}

// Administrators: bring every profile's copy up to date (access given before the copy existed, or
// changed since).
export async function syncFolderGrants(users) {
  const all = users || await listUsers();
  const grants = Object.fromEntries((await getDocs(collection(db, 'folderAccess'))).docs.map((d) => [d.id, d.data()]));
  const rules = {};
  for (const o of new Set(Object.values(grants).map((g) => g.office).filter((o) => o && o !== EVERY_OFFICE))) rules[o] = (await getFolderRules(o).catch(() => ({ restricted: [] }))).restricted;
  const writes = [];
  for (const u of all) {
    const uid = u.id || u.uid;
    const want = grants[uid] ? grantCopy(grants[uid], rules[grants[uid].office] || []) : null;
    if (!sameCopy(u.folderGrant, want)) writes.push((b) => b.update(doc(db, 'users', uid), { folderGrant: want || deleteField() }));
  }
  for (let i = 0; i < writes.length; i += 15) {
    const batch = writeBatch(db);
    writes.slice(i, i + 15).forEach((w) => w(batch));
    await batch.commit().catch(() => {});
  }
}

// To folders (document types) of the office's documents, or all of them: folderAccess/{uid}.
export async function getFolderAccess(uid) {
  const s = await getDoc(doc(db, 'folderAccess', uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

export async function listFolderAccess(office) {
  const snap = await getDocs(query(collection(db, 'folderAccess'), where('office', '==', office)));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// all: every folder; otherwise types (codes); edit: editor, else viewer. Nothing left: the access
// is removed. everyOffice (administrators and the Records Officer): those folders of every office
// (office '*'), for anyone, whatever their office.
export const EVERY_OFFICE = '*';
export async function setFolderAccess(person, { all = false, types = [], edit = false, everyOffice = false }, user) {
  const ref = doc(db, 'folderAccess', person.uid);
  const profileRef = doc(db, 'users', person.uid);
  const batch = writeBatch(db);
  if (!all && !types.length) {
    batch.delete(ref);
    batch.update(profileRef, { folderGrant: deleteField() });
    return batch.commit();
  }
  const g = {
    office: everyOffice ? EVERY_OFFICE : person.office || '', all, types: all ? [] : [...new Set(types)].sort(), edit: Boolean(edit), name: person.displayName || person.email || '',
    by: user.uid, byName: user.displayName || user.email || '', at: new Date().toISOString(),
  };
  const blocked = g.office === EVERY_OFFICE ? [] : (await getFolderRules(g.office).catch(() => ({ restricted: [] }))).restricted;
  batch.set(ref, g);
  // Its copy in the profile, which Storage checks (grantCopy).
  batch.update(profileRef, { folderGrant: grantCopy(g, blocked) });
  return batch.commit();
}

// A reviewer's comments on a draft sent to them for review.
export async function reviewDocument(id, comment, user) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    const text = String(comment || '').trim();
    if (!text) throw new Error('Write your review.');
    tx.update(ref, {
      reviews: [...(d.reviews || []), { uid: user.uid, name: user.displayName || user.email, comment: text.slice(0, 2000), at: new Date().toISOString() }],
      updatedAt: serverTimestamp(),
      history: [...(d.history || []), historyEntry('reviewed', user, text.slice(0, 200))],
    });
  });
}

// Documents referred to the user (a supplier or payee, or anyone), including those sent back.
export async function listReferred(uid, max = 200) {
  const snap = await getDocs(query(collection(db, 'documents'), where('referred', 'array-contains', uid), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export async function listForwarded(uid, max = 100) {
  const snap = await getDocs(query(collection(db, 'documents'), where('sharedWith', 'array-contains', uid), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

// Documents waiting in an office (all routed documents for admins: office '').
// Documents waiting for the user: in their office at a routed step, and their own documents at
// the preparer's step. The office head gets everything waiting in the office.
export async function listInbox({ office, uid, all = false, head = false, max = 300 }) {
  const docs = collection(db, 'documents');
  const queries = all
    ? [query(docs, where('workflow.state', '==', 'in-progress'), limit(max))]
    : [
      ...(office ? [head
        ? query(docs, where('currentOffice', '==', office), limit(max))
        : query(docs, where('currentOffice', '==', office), where('atPreparer', '==', false), limit(max))] : []),
      ...(uid ? [query(docs, where('createdBy', '==', uid), where('atPreparer', '==', true), limit(max)),
        // referred to this user by the office holding it
        query(docs, where('currentOffice', '==', `person:${uid}`), limit(max))] : []),
    ];
  const byId = new Map();
  for (const snap of await Promise.all(queries.map((q) => getDocs(q)))) {
    for (const d of snap.docs) byId.set(d.id, { id: d.id, ...d.data() });
  }
  return [...byId.values()].filter((d) => d.workflow?.state === 'in-progress')
    .sort((a, b) => (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0));
}

export async function setDocumentStatus(id, status, user, history = [], extra = {}, note = '') {
  // Cancelling a routed document ends its route.
  let d = null;
  if (status === 'cancelled') {
    d = (await getDoc(doc(db, 'documents', id))).data();
    const end = d ? cancelWorkflow(d, user) : null;
    if (end) extra = { ...extra, ...end };
  }
  await updateDoc(doc(db, 'documents', id), {
    ...extra,
    status,
    updatedAt: serverTimestamp(),
    history: [...history, historyEntry(status, user, note)],
  });
  // A cancelled document shows as cancelled to anyone scanning its QR code.
  if (d?.pdf?.files?.length) await setDoc(doc(db, 'checks', id), checkRecord({ ...d, ...extra, status })).catch(() => {});
}

export async function getDocument(id) {
  const snap = await getDoc(doc(db, 'documents', id));
  return snap.exists() ? (await withMainDocuments([{ id: snap.id, ...snap.data() }]))[0] : null;
}

// Supporting documents follow their main document into the Archive (lib/archiveFiles.js
// withParents): the main documents not among docs are read too (those the user may open).
async function withMainDocuments(docs) {
  const have = new Set(docs.map((d) => d.id));
  const missing = [...new Set(docs.filter((d) => d.supports?.id && !d.workflow && !have.has(d.supports.id)).map((d) => d.supports.id))];
  const parents = (await Promise.all(missing.map((id) => getDoc(doc(db, 'documents', id)).then((s) => (s.exists() ? { id: s.id, ...s.data() } : null)).catch(() => null)))).filter(Boolean);
  return withParents(docs, [...docs, ...parents]);
}

// Admins: every document. Others: their own, their office's and those routed through their
// office (the Firestore rules allow no more), merged.
// The documents a user may see (firestore.rules): their own and those waiting in their office;
// for an office head, every document of the office and every one routed through it.
// granted: also the office's documents the office head gave this user access to (one by one, or
// by folder: Folders → Access).
export async function listDocuments({ uid, office = '', all = false, head = false, granted = false, max = 1000 } = {}) {
  const docs = collection(db, 'documents');
  const grant = granted && !all ? await getFolderAccess(uid).catch(() => null) : null;
  // A folder at a time, leaving out the folders and documents the office restricted. Access to the
  // folders of every office (given by an administrator): those folders of all offices.
  const every = grant?.office === EVERY_OFFICE;
  let folderTypes = [];
  if (every || (grant && office && !head && grant.office === office)) {
    const [rules, types] = await Promise.all([every ? { restricted: [] } : getFolderRules(office).catch(() => ({ restricted: [] })), grant.all ? listDocumentTypes() : null]);
    folderTypes = (grant.all ? [...new Set([...types.map((t) => t.code), 'DOC'])] : grant.types || []).filter((t) => t && !rules.restricted.includes(t));
  }
  // An office's folders hold its own documents and those routed through it.
  const folderQueries = folderTypes.flatMap((t) => (every
    ? [query(docs, where('typeCode', '==', t), where('restricted', '==', false), limit(max))]
    : [query(docs, where('office', '==', office), where('typeCode', '==', t), where('restricted', '==', false), limit(max)),
      query(docs, where('routeOffices', 'array-contains', office), where('typeCode', '==', t), where('restricted', '==', false), limit(max))]));
  // Every document (administrators, the Records Officer): page by page, newest first, so the
  // processed ones do not crowd out the open ones (up to 5000).
  if (all) {
    const out = [];
    let last = null;
    for (;;) {
      const snap = await getDocs(query(docs, orderBy('updatedAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(500)));
      snap.docs.forEach((d) => out.push({ id: d.id, ...d.data() }));
      if (snap.size < 500 || out.length >= Math.max(max, 5000)) break;
      last = snap.docs[snap.docs.length - 1];
    }
    return withMainDocuments(out);
  }
  const queries = all
    ? []
    : [
      query(docs, where('createdBy', '==', uid), limit(max)),
      query(docs, where('currentOffice', '==', `person:${uid}`), limit(max)),
      ...(office && head ? [
        query(docs, where('office', '==', office), limit(max)),
        query(docs, where('routeOffices', 'array-contains', office), limit(max)),
        query(docs, where('currentOffice', '==', office), limit(max)),
      ] : []),
      ...(office && !head ? [
        query(docs, where('currentOffice', '==', office), where('atPreparer', '==', false), limit(max)),
      ] : []),
      ...(granted ? [query(docs, where('access', 'array-contains', uid), limit(max))] : []),
      ...folderQueries,
    ];
  const byId = new Map();
  for (const snap of await Promise.all(queries.map((q) => getDocs(q)))) {
    for (const d of snap.docs) byId.set(d.id, { id: d.id, ...d.data() });
  }
  return withMainDocuments([...byId.values()].sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)));
}

// The document and its public record (what its QR code opens), together.
export async function deleteDocument(id) {
  // The documents it linked are free to be linked again.
  const cur = await getDoc(doc(db, 'documents', id)).then((s) => s.data()).catch(() => null);
  if (cur) await releaseLinks(id, linkedDocs(cur), []);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'checks', id));
  batch.delete(doc(db, 'documents', id));
  await batch.commit();
}

export function snapshotType(type) {
  const keys = ['code', 'name', 'version', 'fields', 'steps', 'checklist', 'checklistSource', 'processing', 'template', 'paperSize', 'orientation', 'bulkDownload', 'uploadOnly', 'headerOffice', 'publicPdf'];
  return Object.fromEntries(keys.filter((k) => type[k] !== undefined).map((k) => [k, type[k]]));
}

// Prefer the frozen format stored on the document; fall back to the live type.
export async function getTypeForDocument(document) {
  if (document.typeSnapshot?.template !== undefined || !document.typeId) {
    // Saved before the snapshot kept the letterhead office (the Travel Order: the Mayor's).
    const headerOffice = document.typeSnapshot?.headerOffice ?? STARTER_TYPES.find((t) => t.code === document.typeSnapshot?.code)?.headerOffice;
    return withApprover({ id: document.typeId, ...document.typeSnapshot, ...(headerOffice ? { headerOffice } : {}) });
  }
  return getDocumentType(document.typeId);
}

// A short human-readable title (payee/supplier/purpose) for lists.
function summarize(type, data) {
  const preferred = ['payee', 'supplier', 'purpose', 'office', 'particulars', 'description'];
  for (const key of preferred) {
    const v = data?.[key];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  const first = (type.fields || []).find((f) => f.type === 'text' && data?.[f.key]);
  return first ? String(data[first.key]).slice(0, 120) : type.name;
}
