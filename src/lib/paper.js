// Paper sizes in millimetres. "Folio" is Philippine long bond paper, 8.5 x 13 in
// ("Long" is kept as an older name for it).
export const PAPER_SIZES = {
  A4: { label: 'A4', w: 210, h: 297 },
  Folio: { label: 'Folio (8.5 × 13 in)', w: 215.9, h: 330.2 },
  Letter: { label: 'Letter', w: 215.9, h: 279.4 },
  Legal: { label: 'Legal', w: 215.9, h: 355.6 },
};

export const PRINT_MARGIN_MM = 10;

export function pageSize(paperSize, orientation) {
  const key = paperSize === 'Long' ? 'Folio' : (PAPER_SIZES[paperSize] ? paperSize : 'A4');
  const { w, h } = PAPER_SIZES[key];
  const landscape = orientation === 'landscape';
  const [pw, ph] = landscape ? [h, w] : [w, h];
  return { key, w: pw, h: ph, css: `${pw}mm ${ph}mm` };
}

// Fit to page, in both directions. measure(widthMm) lays the content out at that
// width and returns { w, h } in mm: the width it actually needs (wide tables can
// overflow) and its height. The content is laid out wider by 1/scale so that, once
// scaled, it fills the printable width; if it needs more width than that (too many
// columns), it is laid out at the width it needs and scaled down to fit.
// Returns { scale, width } where width is the layout width in mm.
// maxPages: content that would shrink below minScale on one page goes onto more pages, at its full
// size, up to maxPages (scaled down only as much as it needs to fit in maxPages).
export function fitPage(measure, printableW, printableH, minScale = 0, maxPages = 0) {
  const one = fitOnto(measure, printableW, printableH);
  if (one.scale >= minScale) return one;
  if (maxPages > 1) return fitOnto(measure, printableW, printableH * maxPages);
  // Too tall to fit one page without going below minScale (e.g. a long checklist): keep it
  // readable at minScale, laid out exactly one page wide at that scale, and let it continue
  // on the next page. (The width found above was for the smaller scale and would overflow.)
  return { scale: minScale, width: printableW / minScale };
}

function fitOnto(measure, printableW, printableH) {
  let s = 1;
  let width = printableW;
  for (let i = 0; i < 6; i++) {
    width = printableW / s;
    let m = measure(width);
    if (m.w > width + 0.5) {
      width = m.w;
      m = measure(width);
    }
    const next = Math.min(1, printableW / width, printableH / m.h);
    const done = Math.abs(next - s) < 0.002;
    s = next;
    if (done) break;
  }
  // About 1.5% of slack: print layout can come out a little taller than on screen.
  const scale = s < 1 ? s * 0.985 : 1;
  return { scale, width: Math.max(width, printableW / scale) };
}
