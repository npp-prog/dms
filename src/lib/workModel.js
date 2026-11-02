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
export const ITEM_LIMITS = { title: 200, description: 4000, tags: 10, docRefs: 50, assignees: 20 };
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
  };
}
