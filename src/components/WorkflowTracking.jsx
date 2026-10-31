import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import { HIDDEN_EVENTS, officeOf } from '../lib/workflow.js';
import Select from './Select.jsx';
import Icon from './Icon.jsx';
import { drnOf } from '../lib/naming.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const EVENT = { started: 'Started', released: 'Routed', returned: 'Returned', completed: 'Processed', cancelled: 'Cancelled', assigned: 'Assigned', route: 'Offices chosen', referred: 'Referred', 'referral back': 'Sent back' };

// Where a routed document is: its state for the filters.
export function stateOf(d, office, uid = '') {
  const wf = d.workflow;
  if (wf.state === 'done') return 'done';
  if (wf.state === 'cancelled') return 'cancelled';
  if (wf.referral) return uid && wf.referral.uid === uid ? 'mine' : 'moving';
  if (office && officeOf(wf.steps[wf.stage], d) === office) return 'mine';
  if (wf.events.filter((e) => !HIDDEN_EVENTS.has(e.type)).at(-1)?.type === 'returned') return 'returned';
  return 'moving';
}

const VIEW_ICONS = { active: 'send', mine: 'inbox', returned: 'return', done: 'check', all: 'workflow' };

// The tracking views and which documents each holds (also the Dashboard's tracking status).
export function trackingViews(office) {
  return [
    ['active', 'On the move', (r) => !['done', 'cancelled'].includes(r.state)],
    ...(office ? [['mine', 'In your office', (r) => r.state === 'mine']] : []),
    ['returned', 'Returned', (r) => r.state === 'returned' || (r.state === 'mine' && r.d.workflow.events.filter((e) => !HIDDEN_EVENTS.has(e.type)).at(-1)?.type === 'returned')],
    ['done', 'Processed', (r) => r.state === 'done'],
    ['all', 'All routed', () => true],
  ];
}

// Every routed document, where it is on its route, and what happened last
// (Administration > Workflow > Tracking).
export default function WorkflowTracking() {
  const { user, profile, isAdmin, isHead, settings } = useAuth();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const [view, setView] = useState(params.get('view') || 'active');
  const [q, setQ] = useState('');
  const [at, setAt] = useState('');

  useEffect(() => {
    listDocuments({ uid: user.uid, office: profile.office, all: isAdmin, head: isHead })
      .then((d) => setDocs(d.filter((x) => x.workflow)))
      .catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, isHead]);

  const rows = useMemo(() => (docs || []).map((d) => ({ d, state: stateOf(d, profile.office, user.uid) })), [docs, profile.office, user.uid]);
  const count = (fn) => rows.filter(fn).length;
  const views = trackingViews(profile.office);
  const offices = useMemo(() => [...new Set([...(settings.offices || []),
    ...rows.map(({ d }) => officeOf(d.workflow.steps[d.workflow.stage], d)).filter(Boolean)])].sort(), [rows, settings.offices]);
  const pick = views.find((v) => v[0] === view)?.[2] || (() => true);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(pick)
    .filter(({ d }) => !at || (d.workflow.state === 'in-progress' && officeOf(d.workflow.steps[d.workflow.stage], d) === at))
    .filter(({ d }) => words.every((w) => `${d.controlNo} ${drnOf(d)} ${d.typeCode} ${d.title} ${d.createdByName} ${d.office}`.toLowerCase().includes(w)));

  return (
    <>
      <div className="stats wf-views">
        {views.map(([key, label, fn]) => (
          <button key={key} type="button" className={`stat${view === key ? ' active' : ''}`} aria-pressed={view === key} onClick={() => setView(key)}>
            <Icon name={VIEW_ICONS[key]} /><span className="n">{docs ? count(fn) : '…'}</span><span className="l">{label}</span>
          </button>
        ))}
      </div>

      <div className="filters">
        <input className="search" placeholder="Search control no., DRN, payee, office…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={at} onChange={(e) => setAt(e.target.value)} aria-label="Now at">
          <option value="">Now at: any office</option>
          {offices.map((o) => <option key={o}>{o}</option>)}
        </Select>
      </div>

      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table wf-table">
            <thead><tr><th>Control No.</th><th title="Document Reference No.: the number assigned along the route (e.g. the DV No.)">DRN</th><th>Payee / Subject</th><th>Route</th><th>Now at</th><th>Last action</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="muted">No documents here. A document is routed when it is marked complete.</td></tr>}
              {shown.map(({ d, state }) => {
                const wf = d.workflow;
                const last = wf.events.filter((e) => !HIDDEN_EVENTS.has(e.type)).at(-1);
                const step = wf.steps[wf.stage];
                return (
                  <tr key={d.id}>
                    <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link><div className="small muted">{d.typeCode}</div></td>
                    <td className="small">{drnOf(d) || '—'}</td>
                    <td>{d.title}<div className="small muted">{d.office || d.createdByName}</div></td>
                    <td>
                      <div className="wf-mini" title={wf.steps.map((s, i) => `${i + 1}. ${officeOf(s, d) || 'Requesting office'}`).join('\n')}>
                        {wf.steps.map((s, i) => {
                          const cls = wf.state === 'done' || i < wf.stage ? 'done' : i === wf.stage && wf.state === 'in-progress' ? 'now' : '';
                          return <span key={i} className={`wf-pip ${cls}`} />;
                        })}
                      </div>
                      <div className="small muted">{wf.state === 'done' ? 'Processed' : wf.state === 'cancelled' ? 'Cancelled' : `Step ${wf.stage + 1} of ${wf.steps.length}`}</div>
                    </td>
                    <td>
                      {wf.state === 'in-progress' ? (
                        <>
                          <b>{officeOf(step, d) || 'Requesting office'}</b>
                          <div className="small">{step.action}</div>
                          {wf.referral && <div className="small">Referred to <b>{wf.referral.name}</b></div>}
                          {last?.type === 'returned' && <span className="badge badge-red">Returned</span>}
                        </>
                      ) : <span className={`badge ${wf.state === 'done' ? 'badge-green' : 'badge-gray'}`}>{wf.state === 'done' ? 'Processed' : 'Cancelled'}</span>}
                    </td>
                    <td className="small">
                      {last && <>{EVENT[last.type]} by {last.by}<div className="muted">{when(last.at)}</div>
                        {last.remarks && <div className={last.type === 'returned' ? 'wf-returned' : 'muted'}><i>{last.remarks}</i></div>}</>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
