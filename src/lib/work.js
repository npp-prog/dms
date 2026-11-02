// Work management data: boards/{id}, workItems/{id} (with workItems/{id}/activity/{id}). See
// docs/work-management-integration.md. Documents stay in documents/{id}: a work item keeps only
// their ids (docRefs), never their title or content, so linking a restricted document shows
// nothing of it to board members who may not open it.
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { accessOf, cleanItem, groupsFor, templateOf } from './workModel.js';

const nameOf = (user) => user.displayName || user.email || '';

// ---- Boards ----
// The boards the user can see (admins: all), newest first. Bounded.
export async function listBoards(user, { all = false } = {}) {
  const q = all
    ? query(collection(db, 'boards'), limit(200))
    : query(collection(db, 'boards'), where('access', 'array-contains', user.uid), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => !b.archived)
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

export async function getBoard(id) {
  const s = await getDoc(doc(db, 'boards', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

// people: { uid: name } of everyone on the board (names shown without reading their profiles).
export async function createBoard({ name, description = '', template = 'blank', office = '', managers: extra = [], members = [], viewers = [], people = {} }, user) {
  if (!String(name).trim()) throw new Error('Type the name of the board.');
  const managers = [...new Set([user.uid, ...extra])];
  const m = [...new Set(members)].filter((u) => !managers.includes(u));
  const v = [...new Set(viewers)].filter((u) => !managers.includes(u) && !m.includes(u));
  const ref = await addDoc(collection(db, 'boards'), {
    name: String(name).trim().slice(0, 120),
    description: String(description).trim().slice(0, 1000),
    template: templateOf(template).id,
    office,
    ownerUid: user.uid,
    ownerName: nameOf(user),
    managers, members: m, viewers: v,
    access: accessOf({ managers, members: m, viewers: v }),
    names: { ...people, [user.uid]: nameOf(user) },
    groups: groupsFor(template),
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Managers: name, description, office, groups, people.
export async function updateBoard(id, patch) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  if (patch.managers || patch.members || patch.viewers) next.access = accessOf(patch);
  await updateDoc(doc(db, 'boards', id), next);
}

// ---- Work items ----
export async function listBoardItems(boardId, max = 500) {
  const snap = await getDocs(query(collection(db, 'workItems'), where('boardId', '==', boardId), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// My Work: the items assigned to the user, on any board. Bounded.
export async function listMyItems(uid, max = 300) {
  const snap = await getDocs(query(collection(db, 'workItems'), where('assignees', 'array-contains', uid), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Items for review: those the user created that are marked For Review.
export async function listCreatedForReview(uid, max = 100) {
  const snap = await getDocs(query(collection(db, 'workItems'), where('createdBy', '==', uid), where('status', '==', 'for_review'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// The work items that link a document, on the boards the user can see (one bounded query per board).
export async function listItemsForDocument(docId, boards) {
  const lists = await Promise.all(boards.map((b) => getDocs(query(collection(db, 'workItems'),
    where('boardId', '==', b.id), where('docRefs', 'array-contains', docId), limit(50)))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data(), boardName: b.name })))
    .catch(() => [])));
  return lists.flat();
}

export async function getItem(id) {
  const s = await getDoc(doc(db, 'workItems', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

// The activity timeline: append-only (the rules allow adding, never changing or removing).
function activityWrite(batch, itemId, user, type, text) {
  batch.set(doc(collection(db, 'workItems', itemId, 'activity')), {
    type, text: String(text).slice(0, 500), by: user.uid, byName: nameOf(user), at: serverTimestamp(),
  });
}
export async function listActivity(itemId, max = 50) {
  const snap = await getDocs(query(collection(db, 'workItems', itemId, 'activity'), orderBy('at', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// board: the board doc (its names, for assignee names). Returns the new item's id.
export async function createItem(board, input, user) {
  const item = cleanItem(input);
  if (!item.title) throw new Error('Type what the work item is.');
  const ref = doc(collection(db, 'workItems'));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...item,
    boardId: board.id,
    assigneeNames: Object.fromEntries(item.assignees.map((u) => [u, board.names?.[u] || ''])),
    completedOn: item.status === 'done' ? today() : '',
    createdBy: user.uid, createdByName: nameOf(user),
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user.uid,
  });
  activityWrite(batch, ref.id, user, 'created', `created "${item.title}"${item.docRefs.length ? ` with ${item.docRefs.length} linked document(s)` : ''}`);
  await batch.commit();
  return ref.id;
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// What changed, in words, for the timeline.
function describe(before, after, board) {
  const out = [];
  const name = (u) => board.names?.[u] || 'someone';
  if (before.title !== after.title) out.push(['edited', `renamed it "${after.title}"`]);
  if (before.status !== after.status) out.push(['status', `status: ${after.status.replace('_', ' ')}`]);
  if (before.priority !== after.priority) out.push(['priority', `priority: ${after.priority}`]);
  if (before.dueDate !== after.dueDate) out.push(['due', after.dueDate ? `due date: ${after.dueDate}` : 'due date removed']);
  if (before.startDate !== after.startDate) out.push(['start', after.startDate ? `start date: ${after.startDate}` : 'start date removed']);
  if (before.groupId !== after.groupId) out.push(['moved', `moved to ${(board.groups || []).find((g) => g.id === after.groupId)?.name || 'another group'}`]);
  if (before.office !== after.office) out.push(['office', after.office ? `responsible office: ${after.office}` : 'responsible office removed']);
  const added = after.assignees.filter((u) => !(before.assignees || []).includes(u));
  const removed = (before.assignees || []).filter((u) => !after.assignees.includes(u));
  if (added.length) out.push(['assigned', `assigned ${added.map(name).join(', ')}`]);
  if (removed.length) out.push(['unassigned', `unassigned ${removed.map(name).join(', ')}`]);
  const linked = after.docRefs.filter((d) => !(before.docRefs || []).includes(d));
  const unlinked = (before.docRefs || []).filter((d) => !after.docRefs.includes(d));
  // (The timeline names no document: board members may not be allowed to see it.)
  if (linked.length) out.push(['linked', `linked ${linked.length} document(s)`]);
  if (unlinked.length) out.push(['unlinked', `removed ${unlinked.length} linked document(s)`]);
  if ((before.description || '') !== after.description) out.push(['edited', 'edited the description']);
  if ((before.tags || []).join() !== after.tags.join()) out.push(['edited', `tags: ${after.tags.join(', ') || 'none'}`]);
  return out;
}

// Saves the item (all its fields, as edited) and records what changed.
export async function saveItem(board, before, input, user) {
  const item = cleanItem({ ...before, ...input });
  if (!item.title) throw new Error('The work item needs a title.');
  const changes = describe(before, item, board);
  if (!changes.length) return;
  const batch = writeBatch(db);
  batch.update(doc(db, 'workItems', before.id), {
    ...item,
    assigneeNames: Object.fromEntries(item.assignees.map((u) => [u, board.names?.[u] || before.assigneeNames?.[u] || ''])),
    completedOn: item.status === 'done' ? (before.completedOn || today()) : '',
    updatedAt: serverTimestamp(), updatedBy: user.uid,
  });
  for (const [type, text] of changes) activityWrite(batch, before.id, user, type, text);
  await batch.commit();
}

// An assignee who is not a member of the board changes only the status of their item.
export async function setItemStatus(board, before, status, user) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'workItems', before.id), {
    status, completedOn: status === 'done' ? (before.completedOn || today()) : '', updatedAt: serverTimestamp(), updatedBy: user.uid,
  });
  activityWrite(batch, before.id, user, 'status', `status: ${status.replace('_', ' ')}`);
  await batch.commit();
}

// Board managers and the item's creator. (Its activity stays, unreachable; a later phase may
// archive items instead.)
export async function deleteItem(id) {
  await deleteDoc(doc(db, 'workItems', id));
}

// Links a document to an existing item (from the document page), if not linked yet.
export async function linkDocumentToItem(board, item, docId, user) {
  if ((item.docRefs || []).includes(docId)) return;
  await saveItem(board, item, { docRefs: [...(item.docRefs || []), docId] }, user);
}

