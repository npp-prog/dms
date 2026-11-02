// A file uploaded to a document (to a checklist item, or as a supplemental document) is also a DMS
// document of its own: a control no., the QR code on its PDF, a place in All Documents, and the DMS
// file name (Fund_Payee_No._Type_Control No.). Its file is stored with the parent document.
import { createSupportingDocument, finishSupportingDocument, uploadAttachment } from './api.js';
import { verifyUrl } from './qr.js';
import { withDmsQr } from './qrStamp.js';
import { imageToPdf } from './imagePdf.js';
import { controlRef, fileBase } from './naming.js';
import { sniffUpload } from './sniff.js';

export const UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
// For the file picker: the types and their extensions (phones may ignore one or the other).
export const UPLOAD_ACCEPT = [...UPLOAD_TYPES, '.pdf', '.jpg', '.jpeg', '.png', '.webp'].join(',');

export { sniffUpload } from './sniff.js';

// Returns the link to keep on the parent ({ kind: 'file', path, name, ..., dms: { id, controlNo } }).
export async function uploadSupporting({ parent, slot, label, code = '', number = 0, file, actor, onStep = () => {} }) {
  const kind = await sniffUpload(file);
  if (!kind) throw new Error(`${file.name}: upload a PDF or a picture (JPG, PNG or WebP), not a ZIP or another kind of file.`);
  onStep('Preparing the PDF…');
  let pdf = kind === 'application/pdf' ? new Uint8Array(await file.arrayBuffer()) : await imageToPdf(new File([file], file.name, { type: kind }));
  const typeCode = /^[A-Z]{2,8}$/.test(code) ? code : '';
  const created = await createSupportingDocument(parent, { label }, { typeCode, fileName: file.name }, actor);
  try {
    pdf = (await withDmsQr(pdf, verifyUrl(created.id), ['Scan to verify', created.controlNo])).bytes;
  } catch { /* kept without the code */ }
  const name = `${fileBase({ fund: parent.data?.fund, subject: parent.data?.payee || parent.title, number, type: typeCode || 'DOC', ref: controlRef(created.controlNo) })}.pdf`;
  const stored = await uploadAttachment(parent.id, slot, new File([pdf], name, { type: 'application/pdf' }), actor,
    (x) => onStep(`Uploading… ${Math.round(x * 100)}%`), created.id);
  await finishSupportingDocument(created.id, stored, pdf, actor);
  return { ...stored, label, dms: { id: created.id, controlNo: created.controlNo } };
}
