import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedFields, liveFiles, refStampMissing, refUndoBase, signatureMissing } from './workflow.js';
test('changing a reference no. already on the PDF: back to the version before it', () => {
  const wf = { state: 'in-progress', stage: 1, steps: [{ office: 'A' }, { office: 'B', sign: true, assign: { field: 'no', dateField: 'dt' } }] };
  const refNos = { no: { value: '1', label: 'DV No.', stage: 1, at: '2026-10-30T01:00:00Z' } };
  const g = { kind: 'generated', at: '2026-10-30T00:00:00Z', stage: 0 };
  const s0 = { kind: 'signed', stage: 0, at: '2026-10-30T00:10:00Z' };
  const s1 = { kind: 'signed', stage: 1, refStage: 1, at: '2026-10-30T02:00:00Z' };
  let doc = { workflow: wf, refNos, pdf: { files: [g, s0, s1] } };
  assert.equal(refStampMissing(doc), null);
  assert.equal(signatureMissing(doc), false);
  assert.equal(refUndoBase(doc), 1);
  doc = { ...doc, pdf: { files: [g, s0, s1, { kind: 'restored', restores: 1, stage: 1 }] } };
  assert.deepEqual(liveFiles(doc.pdf.files).map((f) => f.i), [0, 1]);
  assert.equal(refStampMissing(doc).value, '1');
  assert.equal(signatureMissing(doc), true);
  assert.equal(refUndoBase(doc), -1);
  // put on again: changeable again
  doc = { ...doc, pdf: { files: [...doc.pdf.files, { kind: 'stamped', refStage: 1, stage: 1 }] } };
  assert.equal(refStampMissing(doc), null);
  assert.equal(refUndoBase(doc), 1);
  // released: no longer
  assert.equal(refUndoBase({ ...doc, workflow: { ...wf, stage: 2, steps: [...wf.steps, { office: 'C' }] } }), -1);
});

test('the DV No. and its date are assigned on the route, not typed in the Accounting panel', () => {
  const type = { processing: [{ office: 'A' }, { office: 'B', assign: { field: 'dvNo', dateField: 'dvDate' } }] };
  assert.deepEqual([...assignedFields(type, {})], ['dvNo', 'dvDate']);
  assert.deepEqual([...assignedFields(type, { workflow: { steps: [{ office: 'A' }] } })], []);
  assert.deepEqual([...assignedFields({ route: [{ assign: { field: 'orNo' } }], processing: type.processing }, {})], ['orNo']);
});

test('overdue: more than 3 days where it is now, counted from when it arrived', async () => {
  const { daysWaiting, isOverdue, waitingSince, OVERDUE_DAYS } = await import('./workflow.js');
  assert.equal(OVERDUE_DAYS, 3);
  const now = new Date('2026-11-10T09:00:00+08:00');
  const doc = (events, extra = {}) => ({ workflow: { state: 'in-progress', stage: 1, steps: [{}, {}], events, ...extra } });
  const d = doc([{ type: 'started', at: '2026-11-01T08:00:00+08:00' }, { type: 'released', at: '2026-11-05T08:00:00+08:00' }, { type: 'assigned', at: '2026-11-08T08:00:00+08:00' }]);
  assert.equal(waitingSince(d), '2026-11-05T08:00:00+08:00', 'assigning a number is not an arrival');
  assert.equal(daysWaiting(d, now), 5);
  assert.ok(isOverdue(d, now));
  assert.ok(!isOverdue(doc([{ type: 'released', at: '2026-11-07T10:00:00+08:00' }]), now), 'under 3 days');
  assert.ok(!isOverdue(doc([{ type: 'released', at: '2026-11-06T10:00:00+08:00' }]), now), '3 days: not yet');
  assert.equal(daysWaiting({ workflow: { state: 'done', events: [{ type: 'released', at: '2026-10-01' }] } }, now), null, 'processed: not waiting');
});

test('a reference no. already on the document: assigned, not stamped', () => {
  const doc = { workflow: { state: 'in-progress', stage: 1, steps: [{}, { assign: { field: 'dvNo', noStamp: true } }], events: [] },
    refNos: { dvNo: { value: '0001', label: 'DV No.', stage: 1, at: '2026-11-04T01:00:00Z' } }, pdf: { files: [{ kind: 'generated', at: '2026-11-03T01:00:00Z' }] } };
  assert.equal(refStampMissing(doc), null);
  doc.workflow.steps[1].assign.noStamp = false;
  assert.equal(refStampMissing(doc).value, '0001');
});

test('a step that attaches a document by link (the JEV): required before routing', async () => {
  const { attachMissing, applyAction, routeSteps } = await import('./workflow.js');
  const steps = routeSteps({ route: [{ office: '' }, { office: 'Municipal Accounting Office', attach: { label: 'JEV', required: true } }, { office: "Municipal Treasurer's Office" }] });
  assert.deepEqual(steps[1].attach, { label: 'JEV', required: true });
  const doc = { workflow: { state: 'in-progress', stage: 1, steps, events: [] }, pdf: { files: [{ kind: 'generated' }] }, stepFiles: [] };
  assert.equal(attachMissing(doc), 'JEV');
  assert.throws(() => applyAction(doc, 'release', { uid: 'a', displayName: 'A' }), /Attach the JEV/);
  doc.stepFiles.push({ kind: 'fts', id: 'j1', stage: 1, label: 'JEV' });
  assert.equal(attachMissing(doc), '');
  assert.doesNotThrow(() => applyAction(doc, 'release', { uid: 'a', displayName: 'A' }));
});
