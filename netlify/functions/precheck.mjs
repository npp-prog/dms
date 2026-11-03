import { getStore } from '@netlify/blobs';
import { userFromRequest } from '../lib/fb.mjs';
import { readDocument } from '../lib/precheckRun.mjs';
import { PRECHECK_TYPES, precheckBasis } from '../../src/lib/precheck.js';

// The DV pre-audit check's latest result for a document (POST { docId }), for someone who may open
// that document (read with their own token): { state, result, read, skipped, at, byName, stale }.
// The check itself runs in netlify/functions/precheck-background.mjs.
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!process.env.ANTHROPIC_API_KEY) return json(200, { configured: false });
  const user = await userFromRequest(req);
  if (!user) return json(401, { error: 'Please sign in again.' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request.' }); }
  const docId = String(body?.docId || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(docId)) return json(400, { error: 'Bad request.' });
  const d = await readDocument(docId, user.token).catch(() => null);
  if (!d) return json(403, { error: 'You may not open this document.' });
  if (!PRECHECK_TYPES.includes(d.typeCode)) return json(200, { configured: true, supported: false });
  const r = await getStore({ name: 'prechecks', consistency: 'strong' }).get(docId, { type: 'json' }).catch(() => null);
  const running = r?.state === 'running' && Date.now() - Date.parse(r.startedAt) < 8 * 60 * 1000;
  return json(200, {
    configured: true, supported: true,
    state: running ? 'running' : r?.state === 'running' ? 'error' : r?.state || 'none',
    error: r?.state === 'running' && !running ? 'The check did not finish. Please run it again.' : r?.error || '',
    result: r?.result || null, read: r?.read || [], skipped: r?.skipped || [], pages: r?.pages || 0,
    at: r?.at || '', byName: r?.byName || '', model: r?.model || '',
    stale: Boolean(r?.result) && r.basis !== precheckBasis(d),
  });
};
