import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStaleChunkError } from './freshness.js';

test('recognises a part of an old version that no longer exists', () => {
  assert.ok(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://dms.mgocandoni.com/assets/P12Signer-Bh4rLOg7.js')));
  assert.ok(isStaleChunkError(new TypeError('Importing a module script failed.')));
  assert.ok(isStaleChunkError('error loading dynamically imported module'));
  assert.ok(!isStaleChunkError(new Error('Your certificate password is wrong.')));
  assert.ok(!isStaleChunkError(null));
});
