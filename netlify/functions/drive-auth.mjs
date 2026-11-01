import { randomBytes } from 'node:crypto';
import { keepsArchive, userFromRequest } from '../lib/fb.mjs';
import { authUrl, driveConfigured, exchangeCode, revoke } from '../lib/drive.mjs';
import { accountStore, backupStore, listAccounts } from '../lib/store.mjs';

// Connecting Google accounts the Archive is backed up to (Archive → Google Drive). Each Records
// Officer or administrator may connect their own; each Drive gets its own full copy. The backup
// reads the archive as the one who connected it (their DMS sign-in, kept with the Google access in
// Netlify's private storage), so no service account key is needed.
//   POST { action: 'start', firebaseRefreshToken } → { url }: Google's consent page
//   GET  ?code&state                                ← Google, after consent; back to /archive
//   POST { action: 'disconnect', uid? }             forgets a connection (its files stay in its
//                                                   Drive): one's own; an Admin or the superadmin, anyone's
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const back = (result, reason = '') => new Response(null, { status: 302, headers: { location: `/archive?drive=${result}${reason ? `&reason=${encodeURIComponent(reason.slice(0, 200))}` : ''}` } });
// Disconnects someone else's Google Drive: the Admin and the superadmin only (not IT Admin or the
// Records Officer, who disconnect their own).
const isAdmin = (p) => ['admin', 'superadmin'].includes(p?.role);

export default async (req) => {
  if (!driveConfigured()) {
    return req.method === 'GET' ? back('not-set-up') : json(503, { error: 'The Google Drive backup is not set up in Netlify yet (see the README).' });
  }
  const base = backupStore();
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const key = `pending/${(url.searchParams.get('state') || '').replace(/[^a-f0-9]/g, '')}`;
    const pending = await base.get(key);
    if (!pending || Date.now() > pending.exp) return back('expired');
    await base.delete(key);
    if (url.searchParams.get('error')) return back('cancelled');
    try {
      const { refreshToken, email } = await exchangeCode(url.searchParams.get('code') || '');
      if (!refreshToken) return back('no-token');
      // The same Google account twice would fill one Drive with two copies.
      if ((await listAccounts(base)).some((a) => a.uid !== pending.uid && a.secret.email === email)) {
        await revoke(refreshToken).catch(() => {});
        return back('taken');
      }
      const store = accountStore(base, pending.uid);
      await store.set('secret', { googleRefreshToken: refreshToken, firebaseRefreshToken: pending.firebaseRefreshToken, email, by: pending.name, uid: pending.uid, at: new Date().toISOString() });
      // Another Google account than this person backed up to so far: back everything up afresh.
      const state = (await store.get('state')) || {};
      if ((state.email || '') !== email) {
        await store.clearDocs();
        await store.set('state', { email });
      }
      return back('connected');
    } catch (e) {
      // Google's reason (e.g. invalid_client: the client ID and secret in Netlify do not match).
      return back('failed', e.message);
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  const me = await userFromRequest(req);
  if (!me || !keepsArchive(me.profile)) return json(403, { error: 'Only the Records Officer or an administrator can do this.' });
  const body = await req.json().catch(() => ({}));
  if (body.action === 'start') {
    if (!body.firebaseRefreshToken) return json(400, { error: 'Sign in to DMS again, then connect.' });
    const state = randomBytes(24).toString('hex');
    await base.set(`pending/${state}`, { uid: me.uid, name: me.profile.displayName || me.profile.email || '', firebaseRefreshToken: body.firebaseRefreshToken, exp: Date.now() + 10 * 60e3 });
    return json(200, { url: authUrl(state) });
  }
  if (body.action === 'disconnect') {
    const uid = body.uid || me.uid;
    if (uid !== me.uid && !isAdmin(me.profile)) return json(403, { error: 'Only an Admin or the superadmin can disconnect someone else\'s Google Drive.' });
    const store = accountStore(base, uid);
    const secret = await store.get('secret');
    if (secret?.googleRefreshToken) await revoke(secret.googleRefreshToken);
    await store.clearAll();
    return json(200, { ok: true });
  }
  return json(400, { error: 'Unknown action.' });
};
