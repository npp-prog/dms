import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlNumber, controlNoSettings, refRestart, withRestart, refNumber } from './naming.js';

const nov = new Date(2026, 10, 1);

test('DMS control number: format and when it restarts (Settings → Numbering)', () => {
  const yearly = controlNumber({}, nov);
  assert.equal(yearly.format(7), 'DMS-2026-000007');
  assert.equal(yearly.counterId, 'FTS'); // 2026 continues the series used so far
  assert.equal(controlNumber({}, new Date(2027, 0, 1)).counterId, 'DMS-2027');
  const monthly = controlNumber({ controlNo: { reset: 'month' } }, nov);
  assert.equal(monthly.format(7), 'DMS-2026-11-000007');
  assert.equal(monthly.counterId, 'DMS-2026-11');
  const never = controlNumber({ controlNo: { reset: 'never', digits: 5 } }, nov);
  assert.equal(never.format(7), 'DMS-00007');
  assert.equal(never.counterId, 'DMS-ALL');
  assert.equal(controlNumber({ controlNo: { prefix: 'mg-c', digits: 4 } }, nov).format(3), 'MGC-2026-0003');
  assert.deepEqual(controlNoSettings({ controlNo: { reset: 'weekly', digits: 99 } }), { prefix: 'DMS', digits: 8, reset: 'year' });
});

test('reference numbers: restart follows the date in the format, and choosing it changes the format', () => {
  assert.equal(refRestart('{FUND}-{YYYY}-{MM}-{####}'), 'month');
  assert.equal(refRestart('TO-{YYYY}-{####}'), 'year');
  assert.equal(refRestart('{####}'), 'never');
  assert.equal(withRestart('{FUND}-{YYYY}-{MM}-{####}', 'year'), '{FUND}-{YYYY}-{####}');
  assert.equal(withRestart('{FUND}-{YYYY}-{MM}-{####}', 'never'), '{FUND}-{####}');
  assert.equal(withRestart('TO-{####}', 'year'), 'TO-{YYYY}-{####}');
  assert.equal(withRestart('{FUND}-{YYYY}-{####}', 'month'), '{FUND}-{YYYY}-{MM}-{####}');
  for (const r of ['day', 'month', 'year', 'never']) assert.equal(refRestart(withRestart('100-{YYYY}-{MM}-{####}', r)), r);
  assert.equal(refNumber(withRestart('TO-{####}', 'year'), { date: nov }).format(5), 'TO-2026-0005');
});

import { withParents, isArchived, processedAt } from './archiveFiles.js';
test('a supporting document goes into the Archive with its processed main document', () => {
  const main = { id: 'm', workflow: { state: 'done', events: [{ type: 'completed', at: '2026-11-01T10:52:00Z' }] } };
  const open = { id: 'o', workflow: { state: 'in-progress', events: [] } };
  const sup = { id: 's', supports: { id: 'm' } };
  const sup2 = { id: 't', supports: { id: 'o' } };
  const [m, s, t] = withParents([main, sup, sup2], [main, open]);
  assert.ok(isArchived(m) && isArchived(s) && !isArchived(t));
  assert.equal(processedAt(s), '2026-11-01T10:52:00Z');
  assert.equal(sup.parentProcessedAt, undefined); // the documents read are not changed
});
