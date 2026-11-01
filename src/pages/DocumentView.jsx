import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { copyDocument, deleteDocument, ensureCheck, getDocument, getTypeForDocument, saveAccountingEntries, saveDocumentLinks, saveExtraItems, getFileBytes, getPdfBytes, uploadAttachment, saveSupplements, fillStepFields, addStepFile, forwardDocument, reviewDocument, setDocumentStatus, startWorkflow, workflowAction, assignRefNo, referDocument, chooseStepOffices, setDocumentAccess, setDocumentRestricted, addPdfVersion } from '../lib/api.js';
import { assignPending, canAct, editableByPreparer, holdsPosition, isPreparer, isReceived, liveFiles, officeOf } from '../lib/workflow.js';
import { readSignatures } from '../lib/signing.js';
import { signatoriesFrom } from '../lib/signatories.js';
import { effectiveChecklist, isChecked, itemTypeCode, missingRequired } from '../lib/checklists.js';
import AccountingPanel from '../components/AccountingPanel.jsx';
import BulkDownload from '../components/BulkDownload.jsx';
import ChecklistSheet from '../components/ChecklistSheet.jsx';
import { LinkEditor, LinkList, linkText } from '../components/DocLinks.jsx';
import DocumentPreview from '../components/DocumentPreview.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ProcessingGuide from '../components/ProcessingGuide.jsx';
import WorkflowCard from '../components/WorkflowCard.jsx';
import ReviewCard from '../components/ReviewCard.jsx';
import SupplementsCard from '../components/SupplementsCard.jsx';
import PdfCard from '../components/PdfCard.jsx';
import SendPanel from '../components/SendPanel.jsx';
import AccessCard from '../components/AccessCard.jsx';
import { pdfFileName } from '../components/printables.jsx';
import { uploadSupporting } from '../lib/supporting.js';
import PdfViewer from '../components/PdfViewer.jsx';
import { verifyUrl } from '../lib/qr.js';
import { hasDmsQr, withDmsQr } from '../lib/qrStamp.js';
import { staleReload } from '../lib/freshness.js';

function downloadBytes(bytes, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Links of one checklist item on a saved document; the preparer and admins can add or remove them.
// Under a checklist item: its linked and uploaded documents, and (for the preparer) link or upload.
// Other attachments: documents that go with this one but are not on its checklist, each linked or
// uploaded like a checklist item, added without changing the checklist.
function ExtraItems({ docData, docId, actor, start, canEdit, busy, run, onOpen }) {
  const [name, setName] = useState(null);
  const extras = docData.extraItems || [];
  if (!extras.length && !canEdit) return null;
  const save = (extraItems, links, note) => run(() => saveExtraItems(docId, { extraItems, links }, actor, docData.history, note));
  const add = (e) => {
    e.preventDefault();
    const label = name.trim().replace(/\s+/g, ' ');
    if (!label) return;
    save([...extras, { id: `x${Date.now().toString(36)}`, label }], docData.links || {}, `added ${label}`);
    setName(null);
  };
  const remove = (x) => {
    if (!window.confirm(`Remove ${x.label}?`)) return;
    const { [x.id]: _gone, ...links } = docData.links || {};
    save(extras.filter((y) => y.id !== x.id), links, `removed ${x.label}`);
  };
  return (
    <div className="extra-items">
      <h4>Other attachments</h4>
      {extras.length > 0 && (
        <ul className="checklist-view">
          {extras.map((x, i) => {
            const links = docData.links?.[x.id] || [];
            return (
              <li key={x.id}>
                <span className="row gap extra-head">
                  <span>{x.label}</span>
                  {canEdit && !links.length && <button type="button" className="btn-icon" title="Remove" disabled={busy} onClick={() => remove(x)}>×</button>}
                </span>
                <ItemLinks item={x} n={start + i + 1} links={links} docId={docId} parent={{ ...docData, id: docId }} actor={actor} onOpen={onOpen} canEdit={canEdit}
                  onChange={(list, note) => save(extras, { ...(docData.links || {}), [x.id]: list }, `${x.label}: ${note}`)} />
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && (name === null
        ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setName('')}>+ Add attachment</button>
        : (
          <form className="row gap extra-add" onSubmit={add}>
            <input value={name} autoFocus maxLength={120} aria-label="What it is" placeholder="What is it?" onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>Add</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setName(null)}>Cancel</button>
          </form>
        ))}
    </div>
  );
}

// canAdd: may link or upload to it (a checklist item only once it is ticked as attached); canEdit:
// may also remove what is linked.
function ItemLinks({ item, n, links, canEdit, canAdd = canEdit, docId, parent, actor, onChange, onOpen }) {
  const [open, setOpen] = useState(false);
  const [upload, setUpload] = useState('');
  const [error, setError] = useState('');
  const add = async (file) => {
    if (!file) return;
    setError(''); setUpload('Uploading… 0%');
    try {
      const code = itemTypeCode(item);
      const l = await uploadSupporting({ parent, slot: item.id, label: item.label, code, number: n, file, actor, onStep: setUpload });
      await onChange([...links, l], linkText(l));
    } catch (e) {
      setError(e.message);
    } finally {
      setUpload('');
    }
  };
  return (
    <>
      <LinkList links={links} onOpen={onOpen && ((l, i) => onOpen(l, `${item.id}:${i}`))} onRemove={canEdit ? (i) => onChange(links.filter((_, j) => j !== i), `removed ${linkText(links[i])}`) : undefined} />
      {error && <div className="alert small">{error}</div>}
      {canAdd && (open
        ? <LinkEditor item={item} excludeId={docId} onCancel={() => setOpen(false)} onAdd={(l) => { setOpen(false); onChange([...links, l], linkText(l)); }} />
        : (
          <div className="item-actions no-print">
            <button type="button" className="link small" onClick={() => setOpen(true)}>+ Link document</button>
            {upload ? <span className="small muted">{upload}</span> : (
              <label className="link small">
                + Upload file
                <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { add(e.target.files[0]); e.target.value = ''; }} />
              </label>
            )}
          </div>
        ))}
    </>
  );
}

// An uploaded file shown in the page: a PDF page by page, a picture as it is.
function FileView({ file, bytes }) {
  const url = useMemo(() => (bytes && !/pdf/.test(file.type) ? URL.createObjectURL(new Blob([bytes], { type: file.type })) : ''), [bytes, file.type]);
  if (!bytes) return <div className="spinner" />;
  if (/pdf/.test(file.type)) return <PdfViewer bytes={bytes} signatures={readSignatures(bytes)} title={file.name} />;
  return (
    <div className="pdf-viewer">
      <div className="pdf-viewer-head"><b>{file.name}</b></div>
      <img className="file-image" src={url} alt={file.name} />
    </div>
  );
}

// A fresh page for each document (no state carried over from the one before).
export default function DocumentView() {
  const { docId } = useParams();
  return <DocumentPage key={docId} docId={docId} />;
}

function DocumentPage({ docId }) {
  const navigate = useNavigate();
  const { actor, settings, isAdmin, isSuper, isHead, isRecords, isExternal, canRefer, user, profile, folderGrant } = useAuth();
  const [docData, setDocData] = useState(null);
  const [type, setType] = useState(null);
  const [error, setError] = useState('');
  // An action that failed (release, upload, save…): shown over the page, which stays.
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('document');
  // An uploaded supporting document shown in the main area.
  const [fileView, setFileView] = useState(null);
  // A linked document from DMS shown in the page, from its own (signed) PDF, so its signatures
  // stay intact, or its form if it was not converted.
  const [linkedView, setLinkedView] = useState(null);
  const [linkKey, setLinkKey] = useState('');
  const openLinked = (link, key) => {
    setLinkKey(key || '');
    setLinkedView({ link });
    setView('linked');
    viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    (async () => {
      const d = await getDocument(link.id);
      if (!d) throw new Error('The linked document no longer exists.');
      const current = d.pdf?.files?.at(-1);
      if (current) {
        const bytes = await getPdfBytes(current.path);
        setLinkedView({ link, doc: d, bytes, signatures: readSignatures(bytes) });
      } else {
        setLinkedView({ link, doc: d, type: await getTypeForDocument(d) });
      }
    })().catch((e) => setLinkedView({ link, error: e.code === 'permission-denied' ? 'You have no access to this linked document.' : e.message }));
  };
  const openFile = (file, key) => {
    setLinkKey(key || '');
    setFileView({ file });
    setView('file');
    viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    getFileBytes(file.path).then((bytes) => setFileView({ file, bytes })).catch((e) => setFileView({ file, error: e.message }));
  };
  // The current PDF, once PdfCard has loaded it, for the viewer in the main area.
  const [pdfView, setPdfView] = useState(null);
  const viewer = useRef(null);
  const shownPdf = useRef(null); // a newly loaded PDF opens in the viewer once
  // Placing a signature mark and text added with a signature: { target, items: { mark, text } }
  // (size and preview of each) while signing, and where each was tapped ({ mark, text }).
  const [placing, setPlacing] = useState(null);
  const [placements, setPlacements] = useState({});
  const tapItem = placing?.items?.[placing.target] || null;
  const placedMarks = placing ? ['mark', 'text', 'ref'].filter((k) => placing.items[k] && placements[k])
    .map((k) => ({ ...placements[k], ...placing.items[k], id: k, kind: k === 'mark' ? 'mark' : 'text', active: k === placing.target })) : [];
  const onPlace = (p) => placing && setPlacements((cur) => ({ ...cur, [placing.target]: p }));
  // Working copy of the data while the Accounting Office fills in its part.
  const [draft, setDraft] = useState(null);

  const assigning = useRef(new Set());
  const docRef = useRef(null); // the document as last opened (this docId)
  const load = async () => {
    try {
      let d = await getDocument(docId);
      if (!d) throw new Error('Document not found.');
      // At a step that assigns a reference no. (e.g. the DV No.): the office holding it gets it on
      // opening (not an administrator who only looks at it: they can assign it in the Workflow card).
      if (d.status !== 'cancelled' && assignPending(d)
        && canAct(d, { uid: user.uid, office: profile.office, isAdmin: false, isHead, positions: profile.positions || [], grant: folderGrant })) {
        try {
          // Once per document at a time (React runs this twice in development; a reload while it runs).
          if (!assigning.current.has(docId)) {
            assigning.current.add(docId);
            try { await assignRefNo(docId, actor); } finally { assigning.current.delete(docId); }
          }
          d = (await getDocument(docId)) || d;
        } catch (e) {
          setActionError(`The reference no. could not be assigned: ${e.message}`);
        }
      }
      setDocData(d);
      docRef.current = d;
      ensureCheck(docId, d).catch(() => {}); // only those who may act on it can write it
      setDraft(d.data || {});
      setType(await getTypeForDocument(d));
    } catch (e) {
      // Opened a moment ago, no longer readable: the user routed it on (or returned it), so it has
      // left their office. Not an error: back to their Notifications, with a word on where it went.
      if (e.code === 'permission-denied' && docRef.current) {
        navigate('/notifications', { replace: true, state: { notice: `${docRef.current.controlNo || 'The document'} has left your office; it is no longer yours to open.` } });
        return;
      }
      setError(e.code === 'permission-denied'
        ? 'You do not have access to this document. Users see only the documents of their own office.'
        : e.message);
    }
  };
  useEffect(() => { docRef.current = null; load(); }, [docId]);

  if (error) return <div className="page"><div className="alert">{error}</div></div>;
  if (!docData) return <div className="page"><div className="spinner" /></div>;

  const editable = docData.status !== 'cancelled';
  // Processed (its route is done, it is in the Archive): the preparer no longer changes it.
  const notDone = docData.workflow?.state !== 'done';
  const isOwner = isPreparer(docData, { uid: user.uid, office: profile.office, grant: folderGrant });
  const wf = docData.workflow;
  // Once the document has left the preparer's office, only the offices on its route move it.
  const atPreparer = !wf || (wf.state === 'in-progress' && !wf.referral && (!officeOf(wf.steps[wf.stage], docData) || officeOf(wf.steps[wf.stage], docData) === profile.office));
  // A signed PDF is the record of what was signed: the document can no longer be edited.
  // Signatures on the current PDF (a new PDF supersedes signed ones).
  const pdfFiles = liveFiles(docData.pdf?.files);
  const hasSignature = pdfFiles.slice(Math.max(0, ...pdfFiles.map((f, i) => (f.kind === 'generated' || f.kind === 'uploaded' ? i : 0)))).some((f) => f.kind === 'signed' || f.kind === 'esigned');
  // Back with the preparer's office (returned for revision, or not yet released): the preparer
  // may change the document and convert it again, even if it was signed. The new PDF supersedes
  // the signed one, and every signature on the route is made again on it.
  const revising = Boolean(wf) && editableByPreparer(docData);
  // An uploaded document's file is its PDF: nothing to encode, edit or convert.
  const uploaded = Boolean(docData.uploaded);
  const canChange = !uploaded && editable && (!hasSignature || revising) && (isAdmin || (isOwner && editableByPreparer(docData)));
  // Copy as new draft (LGU personnel): a prepared document becomes a new draft with its details;
  // an uploaded one opens Upload with its type, payee, fund and notes (the new file is chosen).
  const canCopy = !docData.supports && !isExternal && (uploaded || Boolean(docData.typeId));
  const canConvert = !uploaded && editable && (docData.status === 'complete' || (revising && (docData.pdf?.files || []).length > 0)) && (!hasSignature || revising) && (isAdmin || (isOwner && editableByPreparer(docData)));
  const canSign = editable && docData.status === 'complete' && wf?.state !== 'done' && (isAdmin || (wf ? isReceived(wf) && canAct(docData, { uid: user.uid, office: profile.office, isAdmin, isHead, positions: profile.positions || [], grant: folderGrant }) : isOwner));
  // (The office holding it signs: documents are no longer received first.)
  // Signing is open only at a step of the route that signs (or to a person it is referred to).
  const signHere = !wf || (wf.state === 'in-progress' && Boolean(wf.referral || wf.steps[wf.stage]?.sign));
  // The Accounting panel (DV No., deductions…) only before the document is in PDF, or once it is
  // returned to the preparer's office for revision.
  const accountingOpen = !(docData.pdf?.files || []).length
    || (wf?.state === 'in-progress' && wf.stage === 0 && !wf.referral && wf.events.at(-1)?.type === 'returned');
  const canCancel = editable && (isAdmin || (isOwner && atPreparer && wf?.state !== 'done'));
  const run = async (fn) => {
    setBusy(true);
    setActionError('');
    try { await fn(); await load(); } catch (e) { if (!staleReload(e)) setActionError(e.message); } finally { setBusy(false); }
  };

  const remove = () => {
    if (!window.confirm(`Delete ${docData.controlNo}? This cannot be undone.`)) return;
    run(async () => { await deleteDocument(docId); navigate('/documents'); });
  };

  // A supplier or payee sees the document and its PDF only (not its checklist or attachments).
  const activeChecklist = type && !docData.uploaded && !isExternal ? effectiveChecklist(type, docData.transaction) : null;
  // Tabs after the checklist: the documents linked or uploaded to its items, numbered as on it.
  const linkTabs = (activeChecklist?.items || []).flatMap((item, i) => (docData.links?.[item.id] || [])
    .map((l, j) => ({ link: l, key: `${item.id}:${j}`, n: i + 1 }))
    .filter((t) => t.link.kind === 'fts' || t.link.kind === 'file')
    .map((t) => ({
      ...t,
      label: `${String(t.n).padStart(2, '0')} ${t.link.kind === 'fts' ? t.link.typeCode : itemTypeCode(item)}`,
      title: t.link.kind === 'fts' ? `${item.label}: ${t.link.controlNo}` : `${item.label}: ${t.link.name}`,
    })));
  const unchecked = activeChecklist ? missingRequired(activeChecklist.items, docData.checklist) : [];

  return (
    <div className="page">
      {actionError && (
        <div className="alert action-toast no-print" role="alert">{actionError}
          <button type="button" className="btn-icon" aria-label="Close" onClick={() => setActionError('')}>×</button></div>
      )}
      <div className="page-head no-print">
        <div>
          <div className="crumbs">{isExternal ? <Link to="/notifications">Documents for you</Link> : <Link to="/documents">Documents</Link>} / {docData.controlNo}</div>
          <h1>{docData.typeName} <StatusBadge doc={docData} /></h1>
          <p className="muted">{docData.title} · {docData.uploaded ? 'Uploaded' : 'Prepared'} by {docData.createdByName}</p>
          {docData.copiedFrom?.id && <p className="small">Copied from <Link to={`/documents/${docData.copiedFrom.id}`}>{docData.copiedFrom.controlNo || 'another document'}</Link>.</p>}
          {docData.supports && (
            <p className="small">Supporting document of <Link to={`/documents/${docData.supports.id}`}>{docData.supports.controlNo}</Link>
              {docData.supports.typeCode ? ` (${docData.supports.typeCode})` : ''}, checklist item <i>{docData.supports.item}</i>.</p>
          )}
        </div>
        <div className="row gap wrap">
          {view !== 'pdf' && <button className="btn btn-primary" onClick={() => window.print()}>Print {view === 'checklist' ? 'checklist' : 'document'}</button>}
          {type && !isExternal && (type.bulkDownload || docData.typeCode === 'DV') && <BulkDownload docData={docData} type={type} settings={settings} />}
          {canChange && <Link className="btn btn-ghost" to={`/documents/${docId}/edit`}>Edit</Link>}
          {canCopy && (
            <button className="btn btn-ghost" disabled={busy} title="A new draft with the same details, to edit"
              onClick={async () => {
                if (uploaded) { navigate(`/upload?copy=${docId}`); return; }
                setBusy(true); setActionError('');
                try { navigate(`/documents/${await copyDocument({ ...docData, id: docId }, actor, signatoriesFrom(settings))}/edit`, { state: { copied: true } }); } catch (e) { if (!staleReload(e)) setActionError(e.message); setBusy(false); }
              }}>Copy as new draft</button>
          )}
          {canCancel && (
            <button className="btn btn-ghost" disabled={busy}
              onClick={() => window.confirm('Cancel this document?') && run(() => setDocumentStatus(docId, 'cancelled', actor, docData.history))}>
              Cancel document
            </button>
          )}
          {(isSuper || (isOwner && docData.status === 'draft' && editableByPreparer(docData))) && <button className="btn btn-danger" disabled={busy} onClick={remove}>Delete</button>}
        </div>
      </div>

      {/* Uploaded before every upload got one: put its QR code on it (a new version of the PDF). */}
      {uploaded && editable && pdfView && (isAdmin || (isOwner && wf?.state !== 'done')) && !hasDmsQr(pdfView.bytes) && (
        <div className="alert-info no-print row gap wrap qr-missing">
          <span>This PDF has no DMS QR code yet.</span>
          <button className="btn btn-sm" disabled={busy} onClick={() => run(async () => {
            const { bytes, stamped } = await withDmsQr(pdfView.bytes, verifyUrl(docId), ['Scan to verify', docData.controlNo]);
            if (!stamped) throw new Error('DMS cannot add a QR code to this PDF without breaking its signature.');
            await addPdfVersion(docId, bytes, actor, { kind: 'stamped', reason: 'QR code' });
          })}>Add QR code</button>
        </div>
      )}
      {docData.status === 'draft' && (isOwner || isAdmin) && (
        <div className="alert-info no-print">This document is still a <b>draft</b>. Edit it to finish encoding and mark it complete.</div>
      )}
      {docData.status === 'complete' && !wf && !uploaded && (isOwner || isAdmin) && (
        <div className="alert alert-ok no-print"><b>Encoding complete.</b> Check the document, then click <b>Convert to PDF</b> under{' '}
          <b>PDF and digital signatures</b>: the PDF then follows its workflow from office to office.</div>
      )}

      <div className="doc-split">
        <div className="no-print doc-side">
          {/* PDF and digital signatures first, at the top right. */}
          {type && (docData.status !== 'draft' || wf) && (
            <PdfCard docData={docData} type={type} settings={settings} actor={actor}
              canConvert={canConvert} canSign={canSign} signStep={signHere} onChanged={load}
              onLoaded={(p) => {
                setPdfView(p);
                if (shownPdf.current !== p.path) { shownPdf.current = p.path; setView('pdf'); }
              }}
              onView={() => { setView('pdf'); viewer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
              placements={placements}
              onPlacing={(p) => {
                setPlacing(p);
                if (!p) { setPlacements({}); return; }
                setView('pdf');
                // A new size keeps the mark centred where it was, and the text's top left corner.
                setPlacements((cur) => Object.fromEntries(Object.entries(cur).filter(([k, v]) => v && p.items[k]).map(([k, v]) => {
                  const { w, h } = p.items[k];
                  if (k === 'text') return [k, { ...v, rect: [v.rect[0], v.rect[3] - h, v.rect[0] + w, v.rect[3]] }];
                  const cx = (v.rect[0] + v.rect[2]) / 2; const cy = (v.rect[1] + v.rect[3]) / 2;
                  return [k, { ...v, rect: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2] }];
                })));
              }}
              reason={wf?.state === 'in-progress' ? `${wf.steps[wf.stage].action} (${officeOf(wf.steps[wf.stage], docData) || 'Requesting office'})` : ''} />
          )}
          {/* Supplemental documents: between the PDF and the workflow. */}
          {type && !isExternal && (
            <SupplementsCard doc={{ ...docData, id: docId }} actor={actor} busy={busy}
              canAdd={editable && ((isOwner && notDone) || isAdmin || canAct(docData, { uid: user.uid, office: profile.office, isAdmin, isHead, positions: profile.positions || [], grant: folderGrant }))}
              canRemove={editable && ((isOwner && notDone) || isAdmin)}
              onOpen={openFile}
              onSave={(list, note) => run(() => saveSupplements(docId, list, actor, note))} />
          )}
          {/* Optional initial review of the draft by anyone, before it is converted to PDF. */}
          {!isExternal && <ReviewCard doc={docData} me={user.uid} busy={busy} canSend={editable && !uploaded && (isOwner || isAdmin)}
            onSend={(to, note, done) => run(async () => { await forwardDocument(docId, to, note, actor, 'review'); done(); })}
            onReview={(comment, done) => run(async () => { await reviewDocument(docId, comment, actor); done(); })} />}
          {isAdmin && editable && type && draft && !uploaded && accountingOpen && (
            <AccountingPanel type={type} doc={docData} data={draft} onChange={setDraft} busy={busy}
              saved={JSON.stringify(draft) === JSON.stringify(docData.data || {})}
              onSave={() => run(() => saveAccountingEntries(docId, draft, actor, docData.history))} />
          )}
          {type && (wf || (type.processing || []).length > 0) && (docData.status !== 'draft' || wf) && (
            <WorkflowCard doc={docData} busy={busy}
              canAct={canAct(docData, { uid: user.uid, office: profile.office, isAdmin, isHead, positions: profile.positions || [], grant: folderGrant })}
              canStart={docData.status === 'complete' && (docData.pdf?.files || []).length > 0 && (isOwner || isAdmin)}
              onStart={() => run(() => startWorkflow(docId, type, actor, settings.offices || []))}
              onAction={(action, remarks, done) => run(async () => {
                try { await workflowAction(docId, action, actor, { stage: wf.stage, remarks }); done(); } catch (e) { await load(); throw e; }
                // Sent back by the person it was referred to: it is no longer theirs to open.
                if (action === 'back' && !isAdmin) navigate('/notifications', { replace: true });
              })}
              onFill={(values) => run(() => fillStepFields(docId, values, actor, wf.stage))}
              onUpload={(file) => file && run(async () => {
                // A document of its own (DMS number, QR code, in All Documents, archived with this
                // one), shown as a tab after the PDF, like a supplemental document.
                const label = wf.steps[wf.stage].upload || 'Uploaded at this step';
                const link = await uploadSupporting({ parent: { ...docData, id: docId }, slot: `step-${wf.stage}`, label, file, actor });
                await addStepFile(docId, wf.stage, link, actor);
              })}
              onOpenFile={openFile}
              me={user.uid} canRefer={canRefer}
              onlyPositions={wf?.state === 'in-progress' && !wf.referral && !isAdmin && profile.office && officeOf(wf.steps[wf.stage], docData) === profile.office
                && !holdsPosition(wf.steps[wf.stage], profile.positions || [], isHead) ? wf.steps[wf.stage].positions : null}
              onRefer={(to, note, done) => run(async () => { await referDocument(docId, to, note, actor); done(); })}
              onAssign={() => run(() => assignRefNo(docId, actor))}
              onChooseOffices={(picks) => run(() => chooseStepOffices(docId, picks, actor))}
              sendPanel={wf?.steps?.[wf.stage]?.fills && (
                <SendPanel doc={docData} me={user.uid} busy={busy}
                  onDownload={pdfView ? () => downloadBytes(pdfView.bytes, pdfFileName(type, docData), 'application/pdf') : null}
                  onForward={(to, note, done) => run(async () => { await forwardDocument(docId, to, note, actor); done(); })} />
              )} />
          )}
          {type && !wf && (
            <section className="card guide-card">
              <h3>How to process this document</h3>
              <ProcessingGuide type={type} />
            </section>
          )}
          <section className="card">
            <h3>Details</h3>
            <dl className="details">
              <dt>Control No.</dt><dd>{docData.controlNo}</dd>
              {uploaded && <><dt>Uploaded file</dt><dd>{docData.uploaded.name}</dd></>}
              {uploaded && docData.data?.notes && <><dt>Notes</dt><dd>{docData.data.notes}</dd></>}
              {Object.entries(docData.refNos || {}).filter(([, r]) => !r.of).map(([k, r]) => (
                <Fragment key={k}><dt>{r.label}</dt><dd><b>{r.value}</b><div className="small muted">Assigned by {r.by}{r.office ? `, ${r.office}` : ''}</div></dd></Fragment>
              ))}
              <dt>Format version</dt><dd>v{docData.typeVersion || 1}</dd>
              {docData.transaction && (<><dt>Transaction</dt><dd>{docData.transaction.code} — {docData.transaction.title}</dd></>)}
            </dl>
          </section>
          {activeChecklist && activeChecklist.items.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h3>Checklist{docData.transaction ? ` ${docData.transaction.code}` : ''}</h3>
                <div className="row gap">
                  {editable && docData.transaction && (isAdmin || (isOwner && editableByPreparer(docData))) && (
                    <Link className="btn btn-sm btn-ghost" to={`/documents/${docId}/edit?change=checklist`}
                      title="Picked the wrong checklist, or the requirements changed? Choose another type of transaction.">Change checklist</Link>
                  )}
                  <button className="btn btn-sm" onClick={() => setView('checklist')}>View / print</button>
                </div>
              </div>
              {unchecked.length > 0 && <div className="alert">{unchecked.length} required item(s) not yet ticked</div>}
              <ul className="checklist-view">
                {activeChecklist.items.map((c, ci) => {
                  const v = docData.checklist?.[c.id];
                  return (
                    <li key={c.id}><span>{isChecked(v) ? '☑' : v === 'NA' ? 'N/A' : '☐'}</span> {c.label.split('\n')[0]}
                      <ItemLinks item={c} n={ci + 1} links={docData.links?.[c.id] || []} docId={docId} parent={{ ...docData, id: docId }} actor={actor}
                        onOpen={(l, key) => (l.kind === 'fts' ? openLinked(l, key) : openFile(l, key))}
                        canEdit={editable && (isAdmin || (isOwner && notDone))}
                        // Only an item ticked as attached (☑): not one marked N/A or left unticked.
                        canAdd={editable && (isAdmin || (isOwner && notDone)) && isChecked(v)}
                        onChange={(list, note) => run(async () => saveDocumentLinks(docId, {
                          links: { ...(docData.links || {}), [c.id]: list },
                          checklist: list.length > (docData.links?.[c.id] || []).length && !isChecked(v)
                            ? { ...(docData.checklist || {}), [c.id]: 'Y' } : (docData.checklist || {}),
                        }, actor, docData.history, `${c.label}: ${note}`))} />
                    </li>
                  );
                })}
              </ul>
              {(docData.additionalDocs || []).length > 0 && (
                <>
                  <h4 style={{ marginTop: '.9rem' }}>Additional documents</h4>
                  <ol className="small" start={activeChecklist.items.length + 1}>{docData.additionalDocs.map((t, i) => <li key={i}>{t}</li>)}</ol>
                </>
              )}
              <ExtraItems docData={docData} docId={docId} actor={actor} start={activeChecklist.items.length + (docData.additionalDocs || []).length}
                canEdit={editable && (isAdmin || (isOwner && notDone))} busy={busy} run={run}
                onOpen={(l, key) => (l.kind === 'fts' ? openLinked(l, key) : openFile(l, key))} />
            </section>
          )}
          {!isExternal && docData.office && (isAdmin || isRecords || (isHead && docData.office === profile.office)) && (
            <AccessCard doc={docData} me={user.uid} busy={busy}
              onChange={(person, role) => run(() => setDocumentAccess(docId, person, role, actor))}
              onRestrict={(on) => run(() => setDocumentRestricted(docId, on, actor))} />
          )}
          <section className="card">
            <h3>History</h3>
            <ul className="history">
              {[...(docData.history || [])].filter((h) => !['received', 'received (referred)'].includes(h.action)).reverse().map((h, i) => (
                <li key={i}><b>{h.action === 'released' ? 'routed' : h.action}</b> {h.note && `(${h.note})`}<div className="small muted">{h.by} · {new Date(h.at).toLocaleString()}</div></li>
              ))}
            </ul>
          </section>
        </div>
        {type ? (
          <div className="doc-main" ref={viewer}>
            {((activeChecklist && activeChecklist.items.length > 0) || pdfView || (!isExternal && ((docData.supplements || []).length > 0 || (docData.stepFiles || []).length > 0))) && (
              <div className="tabs view-toggle no-print">
                {pdfView && <button className={view === 'pdf' ? 'active' : ''} onClick={() => setView('pdf')}>{hasSignature ? 'Signed PDF' : 'PDF'}</button>}
                {(isExternal ? [] : docData.supplements || []).map((l, i) => (
                  <button key={`supp:${i}`} title={`${l.label || 'Supplemental document'}: ${l.dms?.controlNo || l.name}`}
                    className={view === 'file' && linkKey === `supp:${i}` ? 'active' : ''}
                    onClick={() => openFile(l, `supp:${i}`)}>{l.label && l.label !== 'Supplemental document' ? l.label : `Supplemental ${i + 1}`}</button>
                ))}
                {/* Files uploaded at a route step (e.g. the DV signed by the payee in Box E). */}
                {(isExternal ? [] : docData.stepFiles || []).map((l, i) => {
                  const name = l.label || 'Uploaded file';
                  return (
                    <button key={`step:${i}`} title={`${name}: ${l.dms?.controlNo || l.name}`}
                      className={view === 'file' && linkKey === `step:${i}` ? 'active' : ''}
                      onClick={() => openFile(l, `step:${i}`)}>{name.length > 30 ? `${name.slice(0, 28).trim()}…` : name}</button>
                  );
                })}
                {!uploaded && <button className={view === 'document' ? 'active' : ''} onClick={() => setView('document')}>{docData.typeCode}</button>}
                {activeChecklist && activeChecklist.items.length > 0 && (
                  <button className={view === 'checklist' ? 'active' : ''} onClick={() => setView('checklist')}>Checklist{docData.transaction ? ` ${docData.transaction.code}` : ''}</button>
                )}
                {linkTabs.map((t) => (
                  <button key={t.key} title={t.title} className={(view === 'linked' || view === 'file') && linkKey === t.key ? 'active' : ''}
                    onClick={() => (t.link.kind === 'fts' ? openLinked(t.link, t.key) : openFile(t.link, t.key))}>{t.label}</button>
                ))}
              </div>
            )}
            {view === 'linked' && linkedView ? (
              <>
                <div className="row gap file-head no-print">
                  <Link className="btn btn-ghost btn-sm" to={`/documents/${linkedView.link.id}`}>Open {linkedView.link.controlNo}</Link>
                  {linkedView.bytes && <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => downloadBytes(linkedView.bytes, `${linkedView.link.typeCode}_${linkedView.link.controlNo}.pdf`, 'application/pdf')}>Download</button>}
                </div>
                {linkedView.error ? <div className="alert">{linkedView.error}</div>
                  : linkedView.bytes ? <PdfViewer bytes={linkedView.bytes} signatures={linkedView.signatures} title={`${linkedView.link.controlNo} · ${linkedView.link.typeCode}${linkedView.signatures.length ? ' · signed PDF' : ' · PDF'}`} />
                    : linkedView.type ? (
                      <DocumentPreview type={linkedView.type} data={linkedView.doc.data || {}} checklist={linkedView.doc.checklist || {}} settings={settings}
                        signatories={linkedView.doc.signatories} office={linkedView.doc.office} controlNo={linkedView.doc.controlNo} preparedBy={linkedView.doc.createdByName}
                        preparedByPosition={linkedView.doc.createdByPosition || ''} preparedByIdNo={linkedView.doc.createdByIdNo || ''} />
                    ) : <div className="spinner" />}
              </>
            ) : view === 'file' && fileView ? (
              <>
                <div className="row gap file-head no-print">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView(pdfView ? 'pdf' : 'document')}>← Back to the {pdfView ? 'PDF' : 'document'}</button>
                  {fileView.bytes && <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadBytes(fileView.bytes, fileView.file.name, fileView.file.type)}>Download</button>}
                </div>
                {fileView.error ? <div className="alert">{fileView.error}</div> : <FileView file={fileView.file} bytes={fileView.bytes} />}
              </>
            ) : view === 'pdf' && pdfView ? (
              <PdfViewer bytes={pdfView.bytes} signatures={pdfView.signatures} title={`${docData.controlNo} · ${hasSignature ? 'signed PDF' : 'PDF'}`}
                placing={tapItem} onPlace={onPlace} marks={placedMarks} />
            ) : uploaded ? (
              pdfView ? <PdfViewer bytes={pdfView.bytes} signatures={pdfView.signatures} title={`${docData.controlNo} · ${docData.uploaded.name}`}
                placing={tapItem} onPlace={onPlace} marks={placedMarks} /> : <div className="spinner" />
            ) : view === 'checklist' && activeChecklist ? (
              <ChecklistSheet checklist={activeChecklist} state={docData.checklist} data={draft || docData.data} additional={docData.additionalDocs || []} links={docData.links || {}} settings={settings} />
            ) : (
          <DocumentPreview type={type} data={draft || docData.data} checklist={docData.checklist} settings={settings}
            signatories={docData.signatories} office={docData.office}
            controlNo={docData.controlNo} preparedBy={docData.createdByName}
            preparedByPosition={docData.createdByPosition || ''} preparedByIdNo={docData.createdByIdNo || ''} />
            )}
          </div>
        ) : <div className="alert">The document type for this document was deleted; the format cannot be rendered.</div>}
      </div>
    </div>
  );
}
