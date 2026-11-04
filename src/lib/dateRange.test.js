import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRangeValue, dayCount, formatDateRange } from './dateRange.js';

test('dates of travel: one day or a range, as the form prints them', () => {
  assert.equal(formatDateRange('2026-11-10'), 'November 10, 2026');
  assert.equal(formatDateRange('2026-11-10', '2026-11-12'), 'November 10-12, 2026');
  assert.equal(formatDateRange('2026-11-30', '2026-12-02'), 'November 30 - December 2, 2026');
  assert.equal(formatDateRange('2026-12-30', '2027-01-02'), 'December 30, 2026 - January 2, 2027');
  assert.equal(formatDateRange('2026-11-10', '2026-11-10'), 'November 10, 2026');
  assert.equal(formatDateRange('2026-11-10', '2026-11-09'), 'November 10, 2026', 'an end before the start is ignored');
  assert.equal(formatDateRange(''), '');
  assert.deepEqual(dateRangeValue('travelDates', '2026-11-10', '2026-11-12'), { travelDates: 'November 10-12, 2026', travelDatesFrom: '2026-11-10', travelDatesTo: '2026-11-12' });
  assert.deepEqual(dateRangeValue('travelDates', '2026-11-10', ''), { travelDates: 'November 10, 2026', travelDatesFrom: '2026-11-10', travelDatesTo: '' });
  assert.equal(dayCount('2026-11-10', '2026-11-12'), 3);
  assert.equal(dayCount('2026-11-10', ''), 1);
});
