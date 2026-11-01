// Google Drive through its REST API, as the Google account the Records Officer connected
// (OAuth, scope drive.file: DMS sees only the files and folders it created there).
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  the OAuth client (Netlify environment variables)

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';
export const FOLDER = 'application/vnd.google-apps.folder';

export const driveConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${(process.env.URL || '').replace(/\/$/, '')}/.netlify/functions/drive-auth`;

export function authUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google sign-in: ${j.error_description || j.error || r.status}`);
  return j;
}

// The code Google sends back after consent: the refresh token (kept) and the account's email.
export async function exchangeCode(code) {
  const j = await tokenRequest({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  let email = '';
  try { email = JSON.parse(Buffer.from(j.id_token.split('.')[1], 'base64url').toString()).email || ''; } catch { /* no email */ }
  return { refreshToken: j.refresh_token, email };
}

export async function revoke(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
}

// A Drive client for the connected account. fetchImpl: for tests.
export async function driveClient(refreshToken, fetchImpl = fetch) {
  const { access_token: token } = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  const call = async (url, init = {}) => {
    const r = await fetchImpl(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const e = new Error(`Google Drive: ${j.error?.message || r.status}`);
      e.status = r.status;
      throw e;
    }
    return r;
  };
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return {
    // A folder by name under a parent (found, or created).
    async folder(name, parent) {
      const q = `name='${esc(name)}' and mimeType='${FOLDER}' and trashed=false${parent ? ` and '${parent}' in parents` : ''}`;
      const found = await (await call(`${API}/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`)).json();
      if (found.files?.[0]) return found.files[0].id;
      const made = await (await call(`${API}/files?fields=id`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
      })).json();
      return made.id;
    },
    // Upload a file (resumable: any size); with id, replace that file's content.
    async upload({ name, parent, bytes, type = 'application/octet-stream', id = '' }) {
      const start = await call(`${UPLOAD}/files${id ? `/${id}` : ''}?uploadType=resumable&fields=id`, {
        method: id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': type },
        body: JSON.stringify(id ? {} : { name, parents: [parent] }),
      });
      const session = start.headers.get('location');
      const done = await (await call(session, { method: 'PUT', headers: { 'content-type': type }, body: bytes })).json();
      return done.id;
    },
    // Is it there, and not in the Trash?
    async exists(id) {
      try { return !(await (await call(`${API}/files/${id}?fields=id,trashed`)).json()).trashed; } catch { return false; }
    },
  };
}
