import { randomUUID } from 'node:crypto';

// Ask DMS: questions per person per day (Philippine time), so no one account can run up the
// Anthropic bill. ASK_DAILY_LIMIT in Netlify changes it (default 50).
export const DEFAULT_DAILY_LIMIT = 50;

export const dailyLimit = () => {
  const n = Number(process.env.ASK_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
};
export const manilaDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

// store: Netlify Blobs ({ set, list, delete }; a Map-like object in tests).
// Counts this question if there is room today: { ok, used, limit }. Each question is its own entry
// (day/uid/<id>), counted after it is written: questions sent at the same moment all see each
// other, so firing many at once cannot get past the limit (as a read-then-write counter could).
export async function takeQuestion(store, uid, { limit = dailyLimit(), day = manilaDay(), id = randomUUID() } = {}) {
  const prefix = `${day}/${uid}/`;
  const key = prefix + id;
  await store.set(key, '1');
  const { blobs = [] } = await store.list({ prefix });
  // This question's place among today's (by key order: ties broken the same way for everyone).
  const keys = blobs.map((b) => b.key).sort();
  const place = keys.indexOf(key) + 1 || keys.length;
  if (keys.length > limit && place > limit) {
    await store.delete(key).catch(() => {});
    return { ok: false, used: Math.min(keys.length - 1, limit), limit };
  }
  return { ok: true, used: Math.min(keys.length, limit), limit };
}
