# Running and using DMS on localhost

This guide shows how to run DMS on your own computer at **http://localhost:5173** and walks through using it.

When you run DMS locally you don't need a Firebase project or internet hosting. `npm run local` starts a **local copy of Firebase** (the Firebase emulators) with the same security rules as the live app, and loads demo accounts and the starter formats.

---

## 1. Install the tools (one time)

| Tool | Why | Get it |
|---|---|---|
| **Node.js 20 or newer** (LTS) | Runs the app | <https://nodejs.org> → download the **LTS** installer |
| **Java 21 or newer** | Runs the local Firebase emulators | <https://adoptium.net> → **Temurin 21 (LTS)** installer |
| **Git** | Downloads the code | <https://git-scm.com/downloads> |

To check, open **Command Prompt** (Windows) or **Terminal** (Mac) and run:

```bash
node -v      # v20.x or higher
java -version   # "21" or higher
git --version
```

On Windows, close and reopen Command Prompt after installing so it picks up the new tools.

## 2. Download the code (one time)

```bash
git clone https://github.com/npp-prog/fts.git
cd fts
git checkout ccr-fac8062d-2kj3lp     # the branch with the app (until it is merged)
npm install
```

## 3. Start DMS

```bash
npm run local
```

On the **first run** this:

1. downloads the Firebase emulators, which takes about a minute;
2. starts a local login service and a local database;
3. loads the demo data;
4. opens **http://localhost:5173** in your browser.

If your browser doesn't open by itself, open that address yourself.

You should see this in the terminal:

```
[DMS] Demo data loaded:
      Superadmin  npp@mgocandoniaccounting.org / admin123
      End user    user@fts.local / user123
      Offices     acctg@, budget@, treasury@, mayor@fts.local / user123
      Formats     DV, OBR, FURS, PAYROLL, PCV, LR, IT, PR, PO, JO
      Checklists  210 (disbursement and liquidation)
[DMS] Starting the app at http://localhost:5173 …
```

**To stop:** press **Ctrl + C** in the terminal, once. DMS saves your local data to the `.emulator-data` folder and loads it again the next time you run `npm run local`.

**To start over with fresh demo data:** stop DMS, run `npm run local:reset`, then run `npm run local` again. Do this once after updating DMS, so the demo data includes the latest formats and checklists.

> Everything here stays on your computer. Accounts and documents you create locally are not on the live site, and live data is not here.

---

## 4. Using DMS as an end user

Sign in as **user@fts.local** / **user123**.

**Dropdowns.** A dropdown with more than 5 choices (document types, offices, fields…) is searchable: click it, type part of a choice and pick it, or use the arrow keys and Enter. Dropdowns with 5 choices or fewer work as usual.

### Sign in

![Sign-in screen](images/01-sign-in.png)

A new person can click **Create an account**. An administrator then approves the account under **Users**. If an administrator already added your email in **Users** (**+ Add user**), there is nothing to approve: sign in with **Continue with Google** using that email, or create an account with it and open the verification link sent to your inbox, and DMS opens with the office, role and positions they set.

### My Profile: name, position, ID No. and picture

Open **My Profile** (left menu, or click your picture at the top right). Under **Details**, set your **Name**, your **Position** (job title or designation) and your **ID No.** (employee ID number), then click **Save details**. Your name and position show with you across DMS: at the top of the Dashboard, in Users, in Messages and when someone searches for a person to send or refer a document to (they can also search by position or ID No.). The documents you prepare keep your name and position, and print the position under your name (*Prepared by*; templates use `{{preparedByPosition}}` and `{{preparedByIdNo}}`).

**Profile picture.** If you sign in with Google, DMS uses your Google picture until you change it. Otherwise, or to change it, click **Upload picture** (or **Change picture**) and choose a JPG, PNG or WebP: DMS crops the middle into a square and saves it. **Remove** takes it off, and your initials show instead. Everyone in DMS sees your picture next to your name.

Your office, role, Office head and the positions that decide which workflow steps you act on (**Acts as**) are set by an administrator in Users, not here.

### Dashboard

![Dashboard](images/02-dashboard.png)

**My notes** (Dashboard) keeps your own notes and reminders; nobody else can see them, administrators included. Type one and click **Add** (or press Enter); **+ Date** adds a date to be reminded on, shown as *Today* or *Overdue*. Tick a note when it is done: it is archived at once, under **Archived**, where you can untick it to bring it back or delete it with ×.

**Messages** (menu, under Account) is for messages between users. **+ New message**, type a name or email, and write; Enter sends, Shift+Enter starts a new line. Replies appear at once, and the menu shows how many conversations have something new. Only the two people in a conversation can read it, administrators included.

**Notifications** (the bell at the top) has three parts. **Updates**: what happened to the documents you prepared (routed, returned, referred, signed, numbered, processed, with who did it and their remarks), circulars for your office, and communities you were added to; new ones are highlighted, click one to open it, **Mark all as read** or × to remove it. **Circulars to receive**: circulars for your office not marked received yet. **Waiting in** your office: the documents to act on. The number on the bell counts all of them.

**Folders** (menu, under Documents) keeps every document you may see, prepared in DMS or uploaded, in a folder per document type (DV, OBR, PR, Travel Order…); each folder shows how many documents it holds and when one last changed. Open a folder to see its documents and search them by control no., DRN, payee or preparer. **Tiles** or **List** (top right) switches between tiles and a table, for the folders and inside a folder; DMS remembers your choice on that device. Cancelled documents are left out.

**Access (office head).** Besides the preparer, the office head can give other people of the office access to the office's documents, as **Viewer** (opens the document and its files) or **Editor** (does what the preparer does: edits the draft, converts it to PDF and signs it, sends it on from the preparer's step, cancels it, deletes a draft):
- **A whole folder:** Folders → **Access** lists the people of the office. Under **Give access to**, choose a folder (a document type) or **All folders**; under **As**, **Viewer** or **Editor** (for all their folders); × removes a folder. They then see every document of the office in those folders, in Folders, their Documents and the Archive. An office's folders hold the documents prepared in that office (the preparer's office, shown on the document) and the documents routed to it. The office head sees all of them automatically and can give the people of the office access to them; an **Editor** edits only the office's own documents (a document routed in from another office is opened, not edited, through folder access). Administrators and the Records Officer see every office's documents in Folders: choose an office at the top to see only that office's folders (what its people with access see) and to set its access.
- **Folders of all offices (administrators and the Records Officer):** in Folders keep **All offices** at the top and click **Access**. **Add a person** (anyone, of any office), then choose the folders (or **All folders**) and **Viewer** or **Editor**. They then see those folders of every office, documents with no office included, and an editor does what the preparer does on them. This replaces the access their office head gave them; restricted documents stay out. In the office's own Access card the person shows as having access to all offices.
- **One document:** open it; in the **Access** card choose **Viewer** or **Editor**, click **+ Give access** and choose someone of the office; change the role there later, or × removes them. It is recorded in the document's History.
- **Restricted:** the office head can keep documents from the staff. In Folders → **Access**, **Restrict a folder** (× lifts it): no one opens the documents in that folder through folder access. On one document, tick **Restricted** in its **Access** card: the same for that document. Restricted documents are still seen by their preparer, the office head, administrators and the Records Officer, by the offices on their route while they act on them, and by the people given that document one by one in its Access card.

Only the office head, administrators and the **Records Officer** change access and restrictions; editors cannot. Administrators and the Records Officer do it for any office: in Folders → **Access**, first choose the office.

**Archive** (menu, under Documents) holds the **processed** documents: once the last office marks a document processed, its status shows **Processed** (instead of Complete), it leaves All/Office/My Documents and is kept here. Everyone sees the processed documents they may open; search by control no., DV/OBR no., payee, where it is filed or anything in the document, and filter by year, type or office. The **Records Officer** (a position in Users; administrators too) sees the whole archive and controls it:

- **Where it is filed.** Under **Filed at**, **Record where it is filed** (or **Change**): the cabinet, box or shelf of the paper, and a note.
- **Google Drive (automatic).** The **Google Drive** card: **Connect Google Drive** and sign in with the Google account that keeps the backups. From then on, every 10 minutes DMS copies each processed document (new or changed) to the folder **DMS Archive** in that Drive, by year and type, a folder per document with its PDFs, attachments and record.json; nobody needs to be signed in. **Several accounts:** the Records Officer and each administrator can connect their own Google account (**Connect my Google Drive too**); each Drive keeps its own full copy, and the same Google account cannot be connected twice. For each account the card shows who connected it, the last run and any problem; **Back up now** runs it at once; **Disconnect** stops it (the files stay in that Drive): your own, or anyone's for an administrator. An administrator sets it up once in Netlify (README).
- **Backups to devices (by hand).** These are not automatic: a browser cannot write to a drive by itself, so someone clicks **Back up** (the card's **How it works** explains it). **Devices and schedule**: add each device the archive is backed up to (the Records Office's computer, external drive, flash drive or network storage) and how often (every 7 days unless changed); **Save**. Each device shows its last backup and **Due** or **Up to date**; the Dashboard shows **Archive backup due** to the Records Officer. To back up: plug in the device, choose it and **New and changed since the last backup to it** or **Everything in the archive**, then **Back up**. It makes one ZIP: for each document its PDFs, attachments, step files and record (record.json), in folders by year and type, with index.csv. On a computer with Chrome or Edge a window opens to choose a folder on the device; on other browsers, tablets and phones it goes to Downloads, then move it to the device. Each backup is recorded in the **Backup log** (when, which device, how many documents, by whom). To stop backing up to a device, remove it in **Devices and schedule** (× next to it, then **Save**): its reminders stop, and its past backups stay in the log.

**Circulars** (menu, under Documents) are letters, memorandums, executive orders, office orders, notices and the like sent to other offices. An **office head** (or an administrator) clicks **+ New circular**, chooses the kind, types the title, attaches the file (**Upload a file**: a PDF or picture; or **A document already in DMS**: search by control no., type or subject, and its current PDF goes with the circular), and sends it to **All offices** or to **Chosen offices**. Everyone in those offices is notified. Someone in each office opens it and clicks **Mark received for** their office; the sender is notified, and sees under **Received** which offices have received it and who, and which have not yet.

**Communities** (menu, under Account) are groups for people who work together across offices, such as a committee. Anyone clicks **+ New community**, names it and adds members from any office; the one who created it, the head of their office and administrators can rename it, add or remove members (**Manage**) and delete it. Members write messages and share files (the 📎 button: PDF, pictures, Word, Excel, PowerPoint, text or ZIP files); a member can leave it under **Members**. Only members read a community's messages and files: an office head or administrator who manages a community but is not in it can rename it and change its members, not read it. New members are notified.

**Privacy.** The **Privacy** link (sign-in page, and at the bottom of the menu) opens the privacy notice under the Data Privacy Act of 2012 (RA 10173): what DMS keeps, why, who sees it, the service providers, how long records are kept, how they are protected, your rights, and the Data Protection Officer's contact (set by an administrator in **Settings → Data Protection Officer**). It is open to anyone, signed in or not. DMS signs you out after **60 minutes without activity** (in any of its tabs), so a DMS left open on a shared computer does not stay open; the sign-in page then says so. Each person reads only what their work needs; the record of actions (History, the route's events) and the PDF versions can only be added to, never changed or removed; an office can only move a document one step on or back along its route (or close it at its last step), never skip offices or change the route.

**Ask DMS** (the button in the bottom-right corner of every page) answers questions about using DMS: how to prepare, upload, route, sign or find a document. It answers from this guide, in English, Filipino, Hiligaynon or Ilocano. It cannot see your documents or change anything, and its answers can be wrong. Do not type personal information (names, TIN, account numbers) in it: questions are sent to an AI service (Anthropic) to answer. **New chat** starts over. Each person can ask up to **50 questions a day** (Philippine time); after that it says so until the next day (an administrator can change the number in Netlify: ASK_DAILY_LIMIT). It runs only on the live site (it needs the Anthropic key set in Netlify; see the README).

The dashboard shows:

- the five-step flow: choose the format → encode → checklist → print → process;
- **Needs your attention**: your drafts to finish and your completed documents to print;
- shortcuts to each document format;
- **At a glance**: your document counts.

### Document formats

There is no separate *Document Formats* menu: **Prepare Document** lists every form (DV, OBR, FURS, Payroll, PCV, LR, Itinerary of Travel, Travel Order, PR, PO and JO). Administrators can preview a format, with its guided steps, processing guide and blank printable form, under **Document Types → Preview**.

### Checklists

**Checklists** has all 210 checklists of the Municipal Accounting Office: 201 for disbursements and 9 for liquidations, grouped by category. Search by number or by words.

![Checklist library](images/04-checklists.png)

Open a checklist to read it or print a blank copy:

- an item with only a **Y** box (N/A shaded) is always required;
- an item with **Y** and **N/A** boxes is required only if it applies.

The printout follows the Accounting Office's Word checklist: A4, Times New Roman, numbered items. Every requirement has a **Document Type** (the generic name of the document, e.g. *BAC Resolution*) and **Document Details** (the instruction that specifies it).

![Checklist 1613](images/05-checklist-1613.png)

### Upload a document instead

**+ New document** (Dashboard or All Documents) opens a page where you choose the type of document, then **Prepare** (encode it in DMS) or **Upload** (a file you already have). Upload is for a document that already exists as a file: a scanned or signed form, a letter, a PDF from another system. Choose its type (or *Other document*), type the payee or subject (and fund and notes if you like), and choose the file: a PDF, or a photo or scan (JPG or PNG), which DMS turns into a PDF. It gets a control number like a prepared document, its file is its PDF (a PDF signed elsewhere keeps its signatures, which DMS checks), and it follows the workflow of its type at once: signed, forwarded and linked like any other. *Other document* is kept with a control number and not routed.

**Travel Order.** The Office of the Mayor's Travel Order prints as issued: the letterhead, the Travel Order No., the travelers (name and position), the date/s and the numbered purposes, the date given and signed, and the Mayor's approval. The preparer encodes the travelers, the date/s, the purposes and the date; the Office of the Mayor assigns the Travel Order No. when it opens it and puts it on the PDF, and the Mayor signs. On a site set up before it existed, an administrator adds it once: **Administration → Document Types → Load starter formats (TO)**.

**Mayor or Vice Mayor.** Every form approved by the Mayor (DV, PR, PO, JO, IT, Payroll, Travel Order and any format that prints the Mayor) asks the preparer **Approved by**: the Municipal Mayor or the Municipal Vice Mayor. With the Vice Mayor, the form prints the Vice Mayor's name and position (from Settings), and on the route the Vice Mayor's office is already chosen where the step lets the preparer choose between the two offices (Administration → Workflow, alternate office).

**One way to sign per person.** Whoever has registered a PNPKI certificate in **My Profile** signs with **Sign with PNPKI** (or **Upload signed PDF** from Acrobat); **E-signature** is then greyed out. Whoever has none signs with **E-signature**; the PNPKI buttons are then greyed out until they register a certificate.

**E-signature (no PNPKI certificate).** A signatory without a PNPKI certificate signs with **E-signature** (PDF and digital signatures): tap where it goes, and DMS puts their signature mark on the PDF with the words **e-signature**, their name and the date (they add the signature mark once in **My Profile**). It counts as the step's signature in the workflow and shows as *E-signed by* in the versions and history, and with an *e-signature* badge when the QR code is scanned. It is not a digital signature: the PDF carries no certificate.

**Third parties.** People outside the LGU who sign documents (e.g. the supplier's conforme on a PO, or a payee) register like anyone else; an administrator approves them in **Users** with the role **Third Party** (no office). They see **Documents for you** (the documents referred to them, and under **Sent back** those they already signed and returned, which they can still open), **Messages** (to write to LGU personnel, who can also message them) and **My Profile**: they open the document, sign it (PNPKI or e-signature) and **Send back**. They cannot join communities, see checklists, tracking, circulars or other documents, or prepare documents. To send a document to them, the office holding it uses **Refer to a person…** and picks them (marked *Third Party*).

**Printed as typed.** Entries print in capitals. In **Document Types**, tick **As typed** on a field or a table column to print it as typed instead (the Travel Order's position and purposes use this).

**Upload-only document types.** A document that is never prepared in DMS can still have its own type and workflow. In **Administration → Document Types → + New document type**, set **Documents of this type are** to **Uploaded only: no format**, and give it a code and name. It needs no fields, steps or template, it is not listed in Prepare Document, and users choose it in **Upload document**. Set its route in **Administration → Workflow** like any other type.

### Encode the details

Click **Prepare this document**, or go to **Prepare Document** and pick a format. Fill in each step. Everything you type is in capital letters, as on the official forms, and prints that way. The instructions for the step are shown in the blue box, and the preview on the right updates as you type. You can't go to the next step until the required fields (marked \*) are filled in.

![DV payee](images/09-dv-payee.png)

For line items, click **+ Add row**. On the DV, the **Explanation** is a paragraph box: write the particulars in full and press Enter for a new line; it prints the same way. Enter deductions as negative amounts: they print in parentheses, like `(164.73)`. The Amount Due fills in automatically. The printed names in boxes B, C and D come from Settings.

![DV particulars](images/10-dv-particulars.png)

### Checklist step: choose the transaction, tick what you attached

Only the **DV** and the **Liquidation Report** have a checklist (the other forms go straight to Review & Save). Their Checklist step asks for the **type of transaction**. Type a checklist number or some words (e.g. `1613` or `direct acquisition`, or `2002` for a liquidation of local travel) and pick one. Its checklist from the Municipal Accounting Office loads, and the preview on the right shows it as it will print. To pick another, click **Change**; the answers you already gave are cleared.

- tick **Y** for each document you attached;
- tick **N/A** for items that don't apply (always-required items have no N/A);
- the preview on the right shows the checklist as it will print, with your answers.

**Upload supporting documents.** On the document page, each checklist item also has **+ Upload file**: attach a scanned PDF or a photo (JPG or PNG, up to 20 MB) from your computer, tablet or phone camera. The item is ticked **Y**, the file is listed under it (and on the printed checklist as *Linked: File: …*), and clicking its name shows it in the document page's viewing area, with **Download**. Uploaded files are included in **Download all (ZIP)**, named like the rest, e.g. `GF_NEIL PRIOLO_03_TO_DMS2026000001.pdf`. The offices the document is routed to can open them too. Each file uploaded this way is also saved as a DMS document of its own: it gets a control number and the QR code, appears in **All Documents** as *Supporting document of DMS-…* (named after the checklist item), and its control number shows beside the file on the checklist. A photo or scan is saved as a PDF, and the file is renamed like every DMS file: Fund_Payee_Checklist No._Type_Control No., with its own control number (e.g. `GF_NEIL P. PRIOLO_02_OBR_DMS2026000009.pdf`); the name it was uploaded with is kept in its history.

**Other attachments.** A document that goes with this one but is not on its checklist can be added without changing the checklist: under the checklist on the document page, click **+ Add attachment**, type what it is, then **+ Link document** or **+ Upload file** under it, like a checklist item. It is numbered after the checklist, included in **Download all (ZIP)**, and recorded in History. × removes one that has nothing attached. (The preparer and administrators.)

**Linked and uploaded documents as tabs.** After the **Checklist** tab, the document page has a tab for every document linked or uploaded to the checklist, numbered as on the checklist (e.g. **02 OBR**, **03 TO**). A linked DMS document shows its own PDF, signed or not, exactly as it is: it is not merged into this document's PDF, so no signature is flattened or broken, and clicking a signature in it shows its details. Clicking a link under a checklist item opens its tab too.

**Link the supporting documents.** Under each item, **+ Link document** lets you pick a document already in DMS, of the kind the item asks for (under *Obligation Request* only OBRs, and FURS since the item accepts one; under *Purchase Request* only PRs) or enter a link to another system (PIM, CBO, CFMS, DMS) with its reference number. Property and supply documents generated by **PIM** (PMS-IMS): AIR, PAR, ICS, RIS, PTR, ITR, WMR, Pre/Post Inspection Report, History of Repair and RSMI open straight on the other-system tab with PIM chosen. A linked item is ticked **Y**. You can also add or remove links later on the document page, even after the document is complete (the preparer and administrators; each change is recorded in History). Links open from the document page, and the printed checklist shows them, e.g. *Linked: DMS-2026-000003 (OBR)* or *Linked: CBO: PR-2026-10-0031*.

Attaching something that is not on the checklist? Under **Additional documents**, click **+ Add document** and type it. They are numbered after the checklist's last item (after a 15-item checklist: 16, 17, …) and listed in the **Additional Documents** box of the printed checklist.

**Picked the wrong checklist, or the requirements changed?** On the document page, **Change checklist** (next to the checklist) opens the Checklist step to choose another type of transaction. Answers and links of requirements that are on both checklists (e.g. the DV and OBR) are kept; the others are cleared. Save again afterwards.

![Checklist step](images/11-dv-checklist.png)

**Review & Save** tells you what is still missing. **Mark complete** stays disabled until every required field and every always-required checklist item is done.

![Review](images/12-dv-review.png)

### Copy a document as a new draft

To prepare a document like one already in DMS (the same payee, items or purpose), open it and click **Copy as new draft** (at the top of the document page, next to Print; any document, also a completed or processed one). DMS makes a new **draft** of the same type in your office, with a new control number and the details the preparer encoded, and opens it to edit. It does not copy what the offices filled in along the route (DV No., check details, assigned numbers), the checklist ticks or links, the PDF or signatures; the date is today. Change what differs, then save it and mark it complete as usual. The new document shows *Copied from* with a link to the original. For an **uploaded** document, **Copy as new draft** opens **Upload a document** with the same type, payee/subject, fund and notes filled in: choose the new file and upload it.

### Delete a document

Only the **superadmin** can delete a document (**Delete**, at the top of the document page). Administrators cannot. The preparer (or an editor) can delete a **draft**: one never marked complete, or one that was routed, returned to the preparer's office and saved as a draft again (**Edit** → **Save as draft**). A document that is **complete**, or out on its route at another office, cannot be deleted by the preparer: ask the superadmin, or **Cancel document** instead (it stays on record as cancelled). Deleting also removes its QR record, so its QR code no longer shows it as genuine.

### Search by contents

The search box in **All/Office/My Documents**, **Archive** and **Folders** looks through everything in a document, not only its number and payee: every detail encoded in it (particulars, items, purpose, amounts, names), its reference numbers, who prepared it and where it is filed. Type several words to find the documents that have all of them; amounts are found with or without commas (12,500 or 12500). A PDF uploaded from now on is also found by the words in it (its first 30 pages). A scan or photo has no readable words, so search for it by its payee or subject.

### Print and process

The completed document gets a control number, e.g. `DMS-2026-000001`. Above the preview are two tabs: **DV** and **Checklist 1613**. **Print** prints whichever tab you are on, so print both and put the checklist on top of the attachments. Printing is automatic:

- **Portrait, one page.** Every form prints portrait on one page: the DV on Folio (8.5 × 13 in), everything else on A4. Forms that are too tall (many lines) or too wide (many columns) are scaled down to fit.
- **Fills the page.** When there is room left, the main table (particulars, items, employees) stretches to the bottom of the page, like a pre-printed form.
- **What you see is what prints.** The preview is the printed page, scaled to fit your screen. A very long checklist, such as competitive bidding, stays readable and continues on a second page. In the browser's print dialog, leave the scale at **Default** and the paper size as set. Then send the paper along its route (next section).

![Completed document](images/13-dv-document.png)

| The DV (Folio, 8.5 × 13 in) | The checklist cover sheet, filled in (A4) |
|---|---|
| ![DV printout](images/14-dv-print.png) | ![Checklist printout](images/15-dv-checklist-print.png) |

The checklist's header boxes (DV Number, OBR/FURS Number, Payee) fill in from the document.

### Workflow: where is the document?

When you **convert a document to PDF**, DMS starts its **workflow**: from then on the PDF goes from office to office along the route set under Administration → Workflow (or, if none is set, the steps of **How to process this document**). Marking it complete is not enough: the document leaves your office only as a PDF. For a DV: your office → Municipal Accounting Office → Municipal Treasurer's Office → Office of the Municipal Mayor → Treasurer's Office → Accounting. The **Workflow** card on the document shows each office, where the document is now, and who routed or returned it and when.

- **Route.** When the paper leaves your office, click **Route to Municipal Accounting Office**. From then on you can't edit the document.
- **No receiving.** Once routed, the document is at the next office: it finds it in its **Notifications** (the bell at the top, with the number waiting) and acts on it right away. There is no **Receive** button.
- **Route or return.** After acting on it, the office routes it to the next office, or clicks **Return to …** and says why (e.g. *OBR not signed*). The document goes back one office.
- **Mark processed.** The last office closes the route.

**Documents** shows a **Where** column for every document. An office sees the documents that have reached it on their route (not those still on their way to it). A document completed before this feature has a **Start workflow** button.

To try it locally, sign in one after the other (password `user123`) as `user@fts.local` (Engineering), `acctg@fts.local`, `treasury@fts.local` and `mayor@fts.local`. `budget@fts.local` is the Municipal Budget Office, on the OBR route.

### Convert to PDF and sign with your PNPKI digital signature

When the document is final, click **Convert to PDF** under **PDF and digital signatures**. DMS makes one PDF: the document, then its checklist (DV and LR). Then each signatory signs it while the document is in their office (after receiving it):

- **Register your digital signature once, in My Profile** (left menu, or click your name at the top). Upload your DICT certificate file (`.p12` or `.pfx`) and type its password to check it's yours; the password is not stored. Upload a picture of your handwritten signature as your **signature mark** (dark ink on white paper, or a PNG with a transparent background); DMS makes the paper see-through and crops it. Only you can use them, not even an administrator; change or remove them there any time, e.g. when DICT renews your certificate.
- **Password every time, or remembered on this device.** Under **When I sign** in My Profile, keep **Ask for my password every time** (recommended), or choose **Remember my password on this device** for 8 hours, 7 days, 30 days, 6 months, 1 year or 2 years and type it once (never past the date your certificate expires). It is kept only in that browser, encrypted with a key the browser cannot export, and never sent to DMS; it is forgotten when the time is up, when you change your certificate, or when you click **Forget it now**. While it is remembered, anyone using your DMS account on that device can sign as you, so use it only on your own device.
- **Sign in DMS.** Signing is open only at a step of the workflow that signs (ticked **Must sign the PDF** in Administration → Workflow) or to a person the document is referred to; at other steps **Sign with PNPKI** and **Upload signed PDF** are greyed out. Click **Sign with PNPKI**. Choose a size for your mark (Small fits a DV signature line), **tap the PDF where it goes** (e.g. the Signature line of your box; tap again to move it), type your certificate password and click **Sign PDF**. The mark is drawn there with *Digitally signed by NAME* and the date and time, and your digital signature covers it. Untick **Place my signature mark** to sign without it.
- **Send for review (optional).** Before a document is converted to PDF (a draft, or encoding complete), the preparer can send it to any active user for an initial review: in the **Review** card, type a name or email, add a note if you like, and click **Send for review**. It appears in their Notifications under *Forwarded to you*, marked *For review*. They can open and read it (not change it), and write back under **Your review**. The preparer sees each request as *Waiting* or *Reviewed*, with the comments. Nothing waits for the review: the preparer can convert the document whenever they are ready.
- **Returned for revision.** When a document is returned to the preparer's office, the preparer can **Edit** it again even though it was signed, then click **Make a new PDF** in *PDF and digital signatures*. The new PDF supersedes the signed one (kept under **Versions**, struck through as *superseded*), and the signing starts over: the preparer signs the new PDF and routes it, and each office on the route signs it again in turn. Reference numbers already assigned (e.g. the DV No.) stay.
- **QR code on every PDF.** Every PDF DMS makes (converted, or uploaded) has a QR code in the bottom right corner of each page, with *Scan to verify* and the control no. (a converted page is drawn a little smaller to leave room for it). Scanning it opens the document's public page, with no sign-in: whether it is genuine, its type and control no., payee or subject, office, reference nos., where it is on its route, who signed it and when, **the document itself** (its current PDF, with its signatures, to read on the phone; earlier versions stay private, and a cancelled document shows none), and **Check your copy**, which tells whether a PDF in hand is one DMS issued for it (the current one or an earlier version). **Payroll** (employees' pay) is the exception: its QR page shows everything but the PDF, which opens only for signed-in DMS users who handle it (*Open it in DMS*); **Check your copy** still works. An administrator sets this per document type in **Document Types → General → Public QR page** (on for every type but Payroll, unless changed); supporting documents of such a document follow it. Every uploaded file gets it too, whatever program made the PDF (Word, Excel, a scanner) and also on sideways pages. An uploaded PDF that is already signed gets it in an update after its signatures, which stay valid: DMS's check (Verify, and the QR page) says *DMS only added its QR code*, while anything else added after a signature is still reported. If a signed PDF is made in a way that does not allow even that, it is kept without a code. An uploaded document from before this change that has no code shows **This PDF has no DMS QR code yet** with **Add QR code** (for its preparer and administrators): it adds a new version of the PDF with the code. Their public page is created the next time someone handling the document opens it.
- **Supplemental documents.** Files that go with a document but are not on its checklist: in the **Supplemental documents** card (between *PDF and digital signatures* and *Workflow*), say what it is if you like and click **+ Upload** (PDF, or a photo or scan). Each is saved in **All Documents** with its own control number and QR code, named like every DMS file (…_SUPP_…), and opens as a tab after the PDF. The preparer and the office holding the document can add them; the preparer and administrators can remove one from the document (it stays in All Documents). **Download all (ZIP)** includes them.
- **The assigned reference no. goes on the PDF.** When a step assigns a reference no. (e.g. Accounting's DV No.), that office puts it on the face of the PDF, wherever they choose: *PDF and digital signatures* shows **Put the Disbursement No. on the PDF** with the number (and its date). The number DMS gives is a suggestion: **Edit** next to it changes the number or the date (recorded in the history) until it is on the PDF. Once it is on the PDF, **Change it** (under the signatures) takes it off: the PDF goes back to the version from before it was put on, and anything added at that step since, such as that office's signature, comes off too and is made again. The versions in between stay under **Versions**, marked *taken back*. **Change it** is there until the document is routed. If the step signs, they tap where it goes while signing and it is written with their signature; otherwise (or if they sign in Acrobat) they click **Place it**, tap the PDF and **Stamp it on the PDF** (a new version). **Route** stays off until it is on the PDF. A PDF converted again after the number was assigned prints it in the form instead.
- **Add text on the PDF.** Under **Reason**, tick **Add text on the PDF**, type it (e.g. *Approved for payment*), pick a size and tap the PDF where it goes: any part of any page, apart from your signature mark. With both the mark and text, choose what a tap places (*Signature mark* or *Text*). The text is written in the same step as your digital signature, so the signature covers it and it cannot be changed afterwards. It is listed under your signature as *Added text*. Every signatory on the route can do this when they sign.
- **Or sign in Adobe Acrobat.** Click **Upload signed PDF**, download the current PDF, sign it in Acrobat (or Foxit) with your PNPKI certificate, change nothing else, and upload it. DMS checks that it is the same PDF with your signature added.

Each signature is added after the ones already there, so they all stay valid, as when several people sign in Acrobat. The card lists every signature with ✓ (intact and matching the certificate) or ✗, and a **DICT PNPKI** badge when the certificate was issued by the PNPKI. **Versions** keeps every version (converted, then each signature). Once the PDF is signed the document can't be edited; if it was changed after converting and before anyone signed, **Convert again**. The document page shows the document in the centre and its cards (Workflow, PDF and digital signatures, Details, Checklist, History) on the right. Once converted, the **PDF** tab (**Signed PDF** once signed) shows the PDF itself inside the page, page by page, with its signatures on top; **View PDF** opens it. **Download PDF** gives you the current (signed) PDF, named like the bulk download, e.g. `GF_NEIL P. PRIOLO_01_DV_DMS2026000001.pdf`.

To try it locally you need a certificate file. Real PNPKI certificates come from DICT; for testing, any `.p12` works (DMS shows *Not PNPKI* for certificates from other issuers and asks before signing).

### See a signature and its certificate

Each signature with a mark is the signature itself, on the face of the PDF. **Click it** (in the PDF tab of the document page) to see its details: whether it is valid (the document has not changed since it was signed), when it was signed, the reason and location, and the certificate: who it was issued to, the issuer with a **DICT PNPKI** badge, its validity, serial number and certificate chain. The names at the top of the PDF open the same details, also for signatures without a mark. In a downloaded copy, click the signature in Adobe Acrobat or Foxit to see the same, with the trust of the DICT PNPKI root checked by the reader.

**Download all (ZIP).** On a DV, **Download all (ZIP)** puts the DV (its signed PDF, once converted), its checklist and every document linked to the checklist into one ZIP, each as a PDF named **Fund_Payee_Checklist No._Document Type_FTS No.**, for example:

```
GF_NEIL PRIOLO_01_DV_DMS2026000004.pdf
GF_NEIL PRIOLO_00_CHECKLIST 1613_DMS2026000004.pdf
GF_NEIL PRIOLO_02_OBR_DMS2026000003.pdf
GF_NEIL PRIOLO_05_PR_CBO PR-2026-10-0031.url
00_INDEX.txt
```

The checklist number is the item's number on the checklist (00 for the checklist itself). Documents linked from other systems (PIM, CBO, …) cannot be downloaded by DMS; they are included as shortcuts (`.url`) that open the link. `00_INDEX.txt` lists everything, including linked documents you have no access to. Admins can turn **Bulk download** on for other document types (Document Types → General). The DV Number box stays blank until Accounting assigns the number.

### Computed amounts (example: Liquidation Report)

Totals are computed as you type. On the Liquidation Report, for example, DMS computes the total amount spent and the amount to be reimbursed (total spent − cash advance + refund). (The liquidation type, e.g. **2002 – Local Travel**, was chosen in step 1.)

![LR computed amounts](images/17-lr-computed.png)

![LR checklist](images/18-lr-checklist.png)

---

## 5. Using DMS as an administrator

Sign out (top right), then sign in as **npp@mgocandoniaccounting.org** / **admin123** (local demo password). On the live site, `npp@mgocandoniaccounting.org` is the superadmin: sign in with **Continue with Google**, or register with email and password and open the verification link.

### Checklists

On **Checklists**, an administrator can:

- **load missing checklists** from the library (the button appears only when some are missing; the library is installed by itself on a new site, and edited checklists are never replaced);
- create a new checklist;
- edit or delete any checklist.

The editor shows the printed checklist as you edit. Each item has a **document type** and optional **document details**, is either **Always required (Y)** or **If applicable (Y / N/A)**, and can have a group heading (e.g. *Progress Payment*, *Final Payment*). In notes, put `**double asterisks**` around words to print them in bold.

![Checklist editor](images/19-admin-checklist-editor.png)

### Document types

The list can be searched by code, name or category, and shown by status (**Active** or **Inactive**). Each document type has six tabs: **General** (code, name, paper size: **A4**, **Folio (8.5 × 13 in)**, Letter or Legal), **Guided Steps**, **Fields**, **Checklist**, **Processing Guide** and **Format / Template**.

In the **Checklist** tab, **Checklist source** decides where the checklist comes from:

- **Own checklist**: a fixed list you write here;
- **Disbursement library** or **Liquidation library**: the wizard starts with *Type of Transaction*, as shown above.

![Checklist source](images/20-admin-checklist-source.png)

The **Processing Guide** tab has the routing steps: which office receives the document, in what order, and what each does.

![Processing guide editor](images/21-admin-processing-guide.png)

Fields can be **computed**: in a table column or a field, the formula combines other keys with `+`, `-` and `*`, and `sum:table.column` adds up a table column. For example, `qty*unitCost`, `gross-deductions` or `sum:items.amount-cashAdvance`.

### Settings and users

**Settings** (superadmin only) holds:

- the LGU name, address and seal;
- the **signatories**: Mayor, Accountant, Budget Officer, Treasurer and Secretary to the Sanggunian. These are printed where the official forms pre-print a name. Each document keeps the signatories that were set when it was prepared.
- the **office letterheads**: for each office, the title printed under the LGU (the Office of the Mayor's is *Office of the Mayor*), its email address and its contact no. A form prints the letterhead of the office it is from: the Travel Order always the Office of the Mayor's; other forms the office of the document unless **Document Types → Letterhead** names one. An email or contact no. left blank is not printed.

![Settings](images/22-admin-settings.png)

### Workflow: set the flow of every document

**Administration → Workflow → Routes** sets the route of each document type. Pick a type on the left; the right side lists its steps in order. For each step choose the **office** (or *Preparer's office*, whichever office prepared the document), type the **action** (what that office does, e.g. *Pre-audit, Box B and the JEV*), and tick **Must sign the PDF before routing** where that office signs with its PNPKI digital signature. The office can't route the document until it has signed. A signature stays valid for its step: when the document is returned to an office that already signed, it can route it again without signing, unless the document was converted to PDF again (the new PDF needs the signatures again). Add, remove and reorder steps with **+ Add step**, ×, ↑ and ↓. The preview at the top shows the route. Click **Save route**.

A step can also **assign a reference no.**: tick it, pick the field (e.g. *Disbursement No.*) and the date field, and set the number pattern, e.g. `{FUND}-{YYYY}-{MM}-{####}` → GF-2026-10-0045 (`{YYYY}` `{YY}` `{MM}` `{DD}` `{FUND}`, and `{####}` for the series, which starts again whenever the rest changes, e.g. each month or fund). When someone of that office first opens the document there, DMS fills in the next number and today's date (only if the field is empty), shows it in the workflow, Details and the form, adds it to that office's signature on the PDF, and finds it in the document search.

Some starter steps also **fill in details before routing** (the DV's Treasurer step: *Check/ADA No.*, *Check/ADA Date* and *Bank Name*) and **require an uploaded file** (*DV signed by the payee in Box E*). These come with the starter formats and show as badges on the step; they are no longer set in the route editor. At that step, after **Receive**, the Workflow card shows the fields and the upload, and **Route** stays off until both are done.

**Funds.** The Fund field of every form, and of Upload document, lists the funds in **Settings → Funds**: General Fund, Special Education Fund and Trust Fund. An administrator adds another there (one per line). A document saved with a fund no longer in the list keeps it.

**Records Officer and Download ZIP.** A user with the **Records Officer** position (Users) sees every document in **All Documents**, like an administrator (read only). Administrators and the Records Officer have **Download ZIP** there: choose the dates (when the documents were uploaded or prepared), and DMS puts the current PDF of each matching document (the search and filters on the page apply) in one ZIP, in a folder per type, with *index.csv* listing all of them, including those without a PDF yet.

**Positions: who in the office acts.** Not everyone in an office acts on a document: in Accounting the Reviewer, not the Encoder; in the GSO the Inspection or Acceptance Officer. Open a step and pick positions under **Who acts**; only the people of that office with one of those positions (and the office head) can sign and route it there. Others in the office see who the step is for. Give each user their position in **Users** (under their office); a user can hold more than one. The list of positions is in **Settings**, and **+ New position…** in Users or Workflow adds one on the spot. A step that names no position works as before: anyone in the office acts.

**Alternate offices on a step.** A step can name other offices that may handle it instead: open the step and pick them under **Alternate offices** (e.g. step 4 *Office of the Municipal Mayor*, or *Office of the Municipal Vice Mayor*). The route then reads *Office of the Municipal Mayor or Office of the Municipal Vice Mayor*. On the document page, the preparer chooses who handles each such step and clicks **Confirm these offices**; **Route** stays off until they do. They can change the choice until the document first leaves their office. Everything else about the step (its action, signature, reference no.) stays the same whichever office handles it.

**Third party step.** A step of a route can be for a **third party** instead of an office: in **Administration → Workflow**, open the step and choose **Office: Third party** (e.g. the supplier's conforme on a PO). When a document of that type starts its workflow, its preparer designates the person in the **Workflow** card (type the name or email of the supplier, payee or other user, then **Confirm**); it cannot be routed before. When the document reaches that step it is with that person: they find it in **Documents for you**, sign it if the step signs (PNPKI or e-signature), and route it to the next step (or return it). They can still open it afterwards.

**Refer to a person outside the route.** In **Users**, tick **May route documents to any person** for the users allowed to do this (administrators always can). While a document is with such a user's office, the Workflow card shows **Refer to a person…**: type a name or email, pick an active user, and say what they should do. The document goes to that person's Notifications (*Referred to you*). They act on it (they can sign the PDF; that signature does not count as the step's own), and click **Send back**. It returns to the office that referred it, and the route goes on. While it is out, the referring office can still open it but cannot act on it.

A type with no route yet follows its processing guide; the editor starts from it. New documents follow the saved route; documents already on their way keep the route they started with. Saving a route doesn't change the document format or its version.

**Tracking** (left menu, for everyone) shows the routed documents you can see: where it is now, its progress along the route, and the last action with any remarks. The tiles filter it (*On the move*, *In your office*, *Returned*, *Processed*, *All routed*), and **Now at** filters by office.

**Users** is where you approve new accounts and **assign each person to an office**. Each person is one row (name, email, office, Office head and positions, role, status); search by name, email, office or position, or show only those **Pending approval**. **Approve** activates a new account; **Edit** opens the person's office, role, positions, **Office head** and **May route documents to any person**, and **Deactivate**. Users see only the documents of their own office (and their own); administrators see all documents and can filter by office. The office someone types when registering is only a request, shown as *Asked for*. The list of offices is in **Settings**. Only the superadmin can make someone an administrator.

**Roles.** **User** (LGU personnel) and **Third Party** (outside the LGU), and four roles that run DMS for every office (all documents, document types, workflow, checklists, folder access, circulars, the archive):
- **Superadmin:** everything; the only one who gives the roles below, and the only one who deletes documents.
- **Admin:** everything, including **Settings** (not giving these roles, nor deleting documents).
- **IT Admin:** like Admin (adds, approves and edits users in **Users**), without Settings.
- **Records Officer:** like Admin (keeps the records, the archive and its downloads), without **Users** and Settings.
The superadmin sets the role in **Users** (Edit → Role) or when adding someone with **+ Add user**. Admin and IT Admin manage Users and Third Parties only, not the other roles. (The *Records Officer* position, given under an office, still lets a user see and download every document read-only; the Records Officer role does all of the above.)

**+ Add user** (top of Users) sets up a person before they sign up: their email, name, role (User, Third Party; Admin for the superadmin), office, positions, **Office head** and **May route documents to any person**. They are listed under **Added, not signed up yet** (Edit or Remove). When they first sign in with that email (Continue with Google, or an account with email and password once they open the verification link), their account is active at once with that setup, without approval. An email that is not verified never takes an added setup. Deactivating a user also removes their added setup, so signing in again does not reactivate them.

**Who sees what.** A user sees the documents they prepared and the documents waiting in their office to be signed and routed, so a signatory sees what they sign. They don't see a colleague's documents. Tick **Office head** next to a user's office to let them see every document of the office and every document that has reached the office on its route (not one still on its way to it). Administrators see all documents.

To try it locally: `user@fts.local` (Juan) and `ana@fts.local` (Ana, the office head) are in the Municipal Engineering Office: Ana sees Juan's documents, Juan doesn't see Ana's. `acctg@fts.local` sees a DV only while it waits in the Accounting Office; `leo@fts.local` (Health) sees none of them.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `java` is not recognized / "Java 21 or newer" | Install Temurin 21 from <https://adoptium.net>, then reopen the terminal |
| `Port 8080 is not open` or `port taken` | Another program is using that port. Close it, or change the ports in `firebase.json` (`emulators.firestore.port` / `emulators.auth.port`), `src/firebase.js` and `scripts/seed-local.mjs` |
| The page says "Firebase is not connected yet" | You ran `npm run dev` instead of `npm run local`. Use `npm run local` for the local copy |
| Want to use your real Firebase project locally | Paste your project's config into `src/firebase-config.js` and run `npm run dev` |
| Want fresh demo data | `npm run local:reset`, then `npm run local` |
| Local data isn't kept between runs ("Automatic export failed") | Stop with a single Ctrl + C and wait for "Export complete". On a network that forces a proxy (`HTTPS_PROXY` set), the save can fail. Clear that variable in the terminal before running `npm run local` |
