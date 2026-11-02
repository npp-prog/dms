import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { saveSettings } from '../../lib/api.js';
import { BOARD_TEMPLATES, cleanTemplates, newTemplateId, templatesOf } from '../../lib/workModel.js';

// Administration → Board Templates: the templates offered when someone creates a board (its name,
// description and first groups). Kept in the settings (meta/settings.boardTemplates). A board copies
// its template's groups when it is created, so changing or removing a template never changes
// existing boards.
export default function BoardTemplates() {
  const { settings, setSettings } = useAuth();
  const [list, setList] = useState(() => templatesOf(settings).map((t) => ({ ...t, groupsText: t.groups.join('\n') })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (i, patch) => { setSaved(false); setList(list.map((t, j) => (j === i ? { ...t, ...patch } : t))); };
  const move = (i, d) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; setSaved(false); setList(l); };

  const save = async () => {
    setError('');
    const withGroups = list.map((t) => ({ ...t, groups: String(t.groupsText || '').split('\n') }));
    const bad = withGroups.find((t) => !String(t.name).trim() || !t.groups.some((g) => g.trim()));
    if (bad) { setError('Every template needs a name and at least one group.'); return; }
    const clean = cleanTemplates(withGroups);
    if (!clean.length) { setError('Keep at least one template.'); return; }
    setBusy(true);
    try {
      await saveSettings({ boardTemplates: clean });
      setSettings({ ...settings, boardTemplates: clean });
      setList(clean.map((t) => ({ ...t, groupsText: t.groups.join('\n') })));
      setSaved(true);
    } catch (e) { setError(e.code === 'permission-denied' ? 'Only administrators may change the board templates.' : e.message); } finally { setBusy(false); }
  };
  const restore = () => {
    if (!window.confirm('Replace the list with the starter templates? Click Save to keep it. Existing boards are not changed.')) return;
    setSaved(false);
    setList(BOARD_TEMPLATES.map((t) => ({ ...t, groupsText: t.groups.join('\n') })));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Board Templates</h1></div>
        <div className="row gap">
          <button type="button" className="btn btn-ghost btn-sm" onClick={restore}>Starter templates</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      {saved && <div className="alert alert-ok">Saved. New boards use these templates; existing boards keep their groups.</div>}
      <div className="wk-templates">
        {list.map((t, i) => (
          <section key={t.id} className="card wk-template">
            <div className="row gap wk-template-head">
              <label className="field grow"><span className="field-label">Name</span>
                <input value={t.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} /></label>
              <span className="row gap">
                <button type="button" className="btn-icon" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn-icon" title="Move down" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="btn-icon" title="Remove the template" aria-label="Remove the template" disabled={list.length === 1}
                  onClick={() => window.confirm(`Remove the template "${t.name || 'without a name'}"? Boards made from it are not changed.`) && (setSaved(false), setList(list.filter((_, j) => j !== i)))}>×</button>
              </span>
            </div>
            <label className="field"><span className="field-label">Description</span>
              <textarea rows={2} value={t.description} maxLength={400} onChange={(e) => set(i, { description: e.target.value })} />
              <span className="xs muted">Shown under the template when someone creates a board.</span></label>
            <label className="field"><span className="field-label">Groups</span>
              <textarea rows={Math.min(8, Math.max(3, String(t.groupsText).split('\n').length))} value={t.groupsText} onChange={(e) => set(i, { groupsText: e.target.value })} />
              <span className="xs muted">One group per line, in order (at most 30). A new board starts with these groups; its managers can change them.</span></label>
          </section>
        ))}
      </div>
      <button type="button" className="btn btn-ghost" onClick={() => { setSaved(false); setList([...list, { id: newTemplateId(), name: '', description: '', groups: [], groupsText: '' }]); }}>+ Add a template</button>
      <p className="xs muted">Changes take effect when you click Save. A board copies its template&rsquo;s groups when it is created, so changing or removing a template does not change existing boards.</p>
    </div>
  );
}
