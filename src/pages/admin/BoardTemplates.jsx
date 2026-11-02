import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { saveSettings } from '../../lib/api.js';
import { BOARD_TEMPLATES, cleanTemplates, newTemplateId, templatesOf } from '../../lib/workModel.js';

// Administration → Board Templates: the templates offered when someone creates a board (its name,
// description and first groups), kept in the settings (meta/settings.boardTemplates). A list of the
// templates; choosing one opens it to edit. A board copies its template's groups when it is created,
// so changing or removing a template never changes existing boards.
export default function BoardTemplates() {
  const { settings, setSettings } = useAuth();
  const [list, setList] = useState(() => templatesOf(settings));
  const [openId, setOpenId] = useState(null); // the template being edited ('new:…' for a new one)
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const persist = async (next, message) => {
    setBusy(true); setError('');
    try {
      const clean = cleanTemplates(next);
      if (!clean.length) throw new Error('Keep at least one template.');
      await saveSettings({ boardTemplates: clean });
      setSettings({ ...settings, boardTemplates: clean });
      setList(clean);
      setNotice(message);
      return true;
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'Only administrators may change the board templates.' : e.message);
      return false;
    } finally { setBusy(false); }
  };

  const open = (t) => { setNotice(''); setError(''); setOpenId(t.id); setDraft({ ...t, groups: [...t.groups] }); };
  const close = () => { setOpenId(null); setDraft(null); setError(''); };
  const isNew = draft && !list.some((t) => t.id === draft.id);

  const saveDraft = async () => {
    const groups = draft.groups.map((g) => g.trim()).filter(Boolean);
    if (!draft.name.trim()) { setError('Name the template.'); return; }
    if (!groups.length) { setError('Add at least one group.'); return; }
    const t = { ...draft, groups };
    const next = isNew ? [...list, t] : list.map((x) => (x.id === t.id ? t : x));
    if (await persist(next, `Saved "${t.name.trim()}".`)) close();
  };
  const remove = async () => {
    if (!window.confirm(`Remove the template "${draft.name}"? Boards made from it are not changed.`)) return;
    if (await persist(list.filter((x) => x.id !== draft.id), `Removed "${draft.name}".`)) close();
  };
  const move = (i, d) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; persist(l, 'Order saved.'); };
  const restore = () => {
    if (!window.confirm('Replace all the templates with the starter ones? Existing boards are not changed.')) return;
    close(); persist(BOARD_TEMPLATES, 'The starter templates are back.');
  };

  const setGroup = (i, v) => setDraft({ ...draft, groups: draft.groups.map((g, j) => (j === i ? v : g)) });
  const moveGroup = (i, d) => { const g = [...draft.groups]; [g[i], g[i + d]] = [g[i + d], g[i]]; setDraft({ ...draft, groups: g }); };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Board Templates</h1></div>
        <div className="row gap">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={restore}>Starter templates</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => open({ id: newTemplateId(), name: '', description: '', groups: [''] })}>+ New template</button>
        </div>
      </div>
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className={`tpl-layout${draft ? ' editing' : ''}`}>
        <ul className="tpl-list card" aria-label="Templates">
          {list.map((t, i) => (
            <li key={t.id} className={openId === t.id ? 'on' : ''}>
              <button type="button" className="tpl-item" onClick={() => open(t)} aria-current={openId === t.id}>
                <b>{t.name}</b>
                <span className="xs muted">{t.groups.length} group{t.groups.length === 1 ? '' : 's'}</span>
              </button>
              <span className="tpl-order">
                <button type="button" className="btn-icon" aria-label={`Move ${t.name} up`} title="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="btn-icon" aria-label={`Move ${t.name} down`} title="Move down" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              </span>
            </li>
          ))}
          {isNew && <li className="on"><span className="tpl-item"><b>{draft.name || 'New template'}</b><span className="xs muted">not saved yet</span></span></li>}
        </ul>

        {draft ? (
          <section className="card tpl-editor" aria-label={isNew ? 'New template' : `Edit ${draft.name}`}>
            <button type="button" className="link small tpl-back" onClick={close}>← All templates</button>
            <h3>{isNew ? 'New template' : draft.name || 'Template'}</h3>
            {error && <div className="alert">{error}</div>}
            <label className="field"><span className="field-label">Name</span>
              <input value={draft.name} maxLength={80} autoFocus={isNew} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="field"><span className="field-label">Description</span>
              <textarea rows={2} value={draft.description} maxLength={400} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <span className="xs muted">Shown under the template when someone creates a board.</span></label>
            <div className="field"><span className="field-label">Groups</span>
              <ol className="tpl-groups">
                {draft.groups.map((g, i) => (
                  <li key={i}>
                    <span className="tpl-n">{i + 1}</span>
                    <input value={g} maxLength={60} aria-label={`Group ${i + 1}`} onChange={(e) => setGroup(i, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draft.groups.length < 30) setDraft({ ...draft, groups: [...draft.groups.slice(0, i + 1), '', ...draft.groups.slice(i + 1)] }); } }} />
                    <button type="button" className="btn-icon" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => moveGroup(i, -1)}>↑</button>
                    <button type="button" className="btn-icon" aria-label="Move down" title="Move down" disabled={i === draft.groups.length - 1} onClick={() => moveGroup(i, 1)}>↓</button>
                    <button type="button" className="btn-icon" aria-label="Remove the group" title="Remove" disabled={draft.groups.length === 1}
                      onClick={() => setDraft({ ...draft, groups: draft.groups.filter((_, j) => j !== i) })}>×</button>
                  </li>
                ))}
              </ol>
              {draft.groups.length < 30 && <button type="button" className="link small" onClick={() => setDraft({ ...draft, groups: [...draft.groups, ''] })}>+ Add a group</button>}
              <span className="xs muted">A new board starts with these groups, in this order; its managers can change them.</span>
            </div>
            <div className="row gap tpl-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={saveDraft}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
              {!isNew && <button type="button" className="btn btn-danger btn-sm tpl-remove" disabled={busy || list.length === 1} onClick={remove}>Remove template</button>}
            </div>
          </section>
        ) : (
          <section className="card tpl-empty">
            <p className="muted">Choose a template to change its name, description or groups.</p>
            <p className="xs muted">Changing or removing a template does not change boards already made from it.</p>
          </section>
        )}
      </div>
    </div>
  );
}
