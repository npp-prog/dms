import { docFolder, filesOf, isArchived } from '../../src/lib/archiveFiles.js';

// The automatic backup of the Archive to Google Drive. Each run goes on from where the last one
// stopped (documents in the order they last changed), for as long as its time allows: a processed
// document gets a folder (DMS Archive / year / type / control no. and payee) with each of its
// files, uploaded once, and record.json, replaced whenever the document changes.
//
// source: the Records Officer's DMS access (lib/fb.mjs firebaseAs); drive: lib/drive.mjs;
// store: where the backup keeps its state (Netlify Blobs; a Map-like { get, set } in tests):
//   'state'          { rootId, folders, cursor, lastRunAt, lastError, documents, files, caughtUp }
//   'doc/<id>'       { folder, parent, record, files: { key: driveId }, at }

const key = (path) => path.replace(/[^A-Za-z0-9]/g, '_');

export async function runBackup({ source, drive, store, budgetMs = 20000, now = () => Date.now() }) {
  const started = now();
  const timeUp = () => now() - started >= budgetMs;
  const state = (await store.get('state')) || {};
  const folders = { ...(state.folders || {}) };
  let rootId = state.rootId || '';
  let cursor = state.cursor || null; // { at, id }: the last document done
  let totals = { documents: state.documents || 0, files: state.files || 0 };
  if (!rootId || !(await drive.exists(rootId))) {
    // No DMS Archive folder (first run, or it was deleted or trashed): back everything up again.
    rootId = await drive.folder('DMS Archive');
    Object.keys(folders).forEach((k) => delete folders[k]);
    cursor = null;
    totals = { documents: 0, files: 0 };
  }
  const folderFor = async (parts) => {
    let parent = rootId;
    for (let i = 0; i < parts.length; i++) {
      const k = parts.slice(0, i + 1).join('/');
      if (!folders[k]) folders[k] = await drive.folder(parts[i], parent);
      parent = folders[k];
    }
    return parent;
  };
  const save = (caughtUp) => store.set('state', {
    ...state, rootId, folders, cursor, lastRunAt: new Date().toISOString(), lastError: '', caughtUp,
    ...totals, lastMissing: missing.slice(0, 20),
  });

  let documents = 0;
  let files = 0;
  const missing = [];
  // One document: each file uploaded once (recorded as soon as it is up, so a run cut short never
  // uploads it twice), then record.json. Returns false if the time ran out before it was done.
  const backUp = async (d, kept) => {
    const parts = docFolder(d);
    const parent = await folderFor(parts.slice(0, 2));
    const same = kept.parent === parent;
    const entry = { parent, folder: same && kept.folder ? kept.folder : await drive.folder(parts[2], parent), record: same ? kept.record || '' : '', files: { ...(same ? kept.files : {}) } };
    for (const f of filesOf(d)) {
      if (entry.files[key(f.path)]) continue;
      if (timeUp()) { await store.set(`doc/${d.id}`, entry); return false; }
      const [sub, name] = f.name.includes('/') ? f.name.split(/\/(.+)/) : ['', f.name];
      let bytes;
      try { bytes = await source.download(f.path); } catch { missing.push(`${d.controlNo} ${name}`); continue; } // tried again when the document changes
      const into = sub ? await drive.folder(sub, entry.folder) : entry.folder;
      entry.files[key(f.path)] = await drive.upload({ name, parent: into, bytes, type: f.pdf ? 'application/pdf' : 'application/octet-stream' });
      files++; totals.files++;
      await store.set(`doc/${d.id}`, entry);
    }
    const { typeSnapshot, ...record } = d;
    const json = Buffer.from(JSON.stringify({ ...record, type: { code: typeSnapshot?.code, name: typeSnapshot?.name } }, null, 2));
    entry.record = await drive.upload({ name: 'record.json', parent: entry.folder, bytes: json, type: 'application/json', id: entry.record });
    await store.set(`doc/${d.id}`, { ...entry, at: new Date().toISOString() });
    return true;
  };

  let more = true;
  while (more && !timeUp()) {
    const rows = await source.documentsAfter(cursor, 20);
    if (!rows.length) { more = false; break; }
    for (const row of rows) {
      if (timeUp()) break;
      const d = { id: row.id, ...row.data };
      if (isArchived(d)) {
        let done;
        try {
          done = await backUp(d, (await store.get(`doc/${row.id}`)) || { files: {} });
        } catch (err) {
          // Its folder or record.json is gone from Drive (deleted by hand): start it afresh once.
          // Any other failure (Google busy, a network error) stops this run; the next one goes on
          // from this document, without uploading its files again.
          if (err?.status !== 404 && !/not found|404/i.test(err?.message || '')) throw err;
          try { done = await backUp(d, { files: {} }); } catch (e) { missing.push(`${d.controlNo}: ${e.message}`); done = true; }
        }
        if (!done) break; // the next run goes on with this document
        documents++; totals.documents++;
      }
      cursor = { at: row.raw, id: row.id };
      await save(false);
    }
    if (rows.length < 20 && cursor?.id === rows.at(-1).id) more = false;
  }
  await save(!more);
  return { documents, files, caughtUp: !more, missing: missing.length };
}

// Run once with the connected accounts; records a failure in the state.
export async function backupNow({ store, makeSource, makeDrive, budgetMs }) {
  const secret = await store.get('secret');
  if (!secret?.googleRefreshToken) return { skipped: 'Google Drive is not connected.' };
  try {
    const [source, drive] = await Promise.all([makeSource(secret.firebaseRefreshToken), makeDrive(secret.googleRefreshToken)]);
    return await runBackup({ source, drive, store, budgetMs });
  } catch (e) {
    const state = (await store.get('state')) || {};
    await store.set('state', { ...state, lastRunAt: new Date().toISOString(), lastError: String(e.message).slice(0, 300) });
    return { error: e.message };
  }
}
