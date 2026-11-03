import test from 'node:test';
import assert from 'node:assert/strict';
import { afterDeclined, afterSigned, buildSignRequest, currentSigner, isMyTurn, markInBox } from './signRequest.js';
import { docStage } from './docStatus.js';

const me = { uid: 'juan', displayName: 'Juan' };
const box = (page = 0) => ({ page, rect: [100, 100, 250, 148] });

test('a signature request: built, signed in order, done', () => {
  assert.throws(() => buildSignRequest([], '', me), /at least one/);
  assert.throws(() => buildSignRequest([{ uid: 'a', name: 'Ana' }], '', me), /Tap the PDF where Ana/);
  assert.throws(() => buildSignRequest([{ uid: 'a', ...box() }, { uid: 'a', ...box(1) }], '', me), /once/);
  const r = buildSignRequest([{ uid: 'ana', name: 'Ana', label: ' Noted by ', ...box() }, { uid: 'mayor', name: 'Mayor', ...box(1) }], 'Please sign', me, 't0');
  assert.equal(r.state, 'open'); assert.equal(r.current, 0); assert.equal(r.steps[0].label, 'Noted by'); assert.equal(r.byUid, 'juan');
  const d = { status: 'complete', pdf: { files: [{}] }, signRequest: r };
  assert.equal(currentSigner(d).uid, 'ana');
  assert.equal(isMyTurn(d, 'ana'), true); assert.equal(isMyTurn(d, 'mayor'), false);
  assert.equal(docStage(d), 'signing');
  const r1 = afterSigned(r, 't1');
  assert.equal(r1.current, 1); assert.equal(r1.state, 'open'); assert.equal(r1.steps[0].status, 'signed');
  const r2 = afterSigned(r1, 't2');
  assert.equal(r2.state, 'done');
  assert.equal(docStage({ ...d, signRequest: r2 }), 'processing'); // signed: Complete once marked processed
  assert.equal(docStage({ ...d, signRequest: r2, closed: { at: 't3' } }), 'complete');
  assert.equal(isMyTurn({ ...d, signRequest: r2 }, 'mayor'), false);
});

test('declining a signature request, and the mark in its box', () => {
  const r = buildSignRequest([{ uid: 'ana', name: 'Ana', ...box() }], '', me);
  assert.throws(() => afterDeclined(r, ''), /why/);
  const x = afterDeclined(r, 'Wrong name on the certificate');
  assert.equal(x.state, 'declined'); assert.equal(x.steps[0].status, 'declined');
  assert.equal(docStage({ status: 'complete', pdf: { files: [{}] }, signRequest: x }), 'returned');
  assert.deepEqual(markInBox({ page: 2, rect: [100, 100, 250, 148] }, 100, 40), { page: 2, rect: [125, 104, 225, 144] });
});

test('a document outside any route marked processed goes to the Archive', async () => {
  const { isArchived, processedAt } = await import('./archiveFiles.js');
  const d = { status: 'complete', pdf: { files: [{}] }, signRequest: { state: 'done', steps: [] }, closed: { at: '2026-11-03T07:00:00Z', by: 'Neil' } };
  assert.equal(isArchived(d), true);
  assert.equal(processedAt(d), '2026-11-03T07:00:00Z');
  assert.equal(docStage(d), 'complete');
  assert.equal(isArchived({ ...d, closed: undefined }), false);
});
