import { reminderPlan, reminderText } from '../../src/lib/reports.js';
import { addDays } from '../../src/lib/workModel.js';
import { fromFields } from './fb.mjs';

// The trusted deadline-reminder run (functions/work-reminders.mjs), with the service account's
// token: the same plan as the browser sender (src/lib/reports.js reminderPlan) and the same fixed
// notification ids, so a reminder is created once whichever sends it first. Each one this run has
// handled is noted in `sent` (Netlify Blobs), so a reminder someone deleted is not created again.
//   base   https://firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents
//   token  the access token ('owner' on the local emulator)
//   sent   { get(key), set(key) }
const OVERDUE_WINDOW = 60; // overdue items: reminded only within this many days of their due date
const MAX_ITEMS = 5000;

export async function runReminders({ base, token, today, sent, now = new Date() }) {
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const root = base.replace(/\/documents$/, '');
  const docsPath = base.replace(/^https?:\/\/[^/]+\/v1\//, '');
  const call = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  // 1. Work items due from OVERDUE_WINDOW days ago to tomorrow (one range on dueDate: no extra index).
  const items = [];
  let cursor = null;
  while (items.length < MAX_ITEMS) {
    const q = {
      structuredQuery: {
        from: [{ collectionId: 'workItems' }],
        where: { compositeFilter: { op: 'AND', filters: [
          { fieldFilter: { field: { fieldPath: 'dueDate' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: addDays(today, -OVERDUE_WINDOW) } } },
          { fieldFilter: { field: { fieldPath: 'dueDate' }, op: 'LESS_THAN_OR_EQUAL', value: { stringValue: addDays(today, 1) } } },
        ] } },
        orderBy: [{ field: { fieldPath: 'dueDate' } }, { field: { fieldPath: '__name__' } }],
        limit: 500,
        ...(cursor ? { startAt: { values: cursor, before: false } } : {}),
      },
    };
    const r = await call(`${base}:runQuery`, q);
    if (r.status !== 200) throw new Error(`Reading work items failed (${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`);
    const page = (r.body || []).filter((x) => x.document).map((x) => x.document);
    for (const d of page) items.push({ id: d.name.split('/').pop(), ...fromFields(d.fields) });
    if (page.length < 500) break;
    const last = page.at(-1);
    cursor = [last.fields.dueDate, { referenceValue: last.name }];
  }

  // 2. Their boards (names, and whether reminders are on) and the plan.
  const getMany = async (paths) => {
    const out = {};
    for (let i = 0; i < paths.length; i += 100) {
      const r = await call(`${root}/documents:batchGet`, { documents: paths.slice(i, i + 100).map((p) => `${docsPath}/${p}`) });
      for (const x of r.body || []) if (x.found) out[x.found.name.split('/documents/')[1]] = fromFields(x.found.fields);
    }
    return out;
  };
  const open = items.filter((i) => i.status !== 'done' && (i.assignees || []).length);
  const boards = await getMany([...new Set(open.map((i) => i.boardId))].map((b) => `boards/${b}`));
  const boardsById = Object.fromEntries(Object.entries(boards).map(([k, v]) => [k.slice(7), v]));
  const plan = reminderPlan(open.filter((i) => boardsById[i.boardId] && !boardsById[i.boardId].archived), today, boardsById);

  // 3. The people: active accounts only, with their email (directory).
  const uids = [...new Set(plan.flatMap((p) => p.to))];
  const users = await getMany(uids.map((u) => `users/${u}`));
  const dir = await getMany(uids.map((u) => `directory/${u}`));

  // 4. Create each reminder once (create fails if it exists: the browser sender may have made it).
  const at = now.toISOString();
  const emails = new Map();
  const result = { items: items.length, planned: 0, created: 0, existed: 0, skipped: 0 };
  const jobs = plan.flatMap((p) => p.to.map((to) => ({ p, to })));
  result.planned = jobs.length;
  for (let i = 0; i < jobs.length; i += 20) {
    await Promise.all(jobs.slice(i, i + 20).map(async ({ p, to }) => {
      const key = `${to}/${p.id}`;
      if (!users[`users/${to}`]?.active || await sent.get(key)) { result.skipped += 1; return; }
      const text = reminderText(p.item, p.kind, boardsById[p.item.boardId]?.name || '').slice(0, 500);
      const link = `/boards/${p.item.boardId}/${p.item.id}`;
      const r = await call(`${base}/users/${to}/notifications?documentId=${p.id}`, { fields: {
        kind: { stringValue: 'reminder' }, text: { stringValue: text }, link: { stringValue: link },
        from: { stringValue: 'dms' }, fromName: { stringValue: 'DMS reminders' }, at: { stringValue: at }, read: { booleanValue: false },
      } });
      if (r.status === 200) {
        result.created += 1;
        // (not to someone who turned DMS emails off: My Profile)
        const email = dir[`directory/${to}`]?.emailOff ? '' : dir[`directory/${to}`]?.email;
        if (email) {
          if (!emails.has(text)) emails.set(text, { text, link, kind: 'reminder', fromName: '', to: [] });
          emails.get(text).to.push(email);
        }
      } else if (r.status === 409) result.existed += 1;
      else { console.error('reminder not created', to, p.id, r.status, JSON.stringify(r.body).slice(0, 200)); return; }
      await sent.set(key, '1');
    }));
  }
  return { ...result, emails: [...emails.values()] };
}
