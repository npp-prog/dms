import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { matchesSearch } from '../lib/docSearch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import { STATUSES } from '../lib/defaults.js';
import { whereIs } from '../lib/workflow.js';
import { isArchived } from '../lib/archive.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Select from '../components/Select.jsx';
import ZipExport from '../components/ZipExport.jsx';
import { drnOf } from '../lib/naming.js';

function fmt(ts) {
  return ts?.toDate ? ts.toDate().toLocaleString() : '';
}

export default function Documents() {
  const { user, profile, isAdmin: admin, isHead, isRecords, settings } = useAuth();
  // The Records Officer sees every document, like an administrator.
  const isAdmin = admin || isRecords;
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', type: '', office: '' });
  const [zipOpen, setZipOpen] = useState(false);

  useEffect(() => {
    listDocuments({ uid: user.uid, office: profile.office, all: isAdmin, head: isHead, granted: true }).then(setDocs).catch((e) => setError(e.message));
  }, [user.uid, profile.office, isAdmin, isHead]);
  const offices = useMemo(() => [...new Set([...(settings.offices || []), ...(docs || []).map((d) => d.office).filter(Boolean)])].sort(), [settings.offices, docs]);

  const types = useMemo(() => [...new Set((docs || []).map((d) => d.typeCode))].sort(), [docs]);
  // Processed documents are in the Archive.
  const shown = useMemo(() => (docs || []).filter((d) => {
    const q = filters.q.toLowerCase();
    return !isArchived(d) && (!filters.status || d.status === filters.status)
      && (!filters.type || d.typeCode === filters.type)
      && (!filters.office || (filters.office === '__none' ? !d.office : d.office === filters.office))
      && matchesSearch(d, q);
  }), [docs, filters]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{isAdmin ? 'All Documents' : isHead ? 'Office Documents' : 'My Documents'}</h1>
        </div>
        <div className="row gap wrap">
          {isAdmin && docs && !zipOpen && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZipOpen(true)}>Download ZIP</button>}
          <Link to="/new" className="btn btn-primary btn-sm">+ New document</Link>
        </div>
      </div>
      {isAdmin && docs && zipOpen && <ZipExport docs={shown} onClose={() => setZipOpen(false)} />}
      <div className="filters">
        <input className="search" placeholder="Search by number, payee or anything in the document…" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </Select>
        {isAdmin && (
          <Select value={filters.office} onChange={(e) => setFilters({ ...filters, office: e.target.value })}>
            <option value="">All offices</option>
            {offices.map((o) => <option key={o}>{o}</option>)}
            <option value="__none">No office</option>
          </Select>
        )}
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table">
            <thead>
              <tr><th>Control No.</th><th title="Document Reference No.: the number assigned along the route (e.g. the DV No.)">DRN</th><th>Type</th><th>Payee / Subject</th>{isAdmin && <th>Office</th>}<th>Prepared by</th><th>Status</th><th>Where</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={10} className="muted">No documents found. Processed documents are in the <Link to="/archive">Archive</Link>.</td></tr>}
              {shown.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                    <td className="small">{drnOf(d) || '—'}</td>
                  <td>{d.typeCode}</td>
                  <td>{d.title}</td>
                  {isAdmin && <td className="small">{d.office || '—'}</td>}
                  <td>{d.createdByName}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="small">{whereIs(d) || '—'}</td>
                  <td className="small">{fmt(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
