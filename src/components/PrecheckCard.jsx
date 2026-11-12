import { useEffect, useRef, useState } from 'react';
import { getPrecheck, startPrecheck } from '../lib/precheckApi.js';
import { SEVERITIES } from '../lib/precheck.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');
const TONE = { high: 'badge-red', medium: 'badge-yellow', low: 'badge-gray' };
const VERDICT = { no_issues: ['No issues found', 'badge-green'], issues: ['Possible issues', 'badge-yellow'], cannot_check: ['Could not check everything', 'badge-gray'] };

// DV pre-audit check (AI): reads the DV, its checklist and every attached PDF, and lists possible
// issues for the Accounting Office. Suggestions only: the reviewer decides; it changes nothing.
// typeCode: DV or LR (its wording).
export default function PrecheckCard({ docId, version, typeCode = 'DV' }) {
  const name = typeCode === 'LR' ? 'Liquidation Report' : 'DV';
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const timer = useRef(null);
  const load = () => getPrecheck(docId).then((x) => { setS(x); setError(''); return x; }).catch((e) => { setError(e.message); return null; });

  useEffect(() => { load(); return () => clearTimeout(timer.current); }, [docId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  // While it runs: ask again every few seconds.
  useEffect(() => {
    clearTimeout(timer.current);
    if (s?.state === 'running') timer.current = setTimeout(load, 4000);
    return () => clearTimeout(timer.current);
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only the Accounting Office runs it; others see a result once there is one.
  if (s && (s.configured === false || s.supported === false || (!s.canRun && !s.result && s.state !== 'running'))) return null;
  const run = async () => {
    setStarting(true); setError('');
    try { await startPrecheck(docId); setS((x) => ({ ...(x || {}), state: 'running', error: '' })); setTimeout(load, 2500); } catch (e) { setError(e.message); } finally { setStarting(false); }
  };
  const r = s?.result;
  const running = s?.state === 'running';
  const [label, tone] = r ? VERDICT[r.verdict] || VERDICT.issues : [];

  return (
    <section className="card precheck-card">
      <div className="card-head"><h3>Pre-audit check (AI)</h3>{r && !running && <span className={`badge ${tone}`}>{label}</span>}</div>
      {error && <div className="alert small">{error}</div>}
      {s?.error && !running && <div className="alert small">{s.error}</div>}
      {!s && !error && <div className="spinner" />}
      {running && <p className="small"><span className="spinner-inline" /> Checking the {name} and its supporting documents… This takes a minute or two; you can keep working.</p>}
      {!r && s && !running && <p className="small muted">{typeCode === 'LR'
        ? 'Reads the Liquidation Report, its checklist and every supporting PDF, and lists what a pre-auditor may question: the cash advance, receipts, totals, the refund or reimbursement, dates, signatures, missing or wrong attachments.'
        : 'Reads the DV, its checklist and every supporting PDF, and lists what a pre-auditor may question: amounts, payee, dates, the OBR, signatures, missing or wrong attachments.'}</p>}
      {r && (
        <>
          {s.stale && !running && <div className="alert-info small">The {name} or its supporting documents changed since this check: run it again.</div>}
          {r.summary && <p className="small">{r.summary}</p>}
          {r.findings.length > 0 && (
            <ul className="precheck-list">
              {r.findings.map((f, i) => (
                <li key={i}>
                  <span className={`badge ${TONE[f.severity]}`}>{SEVERITIES[f.severity]}</span>
                  <div>
                    <b>{f.area}:</b> {f.finding}
                    {(f.where || f.evidence) && <div className="xs muted">{f.where}{f.where && f.evidence ? ' — ' : ''}{f.evidence && <i>“{f.evidence}”</i>}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <details className="xs muted precheck-meta">
            <summary>Checked {when(s.at)} by {s.byName}: {s.read.length} PDF{s.read.length === 1 ? '' : 's'}, {s.pages} page{s.pages === 1 ? '' : 's'}</summary>
            <ul>{s.read.map((f, i) => <li key={i}>{f.label} ({f.pages} p.)</li>)}</ul>
            {s.skipped.length > 0 && <p>Not read: {s.skipped.map((f) => `${f.label} (${f.why})`).join('; ')}</p>}
          </details>
        </>
      )}
      {s && !running && !s.canRun && <p className="xs muted">{s.mine ? 'You prepared this document: the Municipal Accounting Office runs this check; you can read its results here.' : 'Only the Municipal Accounting Office runs this check.'}</p>}
      {s && !running && s.canRun && (
        <div className="row gap wrap" style={{ marginTop: '.5rem' }}>
          <button type="button" className={`btn btn-sm btn-ai${r && !s.stale ? ' btn-ai-quiet' : ''}`} disabled={starting} onClick={run}>
            <svg className="ai-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
            {starting ? 'Starting…' : r ? 'Check again with AI' : 'Run pre-audit check with AI'}
          </button>
        </div>
      )}
      <p className="xs muted">AI suggestions only: it can miss or misread things. The Accounting Office decides; nothing on the {name} is changed.</p>
    </section>
  );
}
