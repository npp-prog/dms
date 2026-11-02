import { importPKCS8, SignJWT } from 'jose';

// A Google service account for trusted server work (the scheduled reminder sender), set by an
// administrator in Netlify (Site configuration → Environment variables), never in the code:
//   GOOGLE_SA_EMAIL        the service account's email (…@….iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY  its private key (the "private_key" of the JSON key file, with its
//                          -----BEGIN PRIVATE KEY----- lines; "\n" written as text is accepted)
// Give the account only the "Cloud Datastore User" role (Firestore read and write), nothing more.
export function serviceAccount() {
  const email = process.env.GOOGLE_SA_EMAIL || '';
  const key = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email) || !key.includes('PRIVATE KEY')) return null;
  return { email, key };
}

// An OAuth access token for the account (one hour), for the Firestore REST API.
export async function serviceToken({ email, key }, scope = 'https://www.googleapis.com/auth/datastore') {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(email).setSubject(email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(await importPKCS8(key, 'RS256'));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new Error(`Google refused the service account: ${body.error_description || body.error || r.status}`);
  return body.access_token;
}
