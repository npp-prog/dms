import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { linkDocumentToItem, listBoardItems, listBoards, listItemsForDocument } from '../lib/work.js';
import { boardRole } from '../lib/workModel.js';
import Select from './Select.jsx';
import WorkItemPanel from './WorkItemPanel.jsx';
import { WorkStatus, day } from './WorkBits.jsx';

// On a document's page: the work items that link it (on the boards the user can see), and creating
// one for it or adding it to an existing one. The document itself stays as it is: its route and
// approvals are the DMS workflow's, whatever the items' status.
export default function DocWorkCard({ docId, docData }) {
  const { actor, isAdmin } = useAuth();
  const [boards, setBoards] = useState(null);
  const [items, setItems] = useState(null);
  const [mode, setMode] = useState(''); // '' | 'new' | 'add'
  const [boardId, setBoardId] = useState('');
  const [boardItems, setBoardItems] = useState(null);
  const [itemId, setItemId] = useState('');
  const [panel, setPanel] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const bs = await listBoards(actor, { all: isAdmin });
      setBoards(bs);
      setItems(await listItemsForDocument(docId, bs));
    } catch (e) { setError(e.message); setBoards([]); setItems([]); }
  };
  useEffect(() => { load(); }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = (boards || []).filter((b) => ['manager', 'member'].includes(boardRole(b, actor.uid, isAdmin)));
  const board = editable.find((b) => b.id === boardId);
  useEffect(() => {
    setBoardItems(null); setItemId('');
    if (mode === 'add' && boardId) listBoardItems(boardId).then((l) => setBoardItems(l.filter((i) => !(i.docRefs || []).includes(docId)))).catch(() => setBoardItems([]));
  }, [mode, boardId, docId]);

  const add = async () => {
    const item = (boardItems || []).find((i) => i.id === itemId);
    if (!item) return;
    setBusy(true); setError('');
    try { await linkDocumentToItem(board, item, docId, actor); setMode(''); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!boards || boards.length === 0) return null; // not on any board: nothing to show
  return (
    <section className="card doc-work">
      <div className="card-head"><h3>Work items</h3>{items?.length > 0 && <span className="small muted">{items.length}</span>}</div>
      {error && <div className="alert small">{error}</div>}
      {items === null ? <div className="spinner" /> : items.length === 0 ? <p className="small muted">No work item links this document.</p> : (
        <ul className="wk-doc-items">
          {items.map((i) => (
            <li key={i.id}>
              <Link to={`/boards/${i.boardId}`}><b>{i.title}</b></Link> <WorkStatus id={i.status} />
              <div className="xs muted">{i.boardName}{i.dueDate ? ` · due ${day(i.dueDate)}` : ''}</div>
            </li>
          ))}
        </ul>
      )}
      {editable.length > 0 && !mode && (
        <div className="row gap wrap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('new'); setBoardId(editable[0].id); }}>+ Create work item</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode('add'); setBoardId(editable[0].id); }}>+ Add to a work item</button>
        </div>
      )}
      {mode && (
        <div className="doc-work-pick">
          <label className="field"><span className="field-label">Board</span>
            <Select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {editable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select></label>
          {mode === 'add' && (
            <label className="field"><span className="field-label">Work item</span>
              {boardItems === null ? <div className="spinner" /> : boardItems.length === 0 ? <span className="small muted">No other item on this board.</span> : (
                <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
                  <option value="">Choose the work item…</option>
                  {boardItems.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                </Select>
              )}</label>
          )}
          <div className="row gap">
            {mode === 'new' && <button type="button" className="btn btn-primary btn-sm" disabled={!board}
              onClick={() => setPanel({ board, draft: { title: docData.title ? `${docData.typeCode} ${docData.controlNo}: ${docData.title}` : `${docData.typeCode} ${docData.controlNo}`, docRefs: [docId], office: docData.office || '' } })}>Continue</button>}
            {mode === 'add' && <button type="button" className="btn btn-primary btn-sm" disabled={!itemId || busy} onClick={add}>{busy ? 'Adding…' : 'Add the document'}</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('')}>Cancel</button>
          </div>
        </div>
      )}
      {panel && (
        <>
          <div className="wk-backdrop" onClick={() => setPanel(null)} />
          <WorkItemPanel board={panel.board} draft={panel.draft} role={boardRole(panel.board, actor.uid, isAdmin)}
            onClose={() => setPanel(null)} onSaved={() => { setPanel(null); setMode(''); load(); }} />
        </>
      )}
    </section>
  );
}
