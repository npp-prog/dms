import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { createBoard, getBoard, listBoardItems, listBoards, saveItem, setItemStatus, updateBoard } from '../lib/work.js';
import { BOARD_TEMPLATES, SORTS, WORK_STATUSES, boardRole, checklistProgress, dueState, nextGroupId, templateOf } from '../lib/workModel.js';
import { localDay } from '../lib/archiveFiles.js';
import Select from '../components/Select.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import WorkItemPanel from '../components/WorkItemPanel.jsx';
import { Assignees, Priority, WorkStatus, day } from '../components/WorkBits.jsx';

// Boards (work management): /boards lists the boards the user is on (administrators: all) and
// creates one from a template; /boards/:boardId is a board: its groups of work items as a table,
// filters, the item details panel and (managers) its settings.
export default function Boards() {
  const { boardId, itemId } = useParams();
  return boardId ? <Board key={boardId} boardId={boardId} itemId={itemId} /> : <BoardList />;
}

// The view of a board (table or Kanban), remembered on this device.
const viewKey = (id) => `dms-board-view-${id}`;
const savedView = (id) => { try { return localStorage.getItem(viewKey(id)) || 'table'; } catch { return 'table'; } };

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

function Board({ boardId, itemId }) {
  const { actor, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState(() => savedView(boardId));
  const chooseView = (v) => { setView(v); try { localStorage.setItem(viewKey(boardId), v); } catch { /* not kept */ } };
  const [dragOver, setDragOver] = useState('');
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
  // /boards/:boardId/:itemId (e.g. from a notification): that item's details.
  useEffect(() => {
    if (!itemId || !items) return;
    const it = items.find((i) => i.id === itemId);
    if (it) setOpen({ item: it });
  }, [itemId, items]);
  // (Reloads the board: the panel may have added subtasks or comments.)
  const closePanel = () => { setOpen(null); if (itemId) navigate(`/boards/${boardId}`, { replace: true }); load(); };
  // A status change from the Kanban board: the same rules as the item panel (members; an assignee
  // for their own item). It is the task's status only: no document is approved or routed.
  const moveTo = async (item, status) => {
    if (item.status === status) return;
    const r = boardRole(board, actor.uid, isAdmin);
    try {
      if (r === 'manager' || r === 'member') await saveItem(board, item, { status }, actor);
      else if ((item.assignees || []).includes(actor.uid)) await setItemStatus(board, item, status, actor);
      else return;
      await load();
    } catch (e) { setError(e.code === 'permission-denied' ? 'You may not change this work item.' : e.message); }
  };

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
          <span className="wk-view-switch" role="group" aria-label="View">
            <button type="button" className={view === 'table' ? 'active' : ''} aria-pressed={view === 'table'} onClick={() => chooseView('table')}>Table</button>
            <button type="button" className={view === 'kanban' ? 'active' : ''} aria-pressed={view === 'kanban'} onClick={() => chooseView('kanban')}>Kanban</button>
          </span>
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
      {error && <div className="alert">{error}</div>}
      {items && view === 'kanban' && (
        <div className="wk-kanban">
          {WORK_STATUSES.map((st) => {
            const cards = shown.filter((i) => !i.parentId && i.status === st.id);
            return (
              <div key={st.id} className={`wk-col${dragOver === st.id ? ' over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(st.id); }} onDragLeave={() => setDragOver('')}
                onDrop={(e) => { e.preventDefault(); setDragOver(''); const it = items.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (it) moveTo(it, st.id); }}>
                <div className="wk-col-head"><WorkStatus id={st.id} /><span className="xs muted">{cards.length}</span></div>
                {cards.map((i) => {
                  const ds = dueState(i, today);
                  const movable = canEdit || (i.assignees || []).includes(actor.uid);
                  const cp = checklistProgress(i.checklist);
                  const subs = items.filter((x) => x.parentId === i.id);
                  return (
                    <div key={i.id} className="wk-card" draggable={movable} tabIndex={0}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', i.id)}
                      onClick={() => setOpen({ item: i })} onKeyDown={(e) => e.key === 'Enter' && setOpen({ item: i })}>
                      <b>{i.title}</b>
                      <span className="xs muted">{(board.groups || []).find((g) => g.id === i.groupId)?.name}{cp.total ? ` · ✓ ${cp.done}/${cp.total}` : ''}{subs.length ? ` · ${subs.filter((x) => x.status === 'done').length}/${subs.length} subtasks` : ''}{(i.docRefs || []).length ? ` · ${i.docRefs.length} doc(s)` : ''}</span>
                      <div className="wk-card-foot">
                        <Priority id={i.priority} />
                        <span className={`xs wk-due wk-due-${ds}`}>{i.dueDate ? day(i.dueDate) : ''}</span>
                        <Assignees item={i} names={board.names} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {items && view === 'kanban' && <p className="xs muted">Drag a card to change its status (the task's progress only: documents keep their own route and approvals). Subtasks show in the table.</p>}
      {!items ? <div className="spinner" /> : view !== 'table' ? null : (board.groups || []).map((g) => {
        const inGroup = shown.filter((i) => i.groupId === g.id || (!board.groups.some((x) => x.id === i.groupId) && g === board.groups[0]));
        // Items, each followed by its subtasks (a subtask whose parent is filtered out shows on its own).
        const ids = new Set(inGroup.map((i) => i.id));
        const rows = inGroup.filter((i) => !i.parentId || !ids.has(i.parentId))
          .flatMap((i) => [i, ...inGroup.filter((x) => x.parentId === i.id)]);
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
                      <tr key={i.id} className={`wk-row${i.parentId && ids.has(i.parentId) ? ' wk-sub-row' : ''}`} onClick={() => setOpen({ item: i })} tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && setOpen({ item: i })}>
                        <td className="wk-title">{i.parentId && ids.has(i.parentId) && <span className="xs muted">↳ </span>}<b>{i.title}</b>
                          {checklistProgress(i.checklist).total > 0 && <span className="wk-progress">✓ {checklistProgress(i.checklist).done}/{checklistProgress(i.checklist).total}</span>}
                          {(i.tags || []).length > 0 && <span className="xs muted"> {i.tags.join(', ')}</span>}</td>
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
          <div className="wk-backdrop" onClick={closePanel} />
          <WorkItemPanel key={open.item?.id || 'new'} board={board} item={open.item || null} draft={open.draft} role={role}
            onClose={closePanel} onSaved={() => { closePanel(); load(); }} />
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
