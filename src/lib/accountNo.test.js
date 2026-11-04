import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAccountNo, isAccountNo, nextAccountNo, personValue, unlinkedPeople } from './accountNo.js';

test('account numbers: six digits, next one skips taken numbers', () => {
  assert.equal(formatAccountNo(1), '000001');
  assert.equal(formatAccountNo(123456), '123456');
  assert.ok(isAccountNo('000045'));
  assert.ok(!isAccountNo('45') && !isAccountNo('1234567') && !isAccountNo('') && !isAccountNo(undefined));
  assert.equal(nextAccountNo(undefined), 1);
  assert.equal(nextAccountNo(4), 5);
  assert.equal(nextAccountNo(4, (n) => ['000005', '000006'].includes(n)), 7);
  assert.throws(() => nextAccountNo(999999));
});

test('person fields: chosen from DMS, with the DMS account number', () => {
  assert.deepEqual(personValue('name', { uid: 'u1', displayName: 'Juan', accountNo: '000007' }), { name: 'Juan', nameDmsNo: '000007', nameUid: 'u1' });
  assert.deepEqual(personValue('name', null), { name: '', nameDmsNo: '', nameUid: '' });
  const fields = [
    { key: 'name', label: 'Name', type: 'person' },
    { key: 'travelers', label: 'Travelers', type: 'table', columns: [{ key: 'name', label: 'Name', type: 'person' }, { key: 'position', label: 'Position', type: 'text' }] },
  ];
  assert.deepEqual(unlinkedPeople(fields, { name: 'JUAN', nameDmsNo: '000007', travelers: [{ name: 'ANA', nameDmsNo: '000002' }, { name: '', position: '' }] }), []);
  assert.deepEqual(unlinkedPeople(fields, { name: 'JUAN', travelers: [{ name: 'ANA', nameDmsNo: '000002' }, { name: 'PEDRO' }] }), ['Name', 'Travelers, line 2: Name']);
});
