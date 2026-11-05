import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { runPrecheck } from './precheckRun.mjs';

const pdf = async (pages) => { const p = await PDFDocument.create(); for (let i = 0; i < pages; i++) p.addPage(); return Buffer.from(await p.save()); };

test('the pre-audit run: reads what the user may read, within the limits, and asks OpenAI once', async () => {
  const files = { 'documents/d/1-signed.pdf': await pdf(1), 'documents/d/attachments/b/inv.pdf': await pdf(2), 'documents/o/0-generated.pdf': await pdf(1), 'documents/d/attachments/big.pdf': await pdf(90) };
  const docs = { obr1: { pdf: { mapValue: { fields: { files: { arrayValue: { values: [{ mapValue: { fields: { path: { stringValue: 'documents/o/0-generated.pdf' } } } }] } } } } } } };
  let sent;
  const answer = { status: 'completed', usage: { input_tokens: 9000, output_tokens: 400 }, output: [{ type: 'message', content: [{ type: 'output_text', text: '{"summary":"One issue.","verdict":"issues","findings":[{"severity":"high","area":"OBR","finding":"OBR amount differs","where":"OBR p.1","evidence":"14,000.00"}]}' }] }] };
  const fetchImpl = async (url, opts) => {
    if (url === 'https://api.openai.com/v1/responses') {
      assert.equal(opts.headers.authorization, 'Bearer KEY'); // the OpenAI key (never the user's token)
      sent = JSON.parse(opts.body);
      return new Response(JSON.stringify(answer));
    }
    assert.equal(opts.headers.authorization, 'Bearer TOKEN'); // always as the user
    const m = url.match(/\/o\/([^?]+)\?alt=media/);
    if (m) { const b = files[decodeURIComponent(m[1])]; return b ? new Response(b) : new Response('', { status: 403 }); }
    const id = url.split('/').pop();
    if (id === 'secret') return new Response('', { status: 403 });
    return docs[id] ? new Response(JSON.stringify({ fields: docs[id] })) : new Response('', { status: 404 });
  };
  const d = {
    controlNo: 'DMS-1', typeCode: 'DV', data: { payee: 'ACME' }, pdf: { files: [{ path: 'documents/d/1-signed.pdf' }] },
    transaction: { items: [{ id: 'a', label: 'OBR' }, { id: 'b', label: 'Invoice' }, { id: 'c', label: 'Certificate' }] }, checklist: { a: 'Y', b: 'Y', c: 'Y' },
    links: { a: [{ kind: 'fts', id: 'obr1', controlNo: 'DMS-2', typeCode: 'OBR' }], b: [{ kind: 'file', path: 'documents/d/attachments/b/inv.pdf' }], c: [{ kind: 'fts', id: 'secret', controlNo: 'DMS-9' }, { kind: 'file', path: 'documents/d/attachments/big.pdf' }] },
  };
  const out = await runPrecheck(d, 'TOKEN', { fetchImpl, apiKey: 'KEY', model: 'gpt-4.1' });
  assert.equal(out.result.findings[0].area, 'OBR');
  assert.deepEqual(out.read.map((f) => f.pages), [1, 1, 2]);
  assert.equal(out.pages, 4);
  assert.deepEqual(out.skipped.map((f) => f.why), ['no access', 'too many pages in all']);
  // the request: the model, the instructions, the brief, then a label and a PDF for each file read; JSON
  assert.equal(sent.model, 'gpt-4.1');
  assert.match(sent.instructions, /pre-audit of Disbursement Vouchers/);
  assert.deepEqual(sent.text, { format: { type: 'json_object' } });
  const content = sent.input[0].content;
  const pdfs = content.filter((c) => c.type === 'input_file');
  assert.equal(pdfs.length, 3);
  assert.match(pdfs[0].file_data, /^data:application\/pdf;base64,/);
  assert.match(content[0].text, /Not given .*no access/);
  assert.equal(out.usage.input, 9000);
});

test('the pre-audit run: nothing readable is an error, not a call to Claude', async () => {
  const fetchImpl = async () => new Response('', { status: 403 });
  await assert.rejects(runPrecheck({ typeCode: 'DV', pdf: { files: [{ path: 'x.pdf' }] } }, 'T', { fetchImpl, apiKey: 'KEY' }), /No PDF of this DV could be read/);
});

test('the pre-audit run: OpenAI errors read plainly, never with the key', async () => {
  const { precheckError } = await import('./precheckRun.mjs');
  const files = { 'a.pdf': await pdf(1) };
  const run = (status, error) => runPrecheck({ typeCode: 'DV', pdf: { files: [{ path: 'a.pdf' }] } }, 'T', { apiKey: 'KEY', fetchImpl: async (url) => (url.includes('openai')
    ? new Response(JSON.stringify({ error }), { status }) : new Response(files[decodeURIComponent(url.match(/\/o\/([^?]+)/)[1])])) }).catch(precheckError);
  assert.match(await run(401, { message: 'Incorrect API key provided: sk-abc123', type: 'invalid_request_error', code: 'invalid_api_key' }), /OPENAI_API_KEY\) was not accepted/);
  assert.match(await run(429, { message: 'You exceeded your current quota', code: 'insufficient_quota' }), /no credit left/);
  assert.match(await run(429, { message: 'Rate limit reached' }), /busy/);
  assert.doesNotMatch(await run(400, { message: 'bad sk-proj-SECRET request' }), /SECRET/);
});
