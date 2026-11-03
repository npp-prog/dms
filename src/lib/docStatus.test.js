import test from 'node:test';
import assert from 'node:assert/strict';
import { docStage } from './docStatus.js';

const pdf = { files: [{ path: 'p' }] };
const wf = (o = {}) => ({ state: 'in-progress', stage: 1, steps: [{}, {}, {}], events: [{ type: 'released' }], ...o });

test('document stages: Draft, For Processing, Returned, On Hold, Complete', () => {
  assert.equal(docStage({ status: 'draft' }), 'draft');
  assert.equal(docStage({ status: 'complete' }), 'draft'); // encoded, not converted to PDF yet
  assert.equal(docStage({ status: 'complete', pdf }), 'processing');
  assert.equal(docStage({ status: 'complete', pdf, workflow: wf() }), 'processing');
  assert.equal(docStage({ status: 'complete', pdf, workflow: wf({ events: [{ type: 'released' }, { type: 'returned' }] }) }), 'returned');
  assert.equal(docStage({ status: 'draft', workflow: wf({ stage: 0, events: [{ type: 'returned' }] }) }), 'returned');
  assert.equal(docStage({ status: 'complete', pdf, workflow: wf({ hold: { office: 'Accounting' }, events: [{ type: 'returned' }] }) }), 'hold');
  assert.equal(docStage({ status: 'complete', pdf, workflow: wf({ state: 'done' }) }), 'complete');
  assert.equal(docStage({ status: 'complete', pdf, parentProcessedAt: '2026-11-01' }), 'complete');
  assert.equal(docStage({ status: 'complete', pdf, workflow: wf({ events: [{ type: 'returned' }, { type: 'held' }, { type: 'resumed' }] }) }), 'returned');
  assert.equal(docStage({ status: 'cancelled', pdf }), 'cancelled');
  assert.equal(docStage({ status: 'complete', pdf, workflow: wf({ state: 'cancelled' }) }), 'cancelled');
});
