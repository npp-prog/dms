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
