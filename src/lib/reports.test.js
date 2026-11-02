import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agingBucket, agingSummary, ageDays, canExportBoard, canExportProject, csvCell, csvName, daysBetween, itemCsvColumns,
  overdueDays, projectSummary, reminderPlan, reminderText, toCsv, workload,
} from './reports.js';
import { cleanColumns, cleanFields, fieldText, cleanItem } from './workModel.js';

const today = '2026-11-02';
const it = (o) => ({ id: 'abcdefghij0123456789', status: 'in_progress', assignees: ['u1'], ...o });

test('days between calendar days', () => {
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(daysBetween('2026-11-02', '2026-11-02'), 0);
});

test('overdue days and aging buckets', () => {
  assert.equal(overdueDays(it({ dueDate: '2026-11-01' }), today), 1);
  assert.equal(overdueDays(it({ dueDate: '2026-11-02' }), today), 0);
  assert.equal(overdueDays(it({ dueDate: '2026-10-01', status: 'done' }), today), 0);
  assert.equal(agingBucket(it({ dueDate: '2026-11-05' }), today), 'ontime');
  assert.equal(agingBucket(it({}), today), 'ontime');
  assert.equal(agingBucket(it({ dueDate: '2026-10-26' }), today), 'd7');
  assert.equal(agingBucket(it({ dueDate: '2026-10-25' }), today), 'd30');
  assert.equal(agingBucket(it({ dueDate: '2026-09-10' }), today), 'd60');
  assert.equal(agingBucket(it({ dueDate: '2026-08-01' }), today), 'over60');
  const s = agingSummary([it({ dueDate: '2026-10-31' }), it({ dueDate: '2026-08-01' }), it({ dueDate: '2026-08-01', status: 'done' }), it({})], today);
  assert.deepEqual(s, { ontime: 1, d7: 1, d30: 0, d60: 0, over60: 1 });
});

test('age in Philippine days', () => {
  // 2026-10-31 20:00 UTC is 2026-11-01 in Manila
  assert.equal(ageDays({ createdAt: { seconds: Date.parse('2026-10-31T20:00:00Z') / 1000 } }, today), 1);
  assert.equal(ageDays({}, today), null);
});

test('workload by office and by person', () => {
  const items = [
    it({ office: 'Accounting', dueDate: '2026-10-01' }),
    it({ office: 'Accounting', status: 'blocked', dueDate: '2026-11-04' }),
    it({ office: 'Accounting', status: 'done', completedOn: '2026-10-20' }),
    it({ office: 'Accounting', status: 'done', completedOn: '2026-09-01' }),
    it({ office: '', assignees: ['u1', 'u2'] }),
  ];
  const byOffice = workload(items, today, 'office');
  assert.deepEqual(byOffice[0], { key: 'Accounting', open: 2, overdue: 1, blocked: 1, soon: 1, doneRecent: 1 });
  assert.equal(byOffice[1].key, '');
  const byPerson = workload(items, today, 'person');
  assert.equal(byPerson.find((r) => r.key === 'u1').open, 3);
  assert.equal(byPerson.find((r) => r.key === 'u2').open, 1);
  assert.deepEqual(workload([it({ assignees: [] })], today, 'person').map((r) => r.key), ['']);
});

test('project summary', () => {
  const s = projectSummary({ id: 'p', code: 'P-1', name: 'Road', status: 'ongoing', physicalProgress: 40, approvedBudget: 100,
    targetDate: '2026-11-12', milestones: [{ done: true }, { done: false, dueDate: '2026-10-01' }, { done: false, dueDate: '2026-12-01' }] }, 2, today);
  assert.equal(s.physical, 40); assert.equal(s.milestonesDone, 1); assert.equal(s.milestonesTotal, 3);
  assert.equal(s.overdueMilestones, 1); assert.equal(s.openIssues, 2); assert.equal(s.daysLeft, 10); assert.equal(s.status, 'Ongoing');
  assert.equal(projectSummary({ status: 'completed', targetDate: '2026-01-01' }, null, today).daysLeft, null);
});

test('who may export', () => {
  const b = { ownerUid: 'o', managers: ['o', 'm'], members: ['e'], viewers: ['v'] };
  assert.equal(canExportBoard(b, 'e'), true);
  assert.equal(canExportBoard(b, 'v'), false);
  assert.equal(canExportBoard({ ...b, exportBy: 'managers' }, 'e'), false);
  assert.equal(canExportBoard({ ...b, exportBy: 'managers' }, 'm'), true);
  assert.equal(canExportBoard({ ...b, exportBy: 'everyone' }, 'v'), true);
  assert.equal(canExportBoard({ ...b, exportBy: 'everyone' }, 'stranger'), false);
  assert.equal(canExportBoard(b, 'stranger', true), true);
  assert.equal(canExportProject({ managers: ['m'], members: ['e'], viewers: ['v'] }, 'v'), false);
  assert.equal(canExportProject({ managers: ['m'], members: ['e'] }, 'e'), true);
});

test('CSV cells are quoted and formulas neutralised', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+63 912'), "'+63 912");
  assert.equal(csvCell(-5), '-5');
  assert.equal(csvCell(null), '');
  const csv = toCsv([{ label: 'A', get: (r) => r.a }, { label: 'B', get: (r) => r.b }], [{ a: 'x', b: 1 }]);
  assert.equal(csv, '﻿A,B\r\nx,1\r\n');
  assert.equal(csvName('Accounting Office: work', today), 'Accounting-Office-work-2026-11-02.csv');
});

test('item export columns: standard fields, visible custom columns, no document titles', () => {
  const board = { name: 'B', groups: [{ id: 'g1', name: 'To do' }], names: { u1: 'Ana' },
    columns: [{ id: 'fabc', label: 'Amount', type: 'currency' }, { id: 'fdef', label: 'Old', type: 'text', hidden: true }, { id: 'fghi', label: 'Checker', type: 'person' }] };
  const cols = itemCsvColumns(board, { today });
  const labels = cols.map((c) => c.label);
  assert.ok(labels.includes('Amount') && !labels.includes('Old') && labels.includes('Days overdue'));
  const row = it({ title: 'DV 1', groupId: 'g1', dueDate: '2026-10-31', docRefs: ['d1', 'd2'], fields: { fabc: 1500.5, fghi: 'u1' } });
  const get = (l) => cols.find((c) => c.label === l).get(row);
  assert.equal(get('Group'), 'To do'); assert.equal(get('Assigned to'), 'Ana'); assert.equal(get('Linked documents'), 2);
  assert.equal(get('Amount'), 1500.5); assert.equal(get('Checker'), 'Ana'); assert.equal(get('Days overdue'), 2);
});

test('deadline reminders: tomorrow, today, overdue once, fixed ids', () => {
  const items = [
    it({ id: 'aaaaaaaaaaaaaaaaaaa1', dueDate: '2026-11-03', boardId: 'b1' }),
    it({ id: 'aaaaaaaaaaaaaaaaaaa2', dueDate: '2026-11-02', boardId: 'b1' }),
    it({ id: 'aaaaaaaaaaaaaaaaaaa3', dueDate: '2026-10-20', boardId: 'b1' }),
    it({ id: 'aaaaaaaaaaaaaaaaaaa4', dueDate: '2026-11-09', boardId: 'b1' }),
    it({ id: 'aaaaaaaaaaaaaaaaaaa5', dueDate: '2026-11-03', boardId: 'b1', status: 'done' }),
    it({ id: 'aaaaaaaaaaaaaaaaaaa6', dueDate: '2026-11-03', boardId: 'b1', assignees: [] }),
    it({ id: 'aaaaaaaaaaaaaaaaaaa7', dueDate: '2026-11-03', boardId: 'off' }),
  ];
  const plan = reminderPlan(items, today, { off: { reminders: false } });
  assert.deepEqual(plan.map((p) => p.kind), ['soon', 'today', 'overdue']);
  assert.equal(plan[0].id, 'remS20261103aaaaaaaaaaaaaaaaaaa1');
  assert.ok(plan.every((p) => /^[A-Za-z0-9]{10,40}$/.test(p.id)));
  // the same plan tomorrow keeps the overdue id (sent once)
  assert.equal(reminderPlan([items[2]], '2026-11-03')[0].id, plan[2].id);
  assert.match(reminderText(items[0], 'soon', 'B'), /due tomorrow \(2026-11-03\)/);
  assert.match(reminderText(items[2], 'overdue'), /^Overdue/);
});

test('configurable columns and their values', () => {
  const cols = cleanColumns([
    { id: 'fa1', label: ' Amount ', type: 'currency' },
    { id: 'fb2', label: 'Kind', type: 'dropdown', options: ['DV', 'DV', ' Payroll ', ''] },
    { id: 'fa1', label: 'dup', type: 'text' },
    { id: 'bad', label: 'x', type: 'text' },
    { id: 'fc3', label: '', type: 'text' },
    { id: 'fd4', label: 'Odd', type: 'formula' },
    { id: 'fe5', label: 'Done?', type: 'checkbox', hidden: 1 },
  ]);
  assert.deepEqual(cols.map((c) => c.id), ['fa1', 'fb2', 'fe5']);
  assert.equal(cols[0].label, 'Amount'); assert.deepEqual(cols[1].options, ['DV', 'Payroll']); assert.equal(cols[2].hidden, true);
  assert.deepEqual(cleanFields({ fa1: '1,234.567', fb2: 'Other', fe5: true, zz: 'x' }, cols), { fa1: 1234.57, fe5: true });
  assert.deepEqual(cleanFields({ fb2: 'DV', fe5: false, fa1: 'abc' }, cols), { fb2: 'DV' });
  assert.equal(fieldText(cols[0], 1234.5), '₱1,234.50');
  assert.equal(fieldText(cols[2], true), 'Yes');
  assert.deepEqual(cleanItem({ title: 'x', fields: { fa1: 1 } }).fields, { fa1: 1 });
});

test('no reminders for archived boards', () => {
  const plan = reminderPlan([{ id: 'aaaaaaaaaaaaaaaaaaa9', status: 'in_progress', assignees: ['u1'], dueDate: '2026-11-03', boardId: 'arch' }], '2026-11-02', { arch: { archived: true } });
  assert.equal(plan.length, 0);
});
