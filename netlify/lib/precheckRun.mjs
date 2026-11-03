import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { firebaseConfig } from '../../src/firebase-config.js';
import { fromFields } from './fb.mjs';
import { PRECHECK_LIMITS, PRECHECK_MODEL, PRECHECK_SYSTEM, parsePrecheck, precheckBasis, precheckBrief, precheckFiles } from '../../src/lib/precheck.js';

// The DV pre-audit check, as the signed-in user (their Firebase ID token): it reads only what they
// may read (firestore.rules and storage.rules decide, as in the app), then asks Claude.
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

// Gathers the PDFs within the limits, asks Claude, returns { result, read, skipped, basis }.
// (client, fetchImpl: stand-ins in tests.)
export async function runPrecheck(d, token, { client = null, fetchImpl = fetch } = {}) {
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

  const content = [{ type: 'text', text: precheckBrief(d, read, skipped) }];
  read.forEach((f, i) => {
    content.push({ type: 'text', text: `PDF ${i + 1} of ${read.length}: ${f.label} (${f.pages} page${f.pages === 1 ? '' : 's'})` });
    content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data.toString('base64') } });
  });
  content.push({ type: 'text', text: 'Pre-audit this DV now. Answer with the JSON only.' });

  const final = await (client || new Anthropic()).beta.messages.stream({
    model: PRECHECK_MODEL,
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    system: PRECHECK_SYSTEM,
    messages: [{ role: 'user', content }],
  }).finalMessage();
  if (final.stop_reason === 'refusal') throw new Error('The check declined to answer for this document.');
  const text = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return {
    result: parsePrecheck(text),
    read: read.map((f) => ({ label: f.label, pages: f.pages })),
    skipped,
    pages,
    basis: precheckBasis(d),
    usage: { input: final.usage?.input_tokens || 0, output: final.usage?.output_tokens || 0 },
  };
}

// What went wrong, for the person (never the key).
export function precheckError(e) {
  const detail = String(e?.error?.error?.message || e?.message || '').replace(/sk-ant-[\w-]+/g, '[key]').slice(0, 300);
  if (e instanceof Anthropic.AuthenticationError) return 'The Anthropic API key in Netlify (ANTHROPIC_API_KEY) was not accepted: an administrator must check it.';
  if (e instanceof Anthropic.RateLimitError) return 'The AI service is busy. Please try again in a minute.';
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(detail)) return 'The Anthropic account has no credits left: an administrator must add credits.';
  if (/identity verification/i.test(detail)) return 'Anthropic asks the owner of the API key\'s account to verify their identity first: an administrator signs in at console.anthropic.com and completes the identity verification it asks for, then runs the check again.';
  if (e instanceof Anthropic.APIError) return `The AI service could not check it (error ${e.status}): ${detail}`;
  return detail || 'The check could not finish. Please try again.';
}
