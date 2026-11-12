import test from 'node:test';
import assert from 'node:assert/strict';
import { checklistRows, parsePrecheck, precheckBasis, precheckBrief, precheckFiles } from './precheck.js';

const dv = {
  controlNo: 'DMS-2026-000020', data: { payee: 'ACME TRADING', dvNo: 'GF-2026-11-0001', amountDue: 15250.5, particulars: [{ explanation: 'Office supplies', amount: 15250.5 }], adjustments: [{ explanation: 'Tax withheld', amount: -250 }] },
  pdf: { files: [{ path: 'documents/d/0-generated.pdf' }, { path: 'documents/d/1-signed.pdf' }] },
  transaction: { code: '1.2', title: 'Supplies', items: [{ id: 'a', label: 'Approved OBR', required: true }, { id: 'b', label: 'Invoice', required: true }, { id: 'c', label: 'Inspection report' }] },
  checklist: { a: 'Y', b: 'Y', c: 'NA' },
  links: { a: [{ kind: 'fts', id: 'obr1', controlNo: 'DMS-2026-000019', typeCode: 'OBR' }], b: [{ kind: 'file', path: 'documents/d/attachments/b/inv.pdf', name: 'inv.pdf' }, { kind: 'file', path: 'documents/d/attachments/b/inv.zip', name: 'x.zip' }] },
  supplements: [{ path: 'documents/d/attachments/supplemental/cert.pdf', label: 'Certificate' }],
};

test('pre-audit: the files read, in order (current PDF, checklist attachments, supplements); ZIPs left out', () => {
  const f = precheckFiles(dv);
  assert.equal(f[0].path, 'documents/d/1-signed.pdf'); assert.equal(f[0].main, true);
  assert.equal(f[1].docId, 'obr1'); assert.match(f[1].label, /Approved OBR/);
  assert.equal(f[2].path, 'documents/d/attachments/b/inv.pdf');
  assert.equal(f.length, 4); assert.match(f[3].label, /Supplemental: Certificate/);
});

test('pre-audit: the checklist and details sent, and what counts as a change', () => {
  assert.deepEqual(checklistRows(dv).map((r) => r.ticked), ['Y (attached)', 'Y (attached)', 'N/A']);
  const brief = precheckBrief(dv, [{ label: 'The DV itself' }], [{ label: 'Big file', why: 'too many pages' }]);
  assert.match(brief, /Payee: ACME TRADING/); assert.match(brief, /Office supplies: 15250.5/); assert.match(brief, /Tax withheld: -250/);
  assert.match(brief, /Approved OBR \(required\): Y \(attached\); linked: DMS-2026-000019/);
  assert.match(brief, /Not given .*Big file \(too many pages\)/);
  const b = precheckBasis(dv);
  assert.equal(precheckBasis({ ...dv }), b);
  assert.notEqual(precheckBasis({ ...dv, checklist: { a: 'Y' } }), b);
  assert.notEqual(precheckBasis({ ...dv, pdf: { files: [...dv.pdf.files, { path: 'x' }] } }), b);
});

test('pre-audit: reading the answer', () => {
  const r = parsePrecheck('Here it is:\n{"summary":"Two problems.","verdict":"issues","findings":[{"severity":"low","area":"Details","finding":"Address missing"},{"severity":"high","area":"Amounts","finding":"Words do not match figures","where":"DV p.1","evidence":"Fifteen thousand"},{"severity":"weird","finding":"x"},{"finding":""}]}');
  assert.equal(r.verdict, 'issues');
  assert.deepEqual(r.findings.map((f) => f.severity), ['high', 'medium', 'low']);
  assert.equal(r.findings[0].where, 'DV p.1');
  assert.deepEqual(parsePrecheck('{"summary":"Fine","findings":[]}').verdict, 'no_issues');
  assert.throws(() => parsePrecheck('no json here'), /no readable answer/);
});

test('only the Accounting Office runs the pre-audit check', async () => {
  const { canRunPrecheck } = await import('./precheck.js');
  assert.equal(canRunPrecheck({ office: 'Municipal Accounting Office', role: 'user' }), true);
  assert.equal(canRunPrecheck({ office: 'Municipal Accounting Office', role: 'user', head: true }), true);
  assert.equal(canRunPrecheck({ office: 'Municipal Engineering Office', role: 'user' }), false);
  assert.equal(canRunPrecheck({ office: '', role: 'superadmin' }), false);
  assert.equal(canRunPrecheck({ office: 'Municipal Accounting Office', role: 'payee' }), false);
  assert.equal(canRunPrecheck({ office: 'Municipal Accounting Office', active: false }), false);
});

test('the pre-audit check: DVs and Liquidation Reports only, each with its own instructions', async () => {
  const { PRECHECK_TYPES, precheckSystem, precheckBrief, precheckFiles } = await import('./precheck.js');
  assert.deepEqual(PRECHECK_TYPES, ['DV', 'LR']);
  assert.match(precheckSystem('DV'), /Disbursement Vouchers/);
  assert.match(precheckSystem('LR'), /Liquidation Reports \(LR\) of cash advances/);
  const lr = { typeCode: 'LR', controlNo: 'DMS-9', data: { cashAdvance: 15000, dvNo: '2026-11-0012', items: [{ particulars: 'Hotel', amount: 5000 }], totalSpent: 5000, refund: 10000, refundOrNo: '123' }, pdf: { files: [{ path: 'p.pdf' }] } };
  const brief = precheckBrief(lr, [{ label: 'The Liquidation Report itself (DMS-9)' }]);
  assert.match(brief, /Cash advance: 15000, DV No\. 2026-11-0012/);
  assert.match(brief, /Hotel: 5000/);
  assert.match(brief, /OR No\. 123/);
  assert.equal(precheckFiles(lr)[0].label, 'The Liquidation Report itself (DMS-9)');
});

test('the pre-audit check is not run by the document\'s own preparer, even in Accounting', async () => {
  const { canRunPrecheckOn } = await import('./precheck.js');
  const acct = { office: 'Municipal Accounting Office', role: 'user' };
  assert.equal(canRunPrecheckOn(acct, 'u1', { createdBy: 'u2' }), true);
  assert.equal(canRunPrecheckOn(acct, 'u1', { createdBy: 'u1' }), false);
  assert.equal(canRunPrecheckOn({ office: 'Municipal Engineering Office', role: 'user' }, 'u1', { createdBy: 'u2' }), false);
});
