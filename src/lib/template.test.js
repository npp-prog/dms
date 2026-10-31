import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, generateDefaultTemplate } from './template.js';
import { amountToWords } from './numberToWords.js';
import { readFileSync } from 'node:fs';
import { buildSteps, capsFor, computeFields, computeRow, evaluate, missingChecklist, missingFields, slugKey } from './forms.js';
import {
  acceptsDocument, carryOver, itemTypeCode, systemFor, checklistProgress, effectiveChecklist, groupItems, headerValue, missingRequired, searchChecklists,
} from './checklists.js';
import { DEFAULT_SETTINGS, STARTER_TYPES } from './defaults.js';
import { fitPage, pageSize } from './paper.js';
import { isOwnerEmail } from './owner.js';
import { cleanPart, controlRef, counterFor, fileBase, formatControlNo, fundCode, refNumber, uniqueNamer } from './naming.js';
import { applyAction, assignPending, availableActions, buildWorkflow, canAct, chooseOffices, isPreparer, fillsMissing, referDocument, refStampMissing, resolveOffice, routeFromGuide, routeSteps, signatureMissing, whereIs } from './workflow.js';

const LIBRARY = JSON.parse(readFileSync(new URL('../data/checklists.json', import.meta.url)));

test('renders fields with filters and escapes HTML', () => {
  const out = renderTemplate('<p>{{payee|upper}} {{amount|peso}} {{date|date}} {{x}}</p>', {
    data: { payee: 'Acme <Corp>', amount: '1234.5', date: '2026-01-05', x: '<script>' },
  });
  assert.equal(out, '<p>ACME &lt;CORP&gt; ₱ 1,234.50 January 5, 2026 &lt;script&gt;</p>');
});

test('table, sum, each, check and context values', () => {
  const fields = [{ key: 'items', type: 'table', minRows: 3, columns: [
    { key: 'description', label: 'Desc', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'currency', total: true },
  ] }];
  const data = { amount: 'TOP', items: [{ description: 'Pens', amount: 100 }, { description: 'Paper', amount: '250.25' }] };
  const ctx = { data, fields, checklist: { a: true }, controlNo: 'DV-1', lgu: { name: 'LGU X' } };
  assert.equal(renderTemplate('{{sum:items.amount}}', ctx), '350.25');
  assert.equal(renderTemplate('{{controlNo}} {{lgu.name}} {{check:a}}{{check:b}}', ctx), 'DV-1 LGU X &#9745;&#9744;');
  const each = renderTemplate('{{#each items}}[{{@no}}:{{description}}:{{amount}}]{{/each}}', ctx);
  assert.equal(each, '[1:Pens:100][2:Paper:250.25][::]');
  const table = renderTemplate('{{table:items}}', ctx);
  assert.match(table, /<td class="r">250.25<\/td>/);
  assert.match(table, /NOTHING FOLLOWS/);
  assert.match(table, /<b>350.25<\/b>/);
});

test('negative amounts print in parentheses', () => {
  assert.equal(renderTemplate('{{a|currency}} {{b|currency}}', { data: { a: '-100', b: 2500.5 } }), '(100.00) 2,500.50');
});

test('conditional blocks', () => {
  const ctx = { data: { mode: 'ADA', empty: '' } };
  assert.equal(renderTemplate('[{{#if mode=ADA}}x{{/if}}][{{#if mode=MDS Check}}x{{/if}}]', ctx), '[x][]');
  assert.equal(renderTemplate('{{#if mode}}has{{/if}}{{#if empty}}no{{/if}}', ctx), 'has');
});

test('amount in words', () => {
  assert.equal(amountToWords(1234.5), 'One Thousand Two Hundred Thirty-Four Pesos and 50/100 Only');
  assert.equal(amountToWords(1), 'One Peso and 00/100 Only');
  assert.equal(amountToWords(2000000.07), 'Two Million Pesos and 07/100 Only');
});

test('form helpers', () => {
  const cols = [{ key: 'qty' }, { key: 'unitCost' }, { key: 'total', compute: 'qty*unitCost' }];
  assert.equal(computeRow(cols, { qty: '3', unitCost: '10.10' }).total, 30.3);
  assert.equal(computeRow(cols, { qty: '', unitCost: '' }).total, '');
  const fields = [{ key: 'a', required: true }, { key: 't', type: 'table', required: true }, { key: 'b' }];
  assert.deepEqual(missingFields(fields, { a: ' ', t: [{ x: '' }] }).map((f) => f.key), ['a', 't']);
  assert.deepEqual(missingFields(fields, { a: 'x', t: [{ x: '1' }] }), []);
  assert.deepEqual(missingChecklist([{ id: 'c', required: true }, { id: 'd' }], {}).map((c) => c.id), ['c']);
  assert.equal(slugKey('ObR / ORS No.'), 'obrOrsNo');
});

test('starter types are consistent and render', () => {
  for (const type of STARTER_TYPES) {
    const keys = type.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `${type.code} has duplicate keys`);
    const stepIds = new Set(type.steps.map((s) => s.id));
    for (const f of type.fields) assert.ok(Boolean(f.filledBy) || stepIds.has(f.step), `${type.code}.${f.key} has unknown step`);
    assert.equal(buildSteps(type).length, type.steps.length);
    const columns = type.fields.flatMap((f) => (f.columns || []).map((c) => c.key));
    const known = new Set([...keys, ...columns, 'controlNo', 'lgu', 'sig', 'today', 'preparedBy', 'docType', 'office']);
    const refs = [...type.template.matchAll(/\{\{\s*(?:#if\s+|table:|sum:)?([\w]+)/g)].map((m) => m[1]);
    for (const r of refs) assert.ok(known.has(r), `${type.code} template references unknown "${r}"`);
    for (const f of type.fields) {
      for (const c of f.columns || []) if (c.compute) assert.ok(evaluate(c.compute, {}) === '', `${type.code}.${c.key} formula`);
    }
    const html = renderTemplate(type.template, { fields: type.fields, signatories: { mayor: 'JUAN DELA CRUZ' } });
    assert.ok(html.length > 500);
    assert.doesNotMatch(html, /\{\{/, `${type.code} left a tag unrendered`);
    assert.ok(['own', 'disbursement', 'liquidation'].includes(type.checklistSource));
    // Only the DV and the Liquidation Report have a checklist.
    const hasChecklist = type.checklistSource !== 'own' || type.checklist.length > 0;
    assert.equal(hasChecklist, ['DV', 'LR'].includes(type.code), `${type.code} checklist`);
    assert.ok(type.processing.length >= 3, `${type.code} needs a processing guide`);
    for (const p of type.processing) assert.ok(p.id && p.office && p.action, `${type.code} processing step incomplete`);
    assert.equal(type.copies, undefined, `${type.code} should not list printed copies (documents are digital)`);
    assert.doesNotMatch(html, /Appendix/i, `${type.code} still prints an appendix number`);
    assert.equal(type.paperSize, 'A4', `${type.code} paper size`);
    assert.equal(type.orientation, 'portrait', `${type.code} orientation`);
  }
});

test('formulas and computed fields', () => {
  assert.equal(evaluate('qty*unitCost', { qty: '3', unitCost: '10.10' }), 30.3);
  assert.equal(evaluate('gross-deductions', { gross: 1000, deductions: '250.5' }), 749.5);
  assert.equal(evaluate('labor+spareParts+materials', { labor: 100, materials: 5 }), 105);
  assert.equal(evaluate('sum:items.amount-cashAdvance', { items: [{ amount: 300 }, { amount: 200 }], cashAdvance: 450 }), 50);
  assert.equal(evaluate('a+b', {}), '');
  const fields = [{ key: 'spent', compute: 'sum:items.amount' }, { key: 'back', compute: 'spent-advance' }];
  const out = computeFields(fields, { items: [{ amount: '120' }], advance: '100' });
  assert.equal(out.spent, 120);
  assert.equal(out.back, 20);
});

test('checklist helpers', () => {
  const items = [{ id: 'i1', required: true, label: 'DV' }, { id: 'i2', required: false, label: 'BAC', group: 'Award' }, { id: 'i3', required: true, label: 'NOA', group: 'Award' }];
  assert.deepEqual(missingRequired(items, { i1: 'Y', i2: 'NA' }).map((i) => i.id), ['i3']);
  assert.deepEqual(missingRequired(items, { i1: true, i3: 'Y' }), []);
  assert.deepEqual(groupItems(items).map((g) => [g.group, g.items.length]), [['', 1], ['Award', 2]]);
  assert.deepEqual(checklistProgress(items, { i1: 'Y', i2: 'NA' }), { answered: 2, total: 3 });
  assert.equal(headerValue('DV Number', { dvNo: '101' }), '101');
  assert.equal(headerValue('OBR/FURS Number', { obrNo: '100-26-10-001' }), '100-26-10-001');
  assert.equal(headerValue('Payee', { claimant: 'Ana' }), 'Ana');
  assert.equal(headerValue('Liquidation Report No.', { serialNo: 'LR-9' }), 'LR-9');
  const lib = [{ code: '1613', kind: 'disbursement', title: 'Payment to Supplier - Direct Acquisition', category: 'x' }, { code: '2002', kind: 'liquidation', title: 'Local Travel', category: 'y' }];
  assert.deepEqual(searchChecklists(lib, 'direct acq', 'disbursement').map((c) => c.code), ['1613']);
  assert.deepEqual(searchChecklists(lib, '2002').map((c) => c.code), ['2002']);
  const own = effectiveChecklist({ checklistSource: 'own', code: 'PR', name: 'Purchase Request', checklist: [{ id: 'c1', label: 'PPMP', required: true }] });
  assert.equal(own.items[0].id, 'c1');
  assert.equal(effectiveChecklist({ checklistSource: 'disbursement' }, null), null);
});

test('checklist library data is complete', () => {
  assert.equal(LIBRARY.length, 210);
  assert.equal(new Set(LIBRARY.map((c) => c.code)).size, LIBRARY.length);
  assert.equal(LIBRARY.filter((c) => c.kind === 'liquidation').length, 9);
  for (const c of LIBRARY) {
    assert.ok(c.title && c.items.length > 0, `${c.code} empty`);
    assert.equal(new Set(c.items.map((i) => i.id)).size, c.items.length, `${c.code} duplicate item ids`);
    for (const i of c.items) {
      assert.equal(typeof i.required, 'boolean');
      // Document Type: the generic name; Document Details: the instruction that specifies it.
      assert.ok(i.label && i.label.length <= 60, `${c.code} ${i.id}: document type missing or too long`);
      assert.equal(typeof i.details, 'string', `${c.code} ${i.id}: no document details field`);
    }
    assert.ok(!c.items.some((i) => /\(deleted\b/i.test(`${i.label} ${i.details}`)), `${c.code} has a deleted item`);
  }
  const c1613 = LIBRARY.find((c) => c.code === '1613');
  assert.equal(c1613.items.length, 15);
  assert.equal(c1613.items.filter((i) => i.required).length, 8);
});

test('checklist items accept only documents of their kind', () => {
  const c1001 = LIBRARY.find((c) => c.code === '1001');
  const obr = c1001.items.find((i) => i.label === 'Obligation Request');
  const doc = (typeCode, typeName) => ({ typeCode, typeName });
  assert.ok(acceptsDocument(obr, doc('OBR', 'Obligation Request')));
  assert.ok(acceptsDocument(obr, doc('FURS', 'Fund Utilization Request and Status')), 'OBR item also takes a FURS');
  assert.ok(!acceptsDocument(obr, doc('DV', 'Disbursement Voucher')));
  const c1613 = LIBRARY.find((c) => c.code === '1613');
  const pr = c1613.items.find((i) => i.label === 'Purchase Request');
  assert.ok(acceptsDocument(pr, doc('PR', 'Purchase Request')) && !acceptsDocument(pr, doc('PO', 'Purchase Order')));
  const bac = c1613.items.find((i) => i.label === 'BAC Resolution');
  assert.ok(!['OBR', 'FURS', 'DV', 'PR', 'PO', 'JO', 'PCV', 'LR', 'IT', 'PAYROLL'].some((t) => acceptsDocument(bac, doc(t, t))));
  // Property and supply documents come from PIM.
  const air = c1613.items.find((i) => i.label === 'Acceptance and Inspection Report');
  assert.equal(systemFor(air), 'PIM');
  assert.equal(itemTypeCode(air), 'AIR');
  assert.equal(systemFor(pr), '');
});

test('changing the checklist keeps answers and links of shared requirements', () => {
  const a = LIBRARY.find((c) => c.code === '1613');
  const b = LIBRARY.find((c) => c.code === '1001');
  const dvA = a.items.find((i) => i.label === 'Disbursement Voucher');
  const obrA = a.items.find((i) => i.label === 'Obligation Request');
  const prA = a.items.find((i) => i.label === 'Purchase Request');
  const kept = carryOver(a.items, b.items, { [dvA.id]: 'Y', [obrA.id]: 'Y', [prA.id]: 'Y' }, { [obrA.id]: [{ kind: 'fts', id: 'x' }] });
  const obrB = b.items.find((i) => i.label === 'Obligation Request');
  assert.equal(kept.state[obrB.id], 'Y');
  assert.deepEqual(kept.links[obrB.id], [{ kind: 'fts', id: 'x' }]);
  assert.equal(Object.keys(kept.state).length, 2, 'only DV and OBR are on both checklists');
});

test('document workflow', () => {
  const offices = DEFAULT_SETTINGS.offices;
  assert.equal(resolveOffice('Requesting Office', offices), '');
  assert.equal(resolveOffice('Municipal Accounting Office', offices), 'Municipal Accounting Office');
  assert.equal(resolveOffice('Treasury / Disbursing Officer', offices), "Municipal Treasurer's Office");
  assert.equal(resolveOffice('Office of the Municipal Mayor', offices), 'Office of the Municipal Mayor');
  assert.equal(resolveOffice('Inspection / GSO', offices), 'General Services Office');
  const dv = STARTER_TYPES.find((t) => t.code === 'DV');
  const user = { uid: 'u1', displayName: 'Juan', office: 'Municipal Engineering Office' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office' };
  doc = { ...doc, ...buildWorkflow(dv, doc, offices, user, 't0') };
  assert.equal(doc.currentOffice, 'Municipal Engineering Office');
  // Only the offices it has reached see it: none ahead on the route yet.
  assert.deepEqual(doc.routeOffices, ['Municipal Engineering Office']);
  assert.deepEqual(availableActions(doc), ['release']);
  // The PDF is what travels: no release before the document is converted.
  assert.throws(() => applyAction(doc, 'release', user), /Convert the document to PDF/);
  doc.pdf = { files: [{ kind: 'generated', stage: 0, at: 't0' }] };
  doc = { ...doc, ...applyAction(doc, 'release', user, '', 't1') };
  assert.equal(doc.currentOffice, 'Municipal Accounting Office');
  assert.equal(whereIs(doc), 'Municipal Accounting Office');
  assert.ok(doc.routeOffices.includes('Municipal Accounting Office') && !doc.routeOffices.includes('Office of the Municipal Mayor'));
  const acct = { uid: 'a1', displayName: 'Ana', office: 'Municipal Accounting Office' };
  assert.ok(canAct(doc, acct) && !canAct(doc, user));
  assert.deepEqual(availableActions(doc), ['release', 'return']); // no receiving: it is there
  assert.throws(() => applyAction(doc, 'return', acct, ''), /why/);
  doc = { ...doc, ...applyAction(doc, 'return', acct, 'OBR not attached', 't2') };
  assert.equal(doc.currentOffice, 'Municipal Engineering Office');
  assert.equal(doc.workflow.events.at(-1).remarks, 'OBR not attached');
  assert.ok(doc.routeOffices.includes('Municipal Accounting Office'), 'returned: Accounting, which had it, still sees it');
  // to the end; the payment step needs the check details and the DV signed in Box E
  while (doc.workflow.state === 'in-progress') {
    const a = availableActions(doc)[0];
    if (assignPending(doc)) { // the DV No., assigned when Accounting opens it
      assert.throws(() => applyAction(doc, a, { uid: 'x', displayName: 'X' }), /not assigned yet/);
      doc.data = { ...doc.data, dvNo: '0001', dvDate: '2026-10-30' };
    }
    if (fillsMissing(doc).length) {
      assert.deepEqual(fillsMissing(doc), ['checkNo', 'checkDate', 'bankName']);
      assert.throws(() => applyAction(doc, a, { uid: 'x', displayName: 'X' }), /Fill in/);
      doc.data = { ...doc.data, checkNo: '0012345', checkDate: '2026-10-29', bankName: 'LBP' };
      assert.throws(() => applyAction(doc, a, { uid: 'x', displayName: 'X' }), /Upload DV signed by the payee in Box E/);
      doc.stepFiles = [{ stage: doc.workflow.stage, name: 'box-e.pdf' }];
    }
    doc = { ...doc, ...applyAction(doc, a, { uid: 'x', displayName: 'X' }) };
  }
  assert.ok(doc.data?.checkNo, 'the payment step was reached');
  assert.equal(doc.workflow.state, 'done');
  assert.equal(doc.currentOffice, '');
  assert.equal(whereIs(doc), 'Processed');
});

test('admin route and signature-required steps', () => {
  const offices = DEFAULT_SETTINGS.offices;
  const dv = STARTER_TYPES.find((t) => t.code === 'DV');
  // Without a route: the processing guide, resolved to Settings offices.
  assert.equal(routeFromGuide(dv, offices)[1].office, 'Municipal Accounting Office');
  assert.equal(routeSteps(dv, offices).length, dv.processing.length);
  // With an admin route: exactly that route.
  const type = { ...dv, route: [
    { office: '', action: 'Box A', sign: true },
    { office: 'Municipal Budget Office', action: 'Check', sign: false },
    { office: 'Municipal Accounting Office', action: 'Box B', sign: true },
  ] };
  assert.deepEqual(routeSteps(type, offices).map((s) => [s.routedTo, s.sign]),
    [['', true], ['Municipal Budget Office', false], ['Municipal Accounting Office', true]]);
  const user = { uid: 'u1', displayName: 'Juan' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office' };
  doc = { ...doc, ...buildWorkflow(type, doc, offices, user, '2026-10-01T00:00:00Z') };
  assert.equal(doc.currentOffice, 'Municipal Engineering Office');
  assert.equal(signatureMissing(doc), true);
  doc.pdf = { files: [{ kind: 'generated', stage: 0, at: '2026-10-01T00:30:00Z' }] };
  assert.throws(() => applyAction(doc, 'release', user), /requires a signature/);
  // Another step's signature does not count; this step's does.
  doc.pdf.files.push({ kind: 'signed', stage: 2, at: '2026-10-01T00:40:00Z' });
  assert.equal(signatureMissing(doc), true);
  doc.pdf.files.push({ kind: 'signed', stage: 0, at: '2026-10-01T01:00:00Z' });
  assert.equal(signatureMissing(doc), false);
  doc = { ...doc, ...applyAction(doc, 'release', user, '', '2026-10-01T02:00:00Z') };
  assert.equal(doc.currentOffice, 'Municipal Budget Office');
  assert.equal(signatureMissing(doc), false); // this step needs no signature
  // Returned for a correction: back at the first step, already signed, so it can go again at once.
  const budget = { uid: 'b1', displayName: 'Ben' };
  doc = { ...doc, ...applyAction(doc, 'return', budget, 'Attach OBR', '2026-10-01T03:10:00Z') };
  assert.equal(doc.workflow.stage, 0);
  assert.equal(signatureMissing(doc), false);
  // Converted to PDF again (the document was corrected): the new PDF needs the signature again.
  doc.pdf.files.push({ kind: 'generated', stage: 0, at: '2026-10-01T03:20:00Z' });
  assert.equal(signatureMissing(doc), true);
  // Signed before steps were recorded: counts for the first step.
  doc.pdf.files.push({ kind: 'signed', stage: null, at: '2026-10-01T03:30:00Z' });
  assert.equal(signatureMissing(doc), false);
});

test('bulk download file names', () => {
  assert.equal(fileBase({ fund: 'General Fund', subject: 'Neil Priolo', number: 2, type: 'OBR', ref: controlRef('DMS-2026-000001') }), 'GF_NEIL PRIOLO_02_OBR_DMS2026000001');
  assert.equal(formatControlNo(2026, 7), 'DMS-2026-000007');
  assert.equal(counterFor(2026), 'FTS'); // continues the earlier series
  assert.equal(counterFor(2027), 'DMS-2027');
  assert.equal(fundCode('Special Education Fund'), 'SEF');
  assert.equal(fundCode('20% Development Fund'), '20DF');
  assert.equal(fundCode(''), 'NOFUND');
  assert.equal(cleanPart('A/B: "C"_D?'), 'A B C D');
  const name = uniqueNamer();
  assert.equal(name('X', 'pdf'), 'X.pdf');
  assert.equal(name('X', 'pdf'), 'X (2).pdf');
});

test('paper sizes and fit to page', () => {
  assert.deepEqual(pageSize('Folio'), { key: 'Folio', w: 215.9, h: 330.2, css: '215.9mm 330.2mm' });
  assert.equal(pageSize('Long').key, 'Folio');
  assert.equal(pageSize('A4', 'landscape').css, '297mm 210mm');
  assert.equal(pageSize('Unknown').key, 'A4');
  // Content that already fits is not enlarged.
  assert.deepEqual(fitPage(() => ({ w: 190, h: 100 }), 190, 277), { scale: 1, width: 190 });
  // Twice as tall as the page; laying it out wider makes it a bit shorter.
  const tall = (w) => ({ w, h: 554 * (190 / w) ** 0.3 });
  const t = fitPage(tall, 190, 277);
  assert.ok(t.scale < 1 && t.scale > 0.45);
  assert.ok(tall(t.width).h * t.scale <= 277);
  assert.ok(Math.abs(t.width * t.scale - 190) < 3, 'still fills the width');
  // Too wide (a table needing 260 mm) but short: scaled to fit the width.
  const wide = (w) => ({ w: Math.max(w, 260), h: 120 });
  const d = fitPage(wide, 190, 277);
  assert.ok(Math.abs(d.scale - (190 / 260) * 0.985) < 0.01);
  assert.ok(d.width >= 260 && d.width * d.scale <= 190.5);
  // Never below the minimum scale.
  const long = fitPage((w) => ({ w, h: 400 * (190 / w) }), 190, 277, 0.8);
  assert.equal(long.scale, 0.8);
  // Kept at the minimum scale, it must still fit the page width (no running off the right edge).
  assert.ok(Math.abs(long.width * long.scale - 190) < 0.01, `laid out ${long.width} mm at ${long.scale}`);
});

test('superadmin email', () => {
  assert.equal(isOwnerEmail('npp@mgocandoniaccounting.org'), true);
  assert.equal(isOwnerEmail(' NPP@MgoCandoniAccounting.org '), true);
  assert.equal(isOwnerEmail('npp@gmail.com'), false);
  assert.equal(isOwnerEmail(''), false);
  // firestore.rules must name the same email
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /\['npp@mgocandoniaccounting\.org'\]/);
});

test('reference numbers from a pattern', () => {
  const oct = new Date(2026, 9, 29);
  const dv = refNumber('{FUND}-{YYYY}-{MM}-{####}', { fund: 'General Fund', date: oct });
  assert.equal(dv.format(45), 'GF-2026-10-0045');
  assert.equal(dv.counterId, 'REF_GF_2026_10_N');
  // another month or fund: another series
  assert.notEqual(refNumber('{FUND}-{YYYY}-{MM}-{####}', { fund: 'General Fund', date: new Date(2026, 10, 2) }).counterId, dv.counterId);
  assert.notEqual(refNumber('{FUND}-{YYYY}-{MM}-{####}', { fund: 'Special Education Fund', date: oct }).counterId, dv.counterId);
  assert.equal(refNumber('101-{YY}-{MM}-{###}', { date: oct }).format(7), '101-26-10-007');
  assert.equal(refNumber('TO-{YYYY}', { date: oct }).format(3), 'TO-2026-0003'); // no series token: one is added
});

test('alternate offices on a step: the preparer chooses before releasing', () => {
  const offices = DEFAULT_SETTINGS.offices;
  const type = { route: [
    { office: '', action: 'Box A', sign: true },
    { office: 'Municipal Accounting Office', action: 'Box B' },
    { office: 'Office of the Municipal Mayor', action: 'Box D', sign: true, alternates: ['Office of the Municipal Vice Mayor'] },
  ] };
  assert.deepEqual(routeSteps(type, offices)[2].alternates, ['Office of the Municipal Vice Mayor']);
  const user = { uid: 'u1', displayName: 'Juan' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office', pdf: { files: [{ kind: 'generated' }, { kind: 'signed', stage: 0 }] } };
  doc = { ...doc, ...buildWorkflow(type, doc, offices, user, 't0') };
  assert.equal(doc.workflow.choose, true);
  assert.ok(!doc.routeOffices.includes('Office of the Municipal Mayor'), 'not reached yet');
  assert.throws(() => applyAction(doc, 'release', user), /Choose the office/);
  assert.throws(() => chooseOffices(doc, { 2: 'Municipal Budget Office' }, user), /choose one of its offices/);
  const { changed, ...patch } = chooseOffices(doc, { 2: 'Office of the Municipal Vice Mayor' }, user, 't1');
  doc = { ...doc, ...patch };
  assert.equal(doc.workflow.choose, false);
  assert.equal(doc.workflow.steps[2].routedTo, 'Office of the Municipal Vice Mayor');
  assert.equal(doc.workflow.events.at(-1).remarks, 'Step 3: Office of the Municipal Vice Mayor');
  doc = { ...doc, ...applyAction(doc, 'release', user, '', 't2') };
  assert.throws(() => chooseOffices(doc, { 2: 'Office of the Municipal Mayor' }, user), /before the document is first routed/);
  const acct = { uid: 'a1', displayName: 'Rosa', office: 'Municipal Accounting Office' };
  doc = { ...doc, ...applyAction(doc, 'release', acct, '', 't4') };
  assert.equal(doc.currentOffice, 'Office of the Municipal Vice Mayor');
  assert.ok(doc.routeOffices.includes('Office of the Municipal Vice Mayor') && !doc.routeOffices.includes('Office of the Municipal Mayor'));
  // Without alternates: nothing to choose.
  assert.equal(buildWorkflow({ route: type.route.slice(0, 2) }, doc, offices, user).workflow.choose, undefined);
});

test('referring a document to a person outside the route', () => {
  const offices = DEFAULT_SETTINGS.offices;
  const type = { route: [{ office: '', action: 'Prepare' }, { office: 'Municipal Accounting Office', action: 'Pre-audit', sign: true }, { office: 'Office of the Municipal Mayor', action: 'Approve' }] };
  const juan = { uid: 'u1', displayName: 'Juan' };
  const ana = { uid: 'a1', displayName: 'Ana', office: 'Municipal Accounting Office' };
  const legal = { uid: 'l1', displayName: 'Atty. Cruz', office: 'Legal Office', email: 'legal@x' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office', pdf: { files: [{ kind: 'generated' }] } };
  doc = { ...doc, ...buildWorkflow(type, doc, offices, juan, 't0') };
  doc = { ...doc, ...applyAction(doc, 'release', juan, '', 't1') };
  doc = { ...doc, ...referDocument(doc, legal, 'Please review', ana, 't3') };
  assert.equal(doc.currentOffice, 'person:l1');
  assert.equal(doc.atPreparer, false);
  assert.ok(canAct(doc, legal) && !canAct(doc, ana));
  assert.deepEqual(availableActions(doc), ['back']);
  assert.equal(whereIs(doc), 'Atty. Cruz (referred)');
  // A signature by the person referred to is not the step's own.
  doc.pdf.files.push({ kind: 'signed', stage: 1, referral: true });
  doc = { ...doc, ...applyAction(doc, 'back', legal, 'Reviewed', 't5') };
  assert.equal(doc.workflow.referral, undefined);
  assert.equal(doc.currentOffice, 'Municipal Accounting Office');
  assert.equal(doc.workflow.stage, 1);
  assert.ok(doc.workflow.received);
  assert.equal(signatureMissing(doc), true);
  assert.deepEqual(doc.workflow.events.slice(-3).map((e) => e.type), ['released', 'referred', 'referral back']);
});

test('returned for revision: a new PDF supersedes the signed one and every step signs again', () => {
  const offices = DEFAULT_SETTINGS.offices;
  const type = { route: [{ office: '', action: 'Box A', sign: true }, { office: 'Municipal Accounting Office', action: 'Box B', sign: true }] };
  const juan = { uid: 'u1', displayName: 'Juan' };
  const rosa = { uid: 'a1', displayName: 'Rosa', office: 'Municipal Accounting Office' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office', pdf: { files: [{ kind: 'generated' }, { kind: 'signed', stage: 0 }] } };
  doc = { ...doc, ...buildWorkflow(type, doc, offices, juan, 't0') };
  doc = { ...doc, ...applyAction(doc, 'release', juan, '', 't1') };
  doc.pdf.files.push({ kind: 'signed', stage: 1 });
  doc = { ...doc, ...applyAction(doc, 'return', rosa, 'Wrong amount', 't3') };
  assert.equal(doc.workflow.stage, 0);
  assert.equal(signatureMissing(doc), false); // still signed: could go again unchanged
  doc.pdf.files.push({ kind: 'generated' }); // the preparer edits it and makes a new PDF
  assert.equal(signatureMissing(doc), true);
  assert.throws(() => applyAction(doc, 'release', juan), /requires a signature/);
  doc.pdf.files.push({ kind: 'signed', stage: 0 });
  doc = { ...doc, ...applyAction(doc, 'release', juan, '', 't4') };
  assert.equal(signatureMissing(doc), true, 'Accounting signs the new PDF again');
});

test('positions: only the named positions in the office act on a step (the office head always may)', () => {
  const offices = DEFAULT_SETTINGS.offices;
  const type = { route: [{ office: '', action: 'Box A', positions: ['Reviewer'] }, { office: 'Municipal Accounting Office', action: 'Pre-audit', positions: ['Reviewer'] }] };
  const steps = routeSteps(type, offices);
  assert.equal(steps[0].positions, undefined, 'not on the preparer\'s own step');
  assert.deepEqual(steps[1].positions, ['Reviewer']);
  const juan = { uid: 'u1', displayName: 'Juan' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office', pdf: { files: [{ kind: 'generated' }] } };
  doc = { ...doc, ...buildWorkflow(type, doc, offices, juan, 't0') };
  doc = { ...doc, ...applyAction(doc, 'release', juan, '', 't1') };
  const office = 'Municipal Accounting Office';
  assert.equal(canAct(doc, { uid: 'e1', office, positions: ['Encoder'] }), false);
  assert.equal(canAct(doc, { uid: 'e2', office }), false);
  assert.equal(canAct(doc, { uid: 'r1', office, positions: ['Encoder', 'Reviewer'] }), true);
  assert.equal(canAct(doc, { uid: 'h1', office, isHead: true }), true);
  assert.equal(canAct(doc, { uid: 'x', office: 'Municipal Budget Office', positions: ['Reviewer'] }), false);
});

test('a step that assigns a reference no. puts it on the PDF before releasing', () => {
  const offices = DEFAULT_SETTINGS.offices;
  const type = { route: [{ office: '', action: 'Box A' }, { office: 'Municipal Accounting Office', action: 'Pre-audit', assign: { field: 'dvNo', dateField: 'dvDate', pattern: '{####}' } }, { office: 'Municipal Treasurer\'s Office', action: 'Box C' }] };
  const juan = { uid: 'u1', displayName: 'Juan' };
  const rosa = { uid: 'a1', displayName: 'Rosa', office: 'Municipal Accounting Office' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office', pdf: { files: [{ kind: 'generated', at: '2026-10-30T01:00:00Z' }] } };
  doc = { ...doc, ...buildWorkflow(type, doc, offices, juan, 't0') };
  doc = { ...doc, ...applyAction(doc, 'release', juan, '', 't1') };
  assert.equal(refStampMissing(doc), null, 'nothing assigned yet');
  assert.equal(assignPending(doc), true, 'Accounting gets the number on opening it');
  assert.throws(() => applyAction(doc, 'release', rosa), /not assigned yet/);
  doc.data = { dvNo: '0001', dvDate: '2026-10-30' };
  doc.refNos = { dvNo: { value: '0001', label: 'Disbursement No.', stage: 1, at: '2026-10-30T02:00:00Z' }, dvDate: { value: '2026-10-30', label: 'Date', of: 'dvNo', stage: 1 } };
  assert.deepEqual(refStampMissing(doc), { field: 'dvNo', label: 'Disbursement No.', value: '0001', date: '2026-10-30' });
  assert.throws(() => applyAction(doc, 'release', rosa), /Put the Disbursement No\. on the PDF/);
  doc.pdf.files.push({ kind: 'stamped', refStage: 1, at: '2026-10-30T02:10:00Z' });
  assert.equal(refStampMissing(doc), null);
  doc = { ...doc, ...applyAction(doc, 'release', rosa, '', 't3') };
  assert.equal(refStampMissing(doc), null, 'the next step assigns nothing');
});

test('Travel Order: date parts and entries printed as typed', () => {
  const to = STARTER_TYPES.find((t) => t.code === 'TO');
  const data = capsFor(to.fields, {
    toNo: '2023-0825', travelDates: 'August 29-31, 2023', givenDate: '2023-08-28',
    travelers: [{ name: 'karl king r. esmeralda', position: 'Tourism Operations Officer II' }],
    purposes: [{ purpose: 'To attend the training.' }],
  });
  const html = renderTemplate(to.template, { data, caps: true, fields: to.fields, lgu: { province: 'Negros Occidental' }, signatories: { mayor: 'Engr. Ray R. Ruiz' } });
  assert.match(html, /TRAVEL ORDER NO\.: 2023-0825/);
  assert.match(html, /Series of 2023/);
  assert.match(html, /<b>KARL KING R\. ESMERALDA<\/b>.*Tourism Operations Officer II/);
  assert.match(html, /on August 29-31, 2023/);
  assert.match(html, /1\.<\/td><td>To attend the training\./);
  assert.match(html, /this 28<sup>th<\/sup> day of August 2023 at Candoni, Negros Occidental\./);
  assert.match(html, /ENGR\. RAY R\. RUIZ/);
});

test('the Vice Mayor can approve in place of the Mayor', () => {
  const to = STARTER_TYPES.find((t) => t.code === 'TO');
  const field = to.fields.find((f) => f.key === 'approver');
  assert.deepEqual(field.options, ['Municipal Mayor', 'Municipal Vice Mayor']);
  assert.equal(field.step, 's3');
  // every starter format that prints the Mayor has the choice; the DV keeps its own field
  for (const t of STARTER_TYPES) if (t.template.includes('sig.mayor')) assert.ok(t.fields.some((f) => f.key === 'approver'), t.code);
  assert.equal(STARTER_TYPES.find((t) => t.code === 'DV').fields.filter((f) => f.key === 'approver').length, 1);
  const signatories = { mayor: 'Ray R. Ruiz', mayorPosition: 'Municipal Mayor', viceMayor: 'Ana B. Cruz', viceMayorPosition: 'Municipal Vice Mayor' };
  const render = (approver) => renderTemplate(to.template, { data: { approver }, caps: true, fields: to.fields, signatories });
  assert.match(render('MUNICIPAL MAYOR'), /RAY R\. RUIZ<\/b><div>Mayor<\/div>/);
  assert.match(render('MUNICIPAL VICE MAYOR'), /ANA B\. CRUZ<\/b><div>Vice Mayor<\/div>/);
  const pr = STARTER_TYPES.find((t) => t.code === 'PR');
  assert.match(renderTemplate(pr.template, { data: { approver: 'Municipal Vice Mayor' }, fields: pr.fields, signatories }), /ANA B\. CRUZ[\s\S]*Municipal Vice Mayor/);
  // on the route, the Vice Mayor's office is chosen where it is an alternate of the Mayor's
  const type = { route: [{ office: 'Office of the Municipal Mayor', alternates: ['Office of the Municipal Vice Mayor'] }] };
  const wf = buildWorkflow(type, { office: 'X', data: { approver: 'MUNICIPAL VICE MAYOR' } }, [], { uid: 'u', displayName: 'U' });
  assert.equal(wf.workflow.steps[0].routedTo, 'Office of the Municipal Vice Mayor');
});

test('a Travel Order saved before the choice prints Vice Mayor under the name', () => {
  const old = '<b>{{sig.mayor|upper}}</b><div>Mayor</div>';
  const sig = { mayor: 'Ray', viceMayor: 'Edgy' };
  assert.equal(renderTemplate(old, { data: { approver: 'MUNICIPAL VICE MAYOR' }, signatories: sig }), '<b>EDGY</b><div>Vice Mayor</div>');
  assert.equal(renderTemplate(old, { data: { approver: 'MUNICIPAL MAYOR' }, signatories: sig }), '<b>RAY</b><div>Mayor</div>');
});

test('the letterhead comes from the issuing office in Settings', async () => {
  const { officeLetterhead } = await import('./letterhead.js');
  const to = STARTER_TYPES.find((t) => t.code === 'TO');
  const settings = { offices: DEFAULT_SETTINGS.offices, officeContacts: { ...DEFAULT_SETTINGS.officeContacts, 'Municipal Accounting Office': { email: 'acctg@x.ph', contact: '123' } } };
  const office = officeLetterhead(settings, to, 'Municipal Accounting Office');
  assert.deepEqual(office, { name: 'Office of the Municipal Mayor', letterhead: 'Office of the Mayor', email: 'mgo.candoni@gmail.com', contact: '(+63) 966 830 6543' });
  const html = renderTemplate(to.template, { data: {}, caps: true, fields: to.fields, office });
  assert.match(html, /<u>mgo\.candoni@gmail\.com<\/u>[\s\S]*\(\+63\) 966 830 6543[\s\S]*>Office of the Mayor</);
  // a form of the document's own office; no email or contact: those lines are left out
  assert.deepEqual(officeLetterhead(settings, {}, 'Municipal Accounting Office'), { name: 'Municipal Accounting Office', letterhead: 'Municipal Accounting Office', email: 'acctg@x.ph', contact: '123' });
  assert.doesNotMatch(renderTemplate(to.template, { data: {}, fields: to.fields, office: { letterhead: 'X' } }), /Email Address|Contact No/);
});

test('Approved by and the route must agree (Mayor or Vice Mayor)', async () => {
  const { approverMismatch } = await import('./workflow.js');
  const route = [{ office: '', action: 'Prepare' }, { office: 'Office of the Municipal Mayor', action: 'Approve', alternates: ['Office of the Municipal Vice Mayor'] }];
  const juan = { uid: 'u1', displayName: 'Juan' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office', data: { approver: 'MUNICIPAL VICE MAYOR' }, pdf: { files: [{ kind: 'generated' }] } };
  doc = { ...doc, ...buildWorkflow({ route }, doc, DEFAULT_SETTINGS.offices, juan, 't0') };
  assert.equal(approverMismatch(doc), null, 'preselected the Vice Mayor');
  doc.data = { approver: 'MUNICIPAL MAYOR' }; // changed back on the form
  assert.deepEqual(approverMismatch(doc), { stage: 1, office: 'Office of the Municipal Mayor' });
  doc = { ...doc, ...chooseOffices(doc, { 1: 'Office of the Municipal Vice Mayor' }, juan, 't1') };
  assert.throws(() => applyAction(doc, 'release', juan), /Approved by and the route differ/);
  const { changed, ...patch } = chooseOffices(doc, { 1: 'Office of the Municipal Mayor' }, juan, 't2');
  doc = { ...doc, ...patch };
  assert.equal(approverMismatch(doc), null);
  assert.equal({ ...doc, ...applyAction(doc, 'release', juan, '', 't3') }.currentOffice, 'Office of the Municipal Mayor');
});

test('a third-party step: the preparer designates the person, who signs and releases it', async () => {
  const { THIRD_PARTY } = await import('./workflow.js');
  const route = [{ office: '', action: 'Prepare' }, { office: THIRD_PARTY, action: 'Conforme', sign: true }, { office: 'Municipal Accounting Office', action: 'Pre-audit' }];
  const juan = { uid: 'u1', displayName: 'Juan' };
  const acme = { uid: 's1', displayName: 'ACME Supplies' };
  let doc = { createdBy: 'u1', office: 'Municipal Engineering Office', pdf: { files: [{ kind: 'generated' }] } };
  doc = { ...doc, ...buildWorkflow({ route }, doc, DEFAULT_SETTINGS.offices, juan, 't0') };
  assert.equal(doc.workflow.choose, true);
  assert.throws(() => applyAction(doc, 'release', juan), /third party/);
  assert.throws(() => chooseOffices(doc, {}, juan), /choose the third party/);
  const { changed, ...patch } = chooseOffices(doc, { 1: { uid: 's1', name: 'ACME Supplies' } }, juan, 't1');
  doc = { ...doc, ...patch };
  assert.equal(doc.workflow.events.at(-1).remarks, 'Step 2: ACME Supplies');
  doc = { ...doc, ...applyAction(doc, 'release', juan, '', 't2') };
  assert.equal(doc.currentOffice, 'person:s1', 'held by the supplier');
  assert.equal(whereIs(doc), 'ACME Supplies');
  assert.ok(!doc.routeOffices.includes('ACME Supplies'), 'offices only');
  assert.ok(canAct(doc, acme) && !canAct(doc, { uid: 'x', office: 'Municipal Accounting Office' }));
  assert.equal(signatureMissing(doc), true, 'this step signs');
  doc.pdf.files.push({ kind: 'esigned', stage: 1 });
  doc = { ...doc, ...applyAction(doc, 'release', acme, '', 't3') };
  assert.equal(doc.currentOffice, 'Municipal Accounting Office');
});

test('editors given by the office head act as the preparer', () => {
  const office = 'Municipal Engineering Office';
  const doc = { createdBy: 'p1', office, typeCode: 'DV', editors: ['e1'], access: ['e1', 'v1'] };
  assert.ok(isPreparer(doc, { uid: 'p1' }));
  assert.ok(isPreparer(doc, { uid: 'e1', office }));
  assert.ok(!isPreparer(doc, { uid: 'e1', office: 'Municipal Health Office' }));
  assert.ok(!isPreparer(doc, { uid: 'v1', office }));
  assert.ok(isPreparer(doc, { uid: 'f1', office, grant: { office, edit: true, all: false, types: ['DV'] } }));
  assert.ok(!isPreparer(doc, { uid: 'f1', office, grant: { office, edit: false, all: true, types: [] } }));
  assert.ok(!isPreparer(doc, { uid: 'f1', office, grant: { office, edit: true, all: false, types: ['PR'] } }));
  assert.ok(isPreparer(doc, { uid: 'f1', office, grant: { office, edit: true, all: true, types: [] } }));
  assert.ok(!isPreparer({ ...doc, restricted: true }, { uid: 'f1', office, grant: { office, edit: true, all: true, types: [] } }));
  assert.ok(isPreparer({ ...doc, restricted: true }, { uid: 'e1', office }));
  // At the preparer's step, an editor may release it.
  const routed = { ...doc, workflow: { state: 'in-progress', stage: 0, steps: [{ office: '', action: 'Prepare' }] } };
  assert.ok(canAct(routed, { uid: 'e1', office }));
  assert.ok(!canAct(routed, { uid: 'v1', office }));
});
