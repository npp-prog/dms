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

A new person can click **Create an account** (or **Continue with Google**). At the first sign-in, either way, the **Waiting for approval** page asks **Which office do you belong to?** (the list of offices in Settings, or *Not with an LGU office* for a supplier or payee) and **Are you the head of this office?**, then **Save** (**Change** later if needed). An administrator then approves the account under **Users**, where the row shows *Asked for: office · office head*; **Approve** gives the account that office (and office head) as asked, which the administrator can change under **Edit**. If an administrator already added your email in **Users** (**+ Add user**), there is nothing to approve: sign in with **Continue with Google** using that email, or create an account with it and open the verification link sent to your inbox, and DMS opens with the office, role and positions they set.

### My Profile: name, position, DMS account no. and picture

Open **My Profile** (left menu, or click your picture at the top right). Under **Details**, set your **Name** and your **Position** (job title or designation), then click **Save details**. Your **DMS account no.** (below) is your number in DMS; it replaces the former ID No. Your name and position show with you across DMS: at the top of the Dashboard, in Users, in Messages and when someone searches for a person to send or refer a document to (they can also search by position or DMS account no.). The documents you prepare keep your name and position, and print the position under your name (*Prepared by*; templates use `{{preparedByPosition}}`, and `{{preparedByDmsNo}}` for your DMS account no.).

**DMS account no.** Every DMS user, LGU employee or not (suppliers and payees too), has a DMS account number of 6 digits (e.g. *000123*), shown under **Details** in My Profile and in Users. It is given automatically when the account is approved (or at the next sign-in for accounts approved earlier), is never given twice and cannot be changed. People can be found by it when choosing a person.

**More than one office.** If an administrator gave you more than one office, the box at the top of the screen shows the office you are acting for (with *(head)* where you are its office head). Choose another to switch: DMS opens the Dashboard for that office, and your documents to act on, Tracking, folders, office-head rights and the documents you prepare follow the office you chose, until you switch again.

**Profile picture.** If you sign in with Google, DMS uses your Google picture until you change it. Otherwise, or to change it, click **Upload picture** (or **Change picture**) and choose a JPG, PNG or WebP: DMS crops the middle into a square and saves it. **Remove** takes it off, and your initials show instead. Everyone in DMS sees your picture next to your name.

Your office, role, Office head and the positions that decide which workflow steps you act on (**Acts as**) are set by an administrator in Users, not here.

**Email notifications.** Under **Details**, **Email me DMS notifications** (on unless you turn it off) has DMS email you from its mailbox (dms@mgocandoni.com) at your sign-in address: a document that reaches your office for you to act on (only those of the office who act on that step: its positions, and the office head), one referred to you, what happens to the documents you prepare, signature requests, circulars, community and work notices, and deadline reminders. Each email says what happened and has **Open in DMS**. Untick it to stop the emails; everything still shows under Notifications in DMS.

### Dashboard

![Dashboard](images/02-dashboard.png)

**My notes** (Dashboard) keeps your own notes and reminders; nobody else can see them, administrators included. Type one and click **Add** (or press Enter); **+ Date** adds a date to be reminded on, shown as *Today* or *Overdue*. Tick a note when it is done: it is archived at once, under **Archived**, where you can untick it to bring it back or delete it with ×.

**Messages** (menu, under Account) is for messages between users. **+ New message**, type a name or email, and write; Enter sends, Shift+Enter starts a new line. Replies appear at once, and the menu shows how many conversations have something new. Only the two people in a conversation can read it, administrators included. **Online:** a green dot on someone's picture (and *Online* under their name) shows they have DMS open now. The **Online** switch at the top right of Messages turns your own online status off (others then never see you online) or back on. **Reply to a message:** point at it (on a phone, tap ↩ next to it) and click **↩**: your message is sent under a quote of it, and clicking the quote shows the message it answers (× cancels the reply before sending). **Send a DMS document:** click **📎**, search and choose one of your documents (a short message is optional), then **Send**: it shows as a card that opens the document in DMS, only for those who may see it (sending it gives no access). Web links typed in a message are clickable: a DMS link opens in DMS, others in a new tab.

**Notifications** (the bell at the top) has three parts. **Updates**: what happened to the documents you prepared (routed, returned, referred, signed, numbered, processed, with who did it and their remarks), circulars for your office, and communities you were added to; new ones are highlighted, click one to open it, **Mark all as read** or × to remove it. **Circulars to receive**: circulars for your office not marked received yet. **Waiting in** your office: the documents to act on. The number on the bell counts all of them.

**Folders** (menu, under Documents) keeps every document you may see, prepared in DMS or uploaded, in a folder per document type (DV, OBR, PR, Travel Order…); each folder shows how many documents it holds and when one last changed. Open a folder to see its documents and search them by control no., DRN, payee or preparer. **Tiles** or **List** (top right) switches between tiles and a table, for the folders and inside a folder; DMS remembers your choice on that device. Cancelled documents are left out.

**Access (office head).** Besides the preparer, the office head can give other people of the office access to the office's documents, as **Viewer** (opens the document and its files) or **Editor** (does what the preparer does: edits the draft, converts it to PDF and signs it, sends it on from the preparer's step, cancels it, deletes a draft):
- **A whole folder:** Folders → **Access** lists the people of the office. Under **Give access to**, choose a folder (a document type) or **All folders**; under **As**, **Viewer** or **Editor** (for all their folders); × removes a folder. They then see every document of the office in those folders, in Folders, their Documents and the Archive. An office's folders hold the documents prepared in that office (the preparer's office, shown on the document) and the documents routed to it. The office head sees all of them automatically and can give the people of the office access to them; an **Editor** edits only the office's own documents (a document routed in from another office is opened, not edited, through folder access). Administrators and the Records Officer see every office's documents in Folders: choose an office at the top to see only that office's folders (what its people with access see) and to set its access.
- **Folders of all offices (administrators and the Records Officer):** in Folders keep **All offices** at the top and click **Access**. **Add a person** (anyone, of any office), then choose the folders (or **All folders**) and **Viewer** or **Editor**. They then see those folders of every office, documents with no office included, and an editor does what the preparer does on them. This replaces the access their office head gave them; restricted documents stay out. In the office's own Access card the person shows as having access to all offices.
- **One document:** open it; in the **Access** card choose **Viewer** or **Editor**, click **+ Give access** and choose someone of the office; change the role there later, or × removes them. It is recorded in the document's History.
- **Restricted:** the office head can keep documents from the staff. In Folders → **Access**, **Restrict a folder** (× lifts it): no one opens the documents in that folder through folder access. On one document, tick **Restricted** in its **Access** card: the same for that document. Restricted documents are still seen by their preparer, the office head, administrators and the Records Officer, by the offices on their route while they act on them, and by the people given that document one by one in its Access card.

Only the office head, administrators and the **Records Officer** change access and restrictions; editors cannot. Administrators and the Records Officer do it for any office: in Folders → **Access**, first choose the office.

**Archive** (menu, under Documents) holds the **processed** documents: once the last office marks a document processed, its status shows **Processed** (instead of Complete), it leaves All/Office/My Documents and is kept here. Its **supporting documents** (uploaded to its checklist or as supplemental documents, with their own control numbers) go with it: they also show **Processed**, leave the document lists and are in the Archive, with the same processed date — also one uploaded after the main document was processed. Everyone sees the processed documents they may open; search by control no., DV/OBR no., payee, where it is filed or anything in the document, and filter by year, type or office. The **Records Officer** (a role in Users; administrators too) sees the whole archive and controls it:

- **Where it is filed.** Under **Filed at**, **Record where it is filed** (or **Change**): the cabinet, box or shelf of the paper, and a note.
- **Google Drive (automatic).** The **Google Drive** card: **Connect Google Drive** and sign in with the Google account that keeps the backups. From then on, every 10 minutes DMS copies each processed document (new or changed) to the folder **DMS Archive** in that Drive, by year and type, a folder per document with its final PDF (not the earlier versions), its supporting documents (checklist attachments, files uploaded at route steps, supplemental documents, and in *supporting/* the final PDF of each DMS document linked to it — the OBR, Travel Order, JEV…) and record.json; nobody needs to be signed in. **Several accounts:** the Records Officer and each administrator can connect their own Google account (**Connect my Google Drive too**); each Drive keeps its own full copy, and the same Google account cannot be connected twice. For each account the card shows who connected it, the last run and any problem; **Back up now** runs it at once; **Disconnect** stops it (the files stay in that Drive): your own; someone else's only for an **Admin** or the **superadmin** (not IT Admin or the Records Officer). An administrator sets it up once in Netlify (README).
- **Backups to devices (by hand).** These are not automatic: a browser cannot write to a drive by itself, so someone clicks **Back up** (the card's **How it works** explains it). **Devices and schedule**: add each device the archive is backed up to (the Records Office's computer, external drive, flash drive or network storage) and how often (every 7 days unless changed); **Save**. Each device shows its last backup and **Due** or **Up to date**; the Dashboard shows **Archive backup due** to the Records Officer. To back up: plug in the device, choose it and **New and changed since the last backup to it** or **Everything in the archive**, then **Back up**. It makes one ZIP: for each document its final PDF (not the earlier versions), its supporting documents (checklist attachments, files uploaded at route steps, supplemental documents, and in *supporting/* the final PDF of each DMS document linked to it — the OBR, Travel Order, JEV…) and record (record.json), in folders by year and type, with index.csv. On a computer with Chrome or Edge a window opens to choose a folder on the device; on other browsers, tablets and phones it goes to Downloads, then move it to the device. Each backup is recorded in the **Backup log** (when, which device, how many documents, by whom). To stop backing up to a device, remove it in **Devices and schedule** (× next to it, then **Save**): its reminders stop, and its past backups stay in the log.

**Circulars** (menu, under Documents) are letters, memorandums, executive orders, office orders, notices and the like sent to other offices. An **office head** (or an administrator) clicks **+ New circular**, chooses the kind, types the title, attaches the file (**Upload a file**: a PDF or picture; or **A document already in DMS**: search by control no., type or subject, and its current PDF goes with the circular), and sends it to **All offices** or to **Chosen offices**. Everyone in those offices is notified. Someone in each office opens it and clicks **Mark received for** their office; the sender is notified, and sees under **Received** which offices have received it and who, and which have not yet.

**Communities** (menu, under Account) are groups for people who work together across offices, such as a committee. Anyone clicks **+ New community**, names it and adds members from any office; the one who created it, the head of their office and administrators can rename it, add or remove members (**Manage**) and delete it. Members write messages and share files (the 📎 button: PDF, pictures, Word, Excel, PowerPoint, text or ZIP files); a member can leave it under **Members**. Only the person who sent a message can delete it (**Delete** under their own message). The community's header shows how many members are **online** (click it to see who); online members have a green dot, in the conversation and in **Members** (listed first). Only members read a community's messages and files: an office head or administrator who manages a community but is not in it can rename it and change its members, not read it. New members are notified.

**Privacy.** The **Privacy** link (sign-in page, and at the bottom of the menu) opens the privacy notice under the Data Privacy Act of 2012 (RA 10173): what DMS keeps, why, who sees it, the service providers, how long records are kept, how they are protected, your rights, and the Data Protection Officer's contact (set by an administrator in **Settings → Data Protection Officer**). It is open to anyone, signed in or not. DMS signs you out after **60 minutes without activity** (in any of its tabs), so a DMS left open on a shared computer does not stay open; the sign-in page then says so. Each person reads only what their work needs; the record of actions (History, the route's events) and the PDF versions can only be added to, never changed or removed; an office can only move a document one step on or back along its route (or close it at its last step), never skip offices or change the route.

**Search (Dashboard).** The search box at the top of the Dashboard finds the documents you may see by control no., DRN, payee or anything in them: the first matches show as you type (click one to open it); Enter (or *See all results in Documents*) opens Documents with the search.

**Overdue documents.** A routed document is **overdue** when it has stayed **more than 3 days** with the same office (or person) without being routed on. The Dashboard shows **Overdue documents (over 3 days)** with the longest waiting, and **Tracking** has an **Overdue** tab (also a Dashboard tile), longest first; its **Days** column shows, for every document on its way, how many days it has been where it is now (in red when overdue).

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

**Reference No. already assigned.** A document whose reference no. was already assigned elsewhere (another web app, or stamped on the paper): type it in **Reference No.** on the Upload page. DMS keeps it as the document's reference no. (shown as its DRN, in Details, and found by search) and, when its route assigns the built-in Reference No., does not assign another one.

**Documents already partway through their route (transition to DMS).** For documents prepared before DMS (2026) that some offices already acted on, for example a DV signed by Accounting and on hold at the Treasurer's Office. Until the date an administrator sets (Settings → **Transition uploads**), the office that has the document now (or the Records Officer, or an administrator) uploads it:
1. **Upload**, choose the type (it must have a route), and tick **Already partway through its route**.
2. **Prepared by**: the DMS user who prepared it. It becomes theirs and their office's, and they are told it was uploaded and how it goes on. (For a form approved by the Mayor, also choose **Approved or disapproved by**.)
3. **It is now at**: the step it is at (only the steps of your office are offered).
4. **Done outside DMS**: for each earlier step, who acted and the date (optional, as on the paper), and the reference no. a step gave (e.g. the DV No.), typed as it is.
5. For the step it is at: its reference no. if already given (empty: the office assigns it in DMS), **This office already signed it on the paper** (it is not asked to sign again there), and **It is on hold at this office** with the reason.
6. The PDF scan of the document as it is now (with the signatures already on it), then **Upload document**.
The document is then at that step, as if it had come there through DMS: the office acts on it as usual (takes it off hold, signs, routes, returns, approves or disapproves) and it goes on along its route to the Archive. The Workflow card shows the earlier steps as **Done outside DMS (before DMS)** with who and when, and who uploaded it. Its waiting days count from the upload. Documents lists show it with a **Transition** badge.

**Purchase Request.** The **Department** is chosen from the offices in Settings. The **PR No.** is not typed in the draft: it is assigned along the route, by the office whose step in Administration → Workflow assigns it (tick *Assigns a reference no.* on that step and choose *PR No.*, with its pattern), and printed on the PR from then on.

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


**Travel Order: dates of travel.** **Date/s of travel** is chosen on the calendar: one day, or tick **More than one day** and choose the first (**From**) and last (**To**) day. The order prints them as *November 10, 2026*, *November 10-12, 2026* or *November 30 - December 2, 2026* (shown under the field, with the number of days). An administrator can give any format such a field: type **Date or dates (calendar)** in Document Types → Fields.

**Travel Order: destination.** The Travel Order's **Travel** step asks for the **Destination** (required), printed as typed in the order: *You are hereby directed to travel to* the destination *with the following Purpose/s on* the date/s.

**Travel Order: recommending approval and numbers.** Every Travel Order goes first to the **head of the requesting office** (a step only the office head can act on). The order prints a **Recommending Approval** line for the office head, who signs it there; when an **office head is among the travelers** (chosen from DMS), the order prints no Recommending Approval and the office head only reviews it and routes it on, with nothing to sign. The Travel Order No. is **EXEC-2026-0001** (Executive: the Office of the Mayor's series) or **LEGIS-2026-0001** (Legislative: the Office of the Vice Mayor's series).

The Travel Order's **Recommending Approval** and **Approved** blocks are centred on the page: the label, the space to sign and the name under it.

**Travel Order: Executive or Legislative.** In the **Issue** step, choose the **Signatory**: **Executive (Municipal Mayor)** or **Legislative (Municipal Vice Mayor)**. Executive: the order carries the Office of the Mayor's letterhead, goes to the Office of the Municipal Mayor, which assigns the Travel Order No. from the Mayor's series, and the Mayor signs. Legislative: the Office of the Vice Mayor's letterhead (Settings → Office letterheads: its title, email and contact no.), the order goes to the Office of the Municipal Vice Mayor instead, which assigns the Travel Order No. from its own series, and the Vice Mayor (Settings → Signatories) signs. Nothing else to choose in the Workflow card: the office follows the signatory.

**Names of employees and other persons (DMS account no.).** A field that names a person (the **Travelers** of a Travel Order, the **Name** on an Itinerary of Travel, the **Employees** of a Payroll, and any field an administrator makes a *Person* field, such as the parties of a contract) is filled by choosing the person from DMS: type part of their name, email or DMS account no. and pick them. Their name and DMS account no. are recorded together, and the **Position** next to them follows their DMS profile: their job title (My Profile) and the positions given in Users. One position: it fills in by itself; several: choose one in the dropdown; none in their profile: type it. The form prints *DMS No. 000123* under the name, for control (not on the Travel Order, which prints the travelers' names and positions only). **Change** chooses someone else. The person must have a DMS account; a name typed in an older document shows until the person is chosen, and the document cannot be completed until then.

**Signatories (formats without them).** Some document formats (made by an administrator) do not print the standard signatories of Settings, nor have signatory fields of their own. Their form then has a **Signatories** step: **Add a person** (type a name or email: their name and position fill in) or **+ Add someone not in DMS**, and for each, what they sign as (Noted by, Approved by…), their name and position. They print at the end of the document, in that order, each with a line to sign on (a format may place them elsewhere with `{{signatoriesBlock}}`). The step is optional: skip it if the document needs none.
### Checklist step: choose the transaction, tick what you attached

Only the **DV** and the **Liquidation Report** have a checklist (the other forms go straight to Review & Save). Their Checklist step asks for the **type of transaction**. Type a checklist number or some words (e.g. `1613` or `direct acquisition`, or `2002` for a liquidation of local travel) and pick one. Its checklist from the Municipal Accounting Office loads, and the preview on the right shows it as it will print. To pick another, click **Change**; the answers you already gave are cleared.

- tick **Y** for each document you attached;
- tick **N/A** for items that don't apply (always-required items have no N/A);
- the preview on the right shows the checklist as it will print, with your answers.

**Upload supporting documents.** On the document page, each checklist item also has **+ Upload file**: attach a scanned PDF, a photo (JPG or PNG) or a **ZIP file** (up to 20 MB) from your computer, tablet or phone camera. The item is ticked **Y**, the file is listed under it (and on the printed checklist as *Linked: File: …*), and clicking its name shows it in the document page's viewing area, with **Download**. Uploaded files are included in **Download all (ZIP)**, named like the rest, e.g. `GF_NEIL PRIOLO_03_TO_DMS2026000001.pdf`. The offices the document is routed to can open them too. Each file uploaded this way is also saved as a DMS document of its own: it gets a control number and the QR code, appears in **All Documents** as *Supporting document of DMS-…* (named after the checklist item), and its control number shows beside the file on the checklist. A photo or scan is saved as a PDF, and the file is renamed like every DMS file: Fund_Payee_Checklist No._Type_Control No., with its own control number (e.g. `GF_NEIL P. PRIOLO_02_OBR_DMS2026000009.pdf`); the name it was uploaded with is kept in its history.

**Other attachments.** A document that goes with this one but is not on its checklist can be added without changing the checklist: under the checklist on the document page, click **+ Add attachment**, type what it is, then **+ Link document** or **+ Upload file** under it, like a checklist item. It is numbered after the checklist, included in **Download all (ZIP)**, and recorded in History. × removes one that has nothing attached. (The preparer and administrators.)

**Linked and uploaded documents as tabs.** After the **Checklist** tab, the document page has a tab for every document linked or uploaded to the checklist, numbered as on the checklist (e.g. **02 OBR**, **03 TO**). A linked DMS document shows its own PDF, signed or not, exactly as it is: it is not merged into this document's PDF, so no signature is flattened or broken, and clicking a signature in it shows its details. Clicking a link under a checklist item opens its tab too.

**Link the supporting documents.** The Checklist card on the document page lists only the items ticked as attached; those marked N/A or not ticked are not included (the printed checklist, **View / print**, shows every item). Under each item ticked as attached (☑; not one marked N/A or left unticked: tick it first, with **Edit** or **Change checklist**), **+ Link document** lets you pick a document already in DMS, of the kind the item asks for (under *Obligation Request* only OBRs, and FURS since the item accepts one; under *Purchase Request* only PRs). Only documents in DMS are linked (not other systems): a document that is not in DMS yet is added with **+ Upload file** (it then gets its own DMS number). Links to other systems added before stay listed. A linked item is ticked **Y**. A document may be linked to any number of documents, unless its document type says **May be linked to only one document** (Document Types → General → Linking; e.g. an OBR, linked to its own DV only): then it is linked once, to one document, and DMS refuses a second link with where it is already linked; removing that link (or deleting that document) frees it. **Once the document is routed on, what it carried stays:** a link, an uploaded file or a supplemental document added before the document was routed to the next step can no longer be removed (no ×) while it is on its route. When the document is **returned to the preparer**, everything can be removed or changed again, until it is routed on once more. What the office holding it adds can be removed until that office routes it on. You can also add or remove links later on the document page, even after the document is complete (the preparer and administrators; each change is recorded in History). Links open from the document page, and the printed checklist shows them, e.g. *Linked: DMS-2026-000003 (OBR)*.

**Inspection and supplies.** On every library checklist, the **Acceptance and Inspection Report (AIR)** applies only if applicable (Y or N/A), followed by **Completion and Acceptance Report (CAR)** for when there is no AIR: tick Y on the one attached and N/A on the other. The **Requisition and Issue Slip (RIS)** is also only if applicable (N/A allowed).

Attaching something that is not on the checklist? Under **Additional documents**, click **+ Add document** and type it. They are numbered after the checklist's last item (after a 15-item checklist: 16, 17, …) and listed in the **Additional Documents** box of the printed checklist. Like a checklist item, each has **+ Link document** (a document already in DMS: here or on the document page) and **+ Upload file** (on the document page, once saved); what is linked or uploaded opens as a tab, numbered after the checklist.

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

The completed document gets a control number, e.g. `DMS-2026-000001`. Above the preview are two tabs: **DV** and **Checklist** (the checklist's number shows when the label fits). **Print** prints whichever tab you are on, so print both and put the checklist on top of the attachments. Tab labels have at most 10 characters, spaces included: a longer one is shortened, e.g. *03 Travel Order* shows as **03 TO**, and the full name shows when you point at the tab. Printing is automatic:

- **One page, or up to 5.** Every form prints portrait: the DV on Folio (8.5 × 13 in), everything else on A4. A form a little too tall (or too wide) is scaled down to fit one page (to 80% at most). A longer one (many travelers, lines or employees) continues on more pages at full size, up to 5 pages, each page breaking under a line, never through it; beyond 5 pages it is scaled down to fit 5. The PDF made from it has the same pages. A form's page footer (the Travel Order's blue #CandoniSHINE bar) prints at the bottom of every page.
- **Fills the page.** When there is room left, the main table (particulars, items, employees) stretches to the bottom of the page, like a pre-printed form.
- **What you see is what prints.** The preview is the printed page, scaled to fit your screen. A very long checklist, such as competitive bidding, stays readable and continues on a second page. In the browser's print dialog, leave the scale at **Default** and the paper size as set. Then send the paper along its route (next section).

![Completed document](images/13-dv-document.png)

| The DV (Folio, 8.5 × 13 in) | The checklist cover sheet, filled in (A4) |
|---|---|
| ![DV printout](images/14-dv-print.png) | ![Checklist printout](images/15-dv-checklist-print.png) |

The checklist's header boxes (DV Number, OBR/FURS Number, Payee) fill in from the document.

### Ask for signatures (documents outside any route)

A document that follows no route (for example a **certificate** uploaded under **Upload**, or a document type with no workflow) can still be signed by the people who must sign it, as in eGovDoc. On its page, in the **Signatures** card, the preparer (or an administrator) clicks **Ask for signatures**:
1. **Add who signs** (type a name or email: the office head, the Mayor, anyone in DMS), in the order they sign; for each, what they sign as (Noted by, Approved by…) if you like. ↑ changes the order, × removes someone.
2. For each person, click **Show where they sign** and tap the PDF where their signature goes: a box with their name shows there (tap again to move it).
3. Add a note if you like, then **Send for signature**.

The first person is notified (Notifications, email, and **Waiting for your signature** on their Dashboard); the document also appears in their Documents list at once, without reloading. They open the document, see their box on the PDF, and sign it under **PDF and digital signatures** (e-signature, or PNPKI): their signature mark starts in their box. Then the next person is notified, and so on; the preparer is told as each signs, and when everyone has. Someone who cannot sign clicks **Decline to sign…** and says why: the request stops and the preparer is told; they can fix the document and **Ask for signatures again**. An open document page follows by itself: when someone signs, declines, routes or returns it, the page (and the new signed PDF) updates without reloading, and the Documents, Tracking, Notifications and Archive lists reload when a new notification arrives. The preparer can **Withdraw the request** while it is out (signatures already on the PDF stay). The document's status shows **For Signature** while it is out, **Returned** if someone declined, and **For Processing** once everyone has signed. Then the preparer clicks **Mark processed** in the Signatures card: the document becomes **Complete** and moves to the **Archive** (it can no longer be changed), like a routed document whose last office marks it processed. Those asked to sign can open the document and find it in their Documents list.

### Pre-audit check (AI) for Disbursement Vouchers and Liquidation Reports

Only **Disbursement Vouchers** and **Liquidation Reports** have it (no other document type, nor their supporting documents on their own pages): each is checked together with its supporting documents. On a Liquidation Report it looks at the cash advance (amount, DV No.), the receipts behind each expense, the total spent, the refund (OR No.) or the amount to reimburse, the dates against the period covered, the travel documents (Travel Order, Itinerary, Certificate of Appearance) and Boxes A and B. On a DV that is converted to PDF, the **Municipal Accounting Office** (its staff and head; someone with more than one office switches to Accounting first) runs a check with AI in the **Pre-audit check (AI)** card: click **Run pre-audit check**. Others who may open the DV see the result once Accounting has run it, but cannot run it. It reads the DV as encoded, its checklist as ticked, and every PDF attached to it (checklist attachments, linked DMS documents such as the OBR, step uploads and supplemental documents), then lists what a pre-auditor may question, each marked **Must fix**, **Check** or **Note**: amounts (figures and words, totals, the OBR, invoice and PO), the payee, the order of dates, signatures, a required checklist item not ticked, an attachment that is not what its item says, unreadable pages. It takes a minute or two (you can keep working); the result stays on the DV for everyone who may open it, with who ran it and when, and **Check again** reruns it (the card says when the DV or its attachments changed since). It reads only what the person running it may open, at most 15 PDFs and 80 pages. It only suggests: it can miss or misread things, it changes nothing on the DV, and the Accounting Office decides. Each person can run it 20 times a day.

### Workflow: where is the document?

When you **convert a document to PDF**, DMS starts its **workflow**: from then on the PDF goes from office to office along the route set under Administration → Workflow (or, if none is set, the steps of **How to process this document**). Marking it complete is not enough: the document leaves your office only as a PDF. For a DV: your office → Municipal Accounting Office → Municipal Treasurer's Office → Office of the Municipal Mayor → Treasurer's Office → Accounting. The **Workflow** card on the document shows each office, where the document is now, and who routed or returned it and when.

- **Route.** When the paper leaves your office, click **Route to Municipal Accounting Office**. From then on you can't edit the document.
- **The route is the type's.** A document starts exactly the route saved for its type (Administration → Workflow): the same offices in order, the same signatures, positions and reference numbers. Before it leaves your office you only choose among a step's alternate offices, or the third party. If the type's route is not saved yet, DMS says so: ask an administrator to sign in (it saves it) or to save it in Workflow. At a step of your own office meant for someone else (e.g. the **Office head**), only they route it on; you can still cancel it there.
- **No receiving.** Once routed, the document is at the next office: it finds it in its **Notifications** (the bell at the top, with the number waiting) and acts on it right away. There is no **Receive** button.
- **Route or return.** After acting on it, the office routes it to the next office, or clicks **Return to …** and says why (e.g. *OBR not signed*). The document goes back one office.
- **Mark processed.** The last office closes the route.
- **Approve or disapprove.** Every approval step (the Mayor's or the Vice Mayor's office, any step whose action is an approval, or a step ticked **Approval** in Administration → Workflow) has both. **Approve:** sign the PDF (PNPKI or e-signature: approving is signing), then route it. **Disapprove…** (in the Workflow card): tap the PDF where the red **DISAPPROVED** stamp goes (with your name and the date), say why, and click **Stamp DISAPPROVED and disapprove**. The route ends there: the document shows **Disapproved**, can no longer be routed or changed, and the preparer is told why (they can **Copy as new draft** to prepare it again).
- **Mayor or Vice Mayor.** Every document whose route has an approval at the Mayor's office (or whose form prints the Mayor) asks who approves or disapproves it: **Executive (Municipal Mayor)** or **Legislative (Municipal Vice Mayor)** (the DV's Box D, the Travel Order's Signatory, or *Approved or disapproved by* on other forms). Legislative: the form prints the Vice Mayor, and the Mayor's steps go to the Office of the Municipal Vice Mayor, which approves (signs) or disapproves (stamps) it.
- **Put on hold.** The office holding a document (from the second step on) can click **Put on hold…** and say why (for example, it waits for a missing certification): the document stays with that office and cannot be routed, returned or referred until the office clicks **Take off hold**. The preparer is told both times, and the Workflow card shows since when and why it is on hold.

**Statuses.** Every document shows one of: **Draft** (being prepared, not yet converted to PDF), **For Processing** (converted to PDF, or uploaded, and on its way along its route), **Returned** (an office returned it, until it is routed on again), **On Hold** (an office put it on hold), **Disapproved** (an approving office disapproved it: its route ended), **Complete** (its route is done; it is in the Archive), or **Cancelled**. The Documents list can be filtered by them, and the Dashboard counts them under *At a glance*.

**Documents** shows a **Where** column for every document. An office sees the documents that have reached it on their route (not those still on their way to it): its staff can open them (and add supplemental documents) even after the document has moved on. A document **forwarded** or **referred** to you is also listed in your Documents and Tracking. **Attached documents:** a DMS document linked to a DV, an LR or any routed document (a Travel Order, an OBR, an Itinerary…) can be opened, from that document's tabs, by everyone who sees that document along its route (the offices it has reached, the people it is referred, forwarded or sent to sign), even if the attached document itself never went to them. Its PDF shows when it is open to them (not a Payroll's, whose PDF stays private: its encoded contents show instead). A document completed before this feature has a **Start workflow** button.

To try it locally, sign in one after the other (password `user123`) as `user@fts.local` (Engineering), `acctg@fts.local`, `treasury@fts.local` and `mayor@fts.local`. `budget@fts.local` is the Municipal Budget Office, on the OBR route.

### Convert to PDF and sign with your PNPKI digital signature

When the document is final, click **Convert to PDF** under **PDF and digital signatures**. DMS makes one PDF: the document, then its checklist (DV and LR). Then each signatory signs it while the document is in their office (after receiving it):

- **Register your digital signature once, in My Profile** (left menu, or click your name at the top). Upload your DICT certificate file (`.p12` or `.pfx`) and type its password to check it's yours; the password is not stored. Upload a picture of your handwritten signature as your **signature mark** (dark ink on white paper, or a PNG with a transparent background); DMS makes the paper see-through and crops it. Only you can use them, not even an administrator; change or remove them there any time, e.g. when DICT renews your certificate.
- **Password every time, or remembered on this device.** Under **When I sign** in My Profile, keep **Ask for my password every time** (recommended), or choose **Remember my password on this device** for 8 hours, 7 days, 30 days, 6 months, 1 year or 2 years and type it once (never past the date your certificate expires). It is kept only in that browser, encrypted with a key the browser cannot export, and never sent to DMS; it is forgotten when the time is up, when you change your certificate, or when you click **Forget it now**. While it is remembered, anyone using your DMS account on that device can sign as you, so use it only on your own device.
- **Sign in DMS.** Signing is open only at a step of the workflow that signs (ticked **Must sign the PDF** in Administration → Workflow) or to a person the document is referred to; at other steps **Sign with PNPKI** and **Upload signed PDF** are greyed out. Click **Sign with PNPKI**. Choose a size for your mark (Small fits a DV signature line), **tap the PDF where it goes** (e.g. the Signature line of your box; tap again to move it), type your certificate password and click **Sign PDF**. The mark is drawn there with *Digitally signed by NAME* and the date and time, and your digital signature covers it. Untick **Place my signature mark** to sign without it.
- **Send for review (optional).** Before a document is converted to PDF (a draft, or encoding complete), the preparer can send it to any active user for an initial review: in the **Review** card, type a name or email, add a note if you like, and click **Send for review**. It appears in their Notifications under *Forwarded to you*, marked *For review*. They can open and read it (not change it), and write back under **Your review**. The preparer sees each request as *Waiting* or *Reviewed*, with the comments. Nothing waits for the review: the preparer can convert the document whenever they are ready.
- **Returned for revision.** When a document is returned to the preparer's office, the preparer can **Edit** it again even though it was signed, then click **Make a new PDF** in *PDF and digital signatures*. The new PDF supersedes the signed one (kept under **Versions**, struck through as *superseded*), and the signing starts over: the preparer signs the new PDF and routes it, and each office on the route signs it again in turn. Reference numbers already assigned (e.g. the DV No.) stay.
- **QR code on every PDF.** Every PDF DMS makes (converted, or uploaded) has a QR code in the bottom right corner of each page, with *Scan to verify* and the control no. (a converted page is drawn a little smaller to leave room for it). Scanning it opens the document's public page, with no sign-in: whether it is genuine, its type and control no., payee or subject, office, reference nos., where it is on its route, who signed it and when, **the document itself** (its current PDF, with its signatures, to read on the phone; earlier versions stay private, and a cancelled document shows none), and **Check your copy**, which tells whether a PDF in hand is one DMS issued for it (the current one or an earlier version). **Payroll** (employees' pay) is the exception: its QR page shows everything but the PDF, which opens only for signed-in DMS users who handle it (*Open it in DMS*); **Check your copy** still works. An administrator sets this per document type in **Document Types → General → Public QR page** (on for every type but Payroll, unless changed); supporting documents of such a document follow it. Every uploaded file gets it too, whatever program made the PDF (Word, Excel, a scanner) and also on sideways pages. An uploaded PDF that is already signed gets it in an update after its signatures, which stay valid: DMS's check (Verify, and the QR page) says *DMS only added its QR code*, while anything else added after a signature is still reported. If a signed PDF is made in a way that does not allow even that, it is kept without a code. An uploaded document from before this change that has no code shows **This PDF has no DMS QR code yet** with **Add QR code** (for its preparer and administrators): it adds a new version of the PDF with the code. Their public page is created the next time someone handling the document opens it.
- **Supplemental documents.** What goes with a document but is not on its checklist: in the **Supplemental documents** card (between *PDF and digital signatures* and *Workflow*), say what it is if you like, then either click **+ Upload** (PDF, a photo or scan, or a ZIP file), or **+ Link DMS document** and pick a document already in DMS (search by control no. or payee). An uploaded file is saved in **All Documents** with its own control number and QR code, named like every DMS file (…_SUPP_…); a linked document keeps its own number and route. Every supplemental document opens as a **tab** after the PDF. A **ZIP file** (on a checklist item or as a supplemental document) is kept as it is, without a DMS number or QR code (it has no pages): it is listed with *ZIP* and downloads when opened. Anyone on the document's route can add them while it is on its way: the preparer, the office holding it, the staff of every office it has already reached, and a person it was referred to; the preparer and administrators can remove one from the document (it stays in All Documents). **Download all (ZIP)** includes them.
- **The assigned reference no. goes on the PDF.** When a step assigns a reference no. (e.g. Accounting's DV No.), that office puts it on the face of the PDF, wherever they choose: *PDF and digital signatures* shows **Put the Disbursement No. on the PDF** with the number (and its date). Only the number is printed (e.g. *2026-0005*, not *Travel Order No. 2026-0005*), so place it beside the form's own label. The number DMS gives is a suggestion: **Edit** next to it changes the number or the date (recorded in the history) until it is on the PDF. Once it is on the PDF, **Change it** (under the signatures) takes it off: the PDF goes back to the version from before it was put on, and anything added at that step since, such as that office's signature, comes off too and is made again. The versions in between stay under **Versions**, marked *taken back*. **Change it** is there until the document is routed. If the step signs, they tap where it goes while signing and it is written with their signature; otherwise (or if they sign in Acrobat) they click **Place it**, tap the PDF and **Stamp it on the PDF** (a new version). **Route** stays off until it is on the PDF. A PDF converted again after the number was assigned prints it in the form instead.
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

### Boards and My Work (tasks around the documents)

**Boards** (menu, under Work) organize the work of an office, a transaction or a project: who does what, and by when. The documents themselves stay in DMS, with their own route and approvals.

- **+ New board**: name it, choose a **template** (Office task monitoring, Municipal transaction monitoring, Accounting Office work, Municipal project implementation, Administrative and digitalization projects, Interoffice requests, Accounting and administrative follow-ups, or Blank), the office, and add **people** by name or email as **Manager** (board settings and people), **Member** (creates, edits and assigns work items) or **Viewer** (reads only). The template only gives the board its first **groups** (e.g. *DV review*, *Payroll review*, *RCD submissions* for Accounting); a manager renames, adds or removes them under **Settings**.
- **Work items**: under a group, **+ Add work item**. An item has a title, description, **status** (Not Started, In Progress, Blocked, For Review, Completed), **priority**, the people **assigned** (people on the board), the **responsible office**, **start** and **due** dates, and tags. Click an item to open its details; **Save** keeps the changes, and its **Activity** lists who changed what and when. Search, filter by status or *Assigned to me*, and sort by due date, priority, status or title.
- **Linked documents**: in an item, **+ Link a DMS document** picks a document you may open; **Upload a new document** opens Upload in a new tab, then link it. Each linked document shows its number, type, status and where it is on its route (e.g. *With Municipal Accounting Office: Pre-audit*, *Returned to …*, *Processed*); click it to open it as usual. Someone on the board who may not open that document sees only *Restricted document*: being on a board never opens a document. An item's status is the task's progress only: completing it does not approve, route or process the document.
- **From a document**: the **Work items** card on its page lists the items that link it (on your boards), with **+ Create work item** (a new item on one of your boards, already linked to it) and **+ Add to a work item**.
- **My Work** (menu, under Work) lists the open items assigned to you on every board: **Overdue**, **Due today**, **Next 7 days**, **Blocked**, and **For my review** (items you created that someone marked For Review). Someone assigned to an item but only a viewer on its board can change its status. The **Dashboard** shows overdue work, work due today, blocked work and work due this week; each opens My Work.
- Due dates are calendar days in Philippine time; an item completed is never overdue.
- **Everyone in an office** sees the boards of their office (a board's **Office**) and their work items, as viewers, even if not added to them; the board's people (members, managers) edit them.
- **Office heads** manage every board of their office (a board's **Office**), even ones they are not on, as its managers do: its **Settings** (name, groups, people, columns), and creating, editing, assigning and deleting its work items. **Delete board** (at the top of a board) removes the board and all its work items; the DMS documents they link are not affected. It is shown to the person who created the board, the head of the board's office, and administrators. It cannot be undone.
- **Card color**: **Color** (at the top of a board) gives the board a color, shown on its card in the board list and on the board itself. It is set by the head of the board's office, its managers and administrators.
- **Archive** (at the top of a board or a project) puts away finished work without deleting it: an archived board or project becomes read-only (no new or changed work items, comments, milestones, issues or progress), and it is left out of the lists, Reports, the Dashboard and deadline reminders. **Archived boards** / **Archived projects** (next to + New) list them; open one and click **Restore** to bring it back. Archive and Restore are shown to the board's or project's managers, the head of its office, and administrators. Office heads also see every project of their office (its **Implementing office**), as they do boards.
- **Kanban**: the **Table / Kanban** switch at the top of a board (remembered on your device) shows the items as cards in a column per status; drag a card to another column to change its status (members, or the item's assignee). It changes only the task's status. Subtasks show in the table, under their item.
- **Checklist**: in an item, type a line and **Add**; tick lines as they are done (the assignee can tick them too); **Save** keeps the changes. The table shows ✓ done/total.
- **Subtasks**: in an item, **Add subtask** creates a work item under it (shown indented in the table); open it to assign it or set its dates.
- **Comments**: in an item, write a comment and click **Comment**. **Mention someone…** adds *@Name* of a person on the board: they are notified (Notifications, and My Work → **Mentions**). Comments cannot be edited or deleted.
- **Notifications**: you are notified when someone assigns you a work item or mentions you; the notice opens the item.
- **Calendar**: the third view of a board shows its work items on their due dates (red: overdue, yellow: blocked, green: completed); ‹ › change the month.

### Projects

**Projects** (menu, under Work) keep municipal projects: **+ New project** with its **project code**, name, **implementing office**, status (Planning, Ongoing, On Hold, Completed, Cancelled), start and target completion dates, and, if it applies, the **funding source** and **approved budget**; add people as **Manager** (details, people and budget), **Member** (milestones, progress, issues, links) or **Viewer**. A project's tabs:
- **Overview**: its details, **physical progress** and **funding**. **Update progress** sets the physical progress (%) with a required **explanation** (what was accomplished and how it was measured); every update is kept, with who made it and when, and cannot be changed. Financial figures are kept apart: only the approved budget, entered by a manager; obligations and disbursements are not computed from document amounts.
- **Milestones**: add them with a due date; tick one when done (overdue ones show in red, and on the Dashboard as **Upcoming milestones** in the next 14 days).
- **Risks & issues**: record a risk, issue or blocker with its severity; **Mark resolved** (or **Reopen**).
- **Work items**: **Relate a board**, then the board's work items whose **Related project** is this one are listed here; **+ New work item for this project** adds one. In any work item, **Related project** sets it.
- **Documents**: **+ Link a DMS document** (or upload one first). As on boards, someone on the project who may not open a document sees it as restricted.
- **Calendar**: milestones (◆) and the due dates of the project's work items.
On a document's page, the **Work items and projects** card also lists the projects that link it, with **Link to a project…**.

- **Linked documents** show where each is on its route: *Under review* or *Awaiting approval* (a step that signs) at an office, *Returned for correction*, *Forwarded* to a person, or *Completed*, with *Step 2 of 4*.

### Reports, exports, reminders, saved views and board columns

- **Reports** (menu, under Work) count only the boards, work items and projects you can already see:
  - **Aging and overdue**: the open work items by how overdue they are (*Not overdue*, *1–7*, *8–30*, *31–60*, *over 60 days*); click a box to list only those. Each row shows its due date, days overdue and how many days it has been open; click it to open the item. Filter by board and responsible office.
  - **Workload**: per responsible office (or **By person**): open items, overdue, blocked, due in the next 7 days, and completed in the last 30 days. Click an office or person to see their items under Aging and overdue.
  - **Projects**: each project's status, physical progress (as last reported), milestones done and overdue, open risks and issues, approved budget and days to the target date.
  - The Dashboard's **Work overview** shows the work per office (each opens its report) and the progress of ongoing projects.
- **Export CSV** (on a board, and on each report) saves what is listed, with the filters, as a spreadsheet file. A board's manager chooses in **Settings** who may export its items: **managers and members** (the usual), **managers only**, or **everyone on the board**. Projects are exported by their managers and members. Items from boards that do not let you export are left out (the report says how many). An export never names a linked document: it gives only how many are linked.
- **Deadline reminders**: the people assigned to a work item are reminded the day before it is due, on the due date, and once when it is overdue (in Notifications, as **Reminder**, from *DMS reminders*, and by email when email is set up). Once an administrator has set up the reminder sender, they go out every morning at 7:00; otherwise when someone on the board opens DMS that day. Each is sent only once. A manager can switch them off for a board in **Settings** (*Send deadline reminders*).
- **Saved views**: on a board, set the search, status, sort, *Assigned to me* and the view (Table, Kanban or Calendar), then **Save view** and name it; choose it later under **Saved views…**. Your views are yours; a board manager can tick **Share with everyone on the board**. **Manage saved views** deletes one.
- **Board columns**: in a board's **Settings**, **+ Add a column** of your own: text, number, amount (₱), date, dropdown (type its choices separated by commas), checkbox, person on the board, or office. They show in the table after the standard columns, in each work item (members fill them in), in its activity, and in exports. A column's type is fixed once saved; renaming it keeps its values; **Hide** removes it from view and keeps its values (**Show again** brings it back).

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

**Document Types** and **Workflow** are for administrators (the superadmin, Admin and IT Admin), not the Records Officer.

The list can be searched by code, name or category, and shown by status (**Active** or **Inactive**). Each document type has six tabs: **General** (code, name, paper size: **A4**, **Folio (8.5 × 13 in)**, Letter or Legal), **Guided Steps**, **Fields**, **Checklist**, **Processing Guide** and **Format / Template**.

In the **Checklist** tab, **Checklist source** decides where the checklist comes from:

- **Own checklist**: a fixed list you write here;
- **Disbursement library** or **Liquidation library**: the wizard starts with *Type of Transaction*, as shown above.

![Checklist source](images/20-admin-checklist-source.png)

The **Processing Guide** tab has the routing steps: which office receives the document, in what order, and what each does.

![Processing guide editor](images/21-admin-processing-guide.png)

**Attaches a document (link)**: the office at that step attaches a document already in DMS, by link (for example the **JEV** that Accounting makes after the DV No.; the same step can be set on any document type's route). Type **What it attaches** (the name of its tab, e.g. *JEV*) and tick **Required before it routes the document on** if the step may not route it without it. At that step, the Workflow card shows the box with **+ Link document** (the office's documents; *Upload it* opens Upload in a new tab when it is not in DMS yet); what is linked opens as a tab of the document, and everyone on its route can open it. To keep JEVs in DMS, an administrator creates a document type for them (e.g. *Uploaded only*), which the office uploads and then links.

Any step can be ticked **Office head only**: only the head of that office acts on it (signs and routes it) — of Accounting, Treasury, the Mayor's office…, of the office chosen instead when the step has alternates, or, at the preparer's office, the head of the office that prepared it (the Travel Order's recommending approval). *Who acts* positions do not apply then. A step at the Mayor's office that assigns a number can have its own **Pattern when the Vice Mayor's office numbers it** (the Travel Order: `EXEC-{YYYY}-{####}`, and `LEGIS-{YYYY}-{####}` for the Vice Mayor's office). A Travel Order route saved in Workflow before this update: click **Start from the processing guide**, then **Save route**, to get the office-head step and the EXEC/LEGIS numbers.

**Assigns a reference no.** keeps the number in one of the form's text fields; a document type with none (an *Uploaded only* type) uses the built-in **Reference No.** (stamped on the PDF, not printed by a form). Tick **Already on the document: do not stamp it on the PDF** when the number is already on the paper (stamped or written by the office): it is still assigned, recorded and searchable (DRN), but routing does not wait for it to be put on the PDF.

In **Workflow**, a step's **Approval: approve (sign) or disapprove** box makes it an approval step (ticking it also ticks *Must sign*): the office approves by signing or disapproves with the DISAPPROVED stamp. Steps at the Mayor's or the Vice Mayor's office, and steps whose action is an approval, are ticked by default.

A field (or a table column) of type **Person (DMS account)** is filled by choosing a DMS user: it stores the name under its key, the person's DMS account no. under *key*`DmsNo` (print it with `{{keyDmsNo|dms}}`, e.g. `{{nameDmsNo|dms}}` → *DMS No. 000123*; inside a table loop the same, per line) and the user under *key*`Uid`. A table printed with `{{table:key}}` puts the DMS No. under the name by itself. The Travel Order, Itinerary of Travel and Payroll use it for the travelers and employees (sites with these formats unedited are updated automatically; an edited one: **Update format**).

Fields can be **computed**: in a table column or a field, the formula combines other keys with `+`, `-` and `*`, and `sum:table.column` adds up a table column. For example, `qty*unitCost`, `gross-deductions` or `sum:items.amount-cashAdvance`.

### Work management settings

**Board Templates** (Administration; administrators) are the templates offered when someone creates a board. The page lists them (with how many groups each has; ↑ ↓ change their order); click one to edit its name, description and groups (one per row, in order: ↑ ↓ to move one, × to remove it, **+ Add a group**, or Enter in a group to add one below it), then **Save** (or **Remove template**). **+ New template** adds one; **Starter templates** puts back the original list. A new board copies its template's groups, so changing or removing a template does not change existing boards.

Work management (boards, projects, reports) needs the latest `firestore.rules` published in the Firebase console (Firestore → Rules) after each update. Administrators see every board and project, and may export from every board. Reports read at most 40 boards (each up to 500 work items) and 100 projects.

**Daily deadline reminders (7:00 a.m.)** need a Google service account, set up once:
1. In the Google Cloud console, the DMS's Firebase project: **IAM & Admin → Service Accounts → Create service account** (for example *dms-reminders*), with the role **Cloud Datastore User** only.
2. Open it → **Keys → Add key → Create new key → JSON**; a file downloads.
3. In Netlify → Site configuration → **Environment variables** (scope Functions, secret): **GOOGLE_SA_EMAIL** = the file's *client_email*, **GOOGLE_SA_PRIVATE_KEY** = its *private_key* (from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----`).
4. **Deploys → Trigger deploy**; then Logs → Functions → **work-reminders → Run now** to test.
5. Delete the downloaded file. Without these settings, reminders are still sent, but only when someone on the board opens DMS that day.

**Email from dms@mgocandoni.com.** DMS emails its notifications from the mailbox set in Netlify (none set: no emails, notifications still show in DMS). dms@mgocandoni.com is an alias: DMS signs in to the mailbox it belongs to and sends as the alias. Set it up once:
1. In that mailbox, allow sending as the alias. Google Workspace: Gmail → Settings → **Accounts** → *Send mail as* → **Add another email address** → `dms@mgocandoni.com`, name *DMS*, *Treat as an alias* ticked (without this, Gmail sends as the mailbox's own address). Then turn on 2-Step Verification for the mailbox and make an **App password** (Google Account → Security → App passwords).
2. In Netlify → Site configuration → **Environment variables** (scope Functions, mark them secret): **SMTP_USER** = the mailbox's own address (the one the alias belongs to, not the alias), **SMTP_PASS** = its app password, **EMAIL_FROM** = `DMS <dms@mgocandoni.com>`. Not Google Workspace: also **SMTP_HOST** and **SMTP_PORT** from your provider (default `smtp.gmail.com`, `465`), and check it lets that mailbox send as the alias.
3. **Deploys → Trigger deploy.** Route a test document to another office: its people get the email from dms@mgocandoni.com.
4. So the emails are not marked as spam, the domain's DNS needs the provider's SPF and DKIM records (your mail provider's setup page lists them).
Type the password only into Netlify, never into a chat or a document. Replies to the emails go to the alias, so to that mailbox. Each user can turn the emails off in My Profile.

### Settings and users

**A person with more than one office** (for example, staff who is also OIC of another office): in **Users**, open the person (**Edit**), keep their **Office**, and under **Other offices** choose **Add another office…**; tick **Office head** for an office they head there, or × to remove one. They act for one office at a time and switch at the top of their screen (only among the offices given here; they cannot add one themselves). The **Office head** box below is for the office they are acting for now. Folder access given for one office applies while they act for that office.

**Settings** (the superadmin and Admin) holds:

- the LGU name, address and seal;
- the **signatories**: Mayor, Accountant, Budget Officer, Treasurer and Secretary to the Sanggunian. These are printed where the official forms pre-print a name. Each document keeps the signatories that were set when it was prepared.
- the **office letterheads**: for each office, the title printed under the LGU (the Office of the Mayor's is *Office of the Mayor*), its email address and its contact no. A form prints the letterhead of the office it is from: the Travel Order always the Office of the Mayor's; other forms the office of the document unless **Document Types → Letterhead** names one. An email or contact no. left blank is not printed.
- **Numbering**: the **DMS number** every document gets when saved — its prefix (DMS), how many digits its series has, and when it **restarts at 1**: every year (*DMS-2026-000001*, the default), every month (*DMS-2026-11-000001*) or never (*DMS-000001*). A change applies to new documents; documents keep their number. Below it, **Reference numbers (DRN)** lists every number a route assigns, for every document type (the DV's Disbursement No., the Travel Order No., …): who assigns it, its **format** and when it **restarts at 1** (every day, month or year, or never), with what it looks like. A new document type whose route assigns a number appears there by itself. The series restarts whenever the date in the format changes, so choosing *Every year* takes the month out of the format, *Every month* puts it in. In a format, `{YYYY}`/`{YY}` is the year, `{MM}` the month, `{DD}` the day, `{FUND}` the fund's code (each fund its own series) and `{####}` the series. The same format can also be changed on the step in Administration → Workflow.

![Settings](images/22-admin-settings.png)

### Workflow: set the flow of every document

**Administration → Workflow → Routes** sets the route of each document type. Pick a type on the left; the right side lists its steps in order. For each step choose the **office** (or *Preparer's office*, whichever office prepared the document), type the **action** (what that office does, e.g. *Pre-audit, Box B and the JEV*), and tick **Must sign the PDF before routing** where that office signs with its PNPKI digital signature. The office can't route the document until it has signed. A signature stays valid for its step: when the document is returned to an office that already signed, it can route it again without signing, unless the document was converted to PDF again (the new PDF needs the signatures again). Add, remove and reorder steps with **+ Add step**, ×, ↑ and ↓. The preview at the top shows the route. Click **Save route**.

A step can also **assign a reference no.**: tick it, pick the field (e.g. *Disbursement No.*) and the date field, and set the number pattern, e.g. `{FUND}-{YYYY}-{MM}-{####}` → GF-2026-10-0045 (`{YYYY}` `{YY}` `{MM}` `{DD}` `{FUND}`, and `{####}` for the series, which starts again whenever the rest changes, e.g. each month or fund). When someone of that office first opens the document there, DMS fills in the next number and today's date (only if the field is empty), shows it in the workflow, Details and the form, adds it to that office's signature on the PDF, and finds it in the document search. Each number comes from its series and is recorded with its place in it: no one can type in a number of their own or move a series on without a document taking the number. The office can still correct the number (until it is on the PDF); DMS keeps the number first assigned.

Some starter steps also **fill in details before routing** (the DV's Treasurer step: *Check/ADA No.*, *Check/ADA Date* and *Bank Name*) and offer an **upload** (*DV signed by the payee in Box E*), which is **optional**. A file uploaded there becomes a document of its own, like a supplemental document: it gets a **DMS number** and the QR code, is listed in All Documents (and goes into the Archive with the main document), and opens as a **tab** on the main document after the PDF. These come with the starter formats and show as badges on the step; they are no longer set in the route editor. At that step, after **Receive**, the Workflow card shows the fields and the upload; **Route** stays off until the fields are filled in, while the upload can be added any time or skipped.

**Transition uploads and number series.** **Settings → Transition uploads → Allowed until**: the last day documents already partway through their route can be uploaded at the step they are at (empty: not allowed). **Last number used** (Workflow, under a step's reference no.): for numbers already given outside DMS, choose the fund, the month (and the office numbering it, e.g. the Vice Mayor's) and type the last number used in that series, then **Set**: DMS goes on from the next (it shows which). Do this before an office assigns its first number of that series in DMS.

**Purge documents already backed up (superadmin only).** Every archive backup stamps the documents it saved whole: the automatic Google Drive backup, and a ZIP backup to a device (Archive → Back up now). The Archive shows it under **Backed up** (the date, and Google Drive or the device), or *Not yet*, or *changed since* when the document changed after its last backup (the next backup includes it again). The superadmin sees a **Purge** box at the top of the Archive: tick documents marked ✓ Backed up (or **Tick all backed up shown**, after filtering by year, type or office), click **Purge … documents…**, type **PURGE** and **Purge now**. They are removed from DMS for good, with their files; their copies in the backups stay. Only backed-up documents can be ticked, and the security rules refuse to delete any other one, also from 1 January 2027 when Reset documents is gone. Administrators and the Records Officer cannot purge.

**Reset documents (superadmin only, until 31 December 2026).** At the bottom of **Settings**, **Reset documents…** deletes every document (prepared and uploaded) with its PDFs and attachments, the Archive, the QR check records, everyone's notifications, the archive backup log and the document links of work items and projects, and restarts the numbering: the next document is DMS-(year)-000001 and every reference no. series starts at 0001 (set **Last number used** in Workflow afterwards for numbers already given outside DMS). Users, offices, settings, document types, routes, checklists, boards and projects stay; copies already backed up to Google Drive are not touched. Type **DELETE ALL DOCUMENTS** to confirm. It cannot be undone. If it reports items it could not remove, run it again.

**Funds.** The Fund field of every form, and of Upload document, lists the funds in **Settings → Funds**: General Fund, Special Education Fund and Trust Fund. An administrator adds another there (one per line). A document saved with a fund no longer in the list keeps it.

**Records Officer and Download ZIP.** The **Records Officer** (a role, Users → Role) sees every document in **All Documents**, like an administrator. Administrators and the Records Officer have **Download ZIP** there: choose the dates (when the documents were uploaded or prepared), and DMS puts the current PDF of each matching document (the search and filters on the page apply) in one ZIP, in a folder per type, with *index.csv* listing all of them, including those without a PDF yet.

**Positions: who in the office acts.** Not everyone in an office acts on a document: in Accounting the Reviewer, not the Encoder; in the GSO the Inspection or Acceptance Officer. Open a step and pick positions under **Who acts**; only the people of that office with one of those positions (and the office head) can sign and route it there. Others in the office see who the step is for. Give each user their position in **Users** (under their office); a user can hold more than one. The list of positions is in **Settings**, and **+ New position…** in Users or Workflow adds one on the spot. A step that names no position works as before: anyone in the office acts.

**Alternate offices on a step.** A step can name other offices that may handle it instead: open the step and pick them under **Alternate offices** (e.g. step 4 *Office of the Municipal Mayor*, or *Office of the Municipal Vice Mayor*). The route then reads *Office of the Municipal Mayor or Office of the Municipal Vice Mayor*. On the document page, the preparer chooses who handles each such step and clicks **Confirm these offices**; **Route** stays off until they do. They can change the choice until the document first leaves their office. Everything else about the step (its action, signature, reference no.) stays the same whichever office handles it.

**Third party step.** A step of a route can be for a **third party** instead of an office: in **Administration → Workflow**, open the step and choose **Office: Third party** (e.g. the supplier's conforme on a PO). When a document of that type starts its workflow, its preparer designates the person in the **Workflow** card (type the name or email of the supplier, payee or other user, then **Confirm**); it cannot be routed before. When the document reaches that step it is with that person: they find it in **Documents for you**, sign it if the step signs (PNPKI or e-signature), and route it to the next step (or return it). They can still open it afterwards.

**Refer to a person outside the route.** In **Users**, tick **May route documents to any person** for the users allowed to do this (administrators always can). While a document is with such a user's office, the Workflow card shows **Refer to a person…**: type a name or email, pick an active user, and say what they should do. The document goes to that person's Notifications (*Referred to you*). They act on it (they can sign the PDF; that signature does not count as the step's own), and click **Send back**. It returns to the office that referred it, and the route goes on. While it is out, the referring office can still open it but cannot act on it.

A route has at most **8 steps**. A document starts only the route saved for its type, step by step (the security rules check it). A type with only a processing guide gets its route saved from that guide when an administrator signs in (the sign-in notice says how many); until then its documents cannot start their route. Approval steps are saved as signing. The editor starts from the guide. New documents follow the saved route; documents already on their way keep the route they started with. Saving a route doesn't change the document format or its version.

**Tracking** (left menu, for everyone) shows the routed documents you can see: where it is now, its progress along the route, and the last action with any remarks. The tiles filter it (*On the move*, *In your office*, *Returned*, *Processed*, *All routed*), and **Now at** filters by office.

**Boards.** Administrators see every board and act as their managers. Board permissions are separate from document access: a board's people open only the documents the DMS already lets them open. After an update that adds boards, the administrator publishes `firestore.rules` in the Firebase console.

**Users** is where you approve new accounts and **assign each person to an office**. Each person is one row (name, email, office, Office head and positions, role, status); search by name, email, office or position, or show only those **Pending approval**. **Approve** activates a new account; **Edit** opens the person's office, role, positions, **Office head** and **May route documents to any person**, and **Deactivate**. Users see only the documents of their own office (and their own); administrators see all documents and can filter by office. The office someone types when registering is only a request, shown as *Asked for*. The list of offices is in **Settings**. Only the superadmin can make someone an administrator.

**Roles.** **User** (LGU personnel) and **Third Party** (outside the LGU), and four roles that run DMS for every office (all documents, document types, workflow, checklists, folder access, circulars, the archive):
- **Superadmin:** everything; gives every role, and is the only one who deletes documents.
- **Admin:** everything, including **Settings**; gives the **IT Admin** and **Records Officer** roles (not Admin); cannot delete documents.
- **IT Admin:** like Admin (adds, approves and edits users in **Users**), without Settings.
- **Records Officer:** like Admin (keeps the records, the archive and its downloads), without **Users** and Settings.
The role is set in **Users** (Edit → Role) or when adding someone with **+ Add user**: the superadmin gives any role, an Admin gives IT Admin and Records Officer (and manages those users), an IT Admin manages Users and Third Parties only. Records Officer is a role, not a position under an office: someone who held the old Records Officer position became a Records Officer when an Admin or the superadmin next signed in.

**+ Add user** (top of Users) sets up a person before they sign up: their email, name, role (User, Third Party; Admin for the superadmin), office, positions, **Office head** and **May route documents to any person**. They are listed under **Added, not signed up yet** (Edit or Remove). When they first sign in with that email (Continue with Google, or an account with email and password once they open the verification link), their account is active at once with that setup, without approval. An email that is not verified never takes an added setup. Deactivating a user also removes their added setup, so signing in again does not reactivate them. A deactivated user shows **Deactivated** (not Pending) and loses any folder access; so does someone made a Third Party or moved to another office (give them access again for their new office).

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
