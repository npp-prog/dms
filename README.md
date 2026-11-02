# DMS — Document Management System

DMS is a web app that stores the official formats of LGU financial documents. It covers forms that PMS, IMS, CBO, CFMS and other LGU web apps do **not** generate, such as the **Disbursement Voucher (DV)**, **Obligation Request (OBR)**, **FURS**, **Payroll**, **Petty Cash Voucher**, **Liquidation Report**, **Itinerary of Travel**, **Purchase Request**, **Purchase Order** and **Job Order**. The starter formats follow the Municipal Government of Candoni's Appendix Forms (GAM for LGUs). Admins can add more document types.

- **Superadmins/admins** define each document type: its fields, a **guided step-by-step encoding process**, a **checklist of requirements**, a **processing guide** (which offices the document goes to, in what order, and what each does), and a **printable format** (HTML template).
- **End users only encode.** They fill in the document through the guided wizard, confirm the checklist, and print it. DMS then shows them **how to process the document**. DMS does not route or transmit documents.
- **Checklist library.** All 210 checklists of the Municipal Accounting Office are included: 201 for disbursements (1001–1907) and 9 for liquidations (2002–2015). Only the DV and the Liquidation Report have a checklist. Their Checklist step asks for the type of transaction (e.g. *1613 – Payment to Supplier, Direct Acquisition*), then loads that checklist with Y / N/A answers and prints it, filled in, as the cover sheet. Each requirement has a Document Type and Document Details.

**Try it on your computer:** `npm install`, then `npm run local`. No Firebase project is needed. See [docs/LOCALHOST.md](docs/LOCALHOST.md) for the full walkthrough with screenshots.

Stack: React + Vite, Firebase Authentication + Cloud Firestore, deployed on Netlify.

**Look:** the same design as PMS-IMS (TOSCAN layout: top bar and sidebar, a dashboard with "Needs your attention" and "At a glance", the Inter and Plus Jakarta Sans typefaces, official-form print layout with the municipal seal) in the same palette as PMS-IMS: **slate navy, steel blue and teal** (white top bar, steel-blue sidebar).

## Features

| Area | What it does |
|---|---|
| Checklists | The disbursement and liquidation checklist library, searchable by number or words. Each checklist can be printed blank. Admins load, edit and add checklists. |
| Prepare Document | Step-by-step wizard with per-step instructions and required-field checks, then the checklist and a review. Only the DV and the LR have a Checklist step, where the type of transaction is chosen. Table columns can be paragraphs (the DV's Explanation). Totals, net pay and amounts to be reimbursed are computed. A live print preview updates as you type. When printed, each form is portrait and fits one page: scaled down if it is too tall or too wide, and its main table stretched to fill the page if there is room. The preview is the exact printed page. |
| PDF and digital signatures | When a document is final, the preparer **converts it to PDF** (the document, plus its checklist for a DV or LR). Each signatory then signs the PDF with their **DICT PNPKI digital signature** while it is in their office: in DMS, with their `.p12`/`.pfx` certificate file and password (the file and password never leave their computer), or in Adobe Acrobat, uploading the signed PDF back. Signatures are added one after another, so earlier ones stay valid. DMS checks every signature (intact, matching the certificate, issued by the PNPKI) and keeps every version. A signed document can no longer be edited. |
| Signature details | A signature with a mark is a visible signature field where the signatory placed it. Clicking it, in the DMS viewer or in Adobe Acrobat / Foxit on a downloaded copy, shows the signature (valid or not, when, reason) and its certificate (issued to, DICT PNPKI issuer, validity, serial, chain). DMS also records each PDF version's SHA-256 (verifications), and /verify checks any copy without signing in. |
| Archive and backups | Processed documents move to the Archive. The Records Officer records where each paper is filed, registers the backup devices and schedule, and backs the archive up (one ZIP of PDFs, attachments and records), with a backup log and Dashboard reminders. |
| Circulars and Communities | Office heads send letters, memos and orders to some or all offices, each office marks them received and the sender is told; any user creates communities (groups with members from any office) to talk and share files. |
| Workflow and Notifications | A document starts along its route when it is **converted to PDF**: the PDF is what travels from office to office. The route comes from Administration → Workflow, or else the **How to process this document** steps (e.g. DV: requesting office → Accounting → Treasurer → Mayor → Treasurer → Accounting). Each office acts on it, then **releases** it to the next office or **returns** it to the previous one with remarks; the last office marks it **processed**. Everyone on the route sees where the document is, who acted and when. Admins set the route of every document type under **Administration → Workflow** (offices in order, the action of each, and which offices must sign the PDF before releasing); a type without a route follows its processing guide. **Notifications** lists the documents waiting in your office; **Tracking** (left menu, for everyone) shows where the routed documents they can see are. The preparer can edit it only while it is still in their office. |
| Documents | Each document gets an automatic control number, e.g. `DMS-2026-000001`: DMS, the year, and a 6-digit series for all document types that starts again each year (2026 continues the earlier count; documents created before keep their `FTS-`/`DMS-` number). Status goes Draft → Complete, or Cancelled. Each document shows **How to process this document**. You can filter, search, print and see the history of each document. |
| Document Types (admin) | Field builder (text, long text, number, amount, date, dropdown, line-item tables with computed columns and totals), steps builder, checklist builder, processing-guide builder, and template editor with live preview. Import/export as JSON. Ten starter formats are included (DV, OBR, FURS, Payroll, PCV, LR, IT, PR, PO, JO), printed portrait and **fit to page** (width and height): the DV on Folio (8.5 × 13 in), everything else on A4. |
| Users (admin) | New accounts wait for approval. Admins approve or deactivate users. Only the superadmin grants admin/superadmin. |
| Settings (superadmin) | LGU name, address, seal and **signatories** (Mayor, Accountant, Budget Officer, Treasurer, SB Secretary), printed on the forms. |
| Boards and My Work | Work management around the documents: boards from municipal templates, work items with assignees, due dates and status, linked DMS documents (ids only; access unchanged), My Work and dashboard deadlines. See [docs/work-management-integration.md](docs/work-management-integration.md) and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). |

Each document stores a frozen copy of its format. A document therefore always prints the way it was prepared, even after an admin revises the document type.

## Roles

| Role | Can |
|---|---|
| `superadmin` | Everything, including assigning roles and changing settings. **`npp@mgocandoniaccounting.org` is the superadmin**, once Firebase has verified the address (Google sign-in, or the verification link sent on registration). Set in `src/lib/owner.js` and `firestore.rules`. |
| `admin` | Manage document types, approve/deactivate regular users, view all documents |
| `user` | View formats and prepare documents. Sees **the documents they prepared** and **the documents waiting in their office** (to view, sign, release or return), not a colleague's documents. The **office head** (ticked under Users) sees every document of the office and every document routed through it. |

Firestore security rules (`firestore.rules`) enforce all of this on the server.

## Setup

### 1. Firebase

1. Create a **new Firebase project for DMS** at <https://console.firebase.google.com> (the live one is `candoni-fts-a2f16`, from when DMS was called FTS). Don't reuse the project of PMS-IMS or another app: DMS has its own users, rules and data.
2. **Authentication → Sign-in method →** enable **Email/Password** and **Google**.
3. **Firestore Database →** create a database (production mode).
4. **Project settings → Your apps →** add a Web app, copy its `firebaseConfig`, and paste the values into **`src/firebase-config.js`**. These values are not secret: access is controlled by Authentication and the Firestore rules. Commit and push.
5. **Storage** (for the PDFs and signed PDFs). Firebase Storage needs the **Blaze** (pay-as-you-go) plan: **⚙ → Usage and billing → Modify plan**, add a billing account, and set a **budget alert** (e.g. ₱500). The first 5 GB stay free. Then **Build → Storage → Get started** (production mode, location `asia-southeast1`).
6. Deploy the security rules (required, again after every update that changes them):
   ```bash
   npx firebase-tools login
   npm run deploy:rules           # Firestore and Storage rules, to candoni-fts-a2f16 (.firebaserc)
   ```
   Or paste `firestore.rules` into **Firestore → Rules** and `storage.rules` into **Storage → Rules**, and click **Publish**. Storage rules read Firestore (who may open a document): when the console asks to grant that access, allow it.
7. Let the browser download the PDFs (one time). In the Google Cloud console open **Cloud Shell** (the `>_` icon, top right) and run:
   ```bash
   echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json
   gsutil cors set cors.json gs://candoni-fts-a2f16.firebasestorage.app
   ```
   (the same `cors.json` is in this repository). Without it, signing and *Open PDF* fail with a network error.

### 2. Local development

**Quickest: no Firebase project needed.** You need Node.js 20+ and Java 21+.

```bash
npm install
npm run local        # local Firebase emulators + demo data + app at http://localhost:5173
```

Demo logins: `npp@mgocandoniaccounting.org` / `admin123` (superadmin, local demo only) and `user@fts.local` / `user123` (end user); `acctg@`, `budget@`, `treasury@` and `mayor@fts.local` / `user123` are the offices on the route. See [docs/LOCALHOST.md](docs/LOCALHOST.md).

**Against your real Firebase project:** paste the config into `src/firebase-config.js` (step 1), then `npm run dev`.

### 3. Netlify

1. Push this repo to GitHub, then in Netlify choose **Add new site → Import an existing project** and pick the repo.
2. That's all: `netlify.toml` already sets the build command (`npm run build`), the publish directory (`dist`) and the SPA redirect. The Firebase config is in `src/firebase-config.js`, so no environment variable is needed for DMS itself. The one exception is **Ask DMS**, the help assistant: it needs an Anthropic API key. In Netlify, open **Site configuration → Environment variables**, add `ANTHROPIC_API_KEY` with the key from console.anthropic.com (mark it secret), and redeploy. The key stays on Netlify, in the function `netlify/functions/assistant.mjs`; it never reaches the browser. Without it, Ask DMS answers that it is not set up yet. Each person can ask 50 questions a day (Philippine time), counted in Netlify Blobs (store `ask-usage`); to change it, add `ASK_DAILY_LIMIT` (a number) and redeploy. Also set a monthly spending limit for the key's workspace in the Anthropic Console.
3. **Automatic backup of the Archive to Google Drive** (optional): every 10 minutes the scheduled function `netlify/functions/drive-backup.mjs` copies new and changed processed documents (their PDFs, attachments and record) to a folder **DMS Archive** in a Google account's Drive. Set it up once:
   1. **Google OAuth client (lets DMS write to Drive).** In Google Cloud console, project **candoni-fts-a2f16**: **APIs & Services → Library → Google Drive API → Enable**. **OAuth consent screen**: External, app name DMS, your email; scopes: none to add; then **Publish app** (In production), so the connection does not expire after 7 days (DMS asks only for *drive.file*: it can see only the files it creates, so Google needs no review). **Credentials → Create credentials → OAuth client ID → Web application**; under **Authorized redirect URIs** add `https://candoni-fts.netlify.app/.netlify/functions/drive-auth` (and the same with `https://fts.mgocandoni.com` if that is the site's main address in Netlify). Add its **Client ID** and **Client secret** in Netlify as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (secret). Redeploy.
   2. **Connect the account.** In DMS, the Records Officer (or an admin) opens **Archive → Google Drive → Connect Google Drive** and signs in with the Google account that keeps the backups (e.g. the office's account). From then on it runs by itself; **Back up now** runs it at once. A large archive is copied over several runs the first time.

   No service account key is needed: the backup reads the archive as the Records Officer who connected it (with the same access they have in DMS), and keeps that sign-in and the Google access in Netlify's private storage (Netlify Blobs), which no browser can read. If that person stops being the Records Officer, someone who is connects it again.
4. **Email notifications** (optional, deferred for now: not switched on): every DMS notification (a document moved, a circular, a community) is also emailed to its recipient, from a mailbox you set in the same place. For a Gmail address: turn on 2-Step Verification for that account, create an **App Password** (Google Account → Security → App passwords), then add `SMTP_USER` (the Gmail address) and `SMTP_PASS` (the 16-letter App Password, marked secret), and redeploy. Another mail server: also set `SMTP_HOST` and `SMTP_PORT` (default `smtp.gmail.com`, 465). `EMAIL_FROM` changes the sender name (default `DMS <SMTP_USER>`). The function `netlify/functions/email.mjs` sends only notifications the signed-in user sent, only to DMS users. Gmail sends up to about 500 emails a day.
3. Deploy. Then add your Netlify domain under **Firebase → Authentication → Settings → Authorized domains**.
4. **Google sign-in shows the site's own address** (dms.mgocandoni.com instead of candoni-fts-a2f16.firebaseapp.com). The site signs in through its own address when it is listed in `OWN_AUTH_DOMAINS` (src/firebase-config.js); netlify.toml passes `/__/*` on to Firebase. For each such address: add it in Netlify (**Domain management → Add a domain alias**, and its DNS record); add it under **Firebase → Authentication → Settings → Authorized domains**; and in Google Cloud console, project **candoni-fts-a2f16**, **APIs & Services → Credentials → Web client (auto created by Google Service)**, add `https://dms.mgocandoni.com` under **Authorized JavaScript origins** and `https://dms.mgocandoni.com/__/auth/handler` under **Authorized redirect URIs**. Save; it can take a few minutes.

After that, every push to the branch Netlify watches redeploys the site by itself.

### 4. First run

1. Open the site and sign in with **Continue with Google** using `npp@mgocandoniaccounting.org`. That account becomes the **superadmin** right away. If you register with email and password instead, open the verification link that is emailed to you, then click **Check again**.
2. On that first sign-in DMS sets itself up: it installs the 11 starter formats (**DV, OBR, PR, PO**, FURS, Payroll, PCV, LR, IT, Travel Order, JO), the 210 checklists, and the LGU settings with the signatories. Only empty parts are filled; nothing you have edited is overwritten. Review them under **Document Types**, **Checklists** and **Settings**.
3. Other staff register themselves (Google or email). Approve them under **Users**.

When a later version of DMS revises a starter format (for example the DV, redrawn after the Municipal Government of Candoni's 2026 DV) or the checklist library, the next admin sign-in brings the update in by itself: formats nobody has edited and checklists nobody has changed in the editor are replaced, and the dashboard says what was updated. A format you have edited keeps your version; **Document Types** shows **Update format** next to it if you want the new one. Documents already prepared keep the format they were prepared with.

## Template reference

Formats are HTML with placeholders:

| Tag | Output |
|---|---|
| `{{payee}}` | Field value (HTML-escaped) |
| `{{amount\|peso}}` | Filters: `currency` (1,234.50; negatives print as (1,234.50)), `peso` (₱ 1,234.50), `acct` (accounting: a dash for nothing or zero, as on the DV), `date` (October 23, 2026), `words` (amount in words), `upper`, `number` |
| `{{controlNo}}` `{{today\|date}}` `{{preparedBy}}` | Document context |
| `{{lgu.name}}` `{{lgu.address}}` | From Settings |
| `{{sig.mayor}}` `{{sig.mayorPosition}}` | Signatories from Settings: `mayor`, `accountant`, `budget`, `treasurer`, `sbSecretary` (each with `…Position`) |
| `{{table:items}}` | Auto-rendered table for a line-item field, with blank filler rows and a totals row |
| `{{sum:items.amount\|peso}}` | Total of a table column |
| `{{#each items}}<tr><td>{{@no}}</td><td>{{description}}</td></tr>{{/each}}` | Custom row layout |
| `{{check:obr}}` | ☑ / ☐ for a checklist item |
| `{{#if mode=ADA}}&#10003;{{/if}}` | Shown only when a field equals a value (`{{#if field}}` when it has any value, `{{#if !field}}` when it is empty) |
| `{{lgu.seal}}` | Seal image URL (Settings, default `/municipal-seal.png`) |

Computed values: give a table column or a field a formula such as `qty*unitCost`, `gross-deductions`, `labor+spareParts+materials` or `sum:items.amount-cashAdvance`.

Form CSS classes (same as the PMS-IMS printed forms): `ph` header with `l1` / `l2` / `l3` lines, `pmeta-t` (unbordered meta lines), `pt` (bordered table), `lbl` (shaded label cell), `pf-box` (checkbox), `pf-cell`, `pf-signame` (signature line), `cap` (caption), `sig2` signature columns (`col`, `who`, `name`, `pos`), `r` / `c` alignment. "Generate from fields" in the template editor produces a starting layout with these. The rendered HTML is sanitized with DOMPurify.

## Data model (Firestore)

```
users/{uid}           email, displayName, office (assigned by an admin), requestedOffice, role, active
documentTypes/{id}    code, name, category, description, active, version,
                      paperSize (A4 | Folio | Letter | Legal), orientation, steps[], fields[],
                      checklistSource (own | disbursement | liquidation), checklist[],
                      processing[] {office, action, details}, template,
                      route[] {office ('' = preparer's office), action, sign} (Administration > Workflow)
checklists/{code}     code, kind (disbursement | liquidation), category, title, description,
                      headerFields[], items[] {id, label (document type), details?, required, group?}, basis[], notes[]
documents/{id}        typeId, typeCode, typeName, typeVersion, typeSnapshot, controlNo, office,
                      data{}, checklist{itemId: 'Y' | 'NA'}, additionalDocs[], links{itemId: [DMS doc | other system]}, transaction,
                      signatories (frozen), status (draft | complete | cancelled), title,
                      workflow {state, stage, received, steps[], events[]}, currentOffice, routeOffices[],
                      pdf {basis, files[] {path, kind (generated | signed), method (dms | upload), signer, reason, by, at, sha256}},
                      createdBy, createdByName, history[], createdAt, updatedAt
counters/FTS          value  (control number series for 2026, DMS-2026-######)
counters/DMS-{year}   value  (from 2027: DMS-2027-######, ...)
verifications/{sha256}  controlNo, typeCode, typeName, version, kind, signer, signatures, by, at  (public get, no list)
Storage: documents/{docId}/attachments/{itemId}/{time}-{name}  (files uploaded to checklist items)
Storage: documents/{docId}/{n}-generated.pdf, {n}-signed.pdf  (never replaced; storage.rules)
meta/settings         lguName, lguAddress, province, sealUrl, signatories{}, offices[]
boards/{id}           name, template, office, ownerUid, managers[], members[], viewers[], access[], names{}, groups[{id,name}]
workItems/{id}        boardId, groupId, title, status, priority, assignees[], office, startDate, dueDate, completedOn, tags[], docRefs[] (document ids)
workItems/{id}/activity/{id}  type, text, by, byName, at  (append-only)
```

## Scripts

```bash
npm run local         # run on localhost with local Firebase emulators and demo data
npm run local:reset   # clear the local data (fresh demo data on the next run)
npm run dev           # dev server against the Firebase project in .env.local
npm run build         # production build to dist/
npm test              # unit tests (template engine, formulas, checklists, checklist library data, starter formats)
npm run emulators     # local Firebase emulators only
npm run deploy:rules  # deploy Firestore rules and indexes
```
