import test from 'node:test';
import assert from 'node:assert/strict';
import { officesOf, officesPatch, otherOffices } from './offices.js';

test('offices of a profile: current first, once each', () => {
  assert.deepEqual(officesOf({ office: 'Accounting', head: false }), [{ office: 'Accounting', head: false }]);
  assert.deepEqual(officesOf({ office: 'Treasury', head: true, offices: [{ office: 'Accounting', head: false }, { office: 'Treasury', head: true }] }).map((e) => e.office), ['Treasury', 'Accounting']);
  assert.deepEqual(officesOf({}), []);
  assert.deepEqual(otherOffices({ office: 'A', offices: [{ office: 'A' }, { office: 'B', head: true }] }), [{ office: 'B', head: true }]);
});

test('administrator changes keep the list complete', () => {
  const u = { office: 'Accounting', head: false, offices: [{ office: 'Accounting', head: false }, { office: 'Treasury', head: true }] };
  // add another office
  assert.deepEqual(officesPatch(u, {}, [...otherOffices(u), { office: 'Budget', head: false }]).offices.map((e) => e.office), ['Accounting', 'Treasury', 'Budget']);
  // current office becomes one from the list: keeps its head setting, the old one stays in the list
  const p = officesPatch(u, { office: 'Treasury' });
  assert.equal(p.head, true);
  assert.deepEqual(p.offices, [{ office: 'Treasury', head: true }, { office: 'Accounting', head: false }]);
  // moved to an office not in the list: it replaces the current one
  assert.deepEqual(officesPatch(u, { office: 'Budget' }).offices, [{ office: 'Budget', head: false }, { office: 'Treasury', head: true }]);
  // head of the current office
  assert.deepEqual(officesPatch(u, { head: true }).offices[0], { office: 'Accounting', head: true });
  // remove the other office
  assert.deepEqual(officesPatch(u, {}, []).offices, [{ office: 'Accounting', head: false }]);
  // third party: no offices
  assert.deepEqual(officesPatch(u, { role: 'payee', office: '' }).offices, []);
});
