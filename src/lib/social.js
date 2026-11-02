import {
  addDoc, collection, deleteDoc, doc, FieldPath, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction,
  updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { auth, db, storage } from '../firebase.js';
import { sniffUpload } from './sniff.js';

const nameOf = (u) => u?.displayName || u?.email || '';
const safeName = (name) => String(name || '').replace(/[^\w.\- ()]+/g, '_').slice(-80) || 'file';

function upload(path, file) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), file, { contentType: file.type || 'application/octet-stream' });
    task.on('state_changed', null, (e) => reject(new Error(e.code === 'storage/unauthorized'
      ? 'Firebase Storage refused the file. An admin must publish the latest storage.rules (Firebase console → Storage → Rules).'
      : e.message)), resolve);
  });
}

// ---------- Notifications ----------
// users/{uid}/notifications/{id}: { kind: 'document' | 'circular' | 'community', text, link, from,
// fromName, at, read }. Anyone sends one as themselves; only the user reads them (firestore.rules).

// Each notification is also emailed to its recipient (netlify/functions/email.mjs, once an
// administrator has set up the mailbox in Netlify). Never fails the action.
function emailNotices(items) {
  if (!items.length || !auth?.currentUser || import.meta.env?.VITE_USE_EMULATOR === 'true') return;
  auth.currentUser.getIdToken()
    .then((token) => fetch('/.netlify/functions/email', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ items }), keepalive: true,
    }))
    .catch(() => {});
}

export async function notify(to, { kind, text, link = '' }, me) {
  if (!to || !me?.uid || to === me.uid) return;
  const ref = await addDoc(collection(db, 'users', to, 'notifications'), {
    kind, text: String(text).slice(0, 500), link, from: me.uid, fromName: nameOf(me), at: new Date().toISOString(), read: false,
  });
  emailNotices([{ to, id: ref.id }]);
}

// The same notice to many people (in batches: Firestore takes 500 writes at a time).
export async function notifyMany(uids, notice, me) {
  const list = [...new Set(uids)].filter((u) => u && u !== me.uid);
  const at = new Date().toISOString();
  for (let i = 0; i < list.length; i += 450) {
    const batch = writeBatch(db);
    const items = [];
    for (const to of list.slice(i, i + 450)) {
      const ref = doc(collection(db, 'users', to, 'notifications'));
      items.push({ to, id: ref.id });
      batch.set(ref, {
        kind: notice.kind, text: String(notice.text).slice(0, 500), link: notice.link || '', from: me.uid, fromName: nameOf(me), at, read: false,
      });
    }
    await batch.commit();
    emailNotices(items);
  }
}

export function watchNotifications(uid, onChange, onError) {
  return onSnapshot(query(collection(db, 'users', uid, 'notifications'), orderBy('at', 'desc'), limit(60)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function markNotificationsRead(uid, ids) {
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(db, 'users', uid, 'notifications', id), { read: true });
  await batch.commit();
}

export const deleteNotification = (uid, id) => deleteDoc(doc(db, 'users', uid, 'notifications', id));

// ---------- Circulars ----------
// circulars/{id}: { title, kind, note, file: { path, name, type, size }, fromOffice, by, byName, at,
// all, toOffices: [...], receipts: { [office]: { uid, name, at } } }. An office head (or an admin)
// sends one to some or all offices; each office marks it received and the sender is notified.

export const CIRCULAR_KINDS = ['Letter', 'Memorandum', 'Executive Order', 'Office Order', 'Circular', 'Notice', 'Invitation', 'Other'];

// fromDoc: a document already in DMS ({ id, controlNo, typeCode, title, file: Blob }) instead of an
// uploaded file: its current PDF is copied into the circular, so every office it is for opens it.
export async function sendCircular({ title, kind, note, file: upFile, fromDoc = null, toOffices, all }, me, people = []) {
  if (!String(title).trim()) throw new Error('Type the title or subject.');
  let file = fromDoc ? fromDoc.file : upFile;
  if (!file) throw new Error(fromDoc === null ? 'Choose the file of the circular (PDF or picture), or a document in DMS.' : 'That document has no PDF yet.');
  // An uploaded file: what it really is, from its first bytes (not a ZIP or other file named or
  // typed as a PDF).
  if (!fromDoc) {
    const kind = await sniffUpload(file);
    if (!kind || kind === 'application/zip') throw new Error(`${file.name}: a circular is a PDF or a picture (JPG, PNG or WebP).`);
    file = new File([file], file.name, { type: kind });
  }
  if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type)) throw new Error('Upload a PDF or a picture (JPG or PNG).');
  if (file.size > 25 * 1024 * 1024) throw new Error('The file is larger than 25 MB.');
  if (!toOffices.length) throw new Error('Choose the office or offices it is for.');
  const ref = doc(collection(db, 'circulars'));
  const path = `circulars/${ref.id}/${Date.now()}-${safeName(file.name)}`;
  const record = {
    title: String(title).trim().slice(0, 200), kind, note: String(note || '').trim().slice(0, 2000),
    file: { path, name: file.name, type: file.type, size: file.size },
    ...(fromDoc ? { doc: { id: fromDoc.id, controlNo: fromDoc.controlNo, typeCode: fromDoc.typeCode || '', title: fromDoc.title || '' } } : {}),
    fromOffice: me.office || '', by: me.uid, byName: nameOf(me), at: new Date().toISOString(),
    all: Boolean(all), toOffices: [...new Set(toOffices)], receipts: {},
  };
  const batch = writeBatch(db);
  batch.set(ref, record);
  await batch.commit();
  try {
    await upload(path, file);
  } catch (e) {
    await deleteDoc(ref).catch(() => {});
    throw e;
  }
  // Everyone in the offices it is for hears of it.
  const to = people.filter((p) => record.toOffices.includes(p.office)).map((p) => p.uid);
  await notifyMany(to, { kind: 'circular', text: `${record.kind}: ${record.title} — from ${record.fromOffice || record.byName}. Open it and mark it received.`, link: `/circulars/${ref.id}` }, me).catch(() => {});
  return ref.id;
}

export async function listCirculars({ office, uid, isAdmin }) {
  const seen = new Map();
  const add = (snap) => snap.docs.forEach((d) => seen.set(d.id, { id: d.id, ...d.data() }));
  if (isAdmin) add(await getDocs(query(collection(db, 'circulars'), orderBy('at', 'desc'), limit(300))));
  else {
    if (office) add(await getDocs(query(collection(db, 'circulars'), where('toOffices', 'array-contains', office))));
    add(await getDocs(query(collection(db, 'circulars'), where('by', '==', uid))));
  }
  return [...seen.values()].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

export async function getCircular(id) {
  const snap = await getDoc(doc(db, 'circulars', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// The user's office marks the circular received; its sender is notified.
export async function receiveCircular(id, me) {
  if (!me.office) throw new Error('You have no office yet: an administrator assigns it in Users.');
  let c;
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'circulars', id);
    const snap = await tx.get(ref);
    c = snap.data();
    if (!c) throw new Error('This circular no longer exists.');
    if (c.receipts?.[me.office]) return;
    // A field path: office names have spaces and apostrophes.
    tx.update(ref, new FieldPath('receipts', me.office), { uid: me.uid, name: nameOf(me), at: new Date().toISOString() });
  });
  await notify(c.by, { kind: 'circular', text: `${me.office} received your ${c.kind.toLowerCase()} "${c.title}" (${nameOf(me)}).`, link: `/circulars/${id}` }, me).catch(() => {});
}

export const deleteCircular = (id) => deleteDoc(doc(db, 'circulars', id));

// Circulars for the user's office it has not marked received.
export const toReceive = (list, office) => (list || []).filter((c) => office && c.toOffices?.includes(office) && !c.receipts?.[office]);

// ---------- Communities ----------
// communities/{id}: { name, description, office, createdBy, members: [uid], names: { uid: name },
// createdAt, lastText, lastAt, lastBy, readAt: { uid: iso } }; communities/{id}/messages/{id}:
// { from, fromName, text, file?: { path, name, type, size }, at }. The office that created it
// administers it (its head, the creator, administrators).

export const managesCommunity = (c, { uid, office, isHead, isAdmin }) => Boolean(isAdmin || c.createdBy === uid || (isHead && office && c.office === office));

export function watchCommunities(uid, onChange, onError) {
  return onSnapshot(query(collection(db, 'communities'), where('members', 'array-contains', uid)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (y.lastAt || y.createdAt || '').localeCompare(x.lastAt || x.createdAt || ''))),
    onError);
}

export async function createCommunity({ name, description, members }, me) {
  if (!String(name).trim()) throw new Error('Type the name of the community.');
  const all = [{ uid: me.uid, displayName: nameOf(me) }, ...members.filter((m) => m.uid !== me.uid)];
  const at = new Date().toISOString();
  const ref = await addDoc(collection(db, 'communities'), {
    name: String(name).trim().slice(0, 100), description: String(description || '').trim().slice(0, 500),
    office: me.office || '', createdBy: me.uid,
    members: all.map((m) => m.uid), names: Object.fromEntries(all.map((m) => [m.uid, nameOf(m)])),
    createdAt: at, lastText: '', lastAt: at, lastBy: me.uid, readAt: { [me.uid]: at },
  });
  await notifyMany(all.map((m) => m.uid), { kind: 'community', text: `${nameOf(me)} added you to the community "${String(name).trim()}".`, link: `/communities/${ref.id}` }, me).catch(() => {});
  return ref.id;
}

export const updateCommunity = (id, patch) => updateDoc(doc(db, 'communities', id), patch);

export async function addCommunityMember(c, person, me) {
  if (c.members.includes(person.uid)) return;
  await updateDoc(doc(db, 'communities', c.id), { members: [...c.members, person.uid], [`names.${person.uid}`]: nameOf(person) });
  await notify(person.uid, { kind: 'community', text: `${nameOf(me)} added you to the community "${c.name}".`, link: `/communities/${c.id}` }, me).catch(() => {});
}

export async function removeCommunityMember(c, uid) {
  const names = { ...c.names };
  delete names[uid];
  await updateDoc(doc(db, 'communities', c.id), { members: c.members.filter((m) => m !== uid), names });
}

export const deleteCommunity = (id) => deleteDoc(doc(db, 'communities', id));

export function watchCommunityMessages(id, onChange, onError) {
  return onSnapshot(query(collection(db, 'communities', id, 'messages'), orderBy('at'), limit(500)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function postToCommunity(c, me, { text, file }) {
  const body = String(text || '').trim().slice(0, 2000);
  if (!body && !file) return;
  if (file && file.size > 25 * 1024 * 1024) throw new Error('The file is larger than 25 MB.');
  const at = new Date().toISOString();
  let shared = null;
  if (file) {
    const path = `communities/${c.id}/${Date.now()}-${safeName(file.name)}`;
    await upload(path, file);
    shared = { path, name: file.name, type: file.type || '', size: file.size };
  }
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'communities', c.id, 'messages')), { from: me.uid, fromName: nameOf(me), text: body, ...(shared ? { file: shared } : {}), at });
  batch.update(doc(db, 'communities', c.id), {
    lastText: (body || `📎 ${file.name}`).slice(0, 140), lastAt: at, lastBy: me.uid, [`readAt.${me.uid}`]: at,
  });
  await batch.commit();
}

export const markCommunityRead = (id, uid) => updateDoc(doc(db, 'communities', id), { [`readAt.${uid}`]: new Date().toISOString() });

export const deleteCommunityMessage = (cid, mid) => deleteDoc(doc(db, 'communities', cid, 'messages', mid));
