import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackup } from '../../netlify/lib/driveBackup.mjs';
import { accountStore, listAccounts } from '../../netlify/lib/store.mjs';

// A fake Drive and a fake archive: what the automatic Google Drive backup uploads, and when.
function fakes(docs) {
  const items = new Map(); let n = 0; const log = [];
  const drive = {
    async folder(name, parent) { for (const [id, it] of items) if (it.folder && it.name === name && it.parent === (parent || '')) return id; const id = `f${++n}`; items.set(id, { name, parent: parent || '', folder: true }); return id; },
    async upload({ name, parent, id }) { if (id) { log.push(`replace ${items.get(id).name}`); return id; } const nid = `u${++n}`; items.set(nid, { name, parent }); log.push(`new ${name}`); return nid; },
    async exists(id) { return items.has(id); },
  };
  const source = {
    async documentsAfter(cursor, limit) {
      const sorted = [...docs].sort((a, b) => a.raw.localeCompare(b.raw) || a.id.localeCompare(b.id));
      const from = cursor ? sorted.findIndex((d) => d.raw > cursor.at || (d.raw === cursor.at && d.id > cursor.id)) : 0;
      return from < 0 ? [] : sorted.slice(from, from + limit);
    },
    async download(path) { if (path.includes('missing')) throw new Error('404'); return Buffer.from(path); },
  };
  const blobs = new Map();
  const store = { get: async (k) => blobs.get(k) ?? null, set: async (k, v) => { blobs.set(k, v); } };
  const pathOf = (id) => { const p = []; let it = items.get(id); while (it) { p.unshift(it.name); it = items.get(it.parent); } return p.join('/'); };
  const files = () => [...items.keys()].filter((k) => !items.get(k).folder).map(pathOf).sort();
  return { drive, source, store, log, files };
}

test('automatic Google Drive backup: each processed document once, then only what changed', async () => {
  const done = { controlNo: 'DMS-2026-000123', typeCode: 'DV', title: 'NEIL PRIOLO', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-10-30T01:00:00Z' }] },
    pdf: { files: [{ path: 'documents/a/0-generated.pdf', kind: 'generated' }, { path: 'documents/a/1-signed.pdf', kind: 'signed' }] },
    links: { x: [{ kind: 'file', path: 'documents/a/attachments/x/or.pdf', name: 'Official receipt.pdf' }] } };
  const docs = [
    { id: 'a', raw: '2026-10-30T01:00:00Z', data: done },
    { id: 'b', raw: '2026-10-30T02:00:00Z', data: { controlNo: 'DMS-2026-000124', status: 'draft' } },
  ];
  const f = fakes(docs);
  assert.deepEqual(await f.source.documentsAfter(null, 20).then((r) => r.length), 2);
  let r = await runBackup({ ...f });
  assert.deepEqual(r, { documents: 1, files: 2, caughtUp: true, missing: 0 }, 'the final PDF only (not its earlier versions) and its attachment');
  assert.deepEqual(f.files(), [
    'DMS Archive/2026/DV/DMS-2026-000123 NEIL PRIOLO/DV DMS-2026-000123.pdf',
    'DMS Archive/2026/DV/DMS-2026-000123 NEIL PRIOLO/attachments/Official receipt.pdf',
    'DMS Archive/2026/DV/DMS-2026-000123 NEIL PRIOLO/record.json',
  ]);
  f.log.length = 0;
  r = await runBackup({ ...f });
  assert.deepEqual(r, { documents: 0, files: 0, caughtUp: true, missing: 0 }, 'nothing changed: nothing uploaded');
  // Filed in the archive (the document changes): only its record is replaced.
  docs[0] = { ...docs[0], raw: '2026-10-30T03:00:00Z', data: { ...done, archive: { location: 'Cabinet 2' } } };
  r = await runBackup({ ...f });
  assert.deepEqual(f.log, ['replace record.json']);
  // A file that cannot be read is left for later; the rest goes on.
  docs.push({ id: 'c', raw: '2026-10-30T04:00:00Z', data: { ...done, controlNo: 'DMS-2026-000125', pdf: { files: [{ path: 'documents/c/missing.pdf', kind: 'generated' }] }, links: {} } });
  r = await runBackup({ ...f });
  assert.equal(r.missing, 1);
  assert.equal(r.documents, 1);
});

test('a run stops when its time is up and the next one goes on from there', async () => {
  const docs = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, raw: `2026-10-30T0${i}:00:00Z`,
    data: { controlNo: `DMS-${i}`, typeCode: 'DV', title: 'X', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-10-30' }] } } }));
  const f = fakes(docs);
  let t = 0;
  const r1 = await runBackup({ ...f, budgetMs: 3, now: () => t++ });
  assert.equal(r1.caughtUp, false);
  const r2 = await runBackup({ ...f });
  assert.equal(r1.documents + r2.documents, 5);
  assert.equal(r2.caughtUp, true);
});

test('a document folder deleted in Drive, or the whole DMS Archive folder, is backed up again', async () => {
  const d = { controlNo: 'DMS-1', typeCode: 'DV', title: 'X', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-10-30T01:00:00Z' }] }, pdf: { files: [{ path: 'p/a.pdf', kind: 'generated' }] } };
  const docs = [{ id: 'a', raw: '2026-10-30T01:00:00Z', data: d }, { id: 'b', raw: '2026-10-30T02:00:00Z', data: { ...d, controlNo: 'DMS-2' } }];
  const f = fakes(docs);
  await runBackup({ ...f });
  // DMS-1's record.json is deleted in Drive, then DMS-1 changes: the run does not stop on it.
  const realUpload = f.drive.upload;
  const { record } = await f.store.get('doc/a');
  f.drive.upload = async (x) => { if (x.id === record) throw new Error('Google Drive: File not found'); return realUpload(x); };
  docs[0] = { ...docs[0], raw: '2026-10-30T03:00:00Z' };
  f.log.length = 0;
  const r = await runBackup({ ...f });
  assert.equal(r.documents, 1);
  assert.deepEqual(f.log, ['new DV DMS-1.pdf', 'new record.json'], 'started afresh');
  // The whole DMS Archive folder is deleted: everything is backed up again.
  f.drive.exists = async () => false;
  const all = await runBackup({ ...f });
  assert.equal(all.documents, 2);
});

test('the time running out inside a document never uploads a file twice', async () => {
  const d = { controlNo: 'DMS-9', typeCode: 'DV', title: 'BIG', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-10-30T01:00:00Z' }] },
    supplements: [1, 2, 3, 4].map((i) => ({ path: `p/${i}.pdf`, label: `Letter ${i}` })) };
  const f = fakes([{ id: 'big', raw: '2026-10-30T01:00:00Z', data: d }]);
  let t = 0;
  const r1 = await runBackup({ ...f, budgetMs: 4, now: () => t++ });
  assert.equal(r1.caughtUp, false);
  await runBackup({ ...f });
  assert.equal(f.log.filter((x) => x.startsWith('new Letter')).length, 4, 'each file once');
});

test('several Google accounts: each connection backs up on its own', async () => {
  const blobs = new Map();
  const base = { get: async (k) => blobs.get(k) ?? null, set: async (k, v) => { blobs.set(k, v); }, delete: async (k) => { blobs.delete(k); },
    keys: async (prefix) => [...blobs.keys()].filter((k) => k.startsWith(prefix)) };
  const done = { controlNo: 'DMS-2026-000200', typeCode: 'DV', title: 'X', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-10-30T01:00:00Z' }] },
    pdf: { files: [{ path: 'documents/z/0-generated.pdf', kind: 'generated' }] } };
  const docs = [{ id: 'z', raw: '2026-10-30T01:00:00Z', data: done }];
  const one = fakes(docs); const two = fakes(docs);
  const a = accountStore(base, 'uidRecords'); const b = accountStore(base, 'uidAdmin');
  await a.set('secret', { googleRefreshToken: 't1', email: 'records@example.org' });
  await b.set('secret', { googleRefreshToken: 't2', email: 'admin@example.org' });
  await runBackup({ source: one.source, drive: one.drive, store: a });
  assert.equal(one.files().length, 2);
  // The second account is not backed up yet: it has its own record of what is done.
  assert.equal((await b.get('state')), null);
  await runBackup({ source: two.source, drive: two.drive, store: b });
  assert.deepEqual(two.files(), one.files());
  const list = await listAccounts(base);
  assert.deepEqual(list.map((x) => x.secret.email).sort(), ['admin@example.org', 'records@example.org']);
  await a.clearAll();
  assert.deepEqual((await listAccounts(base)).map((x) => x.uid), ['uidAdmin']);
  assert.ok((await b.get('state')).documents === 1);
});

test('a backup keeps the final PDF only, and the supporting documents', async () => {
  const { filesOf, finalPdf } = await import('./archiveFiles.js');
  const d = { typeCode: 'DV', controlNo: 'DMS-2026-000001', pdf: { files: [{ path: 'v0', kind: 'generated' }, { path: 'v1', kind: 'stamped' }, { path: 'v2', kind: 'signed' }, { path: 'v3', kind: 'restored', restores: 0 }, { path: 'v4', kind: 'signed' }] },
    links: { a: [{ kind: 'file', path: 'att.pdf', name: 'OR.pdf' }, { kind: 'fts', id: 'x' }] }, stepFiles: [{ path: 'box-e.pdf', label: 'Box E', name: 'dv.pdf' }], supplements: [{ path: 'sup.pdf', label: 'Letter' }] };
  assert.equal(finalPdf(d).path, 'v4');
  assert.equal(finalPdf({ pdf: { files: [{ path: 'v0', kind: 'generated' }, { path: 'v1', kind: 'stamped' }, { path: 'v2', kind: 'restored', restores: 0 }] } }).path, 'v0', 'withdrawn versions are not final');
  assert.deepEqual(filesOf(d).map((f) => f.path), ['v4', 'att.pdf', 'box-e.pdf', 'sup.pdf']);
  assert.deepEqual(filesOf({ controlNo: 'X' }), []);
});
