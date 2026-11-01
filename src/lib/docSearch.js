// Search documents by what is in them: every value encoded in the form (payee, particulars, amounts,
// table rows…), the reference numbers, who prepared it, where it is filed, and for an uploaded PDF
// the text read from it when it was uploaded (contentText).

const cache = new WeakMap();

function collect(value, out) {
  if (value === null || value === undefined || value === '') return;
  if (Array.isArray(value)) { value.forEach((v) => collect(v, out)); return; }
  // A date stamp (Firestore Timestamp): not words to search, and its numbers would only match by chance.
  if (typeof value === 'object' && typeof value.toDate === 'function') return;
  if (typeof value === 'object') { Object.values(value).forEach((v) => collect(v, out)); return; }
  // An amount: as typed, with commas, and with cents ("12,500.00", as printed on a voucher).
  const amount = (n) => out.push(String(n), n.toLocaleString('en-US', { maximumFractionDigits: 2 }), n.toFixed(2),
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  if (typeof value === 'number') { if (Number.isFinite(value)) amount(value); return; }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) { out.push(value); amount(Number(value)); return; }
  if (typeof value === 'string' || typeof value === 'boolean') out.push(String(value));
}

export function contentsOf(d) {
  if (cache.has(d)) return cache.get(d);
  const out = [d.controlNo, d.title, d.typeCode, d.typeName, d.office, d.createdByName, d.createdByPosition, d.archive?.location,
    d.uploaded?.name, d.supports?.controlNo, d.copiedFrom?.controlNo];
  Object.values(d.refNos || {}).forEach((r) => out.push(r?.value));
  collect(d.data, out);
  out.push(d.contentText);
  const text = out.filter(Boolean).join(' \n ').toLowerCase().replace(/\s+/g, ' ');
  const entry = { text, bare: text.replace(/,/g, '') };
  cache.set(d, entry);
  return entry;
}

// Every word of the query is somewhere in the document ("12,500" also finds 12500).
export function matchesSearch(d, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const { text, bare } = contentsOf(d);
  return words.every((w) => text.includes(w) || bare.includes(w.replace(/,/g, '')));
}

// The text of a PDF (its first pages), kept on an uploaded document so it can be searched by its
// contents. A scan or photo without a text layer gives nothing.
export const PDF_TEXT_PAGES = 30;
export const PDF_TEXT_CHARS = 20000;
export function tidyPdfText(pages) {
  return pages.join(' ').replace(/\s+/g, ' ').trim().slice(0, PDF_TEXT_CHARS);
}
