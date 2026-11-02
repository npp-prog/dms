import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDocument } from '../lib/api.js';
import { officeOf } from '../lib/workflow.js';
import { priorityOf, statusOf } from '../lib/workModel.js';
import StatusBadge from './StatusBadge.jsx';
import { Avatar } from './Icon.jsx';

// Small pieces of the work management pages (Boards, My Work, the document page's Work items).

export const WorkStatus = ({ id }) => {
  const s = statusOf(id);
  return <span className={`wk-pill wk-${s.tone}`}>{s.label}</span>;
};
export const Priority = ({ id }) => {
  const p = priorityOf(id);
  return <span className={`wk-prio wk-prio-${p.tone}`}>{p.label}</span>;
};
export const Assignees = ({ item, names = {}, max = 3 }) => {
  const list = item.assignees || [];
  if (!list.length) return <span className="xs muted">Unassigned</span>;
  const nameOf = (u) => names[u] || item.assigneeNames?.[u] || 'Someone';
  return (
    <span className="wk-people" title={list.map(nameOf).join(', ')}>
      {list.slice(0, max).map((u) => <Avatar key={u} name={nameOf(u)} size="xs" />)}
      {list.length > max && <span className="xs muted">+{list.length - max}</span>}
    </span>
  );
};
export const day = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// Where a document is on its DMS route, in words (the DMS workflow is the authority).
function routeLine(d) {
  const wf = d.workflow;
  if (!wf) return d.status === 'draft' ? 'Draft, not routed' : 'Not routed';
  if (wf.state === 'done') return 'Processed';
  if (wf.state === 'cancelled') return 'Cancelled';
  if (wf.referral) return `Referred to ${wf.referral.name || 'a person'}`;
  const step = wf.steps?.[wf.stage];
  const last = wf.events?.at(-1)?.type;
  return `${last === 'returned' ? 'Returned to' : 'With'} ${officeOf(step, d) || 'the preparer'}${step?.action ? `: ${step.action}` : ''}`;
}

// The DMS documents an item links, by id: read with the user's own access. A document they may not
// open shows as restricted, with nothing of it (no number, title or status).
export function LinkedDocuments({ docRefs = [], onRemove }) {
  const [docs, setDocs] = useState({});
  useEffect(() => {
    let live = true;
    Promise.all(docRefs.map((id) => getDocument(id).then((d) => [id, d || { missing: true }]).catch(() => [id, { restricted: true }])))
      .then((pairs) => live && setDocs(Object.fromEntries(pairs)));
    return () => { live = false; };
  }, [docRefs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!docRefs.length) return <p className="small muted">No linked documents.</p>;
  return (
    <ul className="wk-docs">
      {docRefs.map((id) => {
        const d = docs[id];
        return (
          <li key={id} className="wk-doc">
            {!d ? <span className="small muted">Loading…</span>
              : d.restricted ? <span className="small muted">Restricted document: you do not have access to it.</span>
                : d.missing ? <span className="small muted">This document no longer exists.</span>
                  : (
                    <span className="wk-doc-body">
                      <Link to={`/documents/${id}`} className="wk-doc-no">{d.controlNo}</Link>
                      <span className="small">{d.typeName}{d.title ? ` · ${d.title}` : ''}</span>
                      <span className="xs muted wk-doc-route"><StatusBadge doc={d} /> {routeLine(d)}</span>
                    </span>
                  )}
            {onRemove && <button type="button" className="btn-icon" title="Remove the link" onClick={() => onRemove(id)}>×</button>}
          </li>
        );
      })}
    </ul>
  );
}
