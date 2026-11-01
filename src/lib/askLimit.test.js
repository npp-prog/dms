import test from 'node:test';
import assert from 'node:assert/strict';
import { takeQuestion, manilaDay } from '../../netlify/lib/askLimit.mjs';

const memoryStore = () => {
  const m = new Map();
  return {
    set: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
};

test('Ask DMS daily limit: counts per person per day, refuses past the limit', async () => {
  const store = memoryStore();
  for (let i = 1; i <= 3; i++) {
    const r = await takeQuestion(store, 'a', { limit: 3, day: '2026-10-31', id: `q${i}` });
    assert.equal(r.ok, true); assert.equal(r.used, i);
  }
  assert.equal((await takeQuestion(store, 'a', { limit: 3, day: '2026-10-31', id: 'q4' })).ok, false);
  assert.equal((await takeQuestion(store, 'a', { limit: 3, day: '2026-10-31', id: 'q5' })).ok, false); // still refused
  assert.equal((await takeQuestion(store, 'b', { limit: 3, day: '2026-10-31' })).ok, true); // someone else
  assert.equal((await takeQuestion(store, 'a', { limit: 3, day: '2026-11-01' })).ok, true); // the next day
  assert.equal(manilaDay(new Date('2026-10-31T17:00:00Z')), '2026-11-01'); // 1 AM in Manila
});

test('Ask DMS daily limit: many questions sent at once do not get past it', async () => {
  const store = memoryStore();
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => takeQuestion(store, 'a', { limit: 5, day: '2026-10-31', id: `p${String(i).padStart(2, '0')}` })));
  assert.equal(results.filter((r) => r.ok).length, 5);
});
