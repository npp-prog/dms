import { customSignatoriesHtml } from './signatories.js';
import { amountToWords } from './numberToWords.js';
import { approverSignatories, viceApproves } from './approver.js';
import { localDay } from './archiveFiles.js';

// Lightweight template engine for document formats.
//
//   {{field}}                   value of a field (HTML-escaped)
//   {{field|currency}}          filters: currency, peso, acct, number, date, mdy, upper, words,
//                               day, ord, monthyear, year (parts of a date)
//   {{lgu.name}} {{controlNo}}  context values (lgu, sig, docType, office, controlNo, today, preparedBy, preparedByPosition, preparedByDmsNo)
//   {{sum:items.amount|peso}}   sum of a table column
//   {{table:items}}             auto-rendered HTML table for a table field
//   {{#each items}}<tr><td>{{@no}}</td><td>{{description}}</td></tr>{{/each}}
//   {{check:itemId}}            checkbox mark for a checklist item
//   {{#if field}}...{{/if}}     shown only when the field has a value
//   {{#if field=Value}}...{{/if}} shown only when the field equals Value (e.g. tick a box)
//   {{#if !field}}...{{/if}}    shown only when the field is empty

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function toNumber(value) {
  if (typeof value === 'number') return value;
  const n = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Negative amounts print in parentheses, as on the official forms: (100.00).
export function formatCurrency(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = toNumber(value);
  const text = Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${text})` : text;
}

export function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(`${value}`.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function datePart(value, part) {
  const d = /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? new Date(`${String(value).slice(0, 10)}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? part(d) : '';
}

const FILTERS = {
  currency: (v) => formatCurrency(v),
  // Accounting format, as in the spreadsheet forms: a dash for nothing or zero.
  acct: (v) => (toNumber(v) === 0 ? '-\u2007\u2007\u2007' : formatCurrency(v)),
  peso: (v) => (v === '' || v == null ? '' : `₱ ${formatCurrency(v)}`),
  number: (v) => (v === '' || v == null ? '' : toNumber(v).toLocaleString('en-PH')),
  date: (v) => formatDate(v),
  // 10/27/2026, as on the OBR and LR.
  mdy: (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? `${m[2]}/${m[3]}/${m[1]}` : String(v ?? '');
  },
  upper: (v) => String(v ?? '').toUpperCase(),
  // A person's DMS account number, as printed under their name (person fields: lib/accountNo.js).
  dms: (v) => (v ? `DMS No. ${v}` : ''),
  // Parts of a date, for wording such as "this 28th day of August 2023": day (28), ord (th),
  // monthyear (August 2023), year (2023).
  day: (v) => datePart(v, (d) => String(d.getDate())),
  ord: (v) => datePart(v, (d) => { const n = d.getDate(); return n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'; }),
  monthyear: (v) => datePart(v, (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })),
  year: (v) => datePart(v, (d) => String(d.getFullYear())),
  words: (v) => (v === '' || v == null ? '' : amountToWords(toNumber(v))),
};

function lookup(scope, path) {
  return path.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), scope);
}

function applyFilters(value, filters) {
  return filters.reduce((v, name) => (FILTERS[name] ? FILTERS[name](v) : v), value);
}

export function sumColumn(rows, column) {
  return (Array.isArray(rows) ? rows : []).reduce((total, row) => total + toNumber(row?.[column]), 0);
}

function formatCell(value, type) {
  if (type === 'currency') return formatCurrency(value);
  if (type === 'date') return formatDate(value);
  return value ?? '';
}

export function renderTable(field, rows, caps = false) {
  const columns = field?.columns || [];
  const list = Array.isArray(rows) ? rows : [];
  const minRows = Number(field?.minRows) || 0;
  const align = (c) => (c.type === 'currency' || c.type === 'number' ? ' class="r"' : c.type === 'date' ? ' class="c"'
    : c.type === 'textarea' ? ' style="white-space:pre-line"' : '');
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = list
    .map((row) => `<tr class="blank">${columns
      .map((c) => {
        const text = formatCell(row?.[c.key], c.type);
        // A person column: the name, and under it their DMS account number.
        const dms = c.type === 'person' && row?.[`${c.key}DmsNo`] ? `<span class="dms-no">DMS No. ${escapeHtml(row[`${c.key}DmsNo`])}</span>` : '';
        return `<td${align(c)}>${escapeHtml(caps && !c.keepCase ? String(text).toUpperCase() : text)}${dms}</td>`;
      })
      .join('')}</tr>`)
    .join('');
  const nothing = list.length ? `<tr class="nothing"><td colspan="${columns.length}">*** NOTHING FOLLOWS ***</td></tr>` : '';
  const filler = Array.from({ length: Math.max(0, minRows - list.length - (list.length ? 1 : 0)) })
    .map(() => `<tr class="blank">${columns.map(() => '<td></td>').join('')}</tr>`)
    .join('');
  const totals = columns.some((c) => c.total)
    ? `<tr class="total">${columns
      .map((c, i) => {
        if (c.total) return `<td class="r"><b>${list.length ? escapeHtml(formatCurrency(sumColumn(list, c.key))) : ''}</b></td>`;
        return i === 0 ? '<td class="r"><b>TOTAL</b></td>' : '<td></td>';
      })
      .join('')}</tr>`
    : '';
  // data-grow: when printed, the empty rows stretch so the form fills the page.
  return `<table class="pt" data-grow><thead><tr>${head}</tr></thead><tbody>${body}${nothing}${filler}${totals}</tbody></table>`;
}

// Fields and table columns printed as typed, not in capitals (keepCase).
function keptCase(ctx) {
  if (!ctx.keptCase) {
    ctx.keptCase = new Set((ctx.fields || []).flatMap((f) => [
      ...(f.keepCase ? [f.key] : []), ...(f.columns || []).filter((c) => c.keepCase).map((c) => c.key)]));
  }
  return ctx.keptCase;
}

function renderTokens(template, scope, ctx) {
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, expr) => {
    const [head, ...filters] = expr.split('|').map((s) => s.trim());

    if (head.startsWith('table:')) {
      const key = head.slice(6);
      const field = (ctx.fields || []).find((f) => f.key === key);
      return renderTable(field, lookup(scope, key), ctx.caps);
    }
    if (head.startsWith('sum:')) {
      const [key, column] = head.slice(4).split('.');
      const rows = lookup(scope, key);
      // A blank form prints blank totals, not 0.00.
      const hasValues = Array.isArray(rows) && rows.some((r) => r?.[column] !== '' && r?.[column] != null);
      if (!hasValues) return filters.includes('acct') ? FILTERS.acct('') : '';
      return escapeHtml(applyFilters(sumColumn(rows, column), filters.length ? filters : ['currency']));
    }
    if (head.startsWith('check:')) {
      return ctx.checklist?.[head.slice(6)] ? '&#9745;' : '&#9744;';
    }
    const value = lookup(scope, head);
    if (value !== null && typeof value === 'object' && !filters.length) return '';
    const out = applyFilters(value ?? '', filters);
    // ctx.caps: encoded entries print in capitals, including formatted dates. Settings
    // (lgu, sig) and the document context (controlNo, today, preparedBy) print as they are.
    const encoded = !/^(lgu|sig|docType|office)\./.test(head) && !['controlNo', 'today', 'preparedBy', 'preparedByPosition', 'preparedByIdNo'].includes(head)
      && !keptCase(ctx).has(head);
    return escapeHtml(ctx.caps && encoded ? String(out).toUpperCase() : out);
  });
}

export function renderTemplate(template, ctx = {}) {
  const base = {
    ...(ctx.data || {}),
    controlNo: ctx.controlNo || '',
    today: ctx.today || localDay(),
    lgu: ctx.lgu || {},
    docType: ctx.docType || {},
    preparedBy: ctx.preparedBy || '',
    // The preparer's position and ID no. (My Profile).
    preparedByPosition: ctx.preparedByPosition || '',
    // The preparer's DMS account no. (preparedByIdNo: its older name, same value).
    preparedByIdNo: ctx.preparedByIdNo || '',
    preparedByDmsNo: ctx.preparedByIdNo || '',
    // The Vice Mayor prints in the Mayor's place when the preparer chose them as approver.
    sig: approverSignatories(ctx.signatories || {}, ctx.data),
    office: ctx.office || {},
  };

  // A Travel Order saved before the Mayor/Vice Mayor choice prints "Mayor" under the name as text.
  const source = viceApproves(ctx.data)
    ? String(template || '').replace(/(\{\{sig\.mayor[^}]*\}\}<\/b><div>)Mayor(<\/div>)/g, '$1Vice Mayor$2') : template;
  const withIfs = String(source || '').replace(
    /\{\{#if\s+(!?)([\w.]+)\s*(?:=\s*([^}]*?))?\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, not, key, expected, inner) => {
      const value = lookup(base, key);
      const hasValue = value !== undefined && value !== null && String(value).trim() !== '' && !(Array.isArray(value) && !value.length);
      if (not) return hasValue ? '' : inner;
      const shown = expected === undefined
        ? hasValue
        // Case-insensitive: encoded values are stored in capitals.
        : String(value ?? '').trim().toUpperCase() === expected.trim().toUpperCase();
      return shown ? inner : '';
    },
  );

  const withLoops = withIfs.replace(
    /\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, key, inner) => {
      const rows = lookup(base, key);
      const field = (ctx.fields || []).find((f) => f.key === key);
      const list = Array.isArray(rows) ? [...rows] : [];
      const minRows = Number(field?.minRows) || 0;
      while (list.length < minRows) list.push({ __blank: true });
      // Column keys default to blank so they never fall through to same-named top-level fields.
      const blanks = Object.fromEntries((field?.columns || []).map((c) => [c.key, '']));
      return list
        .map((row, i) => renderTokens(
          inner,
          { ...base, ...blanks, ...row, '@no': row.__blank ? '' : i + 1, '@index': i },
          ctx,
        ))
        .join('');
    },
  );

  // Signatories the preparer set (document types without standard signatories): where the format
  // puts {{signatoriesBlock}}, or at the end.
  const MARK = '\u0000SIGBLOCK\u0000';
  const out = renderTokens(withLoops.replace(/\{\{\s*signatoriesBlock\s*\}\}/g, MARK), base, ctx);
  const block = customSignatoriesHtml(ctx.signatories?.custom);
  return out.includes(MARK) ? out.split(MARK).join(block) : out + block;
}

// Generate a sensible starting template from a document type's fields so an
// admin always has something printable before customizing the layout.
export function generateDefaultTemplate(type) {
  const fields = type?.fields || [];
  const rows = fields
    .filter((f) => f.type !== 'table')
    .map((f) => {
      const filter = f.type === 'currency' ? '|peso' : f.type === 'date' ? '|date' : '';
      return `<tr><td class="lbl">${escapeHtml(f.label)}</td><td>{{${f.key}${filter}}}</td></tr>`;
    })
    .join('\n    ');
  const tables = fields
    .filter((f) => f.type === 'table')
    .map((f) => `{{table:${f.key}}}`)
    .join('\n  ');
  return `<div class="ph"><img src="{{lgu.seal}}" alt="">
    <div class="l2">Republic of the Philippines</div>
    <div class="l1">{{lgu.name|upper}}</div>
    <div class="l2">{{lgu.address}}</div>
    <div class="l3">${escapeHtml((type?.name || 'DOCUMENT').toUpperCase())}</div></div>
  <table class="pmeta-t"><tr><td></td><td class="r">Control No.: <b>{{controlNo}}</b></td></tr></table>
  <table class="pt">
    ${rows}
  </table>
  ${tables}
  <div class="sig2">
    <div class="col"><div class="who">Prepared by:</div><div class="name">{{preparedBy|upper}}</div><div class="cap">{{preparedByPosition}}</div><div class="cap">Signature over Printed Name</div></div>
    <div class="col"><div class="who">Approved by:</div><div class="name">&nbsp;</div><div class="cap">Signature over Printed Name</div></div>
  </div>`;
}
