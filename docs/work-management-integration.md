# Work management in DMS (Boards, My Work, Projects, Reports)

Work management is added *around* the existing DMS, not as a second application. Documents,
attachments, routing and approvals stay where they are; boards and work items track who does
what, by when, and which documents the work is about.

## 1. Integration assessment

**Stack (unchanged):** React 18 + Vite, Firebase Auth / Firestore / Storage, Netlify (static site,
SPA redirect, Netlify Functions for Ask DMS and the Drive backup). Tests: `node --test` on
`src/lib/*.test.js`; security rules tested against the Firebase emulators (`npm run local`).

### Reused as is
| Existing | Used by work management for |
|---|---|
| Firebase Auth, `users/{uid}` profiles, roles (`src/lib/roles.js`) | Who is signed in; administrators see every board |
| `directory/{uid}` + `PersonPicker` | Adding people to a board (no second user list) |
| Offices in Settings (`settings.offices`) | Board office and an item's responsible office |
| `documents/{id}` and their rules | Linked documents are read with the user's own access |
| Document page `/documents/:id` (viewer, attachments, folders) | Opening a linked document |
| `LinkEditor` (document picker) | Linking DMS documents to an item |
| `/upload` (Upload a document) | Adding a new supporting document, then linking it |
| `Select`, `StatusBadge`, `Avatar`, page/table styles | The new pages look like the rest of DMS |
| DMS workflow (`documents.workflow`, `src/lib/workflow.js`) | Shown read-only beside a linked document (where it is, who holds it) |

### Extended
- **Navigation** (`Layout.jsx`): a *Work* section with **My Work** and **Boards** (not for Third Parties).
- **Dashboard**: rows for overdue work, work due today, blocked work and work due this week, each opening My Work filtered.
- **Document page**: a **Work items** card (items that link the document; create one; add it to one).
- **Firestore rules**: `boards`, `workItems`, `workItems/{id}/activity`.

### New modules (Phase 1)
- `src/lib/workModel.js`: statuses, priorities, templates, roles, deadlines, My Work buckets (pure, tested).
- `src/lib/work.js`: Firestore reads/writes for boards, items and activity.
- `src/pages/Boards.jsx` (`/boards`, `/boards/:boardId`), `src/pages/MyWork.jsx` (`/my-work`).
- `src/components/WorkItemPanel.jsx`, `WorkBits.jsx`, `DocWorkCard.jsx`.

### Migration and compatibility risks
- **None for existing data.** Only new collections are added; no existing document, URL, control
  number or stored record changes. Nothing needs migrating.
- **Rules must be published** (Firebase console) before Boards work on the live site; until then the
  pages show a permission error and the rest of DMS is unaffected.
- **No new indexes are required** for Phase 1 (all queries use one equality or array filter, or an
  equality with one array-contains, which Firestore serves from automatic single-field indexes).
  If Firestore ever asks for a composite index, its error message links to create it in one click.
- **No new billing.** Phase 1 uses Firestore only (no Cloud Functions, no new Netlify function).

## 2. Data model (additive)

### `boards/{boardId}`
`name, description, template, office, ownerUid, ownerName, managers[], members[], viewers[], access[],
names{uid: name}, groups[{id, name}], archived, createdAt, updatedAt,
columns[{id, label, type, options[], hidden}], exportBy, reminders` (the last three: Phase 4)

- **managers**: board settings and people; **members**: create, edit and assign items;
  **viewers**: read only. `access` = all three (for the "my boards" query and the rules).
- **groups** have stable ids (`g1`, `g2`, …): renaming a group never moves its items.
- **columns** (Phase 4): the board's own columns, at most 20. `id` (`f…`, random) never changes:
  renaming keeps values; "removing" hides (`hidden: true`) and keeps them. Types: text, number,
  currency, date, dropdown (`options`), checkbox, person (a board person's uid), office. The
  brief's "related record" type is not offered: documents and projects already have their own fields.
- **exportBy** (Phase 4): who may export the board's items to CSV: `members` (managers and members,
  the default), `managers`, or `everyone`. **reminders** (Phase 4): `false` stops deadline reminders.
- **names** holds the display names of the board's people (so items show who is assigned without
  reading user profiles, which ordinary users may not read).

### `workItems/{itemId}`
`boardId, groupId, title, description, status, priority, assignees[], assigneeNames{}, office,
startDate, dueDate, completedOn, tags[], docRefs[], createdBy, createdByName, createdAt, updatedAt, updatedBy,
checklist[], parentId, projectId, fields{columnId: value}` (`fields`: Phase 4, values of the board's columns,
cleaned against their type; at most 40)

- **docRefs** holds DMS document *ids only* — never their number, title, amounts or files. A
  document may be linked to many items; an item to up to 50 documents.
- **startDate / dueDate / completedOn** are calendar days (`YYYY-MM-DD`, Philippine time); `createdAt`
  and `updatedAt` are server timestamps.
- A top-level collection (not under the board) so **My Work** can find a user's items on every board
  with one query (`assignees array-contains uid`).

Phase 2 adds to work items: `checklist[{id, text, done}]` (up to 50; stable ids) and `parentId` (a
**subtask** is a work item whose `parentId` is another item on the same board).

### `workItems/{itemId}/comments/{commentId}` (Phase 2)
`text, mentions[], by, byName, at` — written by anyone who may see the item, as themselves, at the
server's time; **never changed or deleted**. `mentions` must be people on the board; each is notified.

### `boards/{boardId}/views/{viewId}` (Phase 4)
`name, shared, by, byName, at, view, status, sort, mine, q, office` — a saved view (filters, sort and
view). Each person's own; a board manager may share one (`shared: true`). Read: own or shared; never
updated; deleted by whoever saved it (a shared one also by a manager).

### Notifications (existing collection, new kinds)
`users/{uid}/notifications` gains `kind: 'work'` (someone assigned you an item) and `kind: 'mention'`
(someone mentioned you in a comment). Their link (`/boards/{boardId}/{itemId}`) opens the item. They
show in the existing Notifications page (and are emailed like the others), and mentions in My Work.
Phase 4 adds `kind: 'reminder'`: deadline reminders, with a **fixed id** per item, kind and due date
(`rem` + S/T/O + YYYYMMDD + item id), so each is created once: the rules let no one overwrite a
notification (a second create of the same id is an update, refused).

### Deadline reminders: how they are sent
There is no trusted backend with database access yet (the Netlify Functions act as the signed-in
user). So reminders are sent by the browser of whoever opens DMS, once a day per person and device
(`lib/work.js sendDeadlineReminders`): for the items assigned to them and the items of boards they
manage, a reminder to each assignee when the item is due tomorrow, due today, or overdue (once per due
date). Fixed ids make it idempotent across devices and people. **Limitation:** if nobody on a board
opens DMS that day, its reminders wait until someone does. **Proposed trusted version (needs manual
configuration):** a Netlify Scheduled Function (daily, 7:00 Manila) using a Firebase service account
(`FIREBASE_SERVICE_ACCOUNT` in Netlify, Firebase Admin SDK) to run the same plan for all boards and
write the same fixed-id notifications; no extra billing beyond Firestore reads. Not enabled until
that credential is added.

### Reports and exports (Phase 4)
Reports (`/reports`) are computed in the browser (`lib/reports.js`) from the boards (first 40, each
≤ 500 items) and projects (≤ 100) the user can read, so every count respects access. CSV exports
contain only those rows, only from boards whose `exportBy` allows the user (projects: managers and
members), with linked documents as a count only. Cells that a spreadsheet would run as a formula
(`= + - @`) are prefixed with `'`. Reports are not stored.

### `projects/{projectId}` (Phase 3)
`code, name, description, office, startDate, targetDate, status, fundingSource, approvedBudget, ownerUid,
ownerName, managers[], members[], viewers[], access[], names{}, milestones[{id, title, dueDate, done, doneOn}],
docRefs[], boardIds[], physicalProgress, progressNote, progressAt, createdAt, updatedAt`
- Managers change details, people and the approved budget; members keep milestones, links, status and
  progress; viewers read. `physicalProgress` changes only together with a new `progressNote` (the rules
  refuse it otherwise), written in the same batch as a progress update.
- **Money:** only `approvedBudget` (explicit, entered by a manager) and `fundingSource`. Obligations and
  disbursements are not stored or inferred from document amounts; a later phase can add them only from an
  authorized source with explicit definitions.
- Work items join a project by `workItems.projectId`; the project lists them from its **related boards**
  (`boardIds`), one bounded query per board the user can see.

### `projects/{id}/updates/{id}` and `projects/{id}/issues/{id}` (Phase 3)
- **updates**: `physical (0–100), note (≥ 5 characters), by, byName, at` — append-only.
- **issues**: `type (risk | issue | blocker), title, description, severity, owner, status (open | resolved),
  createdBy, createdByName, createdAt, resolvedOn, updatedBy` — members add them and change only their
  status; managers delete.

### `workItems/{itemId}/activity/{eventId}`
`type, text, by, byName, at` — the item's timeline (created, status, assigned, due date, moved,
documents linked). Written in the same batch as the change; **append-only**: the rules allow adding
an event as yourself at the server's time, never changing or deleting one. The timeline never names
a linked document (board members may not be allowed to see it).

## 3. Statuses: one source of truth each
| Status | Lives in | Changed by |
|---|---|---|
| Work-item status (Not Started, In Progress, Blocked, For Review, Completed) | `workItems.status` | Board members, or an item's assignee |
| Document status (Draft, Complete, Processed, Cancelled) and its route | `documents.status`, `documents.workflow` | The DMS workflow only (Route, Return, Refer, Sign, Mark processed) |
| Payment status | Not tracked in Phase 1 | — |

**No synchronization in Phase 1, on purpose:** completing a work item never approves, routes or
processes a document, and nothing marks a transaction paid. A linked document's route is *shown*
beside it (where it is, who holds it, returned or processed), read live from the document. Any later
sync (e.g. "when the DV is processed, mark the follow-up item done") will be one-way, explicit, run in a
trusted backend function, and idempotent.

## 4. Permissions
| Action | Who |
|---|---|
| See a board and its items | Its managers, members, viewers; administrators |
| See an item | Also its assignees and its creator |
| Create, edit, assign items | Board managers and members (assignees must be on the board) |
| Change an item's status only | Its assignee, even if a viewer |
| Delete an item | Its creator, board managers, administrators |
| Board settings and people | Board managers (the creator always stays one), administrators |
| Open a linked document | Only whoever the document's own rules allow — being on a board grants nothing |

All of this is enforced in `firestore.rules` (and tested on the emulator), not only in the pages.
Users cannot change their own role or office here: profiles keep their existing rules.

## 5. Search and size limits
Firestore has no full-text search. Boards load at most 500 items, My Work 300, the board list 200;
search and filters work on what is loaded. Nothing downloads all municipal records. For boards that
outgrow this, a later phase adds paging (`startAfter`) and server-side filters by status/assignee/due
date; full-text search across boards would need a search service (e.g. a Netlify Function with an
index), which is a separate, billed decision.

## 6. Phases
1. **Done (Phase 1) — Boards and My Work:** boards from templates, groups, items (title, description, status,
   priority, assignees, office, start/due dates, tags), table view with filters and sorting, item
   panel, linked DMS documents (with their route shown, restricted ones hidden), document page card,
   dashboard rows, activity timeline, permissions.
2. **Done (Phase 2) — collaboration and workflow visibility:** Kanban view (drag a card to change the
   task's status, with the same permissions as the table; never a document action), checklists
   (assignees tick them), subtasks (nested under their item in the table), comments with @mentions
   (append-only), notifications for assignments and mentions, a direct address per item, My Work →
   Mentions, and each linked document's route state: *Under review*, *Awaiting approval* (a step that
   signs), *Returned for correction*, *Forwarded* (referred to a person), *Completed*, with *Step n of m*.
   (DMS has no "awaiting receipt": documents are no longer received.)
3. **Done (Phase 3) — Projects:** code, implementing office, manager and members, dates, status,
   funding source and approved budget (entered, never inferred), milestones, risks/issues/blockers,
   progress updates (manual physical progress with a required explanation, append-only), linked DMS
   documents, related boards and their work items (`projectId`), a month **calendar** on boards and
   projects, projects on the document page, and upcoming milestones on the Dashboard. Weighted
   milestone progress is left for later, as the brief allows.
4. **Done (Phase 4) — Reports and automation:** Reports page (aging and overdue buckets, workload by
   office or person, project summaries) with clickable summaries; Dashboard work overview (workload by
   office, project progress); permission-aware CSV export (boards and reports; `exportBy`); deadline
   reminders (idempotent notifications and email; browser-sent until a trusted scheduled function is
   configured); saved views (personal and shared); configurable columns with stable ids.

## 7. Setup and deployment
1. Merge to `main` (Netlify builds and deploys as before; new routes work on refresh through the
   existing SPA redirect).
2. Publish `firestore.rules` in the Firebase console (Firestore → Rules). Storage rules are unchanged by Phase 1.
3. No new environment variables, indexes, functions or billing. (Phase 4's optional trusted reminder
   sender would need a Firebase service account in Netlify: see "Deadline reminders" above.)
