import { useEffect, useRef, useState } from 'react';
import { loadPdfjs } from '../lib/pdfjs.js';
import { staleReload } from '../lib/freshness.js';

// Shows a PDF inside the page (no pop-up, no download): every page drawn with pdf.js, sized to
// the space it has. While a signatory places their signature mark, tapping a page puts the mark
// there (onPlace gets the page and the rectangle in PDF points).
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—');
const CHAIN = { verified: 'Verified', partial: 'Partly included in the signature', broken: 'Does not verify' };

// The details of one signature and its certificate, as Acrobat's signature properties show them.
function SignatureDetails({ sig, onClose }) {
  const c = sig.signer || {};
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="sig-details-backdrop" role="presentation" onClick={onClose}>
      <div className="sig-details" role="dialog" aria-modal="true" aria-label={`Signature of ${c.name || 'unknown signer'}`} onClick={(e) => e.stopPropagation()}>
        <div className="sig-details-head">
          <span className={`sig-mark ${sig.valid ? 'ok' : 'bad'}`}>{sig.valid ? '✓' : '✗'}</span>
          <div>
            <b>{c.name || 'Unknown signer'}</b>
            <div className={`small ${sig.valid ? 'sig-valid' : 'sig-problem'}`}>{sig.valid
              ? 'Signature is valid: the document has not been changed since it was signed.'
              : sig.problem}</div>
          </div>
          <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <h4>Signature</h4>
        <dl className="details">
          <dt>Signed on</dt><dd>{when(sig.signedAt)}</dd>
          {sig.reason && <><dt>Reason</dt><dd>{sig.reason}</dd></>}
          {sig.location && <><dt>Location</dt><dd>{sig.location}</dd></>}
          {sig.field && <><dt>Field</dt><dd>{sig.field}</dd></>}
          <dt>Covers</dt><dd>{sig.coversWholeFile ? 'The whole document' : 'The document up to this signature (later signatures were added after it)'}</dd>
        </dl>
        <h4>Certificate</h4>
        <dl className="details">
          <dt>Issued to</dt><dd>{c.name || '—'}{c.org ? `, ${c.org}` : ''}</dd>
          {c.email && <><dt>Email</dt><dd>{c.email}</dd></>}
          <dt>Issued by</dt><dd>{c.issuer || '—'}{c.issuerOrg && c.issuerOrg !== c.issuer ? `, ${c.issuerOrg}` : ''} {c.pnpki
            ? <span className="badge badge-green">DICT PNPKI</span> : <span className="badge badge-yellow">Not PNPKI</span>}</dd>
          <dt>Valid</dt><dd>{day(c.notBefore)} to {day(c.notAfter)}{sig.certValidWhenSigned === false ? ' (not valid when it signed)' : ''}</dd>
          <dt>Serial no.</dt><dd className="mono">{c.serial || '—'}</dd>
          <dt>Chain</dt><dd>{CHAIN[sig.chain?.status] || '—'}{sig.chain?.names?.length ? ` (${sig.chain.names.join(' → ')})` : ''}</dd>
        </dl>
        <p className="xs muted">Checked on this device. That the certificate authority itself is trusted can be confirmed in Adobe Acrobat with
          the DICT PNPKI root certificates installed (click the signature there too).</p>
      </div>
    </div>
  );
}

export default function PdfViewer({ bytes, signatures = [], title = '', placing = null, marks = [], onPlace }) {
  const [details, setDetails] = useState(null);
  const host = useRef(null);
  const canvases = useRef([]);
  const [doc, setDoc] = useState(null);
  const [sizes, setSizes] = useState([]); // page sizes in points
  const [error, setError] = useState('');
  const [width, setWidth] = useState(0);

  // Redraw when the space changes (rotating a tablet, opening the menu).
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth - 2 * 10)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!bytes) return undefined;
    let cancelled = false;
    let loaded = null;
    (async () => {
      try {
        setError('');
        // An old browser can leave pdf.js waiting forever: give up after a while and say so.
        const slow = new Promise((_, reject) => setTimeout(() => reject(new Error('this browser is taking too long to draw it. Use Open PDF or Download instead, or update the browser.')), 30000));
        const lib = await Promise.race([loadPdfjs(), slow]);
        // pdf.js takes over the buffer it is given: pass a copy.
        const task = lib.getDocument({ data: bytes.slice() });
        loaded = await Promise.race([task.promise, slow]);
        const list = [];
        for (let n = 1; n <= loaded.numPages; n++) {
          const page = await loaded.getPage(n);
          const vp = page.getViewport({ scale: 1 });
          // Visible signature fields on this page: clicking one shows the signature's details.
          const sigs = (await page.getAnnotations()).filter((a) => a.fieldType === 'Sig' && a.rect[2] > a.rect[0] && a.rect[3] > a.rect[1])
            .map((a) => ({ field: a.fieldName, rect: a.rect }));
          list.push({ w: vp.width, h: vp.height, sigs });
        }
        if (!cancelled) { setDoc(loaded); setSizes(list); }
      } catch (e) {
        if (!cancelled) setError(`Could not show the PDF: ${e.message}`);
      }
    })();
    return () => { cancelled = true; loaded?.destroy(); };
  }, [bytes]);

  useEffect(() => {
    if (!doc || !width) return undefined;
    let cancelled = false;
    let task = null; // the page being drawn: stopped when the size changes again
    (async () => {
      setError('');
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      for (let n = 1; n <= doc.numPages && !cancelled; n++) {
        const canvas = canvases.current[n - 1];
        if (!canvas) continue;
        const page = await doc.getPage(n);
        const scale = width / page.getViewport({ scale: 1 }).width;
        const vp = page.getViewport({ scale: scale * ratio });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        await task.promise;
      }
    })().catch((e) => !cancelled && e?.name !== 'RenderingCancelledException' && !staleReload(e) && setError(`Could not show the PDF: ${e.message}`));
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, width, sizes]);

  // Tap: the mark centred where tapped, kept inside the page.
  const place = (i, e) => {
    if (!placing || !onPlace) return;
    const box = e.currentTarget.getBoundingClientRect();
    const k = sizes[i].w / box.width; // points per pixel
    const x = (e.clientX - box.left) * k;
    const y = sizes[i].h - (e.clientY - box.top) * k;
    const x1 = Math.min(Math.max(0, x - placing.w / 2), sizes[i].w - placing.w);
    const y1 = Math.min(Math.max(0, y - placing.h / 2), sizes[i].h - placing.h);
    onPlace({ page: i, rect: [x1, y1, x1 + placing.w, y1 + placing.h] });
  };

  return (
    <div className={`pdf-viewer${placing ? ' placing' : ''}`} ref={host}>
      <div className="pdf-viewer-head">
        <b>{title || 'PDF'}</b>
        <span className="small muted">{sizes.length ? `${sizes.length} page${sizes.length > 1 ? 's' : ''}` : ''}</span>
        {signatures.length > 0 && (
          <span className="pdf-viewer-sigs">
            {signatures.map((s, i) => (
              <button type="button" key={i} className={`badge ${s.valid ? 'badge-green' : 'badge-red'}`} title="Show the signature and its certificate"
                onClick={() => setDetails(s)}>
                {s.valid ? '✓' : '✗'} {s.signer?.name || 'Unknown signer'}
              </button>
            ))}
          </span>
        )}
      </div>
      {placing && <div className="pdf-place-hint">{placing.hint || 'Tap the page where your signature mark goes (e.g. the Signature line of your box).'}</div>}
      {error && <div className="alert">{error}</div>}
      {!sizes.length && !error && <div className="spinner" />}
      {details && <SignatureDetails sig={details} onClose={() => setDetails(null)} />}
      <div className="pdf-pages">
        {sizes.map((s, i) => (
          <div key={i} className="pdf-page" style={{ aspectRatio: `${s.w} / ${s.h}` }} onClick={(e) => place(i, e)}>
            <canvas ref={(el) => { canvases.current[i] = el; }} aria-label={`Page ${i + 1} of ${sizes.length}`} />
            {!placing && s.sigs.map((w) => {
              const sig = signatures.find((x) => x.field === w.field);
              if (!sig) return null;
              return (
                <button type="button" key={w.field} className={`pdf-sig-hit ${sig.valid ? '' : 'bad'}`}
                  title={`Signed by ${sig.signer?.name || 'unknown'}: click to see the signature and certificate`}
                  aria-label={`Signature of ${sig.signer?.name || 'unknown signer'}: show details`}
                  style={{
                    left: `${(w.rect[0] / s.w) * 100}%`, bottom: `${(w.rect[1] / s.h) * 100}%`,
                    width: `${((w.rect[2] - w.rect[0]) / s.w) * 100}%`, height: `${((w.rect[3] - w.rect[1]) / s.h) * 100}%`,
                  }}
                  onClick={(e) => { e.stopPropagation(); setDetails(sig); }} />
              );
            })}
            {marks.filter((m) => m.page === i).map((m) => (
              <div key={m.id || m.kind || 'mark'} className={`pdf-mark${m.kind === 'text' ? ' pdf-note' : ''}${m.active === false ? ' idle' : ''}`} style={{
                left: `${(m.rect[0] / s.w) * 100}%`,
                bottom: `${(m.rect[1] / s.h) * 100}%`,
                width: `${((m.rect[2] - m.rect[0]) / s.w) * 100}%`,
                height: `${((m.rect[3] - m.rect[1]) / s.h) * 100}%`,
                // the text at its size on the page (cqw: 1% of the page's width)
                ...(m.kind === 'text' ? { fontSize: `${(m.size / s.w) * 100}cqw` } : {}),
              }}>
                {m.preview && <img src={m.preview} alt="" />}
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
