import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { getDocumentType, saveDocumentType } from '../../lib/api.js';
import { COLUMN_TYPES, FIELD_TYPES } from '../../lib/defaults.js';
import { slugKey } from '../../lib/forms.js';
import { CHECKLIST_SOURCES } from '../../lib/checklists.js';
import { PAPER_SIZES } from '../../lib/paper.js';
import { generateDefaultTemplate } from '../../lib/template.js';
import DocumentPreview from '../../components/DocumentPreview.jsx';
import Select from '../../components/Select.jsx';

const EMPTY = {
  code: '', name: '', category: '', description: '', active: true,
  paperSize: 'A4', orientation: 'portrait', steps: [], fields: [], checklist: [], checklistSource: 'own', processing: [], template: '',
};

const TABS = ['General', 'Guided Steps', 'Fields', 'Checklist', 'Processing Guide', 'Format / Template'];
// An upload-only type has no format: its documents are uploaded as files (Documents > Upload).
const UPLOAD_TABS = ['General', 'Processing Guide'];

const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;

function move(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function RowActions({ list, i, onChange }) {
  return (
    <div className="row-actions">
      <button type="button" className="btn-icon" title="Move up" onClick={() => onChange(move(list, i, -1))}>↑</button>
      <button type="button" className="btn-icon" title="Move down" onClick={() => onChange(move(list, i, 1))}>↓</button>
      <button type="button" className="btn-icon danger" title="Remove" onClick={() => onChange(list.filter((_, idx) => idx !== i))}>×</button>
    </div>
  );
}

function ColumnsEditor({ columns = [], onChange }) {
  const set = (i, patch) => onChange(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  return (
    <div className="sub-editor">
      <div className="small muted">Table columns. “Computed” multiplies other column keys, e.g. <code>qty*unitCost</code>.</div>
      {columns.map((c, i) => (
        <div key={i} className="editor-row compact">
          <input placeholder="Column label" value={c.label}
            onChange={(e) => set(i, { label: e.target.value, ...(c.keyTouched ? {} : { key: slugKey(e.target.value) }) })} />
          <input placeholder="key" value={c.key} onChange={(e) => set(i, { key: e.target.value, keyTouched: true })} />
          <Select value={c.type} onChange={(e) => set(i, { type: e.target.value })}>
            {COLUMN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <input placeholder="Computed (a*b)" value={c.compute || ''} onChange={(e) => set(i, { compute: e.target.value })} />
          <label className="check"><input type="checkbox" checked={Boolean(c.total)} onChange={(e) => set(i, { total: e.target.checked })} /> Total</label>
          <label className="check" title="Printed as typed instead of in capitals">
            <input type="checkbox" checked={Boolean(c.keepCase)} onChange={(e) => set(i, { keepCase: e.target.checked })} /> As typed</label>
          <RowActions list={columns} i={i} onChange={onChange} />
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm"
        onClick={() => onChange([...columns, { key: '', label: '', type: 'text' }])}>+ Column</button>
    </div>
  );
}

export default function DocumentTypeEditor() {
  const { typeId } = useParams();
  const navigate = useNavigate();
  const { actor, settings } = useAuth();
  const [type, setType] = useState(typeId ? null : EMPTY);
  const [tab, setTab] = useState(TABS[0]);
  const [error, setError] = useState('');
  // Could not load the type: the page shows only this (save errors show above the editor).
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (typeId) getDocumentType(typeId).then((t) => (t ? setType({ ...EMPTY, ...t }) : setLoadError('Not found'))).catch((e) => setLoadError(e.message));
  }, [typeId]);

  const issues = useMemo(() => {
    if (!type) return [];
    const list = [];
    if (!type.code.trim()) list.push('Code is required.');
    if (!type.name.trim()) list.push('Name is required.');
    if (type.processing.some((p) => !p.office.trim() || !p.action.trim())) list.push('Every processing step needs an office and an action.');
    if (type.uploadOnly) return list;
    const keys = type.fields.map((f) => f.key);
    if (keys.some((k) => !k)) list.push('Every field needs a key.');
    if (new Set(keys).size !== keys.length) list.push('Field keys must be unique.');
    if (keys.some((k) => k && !/^[A-Za-z_][\w]*$/.test(k))) list.push('Field keys may only contain letters, numbers and underscores.');
    if (type.checklist.some((c) => !c.label.trim())) list.push('Every checklist item needs a label.');
    return list;
  }, [type]);

  if (loadError) return <div className="page"><div className="alert">{loadError}</div></div>;
  if (!type) return <div className="page"><div className="spinner" /></div>;

  const patch = (p) => { setSaved(false); setType((t) => ({ ...t, ...p })); };
  const setList = (key) => (list) => patch({ [key]: list });
  const setItem = (key, i, p) => patch({ [key]: type[key].map((x, idx) => (idx === i ? { ...x, ...p } : x)) });

  const save = async () => {
    if (issues.length) { setError(issues.join(' ')); return; }
    setSaving(true);
    setError('');
    try {
      const clean = {
        ...type,
        code: type.code.trim().toUpperCase(),
        fields: type.fields.map(({ keyTouched, ...f }) => ({
          ...f,
          ...(f.columns ? { columns: f.columns.map(({ keyTouched: _k, ...c }) => c) } : {}),
        })),
        template: type.uploadOnly ? '' : type.template || generateDefaultTemplate(type),
      };
      const id = await saveDocumentType(typeId, clean, actor);
      setSaved(true);
      if (!typeId) navigate(`/admin/types/${id}`, { replace: true });
      else setType({ ...clean, version: (Number(type.version) || 1) + 1 });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/admin/types">Document Types</Link> / {type.code || 'New'}</div>
          <h1>{typeId ? `Edit ${type.code}` : 'New Document Type'} {type.version && <span className="muted small">v{type.version}</span>}</h1>
        </div>
        <div className="row gap">
          {saved && <span className="badge badge-green">Saved</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="tabs">
        {(type.uploadOnly ? UPLOAD_TABS : TABS).map((t) => <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'General' && (
        <section className="card">
          <div className="fields">
            <div className="field"><label className="field-label">Code <span className="req">*</span></label>
              <input value={type.code} onChange={(e) => patch({ code: e.target.value })} /></div>
            <div className="field"><label className="field-label">Name <span className="req">*</span></label>
              <input value={type.name} onChange={(e) => patch({ name: e.target.value })} /></div>
            <div className="field"><label className="field-label">Category</label>
              <input value={type.category} onChange={(e) => patch({ category: e.target.value })} /></div>
            <div className="field field-wide"><label className="field-label">Documents of this type are</label>
              <Select value={type.uploadOnly ? 'upload' : 'prepare'} onChange={(e) => { patch({ uploadOnly: e.target.value === 'upload' }); setTab('General'); }}>
                <option value="prepare">Prepared in DMS from its format (fields, steps and template)</option>
                <option value="upload">Uploaded only: no format (a scanned or signed file, a PDF from another system)</option>
              </Select>
              {type.uploadOnly && <span className="small muted">It is not listed in Prepare Document. Users choose it in Documents → Upload, and it follows its workflow (Administration → Workflow).</span>}
            </div>
            <div className="field"><label className="field-label">Status</label>
              <Select value={type.active === false ? 'no' : 'yes'} onChange={(e) => patch({ active: e.target.value === 'yes' })}>
                <option value="yes">Active (available to users)</option><option value="no">Inactive</option>
              </Select></div>
            {!type.uploadOnly && <>
            <div className="field"><label className="field-label">Paper size</label>
              <Select value={type.paperSize === 'Long' ? 'Folio' : type.paperSize} onChange={(e) => patch({ paperSize: e.target.value })}>
                {Object.entries(PAPER_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select></div>
            <div className="field"><label className="field-label">Orientation</label>
              <Select value={type.orientation} onChange={(e) => patch({ orientation: e.target.value })}>
                <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </Select></div>
            <div className="field"><label className="field-label">Letterhead</label>
              <Select value={type.headerOffice || ''} onChange={(e) => patch({ headerOffice: e.target.value })}>
                <option value="">The office of the document</option>
                {(settings.offices || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
              <div className="help">Whose title, email address and contact no. the form prints (Settings → Office letterheads):
                <code>{'{{office.letterhead}}'}</code> <code>{'{{office.email}}'}</code> <code>{'{{office.contact}}'}</code></div></div>
            </>}
            <div className="field"><label className="field-label">Bulk download</label>
              <label className="check"><input type="checkbox" checked={Boolean(type.bulkDownload)} onChange={(e) => patch({ bulkDownload: e.target.checked })} />
                Download all (ZIP): the document, its checklist and every linked document</label></div>
            <div className="field"><label className="field-label">Public QR page</label>
              <label className="check"><input type="checkbox" checked={type.publicPdf === undefined ? type.code !== 'PAYROLL' : type.publicPdf !== false}
                onChange={(e) => patch({ publicPdf: e.target.checked })} />
                Show its PDF to anyone who scans the QR code</label>
              <div className="help">Off: the QR page still shows that the document is genuine, its route and signatories, and checks a copy;
                its PDF opens only for signed-in DMS users who handle it (for documents with personal data, such as Payroll).</div></div>
            <div className="field"><label className="field-label">Linking</label>
              <label className="check"><input type="checkbox" checked={Boolean(type.linkOnce)} onChange={(e) => patch({ linkOnce: e.target.checked })} />
                May be linked to only one document</label>
              <div className="help">On: a document of this type is linked (to a checklist item, as an attachment or a supplemental document) to one
                document only, once (e.g. an OBR to its DV). Off: it may be linked to any number of documents.</div></div>
            <div className="field field-wide"><label className="field-label">Description</label>
              <textarea rows={3} value={type.description} onChange={(e) => patch({ description: e.target.value })} /></div>
          </div>
        </section>
      )}

      {tab === 'Guided Steps' && (
        <section className="card">
          <p className="muted small">Steps guide the user through filling in the document. Assign fields to steps in the Fields tab.
            The Checklist and Review steps are added automatically at the end.</p>
          {type.steps.map((s, i) => (
            <div key={s.id} className="editor-block">
              <div className="editor-row">
                <span className="step-num">{i + 1}</span>
                <input placeholder="Step title" value={s.title} onChange={(e) => setItem('steps', i, { title: e.target.value })} />
                <RowActions list={type.steps} i={i} onChange={setList('steps')} />
              </div>
              <textarea rows={2} placeholder="Instructions shown to the user for this step"
                value={s.instructions || ''} onChange={(e) => setItem('steps', i, { instructions: e.target.value })} />
              <div className="small muted">Fields: {type.fields.filter((f) => f.step === s.id).map((f) => f.label).join(', ') || 'none'}</div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => patch({ steps: [...type.steps, { id: uid('s'), title: '', instructions: '' }] })}>+ Add step</button>
        </section>
      )}

      {tab === 'Fields' && (
        <section className="card">
          <p className="muted small">The key is used in the template as <code>{'{{key}}'}</code>. Fields without a step are shown in an extra “Other Details” step.</p>
          {type.fields.map((f, i) => (
            <div key={i} className="editor-block">
              <div className="editor-row">
                <input placeholder="Label" value={f.label}
                  onChange={(e) => setItem('fields', i, { label: e.target.value, ...(f.keyTouched || typeId ? {} : { key: slugKey(e.target.value) }) })} />
                <input placeholder="key" className="mono" value={f.key} onChange={(e) => setItem('fields', i, { key: e.target.value, keyTouched: true })} />
                <Select value={f.type} onChange={(e) => setItem('fields', i, {
                  type: e.target.value,
                  ...(e.target.value === 'table' && !f.columns ? { columns: [{ key: 'description', label: 'Description', type: 'text' }, { key: 'amount', label: 'Amount', type: 'currency', total: true }] } : {}),
                })}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <Select value={f.step || ''} onChange={(e) => setItem('fields', i, { step: e.target.value })}>
                  <option value="">— No step —</option>
                  {type.steps.map((s, si) => <option key={s.id} value={s.id}>Step {si + 1}: {s.title}</option>)}
                </Select>
                <label className="check"><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => setItem('fields', i, { required: e.target.checked })} /> Required</label>
                <label className="check" title="Not shown to the end user; filled in by the Accounting Office (admins) on the saved document">
                  <input type="checkbox" checked={f.filledBy === 'accounting'} onChange={(e) => setItem('fields', i, { filledBy: e.target.checked ? 'accounting' : '' })} /> Filled in by Accounting</label>
                <label className="check" title="Printed as typed instead of in capitals">
                  <input type="checkbox" checked={Boolean(f.keepCase)} onChange={(e) => setItem('fields', i, { keepCase: e.target.checked })} /> As typed</label>
                <RowActions list={type.fields} i={i} onChange={setList('fields')} />
              </div>
              <div className="editor-row compact">
                {f.type !== 'table' && (
                  <input placeholder="Default value" value={f.default || ''} onChange={(e) => setItem('fields', i, { default: e.target.value })} />
                )}
                <input placeholder="Help text" value={f.help || ''} onChange={(e) => setItem('fields', i, { help: e.target.value })} />
                {f.type === 'table' && (
                  <input type="number" min="0" placeholder="Min printed rows" value={f.minRows || ''}
                    onChange={(e) => setItem('fields', i, { minRows: Number(e.target.value) || 0 })} />
                )}
              </div>
              {f.type === 'select' && (
                <textarea rows={2} placeholder="Dropdown options, one per line" value={(f.options || []).join('\n')}
                  onChange={(e) => setItem('fields', i, { options: e.target.value.split('\n') })}
                  onBlur={(e) => setItem('fields', i, { options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })} />
              )}
              {f.type === 'table' && <ColumnsEditor columns={f.columns} onChange={(columns) => setItem('fields', i, { columns })} />}
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => patch({ fields: [...type.fields, { key: '', label: '', type: 'text', required: false, step: type.steps.at(-1)?.id || '' }] })}>+ Add field</button>
        </section>
      )}

      {tab === 'Checklist' && (
        <section className="card">
          <div className="field" style={{ maxWidth: 520, marginBottom: '1rem' }}>
            <label className="field-label">Checklist source</label>
            <Select value={type.checklistSource || 'own'} onChange={(e) => patch({ checklistSource: e.target.value })}>
              {CHECKLIST_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <div className="help">With a library source, the user picks the transaction type (e.g. 1613) and its checklist from the
              Checklists page is used and printed. The list below is then not used.</div>
          </div>
          {(type.checklistSource || 'own') === 'own' && <>
          <p className="muted small">Requirements the user must confirm before the document can be marked complete (e.g. supporting documents per COA rules).</p>
          {type.checklist.map((c, i) => (
            <div key={c.id} className="editor-block">
              <div className="editor-row">
                <input placeholder="Requirement" value={c.label} onChange={(e) => setItem('checklist', i, { label: e.target.value })} />
                <label className="check"><input type="checkbox" checked={Boolean(c.required)} onChange={(e) => setItem('checklist', i, { required: e.target.checked })} /> Required</label>
                <RowActions list={type.checklist} i={i} onChange={setList('checklist')} />
              </div>
              <input placeholder="Help / when applicable (optional)" value={c.help || ''} onChange={(e) => setItem('checklist', i, { help: e.target.value })} />
              <div className="small muted">Template tag: <code>{`{{check:${c.id}}}`}</code></div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => patch({ checklist: [...type.checklist, { id: uid('c'), label: '', required: false }] })}>+ Add requirement</button>
          </>}
        </section>
      )}

      {tab === 'Processing Guide' && (
        <section className="card">
          <p className="muted small">Tell the end user how to process the document after encoding and printing: which office
            receives it, in what order, and what each office does. When a document is marked complete, DMS routes it along these steps, unless a route is set under Administration → Workflow.</p>
          {type.processing.map((p, i) => (
            <div key={p.id} className="editor-block">
              <div className="editor-row">
                <span className="step-num">{i + 1}</span>
                <input placeholder="Office" value={p.office}
                  onChange={(e) => setItem('processing', i, { office: e.target.value })} />
                <input placeholder="Action" value={p.action}
                  onChange={(e) => setItem('processing', i, { action: e.target.value })} />
                <RowActions list={type.processing} i={i} onChange={setList('processing')} />
              </div>
              <textarea rows={2} placeholder="Details shown to the user (what to attach, who signs, what to watch out for)"
                value={p.details || ''} onChange={(e) => setItem('processing', i, { details: e.target.value })} />
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => patch({ processing: [...type.processing, { id: uid('p'), office: '', action: '', details: '' }] })}>+ Add processing step</button>
        </section>
      )}

      {tab === 'Format / Template' && (
        <div className="split">
          <section className="card">
            <div className="row gap wrap">
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (!type.template || window.confirm('Replace the current template with a generated one?')) patch({ template: generateDefaultTemplate(type) });
              }}>Generate from fields</button>
            </div>
            <textarea className="code" rows={28} spellCheck={false} value={type.template}
              placeholder="HTML template. Click “Generate from fields” to start." onChange={(e) => patch({ template: e.target.value })} />
            <details className="small">
              <summary>Template reference</summary>
              <ul className="ref">
                <li><code>{'{{key}}'}</code> field value · filters: <code>|currency</code> <code>|peso</code> <code>|date</code> <code>|words</code> <code>|upper</code> <code>|number</code></li>
                <li><code>{'{{controlNo}}'}</code> <code>{'{{today|date}}'}</code> <code>{'{{preparedBy}}'}</code> <code>{'{{preparedByPosition}}'}</code> <code>{'{{preparedByIdNo}}'}</code> <code>{'{{lgu.name}}'}</code> <code>{'{{lgu.address}}'}</code></li>
                <li><code>{'{{table:key}}'}</code> auto table · <code>{'{{sum:key.column|peso}}'}</code> column total</li>
                <li><code>{'{{#each key}}<tr><td>{{@no}}</td><td>{{column}}</td></tr>{{/each}}'}</code> custom rows</li>
                <li><code>{'{{check:id}}'}</code> checklist box · <code>{'{{#if key=Value}}✓{{/if}}'}</code> conditional</li>
                <li><code>{'{{lgu.seal}}'}</code> seal image · CSS classes: <code>ph</code> (header: <code>l1</code> <code>l2</code> <code>l3</code>), <code>pmeta-t</code>, <code>pt</code>, <code>lbl</code>, <code>pf-box</code>, <code>pf-cell</code>, <code>pf-signame</code>, <code>cap</code>, <code>sig2</code>, <code>r</code>, <code>c</code></li>
              </ul>
              <div>Field keys: {type.fields.map((f) => <code key={f.key}>{f.key}</code>)}</div>
            </details>
          </section>
          <DocumentPreview type={type} settings={settings} controlNo={`${type.code || 'XX'}-0000-00-0000`} preparedBy="Juan Dela Cruz" />
        </div>
      )}
    </div>
  );
}
