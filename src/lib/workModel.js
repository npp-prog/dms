// Work management (Boards, work items, My Work): the vocabulary and the pure rules, shared by the
// pages and the tests. No Firebase here. See docs/work-management-integration.md.
//
// A work item's status is its TASK progress only. It never approves a document, routes it or marks
// a transaction paid: a document's status stays the DMS workflow's (documents/{id}.workflow).

// Work-item statuses (stable ids; labels may change). 'done' sets completedOn.
export const WORK_STATUSES = [
  { id: 'not_started', label: 'Not Started', tone: 'gray' },
  { id: 'in_progress', label: 'In Progress', tone: 'blue' },
  { id: 'blocked', label: 'Blocked', tone: 'red' },
  { id: 'for_review', label: 'For Review', tone: 'yellow' },
  { id: 'done', label: 'Completed', tone: 'green' },
];
export const WORK_STATUS_IDS = WORK_STATUSES.map((s) => s.id);
export const statusOf = (id) => WORK_STATUSES.find((s) => s.id === id) || WORK_STATUSES[0];

export const PRIORITIES = [
  { id: 'low', label: 'Low', tone: 'gray' },
  { id: 'medium', label: 'Medium', tone: 'blue' },
  { id: 'high', label: 'High', tone: 'yellow' },
  { id: 'urgent', label: 'Urgent', tone: 'red' },
];
export const PRIORITY_IDS = PRIORITIES.map((p) => p.id);
export const priorityOf = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[1];

// Board templates: editable starting points (groups), not legal procedures. The groups of a board
// can be renamed, added or removed in its settings; their ids stay, so items keep their group.
export const BOARD_TEMPLATES = [
  {
    id: 'office', name: 'Office task monitoring',
    description: 'The tasks of an office: who does what, and by when.',
    groups: ['To do', 'This week', 'Waiting on others', 'Done'],
  },
  {
    id: 'transactions', name: 'Municipal transaction monitoring',
    description: 'Submissions and their processing: responsible personnel, pending requirements, deadlines and related documents.',
    groups: ['Received', 'Pending requirements', 'In process', 'For release', 'Completed'],
  },
  {
    id: 'accounting', name: 'Accounting Office work',
    description: 'DV and payroll review, cash advance and liquidation follow-ups, RCD submissions, JEV preparation, reconciliations and closing.',
    groups: ['DV review', 'Payroll review', 'Cash advances and liquidations', 'RCD submissions', 'JEV preparation', 'Reconciliations', 'Month-end closing'],
  },
  {
    id: 'projects', name: 'Municipal project implementation',
    description: 'Implementing office, milestones, assigned personnel, issues and supporting documents.',
    groups: ['Planning', 'Procurement', 'Implementation', 'Inspection and acceptance', 'Issues', 'Completed'],
  },
  {
    id: 'digital', name: 'Administrative and digitalization projects',
    description: 'Projects such as DMS improvements, GovMail, the website, payroll improvements and records digitization.',
    groups: ['Backlog', 'In development', 'Testing', 'Rollout', 'Done'],
  },
  {
    id: 'requests', name: 'Interoffice requests',
    description: 'Requests between offices: what was asked, by whom, and its status.',
    groups: ['New requests', 'Accepted', 'In progress', 'Closed'],
  },
  {
    id: 'followups', name: 'Accounting and administrative follow-ups',
    description: 'Follow-ups with other offices and suppliers.',
    groups: ['To follow up', 'Followed up', 'Resolved'],
  },
  { id: 'blank', name: 'Blank board', description: '', groups: ['Group 1'] },
];
export const templateOf = (id) => BOARD_TEMPLATES.find((t) => t.id === id) || BOARD_TEMPLATES[BOARD_TEMPLATES.length - 1];

// Stable group ids (g1, g2, …): renaming a group never moves its items.
export const groupsFor = (templateId) => templateOf(templateId).groups.map((name, i) => ({ id: `g${i + 1}`, name }));
export const nextGroupId = (groups = []) => `g${Math.max(0, ...groups.map((g) => Number(String(g.id).slice(1)) || 0)) + 1}`;

// Board roles: managers (settings, members, delete items), members (create, edit, assign), viewers
// (read only). access = all of them, for the "boards I can see" query and the rules.
export function boardRole(board, uid, isAdmin = false) {
  if (!board || !uid) return isAdmin ? 'manager' : '';
  if ((board.managers || []).includes(uid) || board.ownerUid === uid) return 'manager';
  if ((board.members || []).includes(uid)) return 'member';
  if ((board.viewers || []).includes(uid)) return 'viewer';
  return isAdmin ? 'manager' : '';
}
export const accessOf = ({ managers = [], members = [], viewers = [] }) => [...new Set([...managers, ...members, ...viewers])];

// Deadlines are calendar days (YYYY-MM-DD, Philippine time), not instants.
export function dueState(item, today) {
  if (!item?.dueDate || item.status === 'done') return '';
  if (item.dueDate < today) return 'overdue';
  if (item.dueDate === today) return 'today';
  return addDays(today, 7) >= item.dueDate ? 'soon' : '';
}
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// My Work: the user's open items in buckets (an item can be in more than one).
export function myWorkBuckets(items, uid, today) {
  const open = items.filter((i) => i.status !== 'done');
  const mine = open.filter((i) => (i.assignees || []).includes(uid));
  return {
    assigned: mine,
    overdue: mine.filter((i) => dueState(i, today) === 'overdue'),
    today: mine.filter((i) => dueState(i, today) === 'today'),
    upcoming: mine.filter((i) => dueState(i, today) === 'soon'),
    blocked: mine.filter((i) => i.status === 'blocked'),
    // For review: items marked For Review that the user created (they check the work).
    review: open.filter((i) => i.status === 'for_review' && i.createdBy === uid),
  };
}

// Sorting a board's table.
export const SORTS = {
  due: (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'),
  priority: (a, b) => PRIORITY_IDS.indexOf(b.priority) - PRIORITY_IDS.indexOf(a.priority),
  status: (a, b) => WORK_STATUS_IDS.indexOf(a.status) - WORK_STATUS_IDS.indexOf(b.status),
  title: (a, b) => String(a.title).localeCompare(String(b.title)),
  created: (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
};

// What a work item may hold (the rules check the same).
export const ITEM_LIMITS = { title: 200, description: 4000, tags: 10, docRefs: 50, assignees: 20, checklist: 50, checkText: 200 };
export function cleanItem(input) {
  const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : '');
  return {
    title: String(input.title || '').trim().slice(0, ITEM_LIMITS.title),
    description: String(input.description || '').slice(0, ITEM_LIMITS.description),
    groupId: String(input.groupId || 'g1'),
    status: WORK_STATUS_IDS.includes(input.status) ? input.status : 'not_started',
    priority: PRIORITY_IDS.includes(input.priority) ? input.priority : 'medium',
    assignees: [...new Set(input.assignees || [])].slice(0, ITEM_LIMITS.assignees),
    office: String(input.office || ''),
    startDate: day(input.startDate),
    dueDate: day(input.dueDate),
    tags: [...new Set((input.tags || []).map((t) => String(t).trim()).filter(Boolean))].slice(0, ITEM_LIMITS.tags),
    docRefs: [...new Set(input.docRefs || [])].slice(0, ITEM_LIMITS.docRefs),
    // Its checklist: [{ id, text, done }] (stable ids, so ticking one never ticks another).
    checklist: (input.checklist || []).filter((c) => String(c?.text || '').trim())
      .map((c) => ({ id: String(c.id || ''), text: String(c.text).trim().slice(0, ITEM_LIMITS.checkText), done: Boolean(c.done) }))
      .slice(0, ITEM_LIMITS.checklist),
    // A subtask: the id of its parent item (on the same board); '' for an item.
    parentId: String(input.parentId || ''),
    // The project it belongs to (projects/{id}), if any.
    projectId: String(input.projectId || ''),
    // Values of the board's own columns (cleaned against them by cleanFields when saved).
    fields: input.fields && typeof input.fields === 'object' ? input.fields : {},
  };
}

export const checklistProgress = (list = []) => ({ done: list.filter((c) => c.done).length, total: list.length });
export const newCheckId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Mentions in a comment: the board people whose "@Name" is in the text.
export function mentionsIn(text, people = []) {
  const t = String(text || '');
  return people.filter((p) => p.name && t.includes(`@${p.name}`)).map((p) => p.uid);
}

// Where a linked document is on its DMS route, for a work item (read-only; the DMS workflow is the
// authority): a label (as the brief names them) and the step.
export function routeState(d, officeOfStep = (s) => s?.routedTo || s?.office || '') {
  const wf = d?.workflow;
  if (!wf) return { label: d?.status === 'draft' ? 'Draft' : d?.status === 'cancelled' ? 'Cancelled' : 'Not routed yet', tone: 'gray', step: '' };
  const total = (wf.steps || []).length;
  const step = `Step ${Math.min(wf.stage + 1, total)} of ${total}`;
  if (wf.state === 'done') return { label: 'Completed', tone: 'green', step: '' };
  if (wf.state === 'cancelled') return { label: 'Cancelled', tone: 'red', step: '' };
  if (wf.referral) return { label: `Forwarded to ${wf.referral.name || 'a person'}`, tone: 'blue', step };
  const s = wf.steps?.[wf.stage];
  const holder = officeOfStep(s, d) || 'the preparer';
  const last = (wf.events || []).at(-1)?.type;
  if (last === 'returned') return { label: `Returned for correction to ${holder}`, tone: 'red', step };
  if (s?.sign) return { label: `Awaiting approval: ${holder}`, tone: 'yellow', step, action: s.action || '' };
  return { label: `Under review: ${holder}`, tone: 'blue', step, action: s?.action || '' };
}

// ---- Projects (Phase 3) ----
// Physical progress is entered by hand with a required explanation (progress updates); it is never
// computed from documents. Money: only the approved budget and its funding source, entered by the
// project's managers. Obligations and disbursements are not inferred from document amounts.
export const PROJECT_STATUSES = [
  { id: 'planning', label: 'Planning', tone: 'gray' },
  { id: 'ongoing', label: 'Ongoing', tone: 'blue' },
  { id: 'on_hold', label: 'On Hold', tone: 'yellow' },
  { id: 'completed', label: 'Completed', tone: 'green' },
  { id: 'cancelled', label: 'Cancelled', tone: 'red' },
];
export const PROJECT_STATUS_IDS = PROJECT_STATUSES.map((s) => s.id);
export const projectStatusOf = (id) => PROJECT_STATUSES.find((s) => s.id === id) || PROJECT_STATUSES[0];
export const ISSUE_TYPES = [{ id: 'risk', label: 'Risk' }, { id: 'issue', label: 'Issue' }, { id: 'blocker', label: 'Blocker' }];
export const SEVERITIES = [{ id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }];

const dayOk = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : '');
export function cleanProject(input) {
  const budget = input.approvedBudget === '' || input.approvedBudget === null || input.approvedBudget === undefined ? null : Number(String(input.approvedBudget).replace(/,/g, ''));
  return {
    code: String(input.code || '').trim().toUpperCase().slice(0, 30),
    name: String(input.name || '').trim().slice(0, 160),
    description: String(input.description || '').slice(0, 4000),
    office: String(input.office || ''),
    startDate: dayOk(input.startDate),
    targetDate: dayOk(input.targetDate),
    status: PROJECT_STATUS_IDS.includes(input.status) ? input.status : 'planning',
    fundingSource: String(input.fundingSource || '').trim().slice(0, 160),
    approvedBudget: budget !== null && Number.isFinite(budget) && budget >= 0 ? Math.round(budget * 100) / 100 : null,
  };
}
// Milestones (on the project): [{ id, title, dueDate, done, doneOn }].
export function cleanMilestones(list = []) {
  return list.filter((m) => String(m?.title || '').trim()).slice(0, 50).map((m) => ({
    id: String(m.id || ''), title: String(m.title).trim().slice(0, 160), dueDate: dayOk(m.dueDate), done: Boolean(m.done), doneOn: m.done ? dayOk(m.doneOn) : '',
  }));
}
// Milestones due within `days` days (not done), across projects: for the Dashboard.
export function upcomingMilestones(projects, today, days = 14) {
  const until = addDays(today, days);
  return projects.flatMap((p) => (p.milestones || []).filter((m) => !m.done && m.dueDate && m.dueDate >= today && m.dueDate <= until)
    .map((m) => ({ ...m, projectId: p.id, projectCode: p.code, projectName: p.name })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
export const overdueMilestones = (p, today) => (p.milestones || []).filter((m) => !m.done && m.dueDate && m.dueDate < today);

// A month for the calendar view: 6 weeks of days (YYYY-MM-DD), Monday first; inMonth for the month's own days.
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
    return { day: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month };
  });
}
export const peso = (n) => (n === null || n === undefined || n === '' ? '—' : `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// ---- Configurable columns (Phase 4) ----
// A board's own columns: [{ id, label, type, options, hidden }]. Items keep their values in
// fields: { [columnId]: value }. The id never changes, so renaming a column keeps its values;
// "removing" one hides it (its values stay, and come back if it is shown again).
export const COLUMN_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'currency', label: 'Amount (₱)' },
  { id: 'date', label: 'Date' },
  { id: 'dropdown', label: 'Dropdown' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'person', label: 'Person on the board' },
  { id: 'office', label: 'Office' },
];
export const COLUMN_TYPE_IDS = COLUMN_TYPES.map((t) => t.id);
export const COLUMN_LIMIT = 20;
export const newColumnId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export function cleanColumns(list = []) {
  const seen = new Set();
  return list.filter((c) => /^f[a-z0-9]{2,20}$/.test(String(c?.id || '')) && COLUMN_TYPE_IDS.includes(c.type) && String(c.label || '').trim())
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .slice(0, COLUMN_LIMIT)
    .map((c) => ({
      id: c.id, label: String(c.label).trim().slice(0, 60), type: c.type, hidden: Boolean(c.hidden),
      options: c.type === 'dropdown' ? [...new Set((c.options || []).map((o) => String(o).trim()).filter(Boolean))].slice(0, 30).map((o) => o.slice(0, 60)) : [],
    }));
}
// An item's values for the board's columns (unknown columns and invalid values are dropped).
export function cleanFields(fields = {}, columns = []) {
  const out = {};
  for (const c of columns) {
    const v = fields?.[c.id];
    if (v === undefined || v === null || v === '') continue;
    if (c.type === 'text' || c.type === 'person' || c.type === 'office') { const s = String(v).trim().slice(0, 500); if (s) out[c.id] = s; }
    else if (c.type === 'number' || c.type === 'currency') {
      const n = Number(String(v).replace(/,/g, ''));
      if (Number.isFinite(n)) out[c.id] = c.type === 'currency' ? Math.round(n * 100) / 100 : n;
    } else if (c.type === 'date') { if (dayOk(v)) out[c.id] = v; }
    else if (c.type === 'dropdown') { if ((c.options || []).includes(v)) out[c.id] = v; }
    else if (c.type === 'checkbox') { if (v === true) out[c.id] = true; }
  }
  return out;
}
// A value as text (table, CSV). names: { uid: name } of the board's people.
export function fieldText(column, value, names = {}) {
  if (value === undefined || value === null || value === '') return '';
  if (column.type === 'currency') return peso(value);
  if (column.type === 'checkbox') return value ? 'Yes' : '';
  if (column.type === 'person') return names[value] || 'Someone';
  return String(value);
}

// Who may delete a board (and its work items): its creator, an administrator, or the head of the
// office the board belongs to (the rules check the same).
export const canDeleteBoard = (board, uid, { isAdmin = false, isHead = false, office = '' } = {}) =>
  Boolean(board && uid && (isAdmin || board.ownerUid === uid || (isHead && office && board.office === office)));

// Who may archive or restore a board or a project: its managers (and creator), an administrator,
// or the head of its office (board.office, project.office). The rules check the same.
export const canArchive = (x, uid, { isAdmin = false, isHead = false, office = '' } = {}) =>
  Boolean(x && uid && (isAdmin || x.ownerUid === uid || (x.managers || []).includes(uid) || (isHead && office && x.office === office)));
