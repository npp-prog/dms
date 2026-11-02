import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { addComment, createItem, deleteItem, listActivity, listComments, listSubtasks, saveItem, setItemStatus } from '../lib/work.js';
import { PRIORITIES, WORK_STATUSES, checklistProgress, mentionsIn, newCheckId } from '../lib/workModel.js';
import WorkFieldInput from './WorkFieldInput.jsx';
import Select from './Select.jsx';
import { LinkEditor } from './DocLinks.jsx';
import { LinkedDocuments, WorkStatus } from './WorkBits.jsx';
import { listProjects } from '../lib/projects.js';

const when = (t) => (t?.toDate ? t.toDate().toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : '');

// A work item's details: everything about it, editable by the board's members (an assignee who is
// not one changes its status only; a viewer reads). item: null for a new one (groupId in draft).
export default function WorkItemPanel({ board, item, draft = {}, role, onSaved, onClose }) {
  const { actor, settings, profile, isAdmin } = useAuth();
  // Projects the user is on, for "Related project".
  const [projects, setProjects] = useState([]);
  useEffect(() => { listProjects(actor, { all: isAdmin }).then(setProjects).catch(() => setProjects([])); }, [actor.uid, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const isNew = !item;
  const assignedToMe = Boolean(item && (item.assignees || []).includes(actor.uid));
  const canEdit = role === 'manager' || role === 'member';
  const statusOnly = !canEdit && assignedToMe;
  const canDelete = Boolean(item) && (role === 'manager' || item.createdBy === actor.uid);
  const [f, setF] = useState(() => ({
    title: '', description: '', groupId: board.groups?.[0]?.id || 'g1', status: 'not_started', priority: 'medium',
    assignees: [], office: board.office || profile.office || '', startDate: '', dueDate: '', tags: [], docRefs: [], checklist: [], parentId: '', projectId: '', fields: {},
    ...draft, ...(item || {}),
  }));
  const [tagText, setTagText] = useState((item?.tags || draft.tags || []).join(', '));
  const [linking, setLinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => { if (item) listActivity(item.id).then(setActivity).catch(() => setActivity([])); }, [item?.id, item?.updatedAt?.seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const people = (board.access || []).map((u) => ({ uid: u, name: board.names?.[u] || 'Someone' })).sort((a, b) => a.name.localeCompare(b.name));
  // Checklist: members edit it; an assignee ticks it.
  const [checkText, setCheckText] = useState('');
  const canTick = canEdit || statusOnly;
  const progress = checklistProgress(f.checklist);
  // Subtasks (items whose parent is this one) and comments: read when an item is open.
  const [subtasks, setSubtasks] = useState(null);
  const [subTitle, setSubTitle] = useState('');
  const [comments, setComments] = useState(null);
  const [comment, setComment] = useState('');
  const loadMore = () => {
    if (!item) return;
    if (!item.parentId) listSubtasks(item).then(setSubtasks).catch(() => setSubtasks([]));
    listComments(item.id).then(setComments).catch(() => setComments([]));
  };
  useEffect(loadMore, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const addSubtask = async () => {
    if (!subTitle.trim()) return;
    setBusy(true); setError('');
    try {
      await createItem(board, { title: subTitle, parentId: item.id, groupId: item.groupId, office: item.office }, actor);
      setSubTitle(''); loadMore();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const sendComment = async () => {
    setBusy(true); setError('');
    try {
      await addComment(board, item, comment, mentionsIn(comment, people).filter((u) => u !== actor.uid), actor);
      setComment(''); loadMore();
    } catch (e) { setError(e.code === 'permission-denied' ? 'You may not comment on this work item.' : e.message); } finally { setBusy(false); }
  };
  const offices = settings.offices || [];

  const save = async () => {
    setBusy(true); setError('');
    try {
      const input = { ...f, tags: tagText.split(',') };
      if (isNew) await createItem(board, input, actor);
      else if (statusOnly) await setItemStatus(board, item, f.status, actor, f.checklist);
      else await saveItem(board, item, input, actor);
      onSaved();
    } catch (e) { setError(e.code === 'permission-denied' ? 'You may not change this work item.' : e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${item.title}"? The documents it links stay in the DMS.`)) return;
    setBusy(true);
    try { await deleteItem(item.id); onSaved(); } catch (e) { setError(e.message); setBusy(false); }
  };

  const ro = !canEdit;
  return (
    <aside className="wk-panel" role="dialog" aria-label={isNew ? 'New work item' : item.title}>
      <div className="wk-panel-head">
        <h3>{isNew ? 'New work item' : 'Work item'}</h3>
        <button type="button" className="btn-icon" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {error && <div className="alert">{error}</div>}
      <label className="field"><span className="field-label">Title</span>
        <input value={f.title} onChange={set('title')} maxLength={200} disabled={ro} /></label>
      <div className="wk-grid">
        <label className="field"><span className="field-label">Status</span>
          <Select value={f.status} onChange={set('status')} disabled={ro && !statusOnly}>
            {WORK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select></label>
        <label className="field"><span className="field-label">Priority</span>
          <Select value={f.priority} onChange={set('priority')} disabled={ro}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select></label>
        <label className="field"><span className="field-label">Group</span>
          <Select value={f.groupId} onChange={set('groupId')} disabled={ro}>
            {(board.groups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select></label>
        <label className="field"><span className="field-label">Responsible office</span>
          <Select value={f.office} onChange={set('office')} disabled={ro}>
            <option value="">—</option>
            {offices.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select></label>
        <label className="field"><span className="field-label">Related project</span>
          <Select value={f.projectId} onChange={set('projectId')} disabled={ro}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            {f.projectId && !projects.some((p) => p.id === f.projectId) && <option value={f.projectId}>A project you are not on</option>}
          </Select></label>
        <label className="field"><span className="field-label">Start date</span>
          <input type="date" value={f.startDate} onChange={set('startDate')} disabled={ro} /></label>
        <label className="field"><span className="field-label">Due date</span>
          <input type="date" value={f.dueDate} onChange={set('dueDate')} disabled={ro} /></label>
      </div>
      <div className="field"><span className="field-label">Assigned to</span>
        <div className="wk-chips">
          {f.assignees.map((u) => (
            <span key={u} className="chip">{board.names?.[u] || item?.assigneeNames?.[u] || 'Someone'}
              {!ro && <button type="button" title="Unassign" onClick={() => setF({ ...f, assignees: f.assignees.filter((x) => x !== u) })}>×</button>}</span>
          ))}
          {!f.assignees.length && <span className="small muted">No one yet</span>}
        </div>
        {!ro && (
          <Select value="" aria-label="Assign someone" onChange={(e) => e.target.value && setF({ ...f, assignees: [...f.assignees, e.target.value] })}>
            <option value="">Assign someone on this board…</option>
            {people.filter((p) => !f.assignees.includes(p.uid)).map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
          </Select>
        )}
      </div>
      <label className="field"><span className="field-label">Description</span>
        <textarea rows={4} value={f.description} onChange={set('description')} maxLength={4000} disabled={ro} /></label>
      <label className="field"><span className="field-label">Tags</span>
        <input value={tagText} onChange={(e) => setTagText(e.target.value)} disabled={ro} />
        <span className="xs muted">Separate tags with commas.</span></label>
      {(board.columns || []).some((c) => !c.hidden) && (
        <div className="wk-grid">
          {board.columns.filter((c) => !c.hidden).map((c) => (
            <WorkFieldInput key={c.id} column={c} value={f.fields?.[c.id]} disabled={ro} people={people} offices={offices}
              onChange={(v) => setF({ ...f, fields: { ...(f.fields || {}), [c.id]: v } })} />
          ))}
        </div>
      )}

      <div className="field"><span className="field-label">Linked DMS documents</span>
        <LinkedDocuments docRefs={f.docRefs} onRemove={ro ? undefined : (id) => setF({ ...f, docRefs: f.docRefs.filter((x) => x !== id) })} />
        {!ro && (linking
          ? <LinkEditor onCancel={() => setLinking(false)} onAdd={(l) => { setLinking(false); if (!f.docRefs.includes(l.id)) setF({ ...f, docRefs: [...f.docRefs, l.id] }); }} />
          : (
            <div className="row gap wrap small">
              <button type="button" className="link" onClick={() => setLinking(true)}>+ Link a DMS document</button>
              <Link to="/upload" target="_blank" rel="noopener" className="link">Upload a new document</Link>
            </div>
          ))}
        <span className="xs muted">Documents stay in the DMS, with their own route and approvals; the item keeps only the link. People on this board
          who may not open a document see it as restricted.</span>
      </div>

      <div className="field"><span className="field-label">Checklist {progress.total > 0 && <span className="muted">({progress.done} of {progress.total})</span>}</span>
        {f.checklist.length > 0 && (
          <ul className="wk-check">
            {f.checklist.map((c) => (
              <li key={c.id}>
                <label className="check"><input type="checkbox" checked={c.done} disabled={!canTick}
                  onChange={(e) => setF({ ...f, checklist: f.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })} />
                  <span className={c.done ? 'wk-done' : ''}>{c.text}</span></label>
                {canEdit && <button type="button" className="btn-icon" title="Remove" onClick={() => setF({ ...f, checklist: f.checklist.filter((x) => x.id !== c.id) })}>×</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="row gap">
            <input value={checkText} onChange={(e) => setCheckText(e.target.value)} maxLength={200} aria-label="New checklist item"
              onKeyDown={(e) => { if (e.key === 'Enter' && checkText.trim()) { e.preventDefault(); setF({ ...f, checklist: [...f.checklist, { id: newCheckId(), text: checkText.trim(), done: false }] }); setCheckText(''); } }} />
            <button type="button" className="btn btn-ghost btn-sm" disabled={!checkText.trim()}
              onClick={() => { setF({ ...f, checklist: [...f.checklist, { id: newCheckId(), text: checkText.trim(), done: false }] }); setCheckText(''); }}>Add</button>
          </div>
        )}
        {(f.checklist.length > 0 || canEdit) && <span className="xs muted">Checklist changes are kept when you click Save.</span>}
      </div>

      <div className="row gap wk-panel-actions">
        {(canEdit || statusOnly) && <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : isNew ? 'Create' : 'Save'}</button>}
        <button type="button" className="btn btn-ghost" onClick={onClose}>{canEdit || statusOnly ? 'Cancel' : 'Close'}</button>
        {canDelete && <button type="button" className="btn btn-danger btn-sm wk-del" disabled={busy} onClick={remove}>Delete</button>}
      </div>
      {statusOnly && <p className="xs muted">You are assigned to it: you change its status. The board's members edit the rest.</p>}

      {item && !item.parentId && (
        <div className="wk-section">
          <h4>Subtasks {subtasks?.length > 0 && <span className="muted small">({subtasks.filter((s) => s.status === 'done').length} of {subtasks.length} completed)</span>}</h4>
          {subtasks === null ? <div className="spinner" /> : subtasks.length === 0 ? <p className="small muted">No subtasks.</p> : (
            <ul className="wk-subtasks">
              {subtasks.map((s) => <li key={s.id}><WorkStatus id={s.status} /> <span>{s.title}</span>{s.dueDate && <span className="xs muted"> · due {s.dueDate}</span>}</li>)}
            </ul>
          )}
          {canEdit && (
            <div className="row gap">
              <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} maxLength={200} aria-label="New subtask"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }} />
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !subTitle.trim()} onClick={addSubtask}>Add subtask</button>
            </div>
          )}
          {subtasks?.length > 0 && <span className="xs muted">A subtask is a work item of its own on this board: open it there to assign it or set its dates.</span>}
        </div>
      )}
      {item?.parentId && <p className="small muted">This is a subtask.</p>}

      {item && (
        <div className="wk-section">
          <h4>Comments</h4>
          {comments === null ? <div className="spinner" /> : comments.length === 0 ? <p className="small muted">No comments yet.</p> : (
            <ul className="wk-comments">
              {comments.map((c) => <li key={c.id}><b>{c.byName}</b> <span className="xs muted">{when(c.at)}</span><div className="wk-comment-text">{c.text}</div></li>)}
            </ul>
          )}
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} aria-label="Write a comment" />
          <div className="row gap wrap">
            <Select value="" aria-label="Mention someone" onChange={(e) => e.target.value && setComment(`${comment}${comment && !comment.endsWith(' ') ? ' ' : ''}@${e.target.value} `)}>
              <option value="">Mention someone…</option>
              {people.filter((p) => p.uid !== actor.uid).map((p) => <option key={p.uid} value={p.name}>{p.name}</option>)}
            </Select>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !comment.trim()} onClick={sendComment}>Comment</button>
          </div>
          <span className="xs muted">People you mention (@Name) are notified. Comments cannot be edited or deleted.</span>
        </div>
      )}

      {item && (
        <div className="wk-activity">
          <h4>Activity</h4>
          {activity === null ? <div className="spinner" /> : activity.length === 0 ? <p className="small muted">Nothing yet.</p> : (
            <ul>
              {activity.map((a) => <li key={a.id}><b>{a.byName}</b> {a.text}<div className="xs muted">{when(a.at)}</div></li>)}
            </ul>
          )}
          <p className="xs muted">Created by {item.createdByName}{item.completedOn ? ` · completed ${item.completedOn}` : ''} · <WorkStatus id={item.status} /></p>
        </div>
      )}
    </aside>
  );
}
