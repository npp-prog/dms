import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  createDocument, getDocument, getDocumentType, getTypeForDocument, listDocumentTypes, updateDocument,
} from '../lib/api.js';
import { buildSteps, computeFields, initialData, missingFields, byOffice } from '../lib/forms.js';
import { editableByPreparer } from '../lib/workflow.js';
import { carryOver, effectiveChecklist, missingRequired } from '../lib/checklists.js';
import ChecklistStep from '../components/ChecklistStep.jsx';
import ChecklistSheet from '../components/ChecklistSheet.jsx';
import { signatoriesFrom } from '../lib/signatories.js';
import FieldInput from '../components/FieldInput.jsx';
import DocumentPreview from '../components/DocumentPreview.jsx';
import ProcessingGuide from '../components/ProcessingGuide.jsx';

// New document (from the Dashboard's "+ New document"; not in the menu): choose the type, then
// prepare it in DMS from its format, or upload it as a file.
function TypePicker() {
  const [types, setTypes] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { listDocumentTypes({ activeOnly: true }).then(setTypes).catch((e) => setError(e.message)); }, []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (types || []).filter((t) => words.every((w) => `${t.code} ${t.name} ${t.category}`.toLowerCase().includes(w)));
  return (
    <div className="page">
      <h1>New document</h1>
      {error && <div className="alert">{error}</div>}
      {!types && !error && <div className="spinner" />}
      {types && (
        <>
          {types.length > 6 && <input className="search type-search" type="search" placeholder="Search by code or name…" value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="card type-list type-choose">
            {shown.map((t) => (
              <div key={t.id} className="type-row">
                <span className="code">{t.code}</span>
                <span className="name">{t.name}{t.category && <span className="cat"> · {t.category}</span>}</span>
                <span className="type-acts">
                  {!t.uploadOnly && <Link className="btn btn-primary btn-sm" to={`/new/${t.id}`}>Prepare</Link>}
                  <Link className="btn btn-ghost btn-sm" to={`/upload?type=${t.id}`}>Upload</Link>
                </span>
              </div>
            ))}
            {!words.length && (
              <div className="type-row">
                <span className="code">—</span>
                <span className="name">Other document <span className="cat">· kept with a control number, not routed</span></span>
                <span className="type-acts"><Link className="btn btn-ghost btn-sm" to="/upload">Upload</Link></span>
              </div>
            )}
            {shown.length === 0 && words.length > 0 && <p className="small muted" style={{ padding: '.6rem .9rem' }}>No document type matches.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export default function PrepareDocument() {
  const { typeId, docId } = useParams();
  if (!typeId && !docId) return <TypePicker />;
  return <Wizard key={typeId || docId} typeId={typeId} docId={docId} />;
}

function Wizard({ typeId, docId }) {
  const navigate = useNavigate();
  // ?change=checklist: opened from the document page to change the checklist.
  const [params] = useSearchParams();
  const changeChecklist = params.get('change') === 'checklist';
  const copied = Boolean(useLocation().state?.copied);
  const { actor, settings, isAdmin, profile } = useAuth();
  const [type, setType] = useState(null);
  const [existing, setExisting] = useState(null);
  const [data, setData] = useState({});
  const [checklist, setChecklist] = useState({});
  // Documents attached that are not on the checklist (printed under Additional Documents).
  const [additionalDocs, setAdditionalDocs] = useState([]);
  // Links from checklist items to the supporting documents (in DMS or another system).
  const [links, setLinks] = useState({});
  const [transaction, setTransaction] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (docId) {
          const d = await getDocument(docId);
          if (!d) throw new Error('Document not found.');
          if (d.status === 'cancelled') throw new Error('This document was cancelled and can no longer be edited.');
          // On its route (not back at the preparer's step) or processed: only an administrator edits it.
          if (!isAdmin && !editableByPreparer(d)) throw new Error('This document is on its route or processed: it can be edited only when it is returned to your office.');
          const t = await getTypeForDocument(d);
          if (!t) throw new Error('The document type of this document no longer exists.');
          setExisting(d);
          setType(t);
          setData({ ...initialData(t), ...d.data });
          setChecklist(d.checklist || {});
          setAdditionalDocs(d.additionalDocs || []);
          setLinks(d.links || {});
          setTransaction(d.transaction || null);
        } else {
          const t = await getDocumentType(typeId);
          if (!t || t.active === false) throw new Error('Document type not found or inactive.');
          if (t.uploadOnly) throw new Error(`${t.code} has no format to prepare. Upload it from New document.`);
          setType(t);
          setData(initialData(t));
        }
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [typeId, docId, isAdmin]);

  const steps = useMemo(() => {
    if (!type) return [];
    const fromLibrary = type.checklistSource && type.checklistSource !== 'own';
    return [
      ...buildSteps(type),
      // Only documents with a checklist (the DV and the Liquidation Report) have this step.
      ...(fromLibrary || (type.checklist || []).length ? [{
        id: '__checklist',
        title: 'Checklist',
        instructions: fromLibrary
          ? 'Choose the type of transaction to load its checklist from the Municipal Accounting Office. Attach each document on it, then tick Y (or N/A if it does not apply). Items marked required must be ticked before the document can be marked complete.'
          : 'Confirm that each requirement is attached or complied with. Items marked required must be ticked before the document can be marked complete.',
      }] : []),
      { id: '__review', title: 'Review & Save', instructions: 'Review the generated document. Save as draft to continue later, or mark complete when everything is encoded. Then print it and process it as shown below.' },
    ];
  }, [type]);

  useEffect(() => {
    if (changeChecklist && steps.length) setStepIndex(Math.max(0, steps.findIndex((s) => s.id === '__checklist')));
  }, [changeChecklist, steps]);

  if (error) return <div className="page"><div className="alert">{error}</div><Link to="/new">Back</Link></div>;
  if (!type) return <div className="page"><div className="spinner" /></div>;

  const step = steps[stepIndex];
  const stepMissing = step.fields ? missingFields(step.fields, data) : [];
  const allMissing = missingFields(type.fields.filter((f) => !byOffice(f)), data);
  const library = type.checklistSource && type.checklistSource !== 'own';
  const activeChecklist = effectiveChecklist(type, transaction);
  const checklistMissing = activeChecklist ? missingRequired(activeChecklist.items, checklist) : [];
  const needsTransaction = library && !transaction;

  const next = () => {
    if (stepMissing.length) { setShowErrors(true); return; }
    setShowErrors(false);
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const save = async (status) => {
    setBusy(true);
    setError('');
    try {
      let id = docId;
      const payload = { data, checklist, additionalDocs: additionalDocs.filter((t) => t.trim()), links, transaction, status, signatories: existing?.signatories || signatoriesFrom(settings) };
      if (existing) await updateDocument(docId, type, payload, actor, existing.history);
      else id = await createDocument(type, payload, actor);
      // Editing (opened from the document page): return there. New document: replace the
      // wizard in the history, so Back from the document does not reopen the wizard.
      // A copy just made (Copy as new draft): to the new document, not back to the original.
      if (existing && !copied && (window.history.state?.idx ?? 0) > 0) navigate(-1);
      else navigate(`/documents/${id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/new">New document</Link> / {type.code}{existing && ` / ${existing.controlNo}`}</div>
          <h1>{type.name}</h1>
        </div>
        <button className="btn btn-ghost" disabled={busy} onClick={() => save('draft')}>Save draft</button>
      </div>

      <ol className="stepper">
        {steps.map((s, i) => (
          <li key={s.id} className={i === stepIndex ? 'current' : i < stepIndex ? 'done' : ''}>
            <button type="button" onClick={() => (i <= stepIndex ? setStepIndex(i) : next())}>
              <span className="dot">{i < stepIndex ? '✓' : i + 1}</span>{s.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="split">
        <section className="card">
          <h3>Step {stepIndex + 1}: {step.title}</h3>
          {step.instructions && <div className="instructions">{step.instructions}</div>}

          {step.fields && (
            <div className="fields">
              {step.fields.map((f) => (
                <FieldInput key={f.key} field={f} value={data[f.key]}
                  invalid={showErrors && stepMissing.includes(f)}
                  onChange={(v) => setData((d) => computeFields(type.fields, { ...d, [f.key]: v }))} />
              ))}
            </div>
          )}

          {step.id === '__checklist' && (
            <ChecklistStep type={type} transaction={transaction} state={checklist} onState={setChecklist}
              additional={additionalDocs} onAdditional={setAdditionalDocs} links={links} onLinks={setLinks} docId={docId} doc={existing}
              startPicking={changeChecklist}
              onTransaction={(t) => {
                if (transaction?.code !== t.code) {
                  const kept = carryOver(transaction?.items, t.items, checklist, links);
                  setChecklist(kept.state);
                  setLinks(kept.links);
                }
                setTransaction(t);
              }} />
          )}

          {step.id === '__review' && (
            <div>
              {allMissing.length > 0 && (
                <div className="alert">Missing required fields: {allMissing.map((f) => f.label).join(', ')}</div>
              )}
              {needsTransaction && (
                <div className="alert">Choose the type of transaction in the Checklist step.</div>
              )}
              {checklistMissing.length > 0 && (
                <div className="alert">Unchecked required items: {checklistMissing.map((c) => c.label).join(', ')}</div>
              )}
              {!allMissing.length && !checklistMissing.length && !needsTransaction && (
                <div className="alert alert-ok">All required fields and checklist items are complete.</div>
              )}
              <div className="row gap">
                <button className="btn btn-ghost" disabled={busy} onClick={() => save('draft')}>Save as draft</button>
                <button className="btn btn-primary" disabled={busy || allMissing.length > 0 || checklistMissing.length > 0 || needsTransaction}
                  onClick={() => save('complete')}>Mark complete</button>
              </div>
              <h4 style={{ marginTop: '1.4rem' }}>After saving: how to process this document</h4>
              <ProcessingGuide type={type} compact />
            </div>
          )}

          {showErrors && stepMissing.length > 0 && (
            <div className="alert">Please fill in: {stepMissing.map((f) => f.label).join(', ')}</div>
          )}

          <div className="row gap wizard-nav">
            <button className="btn btn-ghost" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>← Back</button>
            {stepIndex < steps.length - 1 && <button className="btn btn-primary" onClick={next}>Next →</button>}
          </div>
        </section>

        <div className="preview-col">
          {step.id === '__checklist' && activeChecklist ? (
            <>
              <div className="preview-label no-print row gap" style={{ justifyContent: 'space-between' }}>
                <span>Checklist {activeChecklist.code}</span>
                <button type="button" className="btn btn-sm" onClick={() => window.print()}>Print checklist</button>
              </div>
              <ChecklistSheet checklist={activeChecklist} state={checklist}
                data={data} additional={additionalDocs} links={links} settings={settings} />
            </>
          ) : (
            <>
              <div className="preview-label no-print">Live preview</div>
              <DocumentPreview type={type} data={data} checklist={checklist} settings={settings}
                signatories={existing?.signatories} office={existing?.office || profile?.office} controlNo={existing?.controlNo || '(assigned on save)'} preparedBy={existing?.createdByName || actor.displayName}
                preparedByPosition={existing ? existing.createdByPosition || '' : actor.position} preparedByIdNo={existing ? existing.createdByIdNo || '' : actor.idNo} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
