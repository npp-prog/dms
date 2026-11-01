import { createRemoteJWKSet, jwtVerify } from 'jose';
import { firebaseConfig } from '../../src/firebase-config.js';

// Firebase through its REST APIs, as a DMS user (their ID token): firestore.rules and
// storage.rules decide, as in the app. No service account is needed.

const PROJECT = firebaseConfig.projectId;
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const FS = `https://firestore.googleapis.com/v1/${ROOT}`;
const KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

// Firestore values → plain values (timestamps as ISO text).
export function fromValue(v = {}) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('mapValue' in v) return fromFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
export const fromFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));

// A signed-in user from the Authorization header (Firebase ID token), with their profile.
export async function userFromRequest(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, KEYS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT });
    const r = await fetch(`${FS}/users/${payload.sub}`, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const p = fromFields((await r.json()).fields);
    return p.active ? { uid: payload.sub, token, profile: p } : null;
  } catch {
    return null;
  }
}
export const keepsArchive = (p) => ['admin', 'superadmin', 'itadmin', 'records'].includes(p?.role) || (p?.positions || []).includes('Records Officer');

// Acting as a user from their Firebase refresh token (kept server-side): reads documents and files.
export async function firebaseAs(refreshToken, fetchImpl = fetch) {
  const r = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${firebaseConfig.apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`DMS sign-in of the Records Officer failed (${j.error?.message || r.status}): connect Google Drive again.`);
  const auth = { authorization: `Bearer ${j.id_token}` };
  return {
    uid: j.user_id,
    // Documents in the order they last changed, after a cursor ({ at, id }).
    async documentsAfter(cursor, limit = 20) {
      const structuredQuery = {
        from: [{ collectionId: 'documents' }],
        orderBy: [{ field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit,
        ...(cursor ? { startAt: { values: [{ timestampValue: cursor.at }, { referenceValue: `${ROOT}/documents/${cursor.id}` }], before: false } } : {}),
      };
      const q = await fetchImpl(`${FS}:runQuery`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ structuredQuery }) });
      const rows = await q.json().catch(() => []);
      if (!q.ok) throw new Error(`Reading the archive: ${rows?.[0]?.error?.message || rows?.error?.message || q.status}`);
      return rows.filter((x) => x.document).map((x) => ({
        id: x.document.name.split('/').pop(), raw: x.document.fields?.updatedAt?.timestampValue || '1970-01-01T00:00:00Z', data: fromFields(x.document.fields),
      }));
    },
    async download(path) {
      const f = await fetchImpl(`https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}?alt=media`, { headers: auth });
      if (!f.ok) throw new Error(`file ${path}: ${f.status}`);
      return Buffer.from(await f.arrayBuffer());
    },
  };
}
