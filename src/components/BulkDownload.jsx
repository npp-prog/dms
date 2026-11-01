import { useState } from 'react';
import { getDocument, getFileBytes, getPdfBytes, getTypeForDocument } from '../lib/api.js';
import { effectiveChecklist, itemTypeCode } from '../lib/checklists.js';
import { fileBase, fundCode, cleanPart, controlRef, uniqueNamer } from '../lib/naming.js';
import { renderPdf } from '../lib/pdf.js';
import { checklistElement, documentElement, ownItemNo } from './printables.jsx';
import { linkText, safeUrl } from './DocLinks.jsx';

// "Download all": one ZIP with the document (e.g. the DV), its checklist and every document
// linked to the checklist, each as a PDF named Fund_Payee_Checklist No._Type_Control No.
// (GF_NEIL P. PRIOLO_02_OBR_DMS2026000003.pdf). Links to other systems (PIM, CBO, ...) cannot be
// downloaded from here; they are included as internet shortcuts with the same naming.

// A document converted to PDF (and possibly signed) is downloaded as stored: the signed file.
const storedPdf = (d) => (d.pdf?.files?.length ? d.pdf.files.at(-1) : null);
const pdfBlob = async (file) => new Blob([await getPdfBytes(file.path)], { type: 'application/pdf' });

export default function BulkDownload({ docData, type, settings }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const name = uniqueNamer();
      const data = docData.data || {};
      const base = { fund: data.fund, subject: data.payee || docData.title };
      const checklist = effectiveChecklist(type, docData.transaction);
      const items = checklist?.items || [];
      const index = [`${docData.typeName} ${docData.controlNo}`, `Payee/Subject: ${base.subject || ''}`, `Fund: ${data.fund || ''}`, ''];
      const jobs = [];

      // The document itself, numbered as its own item on the checklist (e.g. 01 Disbursement Voucher).
      // Its stored PDF (signed, with the checklist inside) when it has been converted.
      const own = storedPdf(docData);
      jobs.push({ label: docData.controlNo, run: async () => ({
        file: name(fileBase({ ...base, number: ownItemNo(type, docData), type: docData.typeCode, ref: controlRef(docData.controlNo) }), 'pdf'),
        blob: own ? await pdfBlob(own) : await renderPdf(documentElement(type, docData, settings), type.paperSize, type.orientation),
      }) });
      if (items.length && !own) {
        jobs.push({ label: 'checklist', run: async () => ({
          file: name(fileBase({ ...base, number: 0, type: `CHECKLIST ${checklist.code}`, ref: controlRef(docData.controlNo) }), 'pdf'),
          blob: await renderPdf(checklistElement(checklist, docData, settings), 'A4', 'portrait'),
        }) });
      }
      // Every document linked to the checklist, then the other attachments (numbered after the
      // checklist and its additional documents).
      const extras = (docData.extraItems || []).map((x, k) => ({ ...x, n: items.length + (docData.additionalDocs || []).length + k }));
      [...items.map((item, i) => ({ ...item, n: i })), ...extras].forEach((item) => {
        const i = item.n;
        for (const link of docData.links?.[item.id] || []) {
          if (link.kind === 'fts') {
            jobs.push({ label: link.controlNo, run: async () => {
              const linked = await getDocument(link.id);
              if (!linked) throw new Error('not found');
              const file = name(fileBase({ ...base, number: i + 1, type: linked.typeCode, ref: controlRef(linked.controlNo) }), 'pdf');
              if (storedPdf(linked)) return { file, blob: await pdfBlob(storedPdf(linked)) };
              const linkedType = await getTypeForDocument(linked);
              return { file, blob: await renderPdf(documentElement(linkedType, linked, settings), linkedType.paperSize, linkedType.orientation) };
            } });
          } else if (link.kind === 'file') {
            // Uploaded to the item: named like the rest, keeping its own extension.
            const ext = (String(link.name || "").match(/\.([a-z0-9]{1,5})$/i)?.[1] || (link.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
            jobs.push({ label: link.name, run: async () => ({
              file: name(fileBase({ ...base, number: i + 1, type: itemTypeCode(item), ref: controlRef(docData.controlNo) }), ext),
              blob: new Blob([await getFileBytes(link.path)], { type: link.type }),
            }) });
          } else if (safeUrl(link.url)) {
            jobs.push({ label: linkText(link), run: async () => ({
              file: name(fileBase({ ...base, number: i + 1, type: itemTypeCode(item), ref: `${link.system} ${link.ref || ''}` }), 'url'),
              blob: new Blob([`[InternetShortcut]\r\nURL=${safeUrl(link.url)}\r\n`], { type: 'text/plain' }),
            }) });
          } else {
            index.push(`Not downloadable (reference only): ${String(i + 1).padStart(2, '0')} ${item.label} - ${linkText(link)}`);
          }
        }
      });

      // Supplemental documents, under their own DMS names.
      for (const l of docData.supplements || []) {
        jobs.push({ label: l.name, run: async () => ({ file: l.name, blob: new Blob([await getFileBytes(l.path)], { type: 'application/pdf' }) }) });
      }

      // Files uploaded at workflow steps (e.g. the DV signed by the payee in Box E).
      for (const f of docData.stepFiles || []) {
        const ext = (String(f.name || "").match(/\.([a-z0-9]{1,5})$/i)?.[1] || (f.type === 'application/pdf' ? 'pdf' : 'jpg')).toLowerCase();
        jobs.push({ label: f.name, run: async () => ({
          file: name(fileBase({ ...base, number: ownItemNo(type, docData), type: cleanPart(f.label, 24), ref: controlRef(docData.controlNo) }), ext),
          blob: new Blob([await getFileBytes(f.path)], { type: f.type }),
        }) });
      }
      const files = [];
      for (const [n, job] of jobs.entries()) {
        setStatus(`Preparing ${n + 1} of ${jobs.length}: ${job.label}`);
        try {
          const { file, blob } = await job.run();
          zip.file(file, blob);
          files.push(file);
        } catch (e) {
          index.push(`Not included: ${job.label} (${e.code === 'permission-denied' ? 'you have no access to it' : e.message})`);
        }
      }
      if ((docData.additionalDocs || []).length) {
        index.push('', 'Additional documents (not in DMS):', ...docData.additionalDocs.map((t, i) => `  ${items.length + i + 1}. ${t}`));
      }
      zip.file('00_INDEX.txt', [...index.slice(0, 4), 'Files:', ...files.map((f) => `  ${f}`), ...index.slice(4)].join('\r\n'));
      setStatus('Zipping…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${fundCode(data.fund)}_${cleanPart(base.subject) || 'NO PAYEE'}_${controlRef(docData.controlNo)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setStatus(`Downloaded ${files.length} file(s).`);
    } catch (e) {
      setStatus(`Download failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn btn-ghost" disabled={busy} onClick={run}
        title="The document, its checklist and every linked document as PDFs in one ZIP">
        {busy ? 'Preparing…' : 'Download all (ZIP)'}
      </button>
      {status && <span className="small muted bulk-status">{status}</span>}
    </>
  );
}
