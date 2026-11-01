// Starter document types, modeled on the Municipal Government of Candoni's
// Appendix Forms (GAM for LGUs): DV, OBR, FURS, PR, PO, JO, PCV, LR, IT and Payroll, and the
// Office of the Mayor's Travel Order.
// Admins load them from Admin > Document Types > "Load starter formats" and can edit freely.
// Every form prints on A4
// portrait, scaled to fit one page, except the DV, which prints on Folio (8.5 x 13 in).

import { withApprover } from './approver.js';

export const FUNDS = ['General Fund', 'Special Education Fund', 'Trust Fund', '20% Development Fund', 'LDRRMF'];

// Official form header: seal, LGU, address, form title.
const header = (title) => `<div class="ph"><img src="{{lgu.seal}}" alt="">
    <div class="l2">Republic of the Philippines</div>
    <div class="l1">{{lgu.name|upper}}</div>
    <div class="l2">{{lgu.address}}</div>
    <div class="l3">${title}</div></div>`;

// Signature block inside a bordered cell.
const signBlock = (name, position, caption = '') => `<div class="pf-signame">${name}</div>
        <div class="cap">${position}</div>${caption ? `<div class="cap">${caption}</div>` : ''}`;

const fundField = (step, extra = {}) => ({ key: 'fund', label: 'Fund', type: 'select', options: FUNDS, required: true, step, ...extra });

const blankRows = (cols, n) => Array.from({ length: n }, () => `<tr class="blank">${'<td></td>'.repeat(cols)}</tr>`).join('\n    ');

// ---------------------------------------------------------------- DV
const DV = {
  code: 'DV',
  name: 'Disbursement Voucher',
  category: 'Disbursement',
  description: 'Payment of an obligation: suppliers, salaries and benefits, cash advances, reimbursements, fund transfers and remittances. The checklist depends on the type of transaction.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'disbursement',
  // Raised when DMS revises this starter format; sites that have not edited it are updated (lib/api.js).
  starterVersion: 7,
  // Download all: the DV, its checklist and every linked document in one ZIP.
  bulkDownload: true,
  steps: [
    { id: 's1', title: 'Payee', instructions: 'Encode the payee exactly as on the approved OBR/FURS. The Disbursement No. and its date are assigned by the Accounting Office.' },
    { id: 's2', title: 'Particulars', instructions: 'Explain what is being paid (what, for whom, for what period) in a paragraph; press Enter for a new line. Enter each amount; enter deductions (e.g. Pag-IBIG, tax withheld) as negative amounts. The Amount Due is computed. The Accounting Office may add deductions later.' },
    { id: 's3', title: 'Box A and D', instructions: 'The head of the requesting office (or authorized representative) certifies Box A. Choose who approves the payment in Box D: the Municipal Mayor or the Municipal Vice Mayor. Boxes B, C and D print the officials from Settings.' },
  ],
  fields: [
    { key: 'payee', label: 'Payee', type: 'text', required: true, step: 's1' },
    { key: 'address', label: 'Address', type: 'text', step: 's1' },
    { key: 'tinNo', label: 'TIN No.', type: 'text', step: 's1' },
    fundField('s1', { default: 'General Fund' }),
    { key: 'obrNo', label: 'OBR / FURS No.', type: 'text', required: true, step: 's1', help: 'The obligation must be approved before the DV is prepared.' },
    { key: 'respCenter', label: 'Responsibility Center', type: 'text', step: 's1', placeholder: 'e.g. 1011' },
    {
      key: 'particulars', label: 'Particulars', type: 'table', required: true, step: 's2',
      columns: [
        { key: 'explanation', label: 'Explanation', type: 'textarea' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    { key: 'certA', label: 'Box A — Printed name (Head of Office)', type: 'text', required: true, step: 's3' },
    { key: 'certAPos', label: 'Box A — Position', type: 'text', default: 'Head of Department/Office', step: 's3' },
    { key: 'approver', label: 'Box D — Approved for payment by', type: 'select', options: ['Municipal Mayor', 'Municipal Vice Mayor'], required: true, step: 's3' },
    // Assigned by the Accounting Office on the PDF (the route's assign step), not typed in the form.
    { key: 'dvNo', label: 'Disbursement No.', type: 'text', filledBy: 'accounting' },
    { key: 'dvDate', label: 'Date', type: 'date', filledBy: 'accounting' },
    {
      key: 'adjustments', label: 'Deductions / adjustments', type: 'table', filledBy: 'accounting',
      help: 'One line per deduction (negative amount, e.g. -1,250.00 for tax withheld) or addition (positive amount). They print below the particulars and change the Amount Due.',
      columns: [
        { key: 'explanation', label: 'Explanation', type: 'textarea' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    { key: 'amountDue', label: 'Amount Due', type: 'currency', compute: 'sum:particulars.amount+sum:adjustments.amount', filledBy: 'accounting' },
    // Filled in by the Treasurer's Office at the payment step (Payment Details).
    { key: 'checkNo', label: 'Check/ADA No.', type: 'text', filledBy: 'treasury' },
    { key: 'checkDate', label: 'Check/ADA Date', type: 'date', filledBy: 'treasury' },
    { key: 'bankName', label: 'Bank Name', type: 'text', filledBy: 'treasury' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Requesting Office', action: 'Box A and the supporting documents', details: 'The head of office signs Box A. Attach the approved OBR/FURS and every document on the printed checklist, in the order listed. Put the printed checklist on top.' },
    { id: 'p2', office: 'Municipal Accounting Office', action: 'Pre-audit, Box B and the JEV', assign: { field: 'dvNo', dateField: 'dvDate', pattern: '{FUND}-{YYYY}-{MM}-{####}' }, details: 'Accounting checks the documents against the checklist and certifies Box B (completeness and propriety of supporting documents, previous cash advances liquidated). It assigns the Disbursement No. and date and enters any deductions in DMS (Documents > the DV > Accounting), then prepares the Journal Entry Voucher.' },
    { id: 'p3', office: "Municipal Treasurer's Office", action: 'Box C: funds available', details: 'The Treasurer certifies that funds are available and prepares the check or ADA.' },
    { id: 'p4', office: 'Office of the Municipal Mayor', action: 'Box D: approved for payment', details: 'The Local Chief Executive approves the payment.' },
    { id: 'p5', office: "Municipal Treasurer's Office", action: 'Payment and Box E', fills: ['checkNo', 'checkDate', 'bankName'], upload: 'DV signed by the payee in Box E (scanned)', details: 'The Treasury fills in the payment details (check/ADA no., date, bank) and releases the payment. The payee signs Box E (Received Payment) and issues an official receipt where required.' },
    { id: 'p6', office: 'Municipal Accounting Office', action: 'Recording and filing', details: 'Accounting records the disbursement and keeps the original DV with its attachments for COA.' },
  ],
  // Laid out like the Disbursement Voucher of the Municipal Government of Candoni (2026 DV):
  // one ruled grid of 10 columns, the particulars as one open area without row lines.
  template: `<div class="dv"><table data-grow>
  <colgroup><col style="width:7.805%"><col style="width:22.865%"><col style="width:1.377%"><col style="width:8.264%"><col style="width:14.692%"><col style="width:9.275%"><col style="width:1.377%"><col style="width:8.264%"><col style="width:23.967%"><col style="width:2.114%"></colgroup>
  <tr class="dv-head"><td colspan="10"><img class="dv-seal" src="{{lgu.seal}}" alt="">
    <div class="dv-l1">Republic of the Philippines</div>
    <div class="dv-l2">Municipal Government of CANDONI</div>
    <div class="dv-l3">Municipal Building, Candoni, Negros Occidental 6110</div>
    <div class="dv-title">DISBURSEMENT VOUCHER</div></td></tr>
  <tr class="dv-rule"><td colspan="10"></td></tr>
  <tr class="dv-r1"><td rowspan="2" class="dv-mid c">Payee</td><td rowspan="2" colspan="4" class="dv-mid dv-val">{{payee|upper}}</td>
    <td colspan="5">Disbursement No. <b>{{dvNo}}</b><div class="dv-date">Date: <b>{{dvDate|date}}</b></div></td></tr>
  <tr class="dv-r2"><td colspan="3">Fund<div class="dv-in">{{fund|upper}}</div></td><td colspan="2">OBR No.<div class="dv-in">{{obrNo}}</div></td></tr>
  <tr class="dv-r3"><td>Address</td><td colspan="4" class="dv-val">{{address}}</td>
    <td colspan="3">TIN No.<div class="dv-in">{{tinNo}}</div></td><td colspan="2">Responsibility Center<div class="dv-in">{{respCenter}}</div></td></tr>
  <tr class="dv-amth"><td colspan="8"></td><td colspan="2" class="c"><b>Amount</b></td></tr>
  {{#each particulars}}<tr class="blank dv-line"><td colspan="8">{{explanation}}</td><td colspan="2" class="r">{{amount|currency}}</td></tr>{{/each}}
  {{#each adjustments}}<tr class="blank dv-line"><td colspan="8">{{explanation}}</td><td colspan="2" class="r">{{amount|currency}}</td></tr>{{/each}}
  <tr class="blank dv-line"><td colspan="8"></td><td colspan="2"></td></tr><tr class="blank dv-line"><td colspan="8"></td><td colspan="2"></td></tr><tr class="blank dv-line"><td colspan="8"></td><td colspan="2"></td></tr>
  <tr class="dv-due"><td colspan="8" class="r"><b>Amount Due</b></td><td colspan="2" class="r"><b>{{amountDue|acct}}</b></td></tr>
  <tr class="dv-cert">
    <td colspan="3"><span class="dv-lt">A.</span> Certified<div class="dv-ct" style="padding-right:10pt">Expenses/Cash Advances necessary, valid, proper, lawful and incurred under my direct supervision.</div></td>
    <td colspan="4"><span class="dv-lt">B.</span> Certified<div class="dv-ct" style="padding-right:18pt">Completeness and propriety of supporting documents/previous cash advance liquidated/existence of funds held in trust.</div></td>
    <td colspan="3"><span class="dv-lt">C.</span> Certified<div class="dv-ct dv-ct-c">Funds available for the purpose.</div></td></tr>
  <tr class="dv-sg"><td>Signature</td><td></td><td rowspan="3" class="dv-gap"></td><td>Signature</td><td colspan="2"></td><td rowspan="3" class="dv-gap"></td><td>Signature</td><td></td><td rowspan="3" class="dv-gap"></td></tr>
  <tr class="dv-sg"><td>Printed<br>Name</td><td class="dv-name">{{certA|upper}}</td><td>Printed<br>Name</td><td colspan="2" class="dv-name">{{sig.accountant|upper}}</td><td>Printed<br>Name</td><td class="dv-name">{{sig.treasurer|upper}}</td></tr>
  <tr class="dv-sg"><td>Position</td><td class="dv-pos dv-pos-a">{{certAPos|upper}}</td><td>Position</td><td colspan="2" class="dv-pos">{{sig.accountantPosition|upper}}</td><td>Position</td><td class="dv-pos">{{sig.treasurerPosition|upper}}</td></tr>
  <tr class="dv-d"><td colspan="3"><span class="dv-lt">D.</span> Approved for Payment</td><td colspan="4"><span class="dv-pd">Payment Details</span></td><td colspan="3"><span class="dv-lt">E.</span> Received Payment</td></tr>
  <tr class="dv-sg"><td>Signature</td><td></td><td rowspan="3" class="dv-gap"></td><td>Check No.</td><td colspan="2" class="dv-pay">{{checkNo|upper}}</td><td rowspan="3" class="dv-gap"></td><td>Signature</td><td></td><td rowspan="3" class="dv-gap"></td></tr>
  <tr class="dv-sg"><td>Printed<br>Name</td><td class="dv-name">{{#if approver=Municipal Mayor}}{{sig.mayor|upper}}{{/if}}{{#if approver=Municipal Vice Mayor}}{{sig.viceMayor|upper}}{{/if}}</td><td>Date</td><td colspan="2" class="dv-pay">{{checkDate|date}}</td><td>Printed<br>Name</td><td class="dv-name">{{payee|upper}}</td></tr>
  <tr class="dv-sg"><td>Position</td><td class="dv-pos">{{#if approver}}{{approver|upper}}{{/if}}{{#if !approver}}MUNICIPAL MAYOR/ VICE MAYOR{{/if}}</td><td>Bank<br>Name</td><td colspan="2" class="dv-pay">{{bankName|upper}}</td><td>Position</td><td class="dv-pos"></td></tr>
  </table></div>`,
};

// ---------------------------------------------------------------- OBR
const OBR = {
  code: 'OBR',
  name: 'Obligation Request',
  category: 'Budget',
  description: 'Obligates the appropriation before an expense is incurred. Certified by the requesting office (Box A) and the Budget Officer (Box B). The approved OBR supports the DV or payroll.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // Redrawn after the LGU's form; sites that have not edited it are updated (lib/api.js).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Payee and Office', instructions: 'Encode the payee and the requesting office. The OBR No. is assigned by the Budget Office; leave it blank.' },
    { id: 's2', title: 'Particulars', instructions: 'One line per charge: responsibility center, particulars, F.P.P. (function/program/project), account code and amount. The total is computed.' },
    { id: 's3', title: 'Box A', instructions: 'The head of the requesting office certifies Box A. Box B prints the Budget Officer from Settings.' },
  ],
  fields: [
    { key: 'payee', label: 'Payee', type: 'text', required: true, step: 's1' },
    { key: 'office', label: 'Office', type: 'text', required: true, step: 's1' },
    { key: 'address', label: 'Address', type: 'text', step: 's1' },
    fundField('s1'),
    { key: 'obrNo', label: 'OBR No. (Budget Office)', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', step: 's1' },
    {
      key: 'items', label: 'Particulars', type: 'table', required: true, step: 's2',
      columns: [
        { key: 'respCenter', label: 'Responsibility Center', type: 'text' },
        { key: 'particulars', label: 'Particulars', type: 'text' },
        { key: 'fpp', label: 'F.P.P.', type: 'text' },
        { key: 'accountCode', label: 'Account Code', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    { key: 'certA', label: 'Box A — Printed name (Head of Office)', type: 'text', required: true, step: 's3' },
    { key: 'certAPos', label: 'Box A — Position', type: 'text', step: 's3' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Requesting Office', action: 'Box A', details: 'The head of the requesting office signs Box A: charges to appropriation/allotment are necessary, lawful and under their direct supervision. Attach the basis of the obligation.' },
    { id: 'p2', office: 'Municipal Budget Office', action: 'Box B: existence of available appropriation', details: 'The Budget Officer checks the charging against the appropriation and allotment, assigns the OBR No. and signs Box B.' },
    { id: 'p3', office: 'Municipal Accounting Office', action: 'Recording', details: 'The obligation is recorded in the Registry of Appropriations, Allotment and Obligation (RAAO).' },
    { id: 'p4', office: 'Requesting Office', action: 'Attach to the DV or payroll', details: 'Use the OBR No. when you prepare the Disbursement Voucher or Payroll, and attach the approved OBR.' },
  ],
  // Laid out like the Obligation Request of the Municipal Government of Candoni (28_OBR.xlsx, printed
  // from Google Sheets), as the Budget Office's system fills it in.
  template: `<div class="obr"><table class="obr-main" data-grow>
  <colgroup><col style="width:13.946%"><col style="width:43.802%"><col style="width:7.438%"><col style="width:4.029%"><col style="width:9.401%"><col style="width:21.384%"></colgroup>
  <tr class="obr-head"><td colspan="6"><img class="obr-seal" src="{{lgu.seal}}" alt="">
    <div>Republic of the Philippines</div><div class="b">MUNICIPAL GOVERNMENT OF CANDONI</div><div>Municipal Building, Candoni, Negros Occidental 6110</div></td></tr>
  <tr class="obr-title"><td colspan="3">OBLIGATION REQUEST</td><td class="c">No.</td><td colspan="2" class="obr-no">{{obrNo}}</td></tr>
  <tr class="obr-r obr-payee"><td>PAYEE</td><td colspan="5" class="obr-val"><b>{{payee|upper}}</b><span class="obr-date">{{date|mdy}}</span></td></tr>
  <tr class="obr-r obr-office"><td>OFFICE</td><td colspan="5" class="obr-val">{{office|upper}}</td></tr>
  <tr class="obr-r obr-addr"><td>ADDRESS</td><td colspan="5" class="obr-val">{{address|upper}}</td></tr>
  <tr class="obr-cols"><td>Responsibility<br>Center</td><td>Particulars</td><td colspan="2">F.P.P.</td><td>Account<br>Code</td><td>Amount</td></tr>
  {{#each items}}<tr class="blank obr-item" data-fill><td class="obr-rc">{{respCenter}}</td><td class="obr-part">{{particulars}}</td><td colspan="2" class="c">{{fpp}}</td><td class="obr-code"><span>{{accountCode}}</span></td><td class="obr-amt">{{amount|currency}}</td></tr>{{/each}}
  {{#if !items}}<tr class="blank obr-item"><td></td><td></td><td colspan="2"></td><td></td><td></td></tr>{{/if}}
  <tr class="obr-total"><td colspan="2" class="r">TOTAL</td><td colspan="3" class="r"><b>P</b></td><td class="obr-amt">{{sum:items.amount|currency}}</td></tr>
  </table>
  <table class="obr-sign">
  <colgroup><col style="width:13.946%"><col style="width:41.736%"><col style="width:9.504%"><col style="width:34.814%"></colgroup>
  <tr class="obr-cert"><td colspan="2"><div><b>A.</b>&nbsp; CERTIFIED</div>
      <div class="obr-chk"><span class="obr-box">&#10003;</span><span>Charges to Appropriation/allotment necessary,<br>lawful and under my direct supervision</span></div>
      <div class="obr-chk obr-chk2"><span class="obr-box">&#10003;</span><span>Supporting documents valid, proper and legal</span></div></td>
    <td colspan="2" class="obr-b"><div><b>B.</b>&nbsp; CERTIFIED</div>
      <div class="obr-chk obr-chkb"><span class="obr-box">&#10003;</span><span>Existence of Available Appropriation</span></div></td></tr>
  <tr class="obr-sg obr-sig"><td>Signature</td><td></td><td class="obr-b">Signature</td><td></td></tr>
  <tr class="obr-sg obr-pn"><td>Printed Name</td><td class="obr-name">{{certA|upper}}</td><td class="obr-b obr-clip">Printed Name</td><td class="obr-name">{{sig.budget|upper}}</td></tr>
  <tr class="obr-sg obr-pos"><td>Position</td><td class="c">{{certAPos|upper}}</td><td class="obr-b">Position</td><td class="c">{{sig.budgetPosition|upper}}</td></tr>
  <tr class="obr-sg obr-dt"><td>Date</td><td></td><td class="obr-b">Date</td><td></td></tr>
  </table></div>`,
};

// ---------------------------------------------------------------- FURS
const FURS = {
  code: 'FURS',
  name: 'Fund Utilization Request and Status',
  category: 'Budget',
  description: 'Request to utilize funds held in trust (special trust accounts). Certified by the requesting office (Box A) and the Accountant (Box B); recorded in the Registry of Special Trust Fund.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // No checklist: only the DV and the Liquidation Report have one (v2).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Payee and Office', instructions: 'Encode the payee and the requesting office. The FURS No. is assigned by the Accounting Office.' },
    { id: 's2', title: 'Particulars', instructions: 'For each line: the project/purpose, particulars, account code and amount.' },
    { id: 's3', title: 'Box A', instructions: 'The head of the requesting office certifies Box A. Box B prints the Accountant from Settings.' },
  ],
  fields: [
    { key: 'payee', label: 'Payee', type: 'text', required: true, step: 's1' },
    { key: 'office', label: 'Office', type: 'text', required: true, step: 's1' },
    { key: 'address', label: 'Address', type: 'text', step: 's1' },
    fundField('s1', { default: 'Trust Fund' }),
    { key: 'date', label: 'Date', type: 'date', step: 's1' },
    {
      key: 'items', label: 'Particulars', type: 'table', required: true, step: 's2',
      columns: [
        { key: 'purpose', label: 'Project/Purpose', type: 'text' },
        { key: 'particulars', label: 'Particulars', type: 'text' },
        { key: 'accountCode', label: 'Account Code', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    { key: 'certA', label: 'Box A — Printed name', type: 'text', required: true, step: 's3' },
    { key: 'certAPos', label: 'Box A — Position', type: 'text', step: 's3' },
    // Assigned by the Accounting Office on the saved FURS.
    { key: 'fursNo', label: 'FURS No.', type: 'text', filledBy: 'accounting' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Requesting Office', action: 'Box A', details: 'The head of the requesting office (or authorized representative) signs Box A: charges to the special trust account are necessary, lawful and under their direct supervision.' },
    { id: 'p2', office: 'Municipal Accounting Office', action: 'Box B and recording', details: 'The Accountant certifies that funds are available and utilized for the purpose, assigns the FURS No., and records it in the Registry of Special Trust Fund (RSTF).' },
    { id: 'p3', office: 'Requesting Office', action: 'Attach to the DV', details: 'Use the FURS No. on the Disbursement Voucher.' },
  ],
  // Laid out like the FURS of the Municipal Government of Candoni (29_FURS.xlsx, printed from Google Sheets).
  template: `<div class="frs"><table class="frs-main" data-grow>
  <colgroup><col style="width:17.420%"><col style="width:43.219%"><col style="width:10.364%"><col style="width:13.341%"><col style="width:15.656%"></colgroup>
  <tr class="frs-head"><td colspan="5"><img class="frs-seal" src="{{lgu.seal}}" alt="">
    <div class="frs-l1">Republic of the Philippines</div><div class="frs-l2">{{lgu.name|upper}}</div><div class="frs-l3">{{lgu.address}}</div>
    <div class="frs-title">FUND UTILIZATION REQUEST AND STATUS</div></td></tr>
  <tr class="frs-r"><td>Payee</td><td class="frs-v"><b>{{payee|upper}}</b></td><td>FURS No. :</td><td colspan="2" class="frs-v"><b>{{fursNo}}</b></td></tr>
  <tr class="frs-r"><td>Office</td><td class="frs-v">{{office|upper}}</td><td>Date :</td><td colspan="2" class="frs-v">{{date|date}}</td></tr>
  <tr class="frs-r frs-r3"><td>Address</td><td class="frs-v">{{address|upper}}</td><td>Fund :</td><td colspan="2" class="frs-v">{{fund|upper}}</td></tr>
  <tr class="frs-cols"><td>Project/Purpose</td><td>Particulars</td><td colspan="2">Account Code</td><td>Amount</td></tr>
  {{#each items}}<tr class="blank frs-line"><td>{{purpose}}</td><td>{{particulars}}</td><td colspan="2" class="c">{{accountCode}}</td><td class="r">{{amount|currency}}</td></tr>{{/each}}
  <tr class="blank frs-line"><td></td><td></td><td colspan="2"></td><td></td></tr>
  <tr class="frs-total"><td></td><td class="r"><b>Total</b></td><td colspan="2"></td><td class="r frs-sum"><b>{{sum:items.amount|currency}}</b></td></tr>
  </table>
  <table class="frs-cert">
  <colgroup><col style="width:48.071%"><col style="width:51.929%"></colgroup>
  <tr>
    <td><div class="frs-ct"><span class="frs-lt">A.</span><b class="frs-cl">Certified:</b><span class="frs-tx frs-txa">Charges to special trust account necessary, lawful and under my direct supervision; and supporting documents valid, proper and legal</span></div>
      <div class="frs-sg frs-sga">
        <span>Signature</span><span>:</span><span class="frs-ln"></span>
        <span>Printed Name:</span><span></span><span class="frs-ln frs-nm">{{certA|upper}}</span>
        <span>Position</span><span>:</span><span class="frs-ln frs-ps">{{certAPos|upper}}</span>
        <span></span><span></span><span class="frs-cap">Head, Requesting Office/Authorized Representative</span>
        <span>Date</span><span>:</span><span class="frs-ln"></span>
      </div></td>
    <td><div class="frs-ct"><span class="frs-lt">B.</span><b class="frs-cl">Certified:</b><span class="frs-tx frs-txb">Funds available and utilized for the purpose/adjustment necessary as indicated above</span></div>
      <div class="frs-sg frs-sgb">
        <span>Signature</span><span>:</span><span class="frs-ln"></span>
        <span>Printed Name:</span><span></span><span class="frs-ln frs-nm">{{sig.accountant|upper}}</span>
        <span>Position</span><span>:</span><span class="frs-ln frs-ps">{{sig.accountantPosition|upper}}</span>
        <span></span><span></span><span class="frs-cap">Head, Accounting Division/Unit/ Authorized Representative</span>
        <span>Date</span><span>:</span><span class="frs-ln"></span>
      </div></td>
  </tr>
  </table>
  <table class="frs-status">
  <colgroup><col style="width:9.041%"><col style="width:14.553%"><col style="width:13.892%"><col style="width:10.584%"><col style="width:12.569%"><col style="width:10.364%"><col style="width:13.341%"><col style="width:15.656%"></colgroup>
  <tr class="frs-st-head"><td colspan="8"><span class="frs-lt">C.</span><b>STATUS OF UTILIZATION</b></td></tr>
  <tr class="frs-st-1"><td colspan="3"><b>Reference</b></td><td colspan="5"><b>Amount</b></td></tr>
  <tr class="frs-st-2"><td rowspan="2">Date</td><td rowspan="2">Particulars</td><td rowspan="2">FURS/JEV/RCI/<br>RADAI No.</td><td rowspan="2">Utilization<br><br>(a)</td><td rowspan="2">Payable<br><br>(b)</td><td rowspan="2">Payment<br><br>(c)</td><td colspan="2">Balance</td></tr>
  <tr class="frs-st-3"><td>Not Yet Due<br><br>(a-b)</td><td>Due and<br>Demandable<br>(b-c)</td></tr>
  <tr class="frs-st-body"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </table></div>`,
};

// ---------------------------------------------------------------- PR
const PR = {
  code: 'PR',
  name: 'Purchase Request',
  category: 'Procurement',
  description: 'Request of an end-user office for the procurement of goods or services. The items must be in the approved PPMP / APP.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // No checklist: only the DV and the Liquidation Report have one (v2).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Office', instructions: 'Encode the requesting department and section, fund and FPP (function/program/project).' },
    { id: 's2', title: 'Items', instructions: 'One line per item: unit, description (with specifications), quantity and estimated unit cost based on your price reference. The total cost is computed.' },
    { id: 's3', title: 'Purpose & Signatories', instructions: 'State the purpose. "Cash Availability" and "Approved by" print the Treasurer and Mayor from Settings.' },
  ],
  fields: [
    fundField('s1'),
    { key: 'department', label: 'Department', type: 'text', required: true, step: 's1' },
    { key: 'section', label: 'Section', type: 'text', step: 's1' },
    { key: 'fpp', label: 'FPP', type: 'text', step: 's1' },
    { key: 'prNo', label: 'PR No.', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    {
      key: 'items', label: 'Items', type: 'table', required: true, step: 's2', minRows: 20,
      columns: [
        { key: 'itemNo', label: 'Item No.', type: 'text' },
        { key: 'unit', label: 'Unit', type: 'text' },
        { key: 'description', label: 'Item Description', type: 'text' },
        { key: 'qty', label: 'Quantity', type: 'number' },
        { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
        { key: 'totalCost', label: 'Total Cost', type: 'currency', compute: 'qty*unitCost', total: true },
      ],
    },
    { key: 'purpose', label: 'Purpose', type: 'textarea', required: true, step: 's3' },
    { key: 'requestedBy', label: 'Requested by (name)', type: 'text', required: true, step: 's3' },
    { key: 'requestedByPos', label: 'Designation', type: 'text', step: 's3' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Requesting Office', action: 'Sign "Requested by"', details: 'The head of the requesting office signs. Attach the specifications and price reference.' },
    { id: 'p2', office: "Municipal Treasurer's Office", action: 'Cash availability', details: 'The Treasurer signs "Cash Availability".' },
    { id: 'p3', office: 'Office of the Municipal Mayor', action: 'Approval', details: 'The Mayor signs "Approved by".' },
    { id: 'p4', office: 'BAC Secretariat / GSO', action: 'Procurement', details: 'The approved PR starts procurement by the applicable mode. A Purchase Order or Job Order follows after award.' },
  ],
  template: `${header('PURCHASE REQUEST')}
  <table class="pmeta-t"><tr><td></td><td class="r">Fund: <b>{{fund}}</b></td></tr></table>
  <table class="pt">
    <tr><td>Department: <b>{{department}}</b></td><td>PR No.: <b>{{prNo}}</b></td><td>Date: <b>{{date|date}}</b></td></tr>
    <tr><td>Section: <b>{{section}}</b></td><td colspan="2">FPP: <b>{{fpp}}</b></td></tr>
  </table>
  {{table:items}}
  <table class="pt"><tr><td class="lbl">Purpose:</td><td>{{purpose}}</td></tr></table>
  <table class="pt">
    <tr><td style="width:16%"></td><th>Requested by:</th><th>Cash Availability:</th><th>Approved by:</th></tr>
    <tr><td>Signature:</td><td style="height:30px"></td><td></td><td></td></tr>
    <tr><td>Printed Name:</td><td class="c"><b>{{requestedBy|upper}}</b></td><td class="c"><b>{{sig.treasurer|upper}}</b></td><td class="c"><b>{{sig.mayor|upper}}</b></td></tr>
    <tr><td>Designation:</td><td class="c">{{requestedByPos}}</td><td class="c">{{sig.treasurerPosition}}</td><td class="c">{{sig.mayorPosition}}</td></tr>
  </table>
  <div class="pf-foot">Control No. {{controlNo}} · Prepared in DMS by {{preparedBy}}</div>`,
};

// Shared bottom part of PO and JO (Negotiated purchase per Sec. 369(a) of RA 7160).
const sanggunianBlock = `<table class="pt"><tr><td class="c" style="padding:6px">
      <i>(In case of Negotiated Purchase pursuant to Section 369 (a) of RA 7160, this portion must be accomplished.)</i><br><br>
      Approved per Sanggunian Resolution No.: <b>{{sbResolutionNo}}</b>
      <table style="margin-top:14px"><tr><td style="width:60%">Certified Correct:<div class="pf-signame">{{sig.sbSecretary|upper}}</div><div class="cap">{{sig.sbSecretaryPosition}}</div></td>
      <td><div class="pf-signame">&nbsp;</div><div class="cap">Date</div></td></tr></table></td></tr></table>`;

const conformeBlock = `<div class="sig2">
    <div class="col"><div class="who">Conforme:</div><div class="name">&nbsp;</div><div class="cap">Signature over Printed Name of Supplier</div><div class="pos">&nbsp;</div><div class="cap">Date</div></div>
    <div class="col"><div class="who">Very truly yours,</div><div class="name">{{sig.mayor|upper}}</div><div class="cap">Signature over Printed Name of Authorized Official</div><div class="pos">{{sig.mayorPosition|upper}}</div><div class="cap">Designation</div></div>
  </div>`;

const supplierFields = (step) => [
  { key: 'supplier', label: 'Supplier', type: 'text', required: true, step },
  { key: 'address', label: 'Address', type: 'text', step },
  { key: 'tin', label: 'TIN', type: 'text', step },
  { key: 'prNos', label: 'PR No./s', type: 'text', required: true, step },
];
const deliveryFields = (step) => [
  { key: 'placeOfDelivery', label: 'Place of Delivery', type: 'text', step },
  { key: 'dateOfDelivery', label: 'Date of Delivery', type: 'text', placeholder: 'e.g. within 15 calendar days upon receipt', step },
  { key: 'deliveryTerm', label: 'Delivery Term', type: 'text', step },
  { key: 'paymentTerm', label: 'Payment Term', type: 'text', step },
];

// ---------------------------------------------------------------- PO
const PO = {
  code: 'PO',
  name: 'Purchase Order',
  category: 'Procurement',
  description: 'Order to the winning supplier for goods, after award. Items, quantities and prices must match the awarded quotation or bid.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // No checklist: only the DV and the Liquidation Report have one (v2).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Supplier', instructions: 'Encode the supplier exactly as in the BAC Resolution / Notice of Award, and the PR No./s covered.' },
    { id: 's2', title: 'Terms', instructions: 'Mode of procurement, place and date of delivery, delivery and payment terms.' },
    { id: 's3', title: 'Items', instructions: 'Stock/property no., unit, description, quantity and unit cost as awarded. The amount and total in words are computed.' },
    { id: 's4', title: 'Sanggunian', instructions: 'For negotiated purchase under Sec. 369(a) of RA 7160 only: the Sanggunian Resolution No. Otherwise leave blank.' },
  ],
  fields: [
    ...supplierFields('s1'),
    { key: 'poNo', label: 'P.O. No.', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    { key: 'modeOfProcurement', label: 'Mode of Procurement', type: 'select', required: true, step: 's2',
      options: ['Competitive Bidding', 'Small Value Procurement', 'Direct Acquisition', 'Direct Contracting', 'Repeat Order', 'Negotiated Procurement - Emergency Cases', 'Negotiated Procurement - Agency-to-Agency', 'Negotiated Procurement - Direct Retail Purchase', 'Others'] },
    ...deliveryFields('s2'),
    {
      key: 'items', label: 'Items', type: 'table', required: true, step: 's3', minRows: 14,
      columns: [
        { key: 'stockNo', label: 'Stock/ Property No.', type: 'text' },
        { key: 'unit', label: 'Unit', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'qty', label: 'Quantity', type: 'number' },
        { key: 'unitCost', label: 'Unit Cost', type: 'currency' },
        { key: 'amount', label: 'Amount', type: 'currency', compute: 'qty*unitCost', total: true },
      ],
    },
    { key: 'sbResolutionNo', label: 'Sanggunian Resolution No.', type: 'text', step: 's4' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'BAC Secretariat / GSO', action: 'Prepare the PO after award', details: 'Prepare the PO from the award. Attach the approved PR and the award documents.' },
    { id: 'p2', office: 'Office of the Municipal Mayor', action: 'Sign as authorized official', details: 'The Mayor signs "Very truly yours".' },
    { id: 'p3', office: 'Sangguniang Bayan', action: 'Only for negotiated purchase under Sec. 369(a)', details: 'The Secretary to the Sanggunian certifies the approving resolution.' },
    { id: 'p4', office: 'Supplier', action: 'Conforme', details: 'The supplier signs and dates the Conforme. The delivery period counts from the date of receipt.' },
    { id: 'p5', office: 'Inspection / GSO', action: 'Delivery and acceptance', details: 'On delivery the items are inspected and accepted (AIR in PMS-IMS). The PO, AIR, invoice and delivery receipt then support the DV (checklist 16xx for payment to supplier).' },
  ],
  template: `${header('PURCHASE ORDER')}
  <table class="pt">
    <tr><td style="width:55%">Supplier: <b>{{supplier}}</b></td><td>P.O. No.: <b>{{poNo}}</b></td></tr>
    <tr><td>Address: {{address}}</td><td>Date: <b>{{date|date}}</b></td></tr>
    <tr><td></td><td>Mode of Procurement: <b>{{modeOfProcurement}}</b></td></tr>
    <tr><td>TIN: {{tin}}</td><td>PR No./s: <b>{{prNos}}</b></td></tr>
    <tr><td colspan="2">Gentlemen:<br>&nbsp;&nbsp;&nbsp;&nbsp;Please furnish this Office the following articles subject to the terms and conditions contained herein:</td></tr>
    <tr><td>Place of Delivery: {{placeOfDelivery}}</td><td>Delivery Term: {{deliveryTerm}}</td></tr>
    <tr><td>Date of Delivery: {{dateOfDelivery}}</td><td>Payment Term: {{paymentTerm}}</td></tr>
  </table>
  {{table:items}}
  <table class="pt">
    <tr><td><b>(Total Amount in Words)</b> <i>{{sum:items.amount|words}}</i></td></tr>
    <tr><td style="font-size:9.5px">In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10) of one percent for every day of delay shall be imposed on the undelivered item/s.</td></tr>
  </table>
  ${conformeBlock}
  <br>${sanggunianBlock}
  <div class="pf-foot">Control No. {{controlNo}} · Prepared in DMS by {{preparedBy}}</div>`,
};

// ---------------------------------------------------------------- JO
const JO = {
  code: 'JO',
  name: 'Job Order',
  category: 'Procurement',
  description: 'Order to a supplier/contractor for services (e.g. repairs), with charges for labor, spare parts and materials.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // No checklist: only the DV and the Liquidation Report have one (v2).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Supplier', instructions: 'Encode the supplier/contractor and the PR No./s covered.' },
    { id: 's2', title: 'Terms', instructions: 'The date of the quotation, place and date of delivery, delivery and payment terms.' },
    { id: 's3', title: 'Services', instructions: 'Describe each job or service and its charges: service/labor, spare parts and materials. The total per line is computed.' },
    { id: 's4', title: 'Purpose', instructions: 'State the purpose. The Sanggunian Resolution No. is only for negotiated purchase under Sec. 369(a) of RA 7160.' },
  ],
  fields: [
    ...supplierFields('s1'),
    { key: 'joNo', label: 'J.O. No.', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    { key: 'quotationDate', label: 'Date of quotation', type: 'date', step: 's2' },
    ...deliveryFields('s2'),
    {
      key: 'items', label: 'Jobs / services', type: 'table', required: true, step: 's3', minRows: 12,
      columns: [
        { key: 'description', label: 'Description of Job / Service Desired', type: 'text' },
        { key: 'labor', label: 'Service/ Labor', type: 'currency', total: true },
        { key: 'spareParts', label: 'Spare Parts', type: 'currency', total: true },
        { key: 'materials', label: 'Materials', type: 'currency', total: true },
        { key: 'total', label: 'Total', type: 'currency', compute: 'labor+spareParts+materials', total: true },
      ],
    },
    { key: 'purpose', label: 'Purpose', type: 'textarea', required: true, step: 's4' },
    { key: 'sbResolutionNo', label: 'Sanggunian Resolution No.', type: 'text', step: 's4' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'BAC Secretariat / GSO', action: 'Prepare the JO after award', details: 'Attach the approved PR, the quotation(s) and the award documents.' },
    { id: 'p2', office: 'Office of the Municipal Mayor', action: 'Sign as authorized official', details: 'The Mayor signs "Very truly yours".' },
    { id: 'p3', office: 'Sangguniang Bayan', action: 'Only for negotiated purchase under Sec. 369(a)', details: 'The Secretary to the Sanggunian certifies the approving resolution.' },
    { id: 'p4', office: 'Supplier', action: 'Conforme and service', details: 'The supplier signs the Conforme and performs the services within the period in the JO.' },
    { id: 'p5', office: 'Inspection / GSO', action: 'Inspection and payment', details: 'After the services are inspected and accepted, the JO supports the DV (checklist 1614 or 1615 for payment to supplier).' },
  ],
  template: `${header('JOB ORDER')}
  <table class="pt">
    <tr><td style="width:58%">Supplier: <b>{{supplier}}</b><br>Address: {{address}}<br><br>TIN: {{tin}}</td><td>J.O. No.: <b>{{joNo}}</b><br>Date: <b>{{date|date}}</b><br><br>PR No./s: <b>{{prNos}}</b></td></tr>
    <tr><td colspan="2">Gentlemen:<br>Per your quotation(s) on <b>{{quotationDate|date}}</b> please cause the services for our office of the following:</td></tr>
    <tr><td>Place of Delivery: {{placeOfDelivery}}<br>Date of Delivery: {{dateOfDelivery}}</td><td>Delivery Term: {{deliveryTerm}}<br>Payment Term: {{paymentTerm}}</td></tr>
  </table>
  <table class="pt" data-grow>
    <thead><tr><th rowspan="2">DESCRIPTION OF JOB / SERVICE DESIRED</th><th rowspan="2" style="width:15%">Service/ Labor</th><th colspan="2">Charges</th></tr>
      <tr><th style="width:14%">Spare Parts</th><th style="width:14%">Materials</th></tr></thead>
    <tbody>{{#each items}}<tr class="blank"><td>{{description}}</td><td class="r">{{labor|currency}}</td><td class="r">{{spareParts|currency}}</td><td class="r">{{materials|currency}}</td></tr>{{/each}}
      <tr><td class="r"><b>TOTAL:</b></td><td class="r"><b>{{sum:items.labor|currency}}</b></td><td class="r"><b>{{sum:items.spareParts|currency}}</b></td><td class="r"><b>{{sum:items.materials|currency}}</b></td></tr>
      <tr><td colspan="4"><b>(Total Amount in Words)</b> <i>{{sum:items.total|words}}</i> ({{sum:items.total|peso}})</td></tr></tbody>
  </table>
  <table class="pt"><tr><td class="lbl">PURPOSE:</td><td>{{purpose}}</td></tr>
    <tr><td colspan="2" style="font-size:9.5px">Delivery of the services shall be made within the period indicated in the JOB ORDER. No other delivery dates shall be allowed. For late delivery, a penalty of 1/10 of 1% of the total amount of the JOB ORDER shall be imposed for every day of delay.<br>
    Violation by the contractor/ dealer of terms and conditions stipulated upon by both parties due to unjustifiable and / or unreasonable cause shall be subject to any legal action that this Agency deems proper and necessary.</td></tr></table>
  ${conformeBlock}
  <br>${sanggunianBlock}
  <div class="pf-foot">Control No. {{controlNo}} · Prepared in DMS by {{preparedBy}}</div>`,
};

// ---------------------------------------------------------------- PCV
const PCV = {
  code: 'PCV',
  name: 'Petty Cash Voucher',
  category: 'Disbursement',
  description: 'Request for and payment of small expenses from the petty cash fund, and its liquidation (refund or reimbursement).',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // No checklist: only the DV and the Liquidation Report have one (v2).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Request', instructions: 'Encode the payee/office and what the petty cash is for (Part I, to be filled out upon request). The PCV No. is assigned by the Petty Cash Custodian.' },
    { id: 's2', title: 'Signatories', instructions: 'The requestor and the immediate supervisor who approves. The Petty Cash Custodian signs when paying.' },
    { id: 's3', title: 'Liquidation', instructions: 'Part II, to be filled out upon liquidation: the amount paid per OR/invoice. Leave blank until you liquidate, then edit this PCV.' },
  ],
  fields: [
    { key: 'pcvNo', label: 'PCV No.', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    fundField('s1'),
    { key: 'payee', label: 'Payee/Office', type: 'text', required: true, step: 's1' },
    { key: 'address', label: 'Address', type: 'text', step: 's1' },
    { key: 'fpp', label: 'FPP', type: 'text', step: 's1' },
    {
      key: 'items', label: 'Particulars', type: 'table', required: true, step: 's1', minRows: 6,
      columns: [
        { key: 'particulars', label: 'Particulars', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    { key: 'requestor', label: 'Requested by (name)', type: 'text', required: true, step: 's2' },
    { key: 'supervisor', label: 'Approved by — Immediate Supervisor (name)', type: 'text', required: true, step: 's2' },
    { key: 'custodian', label: 'Petty Cash Custodian (name)', type: 'text', step: 's2' },
    { key: 'totalGranted', label: 'Total Amount Granted', type: 'currency', compute: 'sum:items.amount', step: 's3' },
    { key: 'totalPaid', label: 'Total Amount Paid per OR/Invoice', type: 'currency', step: 's3' },
    { key: 'orNo', label: 'OR/Invoice No.', type: 'text', step: 's3' },
    { key: 'refund', label: 'Amount Refunded / (Reimbursed)', type: 'currency', compute: 'totalGranted-totalPaid', step: 's3', help: 'Positive: refund to the custodian. Negative: reimbursement to the payee.' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Requesting Office', action: 'Box A: request and approval', details: 'The requestor signs and the immediate supervisor approves.' },
    { id: 'p2', office: 'Petty Cash Custodian', action: 'Box B: payment', details: 'The custodian pays out; the payee signs "Cash Received by" and dates it.' },
    { id: 'p3', office: 'Payee', action: 'Liquidate', details: 'Submit the OR/invoice to the custodian. Fill in Part II in DMS (edit this PCV) and reprint.' },
    { id: 'p4', office: 'Petty Cash Custodian', action: 'Boxes C and D: refund or reimbursement', details: 'The custodian receives any refund or pays the reimbursement and marks the liquidation submitted. Paid PCVs support the replenishment of petty cash (checklist 1902).' },
  ],
  template: `${header('PETTY CASH VOUCHER')}
  <table class="pt">
    <tr><td rowspan="3" style="width:66%">Fund: <b>{{fund}}</b><br>Payee/Office: <b>{{payee}}</b><br>Address: {{address}}</td><td>No.: <b>{{pcvNo}}</b></td></tr>
    <tr><td>Date: <b>{{date|date}}</b></td></tr>
    <tr><td>FPP: <b>{{fpp}}</b></td></tr>
  </table>
  <table class="pt">
    <tr><th style="width:55%;text-align:left"><i>I. To be filled out upon request</i></th><th style="text-align:left"><i>II. To be filled out upon liquidation</i></th></tr>
    <tr><td style="padding:0">
        <table class="pt" data-grow style="margin:0"><thead><tr><th>Particulars</th><th style="width:32%">Amount</th></tr></thead>
        <tbody>{{#each items}}<tr class="blank"><td>{{particulars}}</td><td class="r">{{amount|currency}}</td></tr>{{/each}}</tbody></table></td>
      <td style="padding:8px">Total Amount Granted: <b>{{totalGranted|peso}}</b><br><br>Total Amount Paid per OR/Invoice No. <b>{{orNo}}</b>: <b>{{totalPaid|peso}}</b><br><br>Amount Refunded/ (Reimbursed): <b>{{refund|peso}}</b></td></tr>
    <tr><td class="pf-cell"><b>A.</b> <i>Requested by:</i>${signBlock('{{requestor|upper}}', 'Signature over Printed Name', 'Requestor')}
        <br><i>Approved by:</i>${signBlock('{{supervisor|upper}}', 'Signature over Printed Name', 'Immediate Supervisor')}</td>
      <td class="pf-cell"><b>C.</b><br><span class="pf-box"></span> <i>Received Refund</i><br><span class="pf-box"></span> <i>Reimbursement Paid</i>
        ${signBlock('{{custodian|upper}}', 'Signature over Printed Name', 'Petty Cash Custodian')}</td></tr>
    <tr><td class="pf-cell"><b>B.</b> <i>Paid by:</i>${signBlock('{{custodian|upper}}', 'Signature over Printed Name', 'Petty Cash Custodian')}
        <br><i>Cash Received by:</i>${signBlock('{{payee|upper}}', 'Signature over Printed Name', 'Payee')}<div>Date: __________</div></td>
      <td class="pf-cell"><b>D.</b><br><span class="pf-box"></span> <i>Liquidation Submitted</i><br><span class="pf-box"></span> <i>Reimbursement Received by:</i>
        ${signBlock('{{payee|upper}}', 'Signature over Printed Name', 'Payee')}<div>Date: __________</div></td></tr>
  </table>
  <div class="pf-foot">Control No. {{controlNo}} · Prepared in DMS by {{preparedBy}}</div>`,
};

// ---------------------------------------------------------------- LR
const LR = {
  code: 'LR',
  name: 'Liquidation Report',
  category: 'Liquidation',
  description: 'Liquidation of a cash advance (travel, special activities, fund transfers, petty cash). The checklist depends on the type of liquidation.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'liquidation',
  // Redrawn after the LGU's form; sites that have not edited it are updated (lib/api.js).
  starterVersion: 2,
  steps: [
    { id: 's1', title: 'Cash Advance', instructions: 'Encode the period covered, fund, office and function/program/project, and the cash advance being liquidated (amount, DV No. and date).' },
    { id: 's2', title: 'Particulars', instructions: 'List each expense with its amount. The total spent is computed.' },
    { id: 's3', title: 'Refund & Signatories', instructions: 'If you returned unspent cash, enter the amount, OR No. and date of the refund. Box A is the claimant, Box B the immediate supervisor; Box C prints the Accountant from Settings.' },
  ],
  fields: [
    { key: 'serialNo', label: 'Serial No. (Accounting)', type: 'text', step: 's1' },
    { key: 'date', label: 'Date', type: 'date', required: true, step: 's1' },
    { key: 'periodCovered', label: 'Period Covered', type: 'text', required: true, step: 's1' },
    fundField('s1'),
    { key: 'office', label: 'Department/Office', type: 'text', required: true, step: 's1' },
    { key: 'fpp', label: 'Function/Program/Project', type: 'text', step: 's1' },
    { key: 'cashAdvance', label: 'Amount of Cash Advance', type: 'currency', required: true, step: 's1' },
    { key: 'dvNo', label: 'Cash Advance DV No.', type: 'text', required: true, step: 's1' },
    { key: 'dvDate', label: 'DV Date', type: 'date', step: 's1' },
    {
      key: 'items', label: 'Particulars', type: 'table', required: true, step: 's2',
      columns: [
        { key: 'particulars', label: 'Particulars', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'currency', total: true },
      ],
    },
    { key: 'totalSpent', label: 'Total Amount Spent', type: 'currency', compute: 'sum:items.amount', step: 's2' },
    { key: 'refund', label: 'Amount Refunded', type: 'currency', step: 's3' },
    { key: 'refundOrNo', label: 'Refund OR No.', type: 'text', step: 's3' },
    { key: 'refundDate', label: 'Refund Date', type: 'date', step: 's3' },
    { key: 'reimburse', label: 'Amount to be Reimbursed', type: 'currency', compute: 'totalSpent-cashAdvance+refund', step: 's3', help: 'Total spent minus the cash advance (plus any refund). A positive amount is owed to you.' },
    { key: 'claimant', label: 'Box A — Claimant (name)', type: 'text', required: true, step: 's3' },
    { key: 'supervisor', label: 'Box B — Immediate Supervisor (name)', type: 'text', required: true, step: 's3' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Claimant', action: 'Box A and the supporting documents', details: 'Sign Box A (correctness of the data). Attach every document on the printed liquidation checklist, with the checklist on top. Submit within the period required for the cash advance.' },
    { id: 'p2', office: 'Immediate Supervisor', action: 'Box B', details: 'The immediate supervisor certifies that the purpose of the travel/cash advance was duly accomplished.' },
    { id: 'p3', office: "Municipal Treasurer's Office", action: 'Refund (if any)', details: 'Return any unspent cash to the Treasury and write the OR No. and date on the LR.' },
    { id: 'p4', office: 'Municipal Accounting Office', action: 'Box C and recording', details: 'The Accountant checks the documents against the checklist, certifies Box C, assigns the Serial No. and records the liquidation. Any amount to be reimbursed is paid through a DV (checklist 1407).' },
  ],
  // Laid out like the Liquidation Report of the Municipal Government of Candoni (35_Liquidation_Report.xlsx,
  // printed from Google Sheets).
  template: `<div class="lrf"><table class="lrf-main" data-grow>
  <colgroup><col style="width:32.624%"><col style="width:37.893%"><col style="width:29.483%"></colgroup>
  <tr class="lrf-head"><td colspan="3"><img class="lrf-seal" src="{{lgu.seal}}" alt="">
    <div class="lrf-l1">Republic of the Philippines</div><div class="lrf-l2">{{lgu.name|upper}}</div><div class="lrf-l3">{{lgu.address}}</div>
    <div class="lrf-title">LIQUIDATION REPORT</div></td></tr>
  <tr class="lrf-serial"><td colspan="2" class="lrf-open"></td><td>Serial No: <b>{{serialNo}}</b></td></tr>
  <tr class="lrf-r lrf-r1"><td class="r">Period Covered :</td><td class="lrf-val">{{periodCovered|upper}}</td><td>Date: <b>{{date|date}}</b></td></tr>
  <tr class="lrf-r lrf-r2"><td class="r">Fund:</td><td class="lrf-val">{{fund|upper}}</td><td rowspan="2" class="lrf-fpp">Function/Program/Project<div><b>{{fpp|upper}}</b></div></td></tr>
  <tr class="lrf-r lrf-r3"><td class="r">Department/Office:</td><td class="lrf-val">{{office|upper}}</td></tr>
  <tr class="lrf-rule"><td colspan="3"></td></tr>
  <tr class="lrf-cols"><td colspan="2" class="lrf-pt">P A R T I C U L A R S</td><td>Amount</td></tr>
  {{#each items}}<tr class="blank lrf-line"><td colspan="2">{{particulars}}</td><td class="r">{{amount|currency}}</td></tr>{{/each}}
  <tr class="blank lrf-line"><td colspan="2"></td><td></td></tr>
  <tr class="lrf-t lrf-t1"><td colspan="3">TOTAL AMOUNT SPENT<span class="lrf-amt">{{totalSpent|currency}}</span></td></tr>
  <tr class="lrf-t lrf-t2"><td colspan="3">AMOUNT OF CASH ADVANCE PER DV NO.<span class="lrf-u lrf-u1">{{dvNo|upper}}</span>DTD.<span class="lrf-u lrf-u2">{{dvDate|mdy}}</span><span class="lrf-amt">{{cashAdvance|currency}}</span></td></tr>
  <tr class="lrf-t lrf-t3"><td colspan="3">AMOUNT REFUNDED PER OR NO.<span class="lrf-u lrf-u3">{{refundOrNo|upper}}</span>DTD.<span class="lrf-u lrf-u2">{{refundDate|mdy}}</span><span class="lrf-amt">{{refund|currency}}</span></td></tr>
  <tr class="lrf-t lrf-t4"><td colspan="3">AMOUNT TO BE REIMBURSED<span class="lrf-amt">{{reimburse|currency}}</span></td></tr>
  </table>
  <table class="lrf-sign">
  <colgroup><col style="width:36.170%"><col style="width:31.206%"><col style="width:32.624%"></colgroup>
  <tr>
    <td><div class="lrf-txt"><span class="lrf-lt">A</span><span><b>Certified:</b> Correctness of the above data</span></div>
      <div class="lrf-sig lrf-sa"><div class="lrf-name">{{claimant|upper}}</div><div class="lrf-cap">Signature over Printed Name</div><div class="lrf-cap">Claimant</div><div class="lrf-date">Date:</div></div></td>
    <td><div class="lrf-txt"><span class="lrf-lt">B</span><span><b>Certified:</b> Purpose of travel/cash advance duly accomplished</span></div>
      <div class="lrf-sig lrf-sb"><div class="lrf-name">{{supervisor|upper}}</div><div class="lrf-cap">Signature over Printed Name</div><div class="lrf-cap">Immediate Supervisor</div><div class="lrf-date">Date:</div></div></td>
    <td><div class="lrf-txt"><span class="lrf-lt">C</span><span><b>Certified:</b> Supporting documents complete and proper</span></div>
      <div class="lrf-sig lrf-sc"><div class="lrf-name">{{sig.accountant|upper}}</div><div class="lrf-cap">Signature over Printed Name</div><div class="lrf-cap">Municipal Accountant</div><div class="lrf-date">Date:</div></div></td>
  </tr>
  </table></div>`,
};

// ---------------------------------------------------------------- IT
const IT = {
  code: 'IT',
  name: 'Itinerary of Travel',
  category: 'Travel',
  description: 'Planned (or actual) itinerary with transportation, per diem and other expenses. Supports the cash advance for local travel (checklist 1229) and its liquidation (2002).',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // No checklist: only the DV and the Liquidation Report have one (v2).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Traveler', instructions: 'Name, position and official station of the traveler, date and purpose of travel.' },
    { id: 's2', title: 'Itinerary', instructions: 'One line per leg: date, place visited (destination), time of departure and arrival, means of transportation, fare, per diem and other expenses. The line total is computed.' },
    { id: 's3', title: 'Signatories', instructions: 'Your immediate supervisor certifies; the Mayor (from Settings) approves.' },
  ],
  fields: [
    fundField('s1'),
    { key: 'itNo', label: 'No.', type: 'text', step: 's1' },
    { key: 'name', label: 'Name', type: 'text', required: true, step: 's1' },
    { key: 'position', label: 'Position', type: 'text', required: true, step: 's1' },
    { key: 'station', label: 'Official Station', type: 'text', required: true, step: 's1' },
    { key: 'dateOfTravel', label: 'Date of Travel', type: 'date', required: true, step: 's1' },
    { key: 'purpose', label: 'Purpose of Travel', type: 'textarea', required: true, step: 's1' },
    {
      key: 'legs', label: 'Itinerary', type: 'table', required: true, step: 's2', minRows: 14,
      columns: [
        { key: 'date', label: 'Date', type: 'date' },
        { key: 'place', label: 'Places to be visited (Destination)', type: 'text' },
        { key: 'departure', label: 'Departure', type: 'text' },
        { key: 'arrival', label: 'Arrival', type: 'text' },
        { key: 'means', label: 'Means of Transportation', type: 'text' },
        { key: 'fare', label: 'Transportation', type: 'currency', total: true },
        { key: 'perDiem', label: 'Per Diem', type: 'currency', total: true },
        { key: 'others', label: 'Others', type: 'currency', total: true },
        { key: 'total', label: 'Total Amount', type: 'currency', compute: 'fare+perDiem+others', total: true },
      ],
    },
    { key: 'supervisor', label: 'Immediate Supervisor (name)', type: 'text', required: true, step: 's3' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Traveler', action: 'Prepare and sign', details: 'Sign "Prepared by". Attach the approved Travel Order.' },
    { id: 'p2', office: 'Immediate Supervisor', action: 'Certify', details: 'Certifies that the itinerary was reviewed, the travel is necessary to the service, the period covered is reasonable and the expenses claimed are proper.' },
    { id: 'p3', office: 'Office of the Municipal Mayor', action: 'Approve', details: 'The agency head or authorized representative approves.' },
    { id: 'p4', office: 'Traveler', action: 'Use for the cash advance and liquidation', details: 'Attach to the DV for the cash advance for local travel (checklist 1229). After the travel, a revised IT is needed if the itinerary was not followed (liquidation checklist 2002).' },
  ],
  template: `<div class="ph"><img src="{{lgu.seal}}" alt=""><div class="l1">{{lgu.name|upper}}</div><div class="l3" style="margin-top:0">ITINERARY OF TRAVEL</div></div>
  <table class="pmeta-t"><tr><td>Fund: <b>{{fund}}</b></td><td class="r">No.: <b>{{itNo}}</b></td></tr></table>
  <table class="pt">
    <tr><td style="width:52%">Name: <b>{{name|upper}}</b></td><td>Date of Travel: <b>{{dateOfTravel|date}}</b></td></tr>
    <tr><td>Position: <b>{{position|upper}}</b></td><td rowspan="2">Purpose of Travel:<br><b>{{purpose|upper}}</b></td></tr>
    <tr><td>Official Station: <b>{{station|upper}}</b></td></tr>
  </table>
  <table class="pt" data-grow style="font-size:9.5px">
    <thead><tr><th rowspan="2">Date</th><th rowspan="2">Places to be visited (Destination)</th><th colspan="2">TIME</th><th rowspan="2">Means of Transportation</th><th rowspan="2">Transpor- tation</th><th rowspan="2">Per Diem</th><th rowspan="2">Others</th><th rowspan="2">Total Amount</th></tr>
      <tr><th>Departure</th><th>Arrival</th></tr></thead>
    <tbody>{{#each legs}}<tr class="blank"><td>{{date|date}}</td><td>{{place}}</td><td class="c">{{departure}}</td><td class="c">{{arrival}}</td><td>{{means}}</td><td class="r">{{fare|currency}}</td><td class="r">{{perDiem|currency}}</td><td class="r">{{others|currency}}</td><td class="r">{{total|currency}}</td></tr>{{/each}}
      <tr><td colspan="5" class="r"><b>TOTAL</b></td><td class="r"><b>{{sum:legs.fare|currency}}</b></td><td class="r"><b>{{sum:legs.perDiem|currency}}</b></td><td class="r"><b>{{sum:legs.others|currency}}</b></td><td class="r"><b>{{sum:legs.total|currency}}</b></td></tr></tbody>
  </table>
  <table class="pt">
    <tr><td class="pf-cell" rowspan="2" style="width:50%;vertical-align:middle">I certify that : (1) I have reviewed the foregoing itinerary, (2) the travel is necessary to the service, (3) the period covered is reasonable and (4) the expenses claimed are proper.
        ${signBlock('{{supervisor|upper}}', 'Signature over Printed Name', 'Immediate Supervisor')}</td>
      <td class="pf-cell" style="height:70px">Prepared by :${signBlock('{{name|upper}}', 'Signature over Printed Name')}</td></tr>
    <tr><td class="pf-cell" style="height:70px">Approved by:${signBlock('{{sig.mayor|upper}}', 'Signature over Printed Name', 'Agency Head/Authorized Representative')}</td></tr>
  </table>
  <div class="pf-foot">Control No. {{controlNo}} · Prepared in DMS by {{preparedBy}}</div>`,
};

// ---------------------------------------------------------------- Travel Order
// The Office of the Mayor's Travel Order, as issued: letterhead, the order no. (assigned by the
// Mayor's Office on the PDF), the travelers, the purposes, and the Mayor's approval.
const TO = {
  code: 'TO',
  name: 'Travel Order',
  category: 'Travel',
  description: 'Directs an official or employee to travel on official business and authorizes the expenses of the travel. Supports the cash advance for local travel and its liquidation.',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  starterVersion: 3,
  // The letterhead (title, email, contact no.) of the issuing office, from Settings.
  headerOffice: 'Office of the Municipal Mayor',
  steps: [
    { id: 's1', title: 'Travelers', instructions: 'One line per person directed to travel: the name and the position.' },
    { id: 's2', title: 'Travel', instructions: 'The date or dates of travel as they should read on the order, and one line per purpose, in the order they are listed. The Travel Order No. is assigned by the Office of the Mayor.' },
    { id: 's3', title: 'Issue', instructions: 'The date the order is given and signed, and who approves: the Mayor or, in their place, the Vice Mayor (names from Settings).' },
  ],
  fields: [
    { key: 'toNo', label: 'Travel Order No.', type: 'text', filledBy: 'mayor' },
    {
      key: 'travelers', label: 'Travelers', type: 'table', required: true, step: 's1',
      columns: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'position', label: 'Position', type: 'text', keepCase: true },
      ],
    },
    { key: 'travelDates', label: 'Date/s of travel', type: 'text', required: true, keepCase: true, step: 's2',
      help: 'Printed after "You are hereby directed to travel with the following Purpose/s on". Write the month, the day or days and the year.' },
    {
      key: 'purposes', label: 'Purpose/s', type: 'table', required: true, step: 's2',
      help: 'Printed as a numbered list, as typed. Add a line to authorize the claim of actual expenses if it applies.',
      columns: [{ key: 'purpose', label: 'Purpose', type: 'textarea', keepCase: true }],
    },
    { key: 'givenDate', label: 'Given and signed on', type: 'date', required: true, keepCase: true, step: 's3' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Requesting Office', action: 'Prepare the Travel Order', details: 'Encode the travelers, the date/s and the purposes of the travel, with the invitation or other basis of the travel.' },
    { id: 'p2', office: 'Office of the Municipal Mayor', action: 'Number and approve', sign: true, assign: { field: 'toNo', dateField: '', pattern: '{YYYY}-{####}' }, details: 'Assigns the Travel Order No. and puts it on the PDF. The Mayor approves and signs the order.' },
    { id: 'p3', office: 'Requesting Office', action: 'Use for the travel', details: 'Attach the approved Travel Order to the Itinerary of Travel and to the DV for the cash advance for local travel, and to its liquidation.' },
  ],
  template: `<div class="to">
  <div class="to-head"><img src="{{lgu.seal}}" alt="">
    <div>Republic of the Philippines</div>
    <div class="to-lgu">{{lgu.name|upper}}</div>
    <div class="to-small">{{lgu.address}}</div>
    {{#if office.email}}<div class="to-small"><i>Email Address:</i> <u>{{office.email}}</u></div>{{/if}}
    {{#if office.contact}}<div class="to-small"><i>Contact No.:</i> {{office.contact}}</div>{{/if}}
    <div class="to-office">{{office.letterhead}}</div></div>
  <div class="to-title">TRAVEL ORDER NO.: {{toNo}}</div>
  <div>Series of {{givenDate|year}}</div>
  <table class="to-to"><tr><td class="to-k">TO</td><td class="to-c">:</td><td><table class="to-who">{{#each travelers}}<tr><td class="to-n"><b>{{name}}</b></td><td class="to-c">-</td><td>{{position}}</td></tr>{{/each}}</table></td></tr></table>
  <p>You are hereby directed to travel with the following Purpose/s on {{travelDates}}</p>
  <table class="to-list">{{#each purposes}}<tr><td class="to-no">{{@no}}.</td><td>{{purpose}}</td></tr>{{/each}}</table>
  <p class="to-gap">This travel order is issued for the good public service.</p>
  <p>Given and signed this {{givenDate|day}}<sup>{{givenDate|ord}}</sup> day of {{givenDate|monthyear}} at Candoni, {{lgu.province}}.</p>
  <table class="to-sign"><tr><td class="to-appr">Approved:</td><td class="to-signer"><div class="to-space"></div><b>{{sig.mayor|upper}}</b><div>{{#if approver=Municipal Vice Mayor}}Vice Mayor{{/if}}{{#if !approver}}Mayor{{/if}}{{#if approver=Municipal Mayor}}Mayor{{/if}}</div></td></tr></table>
  <table class="to-fill" data-grow><tr class="blank"><td></td></tr></table>
  <div class="to-foot">#CandoniSHINE &nbsp;|&nbsp; Experience Rural Tranquility</div>
</div>`,
};

// ---------------------------------------------------------------- Payroll
const PAYROLL = {
  code: 'PAYROLL',
  name: 'Payroll',
  // its PDF (employees' pay) is shown on the QR page only to signed-in DMS users who handle it
  publicPdf: false,
  category: 'Disbursement',
  description: 'Group payment of salaries, wages, allowances and benefits. It is paid through a DV, whose checklist depends on the type of payroll (10xx through ATM, 12xx cash advance).',
  paperSize: 'A4',
  orientation: 'portrait',
  active: true,
  checklistSource: 'own',
  // No checklist: only the DV and the Liquidation Report have one (v2).
  starterVersion: 3,
  steps: [
    { id: 's1', title: 'Payroll', instructions: 'The period covered, fund, office and the approved OBR No. The Payroll No. is assigned by Accounting.' },
    { id: 's2', title: 'Employees', instructions: 'One line per employee: name, position, employee no., gross amount earned and total deductions. The net amount due is computed.' },
    { id: 's3', title: 'Box A', instructions: 'The authorized official certifies that services were duly rendered. Boxes B, C and D print the Accountant, Treasurer and Mayor from Settings.' },
  ],
  fields: [
    { key: 'period', label: 'For the period', type: 'text', required: true, step: 's1', placeholder: 'e.g. October 1-15, 2026' },
    fundField('s1'),
    { key: 'office', label: 'Office', type: 'text', required: true, step: 's1' },
    { key: 'obrNo', label: 'OBR No.', type: 'text', required: true, step: 's1' },
    { key: 'payrollNo', label: 'Payroll No. (Accounting)', type: 'text', step: 's1' },
    {
      key: 'employees', label: 'Employees', type: 'table', required: true, step: 's2', minRows: 10,
      columns: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'position', label: 'Position', type: 'text' },
        { key: 'employeeNo', label: 'Employee No.', type: 'text' },
        { key: 'gross', label: 'Gross Amount Earned', type: 'currency', total: true },
        { key: 'deductions', label: 'Total Deductions', type: 'currency', total: true },
        { key: 'net', label: 'Net Amount Due', type: 'currency', compute: 'gross-deductions', total: true },
      ],
    },
    { key: 'certA', label: 'Box A — Authorized Official (name)', type: 'text', required: true, step: 's3' },
    { key: 'disbursingOfficer', label: 'Box E — Disbursing Officer (name)', type: 'text', step: 's3' },
  ],
  checklist: [],
  processing: [
    { id: 'p1', office: 'Requesting Office', action: 'Box A and attachments', details: 'The authorized official certifies that services were duly rendered. Attach the approved OBR; the payroll then goes with its DV, which carries the checklist.' },
    { id: 'p2', office: 'Municipal Accounting Office', action: 'Box B and accounting entries', details: 'Accounting checks the documents against the DV\'s checklist, certifies Box B, assigns the Payroll No. and fills in the accounting entries (G).' },
    { id: 'p3', office: "Municipal Treasurer's Office", action: 'Box C: cash available', details: 'The Treasurer certifies that cash is available.' },
    { id: 'p4', office: 'Office of the Municipal Mayor', action: 'Box D: approved for payment', details: 'The Local Chief Executive approves the payment.' },
    { id: 'p5', office: 'Treasury / Disbursing Officer', action: 'Payment and Box E', details: 'Salaries are credited (ATM) or paid; employees paid in cash sign opposite their names. The disbursing officer certifies Box E; the check/ADA details are filled in (F).' },
  ],
  template: `<div class="ph"><img src="{{lgu.seal}}" alt=""><div class="l2">Republic of the Philippines</div><div class="l1">{{lgu.name|upper}}</div><div class="l2">{{lgu.address}}</div>
    <div class="l3">PAYROLL</div><div class="l2">For the period <b>{{period}}</b></div></div>
  <table class="pmeta-t"><tr><td>Fund: <b>{{fund}}</b> &nbsp; Office: <b>{{office}}</b></td><td class="r">Payroll No.: <b>{{payrollNo}}</b></td></tr>
    <tr><td colspan="2">We acknowledge receipt of cash shown opposite our name as full compensation for services rendered for the period covered.</td></tr></table>
  <table class="pt" data-grow style="font-size:9.5px">
    <thead><tr><th style="width:4%">Serial No.</th><th>Name</th><th>Position</th><th>Employee No.</th><th>Gross Amount Earned</th><th>Total Deductions</th><th>Net Amount Due</th><th style="width:14%">Signature of Recipient</th></tr></thead>
    <tbody>{{#each employees}}<tr class="blank"><td class="c">{{@no}}</td><td>{{name|upper}}</td><td>{{position}}</td><td class="c">{{employeeNo}}</td><td class="r">{{gross|currency}}</td><td class="r">{{deductions|currency}}</td><td class="r">{{net|currency}}</td><td></td></tr>{{/each}}
      <tr><td colspan="4" class="r"><b>TOTAL</b></td><td class="r"><b>{{sum:employees.gross|currency}}</b></td><td class="r"><b>{{sum:employees.deductions|currency}}</b></td><td class="r"><b>{{sum:employees.net|currency}}</b></td><td></td></tr></tbody>
  </table>
  <table class="pt">
    <tr>
      <td class="pf-cell" style="width:33%"><b>A</b> CERTIFIED: Services duly rendered as stated.${signBlock('{{certA|upper}}', 'Signature over Printed Name', 'Authorized Official')}</td>
      <td class="pf-cell" style="width:33%"><b>B</b> CERTIFIED: Supporting documents complete and proper.${signBlock('{{sig.accountant|upper}}', 'Signature over Printed Name', 'Head of Accounting Division/Unit')}</td>
      <td class="pf-cell"><b>C</b> CERTIFIED: Cash available for the purpose.${signBlock('{{sig.treasurer|upper}}', 'Signature over Printed Name', 'Head of Treasury Division/Unit')}</td>
    </tr>
    <tr>
      <td class="pf-cell"><b>D</b> APPROVED FOR PAYMENT: <b>{{sum:employees.net|peso}}</b>${signBlock('{{sig.mayor|upper}}', 'Signature over Printed Name/Position', 'Local Chief Executive')}</td>
      <td class="pf-cell"><b>E</b> CERTIFIED: Each employee whose name appears on the payroll has been paid the amount as indicated opposite his/her name.${signBlock('{{disbursingOfficer|upper}}', 'Signature over Printed Name', 'Disbursing Officer')}</td>
      <td class="pf-cell"><b>F</b><br>OBR No.: <b>{{obrNo}}</b><br>Date: __________<br><br>Check No.: __________<br>Date: __________</td>
    </tr>
  </table>
  <table class="pt">
    <tr><th colspan="8" style="text-align:left">G &nbsp; ACCOUNTING ENTRIES</th></tr>
    <tr><th>Particulars</th><th>Account Code</th><th>Debit</th><th>Credit</th><th>Particulars</th><th>Account Code</th><th>Debit</th><th>Credit</th></tr>
    ${blankRows(8, 3)}
    <tr><td colspan="8" class="cap" style="text-align:left">Encoded by: ________ &nbsp; Journal Entry by: ________ &nbsp; Certified Correct: <b>{{sig.accountant|upper}}</b>, Head, Accounting Department/Unit</td></tr>
  </table>
  <div class="pf-foot">Control No. {{controlNo}} · Prepared in DMS by {{preparedBy}}</div>`,
};

// Settings filled in on a new site (Settings page can change them): the LGU and the
// signatories as printed on the Appendix Forms of the Municipal Government of Candoni.
// Raised when the bundled checklist library (src/data/checklists.json) changes:
// 2 = Document Type and Document Details for every item, 1001 from its revised Word file.
export const CHECKLIST_LIBRARY_VERSION = 2;

// The parts of a document type that make up its format (what a starter update replaces).
export const FORMAT_KEYS = ['template', 'fields', 'steps', 'processing', 'paperSize', 'orientation', 'checklistSource', 'checklist', 'bulkDownload', 'headerOffice'];

// Positions of people within an office (Users), named on route steps so that only the right person
// acts: e.g. the Reviewer in Accounting, not the Encoder; the Inspection Officer in the GSO.
// Admins add more in Settings, Users or Workflow.
export const DEFAULT_POSITIONS = [
  'Encoder', 'Reviewer', 'Bookkeeper', 'Cashier', 'Disbursing Officer', 'Inspection Officer', 'Acceptance Officer',
  'Property Custodian', 'Records Officer', 'Signatory',
];
// Funds of the LGU (the Fund field of every form, Upload). Admins add more in Settings.
export const DEFAULT_FUNDS = ['General Fund', 'Special Education Fund', 'Trust Fund'];
export const fundsOf = (settings) => (settings?.funds?.length ? settings.funds : DEFAULT_FUNDS);

export const positionsOf = (settings) => (settings?.positions?.length ? settings.positions : DEFAULT_POSITIONS);

export const DEFAULT_SETTINGS = {
  checklistLibraryVersion: CHECKLIST_LIBRARY_VERSION,
  // Offices of the LGU. Each user belongs to one (Users), and sees the documents of that office.
  offices: [
    'Office of the Municipal Mayor',
    'Office of the Municipal Vice Mayor',
    'Sangguniang Bayan',
    'Municipal Administrator\'s Office',
    'Municipal Accounting Office',
    'Municipal Budget Office',
    'Municipal Treasurer\'s Office',
    'Municipal Assessor\'s Office',
    'Municipal Planning and Development Office',
    'Municipal Engineering Office',
    'Municipal Civil Registrar\'s Office',
    'Municipal Health Office',
    'Municipal Social Welfare and Development Office',
    'Municipal Agriculture Office',
    'Municipal Disaster Risk Reduction and Management Office',
    'Human Resource Management Office',
    'General Services Office',
    'Municipal Environment and Natural Resources Office',
    'Business Permits and Licensing Office',
    'Municipal Tourism Office',
  ],
  positions: DEFAULT_POSITIONS,
  funds: DEFAULT_FUNDS,
  // Each office's letterhead: the title printed under the LGU, its email address and contact no.
  officeContacts: {
    'Office of the Municipal Mayor': { letterhead: 'Office of the Mayor', email: 'mgo.candoni@gmail.com', contact: '(+63) 966 830 6543' },
  },
  lguName: 'Municipal Government of Candoni',
  lguAddress: 'Municipal Building, Rizal St., Candoni, Negros Occidental, 6110',
  province: 'Negros Occidental',
  signatories: {
    mayor: 'CICERO D. BORROMEO', mayorPosition: 'Municipal Mayor',
    viceMayor: '', viceMayorPosition: 'Municipal Vice Mayor',
    accountant: 'NEIL P. PRIOLO, CPA', accountantPosition: 'Municipal Accountant',
    budget: 'RAQUEL C. MATA', budgetPosition: 'Municipal Budget Officer',
    treasurer: 'MA. DYMPHNA T. SARMOY', treasurerPosition: 'Acting - Municipal Treasurer',
    sbSecretary: 'BENJIE M. OROT, LPT', sbSecretaryPosition: 'Secretary to the Sanggunian',
  },
};

// Every format that prints the Mayor lets the preparer choose the Mayor or the Vice Mayor.
export const STARTER_TYPES = [DV, OBR, FURS, PAYROLL, PCV, LR, IT, TO, PR, PO, JO].map(withApprover);

export const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Amount (₱)' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'table', label: 'Table / line items' },
];

export const COLUMN_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text (paragraph)' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Amount (₱)' },
  { value: 'date', label: 'Date' },
];

export const STATUSES = {
  draft: { label: 'Draft', className: 'badge-gray' },
  complete: { label: 'Complete', className: 'badge-green' },
  // Shown (not stored): the last office marked it processed (its route is done; it is in the Archive).
  processed: { label: 'Processed', className: 'badge-blue' },
  cancelled: { label: 'Cancelled', className: 'badge-red' },
};
