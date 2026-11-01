import {
  addDoc, collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, where,
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { getFileBytes, getPdfBytes } from './api.js';
import { docFolder, filesOf, processedAt } from './archiveFiles.js';

export { filesOf };

// The Archive: documents whose route is processed (workflow done) leave the working lists and are
// kept here. The Records Officer controls it: where each one is filed (archive: { location, note,
// by, at } on the document), the devices it is backed up to, and the backups (backups/{id}).

export { isArchived, processedAt } from './archiveFiles.js';

// Every processed document (the Records Officer and administrators), a page of 500 at a time:
// the archive grows past what one query returns, and none may be left out of a backup.
export async function listArchive(page = 500) {
  const all = [];
  let last = null;
  for (;;) {
    const q = query(collection(db, 'documents'), where('workflow.state', '==', 'done'), orderBy(documentId()),
      ...(last ? [startAfter(last)] : []), limit(page));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => all.push({ id: d.id, ...d.data() }));
    if (snap.size < page) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return all.sort((a, b) => processedAt(b).localeCompare(processedAt(a)));
}

// Where the paper is filed (e.g. a cabinet, box or shelf).
export async function fileInArchive(id, { location, note }, user) {
  const ref = doc(db, 'documents', id);
  await runTransaction(db, async (tx) => {
    const d = (await tx.get(ref)).data();
    const at = new Date().toISOString();
    const archive = { location: String(location || '').trim().slice(0, 200), note: String(note || '').trim().slice(0, 500), by: user.displayName || user.email, at };
    tx.update(ref, {
      archive, updatedAt: serverTimestamp(),
      history: [...(d.history || []), { action: 'filed in the archive', note: archive.location, by: archive.by, uid: user.uid, at }],
    });
  });
}

// meta/archive: { devices: [{ id, name, note }], everyDays }
// The automatic Google Drive backup (netlify/functions/drive-*.mjs): the calls the Records
// Officer makes (status, connect, disconnect, back up now) with their Firebase ID token.
export async function driveCall(fn, body = {}) {
  const { auth } = await import('../firebase.js');
  const token = await auth.currentUser.getIdToken();
  // Connecting: the backup reads the archive as this Records Officer (their DMS sign-in).
  if (body.action === 'start') body = { ...body, firebaseRefreshToken: auth.currentUser.refreshToken };
  const r = await fetch(`/.netlify/functions/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'The Google Drive backup is not available here (it runs on the live site).' }));
  if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export const DEFAULT_ARCHIVE = { devices: [], everyDays: 7 };
export async function getArchiveSettings() {
  const snap = await getDoc(doc(db, 'meta', 'archive'));
  return { ...DEFAULT_ARCHIVE, ...(snap.exists() ? snap.data() : {}) };
}
export const saveArchiveSettings = (s) => setDoc(doc(db, 'meta', 'archive'), { devices: s.devices, everyDays: Number(s.everyDays) || 7 }, { merge: true });

// backups/{id}: { device, deviceName, kind: 'new' | 'all', count, files, failed, at, by, byName }
export async function listBackups() {
  const snap = await getDocs(query(collection(db, 'backups'), orderBy('at', 'desc'), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export const logBackup = (entry, user) => addDoc(collection(db, 'backups'), { ...entry, at: new Date().toISOString(), by: user.uid, byName: user.displayName || user.email });

// The last backup to each device, and whether one is due (none yet, or older than everyDays).
export function backupStatus(backups, settings, now = new Date()) {
  return (settings.devices || []).map((dev) => {
    const last = backups.find((b) => b.device === dev.id);
    const due = !last || (now - new Date(last.at)) / 864e5 >= (Number(settings.everyDays) || 7);
    return { ...dev, last, due };
  });
}

// Documents to put in a backup to a device: all of them, or those processed or changed since its
// last backup.
export function toBackUp(docs, last, kind) {
  if (kind === 'all' || !last) return docs;
  const since = new Date(last.at).getTime();
  return docs.filter((d) => {
    const changed = d.updatedAt?.toMillis ? d.updatedAt.toMillis() : new Date(processedAt(d) || 0).getTime();
    return changed > since || new Date(processedAt(d) || 0).getTime() > since;
  });
}

const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// One ZIP: a folder per year and type, one per document with its files and record.json (all it
// holds), and index.csv listing every document. onProgress(text).
export async function buildBackup(docs, onProgress = () => {}) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const rows = [['Control No.', 'Type', 'Payee / Subject', 'Office', 'Prepared by', 'Processed', 'Filed at', 'Folder'].map(csv).join(',')];
  const failed = [];
  let files = 0;
  for (const [i, d] of docs.entries()) {
    onProgress(`Adding ${i + 1} of ${docs.length}: ${d.controlNo}`);
    const folder = docFolder(d).join('/');
    const names = new Set();
    for (const f of filesOf(d)) {
      let name = f.name;
      for (let n = 2; names.has(name); n++) name = f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
      names.add(name);
      try {
        zip.file(`${folder}/${name}`, f.pdf ? await getPdfBytes(f.path) : await getFileBytes(f.path));
        files++;
      } catch (e) {
        failed.push(`${d.controlNo} ${name}: ${e.message}`);
      }
    }
    const { typeSnapshot, ...record } = d;
    zip.file(`${folder}/record.json`, JSON.stringify({ ...record, updatedAt: d.updatedAt?.toDate?.().toISOString() || '', createdAt: d.createdAt?.toDate?.().toISOString() || '', type: { code: typeSnapshot?.code, name: typeSnapshot?.name } }, null, 2));
    rows.push([d.controlNo, d.typeCode, d.title, d.office, d.createdByName, processedAt(d), d.archive?.location || '', folder].map(csv).join(','));
  }
  zip.file('index.csv', `﻿${rows.join('\r\n')}\r\n`);
  if (failed.length) zip.file('could-not-be-added.txt', failed.join('\r\n'));
  onProgress('Making the ZIP…');
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, files, failed };
}

// Save the ZIP where the Records Officer chooses (a folder on an external drive, a network
// drive...) when the browser can (Chrome or Edge on a computer); otherwise it is downloaded.
export async function saveBackup(blob, name) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return 'saved';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return 'downloaded';
}
