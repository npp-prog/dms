// Digital signatures on a document's PDF with a DICT PNPKI certificate (.p12/.pfx).
//
// Signing happens on the signatory's computer: the certificate file and its password are read
// in the browser and never sent anywhere. Each signature is added as an incremental update
// (appended to the file), so the signatures already on the PDF stay valid, the same way Adobe
// Acrobat adds a second signature. The same functions check PDFs signed in Acrobat and uploaded.
//
// Pure functions on bytes (Uint8Array), usable in the browser and in Node (tests).
import { Buffer } from 'buffer';
import forge from 'node-forge';

// The browser's Buffer (the 'buffer' package) treats buf.lastIndexOf(value, 'utf8') as a search
// starting at offset 0, where Node reads 'utf8' as the encoding and searches from the end.
// @signpdf relies on Node's reading (to find the end of the PDF catalog); without this, the
// signature field is written outside the catalog and PDF readers do not see the signature.
export function fixBufferLastIndexOf(B) {
  const original = B.prototype.lastIndexOf;
  if (original.dmsFixed) return;
  const fixed = function lastIndexOf(value, byteOffset, encoding) {
    if (typeof byteOffset === 'string') return original.call(this, value, undefined, byteOffset);
    return original.call(this, value, byteOffset, encoding);
  };
  fixed.dmsFixed = true;
  B.prototype.lastIndexOf = fixed;
}

// The @signpdf packages expect Node's global Buffer.
async function signpdfLibs() {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  fixBufferLastIndexOf(globalThis.Buffer);
  const [{ P12Signer }, signpdf] = await Promise.all([import('@signpdf/signer-p12'), import('@signpdf/signpdf')]);
  const SignPdf = signpdf.SignPdf || signpdf.default?.SignPdf;
  return { P12Signer, signpdf: new SignPdf() };
}

const OID = {
  sha1: '1.3.14.3.2.26', sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
  messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5',
};
const DIGESTS = { [OID.sha1]: 'sha1', [OID.sha256]: 'sha256', [OID.sha384]: 'sha384', [OID.sha512]: 'sha512' };

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const attr = (dn, name) => dn.getField(name)?.value || '';

// Who a certificate belongs to and who issued it.
export function certInfo(cert) {
  const email = attr(cert.subject, 'E') || attr(cert.subject, 'emailAddress')
    || (cert.getExtension('subjectAltName')?.altNames || []).find((n) => n.type === 1)?.value || '';
  const issuer = attr(cert.issuer, 'CN') || attr(cert.issuer, 'O');
  const issuerOrg = attr(cert.issuer, 'O');
  return {
    name: attr(cert.subject, 'CN'),
    email,
    org: attr(cert.subject, 'O'),
    issuer,
    issuerOrg,
    serial: cert.serialNumber,
    notBefore: cert.validity.notBefore.toISOString(),
    notAfter: cert.validity.notAfter.toISOString(),
    // Certificates of the Philippine National PKI, issued by the DICT.
    pnpki: /pnpki|philippine national|information and communications technology|\bDICT\b/i.test(`${issuer} ${issuerOrg}`),
  };
}

export function isValidAt(info, at = new Date()) {
  return new Date(info.notBefore) <= at && at <= new Date(info.notAfter);
}

// Opens a .p12/.pfx file with its password. Throws a readable error for a wrong password.
export function readCertificate(p12Bytes, password) {
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(latin1(p12Bytes)), password);
  } catch (e) {
    throw new Error(/MAC|password|Invalid/i.test(e.message) ? 'Wrong password for this certificate file.' : 'This is not a .p12/.pfx certificate file.');
  }
  const keys = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert).filter(Boolean);
  if (!keys.length || !certs.length) throw new Error('The certificate file has no private key. Use the .p12/.pfx file DICT issued to you.');
  // The signer's certificate is the one matching the private key; the others are the CA chain.
  const key = keys[0].key;
  const own = certs.find((c) => c.publicKey.n && key.n && c.publicKey.n.equals(key.n)) || certs[0];
  return certInfo(own);
}

// Adds a signature to the PDF. Returns the signed PDF (the original bytes plus an update).
// mark: { page, rect, image, lines } puts the signature, with the signatory's mark, where they placed it.
// note: { page, rect, lines, size } text the signatory adds elsewhere on the page (e.g. "Approved for
// payment"), written in the same update as the signature, so the signature covers it.
// notes: several of them (e.g. the text and the reference no. the office assigned).
export async function signPdf(pdfBytes, p12Bytes, password, { reason = '', location = '', name = '', contactInfo = '', mark = null, note = null, notes = [] } = {}) {
  const { P12Signer, signpdf } = await signpdfLibs();
  const B = globalThis.Buffer; // the Buffer @signpdf checks against
  const withPlaceholder = await addSignatureField(pdfBytes, { reason, location, name, contactInfo, mark, note, notes });
  let signer;
  try {
    signer = new P12Signer(B.from(p12Bytes), { passphrase: password });
    const signed = await signpdf.sign(withPlaceholder, signer);
    return new Uint8Array(signed);
  } catch (e) {
    if (/MAC|password|Invalid/i.test(e.message)) throw new Error('Wrong password for this certificate file.');
    throw e;
  }
}

function digestOf(algo, bytes, ranges) {
  const md = forge.md[algo].create();
  for (const [start, len] of ranges) md.update(latin1(bytes.subarray(start, start + len)));
  return md.digest().bytes();
}

// Checks one CMS (PKCS#7) signature over the given byte ranges.
// 'verified': each certificate up to a self-signed root was issued by the next one;
// 'partial': verified as far as the certificates included go; 'broken': a link does not verify.
function chainOf(cert, certs) {
  if (!cert) return { status: 'broken', names: [] };
  const names = [];
  let cur = cert;
  for (let i = 0; i < 6; i++) {
    names.push(attr(cur.subject, 'CN') || attr(cur.subject, 'O'));
    if (cur.isIssuer(cur)) {
      try { return cur.verify(cur) ? { status: 'verified', names } : { status: 'broken', names }; } catch { return { status: 'broken', names }; }
    }
    // (forge: child.isIssuer(parent) is true when parent issued child)
    const issuer = certs.find((c) => c !== cur && cur.isIssuer(c));
    if (!issuer) return { status: 'partial', names: [...names, attr(cur.issuer, 'CN') || attr(cur.issuer, 'O')] };
    try { if (!issuer.verify(cur)) return { status: 'broken', names }; } catch { return { status: 'broken', names }; }
    cur = issuer;
  }
  return { status: 'partial', names };
}

function checkCms(bytes, der, ranges) {
  const asn1 = forge.asn1.fromDer(der, { parseAllBytes: false, strict: false });
  const p7 = forge.pkcs7.messageFromAsn1(asn1);
  const cap = p7.rawCapture;
  const algo = DIGESTS[forge.asn1.derToOid(cap.digestAlgorithm)];
  const serial = forge.util.bytesToHex(cap.serial || '').replace(/^0+/, '');
  const signerCert = p7.certificates.find((c) => c.serialNumber.replace(/^0+/, '') === serial) || p7.certificates[0];
  const out = { signer: signerCert ? certInfo(signerCert) : null, signedAt: '', intact: false, valid: false, problem: '' };
  if (!algo) { out.problem = 'Unsupported digest algorithm.'; return out; }
  const attrs = cap.authenticatedAttributes || [];
  let expected = null;
  for (const a of attrs) {
    const oid = forge.asn1.derToOid(a.value[0].value);
    const val = a.value[1].value[0];
    if (oid === OID.messageDigest) expected = val.value;
    if (oid === OID.signingTime) {
      try { out.signedAt = (val.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(val.value) : forge.asn1.generalizedTimeToDate(val.value)).toISOString(); } catch { /* ignore */ }
    }
  }
  const actual = digestOf(algo, bytes, ranges);
  if (!attrs.length) {
    out.problem = 'Signature without signed attributes (not supported).';
    return out;
  }
  out.intact = expected === actual;
  if (!out.intact) { out.problem = 'The document was changed after this signature.'; return out; }
  // The signature is over the DER of the signed attributes as a SET.
  const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
  const md = forge.md[algo].create();
  md.update(forge.asn1.toDer(set).getBytes());
  try {
    out.valid = Boolean(signerCert) && signerCert.publicKey.verify(md.digest().bytes(), cap.signature);
  } catch {
    out.valid = false;
  }
  if (!out.valid) out.problem = 'The signature does not match the certificate.';
  // The certificate chain inside the signature: is the signer's certificate really issued by the
  // CA certificate that came with it? (Trust in the root itself is up to the PDF reader.)
  out.chain = chainOf(signerCert, p7.certificates);
  out.certValidWhenSigned = Boolean(out.signer) && isValidAt(out.signer, out.signedAt ? new Date(out.signedAt) : new Date());
  return out;
}

// The signature dictionary around a ByteRange: reason, location, and the field (widget) showing it.
const pdfString = (dict, key) => {
  const m = dict.match(new RegExp(`\\/${key}\\s*\\(((?:\\\\.|[^\\\\)])*)\\)`));
  return m ? m[1].replace(/\\([\\()])/g, '$1') : '';
};
function sigFieldInfo(text, at) {
  const head = text.lastIndexOf(' obj', at);
  const id = head > 0 ? text.slice(Math.max(0, head - 24), head).match(/(\d+)\s+\d+$/)?.[1] : null;
  const dict = text.slice(head, text.indexOf('endobj', at));
  const field = id ? [...text.matchAll(new RegExp(`/T\\s*\\(([^)]*)\\)[^>]*?/V\\s+${id}\\s+0\\s+R|/V\\s+${id}\\s+0\\s+R[^>]*?/T\\s*\\(([^)]*)\\)`, 'g'))].at(-1) : null;
  return { field: field ? (field[1] ?? field[2]) : '', reason: pdfString(dict, 'Reason'), location: pdfString(dict, 'Location') };
}

// Every signature in a PDF, oldest first: who signed, when, and whether it is intact.
export function readSignatures(pdfBytes) {
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const text = latin1(bytes);
  const found = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  let m;
  while ((m = re.exec(text))) {
    const [a, b, c, d] = m.slice(1).map(Number);
    if (a !== 0 || c + d > bytes.length || a + b >= c) continue;
    const hex = text.slice(a + b, c).replace(/[<>\s]/g, '');
    if (!/^[0-9a-f]+$/i.test(hex) || /^0+$/.test(hex)) continue;
    const sig = { byteRange: [a, b, c, d], coversWholeFile: c + d === bytes.length, signedUpTo: c + d, ...sigFieldInfo(text, m.index) };
    try {
      Object.assign(sig, checkCms(bytes, forge.util.hexToBytes(hex), [[a, b], [c, d]]));
    } catch (e) {
      Object.assign(sig, { signer: null, intact: false, valid: false, problem: `Unreadable signature (${e.message}).` });
    }
    found.push(sig);
  }
  return found.sort((x, y) => x.signedUpTo - y.signedUpTo);
}

const trimEnd = (bytes) => {
  let n = bytes.length;
  while (n && (bytes[n - 1] === 0x0a || bytes[n - 1] === 0x0d)) n -= 1;
  return bytes.subarray(0, n);
};

// Checks a signed PDF against the version it was made from (signed in DMS, or in Acrobat and
// uploaded): it must be the same file with signatures added, every signature intact, and the
// newest signature covering the whole file.
export function checkSignedVersion(previousBytes, signedBytes) {
  const prev = trimEnd(previousBytes);
  const next = signedBytes instanceof Uint8Array ? signedBytes : new Uint8Array(signedBytes);
  if (next.length <= prev.length || !Buffer.from(next.subarray(0, prev.length)).equals(Buffer.from(prev))) {
    return { ok: false, error: 'This is not the current PDF of the document with a signature added. Download the current PDF, sign it without changing anything else, and upload it again.' };
  }
  const before = readSignatures(previousBytes).length;
  const signatures = readSignatures(next);
  if (signatures.length <= before) return { ok: false, error: 'No new digital signature was found in this PDF.' };
  const bad = signatures.find((s) => !s.valid);
  if (bad) return { ok: false, error: `A signature is not valid${bad.signer ? ` (${bad.signer.name})` : ''}: ${bad.problem}` };
  if (!signatures.at(-1).coversWholeFile) return { ok: false, error: 'Something was added to the PDF after the last signature.' };
  return { ok: true, signatures, added: signatures.slice(before) };
}

// ---------- The signature field (with the signature mark on the face of the PDF) ----------
// Each signature is a signature field added in an incremental update, so the signatures already on
// the PDF stay valid. With a mark (the signatory's handwritten signature as an image), the field
// is visible where they placed it: the mark with "Digitally signed by ..." and the date. Clicking
// it in Adobe Acrobat or Foxit, or in the DMS viewer, shows the signature and its certificate.

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Text for a PDF string in WinAnsi (Helvetica): escape, and replace what it cannot show.
const pdfText = (s) => String(s).normalize('NFC').replace(/[^\x20-\x7e\xa0-\xff]/g, '?').replace(/([\\()])/g, '\\$1');
const num = (n) => (Math.round(n * 100) / 100).toString();
const p2 = (n) => String(n).padStart(2, '0');

// The date on the mark: 2026.10.29 15:11 (the exact time is in the signature itself).
export function stampDate(d = new Date()) {
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
const pdfDate = (d) => `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;

// The appearance of a visible signature: the mark, and the text beside it (wide box) or below.
function appearance({ w, h, image, lines }) {
  const wide = w / h >= 2.2;
  const text = lines.filter(Boolean);
  const longest = Math.max(1, ...text.map((l) => l.length));
  // The lines fit the height they have and (Helvetica ~0.55 em per character) the width.
  const fs = Math.max(3, Math.min(8, (wide ? h : h * 0.36) / (text.length * 1.25 || 1), ((wide ? w * 0.5 : w) - 2) / (longest * 0.55)));
  const area = wide ? { x: 0, y: 0, w: w * 0.48, h } : { x: 0, y: text.length * fs * 1.25, w, h: h - text.length * fs * 1.25 };
  const k = Math.min(area.w / image.width, area.h / image.height);
  const iw = image.width * k;
  const ih = image.height * k;
  const tx = wide ? w * 0.5 : 1;
  const top = wide ? (h + text.length * fs * 1.25) / 2 - fs : text.length * fs * 1.25 - fs;
  return `q ${num(iw)} 0 0 ${num(ih)} ${num(area.x + (area.w - iw) / 2)} ${num(area.y + (area.h - ih) / 2)} cm /Im1 Do Q\n0 0 0.35 rg\n${
    text.map((l, i) => `BT /F1 ${num(fs)} Tf ${num(tx)} ${num(top - i * fs * 1.25)} Td (${pdfText(l)}) Tj ET`).join('\n')}\n`;
}

// Text added with a signature: lines of at most `width` characters (words kept whole).
export function wrapNote(text, width = 48) {
  return String(text || '').split(/\r?\n/).flatMap((para) => {
    const out = [];
    let line = '';
    for (const word of para.trim().split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > width) { out.push(line); line = ''; }
      line = line ? `${line} ${word}` : word;
      while (line.length > width) { out.push(line.slice(0, width)); line = line.slice(width); }
    }
    out.push(line);
    return out;
  }).filter((l, i, all) => l || (i > 0 && i < all.length - 1));
}

// The box a note takes in points, for its lines at a font size (Helvetica ~0.52 em per character).
export function noteBox(lines, size = 10) {
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return { w: Math.ceil(longest * size * 0.52 + 6), h: Math.ceil(lines.length * size * 1.25 + 4) };
}

// A stamp (DISAPPROVED): its first line large and bold, the others (who, when) under it, in red in
// a red frame. Its box: { w, h } in points.
export function stampBox(lines, size = 10) {
  const big = size * 1.8;
  const [first = '', ...rest] = lines;
  const w = Math.max(first.length * big * 0.72, ...rest.map((l) => l.length * size * 0.52)) + 12;
  return { w: Math.ceil(w), h: Math.ceil(big + 8 + rest.length * size * 1.25) };
}

// A note: text on the page as a locked FreeText annotation (printed, read-only, locked: 4 + 64 + 128).
function putNote(put, note, ids, pageRef, name, at) {
  const B = globalThis.Buffer;
  const fs = note.size || 10;
  const w = note.rect[2] - note.rect[0];
  const h = note.rect[3] - note.rect[1];
  if (note.stamp) {
    const big = fs * 1.8;
    const [first = '', ...rest] = note.lines;
    const ops = [
      `0.8 0 0 RG 1.6 w 1 1 ${num(w - 2)} ${num(h - 2)} re S`, '0.8 0 0 rg',
      `BT /F2 ${num(big)} Tf 6 ${num(h - 4 - big * 0.85)} Td (${pdfText(first)}) Tj ET`,
      ...rest.map((l, i) => `BT /F1 ${num(fs)} Tf 6 ${num(h - 6 - big - (i + 1) * fs * 1.2 + fs * 0.25)} Td (${pdfText(l)}) Tj ET`),
    ];
    const sbody = B.from(`${ops.join('\n')}\n`, 'latin1');
    put(ids.form, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${num(w)} ${num(h)}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >> >> >> /Length ${sbody.length} >>`, sbody);
    put(ids.annot, `<< /Type /Annot /Subtype /FreeText /Rect [${note.rect.map(num).join(' ')}] /Contents (${pdfText(note.lines.join(' '))}) /T (${pdfText(name)}) /M (${pdfDate(at)}) /DA (/Helv ${num(fs)} Tf 0.8 0 0 rg) /F 196 /Border [0 0 0] /P ${pageRef} /AP << /N ${ids.form} 0 R >> >>`);
    return;
  }
  const body = B.from(`0 0 0.35 rg\n${note.lines.map((l, i) => `BT /F1 ${num(fs)} Tf 3 ${num(h - 2 - fs - i * fs * 1.25 + fs * 0.2)} Td (${pdfText(l)}) Tj ET`).join('\n')}\n`, 'latin1');
  put(ids.form, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${num(w)} ${num(h)}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >> >> /Length ${body.length} >>`, body);
  put(ids.annot, `<< /Type /Annot /Subtype /FreeText /Rect [${note.rect.map(num).join(' ')}] /Contents (${pdfText(note.lines.join(' '))}) /T (${pdfText(name)}) /M (${pdfDate(at)}) /DA (/Helv ${num(fs)} Tf 0 0 0.35 rg) /F 196 /Border [0 0 0] /P ${pageRef} /AP << /N ${ids.form} 0 R >> >>`);
}

// Adds an empty signature field (the placeholder @signpdf fills in). mark: { page, rect, image,
// lines } for a visible signature; without it the signature is invisible (on the first page).
// note: { page, rect, lines, size } added text, as a locked FreeText annotation in the same update.
export async function addSignatureField(pdfBytes, { reason = '', location = '', name = '', contactInfo = '', mark = null, note = null, notes: more = [], signatureLength = 16384, at = new Date() } = {}) {
  const notes = [...(note ? [note] : []), ...more];
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  fixBufferLastIndexOf(globalThis.Buffer);
  const B = globalThis.Buffer;
  // CommonJS modules: Node and the bundler expose their default export differently.
  const def = (m) => (typeof m.default === 'function' ? m.default : m.default?.default);
  const [readPdf, findObject, getPagesDictionaryRef] = (await Promise.all([
    import('@signpdf/placeholder-plain/dist/readPdf.js'), import('@signpdf/placeholder-plain/dist/findObject.js'),
    import('@signpdf/placeholder-plain/dist/getPagesDictionaryRef.js'),
  ])).map(def);
  const pdf = B.from(pdfBytes);
  const cannot = (why) => new Error(`DMS cannot add a signature to this PDF (${why}). Download it and sign it in Adobe Acrobat instead.`);
  let info;
  try { info = readPdf(pdf); } catch (e) { throw cannot(e.message); }
  const obj = (ref) => findObject(pdf, info.xref, ref).toString();
  const idOf = (ref) => Number(String(ref).trim().split(/\s+/)[0]);

  const kids = obj(getPagesDictionaryRef(info)).match(/\/Kids\s*\[([^\]]*)\]/)?.[1].match(/\d+\s+\d+\s+R/g) || [];
  const pageRef = kids[mark ? mark.page : 0];
  const notePages = notes.map((n) => kids[n.page]);
  if (!pageRef || notePages.some((r) => !r)) throw cannot('page not found');
  const pagesHit = [...new Set([pageRef, ...notePages])];
  if (pagesHit.some((r) => /\/Annots\s+\d+\s+\d+\s+R/.test(obj(r)))) throw cannot('page annotations in a separate object');
  const root = info.root;
  const acroRef = root.match(/\/AcroForm\s+(\d+\s+\d+\s+R)/)?.[1];
  if (!acroRef && /\/AcroForm\s*<</.test(root)) throw cannot('form inside the catalog');
  const acroDict = acroRef ? obj(acroRef) : '';
  const fields = acroDict.match(/\/Fields\s*\[([^\]]*)\]/)?.[1].match(/\d+\s+\d+\s+R/g) || [];

  let next = info.xref.maxIndex + 1;
  const ids = {
    img: mark ? next++ : null, smask: mark?.image.alpha ? next++ : null, form: mark ? next++ : null,
    sig: next++, widget: next++, acro: acroRef ? idOf(acroRef) : next++,
  };
  const noteIds = notes.map(() => ({ form: next++, annot: next++ }));
  const rect = mark ? mark.rect : [0, 0, 0, 0];

  const chunks = [B.from('\n')];
  let pos = pdf.length + 1;
  const offsets = [];
  const put = (id, head, stream) => {
    offsets.push([id, pos]);
    const parts = stream
      ? [B.from(`${id} 0 obj\n${head}\nstream\n`, 'latin1'), B.from(stream), B.from('\nendstream\nendobj\n')]
      : [B.from(`${id} 0 obj\n${head}\nendobj\n`, 'latin1')];
    for (const part of parts) { chunks.push(part); pos += part.length; }
  };

  if (mark) {
    const { image } = mark;
    const w = rect[2] - rect[0];
    const h = rect[3] - rect[1];
    const rgb = await deflate(image.rgb);
    put(ids.img, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${ids.smask ? ` /SMask ${ids.smask} 0 R` : ''} /Length ${rgb.length} >>`, rgb);
    if (ids.smask) {
      const alpha = await deflate(image.alpha);
      put(ids.smask, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alpha.length} >>`, alpha);
    }
    const body = B.from(appearance({ w, h, image, lines: mark.lines || [] }), 'latin1');
    put(ids.form, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${num(w)} ${num(h)}] /Resources << /XObject << /Im1 ${ids.img} 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >> >> /Length ${body.length} >>`, body);
  }
  // The signature value: @signpdf replaces the ByteRange and fills Contents (it looks for the
  // ByteRange placeholder, then the /Contents after it).
  put(ids.sig, `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /ByteRange [0 /********** /********** /**********] /Contents <${'0'.repeat(signatureLength * 2)}> /Reason (${pdfText(reason)}) /M (${pdfDate(at)}) /ContactInfo (${pdfText(contactInfo)}) /Name (${pdfText(name)}) /Location (${pdfText(location)}) /Prop_Build << /App << /Name /Candoni.DMS >> >> >>`);
  // The field and its widget (flags 4 + 128: printed, locked).
  put(ids.widget, `<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature${fields.length + 1}) /V ${ids.sig} 0 R /Rect [${rect.map(num).join(' ')}] /F 132 /P ${pageRef}${mark ? ` /AP << /N ${ids.form} 0 R >>` : ''} >>`);
  const fieldsArr = `/Fields [${[...fields, `${ids.widget} 0 R`].join(' ')}]`;
  const acro = acroDict
    ? (/\/Fields\s*\[/.test(acroDict) ? acroDict.replace(/\/Fields\s*\[[^\]]*\]/, fieldsArr) : `${acroDict}\n${fieldsArr}`)
    : `/Type /AcroForm\n${fieldsArr}`;
  put(ids.acro, `<<\n${(/\/SigFlags/.test(acro) ? acro.replace(/\/SigFlags\s+\d+/, '/SigFlags 3') : `${acro}\n/SigFlags 3`).trim()}\n>>`);
  if (!acroRef) put(idOf(info.rootRef), `<<\n${root.trim()}\n/AcroForm ${ids.acro} 0 R\n>>`);
  notes.forEach((n, i) => putNote(put, n, noteIds[i], notePages[i], name, at));
  for (const ref of pagesHit) {
    const dict = obj(ref);
    const add = [...(ref === pageRef ? [ids.widget] : []), ...noteIds.filter((_, i) => notePages[i] === ref).map((x) => x.annot)].map((n) => `${n} 0 R`).join(' ');
    const annots = /\/Annots\s*\[/.test(dict)
      ? dict.replace(/\/Annots\s*\[([^\]]*)\]/, (_, refs) => `/Annots [${refs.trim()} ${add}]`)
      : `${dict}\n/Annots [${add}]`;
    put(idOf(ref), `<<\n${annots.trim()}\n>>`);
  }

  const xrefAt = pos;
  const rows = offsets.sort((x, y) => x[0] - y[0]).map(([id, off]) => `${id} 1\n${String(off).padStart(10, '0')} 00000 n \n`).join('');
  chunks.push(B.from(`xref\n0 1\n0000000000 65535 f \n${rows}trailer\n<<\n/Size ${next}\n/Root ${info.rootRef}\n${info.infoRef ? `/Info ${info.infoRef}\n` : ''}/Prev ${info.xRefPosition}\n>>\nstartxref\n${xrefAt}\n%%EOF\n`, 'latin1'));
  return B.concat([pdf, ...chunks]);
}

// Everything a reader needs to trust a signed PDF: every signature checked, and whether anything
// was added after the last one. Runs in the browser; the file is not sent anywhere.
export function verifyPdf(pdfBytes) {
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const signatures = readSignatures(bytes);
  const last = signatures.at(-1);
  // A few bytes after the last signature (line ends) are not a change; nor is DMS's QR code.
  const tail = last ? latin1(bytes.subarray(last.signedUpTo)).trim() : '';
  const qrOnly = Boolean(tail) && qrStampOnly(bytes, last.signedUpTo);
  return {
    signatures,
    allValid: signatures.length > 0 && signatures.every((x) => x.valid),
    changedAfterLast: Boolean(last) && tail.length > 0 && !qrOnly,
    qrAdded: qrOnly,
  };
}

// Is everything after byte `from` only DMS's QR code (addQrStamps)? Its appearance (a form of
// filled rectangles and text), its locked stamps, and the pages it was put on, each the same as
// before but for the stamp in its /Annots; nothing else.
export function qrStampOnly(bytes, from) {
  const text = latin1(bytes);
  const before = text.slice(0, from);
  const tail = text.slice(from);
  const objects = [...tail.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)];
  if (!objects.length) return false;
  const rest = objects.reduce((t, m) => t.replace(m[0], ''), tail);
  if (!/^\s*xref\n[\d\sfn]*trailer\s*<<[\s\S]*?>>\s*startxref\s*\d+\s*%%EOF\s*$/.test(rest)) return false;
  const stamps = new Set();
  const withoutAnnots = (d) => d.replace(/\/Annots\s*\[[^\]]*\]/, '').replace(/[<>\s]/g, '');
  for (const [, id, body] of objects) {
    if (/^<< \/Type \/XObject \/Subtype \/Form \/BBox/.test(body)) {
      const ops = body.slice(body.indexOf('stream\n') + 7, body.lastIndexOf('\nendstream'));
      if (!ops.split('\n').filter(Boolean).every((l) => /^[\d.\s-]+(rg|re f)$/.test(l) || /^BT \/F1 [\d.]+ Tf [\d.\s-]+ Td \((?:[^()\\]|\\.)*\) Tj ET$/.test(l))) return false;
    } else if (/^<< \/Type \/Annot \/Subtype \/Stamp \/Name \/DMSVerify /.test(body)) {
      stamps.add(id);
    } else {
      const prev = [...before.matchAll(new RegExp(`(?:^|\\s)${id} 0 obj\\s*([\\s\\S]*?)endobj`, 'g'))].at(-1);
      if (!prev || withoutAnnots(prev[1]) !== withoutAnnots(body)) return false;
      const added = (body.match(/\/Annots\s*\[([^\]]*)\]/)?.[1] || '').match(/\d+(?=\s+0\s+R)/g) || [];
      const had = (prev[1].match(/\/Annots\s*\[([^\]]*)\]/)?.[1] || '').match(/\d+(?=\s+0\s+R)/g) || [];
      if (!added.filter((x) => !had.includes(x)).every((x) => objects.some((m) => m[1] === x && m[2].includes('/DMSVerify')))) return false;
    }
  }
  return stamps.size > 0;
}

// Uploaded PDFs: the document's QR code (lib/qr.js qrAppearance) as a locked stamp in the bottom
// right corner of every page, added in an update after the original bytes, which stay as they
// are. Pages it cannot place one on (nested page trees, annotations in a separate object) are
// skipped; returns the bytes unchanged if no page can take one.
export async function addQrStamps(pdfBytes, appearance) {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  fixBufferLastIndexOf(globalThis.Buffer);
  const B = globalThis.Buffer;
  const def = (m) => (typeof m.default === 'function' ? m.default : m.default?.default);
  const [readPdf, findObject, getPagesDictionaryRef] = (await Promise.all([
    import('@signpdf/placeholder-plain/dist/readPdf.js'), import('@signpdf/placeholder-plain/dist/findObject.js'),
    import('@signpdf/placeholder-plain/dist/getPagesDictionaryRef.js'),
  ])).map(def);
  const pdf = B.from(pdfBytes);
  let info;
  try { info = readPdf(pdf); } catch { return pdfBytes; }
  const obj = (ref) => findObject(pdf, info.xref, ref).toString();
  const idOf = (ref) => Number(String(ref).trim().split(/\s+/)[0]);
  let pagesDict;
  try { pagesDict = obj(getPagesDictionaryRef(info)); } catch { return pdfBytes; }
  const inherited = pagesDict.match(/\/MediaBox\s*\[([^\]]*)\]/)?.[1];
  const kids = pagesDict.match(/\/Kids\s*\[([^\]]*)\]/)?.[1].match(/\d+\s+\d+\s+R/g) || [];
  const pages = [];
  for (const ref of kids) {
    let dict;
    try { dict = obj(ref); } catch { continue; }
    if (!/\/Type\s*\/Page\b/.test(dict) || /\/Annots\s+\d+\s+\d+\s+R/.test(dict)) continue;
    const box = (dict.match(/\/MediaBox\s*\[([^\]]*)\]/)?.[1] || inherited || '').trim().split(/\s+/).map(Number);
    if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) continue;
    if (/\/Rotate\s+(90|180|270)/.test(dict)) continue; // the corner would be elsewhere
    pages.push({ ref, dict, box });
  }
  if (!pages.length) return pdfBytes;

  let next = info.xref.maxIndex + 1;
  const formId = next++;
  const chunks = [B.from('\n')];
  let pos = pdf.length + 1;
  const offsets = [];
  const put = (id, head, stream) => {
    offsets.push([id, pos]);
    const parts = stream
      ? [B.from(`${id} 0 obj\n${head}\nstream\n`, 'latin1'), B.from(stream, 'latin1'), B.from('\nendstream\nendobj\n')]
      : [B.from(`${id} 0 obj\n${head}\nendobj\n`, 'latin1')];
    for (const part of parts) { chunks.push(part); pos += part.length; }
  };
  const { w, h, ops, margin } = appearance;
  put(formId, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${num(w)} ${num(h)}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >> >> /Length ${B.from(ops, 'latin1').length} >>`, ops);
  for (const p of pages) {
    const [x0, y0, x1] = p.box;
    const rect = [x1 - margin - w, y0 + margin, x1 - margin, y0 + margin + h];
    if (rect[0] < x0) continue;
    const id = next++;
    // Printed, read-only and locked (4 + 64 + 128).
    put(id, `<< /Type /Annot /Subtype /Stamp /Name /DMSVerify /Rect [${rect.map(num).join(' ')}] /Contents (Scan to verify this document in DMS) /F 196 /P ${p.ref} /AP << /N ${formId} 0 R >> >>`);
    const annots = /\/Annots\s*\[/.test(p.dict)
      ? p.dict.replace(/\/Annots\s*\[([^\]]*)\]/, (_, refs) => `/Annots [${refs.trim()} ${id} 0 R]`)
      : `${p.dict}\n/Annots [${id} 0 R]`;
    put(idOf(p.ref), `<<\n${annots.trim()}\n>>`);
  }
  if (offsets.length < 2) return pdfBytes;
  const xrefAt = pos;
  const rows = offsets.sort((x, y) => x[0] - y[0]).map(([id, off]) => `${id} 1\n${String(off).padStart(10, '0')} 00000 n \n`).join('');
  chunks.push(B.from(`xref\n0 1\n0000000000 65535 f \n${rows}trailer\n<<\n/Size ${next}\n/Root ${info.rootRef}\n${info.infoRef ? `/Info ${info.infoRef}\n` : ''}/Prev ${info.xRefPosition}\n>>\nstartxref\n${xrefAt}\n%%EOF\n`, 'latin1'));
  return new Uint8Array(B.concat([pdf, ...chunks]));
}

// Text put on the PDF without a signature (e.g. the reference no. an office assigns at a step that
// does not sign), as locked FreeText annotations in an update after the original bytes.
// mark: { page, rect, image, lines } an e-signature (no certificate): the signature mark and its
// lines (e-signature, name, date) as a locked stamp, in the same update.
export async function addNotes(pdfBytes, notes, { name = '', at = new Date(), mark = null } = {}) {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  fixBufferLastIndexOf(globalThis.Buffer);
  const B = globalThis.Buffer;
  const def = (m) => (typeof m.default === 'function' ? m.default : m.default?.default);
  const [readPdf, findObject, getPagesDictionaryRef] = (await Promise.all([
    import('@signpdf/placeholder-plain/dist/readPdf.js'), import('@signpdf/placeholder-plain/dist/findObject.js'),
    import('@signpdf/placeholder-plain/dist/getPagesDictionaryRef.js'),
  ])).map(def);
  const pdf = B.from(pdfBytes);
  const cannot = (why) => new Error(`DMS cannot add text to this PDF (${why}).`);
  let info;
  try { info = readPdf(pdf); } catch (e) { throw cannot(e.message); }
  const obj = (ref) => findObject(pdf, info.xref, ref).toString();
  const idOf = (ref) => Number(String(ref).trim().split(/\s+/)[0]);
  const kids = obj(getPagesDictionaryRef(info)).match(/\/Kids\s*\[([^\]]*)\]/)?.[1].match(/\d+\s+\d+\s+R/g) || [];
  const pages = notes.map((n) => kids[n.page]);
  const markPage = mark ? kids[mark.page] : null;
  if (pages.some((r) => !r) || (mark && !markPage)) throw cannot('page not found');
  if ([...pages, ...(markPage ? [markPage] : [])].some((r) => /\/Annots\s+\d+\s+\d+\s+R/.test(obj(r)))) throw cannot('page annotations in a separate object');
  let next = info.xref.maxIndex + 1;
  const ids = notes.map(() => ({ form: next++, annot: next++ }));
  const markIds = mark ? { img: next++, smask: mark.image.alpha ? next++ : null, form: next++, annot: next++ } : null;
  const chunks = [B.from('\n')];
  let pos = pdf.length + 1;
  const offsets = [];
  const put = (id, head, stream) => {
    offsets.push([id, pos]);
    const parts = stream
      ? [B.from(`${id} 0 obj\n${head}\nstream\n`, 'latin1'), B.from(stream), B.from('\nendstream\nendobj\n')]
      : [B.from(`${id} 0 obj\n${head}\nendobj\n`, 'latin1')];
    for (const part of parts) { chunks.push(part); pos += part.length; }
  };
  notes.forEach((n, i) => putNote(put, n, ids[i], pages[i], name, at));
  if (mark) {
    const { image, rect } = mark;
    const w = rect[2] - rect[0];
    const h = rect[3] - rect[1];
    const rgb = await deflate(image.rgb);
    put(markIds.img, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${markIds.smask ? ` /SMask ${markIds.smask} 0 R` : ''} /Length ${rgb.length} >>`, rgb);
    if (markIds.smask) {
      const alpha = await deflate(image.alpha);
      put(markIds.smask, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${alpha.length} >>`, alpha);
    }
    const body = B.from(appearance({ w, h, image, lines: mark.lines || [] }), 'latin1');
    put(markIds.form, `<< /Type /XObject /Subtype /Form /BBox [0 0 ${num(w)} ${num(h)}] /Resources << /XObject << /Im1 ${markIds.img} 0 R >> /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> >> >> /Length ${body.length} >>`, body);
    // Printed, read-only and locked (4 + 64 + 128).
    put(markIds.annot, `<< /Type /Annot /Subtype /Stamp /Name /DMSESignature /Rect [${rect.map(num).join(' ')}] /Contents (${pdfText((mark.lines || []).join(' '))}) /T (${pdfText(name)}) /M (${pdfDate(at)}) /F 196 /P ${markPage} /AP << /N ${markIds.form} 0 R >> >>`);
  }
  for (const ref of [...new Set([...pages, ...(markPage ? [markPage] : [])])]) {
    const dict = obj(ref);
    const add = [...ids.filter((_, i) => pages[i] === ref).map((x) => x.annot), ...(markPage === ref ? [markIds.annot] : [])].map((n) => `${n} 0 R`).join(' ');
    const annots = /\/Annots\s*\[/.test(dict)
      ? dict.replace(/\/Annots\s*\[([^\]]*)\]/, (_, refs) => `/Annots [${refs.trim()} ${add}]`)
      : `${dict}\n/Annots [${add}]`;
    put(idOf(ref), `<<\n${annots.trim()}\n>>`);
  }
  const xrefAt = pos;
  const rows = offsets.sort((x, y) => x[0] - y[0]).map(([id, off]) => `${id} 1\n${String(off).padStart(10, '0')} 00000 n \n`).join('');
  chunks.push(B.from(`xref\n0 1\n0000000000 65535 f \n${rows}trailer\n<<\n/Size ${next}\n/Root ${info.rootRef}\n${info.infoRef ? `/Info ${info.infoRef}\n` : ''}/Prev ${info.xRefPosition}\n>>\nstartxref\n${xrefAt}\n%%EOF\n`, 'latin1'));
  return new Uint8Array(B.concat([pdf, ...chunks]));
}
