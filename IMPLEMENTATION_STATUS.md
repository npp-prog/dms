# Implementation status: work management

Details: [docs/work-management-integration.md](docs/work-management-integration.md).

## Phase 1 — Boards and My Work (implemented)
| Feature | Status |
|---|---|
| Work section in the menu (My Work, Boards); not for Third Parties | Done |
| Create and edit boards from templates (office tasks, transactions, Accounting, projects, digitalization, interoffice requests, follow-ups, blank) | Done |
| Board groups (stable ids), people with roles (manager, member, viewer) | Done |
| Work items: title, description, status, priority, assignees, responsible office, start/due/completion dates, tags | Done |
| Table view per group, search, status filter, "assigned to me", sorting | Done |
| Item details panel; activity timeline (append-only) | Done |
| Link existing DMS documents (ids only); route shown read-only; restricted documents hidden | Done |
| Document page: Work items card (create linked item, add to existing item) | Done |
| My Work (assigned, overdue, due today, next 7 days, blocked, for my review) | Done |
| Dashboard rows for overdue, due today, blocked, due this week | Done |
| Firestore rules for boards, items, activity | Done — **publish in the Firebase console** |

Tests: `npm test` (work model: deadlines, buckets, roles, templates, input cleaning); 24 emulator
rule checks; browser run (create board, add item, assign, link document, My Work, dashboard, document
card, restricted document for an outsider, direct refresh of a board URL); production build.

## Phase 2 — Collaboration and workflow visibility (implemented)
| Feature | Status |
|---|---|
| Kanban view (Table/Kanban switch, remembered per board); drag to change status with the table's permissions | Done |
| Checklists on items (members edit, assignees tick) | Done |
| Subtasks (child items, nested in the table, counts on cards) | Done |
| Comments with @mentions (append-only; mentions limited to board people) | Done |
| Notifications: assigned to an item, mentioned in a comment (existing Notifications + email) | Done — **publish firestore.rules** |
| Direct item address `/boards/{board}/{item}` (notification links) | Done |
| My Work → Mentions | Done |
| Linked document route state (Under review, Awaiting approval, Returned for correction, Forwarded, Completed, Step n of m) | Done |

Tests: work-model tests (checklists, mentions, route states); 15 more emulator rule checks (comments,
mentions, checklist by assignee, notification kinds, outsiders); browser run (checklist, subtask,
comment with mention, Kanban drag, mention in My Work, notification link opens the item).

## Phase 3 — Projects (implemented)
| Feature | Status |
|---|---|
| Projects: code, name, description, implementing office, manager/members/viewers, start and target dates, status | Done |
| Funding source and approved budget (entered by managers; nothing inferred from documents) | Done |
| Milestones (due dates, done, overdue), upcoming milestones on the Dashboard | Done |
| Risks, issues and blockers (severity, resolve/reopen) | Done |
| Progress updates: physical % with a required explanation, append-only; latest shown | Done |
| Linked DMS documents (ids only; restricted ones hidden); projects on the document page | Done |
| Related boards and their work items (`projectId`); new item for the project | Done |
| Calendar view: boards (items by due date) and projects (milestones and items) | Done |
| Firestore rules for projects, updates, issues; `projectId` on work items | Done — **publish firestore.rules** |

Tests: work-model tests (project cleaning, budget, milestones, calendar grid); 19 emulator rule checks
(roles, budget only by managers, progress only with an explanation, append-only updates, issues, outsiders,
items related to a project); browser run (create project, milestone, progress update, issue, link document,
relate board, item for the project, both calendars, document page, dashboard).

## Not yet (next phases)
- Phase 4: Reports, CSV export, deadline reminders, saved views, configurable columns.

## Known limitations (Phases 1–3)
- Activity events are written by the browser (validated and append-only in the rules), not yet by a trusted backend.
- Boards load at most 500 items; My Work 300 (no paging yet).
- Deleting an item leaves its activity entries (unreachable).
- Removing a person from a board does not unassign them from its items (they keep seeing those items as assignees).
- Kanban moves by drag and drop with a mouse; on a phone or by keyboard, open the item and change its status there.
- Notifications for assignments and mentions are sent by the browser (like the DMS's other notices), not a backend.
- Projects: physical progress is manual (no weighted milestones yet); a project lists work items only from related boards the user is on; the project list loads at most 200 projects.
