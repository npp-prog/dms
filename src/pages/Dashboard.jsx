import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments, listDocumentTypes, listUsers } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Icon, { Avatar } from '../components/Icon.jsx';
import { stateOf, trackingViews } from '../components/WorkflowTracking.jsx';
import NotesCard from '../components/NotesCard.jsx';
import { drnOf } from '../lib/naming.js';
import { backupStatus, getArchiveSettings, listBackups } from '../lib/archive.js';
import { ROLE_NAMES } from '../lib/roles.js';


function greeting() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function InboxRow({ icon, tone = '', title, sub, n, to }) {
  return (
    <li>
      <Link to={to}>
        <span className={`ic ${tone}`}><Icon name={icon} /></span>
        <span className="t"><b>{title}</b><span>{sub}</span></span>
        <span className="n">{n}</span>
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const { user, profile, isAdmin, isHead, isRecords, setupNotice, dismissSetupNotice } = useAuth();
  // The Records Officer: archive backups that are due (none yet, or older than the schedule).
  const [backupsDue, setBackupsDue] = useState(0);
  useEffect(() => {
    if (!isRecords) return;
    Promise.all([getArchiveSettings(), listBackups()])
      .then(([s, b]) => setBackupsDue(s.devices.length ? backupStatus(b, s).filter((d) => d.due).length : 1)).catch(() => {});
  }, [isRecords]);
  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [pendingUsers, setPendingUsers] = useState(0);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      listDocumentTypes({ activeOnly: true }),
      listDocuments({ uid: user.uid, office: profile.office, all: isAdmin, head: isHead }),
      isAdmin ? listUsers() : Promise.resolve([]),
    ])
      .then(([t, d, u]) => { setTypes(t.filter((x) => !x.uploadOnly)); setDocs(d); setLoaded(true); setPendingUsers(u.filter((x) => !x.active).length); })
      .catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, isHead]);

  const mine = docs.filter((d) => d.createdBy === user.uid);
  const routed = docs.filter((d) => d.workflow).map((d) => ({ d, state: stateOf(d, profile.office, user.uid) }));
  const count = (list, status) => list.filter((d) => d.status === status).length;
  const year = String(new Date().getFullYear());
  const thisYear = docs.filter((d) => String(d.createdAt?.toDate?.().getFullYear()) === year);
  const waiting = profile.office ? docs.filter((d) => d.currentOffice === profile.office).length : 0;
  const firstName = (profile.displayName || '').split(' ')[0];

  const items = [
    isAdmin && pendingUsers > 0 && <InboxRow key="u" icon="user" tone="red" title="Registrations to approve" sub="New accounts waiting for access" n={pendingUsers} to="/admin/users" />,
    isAdmin && types.length === 0 && <InboxRow key="t" icon="types" tone="red" title="No document formats yet" sub="Load the starter formats or create a document type" n="!" to="/admin/types" />,
    backupsDue > 0 && <InboxRow key="b" icon="archive" tone="red" title="Archive backup due" sub="Back up the archive to the Records Office's devices" n={backupsDue} to="/archive" />,
    waiting > 0 && <InboxRow key="w" icon="inbox" tone="blue" title="Waiting in your office" sub="Documents to act on and route to the next office" n={waiting} to="/notifications" />,
    count(mine, 'draft') > 0 && <InboxRow key="d" icon="doc" title="Drafts to finish" sub="Documents you started but have not marked complete" n={count(mine, 'draft')} to="/documents" />,
    mine.filter((d) => d.status === 'complete' && !d.workflow).length > 0 && <InboxRow key="c" icon="send" tone="blue" title="Complete — convert to PDF" sub="Converting a document sends it along its workflow" n={mine.filter((d) => d.status === 'complete' && !d.workflow).length} to="/documents" />,
  ].filter(Boolean);

  const glance = [
    ['Document formats available', types.length, '/new'],
    [`Documents prepared, ${year}`, thisYear.length, '/documents'],
    ['Drafts', count(docs, 'draft'), '/documents'],
    ['Complete', count(docs, 'complete'), '/documents'],
    ['Cancelled', count(docs, 'cancelled'), '/documents'],
  ];

  return (
    <div className="page">
      <div className="home-head">
        <Avatar name={profile.displayName || profile.email} photo={profile.photo} size="lg" />
        <div className="grow">
          <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p>{profile.position || ROLE_NAMES[profile.role] || profile.role}{profile.office ? ` · ${profile.office}` : ''}</p>
        </div>
        <Link to="/new" className="btn btn-primary">+ New document</Link>
      </div>
      {error && <div className="alert">{error}</div>}
      {setupNotice.length > 0 && (
        <div className="alert alert-ok row gap" style={{ justifyContent: 'space-between' }}>
          <span><b>DMS is up to date.</b> It {setupNotice.join(', ')}. Review them under Document Types, Checklists and Settings.</span>
          <button className="btn btn-sm" onClick={dismissSetupNotice}>OK</button>
        </div>
      )}

      {/* Tracking status: the routed documents this user can see, by where they are; each opens Tracking. */}
      <div className="track-status">
        {trackingViews(profile.office).map(([key, label, fn]) => (
          <Link key={key} to={`/tracking?view=${key}`} className={`track-tile t-${key}`}>
            <span className="l">{label}</span>
            <span className="n">{loaded ? routed.filter(fn).length : '…'}</span>
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <div>
          <div className="card">
            <div className="card-head"><h3>Needs your attention</h3><span className="small muted">{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : ''}</span></div>
            <ul className="inbox">
              {items.length ? items : (
                <li><div className="item"><span className="ic green"><Icon name="check" /></span>
                  <span className="t"><b>You&rsquo;re all caught up</b><span>Nothing is waiting for you.</span></span></div></li>
              )}
            </ul>
          </div>
          <NotesCard uid={user.uid} />
        </div>
        <div>
          <div className="card">
            <div className="card-head"><h3>At a glance</h3><span className="small muted">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
            <ul className="glance">
              {glance.map(([l, v, to]) => <li key={l}><Link to={to}><span>{l}</span></Link><b>{v}</b></li>)}
            </ul>
          </div>
          <div className="card">
            <div className="card-head"><h3>Recent documents</h3><Link className="btn btn-sm" to="/documents">Open list</Link></div>
            <ul className="upcoming">
              {docs.slice(0, 6).map((d) => (
                <li key={d.id}>
                  <span><span className="when">{d.updatedAt?.toDate?.().toLocaleString() || ''}</span>
                    <Link to={`/documents/${d.id}`}>{d.controlNo}</Link>{drnOf(d) && <span className="drn"> · DRN {drnOf(d)}</span>} — {d.title}</span>
                  <StatusBadge doc={d} />
                </li>
              ))}
              {docs.length === 0 && <li className="muted">Nothing prepared yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
