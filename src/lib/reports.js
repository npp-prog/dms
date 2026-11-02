// Work management reports and automation (Phase 4): the pure rules, shared by the pages and the
// tests. No Firebase here. Every report is built from what the user could already read (their
// boards, items and projects), so it never counts or shows anything else.
import { addDays, dueState, fieldText, PRIORITIES, statusOf, WORK_STATUSES, projectStatusOf, overdueMilestones } from './workModel.js';

// Whole days from day a to day b (YYYY-MM-DD).
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const isOpen = (i) => i.status !== 'done';

// Days past due (0 when not overdue or done).
export const overdueDays = (item, today) => (dueState(item, today) === 'overdue' ? daysBetween(item.dueDate, today) : 0);
// Days since it was created (a Firestore timestamp), in Philippine calendar days.
export function ageDays(item, today) {
  const s = item.createdAt?.seconds;
  if (!s) return null;
  const created = new Date(s * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  return Math.max(0, daysBetween(created, today));
}

export const AGING_BUCKETS = [
  { id: 'ontime', label: 'Not overdue', tone: 'green' },
  { id: 'd7', label: '1–7 days overdue', tone: 'yellow' },
  { id: 'd30', label: '8–30 days overdue', tone: 'yellow' },
  { id: 'd60', label: '31–60 days overdue', tone: 'red' },
  { id: 'over60', label: 'Over 60 days overdue', tone: 'red' },
];
export function agingBucket(item, today) {
  const d = overdueDays(item, today);
  if (d <= 0) return 'ontime';
  if (d <= 7) return 'd7';
  if (d <= 30) return 'd30';
  if (d <= 60) return 'd60';
  return 'over60';
}
// Open items per aging bucket.
export function agingSummary(items, today) {
  const out = Object.fromEntries(AGING_BUCKETS.map((b) => [b.id, 0]));
  for (const i of items.filter(isOpen)) out[agingBucket(i, today)] += 1;
  return out;
}

// Workload: open, overdue, blocked, due in the next 7 days, completed in the last 30 days, per
// key. by: 'office' (the responsible office) or 'person' (each assignee; an item counts for each).
export function workload(items, today, by = 'office') {
  const rows = new Map();
  const since = addDays(today, -30);
  const row = (key) => {
    if (!rows.has(key)) rows.set(key, { key, open: 0, overdue: 0, blocked: 0, soon: 0, doneRecent: 0 });
    return rows.get(key);
  };
  for (const i of items) {
    const keys = by === 'person' ? ((i.assignees || []).length ? i.assignees : ['']) : [i.office || ''];
    for (const k of keys) {
      const r = row(k);
      if (!isOpen(i)) { if ((i.completedOn || '') >= since) r.doneRecent += 1; continue; }
      r.open += 1;
      const ds = dueState(i, today);
      if (ds === 'overdue') r.overdue += 1;
      if (ds === 'today' || ds === 'soon') r.soon += 1;
      if (i.status === 'blocked') r.blocked += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.overdue - a.overdue || b.open - a.open || String(a.key).localeCompare(String(b.key)));
}

// A project in one row: progress, milestones, open issues, budget, time left.
export function projectSummary(p, openIssues, today) {
  const ms = p.milestones || [];
  return {
    id: p.id, code: p.code, name: p.name, office: p.office || '', status: projectStatusOf(p.status).label,
    physical: Number(p.physicalProgress) || 0,
    milestonesDone: ms.filter((m) => m.done).length, milestonesTotal: ms.length,
    overdueMilestones: overdueMilestones(p, today).length,
    openIssues: openIssues ?? null,
    approvedBudget: p.approvedBudget ?? null, fundingSource: p.fundingSource || '',
    targetDate: p.targetDate || '',
    daysLeft: p.targetDate && !['completed', 'cancelled'].includes(p.status) ? daysBetween(today, p.targetDate) : null,
  };
}

// ---- Export (CSV) ----
// Who may export a board's items: its managers and members (default), managers only, or everyone
// on it. A project's: its managers and members. (Only what the user may already read is ever in a
// file; linked documents are exported as a count, never their titles.)
export const EXPORT_CHOICES = [
  { id: 'members', label: 'Managers and members' },
  { id: 'managers', label: 'Managers only' },
  { id: 'everyone', label: 'Everyone on the board, viewers too' },
];
export function canExportBoard(board, uid, isAdmin = false) {
  if (!board || !uid) return false;
  if (isAdmin) return true;
  const manager = (board.managers || []).includes(uid) || board.ownerUid === uid;
  const member = (board.members || []).includes(uid);
  const viewer = (board.viewers || []).includes(uid);
  const by = board.exportBy || 'members';
  return by === 'managers' ? manager : by === 'everyone' ? manager || member || viewer : manager || member;
}
export const canExportProject = (p, uid, isAdmin = false) => Boolean(isAdmin || (p?.managers || []).includes(uid) || (p?.members || []).includes(uid));

// A CSV cell: quoted when needed; text that a spreadsheet would run as a formula (= + - @) is
// prefixed with ' so it stays text.
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// columns: [{ label, get(row) }]. With a byte-order mark, so spreadsheets read ₱ and ñ correctly.
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.get(r))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

// The columns of a work-item export (standard fields, then the board's own visible columns).
export function itemCsvColumns(board, { projects = [], today } = {}) {
  const names = board?.names || {};
  const group = (i) => (board?.groups || []).find((g) => g.id === i.groupId)?.name || '';
  const project = (i) => { const p = projects.find((x) => x.id === i.projectId); return p ? `${p.code} ${p.name}` : i.projectId ? '(a project you are not on)' : ''; };
  const cols = [
    { label: 'Board', get: (i) => i.boardName || board?.name || '' },
    { label: 'Group', get: group },
    { label: 'Work item', get: (i) => i.title },
    { label: 'Subtask of', get: (i) => (i.parentId ? 'yes' : '') },
    { label: 'Status', get: (i) => statusOf(i.status).label },
    { label: 'Priority', get: (i) => (PRIORITIES.find((p) => p.id === i.priority) || {}).label || '' },
    { label: 'Assigned to', get: (i) => (i.assignees || []).map((u) => names[u] || i.assigneeNames?.[u] || 'Someone').join('; ') },
    { label: 'Responsible office', get: (i) => i.office || '' },
    { label: 'Start date', get: (i) => i.startDate || '' },
    { label: 'Due date', get: (i) => i.dueDate || '' },
    { label: 'Completed on', get: (i) => i.completedOn || '' },
    { label: 'Related project', get: project },
    { label: 'Tags', get: (i) => (i.tags || []).join('; ') },
    { label: 'Linked documents', get: (i) => (i.docRefs || []).length },
  ];
  if (today) cols.push({ label: 'Days overdue', get: (i) => overdueDays(i, today) || '' });
  for (const c of (board?.columns || []).filter((x) => !x.hidden)) {
    cols.push({ label: c.label, get: (i) => (c.type === 'number' || c.type === 'currency' ? i.fields?.[c.id] ?? '' : fieldText(c, i.fields?.[c.id], names)) });
  }
  return cols;
}

// A file name for an export: letters, digits and dashes, with the day.
export const csvName = (what, today) => `${String(what).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'export'}-${today}.csv`;

// ---- Deadline reminders ----
// For open items with a due date and assignees: due tomorrow, due today, and (once) overdue. Each
// reminder has a fixed id per item, kind and due date, so it is sent once however many times (or
// by however many people) the check runs: the rules let nobody overwrite a notification.
export const REMINDER_KINDS = { soon: 'S', today: 'T', overdue: 'O' };
export function reminderPlan(items, today, boardsById = {}) {
  const tomorrow = addDays(today, 1);
  const out = [];
  for (const i of items) {
    if (!isOpen(i) || !i.dueDate || !(i.assignees || []).length) continue;
    if (boardsById[i.boardId]?.reminders === false) continue;
    const kind = i.dueDate === tomorrow ? 'soon' : i.dueDate === today ? 'today' : i.dueDate < today ? 'overdue' : '';
    if (!kind) continue;
    out.push({ item: i, kind, to: [...new Set(i.assignees)], id: `rem${REMINDER_KINDS[kind]}${i.dueDate.replace(/-/g, '')}${i.id}`.slice(0, 40) });
  }
  return out;
}
export function reminderText(item, kind, boardName = '') {
  const on = boardName ? ` on ${boardName}` : '';
  if (kind === 'soon') return `Reminder: "${item.title}"${on} is due tomorrow (${item.dueDate}).`;
  if (kind === 'today') return `Reminder: "${item.title}"${on} is due today.`;
  return `Overdue: "${item.title}"${on} was due ${item.dueDate}.`;
}

export const statusLabels = Object.fromEntries(WORK_STATUSES.map((s) => [s.id, s.label]));
