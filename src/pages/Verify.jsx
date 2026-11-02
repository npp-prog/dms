import { useState } from 'react';
import { Link } from 'react-router-dom';
import { lookupVerification, sha256Hex } from '../lib/api.js';
import { verifyPdf } from '../lib/signing.js';
import PdfViewer from '../components/PdfViewer.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const CHAIN = {
  verified: 'Certificate chain verified',
  partial: 'Certificate chain partly included',
  broken: 'Certificate chain does not verify',
};

// Verify a document: anyone with a copy of a DMS PDF (downloaded, emailed, from a flash drive)
// checks its digital signatures here, signed in or not. The file is read in the browser and is
// not uploaded; only its fingerprint (SHA-256) is looked up in DMS's record of the PDFs it made.
export default function Verify({ standalone = false }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  const check = async (f) => {
    if (!f) return;
    setBusy(true); setError(''); setResult(null); setFile(f);
    try {
      if (f.type && f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) throw new Error('Choose a PDF file.');
      const bytes = new Uint8Array(await f.arrayBuffer());
      const check = verifyPdf(bytes);
      const hash = await sha256Hex(bytes);
      const record = await lookupVerification(hash).catch(() => undefined);
      setResult({ ...check, bytes, hash, record });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const verdict = !result ? null
    : !result.signatures.length ? { tone: 'warn', text: 'This PDF has no digital signature.' }
      : !result.allValid ? { tone: 'bad', text: 'A signature is NOT valid: the document was altered, or a signature is damaged.' }
        : result.changedAfterLast ? { tone: 'warn', text: 'The signatures are valid, but something was added to the file after the last signature.' }
          : { tone: 'ok', text: `Valid: ${result.signatures.length === 1 ? 'the signature is' : `all ${result.signatures.length} signatures are`} intact, and nothing was changed after signing${result.qrAdded ? ' (DMS only added its QR code to the pages)' : ''}.` };

  const body = (
    <div className={standalone ? 'verify-page' : 'page'}>
      <div className="page-head">
        <div>
          <h1>Verify a document</h1>
        </div>
      </div>

      <label className={`card verify-drop${drag ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); check(e.dataTransfer.files[0]); }}>
        <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => check(e.target.files[0])} />
        <b>{busy ? 'Checking…' : file ? 'Check another PDF' : 'Choose the PDF to verify'}</b>
        <span className="small muted">{file ? file.name : 'or drop it here'}</span>
      </label>

      {error && <div className="alert">{error}</div>}

      {result && (
        <div className="verify-result">
          <div className={`verify-verdict ${verdict.tone}`}>{verdict.text}</div>

          <section className="card">
            <h3>DMS record</h3>
            {result.record ? (
              <p>This exact file is <b>{result.record.typeName} {result.record.controlNo}</b>, version {result.record.version}
                {result.record.kind === 'esigned' ? <>, e-signed by <b>{result.record.signer}</b> (signature mark, no certificate)</> : result.record.kind === 'signed' ? <>, signed by <b>{result.record.signer}</b></> : ' (converted, before signing)'} on {when(result.record.at)}.</p>
            ) : result.record === null ? (
              <p className="muted">DMS has no record of this exact file. It may be a copy made outside DMS, or the file was changed (even
                re-saved). The signatures below are still checked on their own.</p>
            ) : <p className="muted">The DMS record could not be checked right now (no connection). The signatures below are checked on their own.</p>}
            <p className="xs muted verify-hash">SHA-256: {result.hash}</p>
          </section>

          {result.signatures.length > 0 && (
            <section className="card">
              <h3>Signatures ({result.signatures.length})</h3>
              <ol className="sig-list">
                {result.signatures.map((s, i) => (
                  <li key={i} className={s.valid ? 'sig-ok' : 'sig-bad'}>
                    <span className="sig-mark">{s.valid ? '✓' : '✗'}</span>
                    <div>
                      <b>{s.signer?.name || 'Unknown signer'}</b>
                      {s.signer && (s.signer.pnpki
                        ? <span className="badge badge-green">DICT PNPKI</span>
                        : <span className="badge badge-yellow">Not PNPKI</span>)}
                      <div className="small">{s.valid ? 'Signature valid: the document is as it was when signed.' : s.problem}</div>
                      <div className="small muted">Signed {when(s.signedAt) || '(time not stated)'}{s.signer?.email ? ` · ${s.signer.email}` : ''}</div>
                      <div className="small muted">Issued by {s.signer?.issuer || '—'} · {CHAIN[s.chain?.status] || ''}
                        {s.chain?.names?.length > 1 ? ` (${s.chain.names.join(' → ')})` : ''}</div>
                      {s.signer && !s.certValidWhenSigned && <div className="small sig-problem">The certificate was not valid at the time of signing.</div>}
                      {i < result.signatures.length - 1 && <div className="xs muted">Later signatures were added after this one, as expected when several people sign.</div>}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="xs muted">DMS checks that each signature is intact and was made with the certificate it carries, issued by the
                certificate authority shown. To check the authority itself is trusted, open the PDF in Adobe Acrobat with the DICT PNPKI root
                certificates installed.</p>
            </section>
          )}

          <PdfViewer bytes={result.bytes} signatures={result.signatures} title={file?.name} />
        </div>
      )}
    </div>
  );

  if (!standalone) return body;
  return (
    <div className="verify-shell">
      <header className="verify-top">
        <img className="seal" src="/municipal-seal.png" alt="" />
        <div><b>DMS Document Management System</b><span>Municipal Government of Candoni</span></div>
        <div className="spacer" />
        <Link className="btn btn-ghost btn-sm" to="/">Sign in</Link>
      </header>
      {body}
    </div>
  );
}
