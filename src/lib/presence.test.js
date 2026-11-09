import test from 'node:test';
import assert from 'node:assert/strict';
import { isOnline } from './presence.js';

test('online: a sign of life under 5 minutes old, unless hidden', () => {
  const now = Date.parse('2026-11-04T10:00:00Z');
  assert.ok(isOnline({ at: '2026-11-04T09:56:30Z' }, now));
  assert.ok(!isOnline({ at: '2026-11-04T09:54:00Z' }, now), 'too old');
  assert.ok(!isOnline({ at: '2026-11-04T09:59:50Z', hidden: true }, now), 'turned off');
  assert.ok(!isOnline(null, now));
});
