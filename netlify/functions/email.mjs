import { getStore } from '@netlify/blobs';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { firebaseConfig } from '../../src/firebase-config.js';
import { mailConfigured, sendGroups } from '../lib/mailer.mjs';

// Emails DMS notifications (users/{uid}/notifications). The browser that just wrote them sends
// their ids with the signed-in user's Firebase ID token; this function reads each one with that
// token (firestore.rules let only the recipient and its sender read it), checks it was sent by
// that user, looks up the recipient's email in the directory, and sends it. So nobody can email
// anything but the DMS notifications they sent, and only to DMS users.
//
// The mailbox it sends from is set in Netlify (Site configuration → Environment variables):
//   SMTP_USER   the address, e.g. the office's Gmail address
//   SMTP_PASS   its password (for Gmail: an App Password, not the account password)
//   SMTP_HOST   optional, default smtp.gmail.com; SMTP_PORT optional, default 465
//   EMAIL_FROM  optional, default "DMS <SMTP_USER>"
// Without them nothing is emailed (notifications still show in DMS).

const PROJECT = firebaseConfig.projectId;
const KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const MAX = 500;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const str = (f, k) => f?.[k]?.stringValue || '';

async function read(path, token) {
  const r = await fetch(`${BASE}/${path}`, { headers: { authorization: `Bearer ${token}` } });
  return r.ok ? (await r.json()).fields || {} : null;
}


export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!mailConfigured()) return json(200, { sent: 0, reason: 'Email is not set up (SMTP_USER and SMTP_PASS in Netlify).' });
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let uid;
  try {
    uid = (await jwtVerify(token, KEYS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT })).payload.sub;
  } catch {
    return json(401, { error: 'Please sign in again.' });
  }
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request.' }); }
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, MAX)
    .filter((x) => /^[A-Za-z0-9]{10,40}$/.test(x?.to || '') && /^[A-Za-z0-9]{10,40}$/.test(x?.id || ''));

  // Each notification, as stored, sent by this user; grouped by text so a circular to many
  // offices goes out as one email (Bcc). Each is emailed once only (ids kept in Netlify Blobs).
  const sentStore = getStore('email-sent');
  const groups = new Map();
  const sending = [];
  await Promise.all(items.map(async ({ to, id }) => {
    if (await sentStore.get(`${to}/${id}`)) return;
    const [n, person] = await Promise.all([read(`users/${to}/notifications/${id}`, token), read(`directory/${to}`, token)]);
    const email = str(person, 'email');
    if (!n || str(n, 'from') !== uid || !email) return;
    sending.push(`${to}/${id}`);
    const key = `${str(n, 'text')}\n${str(n, 'link')}`;
    if (!groups.has(key)) groups.set(key, { text: str(n, 'text'), link: str(n, 'link'), kind: str(n, 'kind'), fromName: str(n, 'fromName'), to: [] });
    groups.get(key).to.push(email);
  }));
  if (!groups.size) return json(200, { sent: 0 });
  await Promise.all(sending.map((k) => sentStore.set(k, '1')));

  const sent = await sendGroups([...groups.values()]);
  return json(200, { sent });
};
