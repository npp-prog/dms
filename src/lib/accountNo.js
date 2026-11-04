// DMS account numbers: every active DMS user (LGU employee or not: suppliers, payees…) has one,
// six digits, never reused or changed (000001, 000002…). Documents that name a person (the
// travelers of a Travel Order, the employees of a Payroll, the parties of a contract) record each
// person's DMS account number with their name, for control. Pure helpers; api.js assigns them.
export const ACCOUNT_NO_DIGITS = 6;
export const ACCOUNT_NO_MAX = 999999;
export const isAccountNo = (v) => /^\d{6}$/.test(String(v ?? ''));
export const formatAccountNo = (n) => String(Math.trunc(Number(n) || 0)).padStart(ACCOUNT_NO_DIGITS, '0');
// The number after the last one issued (meta/accountNumbers.last), skipping numbers already taken.
export function nextAccountNo(last, taken = () => false) {
  let n = (Number(last) || 0) + 1;
  while (n <= ACCOUNT_NO_MAX && taken(formatAccountNo(n))) n += 1;
  if (n > ACCOUNT_NO_MAX) throw new Error('No DMS account numbers are left.');
  return n;
}

// Person fields of a document (type 'person', or a table column of that type): the name is stored
// under the field's key, its DMS account number under `${key}DmsNo` and the user under `${key}Uid`.
export const dmsNoKey = (key) => `${key}DmsNo`;
export const uidKey = (key) => `${key}Uid`;
export const headKey = (key) => `${key}Head`;
export const personValue = (key, p) => ({
  [key]: p ? String(p.displayName || p.email || '') : '',
  [dmsNoKey(key)]: p?.accountNo || '',
  [uidKey(key)]: p?.uid || '',
  // an office head (of the office they act for)
  [headKey(key)]: Boolean(p?.head),
});

// The person fields not chosen from DMS (a name with no DMS account number), as labels: a required
// person field left empty is reported by missingFields; a name typed without choosing the person is
// reported here.
export function unlinkedPeople(fields = [], data = {}) {
  const out = [];
  for (const f of fields || []) {
    if (f.type === 'person') {
      if (String(data?.[f.key] ?? '').trim() && !isAccountNo(data?.[dmsNoKey(f.key)])) out.push(f.label);
    } else if (f.type === 'table') {
      const cols = (f.columns || []).filter((c) => c.type === 'person');
      (Array.isArray(data?.[f.key]) ? data[f.key] : []).forEach((row, i) => {
        for (const c of cols) if (String(row?.[c.key] ?? '').trim() && !isAccountNo(row?.[dmsNoKey(c.key)])) out.push(`${f.label}, line ${i + 1}: ${c.label}`);
      });
    }
  }
  return out;
}
