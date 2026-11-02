import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  addIssue, addProgressUpdate, archiveProject, createProject, getProject, listIssues, listProgressUpdates, listProjectItems, listProjects, setIssueStatus, updateProject,
} from '../lib/projects.js';
import { listBoards } from '../lib/work.js';
import {
  ISSUE_TYPES, PROJECT_STATUSES, SEVERITIES, boardRole, canArchive, newCheckId, overdueMilestones, peso, projectStatusOf,
} from '../lib/workModel.js';
import { localDay } from '../lib/archiveFiles.js';
import Select from '../components/Select.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import { LinkEditor } from '../components/DocLinks.jsx';
import MonthCalendar from '../components/MonthCalendar.jsx';
import WorkItemPanel from '../components/WorkItemPanel.jsx';
import { LinkedDocuments, WorkStatus, day } from '../components/WorkBits.jsx';

// Projects (work management, Phase 3): /projects lists the projects the user is on (administrators:
// all) and creates one; /projects/:projectId is a project: overview and progress, milestones, risks
// and issues, its work items (on its related boards), its DMS documents, and a calendar.
export default function Projects() {
  const { projectId } = useParams();
  return projectId ? <Project key={projectId} projectId={projectId} /> : <ProjectList />;
}

const StatusPill = ({ id }) => { const s = projectStatusOf(id); return <span className={`wk-pill wk-${s.tone}`}>{s.label}</span>; };
const Bar = ({ value }) => <span className="wk-bar" title={`${value}% physical progress`}><span style={{ width: `${value}%` }} /></span>;

function ProjectList() {
  const { actor, isAdmin, isHead, settings, profile } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Office heads also see their office's projects. Archived projects: on request.
  useEffect(() => {
    setProjects(null);
    listProjects(actor, { all: isAdmin, headOf: isHead ? profile.office : '', archived: showArchived }).then(setProjects).catch((e) => setError(e.message));
  }, [actor.uid, isAdmin, isHead, profile.office, showArchived]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = localDay();
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Projects</h1></div>
        <div className="row gap">
          <button type="button" className={`btn btn-sm${showArchived ? ' btn-primary' : ' btn-ghost'}`} aria-pressed={showArchived} onClick={() => setShowArchived((x) => !x)}>{showArchived ? 'Back to projects' : 'Archived projects'}</button>
          {!creating && !showArchived && <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New project</button>}
        </div>
      </div>
      {creating && <ProjectForm offices={settings.offices || []} office={profile.office} onCancel={() => setCreating(false)} onCreated={(id) => navigate(`/projects/${id}`)} />}
      {error && <div className="alert">{error}</div>}
      {!projects && !error && <div className="spinner" />}
      {projects && projects.length === 0 && !creating && <p className="muted">{showArchived ? 'No archived projects.' : 'No projects yet.'}</p>}
      {projects && projects.length > 0 && (
        <div className="table-card">
          <table className="data-table wk-table">
            <thead><tr><th>Code</th><th>Project</th><th>Implementing office</th><th>Status</th><th>Physical progress</th><th>Target</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="wk-row" tabIndex={0} onClick={() => navigate(`/projects/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}>
                  <td><b>{p.code}</b></td>
                  <td className="wk-title">{p.name}{overdueMilestones(p, today).length > 0 && <span className="xs wk-due-overdue"> · {overdueMilestones(p, today).length} milestone(s) overdue</span>}</td>
                  <td className="small">{p.office || '—'}</td>
                  <td><StatusPill id={p.status} /></td>
                  <td><Bar value={p.physicalProgress || 0} /> <span className="small">{p.physicalProgress || 0}%</span></td>
                  <td className="small">{p.targetDate ? day(p.targetDate) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// New project, or (project given) its details and people for its managers.
function ProjectForm({ offices, office, project, onCancel, onCreated, onSaved }) {
  const { actor } = useAuth();
  const [f, setF] = useState(() => ({
    code: '', name: '', description: '', office: office || '', startDate: '', targetDate: '', status: 'planning', fundingSource: '',
    ...(project || {}), approvedBudget: project?.approvedBudget ?? '',
  }));
  const role = (u) => ((project?.managers || []).includes(u) ? 'manager' : (project?.members || []).includes(u) ? 'member' : 'viewer');
  const [people, setPeople] = useState(() => (project?.access || []).filter((u) => u !== project.ownerUid)
    .map((u) => ({ uid: u, displayName: project.names?.[u] || 'Someone', role: role(u) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const roles = {
      managers: people.filter((p) => p.role === 'manager').map((p) => p.uid),
      members: people.filter((p) => p.role === 'member').map((p) => p.uid),
      viewers: people.filter((p) => p.role === 'viewer').map((p) => p.uid),
    };
    const names = Object.fromEntries(people.map((p) => [p.uid, p.displayName || p.email || '']));
    try {
      if (project) {
        await updateProject(project.id, { ...f, managers: [...new Set([project.ownerUid, ...roles.managers])], members: roles.members, viewers: roles.viewers, names: { ...project.names, ...names } });
        onSaved();
      } else {
        onCreated(await createProject(f, { ...roles, people: names }, actor));
      }
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <form className="card wk-new" onSubmit={submit}>
      <h3>{project ? 'Project details' : 'New project'}</h3>
      {error && <div className="alert">{error}</div>}
      <div className="wk-grid">
        <label className="field"><span className="field-label">Project code</span><input value={f.code} onChange={set('code')} maxLength={30} required className="caps" /></label>
        <label className="field"><span className="field-label">Name</span><input value={f.name} onChange={set('name')} maxLength={160} required /></label>
        <label className="field"><span className="field-label">Implementing office</span>
          <Select value={f.office} onChange={set('office')}><option value="">—</option>{offices.map((o) => <option key={o} value={o}>{o}</option>)}</Select></label>
        <label className="field"><span className="field-label">Status</span>
          <Select value={f.status} onChange={set('status')}>{PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></label>
        <label className="field"><span className="field-label">Start date</span><input type="date" value={f.startDate} onChange={set('startDate')} /></label>
        <label className="field"><span className="field-label">Target completion</span><input type="date" value={f.targetDate} onChange={set('targetDate')} /></label>
        <label className="field"><span className="field-label">Funding source</span><input value={f.fundingSource} onChange={set('fundingSource')} maxLength={160} />
          <span className="xs muted">Optional. Use one of the LGU's funds or the program it comes from.</span></label>
        <label className="field"><span className="field-label">Approved budget (₱)</span><input inputMode="decimal" value={f.approvedBudget} onChange={set('approvedBudget')} />
          <span className="xs muted">Optional. The approved amount only; obligations and disbursements are not computed here.</span></label>
      </div>
      <label className="field"><span className="field-label">Description</span><textarea rows={3} value={f.description} onChange={set('description')} maxLength={4000} /></label>
      <div className="field"><span className="field-label">Project manager and members</span>
        {people.length > 0 && (
          <ul className="wk-people-list">
            {people.map((p) => (
              <li key={p.uid}><span>{p.displayName || p.email}</span>
                <Select value={p.role} aria-label={`${p.displayName}'s role`} onChange={(e) => setPeople(people.map((x) => (x.uid === p.uid ? { ...x, role: e.target.value } : x)))}>
                  <option value="manager">Manager: details, people and budget</option>
                  <option value="member">Member: milestones, progress, issues, links</option>
                  <option value="viewer">Viewer: reads only</option>
                </Select>
                <button type="button" className="btn-icon" title="Remove" onClick={() => setPeople(people.filter((x) => x.uid !== p.uid))}>×</button></li>
            ))}
          </ul>
        )}
        <PersonPicker value={null} exclude={[actor.uid, project?.ownerUid, ...people.map((p) => p.uid)].filter(Boolean)} placeholder="Add a person: type a name or email…"
          onChange={(p) => p && setPeople([...people, { ...p, role: 'member' }])} />
        <span className="xs muted">{project ? `${project.ownerName} created the project and stays its manager.` : 'You are its manager.'} Being on a project opens none of the DMS documents it links.</span>
      </div>
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : project ? 'Save' : 'Create project'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const TABS = ['Overview', 'Milestones', 'Risks & issues', 'Work items', 'Documents', 'Calendar'];

function Project({ projectId }) {
  const { actor, isAdmin, isHead, profile, settings } = useAuth();
  const [p, setP] = useState(undefined);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');
  const [editing, setEditing] = useState(false);
  const [boards, setBoards] = useState([]);
  const [items, setItems] = useState(null);
  const [panel, setPanel] = useState(null);
  const today = localDay();

  const load = async () => {
    try {
      const proj = await getProject(projectId);
      setP(proj);
      if (proj) {
        const bs = await listBoards(actor, { all: isAdmin }).catch(() => []);
        setBoards(bs);
        setItems(await listProjectItems(proj, bs));
      }
    } catch (e) { setP(null); setError(e.code === 'permission-denied' ? 'You are not on this project.' : e.message); }
  };
  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined) return <div className="page"><div className="spinner" /></div>;
  if (!p) return <div className="page"><div className="alert">{error || 'This project does not exist.'}</div><Link to="/projects">Back to Projects</Link></div>;
  // An archived project is read-only until it is restored.
  const role = p.archived ? 'viewer' : boardRole(p, actor.uid, isAdmin);
  const canEdit = role === 'manager' || role === 'member';
  const archivable = canArchive(p, actor.uid, { isAdmin, isHead, office: profile.office });
  const toggleArchive = async () => {
    if (!p.archived && !window.confirm(`Archive the project "${p.code} ${p.name}"? It becomes read-only and leaves the project list, reports and the Dashboard. It can be restored at any time.`)) return;
    setError('');
    try { await archiveProject(p.id, !p.archived, actor); await load(); } catch (e) { setError(e.code === 'permission-denied' ? 'You may not archive this project.' : e.message); }
  };
  const save = async (patch) => { setError(''); try { await updateProject(p.id, patch); await load(); } catch (e) { setError(e.code === 'permission-denied' ? 'You may not change this.' : e.message); } };

  const calEntries = [
    ...(p.milestones || []).map((m) => ({ day: m.dueDate, key: `m${m.id}`, label: `◆ ${m.title}`, tone: m.done ? 'green' : m.dueDate < today ? 'red' : 'yellow', onOpen: () => setTab('Milestones') })),
    ...(items || []).filter((i) => i.dueDate).map((i) => ({ day: i.dueDate, key: i.id, label: i.title, tone: i.status === 'done' ? 'green' : 'blue', onOpen: () => openItem(i) })),
  ];
  function openItem(i) {
    const b = boards.find((x) => x.id === i.boardId);
    if (b) setPanel({ board: b, item: i });
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/projects">Projects</Link> / {p.code}</div>
          <h1>{p.name} <StatusPill id={p.status} /></h1>
        </div>
        <div className="row gap">
          {role === 'manager' && !editing && <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>Edit details</button>}
          {archivable && <button type="button" className="btn btn-sm" onClick={toggleArchive}>{p.archived ? 'Restore' : 'Archive'}</button>}
        </div>
      </div>
      {p.archived && <div className="alert alert-warn">This project is archived{p.archivedAt ? ` (${String(p.archivedAt).slice(0, 10)})` : ''}: it is read-only, and is left out of the project list, reports and the Dashboard.{archivable ? ' Restore it to work on it again.' : ''}</div>}
      {editing && <ProjectForm project={p} offices={settings.offices || []} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {error && <div className="alert">{error}</div>}
      <div className="tabs view-toggle wk-ptabs">
        {TABS.map((t) => <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && <Overview p={p} canEdit={canEdit} onChanged={load} today={today} />}
      {tab === 'Milestones' && <Milestones p={p} canEdit={canEdit} save={save} today={today} />}
      {tab === 'Risks & issues' && <Issues p={p} canEdit={canEdit} />}
      {tab === 'Work items' && (
        <section className="card">
          <h3>Related boards</h3>
          <ul className="wk-chips">
            {(p.boardIds || []).map((id) => {
              const b = boards.find((x) => x.id === id);
              return <li key={id} className="chip">{b ? <Link to={`/boards/${id}`}>{b.name}</Link> : 'A board you are not on'}
                {canEdit && <button type="button" title="Remove" onClick={() => save({ boardIds: p.boardIds.filter((x) => x !== id) })}>×</button>}</li>;
            })}
            {!(p.boardIds || []).length && <li className="small muted">No board yet.</li>}
          </ul>
          {canEdit && boards.filter((b) => !(p.boardIds || []).includes(b.id)).length > 0 && (
            <Select value="" aria-label="Relate a board" onChange={(e) => e.target.value && save({ boardIds: [...(p.boardIds || []), e.target.value] })}>
              <option value="">Relate a board…</option>
              {boards.filter((b) => !(p.boardIds || []).includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )}
          <h3 style={{ marginTop: '1rem' }}>Work items</h3>
          <p className="xs muted">The items of the related boards whose project is this one (set in the item: Related project).</p>
          {items === null ? <div className="spinner" /> : items.length === 0 ? <p className="small muted">No work item yet.</p> : (
            <table className="data-table wk-table">
              <thead><tr><th>Item</th><th>Board</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>{items.map((i) => (
                <tr key={i.id} className="wk-row" tabIndex={0} onClick={() => openItem(i)} onKeyDown={(e) => e.key === 'Enter' && openItem(i)}>
                  <td className="wk-title"><b>{i.title}</b></td><td className="small">{i.boardName}</td><td><WorkStatus id={i.status} /></td><td className="small">{i.dueDate ? day(i.dueDate) : '—'}</td>
                </tr>))}</tbody>
            </table>
          )}
          {canEdit && (p.boardIds || []).some((id) => boards.some((b) => b.id === id && ['manager', 'member'].includes(boardRole(b, actor.uid, isAdmin)))) && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '.6rem' }}
              onClick={() => { const b = boards.find((x) => (p.boardIds || []).includes(x.id) && ['manager', 'member'].includes(boardRole(x, actor.uid, isAdmin))); setPanel({ board: b, draft: { projectId: p.id, office: p.office } }); }}>+ New work item for this project</button>
          )}
        </section>
      )}
      {tab === 'Documents' && <ProjectDocs p={p} canEdit={canEdit} save={save} />}
      {tab === 'Calendar' && <section className="card"><MonthCalendar entries={calEntries} /><p className="xs muted">◆ milestones (red: overdue, green: done) and the due dates of the project's work items.</p></section>}

      {panel && (
        <>
          <div className="wk-backdrop" onClick={() => setPanel(null)} />
          <WorkItemPanel board={panel.board} item={panel.item || null} draft={panel.draft} role={boardRole(panel.board, actor.uid, isAdmin)}
            onClose={() => setPanel(null)} onSaved={() => { setPanel(null); load(); }} />
        </>
      )}
    </div>
  );
}

function Overview({ p, canEdit, onChanged, today }) {
  const { actor } = useAuth();
  const [updates, setUpdates] = useState(null);
  const [form, setForm] = useState(null); // { physical, note }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { listProgressUpdates(p.id).then(setUpdates).catch(() => setUpdates([])); }, [p.id, p.progressAt]);
  const post = async () => {
    setBusy(true); setError('');
    try { await addProgressUpdate(p, form.physical, form.note, actor); setForm(null); onChanged(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const done = (p.milestones || []).filter((m) => m.done).length;
  return (
    <div className="wk-overview">
      <section className="card">
        <h3>Details</h3>
        <dl className="details">
          <dt>Project code</dt><dd>{p.code}</dd>
          <dt>Implementing office</dt><dd>{p.office || '—'}</dd>
          <dt>Manager</dt><dd>{(p.managers || []).map((u) => p.names?.[u] || 'Someone').join(', ')}</dd>
          <dt>Members</dt><dd>{(p.members || []).map((u) => p.names?.[u] || 'Someone').join(', ') || '—'}</dd>
          <dt>Start</dt><dd>{p.startDate ? day(p.startDate) : '—'}</dd>
          <dt>Target completion</dt><dd>{p.targetDate ? day(p.targetDate) : '—'}{p.targetDate && p.targetDate < today && !['completed', 'cancelled'].includes(p.status) && <span className="xs wk-due-overdue"> past target</span>}</dd>
          <dt>Milestones</dt><dd>{done} of {(p.milestones || []).length} done{overdueMilestones(p, today).length ? `, ${overdueMilestones(p, today).length} overdue` : ''}</dd>
        </dl>
        {p.description && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p>}
      </section>
      <section className="card">
        <h3>Physical progress</h3>
        <div className="wk-progress-big"><Bar value={p.physicalProgress || 0} /> <b>{p.physicalProgress || 0}%</b></div>
        {p.progressNote && <p className="small">{p.progressNote}<span className="xs muted"> · {p.progressAt ? new Date(p.progressAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }) : ''}</span></p>}
        {canEdit && !form && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ physical: p.physicalProgress || 0, note: '' })}>Update progress</button>}
        {form && (
          <div className="wk-progress-form">
            {error && <div className="alert small">{error}</div>}
            <label className="field"><span className="field-label">Physical progress (%)</span>
              <input type="number" min="0" max="100" value={form.physical} onChange={(e) => setForm({ ...form, physical: e.target.value })} /></label>
            <label className="field"><span className="field-label">Explanation (required)</span>
              <textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={2000} />
              <span className="xs muted">What was accomplished, and how it was measured (e.g. inspection report, accomplishment report).</span></label>
            <div className="row gap"><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={post}>Save update</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(null)}>Cancel</button></div>
          </div>
        )}
        <h4 style={{ marginTop: '1rem' }}>Progress updates</h4>
        {updates === null ? <div className="spinner" /> : updates.length === 0 ? <p className="small muted">None yet.</p> : (
          <ul className="wk-updates">{updates.map((u) => <li key={u.id}><b>{u.physical}%</b> {u.note}<div className="xs muted">{u.byName} · {u.at?.toDate?.().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</div></li>)}</ul>
        )}
      </section>
      <section className="card">
        <h3>Funding</h3>
        <dl className="details">
          <dt>Funding source</dt><dd>{p.fundingSource || '—'}</dd>
          <dt>Approved budget</dt><dd>{peso(p.approvedBudget)}</dd>
        </dl>
        <p className="xs muted">Financial figures are kept apart from physical progress. Obligations and disbursements are not computed from document amounts.</p>
      </section>
    </div>
  );
}

function Milestones({ p, canEdit, save, today }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const list = useMemo(() => [...(p.milestones || [])].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')), [p.milestones]);
  const toggle = (m) => save({ milestones: p.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done, doneOn: !x.done ? today : '' } : x)) });
  return (
    <section className="card">
      <h3>Milestones</h3>
      {list.length === 0 ? <p className="small muted">No milestones yet.</p> : (
        <ul className="wk-check">
          {list.map((m) => (
            <li key={m.id}>
              <label className="check"><input type="checkbox" checked={m.done} disabled={!canEdit} onChange={() => toggle(m)} />
                <span className={m.done ? 'wk-done' : ''}>{m.title}</span>
                <span className={`xs ${!m.done && m.dueDate && m.dueDate < today ? 'wk-due-overdue' : 'muted'}`}>{m.dueDate ? ` · due ${day(m.dueDate)}` : ''}{m.done && m.doneOn ? ` · done ${day(m.doneOn)}` : ''}</span></label>
              {canEdit && <button type="button" className="btn-icon" title="Remove" onClick={() => window.confirm(`Remove the milestone "${m.title}"?`) && save({ milestones: p.milestones.filter((x) => x.id !== m.id) })}>×</button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="row gap wrap">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} aria-label="Milestone" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <button type="button" className="btn btn-ghost btn-sm" disabled={!title.trim()}
            onClick={() => { save({ milestones: [...(p.milestones || []), { id: newCheckId(), title, dueDate: due, done: false }] }); setTitle(''); setDue(''); }}>Add milestone</button>
        </div>
      )}
    </section>
  );
}

function Issues({ p, canEdit }) {
  const { actor } = useAuth();
  const [list, setList] = useState(null);
  const [f, setF] = useState({ type: 'issue', title: '', description: '', severity: 'medium' });
  const [error, setError] = useState('');
  const load = () => listIssues(p.id).then(setList).catch((e) => { setError(e.message); setList([]); });
  useEffect(() => { load(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => { setError(''); try { await addIssue(p.id, f, actor); setF({ ...f, title: '', description: '' }); load(); } catch (e) { setError(e.message); } };
  const label = (arr, id) => arr.find((x) => x.id === id)?.label || id;
  return (
    <section className="card">
      <h3>Risks, issues and blockers</h3>
      {error && <div className="alert small">{error}</div>}
      {list === null ? <div className="spinner" /> : list.length === 0 ? <p className="small muted">None recorded.</p> : (
        <table className="data-table wk-table">
          <thead><tr><th>Type</th><th>What</th><th>Severity</th><th>Status</th><th /></tr></thead>
          <tbody>{list.map((i) => (
            <tr key={i.id}>
              <td><span className={`wk-pill wk-${i.type === 'blocker' ? 'red' : i.type === 'risk' ? 'yellow' : 'blue'}`}>{label(ISSUE_TYPES, i.type)}</span></td>
              <td className="wk-title"><b>{i.title}</b>{i.description && <div className="xs muted">{i.description}</div>}<div className="xs muted">{i.createdByName}</div></td>
              <td className="small">{label(SEVERITIES, i.severity)}</td>
              <td className="small">{i.status === 'resolved' ? `Resolved ${i.resolvedOn || ''}` : 'Open'}</td>
              <td>{canEdit && <button type="button" className="link small" onClick={() => setIssueStatus(p.id, i.id, i.status === 'open' ? 'resolved' : 'open', actor).then(load)}>{i.status === 'open' ? 'Mark resolved' : 'Reopen'}</button>}</td>
            </tr>))}</tbody>
        </table>
      )}
      {canEdit && (
        <div className="wk-grid" style={{ marginTop: '.8rem' }}>
          <label className="field"><span className="field-label">Type</span>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{ISSUE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></label>
          <label className="field"><span className="field-label">Severity</span>
            <Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>{SEVERITIES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></label>
          <label className="field"><span className="field-label">What is it</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} /></label>
          <label className="field"><span className="field-label">Details</span><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} /></label>
          <div><button type="button" className="btn btn-ghost btn-sm" disabled={!f.title.trim()} onClick={add}>Add</button></div>
        </div>
      )}
    </section>
  );
}

function ProjectDocs({ p, canEdit, save }) {
  const [linking, setLinking] = useState(false);
  return (
    <section className="card">
      <h3>Linked DMS documents</h3>
      <LinkedDocuments docRefs={p.docRefs || []} onRemove={canEdit ? (id) => save({ docRefs: p.docRefs.filter((x) => x !== id) }) : undefined} />
      {canEdit && (linking
        ? <LinkEditor onCancel={() => setLinking(false)} onAdd={(l) => { setLinking(false); if (!(p.docRefs || []).includes(l.id)) save({ docRefs: [...(p.docRefs || []), l.id] }); }} />
        : <div className="row gap small"><button type="button" className="link" onClick={() => setLinking(true)}>+ Link a DMS document</button>
          <Link to="/upload" target="_blank" rel="noopener" className="link">Upload a new document</Link></div>)}
      <p className="xs muted">Documents stay in the DMS with their own route and approvals. People on the project who may not open one see it as restricted.</p>
    </section>
  );
}
