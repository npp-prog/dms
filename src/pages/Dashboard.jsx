import { useLiveRefresh } from '../lib/useLiveRefresh.js';
import { docStage } from '../lib/docStatus.js';
import { isMyTurn } from '../lib/signRequest.js';
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
import { listBoardItems, listBoards, listMyItems } from '../lib/work.js';
import { workload } from '../lib/reports.js';
import { myWorkBuckets, upcomingMilestones } from '../lib/workModel.js';
import { localDay } from '../lib/archiveFiles.js';
import { listProjects } from '../lib/projects.js';


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
  const { user, profile, isAdmin, isHead, isRecords, canManageUsers, setupNotice, dismissSetupNotice } = useAuth();
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
  // My Work: the work items assigned to the user (Boards).
  const [work, setWork] = useState(null);
  useEffect(() => { listMyItems(user.uid).then((l) => setWork(myWorkBuckets(l, user.uid, localDay()))).catch(() => setWork(null)); }, [user.uid]);
  // Milestones of the user's projects due in the next 14 days.
  const [milestones, setMilestones] = useState([]);
  const [projects, setProjects] = useState([]);
  useEffect(() => {
    listProjects({ uid: user.uid }, { all: isAdmin }).then((ps) => { setProjects(ps); setMilestones(upcomingMilestones(ps, localDay())); }).catch(() => setMilestones([]));
  }, [user.uid, isAdmin]);
  // Work by responsible office, on the boards the user is on (the first 10; Reports has them all).
  const [offices, setOffices] = useState([]);
  useEffect(() => {
    listBoards({ uid: user.uid }, { office: profile.office }).then((bs) => Promise.all(bs.slice(0, 10).map((b) => listBoardItems(b.id).catch(() => []))))
      .then((lists) => setOffices(workload(lists.flat(), localDay(), 'office').filter((r) => r.open > 0).slice(0, 6))).catch(() => setOffices([]));
  }, [user.uid]);
  const ongoing = projects.filter((p) => ['planning', 'ongoing', 'on_hold'].includes(p.status)).slice(0, 5);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const live = useLiveRefresh(user.uid); // reload on a new notification

  useEffect(() => {
    Promise.all([
      listDocumentTypes({ activeOnly: true }),
      listDocuments({ uid: user.uid, office: profile.office, all: isAdmin, head: isHead }),
      canManageUsers ? listUsers() : Promise.resolve([]),
    ])
      .then(([t, d, u]) => { setTypes(t.filter((x) => !x.uploadOnly)); setDocs(d); setLoaded(true); setPendingUsers(u.filter((x) => !x.active && !x.deactivated).length); })
      .catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, isHead, canManageUsers, live]);

  const mine = docs.filter((d) => d.createdBy === user.uid);
  const routed = docs.filter((d) => d.workflow).map((d) => ({ d, state: stateOf(d, profile.office, user.uid) }));
  const count = (list, status) => list.filter((d) => d.status === status).length;
  const stageCount = (stage) => docs.filter((d) => docStage(d) === stage).length;
  // Signature requests: documents whose turn to sign is the user's.
  const toSign = docs.filter((d) => isMyTurn(d, user.uid));
  const year = String(new Date().getFullYear());
  const thisYear = docs.filter((d) => String(d.createdAt?.toDate?.().getFullYear()) === year);
  const waiting = profile.office ? docs.filter((d) => d.currentOffice === profile.office).length : 0;
  const firstName = (profile.displayName || '').split(' ')[0];

  const items = [
    canManageUsers && pendingUsers > 0 && <InboxRow key="u" icon="user" tone="red" title="Registrations to approve" sub="New accounts waiting for access" n={pendingUsers} to="/admin/users" />,
    isAdmin && types.length === 0 && <InboxRow key="t" icon="types" tone="red" title="No document formats yet" sub="Load the starter formats or create a document type" n="!" to="/admin/types" />,
    backupsDue > 0 && <InboxRow key="b" icon="archive" tone="red" title="Archive backup due" sub="Back up the archive to the Records Office's devices" n={backupsDue} to="/archive" />,
    toSign.length > 0 && <InboxRow key="sg" icon="sign" tone="red" title="Waiting for your signature" sub={toSign.length === 1 ? `${toSign[0].controlNo}${toSign[0].title ? ` — ${toSign[0].title}` : ''}` : 'Documents you were asked to sign'} n={toSign.length} to={toSign.length === 1 ? `/documents/${toSign[0].id}` : '/documents'} />,
    waiting > 0 && <InboxRow key="w" icon="inbox" tone="blue" title="Waiting in your office" sub="Documents to act on and route to the next office" n={waiting} to="/notifications" />,
    work?.overdue.length > 0 && <InboxRow key="wo" icon="check" tone="red" title="Overdue work" sub="Work items assigned to you, past their due date" n={work.overdue.length} to="/my-work?show=overdue" />,
    work?.today.length > 0 && <InboxRow key="wt" icon="check" tone="blue" title="Work due today" sub="Work items assigned to you, due today" n={work.today.length} to="/my-work?show=today" />,
    work?.blocked.length > 0 && <InboxRow key="wb" icon="check" title="Blocked work" sub="Your work items marked Blocked" n={work.blocked.length} to="/my-work?show=blocked" />,
    milestones.length > 0 && <InboxRow key="ms" icon="folder" tone="blue" title="Upcoming milestones" sub={`Next: ${milestones[0].title} (${milestones[0].projectCode}), due ${milestones[0].dueDate}`} n={milestones.length} to={`/projects/${milestones[0].projectId}`} />,
    work?.upcoming.length > 0 && <InboxRow key="wu" icon="check" title="Work due this week" sub="Work items assigned to you, due in the next 7 days" n={work.upcoming.length} to="/my-work?show=upcoming" />,
    count(mine, 'draft') > 0 && <InboxRow key="d" icon="doc" title="Drafts to finish" sub="Documents you started but have not marked complete" n={count(mine, 'draft')} to="/documents" />,
    mine.filter((d) => d.status === 'complete' && !d.workflow).length > 0 && <InboxRow key="c" icon="send" tone="blue" title="Ready — convert to PDF" sub="Converting a document sends it along its workflow" n={mine.filter((d) => d.status === 'complete' && !d.workflow).length} to="/documents" />,
  ].filter(Boolean);

  const glance = [
    ['Document formats available', types.length, '/new'],
    [`Documents prepared, ${year}`, thisYear.length, '/documents'],
    ['Drafts', stageCount('draft'), '/documents'],
    ['For processing', stageCount('processing'), '/documents'],
    ['Returned', stageCount('returned'), '/documents'],
    ['On hold', stageCount('hold'), '/documents'],
    ['Complete', stageCount('complete'), '/archive'],
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
          {(offices.length > 0 || ongoing.length > 0) && (
            <div className="card">
              <div className="card-head"><h3>Work overview</h3><Link className="btn btn-sm" to="/reports">Reports</Link></div>
              {offices.length > 0 && (
                <ul className="glance">
                  {offices.map((r) => (
                    <li key={r.key || '-'}><Link to={`/reports?tab=aging&office=${encodeURIComponent(r.key || '-')}`}><span>{r.key || 'No office'}</span></Link>
                      <b>{r.open} open{r.overdue > 0 && <span className="wk-due-overdue"> · {r.overdue} overdue</span>}</b></li>
                  ))}
                </ul>
              )}
              {ongoing.length > 0 && (
                <ul className="glance">
                  {ongoing.map((p) => (
                    <li key={p.id}><Link to={`/projects/${p.id}`}><span>{p.code} {p.name}</span></Link>
                      <b><span className="wk-bar"><span style={{ width: `${Number(p.physicalProgress) || 0}%` }} /></span> {Number(p.physicalProgress) || 0}%</b></li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
