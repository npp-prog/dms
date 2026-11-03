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
