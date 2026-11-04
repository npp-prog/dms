import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getDocumentType } from '../lib/api.js';
import { blankData, buildSteps } from '../lib/forms.js';
import DocumentPreview from '../components/DocumentPreview.jsx';
import ProcessingGuide from '../components/ProcessingGuide.jsx';

export default function FormatView() {
  const { typeId } = useParams();
  const { settings, canManageFormats } = useAuth();
  const [type, setType] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDocumentType(typeId).then((t) => (t ? setType(t) : setError('Format not found.'))).catch((e) => setError(e.message));
  }, [typeId]);

  if (error) return <div className="page"><div className="alert">{error}</div></div>;
  if (!type) return <div className="page"><div className="spinner" /></div>;

  // Only the DV and the Liquidation Report have a checklist.
  const hasChecklist = (type.checklistSource && type.checklistSource !== 'own') || (type.checklist || []).length > 0;
  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="crumbs"><Link to="/new">Prepare</Link> / {type.code}</div>
          <h1>{type.code} — {type.name}</h1>
          <p className="muted">{type.description}</p>
        </div>
        <div className="row gap">
          <button className="btn btn-ghost" onClick={() => window.print()}>Print blank form</button>
          {canManageFormats && <Link className="btn btn-ghost" to={`/admin/types/${type.id}`}>Edit</Link>}
          {type.active !== false && <Link className="btn btn-primary" to={`/new/${type.id}`}>Prepare this document</Link>}
        </div>
      </div>

      <div className="split">
        <div className="no-print">
          <section className="card">
            <h3>Guided encoding</h3>
            <ol className="steps-list">
              {buildSteps(type).map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>
                  {s.instructions && <p className="small muted">{s.instructions}</p>}
                  <div className="small">{s.fields.map((f) => f.label).join(', ')}</div>
                </li>
              ))}
              {hasChecklist && <li><b>Checklist of requirements</b></li>}
              <li><b>Review, save and print</b></li>
            </ol>
          </section>
          <section className="card guide-card">
            <h3>How to process this document</h3>
            <ProcessingGuide type={type} />
          </section>
          {hasChecklist && (
          <section className="card">
            <h3>Checklist of requirements</h3>
            {type.checklistSource && type.checklistSource !== 'own' && (
              <p className="small">The checklist depends on the type of transaction. When you prepare this document, you choose the
                transaction (e.g. <b>1613</b> — Payment to Supplier, Direct Acquisition) and its checklist is loaded and printed.
                {' '}<Link to="/checklists">Browse the {type.checklistSource} checklists</Link>.</p>
            )}
            <ul className="checklist-view">
              {(!type.checklistSource || type.checklistSource === 'own') && (type.checklist || []).map((c) => (
                <li key={c.id}>
                  <span>☐</span> {c.label} {c.required && <span className="req">required</span>}
                  {c.help && <div className="small muted">{c.help}</div>}
                </li>
              ))}
            </ul>
          </section>
          )}
        </div>
        <DocumentPreview type={type} data={blankData(type)} settings={settings} />
      </div>
    </div>
  );
}
