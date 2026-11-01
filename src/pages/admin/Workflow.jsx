import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { addPosition, listDocumentTypes, saveRoute } from '../../lib/api.js';
import { positionsOf } from '../../lib/defaults.js';
import PositionsPicker from '../../components/PositionsPicker.jsx';
import { THIRD_PARTY, routeFromGuide } from '../../lib/workflow.js';
import Icon from '../../components/Icon.jsx';
import { DEFAULT_REF_PATTERN, refNumber } from '../../lib/naming.js';
import Select from '../../components/Select.jsx';

const PREPARER = ''; // the office that prepared the document
const PREPARER_PICK = '@preparer'; // the preparer's office in a select (whose value cannot be '')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clean = (route) => route.map((s) => ({
  office: s.office || '', action: s.action || '', sign: Boolean(s.sign),
  ...(s.assign?.field ? { assign: { field: s.assign.field, dateField: s.assign.dateField || '', pattern: s.assign.pattern || '' } } : {}),
  ...(s.fills?.length ? { fills: [...s.fills] } : {}),
  ...(s.upload !== undefined ? { upload: s.upload } : {}),
  ...(s.alternates?.length ? { alternates: [...s.alternates] } : {}),
  ...(s.positions?.length ? { positions: [...s.positions] } : {}),
}));

// Administration > Workflow: the route of every document type (which offices receive it, in
// what order, what each does, which must sign, assign, fill in or upload). Tracking where the
// documents are is its own page (Documents > Tracking).
export default function Workflow() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Workflow</h1>
        </div>
      </div>
      <Routes />
    </div>
  );
}

function Routes() {
  const { actor, settings } = useAuth();
  const [types, setTypes] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const offices = settings.offices || [];
  const [q, setQ] = useState('');

  const load = () => listDocumentTypes().then((t) => {
    setTypes(t);
    setSelected((cur) => cur || t.find((x) => x.active !== false)?.id || t[0]?.id || null);
  }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!types) return <div className="spinner" />;
  const type = types.find((t) => t.id === selected);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = types.filter((t) => words.every((w) => `${t.code} ${t.name}`.toLowerCase().includes(w)));

  return (
    <div className="route-layout">
      <div className="card route-types">
        <input className="search route-search" type="search" placeholder="Search document types…" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search document types" />
        {shown.length === 0 && <p className="small muted route-none">No document type matches.</p>}
        {shown.map((t) => (
          <button key={t.id} type="button" className={t.id === selected ? 'active' : ''} onClick={() => setSelected(t.id)}>
            <span className="code">{t.code}</span>
            <span className="t">{t.name}
              {t.active === false && <span className="small muted">inactive</span>}
            </span>
          </button>
        ))}
      </div>
      {type ? <RouteEditor key={type.id} type={type} offices={offices} actor={actor} onSaved={load} /> : <div className="card muted">No document types yet.</div>}
    </div>
  );
}

function RouteEditor({ type, offices, actor, onSaved }) {
  const { settings, setSettings, canManageSettings } = useAuth();
  const newPosition = async (name) => {
    const positions = await addPosition(settings, name);
    setSettings((s) => ({ ...s, positions }));
  };
  const guide = useMemo(() => routeFromGuide(type, offices), [type, offices]);
  const saved = useMemo(() => clean(type.route?.length ? type.route : guide), [type, guide]);
  const [route, setRoute] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const custom = Boolean(type.route?.length);
  const dirty = !same(clean(route), saved) || !custom;
  const officeName = (o) => (o === THIRD_PARTY ? 'Third party (designated by the preparer)' : o || "Preparer's office");
  // A step's office, with its alternates: "Office of the Municipal Mayor or …Vice Mayor".
  const officesOf = (s) => [s.office, ...(s.alternates || [])].map(officeName).join(' or ');

  // Offices in Settings, plus any office a step names that is not (or no longer) in the list.
  // The type's fields that can take a reference no. and its date; a sensible first choice.
  const textFields = (type.fields || []).filter((f) => f.type === 'text');
  const dateFields = (type.fields || []).filter((f) => f.type === 'date');
  const suggestAssign = () => {
    const field = textFields.find((f) => f.filledBy === 'accounting' && /no\.?$/i.test(f.label)) || textFields.find((f) => /no\.?/i.test(f.label)) || textFields[0];
    const date = dateFields.find((f) => f.filledBy === 'accounting') || null;
    return { field: field?.key || '', dateField: date?.key || '', pattern: DEFAULT_REF_PATTERN };
  };
  // One step open for editing at a time; the others show as one-line summaries.
  const [open, setOpen] = useState(null);
  const fieldLabel = (key) => (type.fields || []).find((f) => f.key === key)?.label || key;
  const choices = [...new Set([...offices, ...route.map((s) => s.office).filter(Boolean)])];
  const set = (i, patch) => setRoute(route.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const next = [...route];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setRoute(next);
    setOpen((o) => (o === i ? i + d : o === i + d ? i : o));
  };
  const problems = [
    !route.length && 'Add at least one step.',
    route.some((s) => !s.action.trim()) && 'Every step needs an action (what the office does).',
    route.some((s, i) => i > 0 && s.office !== THIRD_PARTY && s.office === route[i - 1].office && same([...(s.positions || [])].sort(), [...(route[i - 1].positions || [])].sort())) && 'Two steps in a row are for the same people (office and positions): merge them, or change the office or who acts.',
    route.some((s) => s.office && s.office !== THIRD_PARTY && !offices.includes(s.office)) && 'A step names an office that is not in Settings: users of that office will not receive it.',
  ].filter(Boolean);
  const blocking = !route.length || route.some((s) => !s.action.trim());

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await saveRoute(type.id, route, actor);
      setMsg({ ok: true, text: `Saved. New ${type.code} documents follow this route${route.some((s) => s.alternates?.length) ? ' (the preparer chooses the office of each step with alternates)' : ''}; documents already on their way keep theirs.` });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  // A copy of the step right after it, opened for editing.
  const duplicate = (i) => {
    const copy = JSON.parse(JSON.stringify(route[i]));
    setRoute([...route.slice(0, i + 1), copy, ...route.slice(i + 1)]);
    setOpen(i + 1);
  };
  const tools = (i) => (
    <div className="route-tools">
      <button type="button" className="btn-icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
      <button type="button" className="btn-icon" title="Move down" disabled={i === route.length - 1} onClick={() => move(i, 1)}>↓</button>
      <button type="button" className="btn-icon" title="Remove step" onClick={() => { setRoute(route.filter((_, j) => j !== i)); setOpen(null); }}>×</button>
    </div>
  );

  return (
    <section className="card route-editor">
      <div className="card-head">
        <div>
          <h3>{type.code} — {type.name}</h3>
          <p className="small muted">{custom
            ? `Route set by ${type.routeUpdatedBy || 'an admin'}.`
            : 'No route saved yet. Adjust the steps below and save.'}</p>
        </div>
      </div>

      <div className="route-chain" aria-label="Route preview">
        {route.map((s, i) => (
          <span key={i} className="route-chip">
            <b>{i + 1}</b> {officesOf(s)}{s.sign && <span className="sign-tag" title="Signs the PDF"><Icon name="sign" />Signs</span>}
          </span>
        ))}
      </div>

      <ol className="route-steps">
        {route.map((s, i) => (
          <li key={i} className={open === i ? 'open' : 'closed'}>
            {open !== i ? (
              <>
                <span className="wf-dot">{i + 1}</span>
                <button type="button" className="route-summary" onClick={() => setOpen(i)} title="Edit this step">
                  <b>{officesOf(s)}</b>
                  <span className="small">{s.action || <i className="muted">No action yet</i>}</span>
                  <span className="route-badges">
                    {s.positions?.length > 0 && s.office && <span className="badge badge-blue">By {s.positions.join(' or ')}</span>}
                    {s.sign && <span className="sign-tag" title="Signs the PDF"><Icon name="sign" />Signs</span>}
                    {s.assign && <span className="badge badge-blue">Assigns {fieldLabel(s.assign.field)}</span>}
                    {s.fills?.length > 0 && <span className="badge badge-blue">Fills in {s.fills.length} detail{s.fills.length > 1 ? 's' : ''}</span>}
                    {s.upload !== undefined && <span className="badge badge-blue">Upload (optional)</span>}
                  </span>
                </button>
                {tools(i)}
              </>
            ) : (
              <>
                <div className="route-step-head">
                  <span className="wf-dot">{i + 1}</span>
                  <b>Step {i + 1}</b>
                  <span className="spacer" />
                  {tools(i)}
                  <button type="button" className="btn btn-ghost btn-sm" title="Add a copy of this step after it" onClick={() => duplicate(i)}>Duplicate</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>Done</button>
                </div>
                <div className="route-fields">
                  <label className="field">
                    <span className="field-label">Office</span>
                    <Select value={s.office} onChange={(e) => set(i, { office: e.target.value, ...(e.target.value === THIRD_PARTY ? { alternates: [], positions: [] } : {}) })}>
                      <option value={PREPARER}>Preparer&apos;s office (whoever prepared it)</option>
                      <option value={THIRD_PARTY}>Third party (the preparer designates the person: a supplier, payee…)</option>
                      {choices.map((o) => <option key={o} value={o}>{o}{offices.includes(o) ? '' : ' (not in Settings)'}</option>)}
                    </Select>
                  </label>
                  <label className="field">
                    <span className="field-label">Action</span>
                    <input value={s.action} onChange={(e) => set(i, { action: e.target.value })} />
                  </label>
                  {s.office === THIRD_PARTY ? (
                    <p className="help">The preparer designates the third party (a supplier, payee or other person with a DMS account) before routing the document. They sign it, if this step signs, and release it to the next step.</p>
                  ) : (
                  <div className="field">
                    <span className="field-label">Alternate offices <span className="muted">(optional)</span></span>
                    <div className="chips-field">
                      {(s.alternates || []).map((o) => (
                        <span key={o} className="alt-chip">or {officeName(o)}
                          <button type="button" title="Remove" onClick={() => set(i, { alternates: s.alternates.filter((x) => x !== o) })}>×</button></span>
                      ))}
                      <Select value="" aria-label="Add an alternate office" placeholder="+ Add an office…"
                        onChange={(e) => e.target.value !== '-' && set(i, { alternates: [...(s.alternates || []), e.target.value === PREPARER_PICK ? PREPARER : e.target.value] })}>
                        <option value="-">+ Add an office…</option>
                        {[PREPARER_PICK, ...choices].filter((o) => (o === PREPARER_PICK ? PREPARER : o) !== s.office && !(s.alternates || []).includes(o === PREPARER_PICK ? PREPARER : o))
                          .map((o) => <option key={o} value={o}>{o === PREPARER_PICK ? "Preparer's office" : o}</option>)}
                      </Select>
                    </div>
                    <span className="help">The preparer chooses which office handles this step.</span>
                  </div>
                  )}
                  {s.office !== PREPARER && s.office !== THIRD_PARTY ? (
                    <div className="field">
                      <span className="field-label">Who acts <span className="muted">(optional)</span></span>
                      <div className="chips-field">
                        <PositionsPicker value={s.positions || []} choices={positionsOf(settings)} onNew={canManageSettings ? newPosition : undefined}
                          placeholder="+ Add a position…" onChange={(positions) => set(i, { positions })} />
                      </div>
                      <span className="help">{s.positions?.length ? 'Only these positions (and the office head) sign and route it.' : 'Anyone in the office.'}</span>
                    </div>
                  ) : <div />}
                  <div className="route-options">
                    <label className="check">
                      <input type="checkbox" checked={s.sign} onChange={(e) => set(i, { sign: e.target.checked })} />
                      Must sign the PDF (DICT PNPKI)
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={Boolean(s.assign)} disabled={!textFields.length}
                        onChange={(e) => set(i, { assign: e.target.checked ? suggestAssign() : undefined })} />
                      Assigns a reference no.
                    </label>
                  </div>
                  {s.assign && (
                    <div className="assign-fields">
                      <label className="field">
                        <span className="field-label">Reference no. field</span>
                        <Select value={s.assign.field} onChange={(e) => set(i, { assign: { ...s.assign, field: e.target.value } })}>
                          {textFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </Select>
                      </label>
                      <label className="field">
                        <span className="field-label">Date field</span>
                        <Select value={s.assign.dateField || ''} onChange={(e) => set(i, { assign: { ...s.assign, dateField: e.target.value } })}>
                          <option value="">— None —</option>
                          {dateFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </Select>
                      </label>
                      <label className="field">
                        <span className="field-label">Number pattern</span>
                        <input value={s.assign.pattern} onChange={(e) => set(i, { assign: { ...s.assign, pattern: e.target.value } })}
                          placeholder={DEFAULT_REF_PATTERN} />
                      </label>
                      <p className="help assign-help">Next number: <b>{refNumber(s.assign.pattern || DEFAULT_REF_PATTERN, { fund: 'General Fund' }).format(1)}</b>
                        {' · '}{'{YYYY}'} year, {'{YY}'}, {'{MM}'} month, {'{DD}'}, {'{FUND}'} fund (GF, SEF, TF), {'{####}'} the series, which starts again
                        whenever the rest changes. The date field gets today&apos;s date.</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRoute([...route, { office: offices[0] || '', action: '', sign: false }]); setOpen(route.length); }}>+ Add step</button>

      {problems.length > 0 && <ul className="route-problems small">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {msg && <div className={msg.ok ? 'alert alert-ok' : 'alert'}>{msg.text}</div>}
      <div className="row gap wrap route-actions">
        <button className="btn btn-primary" disabled={busy || blocking || !dirty} onClick={save}>{busy ? 'Saving…' : custom ? 'Save route' : 'Save as the route'}</button>
        {!same(clean(route), saved) && <button className="btn btn-ghost" onClick={() => { setRoute(saved); setOpen(null); }}>Undo changes</button>}
        {!same(clean(route), guide) && <button className="btn btn-ghost" onClick={() => setRoute(guide)}>Start from the processing guide</button>}
      </div>
    </section>
  );
}
