import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, daysWaiting, signatureMissing, transitionSteps, transitionWorkflow } from './workflow.js';

const ENG = 'Municipal Engineering Office', ACC = 'Municipal Accounting Office', TRE = "Municipal Treasurer's Office", MAY = 'Office of the Municipal Mayor';
const offices = [ENG, ACC, TRE, MAY, 'Office of the Municipal Vice Mayor'];
const dv = {
  code: 'DV', fields: [{ key: 'approver' }],
  route: [
    { office: '', action: 'Prepare' },
    { office: ACC, action: 'Pre-audit', sign: true, assign: { field: 'dvNo', pattern: '{FUND}-{YYYY}-{MM}-{####}' } },
    { office: TRE, action: 'Box C', sign: true },
    { office: MAY, action: 'Approve', sign: true },
  ],
};
const doc = { id: 'd1', office: ENG, data: { approver: 'Municipal Mayor', dvNo: 'GF-2026-12-0456' }, pdf: { files: [{ kind: 'uploaded', stage: 0 }] } };
const rosa = { uid: 'u9', displayName: 'Tess', office: TRE };
const at = '2027-01-05T02:00:00.000Z';

test('a DV signed by Accounting and on hold at the Treasurer: started at step 3, steps 1–2 outside DMS', () => {
  const r = transitionWorkflow(dv, doc, offices, rosa, { stage: 2, done: [{ by: 'Juan', date: '2026-12-10' }, { by: 'Rosa', date: '2026-12-15' }], hold: 'Waiting for funds' }, at);
  const wf = r.workflow;
  assert.equal(wf.stage, 2);
  assert.equal(r.currentOffice, TRE);
  assert.equal(r.atPreparer, false);
  assert.deepEqual(r.routeOffices, [ENG, ACC, TRE]);
  assert.deepEqual(wf.events.map((e) => e.type), ['started', 'released', 'released', 'imported', 'held']);
  assert.equal(wf.events[2].by, 'Rosa');
  assert.ok(wf.events[2].outside);
  assert.equal(wf.events[2].at.slice(0, 10), '2026-12-15');
  assert.equal(wf.hold.reason, 'Waiting for funds');
  assert.equal(wf.choose, undefined);
  // waiting counted from the upload, not from 2026
  assert.equal(daysWaiting({ workflow: wf }, new Date('2027-01-06T03:00:00Z')), 1);
});

test('signed on the paper at that step: no signature asked there; it goes on normally', () => {
  const r = transitionWorkflow(dv, doc, offices, rosa, { stage: 2 }, at);
  const d = { ...doc, ...r, transition: { stage: 2, signedHere: true } };
  assert.equal(signatureMissing(d), false);
  assert.equal(signatureMissing({ ...d, transition: { stage: 2, signedHere: false } }), true);
  const moved = applyAction(d, 'release', rosa, '', at);
  assert.equal(moved.workflow.stage, 3);
  assert.equal(moved.currentOffice, MAY);
  // returned from the Treasurer: back to Accounting, which never used DMS for it
  const back = applyAction(d, 'return', rosa, 'Missing ORS', at);
  assert.equal(back.currentOffice, ACC);
});

test('approved by the Vice Mayor: the Mayor step goes to the Vice Mayor\'s office', () => {
  const r = transitionWorkflow(dv, { ...doc, data: { approver: 'Municipal Vice Mayor' } }, offices, { uid: 'v', displayName: 'V', office: offices[4] }, { stage: 3 }, at);
  assert.equal(r.currentOffice, offices[4]);
});

test('not at the first step, nor beyond the route', () => {
  assert.throws(() => transitionWorkflow(dv, doc, offices, rosa, { stage: 0 }, at));
  assert.throws(() => transitionWorkflow(dv, doc, offices, rosa, { stage: 4 }, at));
});

test('who may upload at which step', () => {
  assert.deepEqual(transitionSteps(dv.route, ENG, TRE), [false, false, true, false]);
  assert.deepEqual(transitionSteps(dv.route, ENG, offices[4]), [false, false, false, true]);
  assert.deepEqual(transitionSteps(dv.route, ENG, ENG), [false, false, false, false]);
  assert.deepEqual(transitionSteps(dv.route, ENG, '', true), [false, true, true, true]);
});
