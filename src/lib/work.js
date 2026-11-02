// Work management data: boards/{id}, workItems/{id} (with workItems/{id}/activity/{id}). See
// docs/work-management-integration.md. Documents stay in documents/{id}: a work item keeps only
// their ids (docRefs), never their title or content, so linking a restricted document shows
// nothing of it to board members who may not open it.
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { accessOf, boardRole, cleanColumns, cleanFields, cleanItem, fieldText, groupsFor, templateOf } from './workModel.js';
import { emailNotices, notifyMany } from './social.js';
import { reminderPlan, reminderText } from './reports.js';

// The address of an item (it opens the board with the item's details): used in notifications.
export const itemLink = (item) => `/boards/${item.boardId}/${item.id}`;
// Tell the people newly assigned to an item (not the one assigning).
function tellAssigned(board, item, uids, user) {
  if (uids.length) notifyMany(uids, { kind: 'work', text: `assigned you "${item.title}" on ${board.name || 'a board'}${item.dueDate ? `, due ${item.dueDate}` : ''}.`, link: itemLink(item) }, user).catch(() => {});
}

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
  if (patch.columns) next.columns = cleanColumns(patch.columns);
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
  item.fields = cleanFields(item.fields, board.columns);
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
  activityWrite(batch, ref.id, user, 'created', `created ${item.parentId ? 'the subtask' : ''} "${item.title}"${item.docRefs.length ? ` with ${item.docRefs.length} linked document(s)` : ''}`);
  await batch.commit();
  tellAssigned(board, { ...item, id: ref.id, boardId: board.id }, item.assignees, user);
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
  if ((before.projectId || '') !== after.projectId) out.push(['project', after.projectId ? 'related to a project' : 'no longer related to a project']);
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
  const was = Object.fromEntries((before.checklist || []).map((c) => [c.id, c]));
  const now = Object.fromEntries(after.checklist.map((c) => [c.id, c]));
  for (const c of after.checklist) {
    if (!was[c.id]) out.push(['checklist', `added to the checklist: ${c.text}`]);
    else if (was[c.id].done !== c.done) out.push(['checklist', `${c.done ? 'checked off' : 'unchecked'}: ${c.text}`]);
  }
  for (const c of before.checklist || []) if (!now[c.id]) out.push(['checklist', `removed from the checklist: ${c.text}`]);
  // The board's own columns (by their current label).
  for (const c of board.columns || []) {
    const a = (before.fields || {})[c.id]; const b = (after.fields || {})[c.id];
    if ((a ?? '') !== (b ?? '')) out.push(['field', b === undefined || b === '' ? `${c.label}: cleared` : `${c.label}: ${fieldText(c, b, board.names)}`]);
  }
  return out;
}

// Saves the item (all its fields, as edited) and records what changed.
export async function saveItem(board, before, input, user) {
  const item = cleanItem({ ...before, ...input });
  // Values of hidden or removed columns stay as they were; the visible ones are as edited.
  const visible = (board.columns || []).filter((c) => !c.hidden);
  const kept = Object.fromEntries(Object.entries(before.fields || {}).filter(([k]) => !visible.some((c) => c.id === k)));
  item.fields = { ...kept, ...cleanFields(item.fields, visible) };
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
  tellAssigned(board, { ...item, id: before.id, boardId: before.boardId }, item.assignees.filter((u) => !(before.assignees || []).includes(u)), user);
}

// An assignee who is not a member of the board changes only the status and the checklist of
// their item.
export async function setItemStatus(board, before, status, user, checklist = before.checklist || []) {
  const after = cleanItem({ ...before, status, checklist });
  const changes = describe(before, after, board).filter(([type]) => type === 'status' || type === 'checklist');
  if (!changes.length) return;
  const batch = writeBatch(db);
  batch.update(doc(db, 'workItems', before.id), {
    status: after.status, checklist: after.checklist, completedOn: after.status === 'done' ? (before.completedOn || today()) : '',
    updatedAt: serverTimestamp(), updatedBy: user.uid,
  });
  for (const [type, text] of changes) activityWrite(batch, before.id, user, type, text);
  await batch.commit();
}

// ---- Comments (workItems/{id}/comments): whoever may see the item writes them, as themselves;
// they are never changed or removed. Mentioned people are notified. ----
export async function listComments(itemId, max = 100) {
  const snap = await getDocs(query(collection(db, 'workItems', itemId, 'comments'), orderBy('at', 'asc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function addComment(board, item, text, mentions, user) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Write the comment.');
  await addDoc(collection(db, 'workItems', item.id, 'comments'), {
    text: t.slice(0, 2000), mentions: [...new Set(mentions)].slice(0, 20), by: user.uid, byName: nameOf(user), at: serverTimestamp(),
  });
  if (mentions.length) {
    notifyMany(mentions, { kind: 'mention', text: `mentioned you on "${item.title}": ${t.slice(0, 160)}`, link: itemLink(item) }, user).catch(() => {});
  }
}

// My Work → Mentions: the user's recent mention notices (newest first).
export async function listMentions(uid, max = 30) {
  const snap = await getDocs(query(collection(db, 'users', uid, 'notifications'), where('kind', '==', 'mention'), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, max);
}

// The subtasks of an item (items whose parentId is it, on its board).
export async function listSubtasks(item) {
  const snap = await getDocs(query(collection(db, 'workItems'), where('boardId', '==', item.boardId), where('parentId', '==', item.id), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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


// ---- Saved views (boards/{id}/views/{id}): a name for a board's filters and view. Each person
// keeps their own; a board manager may share one with everyone on the board. Never edited:
// saved again under a name, or deleted. ----
export async function listViews(boardId, uid) {
  const col = collection(db, 'boards', boardId, 'views');
  const [own, shared] = await Promise.all([
    getDocs(query(col, where('by', '==', uid), limit(50))),
    getDocs(query(col, where('shared', '==', true), limit(50))),
  ]);
  const all = new Map([...own.docs, ...shared.docs].map((d) => [d.id, { id: d.id, ...d.data() }]));
  return [...all.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
export async function saveView(boardId, { name, shared = false, filters }, user) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Name the view.');
  const f = filters || {};
  const ref = await addDoc(collection(db, 'boards', boardId, 'views'), {
    name: n.slice(0, 60), shared: Boolean(shared), by: user.uid, byName: nameOf(user), at: serverTimestamp(),
    view: ['table', 'kanban', 'calendar'].includes(f.view) ? f.view : 'table',
    status: String(f.status || ''), sort: String(f.sort || 'due'), mine: Boolean(f.mine), q: String(f.q || '').slice(0, 100),
    office: String(f.office || ''),
  });
  return ref.id;
}
export async function deleteView(boardId, viewId) {
  await deleteDoc(doc(db, 'boards', boardId, 'views', viewId));
}

// ---- Deadline reminders ----
// Sent from the browser of whoever opens DMS (once a day per person and device): for the items
// assigned to them and on the boards they manage, a notice (and email) to each assignee when an
// item is due tomorrow, due today, or overdue (once). Each notice has a fixed id, so however many
// people's browsers run this, each reminder is created once: the rules refuse overwriting one.
// (A scheduled backend would send them even when nobody signs in; it needs a Firebase service
// account in Netlify: see docs/work-management-integration.md.)
const REMIND_KEY = (uid) => `dms-reminders-${uid}`;
export async function sendDeadlineReminders(user, today) {
  try { if (localStorage.getItem(REMIND_KEY(user.uid)) === today) return 0; } catch { /* no storage: run */ }
  const boards = await listBoards(user);
  const byId = Object.fromEntries(boards.map((b) => [b.id, b]));
  const managed = boards.filter((b) => boardRole(b, user.uid) === 'manager').slice(0, 20);
  const lists = await Promise.all([listMyItems(user.uid), ...managed.map((b) => listBoardItems(b.id).catch(() => []))]);
  const items = [...new Map(lists.flat().map((i) => [i.id, i])).values()];
  const at = new Date().toISOString();
  const sent = [];
  for (const r of reminderPlan(items, today, byId)) {
    const text = reminderText(r.item, r.kind, byId[r.item.boardId]?.name || '');
    for (const to of r.to) {
      try {
        await setDoc(doc(db, 'users', to, 'notifications', r.id), {
          kind: 'reminder', text: text.slice(0, 500), link: itemLink(r.item), from: user.uid, fromName: nameOf(user), at, read: false,
        });
        sent.push({ to, id: r.id });
      } catch { /* already sent (by this or another person's browser) */ }
    }
  }
  emailNotices(sent);
  try { localStorage.setItem(REMIND_KEY(user.uid), today); } catch { /* not kept */ }
  return sent.length;
}
