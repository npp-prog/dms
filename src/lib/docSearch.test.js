import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch, tidyPdfText, PDF_TEXT_CHARS } from './docSearch.js';
import { copiedData } from './forms.js';

const dv = {
  controlNo: 'DV-2026-10-0001', title: 'ACME SUPPLY', createdByName: 'Ana Reyes', office: 'Municipal Accounting Office',
  data: { payee: 'ACME SUPPLY', particulars: [{ description: 'Bond paper, long', amount: 12500 }], purpose: 'Office supplies for Q4' },
  refNos: { dvNo: { value: '100-2026-10-031' } },
};

test('search finds words anywhere in the document', () => {
  assert.ok(matchesSearch(dv, 'bond paper'));
  assert.ok(matchesSearch(dv, 'supplies q4'));
  assert.ok(matchesSearch(dv, '100-2026-10-031'));
  assert.ok(matchesSearch(dv, 'ana accounting'));
  assert.ok(!matchesSearch(dv, 'bond printer'));
  assert.ok(matchesSearch(dv, ''));
});

test('amounts match with or without commas', () => {
  assert.ok(matchesSearch(dv, '12,500'));
  assert.ok(matchesSearch(dv, '12500'));
});

test('an uploaded PDF is found by its text', () => {
  const up = { controlNo: 'DOC-1', title: 'LETTER', contentText: 'Request for road repair at Barangay Haguimit' };
  assert.ok(matchesSearch(up, 'road repair haguimit'));
});

test('PDF text is tidied and capped', () => {
  assert.equal(tidyPdfText(['a  b', '\n c']), 'a b c');
  assert.equal(tidyPdfText(['x'.repeat(PDF_TEXT_CHARS + 50)]).length, PDF_TEXT_CHARS);
});

test('a copy keeps what the preparer encoded, not office fields, assigned numbers or the date', () => {
  const type = {
    fields: [
      { key: 'date', type: 'date' }, { key: 'payee', type: 'text' }, { key: 'particulars', type: 'table' },
      { key: 'dvNo', type: 'text', filledBy: 'accounting' }, { key: 'obrNo', type: 'text' }, { key: 'newField', type: 'text', default: 'x' },
    ],
    route: [{ assign: { field: 'obrNo' } }],
  };
  const src = { data: { date: '2026-01-02', payee: 'ACME', particulars: [{ amount: 5 }], dvNo: '100', obrNo: '200', gone: 'y' }, refNos: {} };
  const out = copiedData(type, src);
  assert.equal(out.payee, 'ACME');
  assert.deepEqual(out.particulars, [{ amount: 5 }]);
  assert.notEqual(out.particulars, src.data.particulars);
  assert.equal(out.dvNo, '');
  assert.equal(out.obrNo, '');
  assert.notEqual(out.date, '2026-01-02');
  assert.equal(out.newField, 'x');
  assert.ok(!('gone' in out));
});
