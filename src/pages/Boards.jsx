import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createBoard, getBoard, listBoardItems, listBoards, updateBoard } from '../lib/work.js';
import { BOARD_TEMPLATES, SORTS, WORK_STATUSES, boardRole, dueState, nextGroupId, templateOf } from '../lib/workModel.js';
import { localDay } from '../lib/archiveFiles.js';
import Select from '../components/Select.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import WorkItemPanel from '../components/WorkItemPanel.jsx';
import { Assignees, Priority, WorkStatus, day } from '../components/WorkBits.jsx';

// Boards (work management): /boards lists the boards the user is on (administrators: all) and
// creates one from a template; /boards/:boardId is a board: its groups of work items as a table,
// filters, the item details panel and (managers) its settings.
export default function Boards() {
  const { boardId } = useParams();
  return boardId ? <Board key={boardId} boardId={boardId} /> : <BoardList />;
}

function BoardList() {
  const { actor, isAdmin, settings, profile } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { listBoards(actor, { all: isAdmin }).then(setBoards).catch((e) => setError(e.message)); }, [actor.uid, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Boards</h1></div>
        {!creating && <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New board</button>}
      </div>
      {creating && <NewBoard offices={settings.offices || []} office={profile.office} onCancel={() => setCreating(false)}
        onCreated={(id) => navigate(`/boards/${id}`)} actor={actor} />}
      {error && <div className="alert">{error}</div>}
      {!boards && !error && <div className="spinner" />}
      {boards && boards.length === 0 && !creating && <p className="muted">No boards yet. Create one for your office's tasks, transactions or projects.</p>}
      {boards && boards.length > 0 && (
        <div className="wk-board-tiles">
          {boards.map((b) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="wk-board-tile">
              <b>{b.name}</b>
              <span className="small muted">{templateOf(b.template).name}{b.office ? ` · ${b.office}` : ''}</span>
              <span className="xs muted">{(b.access || []).length} people · {(b.groups || []).length} groups</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewBoard({ offices, office, onCancel, onCreated, actor }) {
  const [f, setF] = useState({ name: '', description: '', template: 'office', office: office || '' });
  const [people, setPeople] = useState([]); // [{ uid, displayName, role }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = templateOf(f.template);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const id = await createBoard({
        ...f,
        managers: people.filter((p) => p.role === 'manager').map((p) => p.uid),
        members: people.filter((p) => p.role === 'member').map((p) => p.uid),
        viewers: people.filter((p) => p.role === 'viewer').map((p) => p.uid),
        people: Object.fromEntries(people.map((p) => [p.uid, p.displayName || p.email || ''])),
      }, actor);
      onCreated(id);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <form className="card wk-new" onSubmit={submit}>
      <h3>New board</h3>
      {error && <div className="alert">{error}</div>}
      <div className="wk-grid">
        <label className="field"><span className="field-label">Name</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required /></label>
        <label className="field"><span className="field-label">Template</span>
          <Select value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>
            {BOARD_TEMPLATES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <span className="xs muted">{t.description} Groups: {t.groups.join(', ')}. You can change them later.</span></label>
        <label className="field"><span className="field-label">Office</span>
          <Select value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })}>
            <option value="">—</option>
            {offices.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select></label>
      </div>
      <label className="field"><span className="field-label">Description</span>
        <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></label>
      <PeopleEditor people={people} onChange={setPeople} exclude={[actor.uid]} />
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create board'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// The people of a board: added by name or email, each a member (works on items) or a viewer.
function PeopleEditor({ people, onChange, exclude = [] }) {
  return (
    <div className="field"><span className="field-label">People</span>
      {people.length > 0 && (
        <ul className="wk-people-list">
          {people.map((p) => (
            <li key={p.uid}>
              <span>{p.displayName || p.email}</span>
              <Select value={p.role} aria-label={`${p.displayName}'s role on the board`}
                onChange={(e) => onChange(people.map((x) => (x.uid === p.uid ? { ...x, role: e.target.value } : x)))}>
                <option value="manager">Manager: settings and people</option>
                <option value="member">Member: creates, edits and assigns items</option>
                <option value="viewer">Viewer: reads only</option>
              </Select>
              <button type="button" className="btn-icon" title="Remove" onClick={() => onChange(people.filter((x) => x.uid !== p.uid))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <PersonPicker value={null} exclude={[...exclude, ...people.map((p) => p.uid)]} placeholder="Add a person: type a name or email…"
        onChange={(p) => p && onChange([...people, { ...p, role: 'member' }])} />
      <span className="xs muted">Being on a board does not open the DMS documents its items link: each document keeps its own access.</span>
    </div>
  );
}

function Board({ boardId }) {
  const { actor, isAdmin } = useAuth();
  const [board, setBoard] = useState(undefined);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // { item } or { draft }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState('due');
  const today = localDay();

  const load = async () => {
    try {
      const b = await getBoard(boardId);
      setBoard(b);
      if (b) setItems(await listBoardItems(boardId));
    } catch (e) {
      setBoard(null);
      setError(e.code === 'permission-denied' ? 'You are not on this board.' : e.message);
    }
  };
  useEffect(() => { load(); }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = boardRole(board, actor.uid, isAdmin);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (items || [])
      .filter((i) => (!status || i.status === status) && (!mine || (i.assignees || []).includes(actor.uid))
        && words.every((w) => `${i.title} ${i.description || ''} ${(i.tags || []).join(' ')} ${i.office || ''}`.toLowerCase().includes(w)))
      .sort(SORTS[sort] || SORTS.due);
  }, [items, q, status, mine, sort, actor.uid]);

  if (board === undefined) return <div className="page"><div className="spinner" /></div>;
  if (!board) return <div className="page"><div className="alert">{error || 'This board does not exist.'}</div><Link to="/boards">Back to Boards</Link></div>;

  const canEdit = role === 'manager' || role === 'member';
  return (
    <div className="page wk-board">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/boards">Boards</Link> / {templateOf(board.template).name}</div>
          <h1>{board.name}</h1>
        </div>
        <div className="row gap">
          {role === 'manager' && <button type="button" className={`btn btn-sm${settingsOpen ? ' btn-primary' : ''}`} onClick={() => setSettingsOpen((x) => !x)}>Settings</button>}
        </div>
      </div>
      {settingsOpen && <BoardSettings board={board} onSaved={() => { setSettingsOpen(false); load(); }} />}
      <div className="filters wk-filters">
        <input className="search" placeholder="Search work items…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {WORK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="due">By due date</option><option value="priority">By priority</option>
          <option value="status">By status</option><option value="title">By title</option><option value="created">Newest first</option>
        </Select>
        <label className="check small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me</label>
      </div>
      {!items ? <div className="spinner" /> : (board.groups || []).map((g) => {
        const rows = shown.filter((i) => i.groupId === g.id || (!board.groups.some((x) => x.id === i.groupId) && g === board.groups[0]));
        return (
          <section key={g.id} className="wk-group">
            <div className="wk-group-head"><h3>{g.name}</h3><span className="xs muted">{rows.length}</span></div>
            <div className="table-card wk-table-wrap">
              <table className="data-table wk-table">
                <thead><tr><th>Item</th><th>Status</th><th>Priority</th><th>Assigned</th><th>Office</th><th>Due</th><th>Docs</th></tr></thead>
                <tbody>
                  {rows.map((i) => {
                    const ds = dueState(i, today);
                    return (
                      <tr key={i.id} className="wk-row" onClick={() => setOpen({ item: i })} tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setOpen({ item: i })}>
                        <td className="wk-title"><b>{i.title}</b>{(i.tags || []).length > 0 && <span className="xs muted"> {i.tags.join(', ')}</span>}</td>
                        <td><WorkStatus id={i.status} /></td>
                        <td><Priority id={i.priority} /></td>
                        <td><Assignees item={i} names={board.names} /></td>
                        <td className="small">{i.office || '—'}</td>
                        <td className={`small wk-due wk-due-${ds}`}>{i.dueDate ? day(i.dueDate) : '—'}{ds === 'overdue' && <span className="xs"> overdue</span>}</td>
                        <td className="small">{(i.docRefs || []).length || '—'}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="small muted">No items{q || status || mine ? ' match' : ''}.</td></tr>}
                </tbody>
              </table>
            </div>
            {canEdit && <button type="button" className="link small wk-add" onClick={() => setOpen({ draft: { groupId: g.id } })}>+ Add work item</button>}
          </section>
        );
      })}
      {items && items.length >= 500 && <p className="xs muted">Showing the first 500 items of this board.</p>}
      {open && (
        <>
          <div className="wk-backdrop" onClick={() => setOpen(null)} />
          <WorkItemPanel board={board} item={open.item || null} draft={open.draft} role={role}
            onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />
        </>
      )}
    </div>
  );
}

// Managers: the board's name, description, office, groups and people.
function BoardSettings({ board, onSaved }) {
  const { settings, actor } = useAuth();
  const [f, setF] = useState({ name: board.name, description: board.description || '', office: board.office || '' });
  const [groups, setGroups] = useState(board.groups || []);
  const role = (u) => ((board.managers || []).includes(u) ? 'manager' : (board.members || []).includes(u) ? 'member' : 'viewer');
  const [people, setPeople] = useState((board.access || []).filter((u) => u !== board.ownerUid)
    .map((u) => ({ uid: u, displayName: board.names?.[u] || 'Someone', role: role(u) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!groups.length || groups.some((g) => !g.name.trim())) throw new Error('Every group needs a name, and a board at least one group.');
      const managers = [board.ownerUid, ...people.filter((p) => p.role === 'manager').map((p) => p.uid)];
      await updateBoard(board.id, {
        name: f.name.trim(), description: f.description.trim(), office: f.office,
        groups: groups.map((g) => ({ id: g.id, name: g.name.trim() })),
        managers: [...new Set(managers)],
        members: people.filter((p) => p.role === 'member').map((p) => p.uid),
        viewers: people.filter((p) => p.role === 'viewer').map((p) => p.uid),
        names: { ...board.names, ...Object.fromEntries(people.map((p) => [p.uid, p.displayName || p.email || ''])), [actor.uid]: board.names?.[actor.uid] || actor.displayName || '' },
      });
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <section className="card wk-settings">
      <h3>Board settings</h3>
      {error && <div className="alert">{error}</div>}
      <div className="wk-grid">
        <label className="field"><span className="field-label">Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></label>
        <label className="field"><span className="field-label">Office</span>
          <Select value={f.office} onChange={(e) => setF({ ...f, office: e.target.value })}>
            <option value="">—</option>
            {(settings.offices || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </Select></label>
      </div>
      <label className="field"><span className="field-label">Description</span>
        <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></label>
      <div className="field"><span className="field-label">Groups</span>
        {groups.map((g, i) => (
          <div key={g.id} className="row gap wk-group-edit">
            <input value={g.name} aria-label="Group name" maxLength={60} onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <button type="button" className="btn-icon" title="Remove the group (its items move to the first group)" disabled={groups.length === 1}
              onClick={() => setGroups(groups.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="link small" onClick={() => setGroups([...groups, { id: nextGroupId(groups), name: '' }])}>+ Add a group</button>
      </div>
      <PeopleEditor people={people} onChange={setPeople} exclude={[board.ownerUid]} />
      <p className="xs muted">{board.ownerName} created the board and stays its manager.</p>
      <div className="row gap"><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </section>
  );
}
