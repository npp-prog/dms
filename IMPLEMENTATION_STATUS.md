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

## Not yet (next phases)
- Phase 2: Kanban, comments and mentions, checklists and subtasks, notifications.
- Phase 3: Projects (milestones, risks, progress, linked documents), calendar view.
- Phase 4: Reports, CSV export, deadline reminders, saved views, configurable columns.

## Known limitations of Phase 1
- Activity events are written by the browser (validated and append-only in the rules), not yet by a trusted backend.
- Boards load at most 500 items; My Work 300 (no paging yet).
- Deleting an item leaves its activity entries (unreachable).
- Removing a person from a board does not unassign them from its items (they keep seeing those items as assignees).
