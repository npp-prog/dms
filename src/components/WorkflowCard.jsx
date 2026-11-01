import { useEffect, useState } from 'react';
import { ACTION_LABELS, HIDDEN_EVENTS, approverMismatch, isThirdParty, assignPending, availableActions, fillsMissing, officeOf, refStampMissing, signatureMissing } from '../lib/workflow.js';
import PersonPicker from './PersonPicker.jsx';
import Select from './Select.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const EVENT_TEXT = {
  started: 'Started', released: 'Routed', returned: 'Returned', completed: 'Processed', cancelled: 'Cancelled', assigned: 'Assigned',
  route: 'Offices chosen', referred: 'Referred', 'referral back': 'Sent back',
};

// The preparer chooses which office handles each step that has alternates (e.g. the Mayor or the
// Vice Mayor), and the person of each third-party step (a supplier, payee…), before first
// releasing the document.
function OfficeChoice({ doc, busy, onChoose }) {
  const wf = doc.workflow;
  const main = (s) => (s.office === 'Requesting office' ? '' : s.office);
  // The office matching Approved by (Mayor or Vice Mayor) is suggested where the route differs.
  const [picks, setPicks] = useState(() => {
    const m = approverMismatch(doc);
    return Object.fromEntries(wf.steps.map((s, i) => [i, isThirdParty(s) ? s.party || null : m && m.stage === i ? m.office : s.routedTo]));
  });
  const name = (o) => o || "Preparer's office";
  const changed = wf.steps.some((s, i) => (isThirdParty(s) ? picks[i]?.uid !== s.party?.uid : s.alternates?.length && picks[i] !== s.routedTo));
  const missing = wf.steps.some((s, i) => isThirdParty(s) && !picks[i]?.uid);
  return (
    <div className={`route-choice${wf.choose ? ' needed' : ''}`}>
      <div className="field-label">{wf.choose ? 'Choose who handles these steps' : 'Offices chosen for these steps'}</div>
      {wf.steps.map((s, i) => isThirdParty(s) && (
        <div key={`p${i}`} className="route-options">
          <div className="small"><b>Step {i + 1}</b> · third party · {s.action}{s.sign ? ' · signs the PDF' : ''}</div>
          <PersonPicker value={picks[i] ? { ...picks[i], displayName: picks[i].name } : null} external
            placeholder="Type the name or email of the supplier, payee…"
            onChange={(p) => setPicks({ ...picks, [i]: p ? { uid: p.uid, name: p.displayName || p.email } : null })} />
        </div>
      ))}
      {wf.steps.map((s, i) => s.alternates?.length > 0 && (
        <div key={i} className="route-options">
          <div className="small"><b>Step {i + 1}</b> · {s.action}{s.sign ? ' · signs the PDF' : ''}</div>
          {[main(s), ...s.alternates].map((o) => (
            <label key={o || '-'} className={`route-option${picks[i] === o ? ' on' : ''}`}>
              <input type="radio" name={`wf-step-${i}`} checked={picks[i] === o} onChange={() => setPicks({ ...picks, [i]: o })} />
              <span><b>{name(o)}</b></span>
            </label>
          ))}
        </div>
      ))}
      {(wf.choose || changed) && (
        <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || missing} onClick={() => onChoose(picks)}>{wf.choose ? 'Confirm' : 'Save the change'}</button></div>
      )}
    </div>
  );
}

// The office holding the document sends it to a person outside the route; they send it back.
function ReferPanel({ me, busy, onRefer, onCancel }) {
  const [person, setPerson] = useState(null);
  const [note, setNote] = useState('');
  return (
    <div className="refer-panel">
      <div className="field">
        <span className="field-label">Refer to a person (outside the route)</span>
        <PersonPicker value={person} onChange={setPerson} exclude={[me]} external />
      </div>
      <label className="field">
        <span className="field-label">What should they do? (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="xs muted">They find it in their Notifications, act on it (they can sign the PDF) and send it back to you. The route then goes on.</p>
      <div className="row gap">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !person} onClick={() => onRefer(person, note)}>Refer to {person?.displayName || 'this person'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// The route of a document: each office on it, where the document is now, who acted and
// released it and when, and the actions open to the office holding it.
// What the office holding the document does at its step before releasing it: fill in details
// (e.g. Check/ADA No., date, bank) and upload a file (e.g. the DV signed by the payee in Box E).
function StepTasks({ doc, step, busy, onFill, onUpload, onOpenFile, children }) {
  const fields = doc.typeSnapshot?.fields || [];
  const keys = step.fills || [];
  const [values, setValues] = useState(() => Object.fromEntries(keys.map((k) => [k, doc.data?.[k] ?? ''])));
  // Refreshed only when the saved values themselves change (not on every reload of the document,
  // e.g. after uploading the step's file, which would wipe what is typed but not saved yet).
  const saved = JSON.stringify(keys.map((k) => doc.data?.[k] ?? ''));
  useEffect(() => setValues(Object.fromEntries(keys.map((k) => [k, doc.data?.[k] ?? '']))), [saved, keys.join()]);
  const changed = keys.some((k) => String(values[k] ?? '') !== String(doc.data?.[k] ?? ''));
  const files = (doc.stepFiles || []).filter((f) => f.stage === doc.workflow.stage);
  return (
    <div className="step-tasks">
      {keys.length > 0 && (
        <div className="fields">
          {keys.map((k) => {
            const f = fields.find((x) => x.key === k) || { key: k, label: k, type: 'text' };
            const set = (v) => setValues({ ...values, [k]: v });
            return (
              <label key={k} className="field">
                <span className="field-label">{f.label}</span>
                {f.type === 'select'
                  ? <Select value={values[k]} onChange={(e) => set(e.target.value)}><option value="">—</option>{(f.options || []).map((o) => <option key={o}>{o}</option>)}</Select>
                  : <input type={f.type === 'date' ? 'date' : 'text'} className={f.type === 'date' ? '' : 'caps'} value={values[k]}
                    onChange={(e) => set(f.type === 'date' ? e.target.value : e.target.value.toUpperCase())} />}
              </label>
            );
          })}
          <div><button type="button" className="btn btn-primary btn-sm" disabled={busy || !changed || keys.some((k) => !String(values[k]).trim())}
            onClick={() => onFill(values)}>Save details</button></div>
        </div>
      )}
      {step.upload && (
        <div className="step-upload">
          <div className="field-label">{step.upload} <span className="muted">(optional)</span></div>
          {files.map((f, i) => <div key={i} className="small"><button type="button" className="link" onClick={() => onOpenFile(f)}>{f.name}</button> · {f.by}</div>)}
          <label className="btn btn-ghost btn-sm">
            {files.length ? 'Upload another' : 'Upload'}
            <input type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { onUpload(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
      {children}
    </div>
  );
}

export default function WorkflowCard({ doc, canAct, canStart, busy, onAction, onStart, onFill, onUpload, onOpenFile, sendPanel, me, canRefer, onRefer, onAssign, onChooseOffices, onlyPositions }) {
  const wf = doc.workflow;
  const [returning, setReturning] = useState(false);
  const [referring, setReferring] = useState(false);
  const [remarks, setRemarks] = useState('');

  if (!wf) {
    return (
      <section className="card">
        <h3>Workflow</h3>
        {canStart ? (
          <>
            <p className="small muted">This document is converted to PDF but not routed yet. Start the workflow to send the PDF
              along its route.</p>
            <button className="btn btn-primary" disabled={busy} onClick={onStart}>Start workflow</button>
          </>
        ) : <p className="small muted">The workflow starts when the document is converted to PDF: the PDF then goes from office to
          office along its route, to be signed and routed.</p>}
      </section>
    );
  }

  const nameOf = (step) => officeOf(step, doc) || 'Requesting office';
  const fieldLabel = (key) => (doc.typeSnapshot?.fields || []).find((f) => f.key === key)?.label || key;
  const actions = canAct ? availableActions(doc) : [];
  const next = wf.steps[wf.stage + 1];
  const prev = wf.steps[wf.stage - 1];
  const referral = wf.referral;
  const unsigned = !referral && signatureMissing(doc);
  const released = wf.events.some((e) => e.type === 'released');
  const hasAlternates = wf.steps.some((s) => s.alternates?.length || isThirdParty(s));
  const showChoice = wf.state === 'in-progress' && hasAlternates && wf.stage === 0 && !released && !referral && canAct;
  const refPending = refStampMissing(doc);
  const toAssign = canAct && assignPending(doc) ? wf.steps[wf.stage].assign.field : '';
  // (The step's upload is optional: it does not block routing.)
  const blocked = fillsMissing(doc).length > 0 || Boolean(refPending) || Boolean(toAssign);
  const act = (action) => onAction(action, remarks, () => { setRemarks(''); setReturning(false); });

  return (
    <section className="card workflow-card">
      <div className="card-head">
        <h3>Workflow</h3>
        <span className={`badge ${wf.state === 'done' ? 'badge-green' : wf.state === 'cancelled' ? 'badge-gray' : 'badge-blue'}`}>
          {wf.state === 'done' ? 'Processed' : wf.state === 'cancelled' ? 'Cancelled' : `Step ${wf.stage + 1} of ${wf.steps.length}`}
        </span>
      </div>
      <ol className="wf-steps">
        {wf.steps.map((step, i) => {
          const state = wf.state === 'done' || i < wf.stage ? 'done' : i === wf.stage && wf.state === 'in-progress' ? 'current' : 'pending';
          const events = wf.events.filter((e) => e.stage === i && !HIDDEN_EVENTS.has(e.type));
          return (
            <li key={i} className={`wf-${state}`}>
              <span className="wf-dot">{state === 'done' ? '✓' : i + 1}</span>
              <div>
                <div className="wf-office">{nameOf(step)}{wf.choose && step.alternates?.length > 0 && <span className="small muted"> (or {step.alternates.map((o) => o || "Preparer's office").join(' or ')}: to choose)</span>}</div>
                <div className="small"><b>{step.action}</b>{step.positions?.length > 0 && <span className="muted"> · by the {step.positions.join(' or ')}</span>}{step.sign && <span className="muted"> · signs the PDF</span>}
                  {step.assign && <span className="muted"> · assigns the {fieldLabel(step.assign.field)}</span>}</div>
                {state === 'current' && !referral && <div className="small wf-now">Here now</div>}
                {state === 'current' && referral && (
                  <div className="small wf-now">Referred to <b>{referral.name}</b>{referral.office ? ` (${referral.office})` : ''}: with them now</div>
                )}
                {events.map((e, j) => (
                  <div key={j} className={`small ${e.type === 'returned' ? 'wf-returned' : 'muted'}`}>
                    {e.type === 'assigned'
                      ? <><b className="wf-assigned">{e.remarks}</b> assigned by {e.by} · {when(e.at)}</>
                      : <>{EVENT_TEXT[e.type]} by {e.by} · {when(e.at)}{e.remarks && <> — <i>{e.remarks}</i></>}</>}
                  </div>
                ))}
                {(doc.stepFiles || []).filter((f) => f.stage === i).map((f, j) => (
                  <div key={`f${j}`} className="small">
                    <button type="button" className="link" onClick={() => onOpenFile?.(f)}>{f.label}: {f.name}</button>
                    <span className="muted"> · uploaded by {f.by}</span>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      {onlyPositions && (
        <div className="alert-info small no-print">This step is for the <b>{onlyPositions.join(' or ')}</b> of your office: only they (or the office head) can sign
          and route it.</div>
      )}
      {showChoice && <OfficeChoice key={JSON.stringify(wf.steps.map((s) => s.routedTo))} doc={doc} busy={busy} onChoose={onChooseOffices} />}

      {referral && actions.length > 0 && (
        <div className="wf-actions no-print">
          <div className="alert-info small">
            <b>{referral.by}</b> ({referral.fromOffice || 'the office holding it'}) referred this document to you{referral.note ? <>: <i>{referral.note}</i></> : '.'}
            {' '}Act on it (you can sign the PDF), then send it back.
          </div>
          <div className="field field-wide" style={{ marginBottom: '.6rem' }}>
            <label className="field-label" htmlFor="wf-back">Remarks (optional)</label>
            <input id="wf-back" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div className="row gap wrap">
            {actions.includes('back') && <button className="btn btn-primary" disabled={busy} onClick={() => act('back')}>Send back to {referral.fromOffice || referral.by}</button>}
          </div>
        </div>
      )}

      {!referral && actions.length > 0 && (
        <div className="wf-actions no-print">
          {referring ? (
            <ReferPanel me={me} busy={busy} onCancel={() => setReferring(false)}
              onRefer={(to, note) => onRefer(to, note, () => setReferring(false))} />
          ) : returning ? (
            <div className="fields">
              <div className="field field-wide">
                <label className="field-label" htmlFor="wf-remarks">Why is it returned to {prev ? nameOf(prev) : 'the previous office'}?</label>
                <textarea id="wf-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                  />
              </div>
              <div className="row gap">
                <button className="btn btn-danger" disabled={busy || !remarks.trim()} onClick={() => act('return')}>Return</button>
                <button className="btn btn-ghost" onClick={() => setReturning(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {(actions.includes('release') || actions.includes('complete')) && (
                <div className="field field-wide" style={{ marginBottom: '.6rem' }}>
                  <label className="field-label" htmlFor="wf-note">Remarks (optional)</label>
                  <input id="wf-note" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </div>
              )}
              {(wf.steps[wf.stage].fills || wf.steps[wf.stage].upload) && (
                <StepTasks doc={doc} step={wf.steps[wf.stage]} busy={busy} onFill={onFill} onUpload={onUpload} onOpenFile={onOpenFile}>
                  {!fillsMissing(doc).length && sendPanel}
                </StepTasks>
              )}
              {fillsMissing(doc).length > 0 && (
                <div className="alert-info small">Before routing: fill in and save the details above.</div>
              )}
              {toAssign && (
                <div className="alert-info small">The <b>{fieldLabel(toAssign)}</b> is not assigned yet.{' '}
                  <button type="button" className="link" disabled={busy} onClick={onAssign}>Assign it now</button></div>
              )}
              {refPending && (
                <div className="alert-info small">Put the <b>{refPending.label} {refPending.value}</b> on the PDF under <b>PDF and digital signatures</b>{wf.steps[wf.stage].sign ? ' (with your signature)' : ''}, then route it.</div>
              )}
              {unsigned && (
                <div className="alert-info small">This step requires a signature. Sign the PDF under <b>PDF and digital signatures</b>, then route it.</div>
              )}
              <div className="wf-buttons">
                {actions.includes('release') && <button className="btn btn-primary" disabled={busy || unsigned || blocked || (wf.stage === 0 && wf.choose)} onClick={() => act('release')}>Route to {nameOf(next)}</button>}
                {actions.includes('complete') && <button className="btn btn-primary" disabled={busy || unsigned || blocked} onClick={() => act('complete')}>{ACTION_LABELS.complete}</button>}
                {actions.includes('return') && <button className="btn btn-ghost" disabled={busy} onClick={() => setReturning(true)}>Return to {nameOf(prev)}</button>}
                {canRefer && <button className="btn btn-ghost" disabled={busy} onClick={() => setReferring(true)}>Refer to a person…</button>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
