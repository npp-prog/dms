import { collection, deleteDoc, doc, getDocs, updateDoc, writeBatch } from 'firebase/firestore';
import { deleteObject, listAll, ref as storageRef } from 'firebase/storage';
import { db, storage } from '../firebase.js';

// Settings → Reset documents (the superadmin only; firestore.rules and storage.rules allow it to
// no one else). Removes every document with its files (PDF versions, attachments, uploads), its
// public check record and the verification records of its PDFs, the Archive (documents filed in
// it), every counter (so the control no. starts again at DMS-<year>-000001 and every reference no.
// series at 0001), everyone's notifications, the archive backup log, and the links work items and
// projects have to documents. Users, offices, settings, document types, routes, checklists, boards
// and projects stay. Copies already saved in Google Drive are not touched.
// onProgress(text) reports where it is. Returns what it removed ({ documents, files, ... }).

async function filesUnder(path) {
  const out = [];
  const walk = async (r) => {
    const l = await listAll(r);
    out.push(...l.items);
    for (const p of l.prefixes) await walk(p);
  };
  await walk(storageRef(storage, path)).catch(() => {});
  return out;
}

async function deleteAll(refs, onEach) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
    onEach?.(Math.min(i + 400, refs.length));
  }
}

export async function resetAllDocuments(onProgress = () => {}) {
  const done = { documents: 0, files: 0, checks: 0, verifications: 0, counters: 0, notifications: 0, backups: 0, links: 0, failed: 0 };
  const docs = (await getDocs(collection(db, 'documents'))).docs;
  // 1. Each document's files first (the storage rules look the document up), then the document,
  //    its public record and its PDFs' verification records.
  for (let i = 0; i < docs.length; i += 1) {
    const d = docs[i];
    onProgress(`Removing documents… ${i + 1} of ${docs.length}`);
    for (const f of await filesUnder(`documents/${d.id}`)) {
      try { await deleteObject(f); done.files += 1; } catch { done.failed += 1; }
    }
    const hashes = [...new Set((d.data().pdf?.files || []).map((f) => f.sha256).filter(Boolean))];
    const batch = writeBatch(db);
    hashes.forEach((h) => batch.delete(doc(db, 'verifications', h)));
    batch.delete(doc(db, 'checks', d.id));
    batch.delete(d.ref);
    try {
      await batch.commit();
      done.documents += 1; done.checks += 1; done.verifications += hashes.length;
    } catch {
      // (a verification record that is not there, or not deletable: the document still goes)
      try { await deleteDoc(d.ref); done.documents += 1; await deleteDoc(doc(db, 'checks', d.id)).catch(() => {}); } catch { done.failed += 1; }
    }
  }
  // 2. Links to documents claimed by other documents (attachments), work items' and projects' links.
  onProgress('Removing links to documents…');
  await deleteAll((await getDocs(collection(db, 'linkClaims'))).docs.map((x) => x.ref)).catch(() => { done.failed += 1; });
  for (const name of ['workItems', 'projects']) {
    const list = (await getDocs(collection(db, name)).catch(() => ({ docs: [] }))).docs.filter((x) => (x.data().docRefs || []).length);
    for (const x of list) {
      try { await updateDoc(x.ref, { docRefs: [] }); done.links += 1; } catch { done.failed += 1; }
    }
  }
  // 3. Every counter: control nos. and reference no. series start again.
  onProgress('Restarting the numbering…');
  const counters = (await getDocs(collection(db, 'counters'))).docs.map((x) => x.ref);
  await deleteAll(counters);
  done.counters = counters.length;
  // 4. Everyone's notifications, and the archive backup log.
  const users = (await getDocs(collection(db, 'users'))).docs;
  for (let i = 0; i < users.length; i += 1) {
    onProgress(`Clearing notifications… ${i + 1} of ${users.length}`);
    const n = (await getDocs(collection(db, 'users', users[i].id, 'notifications')).catch(() => ({ docs: [] }))).docs.map((x) => x.ref);
    try { await deleteAll(n); done.notifications += n.length; } catch { done.failed += 1; }
  }
  onProgress('Clearing the backup log…');
  const backups = (await getDocs(collection(db, 'backups')).catch(() => ({ docs: [] }))).docs.map((x) => x.ref);
  try { await deleteAll(backups); done.backups = backups.length; } catch { done.failed += 1; }
  onProgress('');
  return done;
}
