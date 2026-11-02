// Projects (work management, Phase 3): projects/{id}, with projects/{id}/issues/{id} (risks,
// issues, blockers) and projects/{id}/updates/{id} (progress updates: append-only). Documents stay
// in the DMS (docRefs: ids only); work items stay on their boards (workItems.projectId), found
// through the project's related boards (boardIds). See docs/work-management-integration.md.
import {
  addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { accessOf, cleanMilestones, cleanProject } from './workModel.js';

const nameOf = (user) => user.displayName || user.email || '';

// headOf: an office head's office (they also see its projects). archived: false (default), true or 'all'.
export async function listProjects(user, { all = false, headOf = '', archived = false } = {}) {
  const q = all ? query(collection(db, 'projects'), limit(200))
    : query(collection(db, 'projects'), where('access', 'array-contains', user.uid), limit(200));
  const snaps = [await getDocs(q)];
  if (!all && headOf) snaps.push(await getDocs(query(collection(db, 'projects'), where('office', '==', headOf), limit(200))).catch(() => ({ docs: [] })));
  const docs = new Map(snaps.flatMap((s) => s.docs).map((d) => [d.id, d]));
  return [...docs.values()].map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => (archived === 'all' ? true : Boolean(p.archived) === archived))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

export async function getProject(id) {
  const s = await getDoc(doc(db, 'projects', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function createProject(input, { managers = [], members = [], viewers = [], people = {} }, user) {
  const p = cleanProject(input);
  if (!p.code || !p.name) throw new Error('Type the project code and name.');
  const mg = [...new Set([user.uid, ...managers])];
  const mb = [...new Set(members)].filter((u) => !mg.includes(u));
  const vw = [...new Set(viewers)].filter((u) => !mg.includes(u) && !mb.includes(u));
  const ref = await addDoc(collection(db, 'projects'), {
    ...p,
    ownerUid: user.uid, ownerName: nameOf(user),
    managers: mg, members: mb, viewers: vw, access: accessOf({ managers: mg, members: mb, viewers: vw }),
    names: { ...people, [user.uid]: nameOf(user) },
    milestones: [], docRefs: [], boardIds: [],
    physicalProgress: 0, progressNote: '', progressAt: '',
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// Managers: the project's details and people (and, as anyone who edits, the rest).
export async function updateProject(id, patch) {
  const next = { ...patch, updatedAt: serverTimestamp() };
  if (patch.code !== undefined || patch.name !== undefined) Object.assign(next, cleanProject({ ...patch }));
  if (patch.managers || patch.members || patch.viewers) next.access = accessOf(patch);
  if (patch.milestones) next.milestones = cleanMilestones(patch.milestones);
  await updateDoc(doc(db, 'projects', id), next);
}

// Archives a project (read-only, out of lists and reports) or restores it.
export async function archiveProject(id, archived, user) {
  await updateDoc(doc(db, 'projects', id), {
    archived: Boolean(archived), archivedAt: archived ? new Date().toISOString() : '', archivedBy: archived ? user.uid : '', updatedAt: serverTimestamp(),
  });
}

// A progress update: the physical progress (0–100 %) and why, kept for good; the project shows the latest.
export async function addProgressUpdate(project, physical, note, user) {
  const n = Math.round(Number(physical));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Physical progress is a percentage from 0 to 100.');
  if (String(note || '').trim().length < 5) throw new Error('Explain the progress: what was done, and how it was measured.');
  const at = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'projects', project.id, 'updates')), {
    physical: n, note: String(note).trim().slice(0, 2000), by: user.uid, byName: nameOf(user), at: serverTimestamp(),
  });
  batch.update(doc(db, 'projects', project.id), {
    physicalProgress: n, progressNote: String(note).trim().slice(0, 2000), progressAt: at, updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
export async function listProgressUpdates(projectId, max = 50) {
  const snap = await getDocs(query(collection(db, 'projects', projectId, 'updates'), orderBy('at', 'desc'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Risks, issues and blockers.
export async function listIssues(projectId, max = 200) {
  const snap = await getDocs(query(collection(db, 'projects', projectId, 'issues'), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.status === b.status ? (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0) : a.status === 'open' ? -1 : 1));
}
export async function addIssue(projectId, { type, title, description = '', severity = 'medium', owner = '' }, user) {
  if (!String(title).trim()) throw new Error('Type what the risk, issue or blocker is.');
  await addDoc(collection(db, 'projects', projectId, 'issues'), {
    type, title: String(title).trim().slice(0, 200), description: String(description).slice(0, 2000), severity, owner,
    status: 'open', createdBy: user.uid, createdByName: nameOf(user), createdAt: serverTimestamp(), resolvedOn: '', updatedBy: user.uid,
  });
}
export async function setIssueStatus(projectId, issueId, status, user) {
  await updateDoc(doc(db, 'projects', projectId, 'issues', issueId), {
    status, resolvedOn: status === 'resolved' ? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : '', updatedBy: user.uid,
  });
}

// The work items of a project: on its related boards the user can see (one bounded query each).
export async function listProjectItems(project, boards) {
  const visible = boards.filter((b) => (project.boardIds || []).includes(b.id));
  const lists = await Promise.all(visible.map((b) => getDocs(query(collection(db, 'workItems'),
    where('boardId', '==', b.id), where('projectId', '==', project.id), limit(300)))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data(), boardName: b.name }))).catch(() => [])));
  return lists.flat();
}

// The projects (the user can see) that link a document.
export const projectsLinking = (projects, docId) => projects.filter((p) => (p.docRefs || []).includes(docId));
