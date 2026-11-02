import { useState } from 'react';
import { LinkEditor, LinkList } from './DocLinks.jsx';
import { linkLocked } from '../lib/workflow.js';
import { UPLOAD_ACCEPT, uploadSupporting } from '../lib/supporting.js';

// Supplemental documents: what goes with the document but is not on its checklist: a file uploaded
// (a DMS document of its own, in All Documents) or a document already in DMS, linked. Each shows as
// a tab after the PDF.
export default function SupplementsCard({ doc, actor, canAdd, canRemove, busy, onSave, onOpen }) {
  const list = doc.supplements || [];
  const [label, setLabel] = useState('');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  if (!canAdd && !list.length) return null;

  // A document already in DMS: linked (it keeps its own control no. and route).
  const link = async (l) => {
    setLinking(false); setError('');
    // (The same document may be linked more than once, e.g. under another label.)
    try {
      await onSave([...list, { ...l, label: label.trim() || `${l.typeCode} ${l.controlNo}` }], `linked ${l.controlNo}`);
      setLabel('');
    } catch (e) { setError(e.message); }
  };

  const add = async (file) => {
    if (!file) return;
    setError('');
    try {
      const l = await uploadSupporting({
        parent: doc, slot: 'supplemental', label: label.trim() || 'Supplemental document', code: 'SUPP', number: list.length + 1, file, actor, onStep: setStep,
      });
      await onSave([...list, l], `added ${l.dms.controlNo} (${l.label})`);
      setLabel('');
    } catch (e) {
      setError(e.message);
    } finally {
      setStep('');
    }
  };

  return (
    <section className="card supplements-card">
      <div className="card-head"><h3>Supplemental documents</h3>{list.length > 0 && <span className="small muted">{list.length}</span>}</div>
      {list.length === 0 && <p className="small muted">What goes with this document but is not on its checklist: upload a file (saved in All Documents
        with its own control number) or link a document already in DMS. Each opens as a tab after the PDF.</p>}
      <LinkList links={list.map((l) => ({ ...l, name: l.label || l.name }))}
        onOpen={(l, i) => onOpen(list[i], `supp:${i}`)}
        isLocked={(l, i) => linkLocked(doc, list[i])}
        onRemove={canRemove ? (i) => window.confirm('Remove it from this document? It stays in All Documents.') && onSave(list.filter((_, j) => j !== i), `removed ${list[i].dms?.controlNo || list[i].controlNo || list[i].name}`) : undefined} />
      {error && <div className="alert small">{error}</div>}
      {canAdd && (
        <div className="supp-add">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} aria-label="What is it (optional)" placeholder="What is it (optional)" disabled={!!step} />
          {step ? <span className="small muted">{step}</span> : (
            <label className={`btn btn-ghost btn-sm${busy ? ' disabled' : ''}`}>
              + Upload
              <input type="file" hidden accept={UPLOAD_ACCEPT} disabled={busy} onChange={(e) => { add(e.target.files[0]); e.target.value = ''; }} />
            </label>
          )}
          {!step && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setLinking((x) => !x)}>+ Link DMS document</button>}
        </div>
      )}
      {canAdd && linking && (
        <LinkEditor excludeId={doc.id} onAdd={link} onCancel={() => setLinking(false)} />
      )}
    </section>
  );
}
