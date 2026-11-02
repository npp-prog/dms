import { getStore } from '@netlify/blobs';
import { firebaseConfig } from '../../src/firebase-config.js';
import { serviceAccount, serviceToken } from '../lib/serviceAccount.mjs';
import { runReminders } from '../lib/reminders.mjs';
import { sendGroups } from '../lib/mailer.mjs';
import { manilaDay } from '../lib/askLimit.mjs';

// Every day at 7:00 in the morning (Philippine time): deadline reminders for work items, to the
// people assigned (due tomorrow, due today, overdue once), in Notifications and by email. It needs
// a service account in Netlify (lib/serviceAccount.mjs); until then it does nothing, and reminders
// are sent only by the browsers of the people who open DMS (src/lib/work.js).
export default async () => {
  const sa = serviceAccount();
  if (!sa) return new Response('Not set up: add GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY in Netlify.');
  const store = getStore({ name: 'reminders-sent', consistency: 'strong' });
  const result = await runReminders({
    base: `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`,
    token: await serviceToken(sa),
    today: manilaDay(),
    sent: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
  });
  const emailed = await sendGroups(result.emails);
  const summary = { ...result, emails: undefined, emailed };
  console.log('work reminders', JSON.stringify(summary));
  return new Response(JSON.stringify(summary));
};

// 23:00 UTC = 7:00 Asia/Manila
export const config = { schedule: '0 23 * * *' };
