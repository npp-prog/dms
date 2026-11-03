// Officials printed on the forms (set in Settings). Templates use {{sig.<key>}}
// and {{sig.<key>Position}}, e.g. {{sig.mayor}} / {{sig.mayorPosition}}.
export const SIGNATORY_ROLES = [
  { key: 'mayor', label: 'Local Chief Executive', position: 'Municipal Mayor' },
  { key: 'viceMayor', label: 'Vice Mayor', position: 'Municipal Vice Mayor' },
  { key: 'accountant', label: 'Head of Accounting', position: 'Municipal Accountant' },
  { key: 'budget', label: 'Head of Budget', position: 'Municipal Budget Officer' },
  { key: 'treasurer', label: 'Head of Treasury', position: 'Municipal Treasurer' },
  { key: 'sbSecretary', label: 'Secretary to the Sanggunian', position: 'Secretary to the Sanggunian' },
];

export function signatoriesFrom(settings = {}) {
  const sig = {};
  for (const r of SIGNATORY_ROLES) {
    sig[r.key] = settings.signatories?.[r.key] || '';
    sig[`${r.key}Position`] = settings.signatories?.[`${r.key}Position`] || r.position;
  }
  return sig;
}

// A document type whose format prints the standard signatories ({{sig.…}}, from Settings).
export const usesStandardSignatories = (type) => /\{\{\s*sig\./.test(String(type?.template || ''));

// Signatories the preparer sets on a document whose type has none (signatories.custom):
// [{ label, name, position }], printed in a block at the end of the document (or where its format
// puts {{signatoriesBlock}}).
export const CUSTOM_SIGNATORY_LIMIT = 8;
export function cleanCustomSignatories(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((s) => ({ label: String(s?.label || '').trim().slice(0, 60), name: String(s?.name || '').trim().slice(0, 80), position: String(s?.position || '').trim().slice(0, 80) }))
    .filter((s) => s.name)
    .slice(0, CUSTOM_SIGNATORY_LIMIT);
}
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function customSignatoriesHtml(list = []) {
  const rows = cleanCustomSignatories(list);
  if (!rows.length) return '';
  return `<div class="sig-block">${rows.map((s) => `<div class="sig-cell">${s.label ? `<div class="sig-label">${esc(s.label)}:</div>` : ''}<div class="sig-line"></div><b class="sig-name">${esc(s.name.toUpperCase())}</b>${s.position ? `<div class="sig-pos">${esc(s.position)}</div>` : ''}</div>`).join('')}</div>`;
}
