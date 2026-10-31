import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listForwarded, listInbox, listReferred } from '../lib/api.js';
import { HIDDEN_EVENTS, officeOf } from '../lib/workflow.js';
import Select from '../components/Select.jsx';
import { drnOf } from '../lib/naming.js';
import { deleteNotification, listCirculars, markNotificationsRead, toReceive, watchNotifications } from '../lib/social.js';

const ago = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const KIND = { document: 'Document', circular: 'Circular', community: 'Community' };

// What happened to the user's documents, circulars for their office, communities: newest first.
function Updates({ uid, external = false }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => watchNotifications(uid, setItems, (e) => setError(e.code === 'permission-denied'
    ? 'Updates are not switched on yet: an administrator must publish the latest firestore.rules (Firebase console → Firestore → Rules).'
    : e.message)), [uid]);
  const unread = (items || []).filter((n) => !n.read);
  const open = (n) => {
    if (!n.read) markNotificationsRead(uid, [n.id]).catch(() => {});
    if (n.link) navigate(n.link);
  };
  return (
    <>
      <div className="inbox-head">
        <h2 className="inbox-sub">Updates{unread.length > 0 && <span className="badge badge-blue">{unread.length} new</span>}</h2>
        {unread.length > 0 && <button type="button" className="link small" onClick={() => markNotificationsRead(uid, unread.map((n) => n.id)).catch(() => {})}>Mark all as read</button>}
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card updates">
        {!items && !error && <div className="spinner" />}
        {items?.length === 0 && <p className="small muted">{external ? 'No updates yet.' : 'No updates yet. When your documents move, or a circular or community message comes, it shows here.'}</p>}
        <ul>
          {(items || []).map((n) => (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              <button type="button" className="update-main" onClick={() => open(n)}>
                <span className="badge badge-gray">{KIND[n.kind] || 'Update'}</span>
                <span className="update-text">{n.text}</span>
                <span className="xs muted">{n.fromName} · {ago(n.at)}</span>
              </button>
              <button type="button" className="btn-icon" title="Remove" aria-label="Remove" onClick={() => deleteNotification(uid, n.id).catch(() => {})}>×</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

const since = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// Documents waiting in the user's office along their workflow. Admins can see every office.
export default function Inbox() {
  const { user, profile, isAdmin, isHead, isExternal, settings } = useAuth();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  // Documents someone forwarded to this user.
  const [forwarded, setForwarded] = useState(null);
  useEffect(() => { listForwarded(user.uid).then(setForwarded).catch(() => setForwarded([])); }, [user.uid]);
  // A supplier or payee: the documents they signed and sent back (still open to them).
  const [sentBack, setSentBack] = useState([]);
  useEffect(() => {
    if (isExternal) listReferred(user.uid).then((l) => setSentBack(l.filter((d) => d.currentOffice !== `person:${user.uid}`))).catch(() => {});
  }, [user.uid, isExternal]);
  const [office, setOffice] = useState(profile.office || '');

  useEffect(() => {
    setDocs(null);
    const all = isAdmin && !office;
    // An office head (or an admin) sees everything waiting in the office; staff, what is routed to
    // the office and their own documents at the preparer's step.
    listInbox({ office, all, uid: user.uid, head: isHead || isAdmin }).then(setDocs).catch((e) => setError(e.message));
  }, [office, isAdmin, isHead, user.uid]);

  // Circulars for the user's office not marked received yet.
  const [circulars, setCirculars] = useState([]);
  useEffect(() => {
    if (!isExternal) listCirculars({ office: profile.office, uid: user.uid, isAdmin: false }).then((l) => setCirculars(toReceive(l, profile.office))).catch(() => {});
  }, [profile.office, user.uid]);

  const offices = useMemo(() => [...new Set([...(settings.offices || []), ...(profile.office ? [profile.office] : [])])].sort(), [settings.offices, profile.office]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{isExternal ? 'Documents for you' : 'Notifications'}</h1>
        </div>
        {isAdmin && (
          <Select value={office} onChange={(e) => setOffice(e.target.value)} aria-label="Office">
            <option value="">All offices</option>
            {offices.map((o) => <option key={o}>{o}</option>)}
          </Select>
        )}
      </div>
      <Updates uid={user.uid} external={isExternal} />
      {circulars.length > 0 && (
        <>
          <h2 className="inbox-sub">Circulars to receive</h2>
          <div className="card updates">
            <ul>
              {circulars.map((c) => (
                <li key={c.id} className="unread">
                  <Link className="update-main" to={`/circulars/${c.id}`}>
                    <span className="badge badge-yellow">{c.kind}</span>
                    <span className="update-text">{c.title}</span>
                    <span className="xs muted">{c.fromOffice || c.byName} · {ago(c.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <h2 className="inbox-sub">{office ? `Waiting in ${office}` : isAdmin ? 'Waiting in every office' : 'Waiting for you'}</h2>
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Control No.</th><th title="Document Reference No.: the number assigned along the route (e.g. the DV No.)">DRN</th><th>Type</th><th>Payee / Subject</th><th>From</th>{!office && <th>Now at</th>}<th>Step</th><th>Status</th><th>Since</th></tr></thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan={9} className="muted">Nothing waiting. {office ? 'Documents routed to your office appear here.' : ''}</td></tr>}
              {docs.map((d) => {
                const wf = d.workflow;
                const step = wf.steps[wf.stage];
                return (
                  <tr key={d.id}>
                    <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                    <td className="small">{drnOf(d) || '—'}</td>
                    <td>{d.typeCode}</td>
                    <td>{d.title}</td>
                    <td className="small">{d.office || d.createdByName}</td>
                    {!office && <td className="small">{wf.referral ? `${wf.referral.name} (referred)` : officeOf(step, d) || 'Requesting office'}</td>}
                    <td className="small">{wf.referral
                      ? <><span className="badge badge-blue">Referred{wf.referral.uid === user.uid ? ' to you' : ''}</span> by {wf.referral.by}{wf.referral.note && <> — <i>{wf.referral.note}</i></>}</>
                      : step.action}</td>
                    <td>{wf.events.filter((e) => !HIDDEN_EVENTS.has(e.type)).at(-1)?.type === 'returned'
                      ? <span className="badge badge-red">Returned</span>
                      : <span className="badge badge-blue">{wf.referral ? 'Referred' : 'Routed'}</span>}</td>
                    <td className="small">{since(d.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sentBack.length > 0 && (
        <>
          <h2 className="inbox-sub">Sent back</h2>
          <div className="card table-card">
            <table className="data-table">
              <thead><tr><th>Control No.</th><th>Type</th><th>Payee / Subject</th><th>From</th><th>Where</th></tr></thead>
              <tbody>
                {sentBack.map((d) => (
                  <tr key={d.id}>
                    <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                    <td>{d.typeCode}</td>
                    <td>{d.title}</td>
                    <td className="small">{d.office || d.createdByName}</td>
                    <td className="small">{d.workflow?.state === 'done' ? 'Processed' : d.workflow?.state === 'cancelled' ? 'Cancelled' : officeOf(d.workflow?.steps?.[d.workflow.stage], d) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {forwarded && forwarded.length > 0 && (
        <>
          <h2 className="inbox-sub">Forwarded to you</h2>
          <div className="card table-card">
            <table className="data-table">
              <thead><tr><th>Control No.</th><th title="Document Reference No.: the number assigned along the route (e.g. the DV No.)">DRN</th><th>Type</th><th>Payee / Subject</th><th>From</th><th>Note</th><th>When</th></tr></thead>
              <tbody>
                {forwarded.map((d) => {
                  const f = [...(d.forwards || [])].reverse().find((x) => x.to === user.uid) || {};
                  return (
                    <tr key={d.id}>
                      <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                    <td className="small">{drnOf(d) || '—'}</td>
                      <td>{d.typeCode}</td>
                      <td>{d.title}</td>
                      <td className="small">{f.by}</td>
                      <td className="small">{f.kind === 'review' && <span className="badge badge-blue">For review</span>} {f.note || (f.kind === 'review' ? '' : '—')}</td>
                      <td className="small">{f.at ? new Date(f.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}