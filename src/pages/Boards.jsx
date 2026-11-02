import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { archiveBoard, createBoard, deleteBoard, setBoardColor, deleteView, getBoard, listBoardItems, listBoards, listViews, saveItem, saveView, setItemStatus, updateBoard } from '../lib/work.js';
import { BOARD_COLORS, boardColor, COLUMN_LIMIT, COLUMN_TYPES, SORTS, WORK_STATUSES, boardRole, canArchive, canDeleteBoard, checklistProgress, dueState, fieldText, newColumnId, nextGroupId, templateOf, templatesOf } from '../lib/workModel.js';
import { EXPORT_CHOICES, canExportBoard, csvName, itemCsvColumns, toCsv } from '../lib/reports.js';
import { downloadCsv } from '../lib/download.js';
import { listProjects } from '../lib/projects.js';
import { localDay } from '../lib/archiveFiles.js';
import Select from '../components/Select.jsx';
import PersonPicker from '../components/PersonPicker.jsx';
import WorkItemPanel from '../components/WorkItemPanel.jsx';
import { Assignees, Priority, WorkStatus, day } from '../components/WorkBits.jsx';
import MonthCalendar from '../components/MonthCalendar.jsx';

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
  const { actor, isAdmin, isHead, settings, profile } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // Office heads also see their office's boards. Archived boards: on request.
  useEffect(() => {
    setBoards(null);
    listBoards(actor, { all: isAdmin, headOf: isHead ? profile.office : '', archived: showArchived }).then(setBoards).catch((e) => setError(e.message));
  }, [actor.uid, isAdmin, isHead, profile.office, showArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Boards</h1></div>
        <div className="row gap">
          <button type="button" className={`btn btn-sm${showArchived ? ' btn-primary' : ' btn-ghost'}`} aria-pressed={showArchived} onClick={() => setShowArchived((x) => !x)}>{showArchived ? 'Back to boards' : 'Archived boards'}</button>
          {!creating && !showArchived && <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New board</button>}
        </div>
      </div>
      {creating && <NewBoard offices={settings.offices || []} templates={templatesOf(settings)} office={profile.office} onCancel={() => setCreating(false)}
        onCreated={(id) => navigate(`/boards/${id}`)} actor={actor} />}
      {error && <div className="alert">{error}</div>}
      {!boards && !error && <div className="spinner" />}
      {boards && boards.length === 0 && !creating && <p className="muted">{showArchived ? 'No archived boards.' : "No boards yet. Create one for your office's tasks, transactions or projects."}</p>}
      {boards && boards.length > 0 && (
        <div className="wk-board-tiles">
          {boards.map((b) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="wk-board-tile" style={boardColor(b) ? { borderLeftColor: boardColor(b) } : undefined}>
              <b>{b.name}</b>
              <span className="small muted">{templateOf(b.template, templatesOf(settings)).name}{b.office ? ` · ${b.office}` : ''}</span>
              <span className="xs muted">{(b.access || []).length} people · {(b.groups || []).length} groups{b.archived ? ` · archived ${String(b.archivedAt || '').slice(0, 10)}` : ''}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewBoard({ offices, office, templates, onCancel, onCreated, actor }) {
  const [f, setF] = useState({ name: '', description: '', template: templates[0]?.id || 'blank', office: office || '' });
  const [people, setPeople] = useState([]); // [{ uid, displayName, role }]
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = templateOf(f.template, templates);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const id = await createBoard({
        ...f, templates,
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
            {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
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
  const { actor, isAdmin, isHead, profile, settings } = useAuth();
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
  const [picking, setPicking] = useState(false); // the card color choices
  // Saved views: the user's own and those shared with the board.
  const [views, setViews] = useState([]);
  const [naming, setNaming] = useState(null); // { name, shared } while saving one
  const loadViews = () => listViews(boardId, actor.uid).then(setViews).catch(() => setViews([]));
  useEffect(() => { loadViews(); }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyView = (v) => { setQ(v.q || ''); setStatus(v.status || ''); setMine(Boolean(v.mine)); setSort(v.sort || 'due'); chooseView(v.view || 'table'); };
  const keepView = async () => {
    try {
      await saveView(boardId, { name: naming.name, shared: naming.shared, filters: { q, status, mine, sort, view } }, actor);
      setNaming(null); loadViews();
    } catch (e) { setError(e.code === 'permission-denied' ? 'You may not save this view.' : e.message); }
  };
  const dropView = async (v) => {
    if (!window.confirm(`Delete the saved view "${v.name}"?`)) return;
    try { await deleteView(boardId, v.id); loadViews(); } catch (e) { setError(e.message); }
  };
  // Export to CSV: the items shown (with the filters), for those the board lets export.
  const exportCsv = async () => {
    const projects = await listProjects(actor, { all: isAdmin }).catch(() => []);
    downloadCsv(csvName(board.name, today), toCsv(itemCsvColumns(board, { projects, today }), shown));
  };

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
    if (item.status === status || board.archived) return;
    const r = boardRole(board, actor.uid, isAdmin);
    try {
      if (r === 'manager' || r === 'member') await saveItem(board, item, { status }, actor);
      else if ((item.assignees || []).includes(actor.uid)) await setItemStatus(board, item, status, actor);
      else return;
      await load();
    } catch (e) { setError(e.code === 'permission-denied' ? 'You may not change this work item.' : e.message); }
  };

  // An archived board is read-only for everyone (its people only read it) until it is restored.
  const role = board?.archived ? (boardRole(board, actor.uid, isAdmin) ? 'viewer' : '') : boardRole(board, actor.uid, isAdmin);
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
  const cols = (board.columns || []).filter((c) => !c.hidden);
  const deletable = canDeleteBoard(board, actor.uid, { isAdmin, isHead, office: profile.office });
  const archivable = canArchive(board, actor.uid, { isAdmin, isHead, office: profile.office });
  const chooseColor = async (c) => {
    try { await setBoardColor(board.id, c); setPicking(false); await load(); } catch (e) { setError(e.code === 'permission-denied' ? 'You may not change the color of this board.' : e.message); }
  };
  const toggleArchive = async () => {
    if (!board.archived && !window.confirm(`Archive the board "${board.name}"? It becomes read-only and leaves the board list, reports and reminders. It can be restored at any time.`)) return;
    try { await archiveBoard(board.id, !board.archived, actor); await load(); } catch (e) { setError(e.code === 'permission-denied' ? 'You may not archive this board.' : e.message); }
  };
  const removeBoard = async () => {
    const n = (items || []).length;
    if (!window.confirm(`Delete the board "${board.name}"${n ? ` and its ${n} work item${n === 1 ? '' : 's'}` : ''}? This cannot be undone. The DMS documents they link are not affected.`)) return;
    try { await deleteBoard(board.id); navigate('/boards', { replace: true }); } catch (e) { setError(e.code === 'permission-denied' ? 'You may not delete this board.' : e.message); }
  };
  return (
    <div className="page wk-board" style={boardColor(board) ? { '--board-color': boardColor(board) } : undefined}>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/boards">Boards</Link> / {templateOf(board.template, templatesOf(settings)).name}</div>
          <h1>{board.name}</h1>
        </div>
        <div className="row gap">
          <span className="wk-view-switch" role="group" aria-label="View">
            <button type="button" className={view === 'table' ? 'active' : ''} aria-pressed={view === 'table'} onClick={() => chooseView('table')}>Table</button>
            <button type="button" className={view === 'kanban' ? 'active' : ''} aria-pressed={view === 'kanban'} onClick={() => chooseView('kanban')}>Kanban</button>
            <button type="button" className={view === 'calendar' ? 'active' : ''} aria-pressed={view === 'calendar'} onClick={() => chooseView('calendar')}>Calendar</button>
          </span>
          {role === 'manager' && <button type="button" className={`btn btn-sm${settingsOpen ? ' btn-primary' : ''}`} onClick={() => setSettingsOpen((x) => !x)}>Settings</button>}
          {archivable && <button type="button" className={`btn btn-sm${picking ? ' btn-primary' : ''}`} aria-expanded={picking} onClick={() => setPicking((x) => !x)}>
            <span className="wk-swatch-dot" style={{ background: boardColor(board) || 'var(--line-2)' }} /> Color</button>}
          {archivable && <button type="button" className="btn btn-sm" onClick={toggleArchive}>{board.archived ? 'Restore' : 'Archive'}</button>}
          {deletable && <button type="button" className="btn btn-danger btn-sm" onClick={removeBoard}>Delete board</button>}
        </div>
      </div>
      {picking && (
        <div className="card wk-colors" role="group" aria-label="Card color">
          <span className="small muted">Card color</span>
          <button type="button" className={`wk-swatch${!board.color ? ' on' : ''}`} title="Default" aria-label="Default" aria-pressed={!board.color} onClick={() => chooseColor('')}>—</button>
          {BOARD_COLORS.map((c) => (
            <button key={c.id} type="button" className={`wk-swatch${board.color === c.id ? ' on' : ''}`} style={{ background: c.hex }} title={c.label} aria-label={c.label}
              aria-pressed={board.color === c.id} onClick={() => chooseColor(c.id)} />
          ))}
        </div>
      )}
      {board.archived && <div className="alert alert-warn">This board is archived{board.archivedAt ? ` (${String(board.archivedAt).slice(0, 10)})` : ''}: it is read-only, and is left out of the board list, reports and reminders.{archivable ? ' Restore it to work on it again.' : ''}</div>}
      {settingsOpen && <BoardSettings board={board} onSaved={() => { setSettingsOpen(false); load(); }} />}
      <div className="filters wk-filters">
        {views.length > 0 && (
          <Select value="" aria-label="Saved views" onChange={(e) => { const v = views.find((x) => x.id === e.target.value); if (v) applyView(v); }}>
            <option value="">Saved views…</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.shared ? ' (shared)' : ''}</option>)}
          </Select>
        )}
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming({ name: '', shared: false })}>Save view</button>
        {canExportBoard(board, actor.uid, isAdmin) && <button type="button" className="btn btn-ghost btn-sm" disabled={!items} onClick={exportCsv}>Export CSV</button>}
      </div>
      {naming && (
        <div className="card wk-save-view row gap wrap">
          <label className="field"><span className="field-label">Name of the view</span>
            <input value={naming.name} maxLength={60} autoFocus onChange={(e) => setNaming({ ...naming, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && naming.name.trim() && keepView()} /></label>
          {role === 'manager' && <label className="check small"><input type="checkbox" checked={naming.shared} onChange={(e) => setNaming({ ...naming, shared: e.target.checked })} /> Share with everyone on the board</label>}
          <button type="button" className="btn btn-primary btn-sm" disabled={!naming.name.trim()} onClick={keepView}>Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(null)}>Cancel</button>
          <span className="xs muted grow">Keeps the search, status, sort, "Assigned to me" and the view ({view}).</span>
        </div>
      )}
      {views.length > 0 && (
        <details className="wk-views small">
          <summary>Manage saved views</summary>
          <ul>{views.map((v) => (
            <li key={v.id}>{v.name} <span className="xs muted">{v.shared ? `shared by ${v.byName}` : 'yours'}</span>
              {(v.by === actor.uid || (v.shared && role === 'manager')) && <button type="button" className="link xs" onClick={() => dropView(v)}>Delete</button>}</li>
          ))}</ul>
        </details>
      )}
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
                  const movable = !board.archived && (canEdit || (i.assignees || []).includes(actor.uid));
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
      {items && view === 'calendar' && (
        <section className="card">
          <MonthCalendar entries={shown.filter((i) => i.dueDate).map((i) => ({
            day: i.dueDate, key: i.id, label: i.title, onOpen: () => setOpen({ item: i }),
            tone: i.status === 'done' ? 'green' : dueState(i, today) === 'overdue' ? 'red' : i.status === 'blocked' ? 'yellow' : 'blue',
          }))} />
          <p className="xs muted">Work items on their due dates (red: overdue, yellow: blocked, green: completed). The filters above apply.</p>
        </section>
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
              <table className="data-table wk-table" style={cols.length ? { minWidth: 754 + 115 * cols.length } : undefined}>
                <thead><tr><th>Item</th><th>Status</th><th>Priority</th><th>Assigned</th><th>Office</th><th>Due</th><th>Docs</th>
                  {cols.map((c) => <th key={c.id} className={c.type === 'number' || c.type === 'currency' ? 'num' : ''}>{c.label}</th>)}</tr></thead>
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
                        {cols.map((c) => <td key={c.id} className={`small${c.type === 'number' || c.type === 'currency' ? ' num' : ''}`}>{fieldText(c, i.fields?.[c.id], board.names) || '—'}</td>)}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7 + cols.length} className="small muted">No items{q || status || mine ? ' match' : ''}.</td></tr>}
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
          <WorkItemPanel key={open.item?.id || 'new'} board={board} locked={Boolean(board.archived)} item={open.item || null} draft={open.draft} role={role}
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
  const [columns, setColumns] = useState(board.columns || []);
  const [exportBy, setExportBy] = useState(board.exportBy || 'members');
  const [reminders, setReminders] = useState(board.reminders !== false);
  const setCol = (id, patch) => setColumns(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const role = (u) => ((board.managers || []).includes(u) ? 'manager' : (board.members || []).includes(u) ? 'member' : 'viewer');
  const [people, setPeople] = useState((board.access || []).filter((u) => u !== board.ownerUid)
    .map((u) => ({ uid: u, displayName: board.names?.[u] || 'Someone', role: role(u) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!groups.length || groups.some((g) => !g.name.trim())) throw new Error('Every group needs a name, and a board at least one group.');
      if (columns.some((c) => !String(c.label || '').trim())) throw new Error('Every column needs a name.');
      if (columns.some((c) => c.type === 'dropdown' && !(c.options || []).some((o) => String(o).trim()))) throw new Error('A dropdown column needs its choices.');
      const managers = [board.ownerUid, ...people.filter((p) => p.role === 'manager').map((p) => p.uid)];
      await updateBoard(board.id, {
        name: f.name.trim(), description: f.description.trim(), office: f.office,
        groups: groups.map((g) => ({ id: g.id, name: g.name.trim() })),
        columns, exportBy, reminders,
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
      <div className="field"><span className="field-label">Columns of this board</span>
        {columns.map((c) => (
          <div key={c.id} className={`row gap wrap wk-col-edit${c.hidden ? ' wk-col-hidden' : ''}`}>
            <input value={c.label} aria-label="Column name" maxLength={60} onChange={(e) => setCol(c.id, { label: e.target.value })} />
            {(board.columns || []).some((x) => x.id === c.id)
              ? <span className="small muted">{COLUMN_TYPES.find((t) => t.id === c.type)?.label}</span>
              : (
                <Select value={c.type} aria-label="Column type" onChange={(e) => setCol(c.id, { type: e.target.value })}>
                  {COLUMN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              )}
            {c.type === 'dropdown' && <input value={(c.options || []).join(', ')} aria-label="Choices, separated by commas" className="grow"
              onChange={(e) => setCol(c.id, { options: e.target.value.split(',') })} />}
            {(board.columns || []).some((x) => x.id === c.id)
              ? <button type="button" className="link small" onClick={() => setCol(c.id, { hidden: !c.hidden })}>{c.hidden ? 'Show again' : 'Hide'}</button>
              : <button type="button" className="btn-icon" title="Remove" onClick={() => setColumns(columns.filter((x) => x.id !== c.id))}>×</button>}
          </div>
        ))}
        {columns.length < COLUMN_LIMIT && <button type="button" className="link small" onClick={() => setColumns([...columns, { id: newColumnId(), label: '', type: 'text', options: [] }])}>+ Add a column</button>}
        <span className="xs muted wk-help">Columns of your own (text, number, amount, date, dropdown, checkbox, person, office), after the standard ones. A column&rsquo;s type is fixed once saved;
          renaming it keeps its values, and hiding it keeps them too (they come back when it is shown again). For dropdowns, separate the choices with commas.</span>
      </div>
      <div className="wk-grid">
        <label className="field"><span className="field-label">Who may export to CSV</span>
          <Select value={exportBy} onChange={(e) => setExportBy(e.target.value)}>
            {EXPORT_CHOICES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
          <span className="xs muted">An export has only the work items; linked documents are counted, never named.</span></label>
        <label className="check small wk-remind"><input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} /> Send deadline reminders
          <span className="xs muted wk-help">To the people assigned: the day before, on the due date, and once when overdue.</span></label>
      </div>
      <PeopleEditor people={people} onChange={setPeople} exclude={[board.ownerUid]} />
      <p className="xs muted">{board.ownerName} created the board and stays its manager.</p>
      <div className="row gap"><button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </section>
  );
}
