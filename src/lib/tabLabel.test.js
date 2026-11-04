import test from 'node:test';
import assert from 'node:assert/strict';
import { tabLabel } from './tabLabel.js';

test('tab labels: at most 10 characters, spaces included', () => {
  assert.equal(tabLabel('02 OBR'), '02 OBR');
  assert.equal(tabLabel('04 IT'), '04 IT');
  assert.equal(tabLabel('Signed PDF'), 'Signed PDF');
  assert.equal(tabLabel('03 Travel Order'), '03 TO');
  assert.equal(tabLabel('05 Certificate of Appearance'), '05 CA');
  assert.equal(tabLabel('06 Inspection'), '06 Inspec…');
  assert.equal(tabLabel('Checklist 1613'), 'Checklist…');
  assert.equal(tabLabel('  Official   receipt '), 'Official…');
  for (const s of ['03 Travel Order', 'Supplemental document', '12 A B C D E F G H I J K L']) assert.ok(tabLabel(s).length <= 10, s);
});
