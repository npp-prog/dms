import { useState } from 'react';
import PersonPicker from './PersonPicker.jsx';
import { SIGN_BOX, SIGNER_LIMIT, currentSigner } from '../lib/signRequest.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');
const STATE = { open: 'Out for signature', done: 'Signed by everyone', declined: 'Declined', cancelled: 'Withdrawn' };

// Signature requests (as in eGovDoc), for a document outside any route: its preparer chooses who
// signs it, in what order, and taps the PDF where each one signs; each in turn is notified and signs
// in their box (PDF and digital signatures), or declines. lib/signRequest.js.
// placements / onPlacing: the PDF viewer's tap-to-place (keys req:<uid>).
export default function SignRequestCard({ doc, me, canRequest, busy, placements = {}, onPlacing, onSend, onDecline, onCancel, onProcessed }) {
  const r = doc.signRequest;
  const [rows, setRows] = useState(null); // null: not composing; [] while choosing who signs
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const turn = currentSigner(doc);
  const mine = turn?.uid === me;

  if (!r && !canRequest) return null;

  const key = (x) => `req:${x.uid}`;
  const items = (list) => Object.fromEntries(list.map((x) => [key(x), {
    ...SIGN_BOX, label: `${x.label ? `${x.label}: ` : ''}${x.name}`, hint: `Tap the page where ${x.name} signs (${x.label || 'their signature'}).`,
  }]));
  const place = (list, i) => onPlacing({ target: key(list[i]), items: items(list) });
  const update = (list, target) => { setRows(list); if (target !== undefined) place(list, target); else if (list.length) onPlacing({ target: null, items: items(list) }); };
  const stop = () => { setRows(null); setNote(''); setError(''); onPlacing(null); };
  const send = async () => {
    setError('');
    try {
      await onSend(rows.map((x) => ({ ...x, page: placements[key(x)]?.page, rect: placements[key(x)]?.rect })), note);
      stop();
    } catch (e) { setError(e.message); }
  };

  return (
    <section className="card sign-request">
      <div className="card-head"><h3>Signatures</h3>{r && <span className={`badge ${r.state === 'done' ? 'badge-green' : r.state === 'open' ? 'badge-blue' : 'badge-gray'}`}>{STATE[r.state]}</span>}</div>
      {error && <div className="alert small">{error}</div>}

      {r && (
        <>
          <ol className="sr-steps">
            {r.steps.map((s, i) => (
              <li key={s.uid} className={`sr-${s.status}${r.state === 'open' && i === r.current ? ' sr-now' : ''}`}>
                <span className="sr-dot">{s.status === 'signed' ? '✓' : s.status === 'declined' ? '✗' : i + 1}</span>
                <div>
                  <b>{s.name}</b>{s.label && <span className="muted"> · {s.label}</span>}
                  <div className="xs muted">{[[s.position, s.office].filter(Boolean).join(', '), `page ${s.page + 1}`].filter(Boolean).join(' · ')}</div>
                  <div className="xs">
                    {s.status === 'signed' && <>Signed {when(s.at)}</>}
                    {s.status === 'declined' && <span className="wf-returned">Declined {when(s.at)} — <i>{s.remarks}</i></span>}
                    {s.status === 'pending' && r.state === 'open' && (i === r.current ? <b>Their turn</b> : <span className="muted">Waiting</span>)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="xs muted">Asked by {r.by}, {when(r.at)}{r.note && <> — <i>{r.note}</i></>}</p>
        </>
      )}

      {mine && !declining && (
        <div className="alert-info small">
          <b>{r.by}</b> asks you to sign this document{turn.label ? <> as <b>{turn.label}</b></> : ''}: your box is on page {turn.page + 1} of the PDF.
          Sign it under <b>PDF and digital signatures</b> (e-signature, or PNPKI): your signature goes in your box.
          <div className="row gap" style={{ marginTop: '.5rem' }}><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDeclining(true)}>Decline to sign…</button></div>
        </div>
      )}
      {mine && declining && (
        <div className="fields">
          <label className="field field-wide"><span className="field-label">Why do you decline to sign it?</span>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} /></label>
          <div className="row gap">
            <button type="button" className="btn btn-danger btn-sm" disabled={busy || !remarks.trim()} onClick={() => onDecline(remarks).then(() => { setDeclining(false); setRemarks(''); }).catch((e) => setError(e.message))}>Decline</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeclining(false)}>Cancel</button>
          </div>
        </div>
      )}

      {canRequest && r?.state === 'open' && r.byUid === me && (
        <button type="button" className="link small" disabled={busy} onClick={() => window.confirm('Withdraw the request? Signatures already on the PDF stay.') && onCancel()}>Withdraw the request</button>
      )}

      {doc.closed && <p className="small muted">Marked processed by {doc.closed.by}, {when(doc.closed.at)}: it is in the Archive.</p>}
      {canRequest && r?.state === 'done' && rows === null && (
        <div className="row gap wrap" style={{ marginBottom: '.5rem' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy}
            onClick={() => window.confirm('Mark it processed? It moves to the Archive and can no longer be changed.') && onProcessed()}>Mark processed</button>
          <span className="xs muted">Everyone has signed: it goes to the Archive.</span>
        </div>
      )}
      {canRequest && r?.state !== 'open' && rows === null && (
        <>
          {!r && <p className="small muted">This document follows no route: ask the people who must sign it, in order, and show each one where to sign on the PDF.</p>}
          <button type="button" className={`btn btn-sm ${r?.state === 'done' ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setRows([])}>{r ? 'Ask for more signatures' : 'Ask for signatures'}</button>
        </>
      )}

      {canRequest && rows !== null && (
        <div className="sr-compose">
          {rows.length > 0 && (
            <ol className="sr-rows">
              {rows.map((x, i) => (
                <li key={x.uid}>
                  <div className="sr-row-head"><b>{i + 1}. {x.name}</b><span className="xs muted">{x.position || x.office}</span></div>
                  <input value={x.label} maxLength={60} placeholder="Signs as" aria-label={`${x.name} signs as`}
                    onChange={(e) => update(rows.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                  <div className="row gap wrap">
                    <button type="button" className={`btn btn-sm ${placements[key(x)] ? 'btn-ghost' : 'btn-primary'}`} onClick={() => place(rows, i)}>
                      {placements[key(x)] ? `Box on page ${placements[key(x)].page + 1} — move it` : 'Show where they sign'}</button>
                    <button type="button" className="btn-icon" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => update(rows.map((y, j) => (j === i - 1 ? rows[i] : j === i ? rows[i - 1] : y)))}>↑</button>
                    <button type="button" className="btn-icon" title="Remove" aria-label={`Remove ${x.name}`} onClick={() => update(rows.filter((_, j) => j !== i))}>×</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {rows.length < SIGNER_LIMIT && (
            <PersonPicker value={null} exclude={rows.map((x) => x.uid)} placeholder="Add who signs: type a name or email…"
              onChange={(p) => p && update([...rows, { uid: p.uid, name: p.displayName || p.email || '', office: p.office || '', position: p.position || '', label: '' }], rows.length)} />
          )}
          <label className="field"><span className="field-label">Note to them (optional)</span>
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
          <p className="xs muted">They sign one after the other, in this order; each is notified when it is their turn. Tap the PDF to show each one where to sign (their box).</p>
          <div className="row gap">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !rows.length || rows.some((x) => !placements[key(x)])} onClick={send}>Send for signature</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={stop}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
