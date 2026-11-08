import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import { loadPdfjs, pdfText } from '../lib/pdfjs.js';
import { addPdfVersion, createTransitionDocument, createUploadedDocument, deleteDocument, getDocument, listDocumentTypes, setDocumentStatus, startTransitionWorkflow, startWorkflow } from '../lib/api.js';
import PersonPicker from '../components/PersonPicker.jsx';
import { THIRD_PARTY, transitionSteps } from '../lib/workflow.js';
import { APPROVERS, APPROVER_LABELS, withApprover } from '../lib/approver.js';
import { refFieldLabel } from '../lib/naming.js';
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

// Transition uploads (Settings → Transition uploads): open until the end of that day.
const transitionOpen = (settings) => Boolean(settings?.transitionUntilMs) && Date.now() < settings.transitionUntilMs;
const stepOffice = (t, docOffice) => (t.office === THIRD_PARTY ? 'Third party' : t.office || `Preparer's office${docOffice ? ` (${docOffice})` : ''}`);

export default function UploadDocument() {
  const { actor, settings, isAdmin } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const [types, setTypes] = useState(null);
  // Opened from New document with the type chosen (?type=<id>).
  const [params] = useSearchParams();
  const [typeId, setTypeId] = useState(params.get('type') || '');
  const [form, setForm] = useState({ title: '', fund: '', notes: '', refNo: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  // Already partway through its route (transition): who prepared it, the step it is at, the steps
  // before (who, when, numbers), this step (number, signed), choices, hold.
  const [tr, setTr] = useState({ on: false, preparer: null, stage: 0, done: [], numbers: {}, signedHere: false, picks: {}, hold: false, reason: '', approver: APPROVERS[0] });
  const setT = (patch) => setTr((t) => ({ ...t, ...patch }));

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
  const route = type.route || [];
  const hasApprover = (withApprover(type).fields || []).some((f) => f.key === 'approver');
  const canTransition = transitionOpen(settings) && Boolean(type.id) && route.length > 1;
  const allowed = transitionSteps(route, tr.preparer?.office || '', actor?.office || '', isAdmin);
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'notes' || k === 'refNo' ? e.target.value : e.target.value.toUpperCase() });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (!file) throw new Error('Choose the file to upload.');
      // What the file really is, from its first bytes (a phone may let a ZIP or another file through).
      const kind = await sniffUpload(file);
      // (A ZIP goes with a document, on a checklist item or as a supplemental document, not here:
      // a document uploaded here is a PDF, with its QR code.)
      if (!kind || kind === 'application/zip') throw new Error(`${file.name}: upload a PDF, or a photo or scan (JPG or PNG). A ZIP file can be added to a document's checklist item or as a supplemental document.`);
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
      const transition = tr.on && type.id;
      if (transition) {
        if (!tr.preparer) throw new Error('Choose who prepared it.');
        if (!tr.stage) throw new Error('Choose the step it is at now.');
        if (tr.hold && !tr.reason.trim()) throw new Error('Say why it is on hold.');
      }
      const created = transition
        ? await createTransitionDocument(type, {
          ...form, title: form.title.trim(), refNo: form.refNo.trim(), fileName: file.name, contentText,
          approver: hasApprover ? tr.approver : '', preparer: tr.preparer, stage: tr.stage, done: tr.done, signedHere: tr.signedHere, numbers: tr.numbers,
        }, actor)
        : await createUploadedDocument(type, { ...form, title: form.title.trim(), refNo: form.refNo.trim(), fileName: file.name, contentText, copiedFrom }, actor);
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
      if (transition) {
        try {
          await startTransitionWorkflow(created.id, actor, settings.offices || [], {
            picks: Object.fromEntries(Object.entries(tr.picks).filter(([, v]) => v)), hold: tr.hold ? tr.reason.trim() : '',
          });
        } catch (err) {
          // (not started: back to a draft, and removed)
          const h = (await getDocument(created.id).catch(() => null))?.history || [];
          await setDocumentStatus(created.id, 'draft', actor, h).catch(() => {});
          await deleteDocument(created.id).catch(() => {});
          throw err;
        }
        navigate(`/documents/${created.id}`, { replace: true });
        return;
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
        <div className="field">
          <label className="field-label" htmlFor={`${id}-r`}>Reference No. <span className="muted">(optional)</span></label>
          <input id={`${id}-r`} value={form.refNo} maxLength={60} onChange={set('refNo')} />
          <span className="small muted">Already assigned in another system or on the paper: type it as it is. DMS keeps it as the document&apos;s reference no. (DRN) and does not assign another.</span>
        </div>
        <div className="field upload-wide">
          <label className="field-label" htmlFor={`${id}-n`}>Notes <span className="muted">(optional)</span></label>
          <input id={`${id}-n`} value={form.notes} onChange={set('notes')} />
        </div>

        {canTransition && (
          <div className="field upload-wide transition-box">
            <label className="check"><input type="checkbox" checked={tr.on} onChange={(e) => setT({ on: e.target.checked })} /> Already partway through its route</label>
            <span className="small muted">For documents prepared before DMS (2026) that some offices have already signed or acted on: it is uploaded at the
              step it is at now and goes on in DMS from there. Upload it from the office that has it now. Allowed until {settings.transitionUntil}.</span>
            {tr.on && (
              <div className="transition-fields">
                <div className="field">
                  <span className="field-label">Prepared by</span>
                  <PersonPicker value={tr.preparer} onChange={(p) => setT({ preparer: p, stage: 0 })} />
                  <span className="xs muted">The DMS user who prepared it: the document is theirs and their office&apos;s, and they are told of its progress.</span>
                </div>
                {hasApprover && (
                  <div className="field">
                    <label className="field-label" htmlFor={`${id}-ap`}>Approved or disapproved by</label>
                    <Select id={`${id}-ap`} value={tr.approver} onChange={(e) => setT({ approver: e.target.value })}>
                      {APPROVERS.map((a) => <option key={a} value={a}>{APPROVER_LABELS[a]}</option>)}
                    </Select>
                  </div>
                )}
                {tr.preparer && (
                  <div className="field">
                    <label className="field-label" htmlFor={`${id}-st`}>It is now at</label>
                    <Select id={`${id}-st`} value={String(tr.stage || '')} onChange={(e) => setT({ stage: Number(e.target.value) || 0 })}>
                      <option value="">Choose the step…</option>
                      {route.map((t, i) => (i > 0 && allowed[i]
                        ? <option key={i} value={i}>Step {i + 1}: {stepOffice(t, tr.preparer.office)}{t.action ? ` (${t.action})` : ''}</option> : null))}
                    </Select>
                    {!allowed.some(Boolean) && <span className="xs sig-problem">No step of this route is at your office: the office that has it now (or the Records Officer) uploads it.</span>}
                  </div>
                )}
                {tr.stage > 0 && (
                  <>
                    <div className="field-label">Done outside DMS</div>
                    <ol className="transition-steps">
                      {route.slice(0, tr.stage).map((t, i) => (
                        <li key={i}>
                          <b>Step {i + 1}: {stepOffice(t, tr.preparer.office)}</b>{t.action && <span className="small muted"> · {t.action}</span>}
                          <div className="row gap wrap">
                            <input aria-label={`Step ${i + 1}: done by`} placeholder="Who acted" value={tr.done[i]?.by || ''} maxLength={120}
                              onChange={(e) => { const done = [...tr.done]; done[i] = { ...done[i], by: e.target.value }; setT({ done }); }} />
                            <input type="date" aria-label={`Step ${i + 1}: date`} value={tr.done[i]?.date || ''}
                              onChange={(e) => { const done = [...tr.done]; done[i] = { ...done[i], date: e.target.value }; setT({ done }); }} />
                            {t.assign?.field && (
                              <input aria-label={refFieldLabel(t.assign.field, type.fields)} placeholder={refFieldLabel(t.assign.field, type.fields)} value={tr.numbers[t.assign.field] || ''} maxLength={60}
                                onChange={(e) => setT({ numbers: { ...tr.numbers, [t.assign.field]: e.target.value } })} />
                            )}
                            {(t.alternates || []).length > 0 && (
                              <Select aria-label={`Step ${i + 1}: office`} value={tr.picks[i] || t.office} onChange={(e) => setT({ picks: { ...tr.picks, [i]: e.target.value } })}>
                                {[t.office, ...t.alternates].map((o) => <option key={o} value={o}>{o}</option>)}
                              </Select>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <span className="xs muted">Who acted on each step and the date (both optional), as on the paper{route.slice(0, tr.stage).some((t) => t.assign?.field) ? ', and the reference no. a step gave' : ''}.</span>
                    {(() => {
                      const t = route[tr.stage];
                      return (
                        <div className="transition-now">
                          <div className="field-label">Step {tr.stage + 1}: {stepOffice(t, tr.preparer.office)} (now)</div>
                          {(t.alternates || []).length > 0 && (
                            <Select aria-label="Office handling it now" value={tr.picks[tr.stage] || t.office} onChange={(e) => setT({ picks: { ...tr.picks, [tr.stage]: e.target.value } })}>
                              {[t.office, ...t.alternates].map((o) => <option key={o} value={o}>{o}</option>)}
                            </Select>
                          )}
                          {t.office === THIRD_PARTY && (
                            <PersonPicker external value={tr.picks[tr.stage] ? { ...tr.picks[tr.stage], displayName: tr.picks[tr.stage].name } : null}
                              onChange={(p) => setT({ picks: { ...tr.picks, [tr.stage]: p ? { uid: p.uid, name: p.displayName || p.email } : null } })} />
                          )}
                          {t.assign?.field && (
                            <div className="field">
                              <label className="field-label" htmlFor={`${id}-now-no`}>{refFieldLabel(t.assign.field, type.fields)} <span className="muted">(if already given)</span></label>
                              <input id={`${id}-now-no`} value={tr.numbers[t.assign.field] || ''} maxLength={60} onChange={(e) => setT({ numbers: { ...tr.numbers, [t.assign.field]: e.target.value } })} />
                              <span className="xs muted">Empty: this office assigns it in DMS, from its series (Workflow → Last number used).</span>
                            </div>
                          )}
                          {(t.sign || t.approval || /mayor/i.test(t.office || '')) && (
                            <label className="check"><input type="checkbox" checked={tr.signedHere} onChange={(e) => setT({ signedHere: e.target.checked })} /> This office already signed it on the paper</label>
                          )}
                          <label className="check"><input type="checkbox" checked={tr.hold} onChange={(e) => setT({ hold: e.target.checked })} /> It is on hold at this office</label>
                          {tr.hold && <input aria-label="Why it is on hold" value={tr.reason} maxLength={300} onChange={(e) => setT({ reason: e.target.value })} />}
                        </div>
                      );
                    })()}
                    {route.slice(tr.stage + 1).map((t, j) => (t.office === THIRD_PARTY ? (
                      <div className="field" key={j}>
                        <span className="field-label">Step {tr.stage + j + 2}: third party</span>
                        <PersonPicker external value={tr.picks[tr.stage + j + 1] ? { ...tr.picks[tr.stage + j + 1], displayName: tr.picks[tr.stage + j + 1].name } : null}
                          onChange={(p) => setT({ picks: { ...tr.picks, [tr.stage + j + 1]: p ? { uid: p.uid, name: p.displayName || p.email } : null } })} />
                      </div>
                    ) : null))}
                  </>
                )}
              </div>
            )}
          </div>
        )}

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

