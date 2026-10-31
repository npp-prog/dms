import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BASIS_VERSION, addPdfVersion, checkStorage, documentBasis, getPdfBytes, getSavedCertificate, getSavedCertificateBytes, getSavedMark, setDocumentStatus, startWorkflow, editRefNo,
} from '../lib/api.js';
import { addNotes, checkSignedVersion, isValidAt, noteBox, readCertificate, readSignatures, signPdf, stampDate, wrapNote } from '../lib/signing.js';
import { liveFiles, refStampMissing, refUndoBase, withdrawnFiles } from '../lib/workflow.js';
import { byOffice, missingFields } from '../lib/forms.js';
import { markPixels } from '../lib/markImage.js';
import { certId, forgetPassword, rememberedPassword, rememberedStatus } from '../lib/rememberPassword.js';
import { documentPdf, pdfFileName } from './printables.jsx';

// Mark sizes in points (width, height): small fits a DV signature line.
const MARK_SIZES = { S: [110, 30], M: [150, 42], L: [200, 56] };
const MARK_LABELS = { S: 'Small', M: 'Medium', L: 'Large' };
// Font sizes (points) of text added with a signature.
const NOTE_SIZES = { S: 8, M: 10, L: 12 };

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const readFile = (file) => file.arrayBuffer().then((b) => new Uint8Array(b));

function saveAs(bytes, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// The document as a PDF and its digital signatures (DICT PNPKI). The preparer converts the
// finished document to PDF; then each signatory, while the document is in their office, signs
// it in DMS with their certificate file, or signs it in Adobe Acrobat and uploads it back.
// Every version is kept; the newest is the current PDF.
export default function PdfCard({ docData, type, settings, actor, canConvert, canSign, signStep = true, reason, onChanged, onLoaded, onView, placements = {}, onPlacing }) {
  const id = useId();
  const files = docData.pdf?.files || [];
  const current = files.at(-1);
  // Versions before the newest converted (or uploaded) PDF are superseded by it.
  const lastNew = Math.max(0, ...files.map((f, i) => (f.kind === 'generated' || f.kind === 'uploaded' ? i : 0)));
  const signedFiles = liveFiles(files).filter((f) => f.i >= lastNew && (f.kind === 'signed' || f.kind === 'esigned'));
  const withdrawn = withdrawnFiles(files);
  const [bytes, setBytes] = useState(null);
  const made = useRef({}); // path -> bytes of versions made in this page
  const [signatures, setSignatures] = useState(null);
  const [stale, setStale] = useState(false);
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [password, setPassword] = useState('');
  const [why, setWhy] = useState(reason || '');
  // Registered once in My Profile: the user's certificate (null: none) and signature mark.
  const [saved, setSaved] = useState(undefined);
  // The signature mark: a picture of the signatory's signature, placed on the face of the PDF.
  const [mark, setMark] = useState(undefined); // PNG bytes (null: none yet)
  const [useMark, setUseMark] = useState(true);
  const [size, setSize] = useState('M');
  // Text the signatory adds anywhere on the PDF with their signature (e.g. "Approved for payment").
  const [addText, setAddText] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSize, setNoteSize] = useState('M');
  const [target, setTarget] = useState('mark'); // what a tap on the PDF places
  const [refSize, setRefSize] = useState('M');
  const [refEdit, setRefEdit] = useState(null); // { value, date } while changing the assigned no.
  const placement = placements.mark;

  // Load the current PDF and check every signature in it: once per version (not again when the
  // document is reloaded after another action).
  useEffect(() => {
    let live = true;
    setBytes(null); setSignatures(null);
    if (current) {
      // A version already here (made in this page, or downloaded before): not downloaded again.
      (made.current[current.path] ? Promise.resolve(made.current[current.path]) : getPdfBytes(current.path))
        .then((b) => {
          made.current[current.path] = b;
          if (live) { const s = readSignatures(b); setBytes(b); setSignatures(s); onLoaded?.({ path: current.path, bytes: b, signatures: s }); }
        })
        .catch((e) => live && setError(`Could not open the PDF: ${e.message}`));
    }
    return () => { live = false; };
  }, [current?.path]);
  // Is the PDF still the document as it is? Only bases computed the current way are compared;
  // older ones could differ in how, not what.
  useEffect(() => {
    let live = true;
    documentBasis(docData).then((b) => live && setStale(docData.pdf?.basisV === BASIS_VERSION && Boolean(docData.pdf?.basis) && b !== docData.pdf.basis));
    return () => { live = false; };
  }, [docData]);
  useEffect(() => setWhy(reason || ''), [reason]);
  useEffect(() => {
    // Known up front: it decides how this person signs (PNPKI, or an e-signature without one).
    if (canSign && saved === undefined) getSavedCertificate(actor.uid).then(setSaved).catch((e) => { setSaved(null); setError(e.message); });
  }, [canSign, saved, actor.uid]);
  useEffect(() => {
    if ((mode === 'sign' || mode === 'esign') && mark === undefined) getSavedMark(actor.uid).then(setMark).catch((e) => { setMark(null); setError(e.message); });
  }, [mode, mark, actor.uid]);
  const [markUrl, setMarkUrl] = useState('');
  useEffect(() => {
    if (!mark) { setMarkUrl(''); return undefined; }
    const url = URL.createObjectURL(new Blob([mark], { type: 'image/png' }));
    setMarkUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mark]);
  // An e-signature (no PNPKI certificate) is the signature mark itself: always placed.
  const esign = mode === 'esign';
  const placingMark = (mode === 'sign' && Boolean(mark) && useMark) || (esign && Boolean(mark));
  // Has a PNPKI certificate registered (undefined while checking).
  const hasCert = saved === undefined ? undefined : Boolean(saved);
  // Reference nos. this office assigned at its step (e.g. the DV No.): shown on its signature.
  const wf = docData.workflow;
  const myRefs = Object.values(docData.refNos || {})
    .filter((r) => !r.of && wf?.state === 'in-progress' && r.stage === wf.stage && (!r.filled || /no\.?$/i.test(r.label)))
    .map((r) => `${r.label} ${r.value}`);
  // A password remembered on this device (My Profile): sign without typing it.
  const [remembered, setRemembered] = useState(null);
  const [typeIt, setTypeIt] = useState(false);
  useEffect(() => {
    if (mode === 'sign' && saved) rememberedStatus(actor.uid, certId(saved)).then(setRemembered);
  }, [mode, saved, actor.uid]);
  const useRemembered = Boolean(remembered) && !typeIt;
  const noteLines = useMemo(() => wrapNote(noteText), [noteText]);
  const placingText = (mode === 'sign' || esign) && addText && noteLines.length > 0;
  // The reference no. this office assigned (e.g. the DV No.): it goes on the face of the PDF, where
  // they tap, with their signature or stamped on its own; the step is released only once it is.
  const pendingRef = canSign ? refStampMissing(docData) : null;
  const refLines = pendingRef ? [`${pendingRef.label} ${pendingRef.value}`, ...(pendingRef.date ? [`Date: ${new Date(`${pendingRef.date}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' })}`] : [])] : [];
  const placingRef = Boolean(pendingRef) && (mode === 'sign' || esign || mode === 'stamp');
  const active = [placingMark && 'mark', placingText && 'text', placingRef && 'ref'].filter(Boolean);
  const tapFor = active.includes(target) ? target : active[0];
  const refNote = () => ({ page: placements.ref.page, rect: placements.ref.rect, lines: refLines, size: NOTE_SIZES[refSize] });
  // Ask the viewer to take taps for the mark, the text and the reference no.
  useEffect(() => {
    if (!active.length) { onPlacing?.(null); return; }
    const [w, h] = MARK_SIZES[size];
    const name = esign ? actor.displayName || actor.email : saved ? saved.name : 'Your name';
    const box = noteBox(noteLines, NOTE_SIZES[noteSize]);
    onPlacing?.({
      target: tapFor,
      items: {
        mark: placingMark ? { w, h, preview: markUrl, label: [esign ? 'e-signature' : 'Digitally signed by', name, ...myRefs, stampDate()].join('\n'), hint: 'Tap the page where your signature mark goes (e.g. the Signature line of your box).' } : null,
        text: placingText ? { ...box, label: noteLines.join('\n'), size: NOTE_SIZES[noteSize], hint: 'Tap the page where your text goes.' } : null,
        ref: placingRef ? { ...noteBox(refLines, NOTE_SIZES[refSize]), label: refLines.join('\n'), size: NOTE_SIZES[refSize], hint: `Tap the page where the ${pendingRef.label} goes.` } : null,
      },
    });
  }, [active.join(), tapFor, size, markUrl, saved, esign, myRefs.join(), noteLines.join('\n'), noteSize, refLines.join('\n'), refSize]);

  // The assigned no. is suggested by DMS; the office may change it before it is on the PDF.
  const saveRef = (e) => {
    e.preventDefault();
    run('Saving…', async () => {
      await editRefNo(docData.id, actor, { stage: wf.stage, value: refEdit.value, date: refEdit.date });
      setRefEdit(null);
      onChanged();
    });
  };

  // Already on the PDF: to change it, go back to the PDF from before it went on (DMS keeps every
  // version; the ones in between are withdrawn), then edit it and put it on again.
  const undoBase = canSign ? refUndoBase(docData) : -1;
  const placedRef = undoBase >= 0 ? docData.refNos[wf.steps[wf.stage].assign.field] : null;
  const undoRef = () => window.confirm(`Take the ${placedRef.label} off the PDF to change it? The PDF goes back to version ${undoBase + 1}, from before it was put on: anything added at this step since (such as your signature) comes off too and is made again. Every version stays under Versions.`) && run('Going back…', async () => {
    const base = made.current[files[undoBase].path] || await getPdfBytes(files[undoBase].path);
    made.current[(await addPdfVersion(docData.id, base, actor, { kind: 'restored', restores: undoBase, onProgress: uploading, reason: `To change the ${placedRef.label.replace(/\.$/, '')}` })).path] = base;
    onView?.();
    setNotice(`The ${placedRef.label.replace(/\.$/, '')} is off the PDF. Click Edit to change it, then put it on again.`);
    onChanged();
  });

  // An e-signature, for a signatory without a PNPKI certificate: their signature mark with the words
  // e-signature, their name and the date, locked on the PDF. It is not a digital signature: it
  // shows who signed in DMS (recorded with the version) but carries no certificate.
  const eSign = () => run('Signing…', async () => {
    if (hasCert) throw new Error('You have a PNPKI certificate: sign with it (Sign with PNPKI).');
    if (!mark) throw new Error('Add your signature mark in My Profile first.');
    if (!placement) throw new Error('Tap the PDF where your signature mark goes.');
    if (placingText && !placements.text) throw new Error('Tap the PDF where your text goes, or untick "Add text on the PDF".');
    if (placingRef && !placements.ref) throw new Error(`Tap the PDF where the ${pendingRef.label} goes.`);
    const name = actor.displayName || actor.email;
    const at = new Date();
    const notes = [
      ...(placingText ? [{ page: placements.text.page, rect: placements.text.rect, lines: noteLines, size: NOTE_SIZES[noteSize] }] : []),
      ...(placingRef ? [refNote()] : []),
    ];
    const out = await addNotes(bytes, notes, { name, at, mark: { page: placement.page, rect: placement.rect, image: await markPixels(mark), lines: ['e-signature', name, ...myRefs, stampDate(at)] } });
    made.current[(await addPdfVersion(docData.id, out, actor, {
      kind: 'esigned', method: 'dms', onProgress: uploading, reason: why.trim() || 'e-signature', note: placingText ? noteLines.join(' ') : '',
      refStage: placingRef ? wf.stage : null, signer: { name, esign: true, pnpki: false, signedAt: at.toISOString() },
    })).path] = out;
    setMode(''); setAddText(false); setNoteText('');
    onView?.();
    setNotice(`E-signed by ${name}.`);
    onChanged();
  });

  // The reference no. stamped on its own (a step that does not sign, or signed in Acrobat).
  const stampRef = () => run('Putting it on the PDF…', async () => {
    if (!placements.ref) throw new Error(`Tap the PDF where the ${pendingRef.label} goes.`);
    const out = await addNotes(bytes, [refNote()], { name: actor.displayName || actor.email });
    made.current[(await addPdfVersion(docData.id, out, actor, { kind: 'stamped', refStage: wf.stage, onProgress: uploading, reason: refLines[0] })).path] = out;
    setMode('');
    onView?.();
    setNotice(`${refLines[0]} is on the PDF.`);
    onChanged();
  });

  // Signed: the current PDF (not a superseded one).
  const signed = (signatures || []).length > 0 || signedFiles.length > 0;
  const run = async (label, fn) => {
    if (busy) return; // e.g. Enter pressed again while signing
    setBusy(label); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const uploading = (p) => setBusy(`Saving… ${Math.round(p * 100)}%`);
  // A new PDF of a signed document supersedes it: every signature is made again on the new one.
  const convert = () => signed && !window.confirm('Make a new PDF of the document as it is now? It replaces the signed PDF (kept under Versions as superseded), and everyone on the route signs again, starting with the first signatory.') ? null : run('Checking file storage…', async () => {
    // Back in draft after a return for revision: complete it first (its required fields filled in).
    if (docData.status === 'draft') {
      const missing = missingFields((type.fields || []).filter((f) => !byOffice(f)), docData.data);
      if (missing.length) throw new Error(`Fill in ${missing.map((f) => f.label).join(', ')} first (Edit), then make the new PDF.`);
      await setDocumentStatus(docData.id, 'complete', actor, docData.history || [], {}, 'for a new PDF');
    }
    await checkStorage(docData.id); // fails in seconds if Storage is not set up, before drawing
    const blob = await documentPdf(type, docData, settings, setBusy);
    const pdf = new Uint8Array(await blob.arrayBuffer());
    uploading(0);
    const file = await addPdfVersion(docData.id, pdf, actor, { kind: 'generated', basis: await documentBasis(docData), onProgress: uploading });
    made.current[file.path] = pdf;
    // The PDF now follows the document's route (Administration > Workflow).
    if (!docData.workflow) await startWorkflow(docData.id, type, actor, settings.offices || []);
    setNotice(docData.workflow
      ? (signed ? 'New PDF made: it supersedes the signed one. Sign it if your office signs, then route it: each office on the route signs it again.' : 'Converted to PDF again.')
      : 'Converted to PDF. It now follows its workflow: sign it if your office signs, then route it to the next office.');
    onChanged();
  });

  const signHere = () => run('Signing…', async () => {
    if (!saved) throw new Error('Register your certificate in My Profile first.');
    const pw = useRemembered ? await rememberedPassword(actor.uid, certId(saved)) : password;
    if (!pw) throw new Error('Type your certificate password.');
    const key = await getSavedCertificateBytes(actor.uid);
    let cert;
    try {
      cert = readCertificate(key, pw);
    } catch (e) {
      // The remembered password no longer opens the certificate: forget it and ask.
      if (useRemembered) { await forgetPassword(actor.uid); setRemembered(null); throw new Error('Your remembered password no longer works. Type your certificate password.'); }
      throw e;
    }
    if (!isValidAt(cert)) throw new Error(`Your certificate is not valid today (valid ${when(cert.notBefore)} to ${when(cert.notAfter)}). Renew it with DICT.`);
    if (!cert.pnpki && !window.confirm(`This certificate was issued by "${cert.issuer}", not by the DICT PNPKI. Sign with it anyway?`)) return;
    if (placingMark && !placement) throw new Error('Tap the PDF where your signature mark goes, or untick "Place my signature mark".');
    if (placingText && !placements.text) throw new Error('Tap the PDF where your text goes, or untick "Add text on the PDF".');
    if (placingRef && !placements.ref) throw new Error(`Tap the PDF where the ${pendingRef.label} goes.`);
    // The signature appears where the mark was placed; clicking it shows its certificate.
    const visible = placingMark
      ? { page: placement.page, rect: placement.rect, image: await markPixels(mark), lines: ['Digitally signed by', cert.name, ...myRefs, stampDate()] }
      : null;
    const note = placingText ? { page: placements.text.page, rect: placements.text.rect, lines: noteLines, size: NOTE_SIZES[noteSize] } : null;
    const out = await signPdf(bytes, key, pw, { reason: why.trim(), location: settings.lguName || 'Municipal Government of Candoni', name: cert.name, contactInfo: cert.email, mark: visible, note, notes: placingRef ? [refNote()] : [] });
    const check = checkSignedVersion(bytes, out);
    if (!check.ok) throw new Error(check.error);
    made.current[(await addPdfVersion(docData.id, out, actor, { kind: 'signed', method: 'dms', onProgress: uploading, reason: why.trim(), note: note ? noteLines.join(' ') : '', refStage: placingRef ? wf.stage : null, signer: { ...signerOf(check.added.at(-1)), name: cert.name } })).path] = out;
    setPassword(''); setMode(''); setAddText(false); setNoteText('');
    onView?.();
    setNotice(`Signed by ${cert.name}.`);
    onChanged();
  });

  const upload = (file) => run('Checking…', async () => {
    if (!file) return;
    const out = await readFile(file);
    const check = checkSignedVersion(bytes, out);
    if (!check.ok) throw new Error(check.error);
    const last = check.added.at(-1);
    made.current[(await addPdfVersion(docData.id, out, actor, { kind: 'signed', method: 'upload', onProgress: uploading, reason: why.trim(), signer: signerOf(last) })).path] = out;
    setMode('');
    setNotice(`Signature of ${last.signer?.name || 'the signatory'} checked and saved.`);
    onChanged();
  });


  return (
    <section className="card pdf-card">
      <div className="card-head">
        <h3>PDF and digital signatures</h3>
        {current && <span className={`badge ${signed ? 'badge-green' : 'badge-blue'}`}>{signed ? `${(signatures || []).length || ''} signed`.trim() : 'Not signed yet'}</span>}
      </div>
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {!current && (
        <>
          <p className="small muted">When the document is final, convert it to PDF. The signatories then sign the PDF with their
            DICT PNPKI digital signature as it moves through their offices.</p>
          {canConvert
            ? <button className="btn btn-primary" disabled={!!busy} onClick={convert}>{busy || 'Convert to PDF'}</button>
            : <p className="small muted">{docData.status === 'draft' ? 'Mark the document complete first.' : 'The preparer converts it to PDF.'}</p>}
        </>
      )}

      {current && (
        <>
          {stale && !signed && (
            <div className="alert-info small">The document was changed after it was converted.
              {canConvert && <> <button className="link" disabled={!!busy} onClick={convert}>Convert again</button></>}</div>
          )}
          {stale && signed && <div className="alert-info small">The document was changed after it was signed. The signed PDF shows it as it was signed.</div>}
          {canConvert && (stale || docData.status === 'draft' || (signed && wf?.events?.some((e) => e.type === 'returned'))) && (
            <div className="mark-box regen-box">
              <div className="field-label">Make a new PDF</div>
              <p className="small muted">{docData.status === 'draft'
                ? 'Back with you for revision. When the changes are done, make a new PDF: it is marked complete and goes on along its route.'
                : 'Of the document as it is now.'}{signed ? ' It supersedes the signed PDF, and everyone on the route signs again.' : ''}
                {' '}<Link to={`/documents/${docData.id}/edit`}>Edit the document</Link></p>
              <div><button className="btn btn-primary btn-sm" disabled={!!busy} onClick={convert}>{busy || 'Make a new PDF'}</button></div>
            </div>
          )}

          {!signatures && !error && <div className="spinner" />}
          {signatures && (
            signatures.length === 0
              ? <p className="small muted">No signature yet.</p>
              : (
                <ol className="sig-list">
                  {signatures.map((s, i) => (
                    <li key={i} className={s.valid ? 'sig-ok' : 'sig-bad'}>
                      <span className="sig-mark">{s.valid ? '✓' : '✗'}</span>
                      <div>
                        <b>{s.signer?.name || 'Unknown signer'}</b>
                        {s.signer && (s.signer.pnpki
                          ? <span className="badge badge-green">DICT PNPKI</span>
                          : <span className="badge badge-yellow" title={s.signer.issuer}>Not PNPKI</span>)}
                        <div className="small muted">
                          {[s.signedAt && when(s.signedAt), signedFiles[i]?.reason].filter(Boolean).join(' · ')}
                        </div>
                        {signedFiles[i]?.note && <div className="small">Added text: <i>{signedFiles[i].note}</i></div>}
                        <div className="small muted">Issued by {s.signer?.issuer || '—'}{s.signer?.email ? ` · ${s.signer.email}` : ''}</div>
                        {!s.valid && <div className="small sig-problem">{s.problem}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )
          )}

          {pendingRef && bytes && (
            <div className="mark-box ref-box">
              <div className="field-label">Put the {pendingRef.label} on the PDF</div>
              {refEdit ? (
                <form className="ref-edit" onSubmit={saveRef}>
                  <label className="field"><span className="field-label">{pendingRef.label}</span>
                    <input value={refEdit.value} autoFocus onChange={(e) => setRefEdit({ ...refEdit, value: e.target.value })} /></label>
                  {wf.steps[wf.stage].assign?.dateField && (
                    <label className="field"><span className="field-label">Date</span>
                      <input type="date" value={refEdit.date} onChange={(e) => setRefEdit({ ...refEdit, date: e.target.value })} /></label>
                  )}
                  <div className="row gap">
                    <button className="btn btn-primary btn-sm" disabled={!!busy || !refEdit.value.trim()}>{busy || 'Save'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefEdit(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="ref-value">
                  <b>{refLines.join(' · ')}</b>
                  <button type="button" className="link small" disabled={!!busy} onClick={() => setRefEdit({ value: pendingRef.value, date: pendingRef.date })}>Edit</button>
                </div>
              )}
              <div className="row gap wrap small ref-size">
                Size:
                {Object.keys(NOTE_SIZES).map((k) => (
                  <button key={k} type="button" className={`chip${refSize === k ? ' active' : ''}`} onClick={() => setRefSize(k)}>{MARK_LABELS[k]}</button>
                ))}
              </div>
              {placingRef ? (
                <p className={`small ${placements.ref ? 'muted' : 'mark-todo'}`}>{placements.ref
                  ? `Placed on page ${placements.ref.page + 1}.${tapFor === 'ref' ? ' Tap the PDF again to move it.' : ''}`
                  : 'Tap the PDF where it goes, anywhere on the page.'}</p>
              ) : (
                <p className="small muted">{wf.steps[wf.stage].sign
                  ? 'It goes on the PDF with your signature: click Sign with PNPKI and tap where it goes. Signing in Acrobat instead? Stamp it here first.'
                  : 'Click Place it, tap the PDF where it goes, then stamp it.'}</p>
              )}
              {mode === 'stamp' ? (
                <div className="row gap">
                  <button className="btn btn-primary btn-sm" disabled={!!busy || !placements.ref} onClick={stampRef}>{busy || 'Stamp it on the PDF'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setMode('')}>Cancel</button>
                </div>
              ) : mode !== 'sign' && <div><button className="btn btn-ghost btn-sm" onClick={() => { setMode('stamp'); setTarget('ref'); }}>Place it</button></div>}
            </div>
          )}

          {placedRef && bytes && !mode && (
            <div className="ref-value small ref-done">
              <span>{placedRef.label} <b>{placedRef.value}</b> is on the PDF.</span>
              <button type="button" className="link small" disabled={!!busy} onClick={undoRef}>Change it</button>
            </div>
          )}

          {/* Signing first (for the signatory), then viewing and downloading as quieter links. */}
          {canSign && bytes && mode !== 'stamp' && !refEdit && (
            <div className="row gap wrap pdf-sign-actions">
              {/* One way to sign per person: with their PNPKI certificate (registered in My Profile), or
                  with an e-signature when they have none. */}
              {mode !== 'sign' && <button className={`btn btn-sm ${hasCert ? 'btn-primary' : 'btn-ghost'}`} disabled={!signStep || !hasCert} onClick={() => setMode('sign')}>Sign with PNPKI</button>}
              {mode !== 'esign' && <button className={`btn btn-sm ${hasCert === false ? 'btn-primary' : 'btn-ghost'}`} disabled={!signStep || hasCert !== false} onClick={() => setMode('esign')}>E-signature</button>}
              {mode !== 'upload' && <button className="btn btn-ghost btn-sm" disabled={!signStep || !hasCert} onClick={() => setMode('upload')}>Upload signed PDF</button>}
              {!signStep ? <span className="small muted">This step of the workflow does not sign.</span>
                : hasCert ? <span className="small muted">You have a PNPKI certificate: sign with it.</span>
                  : hasCert === false && <span className="small muted">No PNPKI certificate registered: sign with your e-signature. To sign with PNPKI, register your certificate in <Link to="/profile">My Profile</Link>.</span>}
            </div>
          )}
          <div className="pdf-links">
            <button type="button" className="link small" disabled={!bytes} onClick={() => onView?.()}>View PDF</button>
            <button type="button" className="link small" disabled={!bytes} onClick={() => saveAs(bytes, pdfFileName(type, docData))}>Download PDF</button>
          </div>

          {canSign && signStep && (mode === 'sign' || esign || mode === 'upload') && (
            <div className="sign-panel">
              <div className="field field-wide">
                <label className="field-label" htmlFor={`${id}-why`}>Reason (shown in the signature)</label>
                <input id={`${id}-why`} value={why} onChange={(e) => setWhy(e.target.value)} />
              </div>
              {((mode === 'sign' && saved) || (esign && mark)) && (
                <div className="mark-box note-box">
                  <label className="check"><input type="checkbox" checked={addText} onChange={(e) => { setAddText(e.target.checked); if (e.target.checked) setTarget('text'); }} /> Add text on the PDF</label>
                  {addText && (
                    <>
                      <textarea rows={2} value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={300}
                        aria-label="Text to add on the PDF" />
                      <div className="row gap wrap small">
                        Size:
                        {Object.keys(NOTE_SIZES).map((k) => (
                          <button key={k} type="button" className={`chip${noteSize === k ? ' active' : ''}`} onClick={() => setNoteSize(k)}>{MARK_LABELS[k]}</button>
                        ))}
                      </div>
                      {placingText && (
                        <p className={`small ${placements.text ? 'muted' : 'mark-todo'}`}>{placements.text
                          ? `Placed on page ${placements.text.page + 1}.${tapFor === 'text' ? ' Tap the PDF again to move it.' : ''}`
                          : 'Tap the PDF where the text goes: any part of the page, apart from your signature mark.'}</p>
                      )}
                      <p className="xs muted">{esign ? 'Added with your e-signature, locked on the PDF.' : 'Added with your digital signature: it is part of what you sign, and cannot be changed afterwards.'}</p>
                    </>
                  )}
                </div>
              )}
              {(mode === 'sign' || esign) && active.length > 1 && (
                <div className="row gap wrap small place-target">
                  Tapping the PDF places:
                  {active.map((k) => (
                    <button key={k} type="button" className={`chip${tapFor === k ? ' active' : ''}`} onClick={() => setTarget(k)}>
                      {{ mark: 'Signature mark', text: 'Text', ref: pendingRef?.label || 'Reference no.' }[k]}</button>
                  ))}
                </div>
              )}
              {esign ? (
                mark === undefined ? <div className="spinner" /> : !mark ? (
                  <div className="alert-info small">An e-signature is your signature mark on the PDF. Add it once in <Link to="/profile">My Profile</Link>
                    {' '}(a picture of your signature), then come back here.</div>
                ) : (
                  <>
                    <div className="mark-box">
                      <div className="field-label">E-signature</div>
                      <div className="row gap wrap mark-row"><img className="mark-preview" src={markUrl} alt="Your signature mark" /></div>
                      <div className="row gap wrap small">
                        Size:
                        {Object.keys(MARK_SIZES).map((k) => (
                          <button key={k} type="button" className={`chip${size === k ? ' active' : ''}`} onClick={() => setSize(k)}>{MARK_LABELS[k]}</button>
                        ))}
                      </div>
                      <p className={`small ${placement ? 'muted' : 'mark-todo'}`}>{placement
                        ? `Placed on page ${placement.page + 1}.${tapFor === 'mark' ? ' Tap the PDF again to move it.' : ''}`
                        : 'Tap the PDF where your signature goes, e.g. the Signature line of your box.'}</p>
                      <p className="xs muted">Your signature mark goes on the PDF with the words <b>e-signature</b>, your name and the date. It is not a
                        PNPKI digital signature: DMS records that you signed, but the PDF carries no certificate.</p>
                    </div>
                    <div className="row gap">
                      <button className="btn btn-primary" disabled={!!busy || !placement || (placingText && !placements.text) || (placingRef && !placements.ref) || (addText && !noteLines.length)} onClick={eSign}>{busy || 'Sign with e-signature'}</button>
                      <button className="btn btn-ghost" onClick={() => setMode('')}>Cancel</button>
                    </div>
                  </>
                )
              ) : mode === 'sign' ? (
                saved === undefined || mark === undefined ? <div className="spinner" /> : !saved ? (
                  <div className="alert-info small">To sign in DMS, register your PNPKI certificate once in <Link to="/profile">My Profile</Link>.
                    Or use <b>Upload signed PDF</b> to sign it in Adobe Acrobat.</div>
                ) : (
                <>
                  <div className="saved-cert">
                    <div><b>{saved.name}</b> {saved.pnpki && <span className="badge badge-green">DICT PNPKI</span>}</div>
                    <div className="small muted">Your registered certificate{saved.notAfter ? ` · valid until ${when(saved.notAfter)}` : ''}
                      {' · '}<Link to="/profile">Change in My Profile</Link></div>
                  </div>
                  <div className="mark-box">
                    <div className="field-label">Signature mark on the PDF</div>
                    {mark ? (
                      <>
                        <div className="row gap wrap mark-row">
                          <img className="mark-preview" src={markUrl} alt="Your signature mark" />
                          <label className="check"><input type="checkbox" checked={useMark} onChange={(e) => setUseMark(e.target.checked)} /> Place my signature mark</label>
                        </div>
                        {useMark && (
                          <>
                            <div className="row gap wrap small">
                              Size:
                              {Object.keys(MARK_SIZES).map((k) => (
                                <button key={k} type="button" className={`chip${size === k ? ' active' : ''}`} onClick={() => setSize(k)}>{MARK_LABELS[k]}</button>
                              ))}
                            </div>
                            <p className={`small ${placement ? 'muted' : 'mark-todo'}`}>{placement
                              ? `Placed on page ${placement.page + 1}.${tapFor === 'mark' ? ' Tap the PDF again to move it.' : ''}`
                              : 'Tap the PDF where your mark goes, e.g. the Signature line of your box.'}</p>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="small muted">No signature mark yet: the signature is added without one.
                        {' '}<Link to="/profile">Add your signature mark in My Profile</Link>.</p>
                    )}
                  </div>
                  {useRemembered ? (
                    <p className="small muted">Your password is remembered on this device until {when(remembered.until)}.
                      {' '}<button type="button" className="link" onClick={() => setTypeIt(true)}>Type it instead</button></p>
                  ) : (
                    <div className="field field-wide">
                      <label className="field-label" htmlFor={`${id}-pw`}>Certificate password</label>
                      <input id={`${id}-pw`} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && signHere()} />
                    </div>
                  )}
                  <div className="row gap">
                    <button className="btn btn-primary" disabled={!!busy || (!useRemembered && !password) || (placingMark && !placement) || (placingText && !placements.text) || (placingRef && !placements.ref) || (addText && !noteLines.length)} onClick={signHere}>{busy || 'Sign PDF'}</button>
                    <button className="btn btn-ghost" onClick={() => { setMode(''); setPassword(''); }}>Cancel</button>
                  </div>
                </>
                )
              ) : (
                <>
                  <ol className="small steps-mini">
                    <li><button className="link" onClick={() => saveAs(bytes, pdfFileName(type, docData))}>Download the current PDF</button>.</li>
                    <li>Open it in Adobe Acrobat (or Foxit) and sign it with your PNPKI certificate. Change nothing else.</li>
                    <li>Upload the signed PDF here. DMS checks that it is this PDF with your signature added.</li>
                  </ol>
                  <div className="field field-wide">
                    <label className="field-label" htmlFor={`${id}-up`}>Signed PDF</label>
                    <input id={`${id}-up`} type="file" accept="application/pdf,.pdf" disabled={!!busy} onChange={(e) => upload(e.target.files[0])} />
                  </div>
                  {busy && <div className="small muted">{busy}</div>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setMode('')}>Cancel</button>
                </>
              )}
            </div>
          )}

          <details className="small pdf-versions">
            <summary>Versions ({files.length})</summary>
            <ol>
              {files.map((f, i) => (
                <li key={f.path} className={i < lastNew || withdrawn.has(i) ? 'superseded' : ''}>
                  {f.kind === 'generated' ? 'Converted' : f.kind === 'uploaded' ? 'Uploaded' : f.kind === 'stamped' ? `${f.reason || 'Reference no.'} put on it`
                    : f.kind === 'restored' ? `Back to version ${f.restores + 1}${f.reason ? ` (${f.reason.toLowerCase()})` : ''}`
                    : f.kind === 'esigned' ? `E-signed by ${f.signer?.name || f.by}` : `Signed${f.signer?.name ? ` by ${f.signer.name}` : ''}${f.method === 'upload' ? ' (uploaded)' : ''}`}
                  {' · '}{f.by} · {when(f.at)}{i === files.length - 1 ? ' · current' : withdrawn.has(i) ? ' · taken back' : i < lastNew ? ' · superseded' : ''}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}

const signerOf = (s) => (s?.signer ? {
  name: s.signer.name, email: s.signer.email, issuer: s.signer.issuer, pnpki: s.signer.pnpki, serial: s.signer.serial, signedAt: s.signedAt,
} : null);
