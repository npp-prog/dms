import { useEffect, useLayoutEffect, useRef } from 'react';
import { PRINT_MARGIN_MM, fitPage, pageSize } from '../lib/paper.js';

const PX_PER_MM = 96 / 25.4;

// A printable page, laid out exactly as it prints:
//  - fit to page: the content is scaled to fit one page in width and height
//    (content that would shrink below minScale continues on more pages instead);
//  - fill the page: if there is room left, the empty rows of the table marked
//    data-grow grow taller so the form uses the whole sheet, like a pre-printed form;
//  - the on-screen preview is the same page, scaled down to fit the column.
// A form that would shrink below minScale (80%) to fit one page runs onto more pages instead, at
// full size, up to maxPages (5); beyond that it is scaled down to fit 5 pages.
export const MAX_PAGES = 5;
export default function PrintPage({ paperSize, orientation, minScale = 0.8, maxPages = MAX_PAGES, children }) {
  const areaRef = useRef(null);
  const holderRef = useRef(null);
  const paperRef = useRef(null);
  const fitRef = useRef(null);
  const page = pageSize(paperSize, orientation);
  const printableW = page.w - 2 * PRINT_MARGIN_MM;
  const printableH = page.h - 2 * PRINT_MARGIN_MM;

  // Screen only: shrink the whole sheet to the available width without reflowing it.
  const preview = () => {
    const area = areaRef.current;
    const holder = holderRef.current;
    const paper = paperRef.current;
    if (!area || !holder || !paper) return;
    const s = Math.min(1, area.clientWidth / (page.w * PX_PER_MM));
    paper.style.transform = s < 1 ? `scale(${s})` : '';
    holder.style.height = `${paper.offsetHeight * s}px`;
    holder.style.width = `${paper.offsetWidth * s}px`;
  };

  const layout = () => {
    const el = fitRef.current;
    if (!el) return;
    el.style.zoom = '';
    el.querySelectorAll('[data-filler]').forEach((row) => row.remove());
    el.querySelectorAll('[data-grown]').forEach((row) => {
      row.style.height = '';
      row.removeAttribute('data-grown');
    });
    const measure = (widthMm) => {
      el.style.width = `${widthMm}mm`;
      return { w: el.scrollWidth / PX_PER_MM, h: el.scrollHeight / PX_PER_MM };
    };
    const { scale, width } = fitPage(measure, printableW, printableH, minScale, maxPages);
    el.style.width = `${width}mm`;
    // Room left on the page (in unscaled mm) goes to the empty rows of the main table.
    // If every row is filled in, one empty row is added to take up the room instead.
    // Keep 4 mm of the page free: print layout can come out a little taller than on screen.
    const room = () => (printableH - 4) / scale - el.scrollHeight / PX_PER_MM;
    let free = room();
    const table = el.querySelector('[data-grow]');
    const lines = table && free > 2 ? [...table.querySelectorAll('tr.blank')] : [];
    // Empty rows grow; so do filled rows marked data-fill (e.g. OBR lines, which share the page).
    let rows = lines.filter((row) => !row.textContent.trim() || row.hasAttribute('data-fill'));
    if (!rows.length && lines.length) {
      const filler = lines[lines.length - 1].cloneNode(true);
      filler.querySelectorAll('td').forEach((td) => { td.innerHTML = ''; });
      filler.setAttribute('data-filler', '');
      lines[lines.length - 1].after(filler);
      free = room();
      if (free < 0) filler.remove();
      else rows = [filler];
    }
    if (free > 2 && rows.length) {
      const extra = free / rows.length;
      for (const row of rows) {
        row.style.height = `${row.offsetHeight / PX_PER_MM + extra}mm`;
        row.setAttribute('data-grown', '');
      }
    }
    el.style.zoom = scale === 1 ? '' : String(scale);
    // More than one page: a footer marked data-page-foot prints at the bottom of every page.
    if (el.scrollHeight * scale / PX_PER_MM > printableH + 1) el.setAttribute('data-multipage', ''); else el.removeAttribute('data-multipage');
    preview();
  };

  // Re-lay out after every render (the content changes as the user types).
  useLayoutEffect(layout);

  useEffect(() => {
    const el = fitRef.current;
    const onLoad = () => layout();
    el?.addEventListener('load', onLoad, true); // images (the seal) change the height
    window.addEventListener('beforeprint', layout);
    const observer = new ResizeObserver(() => preview());
    if (areaRef.current) observer.observe(areaRef.current);
    return () => {
      el?.removeEventListener('load', onLoad, true);
      window.removeEventListener('beforeprint', layout);
      observer.disconnect();
    };
  });

  return (
    <div className="print-area" ref={areaRef}>
      <style>{`@media print { @page { size: ${page.css}; margin: ${PRINT_MARGIN_MM}mm; } }`}</style>
      <div className="paper-holder" ref={holderRef}>
        <div className="paper" ref={paperRef}
          style={{ width: `${page.w}mm`, minHeight: `${page.h}mm`, padding: `${PRINT_MARGIN_MM}mm` }}>
          <div ref={fitRef} className="fit">{children}</div>
        </div>
      </div>
    </div>
  );
}
