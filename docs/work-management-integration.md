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
names{uid: name}, groups[{id, name}], archived, createdAt, updatedAt`

- **managers**: board settings and people; **members**: create, edit and assign items;
  **viewers**: read only. `access` = all three (for the "my boards" query and the rules).
- **groups** have stable ids (`g1`, `g2`, …): renaming a group never moves its items.
- **names** holds the display names of the board's people (so items show who is assigned without
  reading user profiles, which ordinary users may not read).

### `workItems/{itemId}`
`boardId, groupId, title, description, status, priority, assignees[], assigneeNames{}, office,
startDate, dueDate, completedOn, tags[], docRefs[], createdBy, createdByName, createdAt, updatedAt, updatedBy`

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

### Notifications (existing collection, two new kinds)
`users/{uid}/notifications` gains `kind: 'work'` (someone assigned you an item) and `kind: 'mention'`
(someone mentioned you in a comment). Their link (`/boards/{boardId}/{itemId}`) opens the item. They
show in the existing Notifications page (and are emailed like the others), and mentions in My Work.

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
3. Projects: code, office, manager and members, dates, milestones, risks and issues, progress
   updates (manual physical progress with a required explanation), linked documents and work items,
   calendar view. Financial figures only from explicitly defined, authorized sources.
4. Reports and automation: aging and overdue, office workload, project summaries, permission-aware
   CSV export, deadline reminders, saved views, configurable columns (stable column ids).

## 7. Setup and deployment
1. Merge to `main` (Netlify builds and deploys as before; new routes work on refresh through the
   existing SPA redirect).
2. Publish `firestore.rules` in the Firebase console (Firestore → Rules). Storage rules are unchanged by Phase 1.
3. No new environment variables, indexes, functions or billing.
