import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { matchesSearch } from '../lib/docSearch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import { drnOf } from '../lib/naming.js';
import { whereIs } from '../lib/workflow.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Icon from '../components/Icon.jsx';
import FolderAccess from '../components/FolderAccess.jsx';
import Select from '../components/Select.jsx';

const day = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d ? d.toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '';
};

// Tiles or list, remembered on this device.
function useView() {
  const [view, setView] = useState(() => { try { return localStorage.getItem('dms-folder-view') || 'tiles'; } catch { return 'tiles'; } });
  const change = (v) => { setView(v); try { localStorage.setItem('dms-folder-view', v); } catch { /* not remembered */ } };
  return [view, change];
}

function ViewSwitch({ view, onChange }) {
  return (
    <div className="view-switch" role="group" aria-label="View">
      <button type="button" className={view === 'tiles' ? 'active' : ''} aria-pressed={view === 'tiles'} onClick={() => onChange('tiles')}>Tiles</button>
      <button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} onClick={() => onChange('list')}>List</button>
    </div>
  );
}

// Folders: every document the user may see (prepared in DMS or uploaded), in a folder per document
// type (DV, OBR, PR…), shown as tiles or as a list.
export default function Folders() {
  const { code = '' } = useParams();
  const { user, profile, actor, settings, isAdmin, isHead, isRecords } = useAuth();
  const [access, setAccess] = useState(false);
  // The office head for their office; administrators and the Records Officer for any office.
  const anyOffice = isAdmin || isRecords;
  const canGrant = anyOffice || (isHead && Boolean(profile.office));
  const offices = settings.offices || [];
  // Administrators and the Records Officer see every office's documents: the office chosen here
  // shows that office's folders (what its people see, and whose access is set below).
  const [accessOffice, setAccessOffice] = useState(anyOffice ? '' : profile.office);
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useView();
  const [q, setQ] = useState('');

  useEffect(() => {
    listDocuments({ uid: user.uid, office: profile.office, all: isAdmin || isRecords, head: isHead, granted: true })
      .then((l) => setDocs(l.filter((d) => d.status !== 'cancelled')))
      .catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, isHead, isRecords]);

  const officeDocs = useMemo(() => (anyOffice && accessOffice ? (docs || []).filter((d) => (d.office || '') === accessOffice || (d.routeOffices || []).includes(accessOffice)) : docs || []), [docs, anyOffice, accessOffice]);
  const folders = useMemo(() => {
    const map = new Map();
    for (const d of officeDocs) {
      const key = d.typeCode || 'DOC';
      if (!map.has(key)) map.set(key, { code: key, name: d.typeName || key, docs: [], last: null });
      const f = map.get(key);
      f.docs.push(d);
      const at = d.updatedAt?.toMillis?.() || 0;
      if (!f.last || at > f.last) f.last = at;
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [officeDocs]);

  const folder = code ? folders.find((f) => f.code === code) : null;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (folder?.docs || []).filter((d) => words.every((w) => String(drnOf(d) || '').toLowerCase().includes(w) || matchesSearch(d, w)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          {code && <div className="crumbs"><Link to="/folders">Folders</Link> / {code}</div>}
          <h1>{code ? folder?.name || code : 'Folders'}</h1>
        </div>
        <div className="row gap">
          {canGrant && <button type="button" className={`btn btn-sm${access ? ' btn-primary' : ''}`} aria-pressed={access} onClick={() => setAccess((a) => !a)}>Access</button>}
          <ViewSwitch view={view} onChange={setView} />
        </div>
      </div>
      {anyOffice && (
        <div className="filters">
          <Select value={accessOffice} aria-label="Office" onChange={(e) => setAccessOffice(e.target.value)}>
            <option value="">All offices</option>
            {[...new Set([...offices, ...(profile.office ? [profile.office] : [])])].sort().map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </div>
      )}
      {canGrant && access && (accessOffice || anyOffice) && (
        <FolderAccess key={accessOffice || '*'} office={accessOffice || '*'} me={user.uid} actor={actor} codes={folders.map((f) => f.code)} />
      )}
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}

      {docs && !code && (folders.length === 0 ? <p className="muted">{anyOffice && accessOffice ? `No documents of ${accessOffice} yet.` : 'No documents yet.'}</p> : view === 'tiles' ? (
        <div className="folder-tiles">
          {folders.map((f) => (
            <Link key={f.code} to={`/folders/${encodeURIComponent(f.code)}`} className="folder-tile">
              <Icon name="folder" />
              <span className="folder-name"><b>{f.code}</b><span className="small muted">{f.name}</span></span>
              <span className="small muted">{f.docs.length} document{f.docs.length === 1 ? '' : 's'}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Folder</th><th>Documents</th><th>Last change</th></tr></thead>
            <tbody>
              {folders.map((f) => (
                <tr key={f.code}>
                  <td><Link to={`/folders/${encodeURIComponent(f.code)}`} className="folder-row"><Icon name="folder" /><b>{f.code}</b> <span className="muted">{f.name}</span></Link></td>
                  <td>{f.docs.length}</td>
                  <td className="small">{f.last ? day(new Date(f.last)) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {docs && code && (
        <>
          <div className="filters">
            <input className="search" placeholder="Search by number, DRN, payee or anything in the document…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!folder || shown.length === 0 ? <p className="muted">No documents{q ? ' match' : ' in this folder'}.</p> : view === 'tiles' ? (
            <div className="doc-tiles">
              {shown.map((d) => (
                <Link key={d.id} to={`/documents/${d.id}`} className="doc-tile">
                  <Icon name="doc" />
                  <b>{d.controlNo}</b>
                  <span className="doc-tile-title">{d.title || d.typeName}</span>
                  <span className="small muted">{drnOf(d) || (d.uploaded ? 'Uploaded' : d.createdByName)}</span>
                  {anyOffice && !accessOffice && <span className="xs muted">{d.office || 'No office'}</span>}
                  <span className="doc-tile-foot"><StatusBadge doc={d} /><span className="xs muted">{day(d.updatedAt)}</span></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="card table-card">
              <table className="data-table">
                <thead><tr><th>Control No.</th><th>DRN</th><th>Payee / Subject</th><th>Office</th><th>Prepared by</th><th>Status</th><th>Where</th><th>Updated</th></tr></thead>
                <tbody>
                  {shown.map((d) => (
                    <tr key={d.id}>
                      <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                      <td className="small">{drnOf(d) || '—'}</td>
                      <td>{d.title}</td>
                      <td className="small">{d.office || '—'}</td>
                      <td className="small">{d.uploaded ? `Uploaded by ${d.createdByName}` : d.createdByName}</td>
                      <td><StatusBadge doc={d} /></td>
                      <td className="small">{whereIs(d) || '—'}</td>
                      <td className="small">{day(d.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
