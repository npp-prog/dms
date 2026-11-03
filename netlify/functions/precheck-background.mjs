import { getStore } from '@netlify/blobs';
import { userFromRequest } from '../lib/fb.mjs';
import { takeQuestion } from '../lib/askLimit.mjs';
import { precheckError, readDocument, runPrecheck } from '../lib/precheckRun.mjs';
import { PRECHECK_MODEL, PRECHECK_TYPES, canRunPrecheck } from '../../src/lib/precheck.js';

// The DV pre-audit check (AI), run in the background (it reads every PDF of the DV, which can take a
// minute or more). The browser starts it with the signed-in user's Firebase ID token, then asks
// netlify/functions/precheck.mjs for the result. Results are kept in Netlify Blobs (prechecks/<doc id>),
// shown only to those who may open the document. Daily limit per person: PRECHECK_DAILY_LIMIT
// (default 20). The Anthropic key (ANTHROPIC_API_KEY) never leaves Netlify.
const RUNNING_FOR = 8 * 60 * 1000; // a check still "running" after this is treated as failed

export default async (req) => {
  if (req.method !== 'POST' || !process.env.ANTHROPIC_API_KEY) return;
  const user = await userFromRequest(req);
  // Only the Accounting Office runs it (checked here, not only in the browser).
  if (!user || !canRunPrecheck(user.profile)) return;
  let body;
  try { body = await req.json(); } catch { return; }
  const docId = String(body?.docId || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(docId)) return;
  const store = getStore({ name: 'prechecks', consistency: 'strong' });
  const prev = await store.get(docId, { type: 'json' }).catch(() => null);
  if (prev?.state === 'running' && Date.now() - Date.parse(prev.startedAt) < RUNNING_FOR) return;
  const d = await readDocument(docId, user.token).catch(() => null);
  if (!d || !PRECHECK_TYPES.includes(d.typeCode)) return;

  const base = { by: user.uid, byName: user.profile.displayName || user.profile.email || '', startedAt: new Date().toISOString(), model: PRECHECK_MODEL };
  const limit = Number(process.env.PRECHECK_DAILY_LIMIT) > 0 ? Number(process.env.PRECHECK_DAILY_LIMIT) : 20;
  try {
    const turn = await takeQuestion(getStore({ name: 'precheck-usage', consistency: 'strong' }), user.uid, { limit });
    if (!turn.ok) { await store.setJSON(docId, { ...prev, state: prev?.result ? 'done' : 'error', error: `You have run ${turn.limit} pre-audit checks today, the daily limit. You can run more tomorrow.` }); return; }
  } catch (e) { console.error('precheck limit', e?.message); }

  await store.setJSON(docId, { ...(prev || {}), ...base, state: 'running', error: '' });
  try {
    const out = await runPrecheck(d, user.token);
    await store.setJSON(docId, { ...base, state: 'done', at: new Date().toISOString(), ...out });
    console.log('precheck', docId, out.pages, 'pages', JSON.stringify(out.usage));
  } catch (e) {
    console.error('precheck', docId, e?.status, e?.message);
    await store.setJSON(docId, { ...(prev?.result ? prev : {}), ...base, state: 'error', error: precheckError(e) });
  }
};
