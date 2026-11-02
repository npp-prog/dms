import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessOf, boardRole, cleanItem, dueState, groupsFor, myWorkBuckets, nextGroupId, templateOf } from './workModel.js';

test('deadlines are calendar days in Philippine time', () => {
  const t = '2026-11-02';
  assert.equal(dueState({ dueDate: '2026-11-01', status: 'in_progress' }, t), 'overdue');
  assert.equal(dueState({ dueDate: '2026-11-02' }, t), 'today');
  assert.equal(dueState({ dueDate: '2026-11-09' }, t), 'soon');
  assert.equal(dueState({ dueDate: '2026-11-10' }, t), '');
  assert.equal(dueState({ dueDate: '2026-10-01', status: 'done' }, t), ''); // completed: never overdue
  assert.equal(dueState({}, t), '');
});

test('My Work buckets', () => {
  const t = '2026-11-02';
  const items = [
    { id: 'a', assignees: ['me'], dueDate: '2026-10-30', status: 'in_progress' },
    { id: 'b', assignees: ['me'], dueDate: '2026-11-02', status: 'blocked' },
    { id: 'c', assignees: ['me'], status: 'done', dueDate: '2026-10-01' },
    { id: 'd', assignees: ['you'], status: 'for_review', createdBy: 'me' },
    { id: 'e', assignees: ['you'], dueDate: '2026-10-01', status: 'in_progress' },
  ];
  const b = myWorkBuckets(items, 'me', t);
  assert.deepEqual(b.assigned.map((i) => i.id), ['a', 'b']);
  assert.deepEqual(b.overdue.map((i) => i.id), ['a']);
  assert.deepEqual(b.today.map((i) => i.id), ['b']);
  assert.deepEqual(b.blocked.map((i) => i.id), ['b']);
  assert.deepEqual(b.review.map((i) => i.id), ['d']);
});

test('board roles and access', () => {
  const board = { ownerUid: 'o', managers: ['o', 'm'], members: ['e'], viewers: ['v'] };
  assert.equal(boardRole(board, 'o'), 'manager');
  assert.equal(boardRole(board, 'm'), 'manager');
  assert.equal(boardRole(board, 'e'), 'member');
  assert.equal(boardRole(board, 'v'), 'viewer');
  assert.equal(boardRole(board, 'x'), '');
  assert.equal(boardRole(board, 'x', true), 'manager'); // administrators
  assert.deepEqual(accessOf(board).sort(), ['e', 'm', 'o', 'v']);
});

test('templates give stable group ids', () => {
  const g = groupsFor('accounting');
  assert.equal(g[0].id, 'g1');
  assert.equal(g.length, templateOf('accounting').groups.length);
  assert.equal(nextGroupId([{ id: 'g1' }, { id: 'g7' }]), 'g8');
  assert.equal(templateOf('nope').id, 'blank');
});

test('work items keep only what they may hold', () => {
  const i = cleanItem({ title: '  Review DV  ', status: 'approved', priority: 'x', dueDate: 'tomorrow', tags: ['a', 'a', ' ', 'b'], docRefs: ['d1', 'd1'], assignees: ['u', 'u'] });
  assert.equal(i.title, 'Review DV');
  assert.equal(i.status, 'not_started'); // a task status, never a document approval
  assert.equal(i.priority, 'medium');
  assert.equal(i.dueDate, '');
  assert.deepEqual(i.tags, ['a', 'b']);
  assert.deepEqual(i.docRefs, ['d1']);
  assert.deepEqual(i.assignees, ['u']);
});

import { checklistProgress, mentionsIn, routeState } from './workModel.js';
test('checklist, subtasks and mentions', () => {
  const i = cleanItem({ title: 'x', checklist: [{ id: 'c1', text: ' OR attached ', done: 1 }, { id: 'c2', text: '  ' }], parentId: 'p1' });
  assert.deepEqual(i.checklist, [{ id: 'c1', text: 'OR attached', done: true }]); // blank lines dropped
  assert.equal(i.parentId, 'p1');
  assert.deepEqual(checklistProgress([{ done: true }, { done: false }]), { done: 1, total: 2 });
  const people = [{ uid: 'a', name: 'Ana Reyes' }, { uid: 'b', name: 'Ben Budget' }];
  assert.deepEqual(mentionsIn('Please check, @Ana Reyes', people), ['a']);
  assert.deepEqual(mentionsIn('no one', people), []);
});

test("a linked document's route, as the DMS workflow says (read only)", () => {
  const office = (s) => s?.routedTo || 'Requesting office';
  const steps = [{ action: 'Prepare' }, { routedTo: 'Accounting', action: 'Pre-audit', sign: true }, { routedTo: 'Treasury', action: 'Pay' }];
  assert.equal(routeState({ status: 'draft' }).label, 'Draft');
  assert.equal(routeState({ workflow: { state: 'in-progress', stage: 1, steps, events: [{ type: 'released' }] } }, office).label, 'Awaiting approval: Accounting');
  assert.equal(routeState({ workflow: { state: 'in-progress', stage: 2, steps, events: [] } }, office).label, 'Under review: Treasury');
  assert.equal(routeState({ workflow: { state: 'in-progress', stage: 0, steps, events: [{ type: 'returned' }] } }, office).label, 'Returned for correction to Requesting office');
  assert.equal(routeState({ workflow: { state: 'in-progress', stage: 1, steps, events: [], referral: { name: 'Leo' } } }, office).label, 'Forwarded to Leo');
  assert.equal(routeState({ workflow: { state: 'done', stage: 2, steps, events: [] } }, office).label, 'Completed');
  assert.equal(routeState({ workflow: { state: 'in-progress', stage: 1, steps, events: [] } }, office).step, 'Step 2 of 3');
});

import { cleanMilestones, cleanProject, monthGrid, overdueMilestones, peso, upcomingMilestones } from './workModel.js';
test('projects: details, budget, milestones', () => {
  const p = cleanProject({ code: ' dms-2026 ', name: 'DMS improvements', status: 'approved', approvedBudget: '1,250,000.555', startDate: 'soon' });
  assert.equal(p.code, 'DMS-2026');
  assert.equal(p.status, 'planning');
  assert.equal(p.approvedBudget, 1250000.56);
  assert.equal(p.startDate, '');
  assert.equal(cleanProject({ code: 'X', name: 'Y', approvedBudget: '' }).approvedBudget, null); // no budget, not zero
  assert.equal(cleanProject({ code: 'X', name: 'Y', approvedBudget: -5 }).approvedBudget, null);
  assert.equal(peso(1250000.5), '₱1,250,000.50');
  assert.deepEqual(cleanMilestones([{ id: 'm1', title: ' Bid opening ', dueDate: '2026-11-10' }, { title: ' ' }]), [{ id: 'm1', title: 'Bid opening', dueDate: '2026-11-10', done: false, doneOn: '' }]);
  const projects = [{ id: 'a', code: 'A', name: 'A', milestones: [
    { id: '1', title: 'soon', dueDate: '2026-11-05', done: false }, { id: '2', title: 'later', dueDate: '2026-12-30', done: false },
    { id: '3', title: 'late', dueDate: '2026-10-01', done: false }, { id: '4', title: 'done', dueDate: '2026-11-04', done: true }] }];
  assert.deepEqual(upcomingMilestones(projects, '2026-11-02').map((m) => m.title), ['soon']);
  assert.deepEqual(overdueMilestones(projects[0], '2026-11-02').map((m) => m.title), ['late']);
});

test('calendar month: 6 weeks, Monday first', () => {
  const g = monthGrid(2026, 10); // November 2026 (starts on a Sunday)
  assert.equal(g.length, 42);
  assert.equal(g[0].day, '2026-10-26'); // the Monday before
  assert.equal(g.find((d) => d.inMonth).day, '2026-11-01');
  assert.equal(g.filter((d) => d.inMonth).length, 30);
});

test('who may delete a board: creator, administrator, head of its office', async () => {
  const { canDeleteBoard } = await import('./workModel.js');
  const b = { ownerUid: 'o', managers: ['o', 'm'], office: 'Accounting' };
  assert.equal(canDeleteBoard(b, 'o'), true);
  assert.equal(canDeleteBoard(b, 'm'), false);
  assert.equal(canDeleteBoard(b, 'x', { isAdmin: true }), true);
  assert.equal(canDeleteBoard(b, 'h', { isHead: true, office: 'Accounting' }), true);
  assert.equal(canDeleteBoard(b, 'h', { isHead: true, office: 'Treasury' }), false);
  assert.equal(canDeleteBoard(b, 'h', { isHead: false, office: 'Accounting' }), false);
  assert.equal(canDeleteBoard({ ...b, office: '' }, 'h', { isHead: true, office: '' }), false);
});

test('who may archive a board or project: managers, creator, administrator, head of its office', async () => {
  const { canArchive } = await import('./workModel.js');
  const x = { ownerUid: 'o', managers: ['o', 'm'], members: ['e'], office: 'Accounting' };
  assert.equal(canArchive(x, 'o'), true);
  assert.equal(canArchive(x, 'm'), true);
  assert.equal(canArchive(x, 'e'), false);
  assert.equal(canArchive(x, 'z', { isAdmin: true }), true);
  assert.equal(canArchive(x, 'h', { isHead: true, office: 'Accounting' }), true);
  assert.equal(canArchive(x, 'h', { isHead: true, office: 'Treasury' }), false);
  assert.equal(canArchive({ ...x, office: '' }, 'h', { isHead: true, office: '' }), false);
});
