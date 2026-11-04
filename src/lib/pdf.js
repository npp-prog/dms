import { createRoot } from 'react-dom/client';
import { PRINT_MARGIN_MM, pageSize } from './paper.js';

// Printable pages (a document, its checklist) drawn into a PDF, as they print: used by
// "Download all" and by "Convert to PDF" (the PDF that is then digitally signed).

const frames = (n) => new Promise((resolve) => {
  const step = (i) => (i ? requestAnimationFrame(() => step(i - 1)) : resolve());
  step(n);
});

// Lays out a printable page off screen exactly as it prints and draws it as page images.
export async function renderPages(element, paperSize, orientation) {
  const { default: html2canvas } = await import('html2canvas');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;background:#fff;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(element);
    await frames(2);
    await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null
      : new Promise((r) => { img.onload = r; img.onerror = r; }))));
    await document.fonts?.ready;
    await frames(3);
    const paper = host.querySelector('.paper');
    const fit = host.querySelector('.fit');
    paper.style.transform = 'none';
    // The canvas renderer does not support CSS zoom (used to fit the page): use a transform.
    const zoom = parseFloat(fit.style.zoom || '1');
    if (zoom !== 1) {
      const h = fit.offsetHeight;
      fit.style.zoom = '';
      fit.style.transformOrigin = 'top left';
      fit.style.transform = `scale(${zoom})`;
      fit.style.height = `${(fit.offsetHeight || h) * zoom}px`;
    }
    // Where a page may break: under a table row, a paragraph, a list item or a signature block
    // (never through a line of text), in px from the top of the paper.
    const top = paper.getBoundingClientRect().top;
    const paperW = paper.getBoundingClientRect().width;
    const breaks = [...fit.querySelectorAll('tr, p, li, table, .to-sigblk, [data-break]')].map((el) => el.getBoundingClientRect().bottom - top);
    const contentEnd = fit.getBoundingClientRect().bottom - top;
    const canvas = await html2canvas(paper, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const page = pageSize(paperSize, orientation);
    const pageHpx = Math.round(canvas.width * (page.h / page.w));
    // A little taller than one page (the canvas renderer lays text out slightly taller than the
    // browser's print): shrink it onto one page rather than spill a sliver onto a second.
    if (canvas.height <= pageHpx * 1.15) {
      const k = Math.min(1, pageHpx / canvas.height);
      const w = page.w * k;
      return { page, images: [{ data: canvas.toDataURL('image/jpeg', 0.92), x: (page.w - w) / 2, y: 0, w, h: (canvas.height / canvas.width) * w }] };
    }
    // More than one page (at most 5: PrintPage): each page shows the next part of the content within
    // the margins, cut under the last row, paragraph or signature block that fits.
    const k = canvas.width / paperW;
    const margin = Math.round(canvas.width * (PRINT_MARGIN_MM / page.w));
    const room = pageHpx - 2 * margin;
    const end = Math.min(canvas.height, Math.ceil(contentEnd * k) + 2);
    const cuts = breaks.map((y) => Math.round(y * k)).filter((y) => y > margin && y < end).sort((a, b) => a - b);
    const images = [];
    for (let start = margin; start < end - 2 && images.length < 12;) {
      let cut = start + room;
      if (cut < end) {
        const best = cuts.filter((y) => y > start + room * 0.5 && y <= cut).at(-1);
        if (best) cut = best;
      } else cut = end;
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = pageHpx;
      const ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, start, canvas.width, cut - start, 0, margin, canvas.width, cut - start);
      images.push({ data: slice.toDataURL('image/jpeg', 0.92), x: 0, y: 0, w: page.w, h: page.h });
      start = cut;
    }
    return { page, images };
  } finally {
    root.unmount();
    host.remove();
  }
}


// One PDF from rendered parts (each part: { page, images } from renderPages), e.g. the DV
// followed by its checklist. Written with a classic cross-reference table, so signatures can
// later be added as incremental updates (lib/signing.js).
// footer: a line printed in the bottom margin of every page (e.g. where to verify it).
// qr: { text, caption } puts the document's QR code (lib/qr.js) in the bottom right corner of every page.
export async function makePdf(parts, { title = '', author = '', footer = '', qr = null } = {}) {
  const { jsPDF } = await import('jspdf');
  const { drawQr, QR_RESERVE_MM } = qr ? await import('./qr.js') : {};
  let pdf = null;
  for (const { page, images } of parts) {
    const orient = page.w > page.h ? 'landscape' : 'portrait';
    for (const img of images) {
      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [page.w, page.h], orientation: orient });
      else pdf.addPage([page.w, page.h], orient);
      if (qr) {
        // A little smaller, centred, from the top: the bottom strip stays free for the QR code.
        const k = (page.h - QR_RESERVE_MM) / page.h;
        pdf.addImage(img.data, 'JPEG', page.w / 2 + (img.x - page.w / 2) * k, img.y * k, img.w * k, img.h * k);
      } else pdf.addImage(img.data, 'JPEG', img.x, img.y, img.w, img.h);
      if (footer) {
        pdf.setFontSize(6.5);
        pdf.setTextColor(110, 120, 135);
        pdf.text(footer, page.w / 2, page.h - 3.2, { align: 'center' });
      }
      if (qr) drawQr(pdf, qr.text, qr.lines, page.w, page.h);
    }
  }
  pdf.setProperties({ title, author, creator: 'DMS — Document Management System' });
  return pdf.output('blob');
}

export async function renderPdf(element, paperSize, orientation, meta) {
  return makePdf([await renderPages(element, paperSize, orientation)], meta);
}
