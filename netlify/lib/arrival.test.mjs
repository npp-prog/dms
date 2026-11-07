import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalPlan, arrivalRecipients } from './arrival.mjs';

const now = Date.parse('2026-11-07T08:00:00Z');
const ACC = 'Municipal Accounting Office';
const base = (over = {}) => ({
  id: 'd1', typeCode: 'DV', controlNo: 'DMS-2026-000123', title: 'ABC Supply', currentOffice: ACC, atPreparer: false,
  workflow: {
    state: 'in-progress', stage: 1,
    steps: [{ office: 'Requesting office' }, { office: ACC, action: 'Pre-audit', positions: ['Reviewer'] }],
    events: [{ type: 'started', uid: 'u1', at: '2026-11-07T07:50:00Z' }, { type: 'released', stage: 0, office: 'Engineering', by: 'Juan', uid: 'u1', at: '2026-11-07T07:59:00Z' }],
  },
  ...over,
});

test('a recent move by the user: emailed to the reviewers and head of the office', () => {
  const plan = arrivalPlan(base(), 'u1', now);
  assert.equal(plan.key, 'arrived/d1/2');
  assert.match(plan.text, /DV DMS-2026-000123 \(ABC Supply\) was routed by Juan \(Engineering\) and is now with your office \(Municipal Accounting Office\) for: Pre-audit\./);
  const to = arrivalRecipients([
    { uid: 'r', email: 'r@x', office: ACC, positions: ['Reviewer'] },
    { uid: 'e', email: 'e@x', office: ACC, positions: ['Encoder'] },
    { uid: 'h', email: 'h@x', office: ACC, head: true },
    { uid: 'off', email: 'off@x', office: ACC, positions: ['Reviewer'], emailOff: true },
    { uid: 'o', email: 'o@x', office: 'Other', positions: ['Reviewer'] },
    { uid: 'u1', email: 'me@x', office: ACC, positions: ['Reviewer'] },
  ], plan, 'u1');
  assert.deepEqual(to, ['r@x', 'h@x']);
});

test('nothing for someone else\'s move, an old move, or one back at the preparer', () => {
  assert.equal(arrivalPlan(base(), 'u2', now), null);
  assert.equal(arrivalPlan(base(), 'u1', now + 60 * 60 * 1000), null);
  assert.equal(arrivalPlan(base({ atPreparer: true, currentOffice: 'Engineering' }), 'u1', now), null);
  const done = base(); done.workflow.state = 'done';
  assert.equal(arrivalPlan(done, 'u1', now), null);
  const held = base(); held.workflow.events.push({ type: 'held', uid: 'u1', at: '2026-11-07T07:59:30Z' });
  assert.equal(arrivalPlan(held, 'u1', now), null);
});

test('referred to a person: only that person', () => {
  const d = base({ currentOffice: 'person:p9' });
  d.workflow.referral = { uid: 'p9' };
  d.workflow.events.push({ type: 'referred', by: 'Rosa', office: ACC, uid: 'u1', at: '2026-11-07T07:59:50Z', remarks: 'to Leo' });
  const plan = arrivalPlan(d, 'u1', now);
  assert.match(plan.text, /was referred by Rosa .* and is now with you\. Remarks: to Leo/);
  assert.deepEqual(arrivalRecipients([{ uid: 'p9', email: 'p@x', office: 'Health' }, { uid: 'x', email: 'x@x', office: 'Health' }], plan, 'u1'), ['p@x']);
});
