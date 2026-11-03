import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { runPrecheck } from './precheckRun.mjs';

const pdf = async (pages) => { const p = await PDFDocument.create(); for (let i = 0; i < pages; i++) p.addPage(); return Buffer.from(await p.save()); };

test('the pre-audit run: reads what the user may read, within the limits, and asks Claude once', async () => {
  const files = { 'documents/d/1-signed.pdf': await pdf(1), 'documents/d/attachments/b/inv.pdf': await pdf(2), 'documents/o/0-generated.pdf': await pdf(1), 'documents/d/attachments/big.pdf': await pdf(90) };
  const docs = { obr1: { pdf: { mapValue: { fields: { files: { arrayValue: { values: [{ mapValue: { fields: { path: { stringValue: 'documents/o/0-generated.pdf' } } } }] } } } } } } };
  const fetchImpl = async (url, opts) => {
    assert.equal(opts.headers.authorization, 'Bearer TOKEN'); // always as the user
    const m = url.match(/\/o\/([^?]+)\?alt=media/);
    if (m) { const b = files[decodeURIComponent(m[1])]; return b ? new Response(b) : new Response('', { status: 403 }); }
    const id = url.split('/').pop();
    if (id === 'secret') return new Response('', { status: 403 });
    return docs[id] ? new Response(JSON.stringify({ fields: docs[id] })) : new Response('', { status: 404 });
  };
  let sent;
  const client = { beta: { messages: { stream: (params) => { sent = params; return { finalMessage: async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 9000, output_tokens: 400 }, content: [{ type: 'text', text: '{"summary":"One issue.","verdict":"issues","findings":[{"severity":"high","area":"OBR","finding":"OBR amount differs","where":"OBR p.1","evidence":"14,000.00"}]}' }] }) }; } } } };
  const d = {
    controlNo: 'DMS-1', typeCode: 'DV', data: { payee: 'ACME' }, pdf: { files: [{ path: 'documents/d/1-signed.pdf' }] },
    transaction: { items: [{ id: 'a', label: 'OBR' }, { id: 'b', label: 'Invoice' }, { id: 'c', label: 'Certificate' }] }, checklist: { a: 'Y', b: 'Y', c: 'Y' },
    links: { a: [{ kind: 'fts', id: 'obr1', controlNo: 'DMS-2', typeCode: 'OBR' }], b: [{ kind: 'file', path: 'documents/d/attachments/b/inv.pdf' }], c: [{ kind: 'fts', id: 'secret', controlNo: 'DMS-9' }, { kind: 'file', path: 'documents/d/attachments/big.pdf' }] },
  };
  const out = await runPrecheck(d, 'TOKEN', { client, fetchImpl });
  assert.equal(out.result.findings[0].area, 'OBR');
  assert.deepEqual(out.read.map((f) => f.pages), [1, 1, 2]);
  assert.equal(out.pages, 4);
  assert.deepEqual(out.skipped.map((f) => f.why), ['no access', 'too many pages in all']);
  // the request: the model, the brief, then a label and a PDF for each file read
  assert.equal(sent.model, 'claude-sonnet-5-5');
  const docsSent = sent.messages[0].content.filter((c) => c.type === 'document');
  assert.equal(docsSent.length, 3);
  assert.equal(docsSent[0].source.media_type, 'application/pdf');
  assert.match(sent.messages[0].content[0].text, /Not given .*no access/);
});

test('the pre-audit run: nothing readable is an error, not a call to Claude', async () => {
  const fetchImpl = async () => new Response('', { status: 403 });
  await assert.rejects(runPrecheck({ typeCode: 'DV', pdf: { files: [{ path: 'x.pdf' }] } }, 'T', { client: { beta: { messages: { stream: () => { throw new Error('should not be called'); } } } }, fetchImpl }), /No PDF of this DV could be read/);
});
