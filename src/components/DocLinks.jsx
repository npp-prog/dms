import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import { acceptsDocument } from '../lib/checklists.js';
import Select from './Select.jsx';

// Links from a checklist item to the supporting document: one already in DMS (e.g. the OBR
// or PO) or one in another LGU system (PIM, CBO, ...). Stored on the document as
// links: { [itemId]: [{ kind: 'fts', id, controlNo, typeCode, title } | { kind: 'url', system, ref, url }] }.

// PIM (PMS-IMS) generates AIR, PAR, ICS, RIS, PTR, ITR, WMR, Pre/Post Inspection, History of Repair, RSMI.
export const SYSTEMS = ['PIM', 'CBO', 'CFMS', 'DMS', 'Other'];

export const safeUrl = (url) => (/^https?:\/\/\S+$/i.test(String(url || '').trim()) ? String(url).trim() : '');

// One-line text of a link, as printed on the checklist.
export function linkText(l) {
  if (l.kind === 'fts') return `${l.controlNo} (${l.typeCode})`;
  if (l.kind === 'file') return l.dms ? `${l.dms.controlNo} (File: ${l.name})` : `File: ${l.name}`;
  return [l.system, l.ref || safeUrl(l.url)].filter(Boolean).join(': ');
}

const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// onOpen(link): show an uploaded file (in the document page's viewer).
// isLocked(link): kept for good (the document was routed on after it was added): no ×.
export function LinkList({ links = [], onRemove, onOpen, isLocked }) {
  if (!links.length) return null;
  return (
    <ul className="doc-links">
      {links.map((l, i) => {
        const url = safeUrl(l.url);
        const title = l.kind === 'file' ? l.name : l.kind === 'fts' ? l.controlNo : l.ref || url || l.system;
        const open = onOpen && (l.kind === 'file' || l.kind === 'fts') ? () => onOpen(l, i) : null;
        // The line under the name: what it is and where it comes from.
        const meta = l.kind === 'file'
          ? [l.dms && <Link key="d" to={`/documents/${l.dms.id}`} title="Open it as a DMS document">{l.dms.controlNo}</Link>, kb(l.size), l.by]
          : l.kind === 'fts' ? ['DMS', l.typeCode, l.title] : [l.system];
        return (
          <li key={i} className="doc-link">
            <span className={`doc-link-ic ${l.kind === 'file' || l.kind === 'fts' ? l.kind : 'ext'}`} aria-hidden="true">{l.kind === 'file' ? (/zip/.test(l.type || '') ? 'ZIP' : 'PDF') : l.kind === 'fts' ? 'DMS' : '↗'}</span>
            <span className="doc-link-body">
              {open ? <button type="button" className="doc-link-name" title={title} onClick={open}>{title}</button>
                : l.kind === 'fts' ? <Link className="doc-link-name" to={`/documents/${l.id}`} target="_blank" rel="noopener">{title}</Link>
                  : url ? <a className="doc-link-name" href={url} target="_blank" rel="noopener noreferrer" title={title}>{title}</a>
                    : <span className="doc-link-name plain" title={title}>{title}</span>}
              <span className="doc-link-meta">{meta.filter(Boolean).map((m, j) => <span key={j}>{m}</span>)}</span>
            </span>
            {onRemove && !isLocked?.(l, i) && <button type="button" className="btn-icon" title="Remove" onClick={() => onRemove(i)}>×</button>}
          </li>
        );
      })}
    </ul>
  );
}

// Choose a document in DMS (only DMS documents are linked; links to other systems added before
// stay listed).
export function LinkEditor({ item, excludeId, onAdd, onCancel }) {
  const { user, profile, isAdmin, isHead } = useAuth();
  const [docs, setDocs] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listDocuments({ uid: user.uid, office: profile.office, all: isAdmin, head: isHead })
      .then((d) => setDocs(d.filter((x) => x.id !== excludeId && x.status !== 'cancelled')))
      .catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, isHead, excludeId]);

  // Only documents of the kind the checklist item asks for (e.g. OBRs for "Obligation Request").
  const fitting = useMemo(() => (docs || []).filter((d) => acceptsDocument(item, d)), [docs, item]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return fitting.filter((d) => words.every((w) => `${d.controlNo} ${d.typeCode} ${d.typeName} ${d.title}`.toLowerCase().includes(w))).slice(0, 30);
  }, [fitting, q]);
  const kinds = [...new Set(fitting.map((d) => d.typeCode))];

  return (
    <div className="link-editor">
      {error && <div className="alert">{error}</div>}
      {item && <p className="small muted">{item.label}{kinds.length ? `: showing ${kinds.join(' and ')} documents only.` : ''}</p>}
      <input placeholder="Search control no. or payee" value={q} onChange={(e) => setQ(e.target.value)} />
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="picker-results">
          {shown.length === 0 && (
            <p className="small muted" style={{ padding: '.5rem' }}>
              {fitting.length ? 'No match.' : `No ${item ? `"${item.label}" ` : ''}document in DMS from you or your office. Upload the file instead (+ Upload file).`}
            </p>
          )}
          {shown.map((d) => (
            <button type="button" key={d.id}
              onClick={() => onAdd({ kind: 'fts', id: d.id, controlNo: d.controlNo, typeCode: d.typeCode, title: d.title || '' })}>
              <span className="code">{d.controlNo}</span>
              <span className="t"><b>{d.typeCode}</b> · {d.title}<div className="small muted">{d.status}</div></span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Close</button>
    </div>
  );
}
