import { toNumber } from './template.js';
import { isChecked } from './checklists.js';
import { localDay } from './archiveFiles.js';

// Pure helpers shared by the guided wizard and validation (no Firebase here).

// Tiny formula language for computed values: terms joined by + and -, each term a
// product (*) of numbers, keys, or sum:table.column. E.g. "qty*unitCost",
// "gross-deductions", "sum:items.amount-cashAdvance".
export function evaluate(formula, scope) {
  const terms = String(formula || '').replace(/\s+/g, '').match(/[+-]?[^+-]+/g) || [];
  let any = false;
  const total = terms.reduce((acc, term) => {
    const sign = term.startsWith('-') ? -1 : 1;
    const product = term.replace(/^[+-]/, '').split('*').reduce((p, factor) => {
      if (/^\d+(\.\d+)?$/.test(factor)) return p * Number(factor);
      if (factor.startsWith('sum:')) {
        const [tbl, col] = factor.slice(4).split('.');
        const rows = Array.isArray(scope?.[tbl]) ? scope[tbl] : [];
        if (rows.some((r) => r?.[col] !== '' && r?.[col] != null)) any = true;
        return p * rows.reduce((t, r) => t + toNumber(r?.[col]), 0);
      }
      const v = scope?.[factor];
      if (v !== undefined && v !== '' && v !== null) any = true;
      return p * toNumber(v);
    }, 1);
    return acc + sign * product;
  }, 0);
  return any ? Math.round(total * 100) / 100 : '';
}

export function computeRow(columns, row) {
  const next = { ...row };
  for (const col of columns || []) {
    if (col.compute) next[col.key] = evaluate(col.compute, next);
  }
  return next;
}

// Recomputes fields that have a formula (field.compute) from the rest of the data.
export function computeFields(fields, data) {
  let next = data;
  for (const f of fields || []) {
    if (f.type !== 'table' && f.compute) {
      const v = evaluate(f.compute, next);
      if (v !== next[f.key]) next = { ...next, [f.key]: v };
    }
  }
  return next;
}

// What a blank form prints: only values the format pre-prints (fields with a default, e.g. the
// DV's General Fund and "Head of Department/Office"), not today's date.
export function blankData(type) {
  return Object.fromEntries((type?.fields || []).filter((f) => f.default != null && f.type !== 'table').map((f) => [f.key, f.default]));
}

// Everything encoded is in capital letters, as on the official forms. Applied as the user
// types (FieldInput) and again when printing, so documents saved earlier print in capitals too.
export function toCaps(value) {
  if (typeof value === 'string') return value.toUpperCase();
  if (Array.isArray(value)) return value.map(toCaps);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toCaps(v)]));
  return value;
}

// Entries in capitals, except fields and table columns marked keepCase (printed as typed, e.g.
// a position or the purpose of a travel order).
export function capsFor(fields = [], data = {}) {
  const byKey = Object.fromEntries((fields || []).map((f) => [f.key, f]));
  return Object.fromEntries(Object.entries(data || {}).map(([k, v]) => {
    const f = byKey[k];
    if (f?.keepCase) return [k, v];
    if (f?.type === 'table' && Array.isArray(v)) {
      const keep = new Set((f.columns || []).filter((c) => c.keepCase).map((c) => c.key));
      return [k, v.map((row) => (row && typeof row === 'object'
        ? Object.fromEntries(Object.entries(row).map(([ck, cv]) => [ck, keep.has(ck) ? cv : toCaps(cv)])) : toCaps(row)))];
    }
    return [k, toCaps(v)];
  }));
}

export function initialData(type) {
  const data = {};
  for (const f of type?.fields || []) {
    if (f.type === 'table') data[f.key] = [];
    else if (f.type === 'date' && f.key === 'date') data[f.key] = localDay();
    else data[f.key] = f.default ?? '';
  }
  return data;
}

// A copy of a document's details for a new draft of the same type: what the preparer encoded,
// not what the offices filled in along the route (DV No., check details) nor the numbers they
// assigned, and today's date.
export function copiedData(type, src) {
  const data = initialData(type);
  const skip = new Set(Object.keys(src?.refNos || {}));
  for (const s of [...(type?.route || []), ...(type?.processing || [])]) {
    if (s?.assign?.field) skip.add(s.assign.field);
    if (s?.assign?.dateField) skip.add(s.assign.dateField);
    (s?.fills || []).forEach((k) => skip.add(k));
  }
  for (const f of type?.fields || []) {
    if (f.filledBy || skip.has(f.key) || f.key === 'date' || !(f.key in (src?.data || {}))) continue;
    data[f.key] = JSON.parse(JSON.stringify(src.data[f.key]));
  }
  return data;
}

// Steps for the guided process. Fields without a valid step go to a catch-all step.
// Fields the Accounting Office fills in on the saved document (e.g. the DV No. and date),
// not shown to the end user in the wizard.
export const byAccounting = (f) => f.filledBy === 'accounting';
// Fields an office fills in along the workflow (Accounting's DV No., Treasury's check details):
// not part of the preparer's wizard.
export const byOffice = (f) => Boolean(f.filledBy);

export function buildSteps(type) {
  const steps = (type?.steps || []).map((s) => ({ ...s, fields: [] }));
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  const loose = [];
  for (const f of (type?.fields || []).filter((x) => !byOffice(x))) (byId[f.step] ? byId[f.step].fields : loose).push(f);
  if (loose.length) {
    steps.push({ id: '__other', title: steps.length ? 'Other Details' : 'Details', instructions: '', fields: loose });
  }
  return steps.filter((s) => s.fields.length);
}

function isEmpty(field, value) {
  if (field.type === 'table') {
    return !Array.isArray(value) || !value.some((row) => Object.values(row || {}).some((v) => v !== '' && v != null));
  }
  return value === undefined || value === null || String(value).trim() === '';
}

export function missingFields(fields, data) {
  return (fields || []).filter((f) => f.required && isEmpty(f, data?.[f.key]));
}

export function missingChecklist(checklist, state) {
  return (checklist || []).filter((c) => c.required && !isChecked(state?.[c.id]));
}

export function slugKey(label) {
  const words = String(label || '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const key = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');
  return /^[0-9]/.test(key) ? `f${key}` : key;
}
