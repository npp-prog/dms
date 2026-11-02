import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard, listBoards, listCreatedForReview, listMentions, listMyItems } from '../lib/work.js';
import { boardRole, dueState, myWorkBuckets, SORTS } from '../lib/workModel.js';
import { localDay } from '../lib/archiveFiles.js';
import WorkItemPanel from '../components/WorkItemPanel.jsx';
import { Priority, WorkStatus, day } from '../components/WorkBits.jsx';

export const MY_WORK_VIEWS = [
  ['assigned', 'Assigned to me'], ['overdue', 'Overdue'], ['today', 'Due today'], ['upcoming', 'Next 7 days'],
  ['blocked', 'Blocked'], ['review', 'For my review'], ['mentions', 'Mentions'],
];

// My Work: the open work items assigned to the user on every board, and those they created that
// wait for their review. ?show=overdue (or today, upcoming, blocked, review) opens that list.
export default function MyWork() {
  const { actor, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const show = MY_WORK_VIEWS.some(([k]) => k === params.get('show')) ? params.get('show') : 'assigned';
  const [items, setItems] = useState(null);
  const [boards, setBoards] = useState({});
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // { item, board }
  const [mentions, setMentions] = useState([]);
  const today = localDay();

  const load = () => Promise.all([listMyItems(actor.uid), listCreatedForReview(actor.uid).catch(() => []), listBoards(actor, { all: isAdmin }).catch(() => []), listMentions(actor.uid).catch(() => [])])
    .then(([mine, review, bs, ms]) => {
      setMentions(ms);
      const byId = new Map([...mine, ...review].map((i) => [i.id, i]));
      setItems([...byId.values()]);
      setBoards(Object.fromEntries(bs.map((b) => [b.id, b])));
    })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, [actor.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const buckets = useMemo(() => (items ? myWorkBuckets(items, actor.uid, today) : null), [items, actor.uid, today]);
  const list = buckets && show !== 'mentions' ? [...buckets[show]].sort(SORTS.due) : [];
  const counts = buckets ? { ...Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])), mentions: mentions.filter((m) => !m.read).length } : {};

  const openItem = async (item) => {
    // A board the user is only assigned on (not a member of): read as far as allowed.
    const board = boards[item.boardId] || await getBoard(item.boardId).catch(() => null)
      || { id: item.boardId, name: 'Board', names: item.assigneeNames || {}, groups: [{ id: item.groupId, name: '—' }], access: [] };
    setOpen({ item, board });
  };

  return (
    <div className="page">
      <h1>My Work</h1>
      {error && <div className="alert">{error}</div>}
      {!buckets && !error && <div className="spinner" />}
      {buckets && (
        <>
          <div className="wk-tabs" role="tablist">
            {MY_WORK_VIEWS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={show === k} className={`wk-tab${show === k ? ' active' : ''}${k === 'overdue' && buckets.overdue.length ? ' alert-tab' : ''}`}
                onClick={() => setParams(k === 'assigned' ? {} : { show: k })}>{label} <span className="wk-count">{counts[k]}</span></button>
            ))}
          </div>
          {show === 'mentions' ? (mentions.length === 0 ? <p className="muted">No one has mentioned you yet.</p> : (
            <ul className="wk-mentions card">
              {mentions.map((m) => (
                <li key={m.id} className={m.read ? '' : 'unread'}>
                  <Link to={m.link}><b>{m.fromName}</b> {m.text}</Link>
                  <div className="xs muted">{new Date(m.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}</div>
                </li>
              ))}
            </ul>
          )) : list.length === 0 ? <p className="muted">{show === 'assigned' ? 'Nothing is assigned to you.' : 'Nothing here.'}</p> : (
            <div className="table-card">
              <table className="data-table wk-table">
                <thead><tr><th>Item</th><th>Board</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead>
                <tbody>
                  {list.map((i) => {
                    const ds = dueState(i, today);
                    return (
                      <tr key={i.id} className="wk-row" tabIndex={0} onClick={() => openItem(i)} onKeyDown={(e) => e.key === 'Enter' && openItem(i)}>
                        <td className="wk-title"><b>{i.title}</b></td>
                        <td className="small">{boards[i.boardId] ? <Link to={`/boards/${i.boardId}`} onClick={(e) => e.stopPropagation()}>{boards[i.boardId].name}</Link> : '—'}</td>
                        <td><WorkStatus id={i.status} /></td>
                        <td><Priority id={i.priority} /></td>
                        <td className={`small wk-due wk-due-${ds}`}>{i.dueDate ? day(i.dueDate) : '—'}{ds === 'overdue' && <span className="xs"> overdue</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {open && (
        <>
          <div className="wk-backdrop" onClick={() => setOpen(null)} />
          <WorkItemPanel board={open.board} item={open.item} role={boardRole(open.board, actor.uid, isAdmin)}
            onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />
        </>
      )}
    </div>
  );
}
