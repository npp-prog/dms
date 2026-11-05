import { PDFDocument } from 'pdf-lib';
import { firebaseConfig } from '../../src/firebase-config.js';
import { fromFields } from './fb.mjs';
import { PRECHECK_LIMITS, PRECHECK_MODEL, PRECHECK_SYSTEM, parsePrecheck, precheckBasis, precheckBrief, precheckFiles } from '../../src/lib/precheck.js';

// The DV pre-audit check, as the signed-in user (their Firebase ID token): it reads only what they
// may read (firestore.rules and storage.rules decide, as in the app), then asks OpenAI (Responses API:
// the DV's details and its PDFs; OPENAI_API_KEY, model OPENAI_MODEL or PRECHECK_MODEL).
const OPENAI_URL = 'https://api.openai.com/v1/responses';
export const precheckModel = () => process.env.OPENAI_MODEL || PRECHECK_MODEL;

// An error of the OpenAI API: its HTTP status, type and code, for precheckError.
class OpenAIError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `OpenAI error ${status}`);
    this.status = status;
    this.type = body?.error?.type || '';
    this.code = body?.error?.code || '';
  }
}
const FS = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

export async function readDocument(id, token, fetchImpl = fetch) {
  const r = await fetchImpl(`${FS}/documents/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 403 || r.status === 404) return null;
  if (!r.ok) throw new Error(`Reading the document failed (${r.status}).`);
  return { id, ...fromFields((await r.json()).fields) };
}
async function download(path, token, fetchImpl = fetch) {
  const r = await fetchImpl(`https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}?alt=media`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(r.status === 403 ? 'no access' : `not readable (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

// Gathers the PDFs within the limits, asks OpenAI, returns { result, read, skipped, basis }.
// (fetchImpl: a stand-in in tests, for Firebase and OpenAI alike.)
export async function runPrecheck(d, token, { fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY, model = precheckModel() } = {}) {
  const read = [];
  const skipped = [];
  let pages = 0;
  let bytes = 0;
  for (const f of precheckFiles(d)) {
    if (read.length >= PRECHECK_LIMITS.files) { skipped.push({ label: f.label, why: 'too many files' }); continue; }
    try {
      let path = f.path;
      if (f.docId) {
        const linked = await readDocument(f.docId, token, fetchImpl);
        path = (linked?.pdf?.files || []).at(-1)?.path;
        if (!path) throw new Error(linked ? 'no PDF yet' : 'no access');
      }
      const data = await download(path, token, fetchImpl);
      let n = 1;
      try { n = (await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); } catch { throw new Error('not a readable PDF'); }
      if (pages + n > PRECHECK_LIMITS.pages || bytes + data.length > PRECHECK_LIMITS.bytes) { skipped.push({ label: f.label, why: 'too many pages in all' }); continue; }
      pages += n; bytes += data.length;
      read.push({ label: f.label, pages: n, data });
    } catch (e) {
      skipped.push({ label: f.label, why: e.message });
    }
  }
  if (!read.length) throw new Error('No PDF of this DV could be read: convert it to PDF first.');

  const content = [{ type: 'input_text', text: precheckBrief(d, read, skipped) }];
  read.forEach((f, i) => {
    content.push({ type: 'input_text', text: `PDF ${i + 1} of ${read.length}: ${f.label} (${f.pages} page${f.pages === 1 ? '' : 's'})` });
    content.push({ type: 'input_file', filename: `pdf-${i + 1}.pdf`, file_data: `data:application/pdf;base64,${f.data.toString('base64')}` });
  });
  content.push({ type: 'input_text', text: 'Pre-audit this DV now. Answer with the JSON only.' });

  const r = await fetchImpl(OPENAI_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      instructions: PRECHECK_SYSTEM,
      input: [{ role: 'user', content }],
      max_output_tokens: 16000,
      text: { format: { type: 'json_object' } },
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const final = await r.json().catch(() => ({}));
  if (!r.ok) throw new OpenAIError(r.status, final);
  const parts = (final.output || []).filter((o) => o.type === 'message').flatMap((o) => o.content || []);
  if (parts.some((c) => c.type === 'refusal')) throw new Error('The check declined to answer for this document.');
  const text = parts.filter((c) => c.type === 'output_text').map((c) => c.text).join('');
  if (final.status === 'incomplete' && !text) throw new Error('The check stopped before answering (too long). Please try again.');
  return {
    result: parsePrecheck(text),
    read: read.map((f) => ({ label: f.label, pages: f.pages })),
    skipped,
    pages,
    basis: precheckBasis(d),
    usage: { input: final.usage?.input_tokens || 0, output: final.usage?.output_tokens || 0 },
    model,
  };
}

// What went wrong, for the person (never the key).
export function precheckError(e) {
  const detail = String(e?.message || '').replace(/sk-[\w-]+/g, '[key]').slice(0, 300);
  if (e instanceof OpenAIError) {
    if (e.status === 401) return 'The OpenAI API key in Netlify (OPENAI_API_KEY) was not accepted: an administrator must check it.';
    if (e.code === 'insufficient_quota') return 'The OpenAI account has no credit left (or reached its budget): an administrator must add credit or raise the limit.';
    if (e.status === 429) return 'The AI service is busy. Please try again in a minute.';
    if (e.code === 'model_not_found' || e.status === 404) return `The OpenAI model "${precheckModel()}" is not available to this key: an administrator sets OPENAI_MODEL in Netlify to one it may use.`;
    return `The AI service could not check it (error ${e.status}): ${detail}`;
  }
  if (e?.name === 'TimeoutError') return 'The AI service took too long. Please try again.';
  return detail || 'The check could not finish. Please try again.';
}
