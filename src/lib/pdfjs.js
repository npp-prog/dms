import { PDF_TEXT_PAGES, tidyPdfText } from './docSearch.js';

// pdf.js, loaded the first time a PDF is shown or read.
let pdfjs = null;
export async function loadPdfjs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/build/pdf.min.mjs'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  return pdfjs;
}

// The words in a PDF (first pages), for search; '' when it has none or cannot be read.
export async function pdfText(bytes, { pages = PDF_TEXT_PAGES } = {}) {
  try {
    const lib = await loadPdfjs();
    const pdf = await lib.getDocument({ data: bytes.slice() }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, pages); i += 1) {
      const content = await (await pdf.getPage(i)).getTextContent();
      out.push(content.items.map((it) => it.str || '').join(' '));
    }
    pdf.destroy();
    return tidyPdfText(out);
  } catch {
    return '';
  }
}
