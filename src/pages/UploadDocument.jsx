import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { loadPdfjs, pdfText } from '../lib/pdfjs.js';
import { addPdfVersion, createUploadedDocument, deleteDocument, getDocument, listDocumentTypes, setDocumentStatus, startWorkflow } from '../lib/api.js';
import Select from '../components/Select.jsx';
import { verifyUrl } from '../lib/qr.js';
import { withDmsQr } from '../lib/qrStamp.js';
import { imageToPdf } from '../lib/imagePdf.js';
import { fundsOf } from '../lib/defaults.js';
import { staleReload } from '../lib/freshness.js';
import { sniffUpload } from '../lib/sniff.js';

// A document that is not prepared in DMS but already exists as a file: a scanned OBR, a letter,
// a PDF made in another system. It gets a DMS control number, its file becomes its PDF (a photo
// or scan is turned into one), and it follows the route of its type like a prepared document.
const OTHER = { id: '', code: 'DOC', name: 'Other document', fields: [], steps: [], processing: [], template: '' };
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const size = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function UploadDocument() {
  const { actor, settings } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const [types, setTypes] = useState(null);
  // Opened from New document with the type chosen (?type=<id>).
  const [params] = useSearchParams();
  const [typeId, setTypeId] = useState(params.get('type') || '');
  const [form, setForm] = useState({ title: '', fund: '', notes: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  useEffect(() => { listDocumentTypes({ activeOnly: true }).then(setTypes).catch((e) => setError(e.message)); }, []);
  // Copy as new draft of an uploaded document (?copy=<id>): its type, payee, fund and notes.
  const copyId = params.get('copy') || '';
  const [copiedFrom, setCopiedFrom] = useState(null);
  useEffect(() => {
    if (!copyId) return;
    getDocument(copyId).then((d) => {
      if (!d) return;
      setCopiedFrom({ id: copyId, controlNo: d.controlNo || '' });
      setTypeId(d.typeId || '');
      setForm({ title: d.title || '', fund: d.data?.fund || '', notes: d.data?.notes || '' });
    }).catch((e) => setError(e.message));
  }, [copyId]);
  const type = (types || []).find((t) => t.id === typeId) || OTHER;
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'notes' ? e.target.value : e.target.value.toUpperCase() });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (!file) throw new Error('Choose the file to upload.');
      // What the file really is, from its first bytes (a phone may let a ZIP or another file through).
      const kind = await sniffUpload(file);
      if (!kind) throw new Error(`${file.name}: upload a PDF, or a photo or scan (JPG or PNG), not a ZIP or another kind of file.`);
      if (file.size > 25 * 1024 * 1024) throw new Error('The file is larger than 25 MB.');
      if (!form.title.trim()) throw new Error('Type the payee or subject.');
      setBusy('Preparing the PDF…');
      const pdf = kind === 'application/pdf' ? new Uint8Array(await file.arrayBuffer()) : await imageToPdf(new File([file], file.name, { type: kind }));
      setBusy('Saving…');
      // What the upload needs, loaded before the document is created (a tab left open across a new
      // deploy fails here, with nothing created, and reloads).
      await Promise.all([loadPdfjs(), import('pdf-lib'), import('../lib/signing.js'), import('../lib/qr.js')]);
      const contentText = kind === 'application/pdf' ? await pdfText(pdf) : '';
      // A draft until its file is stored: if anything below fails, the draft is removed again.
      const created = await createUploadedDocument(type, { ...form, title: form.title.trim(), fileName: file.name, contentText, copiedFrom }, actor);
      try {
        // The QR code of its public check page on every page (lib/qrStamp.js: also on a signed PDF,
        // in an update after its signatures, where the PDF allows it).
        setBusy('Adding the QR code…');
        const { bytes: stamped } = await withDmsQr(pdf, verifyUrl(created.id), ['Scan to verify', created.controlNo]);
        await addPdfVersion(created.id, stamped, actor, { kind: 'uploaded', onProgress: (x) => setBusy(`Uploading… ${Math.round(x * 100)}%`) });
        await setDocumentStatus(created.id, 'complete', actor, (await getDocument(created.id))?.history || [], {}, file.name);
      } catch (err) {
        await deleteDocument(created.id).catch(() => {});
        throw err;
      }
      // It follows its route (Administration > Workflow) at once, like a document converted to PDF.
      if ((type.route || type.processing || []).length) await startWorkflow(created.id, type, actor, settings.offices || []);
      navigate(`/documents/${created.id}`, { replace: true });
    } catch (err) {
      if (staleReload(err)) return;
      setError(err.message);
      setBusy('');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/new">New document</Link> / Upload</div>
          <h1>Upload a document</h1>
        </div>
      </div>
      {copiedFrom && <div className="alert-info">Copied from <Link to={`/documents/${copiedFrom.id}`}>{copiedFrom.controlNo}</Link>: choose the file of the new document.</div>}
      <form className="card upload-form" onSubmit={submit}>
        <div className="field upload-wide">
          <label className="field-label" htmlFor={`${id}-t`}>Document type</label>
          <Select id={`${id}-t`} value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={!types}>
            <option value="">Other document (no workflow)</option>
            {(types || []).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
          </Select>
          <span className="small muted">{type.id
            ? 'It follows the workflow set for this type in Administration → Workflow.'
            : 'Kept in DMS with a control number; it is not routed.'}</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-s`}>Payee / Subject</label>
          <input id={`${id}-s`} className="caps" value={form.title} onChange={set('title')} required />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-f`}>Fund <span className="muted">(optional)</span></label>
          <Select id={`${id}-f`} value={form.fund} onChange={(e) => setForm({ ...form, fund: e.target.value })}>
            <option value="">—</option>
            {fundsOf(settings).map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
        <div className="field upload-wide">
          <label className="field-label" htmlFor={`${id}-n`}>Notes <span className="muted">(optional)</span></label>
          <input id={`${id}-n`} value={form.notes} onChange={set('notes')} />
        </div>

        <div className="field upload-wide">
          <span className="field-label">File</span>
          {file ? (
            <div className="file-chosen">
              <span className="file-icon"><Icon name="doc" /></span>
              <div className="file-meta">
                <b>{file.name}</b>
                <span className="small muted">{file.type === 'application/pdf' ? 'PDF' : 'Picture: becomes a PDF'} · {size(file.size)}</span>
              </div>
              <label className="btn btn-ghost btn-sm">
                Change
                <input type="file" hidden accept={ACCEPT} onChange={(e) => e.target.files[0] && setFile(e.target.files[0])} />
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>Remove</button>
            </div>
          ) : (
            <label className={`drop-zone${drag ? ' over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}>
              <input id={`${id}-file`} type="file" hidden accept={ACCEPT} onChange={(e) => setFile(e.target.files[0] || null)} />
              <span className="drop-icon"><Icon name="new" /></span>
              <b>Choose a file</b>
              <span className="small muted">or drop it here · PDF, or a photo or scan (JPG, PNG) · up to 25 MB</span>
            </label>
          )}
          <span className="small muted">A PDF signed elsewhere keeps its signatures; DMS shows and checks them.</span>
        </div>

        {error && <div className="alert upload-wide">{error}</div>}
        <div className="upload-actions upload-wide">
          <Link className="btn btn-ghost" to="/documents">Cancel</Link>
          <button className="btn btn-primary" disabled={!!busy || !file}>{busy || 'Upload document'}</button>
        </div>
      </form>
    </div>
  );
}

