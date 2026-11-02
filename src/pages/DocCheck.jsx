import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getCheck, getPdfBytes, sha256Hex } from '../lib/api.js';
import { readSignatures, verifyPdf } from '../lib/signing.js';
import PdfViewer from '../components/PdfViewer.jsx';

// Give up on a step that hangs (a slow or blocked connection) and say so, instead of loading forever.
const within = (ms, promise, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} took too long. Check the connection and try again.`)), ms))]);

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// What the QR code on a DMS PDF opens (/v/<document id>), for anyone, signed in or not: DMS's
// record of the document (number, type, where it is on its route, who signed it), the document
// itself (its current PDF), and a check that a copy in hand is a PDF DMS issued for it, with its
// signatures intact.
export default function DocCheck({ standalone = false }) {
  const { pathname } = useLocation();
  const id = decodeURIComponent(pathname.split('/')[2] || '');
  const [rec, setRec] = useState(undefined);
  const [error, setError] = useState('');
  const [copy, setCopy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState(null); // { bytes, signatures, url } of the current PDF, or { error }
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setRec(undefined); setError('');
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) { setRec(null); return; }
    within(20000, getCheck(id), 'Loading the record').then(setRec).catch((e) => { setRec(null); setError(e.message); });
  }, [id, attempt]);

  // The document itself: its current PDF.
  useEffect(() => {
    setPdf(null);
    if (!rec?.pdf) return undefined;
    let live = true;
    let url = '';
    within(45000, getPdfBytes(rec.pdf), 'Loading the PDF')
      .then((bytes) => {
        if (!live) return;
        url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        let signatures = [];
        try { signatures = readSignatures(bytes); } catch { /* shown without signature details */ }
        setPdf({ bytes, signatures, url });
      })
      .catch((e) => live && setPdf({ error: e.message || 'The PDF could not be loaded.' }));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [rec?.pdf, attempt]);

  const checkCopy = async (f) => {
    if (!f) return;
    setBusy(true); setCopy(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const hash = await sha256Hex(bytes);
      const match = rec.versions.find((v) => v.sha256 === hash);
      let sig = null;
      try { sig = verifyPdf(bytes); } catch { /* not a readable PDF */ }
      setCopy({ name: f.name, match, latest: match && match.n === rec.versions.length, sig });
    } finally { setBusy(false); }
  };

  const status = !rec ? null
    : rec.status === 'cancelled' || rec.state === 'cancelled' ? { tone: 'bad', text: 'Cancelled' }
      : rec.state === 'done' ? { tone: 'ok', text: 'Processed: it went through its whole route' }
        : rec.state === 'in-progress' ? { tone: 'ok', text: `On its route: now with ${rec.now}` }
          : { tone: 'ok', text: 'Issued (not routed)' };

  const body = (
    <div className={standalone ? 'verify-page' : 'page'}>
      {rec === undefined && <div className="spinner" />}
      {rec === null && (
        <>
          <div className="verify-verdict bad">Not found: this code does not belong to a DMS document.</div>
          <p className="muted">Check that the whole QR code was scanned. A document that was deleted no longer has a record.
            {error && ` (${error})`}</p>
          {error && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
        </>
      )}
      {rec && (
        <>
          <div className={`verify-verdict ${status.tone === 'bad' ? 'bad' : 'ok'}`}>
            {status.tone === 'bad' ? 'This DMS document was cancelled.' : 'Genuine: this document is on record in DMS.'}
          </div>
          <section className="card check-head">
            <div className="small muted">{rec.typeName}</div>
            <h2>{rec.controlNo}</h2>
            <dl className="details">
              <dt>Payee / Subject</dt><dd>{rec.title || '—'}</dd>
              <dt>Office</dt><dd>{rec.office || '—'}</dd>
              {rec.refNos?.length > 0 && <><dt>Reference no.</dt><dd>{rec.refNos.join(' · ')}</dd></>}
              <dt>Status</dt><dd><span className={`badge ${status.tone === 'bad' ? 'badge-red' : rec.state === 'done' ? 'badge-green' : 'badge-blue'}`}>{status.text}</span></dd>
              <dt>Record updated</dt><dd>{when(rec.updatedAt)}</dd>
            </dl>
          </section>

          {!rec.pdf && (rec.versions || []).length > 0 && rec.status !== 'cancelled' && rec.state !== 'cancelled' && (
            <section className="card check-pdf">
              <h3>The document</h3>
              <p className="small muted">This document holds personal information, so its PDF is shown only to signed-in DMS users who handle it.
                {' '}<a href={`/documents/${encodeURIComponent(id)}`}>Open it in DMS</a>. You can still check a copy you have below.</p>
            </section>
          )}
          {rec.pdf && (
            <section className="card check-pdf">
              <h3>The document</h3>
              {!pdf && <><div className="spinner" /><p className="small muted center">Loading the PDF…</p></>}
              {pdf?.error && (
                <div className="alert small">
                  The PDF could not be shown: {pdf.error}
                  <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div>
                </div>
              )}
              {pdf?.url && (
                <div className="check-pdf-links">
                  <a className="link small" href={pdf.url} target="_blank" rel="noreferrer">Open PDF</a>
                  <a className="link small" href={pdf.url} download={`${rec.controlNo}.pdf`}>Download</a>
                </div>
              )}
              {pdf?.bytes && <PdfViewer bytes={pdf.bytes} signatures={pdf.signatures} title={rec.controlNo} />}
            </section>
          )}

          {rec.steps?.length > 0 && (
            <section className="card">
              <h3>Route</h3>
              <ol className="check-steps">
                {rec.steps.map((s, i) => (
                  <li key={i} className={s.done ? 'done' : s.current ? 'now' : ''}>
                    <span className="wf-dot">{s.done ? '✓' : i + 1}</span>
                    <div><b>{s.office}</b><div className="small muted">{s.action}{s.sign ? ' · signs' : ''}{s.current ? ' · here now' : ''}</div></div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="card">
            <h3>Digital signatures ({rec.signatures?.length || 0})</h3>
            {rec.signatures?.length ? (
              <ol className="sig-list">
                {rec.signatures.map((s, i) => (
                  <li key={i} className="sig-ok">
                    <span className="sig-mark">✓</span>
                    <div><b>{s.name}</b> {s.pnpki && <span className="badge badge-green">DICT PNPKI</span>}{s.esign && <span className="badge badge-yellow">e-signature</span>}
                      <div className="small muted">{[when(s.at), s.reason].filter(Boolean).join(' · ')}</div></div>
                  </li>
                ))}
              </ol>
            ) : <p className="small muted">Not signed yet.</p>}
          </section>

          <section className="card">
            <h3>Check your copy</h3>
            <p className="small muted">Choose the PDF you received: DMS checks that it is one it issued for this document and that its signatures are
              intact. The file is checked on this device and is not uploaded.</p>
            <label className="btn btn-ghost btn-sm">
              {busy ? 'Checking…' : copy ? 'Check another file' : 'Choose the PDF'}
              <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { checkCopy(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {copy && (
              <div className={`verify-verdict ${copy.match && (!copy.sig || copy.sig.allValid !== false) ? (copy.latest ? 'ok' : 'warn') : 'bad'}`} style={{ marginTop: '.7rem' }}>
                {copy.match
                  ? copy.latest
                    ? `${copy.name}: this is the current PDF of ${rec.controlNo}, exactly as DMS issued it.`
                    : `${copy.name}: this is an earlier version (${copy.match.n} of ${rec.versions.length}) of ${rec.controlNo}. Later signatures are not on it.`
                  : `${copy.name}: this file is NOT a PDF DMS issued for ${rec.controlNo}. It may have been changed, re-saved or belong to another document.`}
                {copy.sig?.signatures?.length > 0 && <div className="small">{copy.sig.allValid ? `Its ${copy.sig.signatures.length} signature(s) are intact.` : 'A signature in it is NOT valid.'}</div>}
              </div>
            )}
          </section>
          <p className="xs muted">To check the file's signatures in full, open it in Adobe Acrobat, or use <Link to="/verify">Verify a document</Link>.</p>
        </>
      )}
    </div>
  );

  if (!standalone) return body;
  return (
    <div className="verify-shell">
      <header className="verify-top">
        <img className="seal" src="/municipal-seal.png" alt="" />
        <div><b>Document Management System</b><span>Municipal Government of Candoni</span></div>
        <div className="spacer" />
        <Link className="btn btn-ghost btn-sm" to="/">Sign in</Link>
      </header>
      {body}
    </div>
  );
}
