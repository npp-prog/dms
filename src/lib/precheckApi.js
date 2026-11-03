import { auth } from '../firebase.js';

// The DV pre-audit check (netlify/functions/precheck*.mjs), with the signed-in user's ID token.
async function call(name, docId) {
  const token = await auth.currentUser.getIdToken();
  const r = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ docId }),
  });
  return r;
}
// The latest result: { configured, supported, state: 'none'|'running'|'done'|'error', result, … }.
export async function getPrecheck(docId) {
  const r = await call('precheck', docId);
  if (r.status === 404) return { configured: false };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The pre-audit check is not available (${r.status}).`);
  return j;
}
// Starts a check (a background function: it answers at once; the result comes with getPrecheck).
export async function startPrecheck(docId) {
  const r = await call('precheck-background', docId);
  if (!r.ok && r.status !== 202) throw new Error(r.status === 404 ? 'The pre-audit check is not deployed yet.' : `The check could not start (${r.status}).`);
}
