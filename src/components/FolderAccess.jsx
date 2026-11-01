import { useEffect, useState } from 'react';
import { EVERY_OFFICE, getFolderRules, listDirectory, listDocumentTypes, listFolderAccess, setFolderAccess, setRestrictedFolders } from '../lib/api.js';
import Select from './Select.jsx';
import PersonPicker from './PersonPicker.jsx';

// Folders → Access (office head): gives people of the office access to the office's documents
// of chosen folders (document types), or all of them: as viewer (opens them) or editor (does what
// their preparer does). The preparer always has their own. Restricted folders: no one gets at them
// through folder access. Administrators and the Records Officer do this for any office, and give
// anyone access to folders of every office (office '*': EVERY_OFFICE).
export default function FolderAccess({ office, me, actor, codes = [] }) {
  const every = office === EVERY_OFFICE;
  const [people, setPeople] = useState(null);
  const [grants, setGrants] = useState({});
  // People with access to folders of every office (set by an administrator, not here).
  const [everyGrants, setEveryGrants] = useState({});
  const [types, setTypes] = useState([]);
  const [restricted, setRestricted] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setPeople(null);
    Promise.all([listDirectory(), listFolderAccess(office), listDocumentTypes().catch(() => []), every ? { restricted: [] } : getFolderRules(office),
      every ? [] : listFolderAccess(EVERY_OFFICE).catch(() => [])])
      .then(([dir, list, t, rules, everyList]) => {
        setRestricted(rules.restricted);
        const granted = new Set(list.map((g) => g.uid));
        setPeople(dir.filter((p) => !p.external && p.uid !== me && (every ? granted.has(p.uid) : p.office === office)));
        setGrants(Object.fromEntries(list.map((g) => [g.uid, g])));
        setEveryGrants(Object.fromEntries(everyList.map((g) => [g.uid, g])));
        setTypes(t);
      })
      .catch((e) => setError(e.message));
  }, [office, me]);

  const nameOf = (code) => types.find((t) => t.code === code)?.name || code;
  const allCodes = [...new Set([...types.map((t) => t.code), ...codes])].filter(Boolean).sort();

  const save = async (p, next) => {
    setBusy(p.uid); setError('');
    try {
      await setFolderAccess(p, { ...next, everyOffice: every }, actor);
      setGrants((g) => {
        const { [p.uid]: _old, ...rest } = g;
        return next.all || next.types.length ? { ...rest, [p.uid]: { uid: p.uid, office, ...next } } : rest;
      });
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  const restrict = async (next) => {
    setBusy('restricted'); setError('');
    try { await setRestrictedFolders(office, next, actor); setRestricted(next); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };

  return (
    <section className="card folder-access">
      <h3>{every ? 'Access to the folders of all offices' : `Access to the folders of ${office}`}</h3>
      {every ? (
        <p className="small muted">Give anyone, of any office, access to chosen folders (document types) of every office, also documents with no office.
          A viewer opens those documents; an editor also does what the preparer does (edits drafts, converts to PDF, routes, cancels).
          This replaces the access their office head gave them. Restricted documents stay out.</p>
      ) : (
        <p className="small muted">A viewer opens every document of {office} in their folders: those prepared in the office and those routed to it (the folders shown above). An editor also does what the preparer does (edits drafts, converts to PDF, routes, cancels) on the office's own documents. To give access to one document only, open it and use Access.</p>
      )}
      {error && <div className="alert">{error}</div>}
      {every && people && (
        <div className="access-add">
          <PersonPicker value={null} exclude={[me, ...people.map((p) => p.uid)]} placeholder="Add a person: type a name or email…"
            onChange={(p) => p && setPeople((list) => [...list, p])} />
        </div>
      )}
      {!every && <div className="restricted-folders">
        <span className="small"><b>Restricted folders</b> <span className="muted">No one opens their documents through folder access.</span></span>
        <span className="access-chips">
          {restricted.length === 0 && <span className="small muted">None</span>}
          {restricted.map((c) => (
            <span key={c} className="chip" title={nameOf(c)}>{c} <button type="button" title="Lift the restriction" disabled={busy === 'restricted'}
              onClick={() => restrict(restricted.filter((x) => x !== c))}>×</button></span>
          ))}
        </span>
<span className="restrict-pick">
        <Select value="" aria-label="Restrict a folder" disabled={busy === 'restricted'}
            onChange={(e) => e.target.value && restrict([...restricted, e.target.value])}>
            <option value="">Restrict a folder…</option>
            {allCodes.filter((c) => !restricted.includes(c)).map((c) => <option key={c} value={c}>{c} — {nameOf(c)}</option>)}
          </Select>
        </span>
      </div>}
      {!people ? <div className="spinner" /> : people.length === 0 ? <p className="muted small">{every ? 'No one has access to the folders of all offices yet.' : `No one else in ${office}.`}</p> : (
        <table className="data-table">
          <thead><tr><th>Person</th><th>Folders</th><th>Give access to</th><th>As</th></tr></thead>
          <tbody>
            {people.map((p) => {
              const g = grants[p.uid];
              const e = everyGrants[p.uid];
              if (e) {
                return (
                  <tr key={p.uid}>
                    <td><b>{p.displayName}</b><div className="xs muted">{p.email}</div></td>
                    <td colSpan={3}><span className="small">{e.all ? 'All folders' : (e.types || []).join(', ')} of <b>all offices</b>, as {e.edit ? 'editor' : 'viewer'}</span>
                      <div className="xs muted">Given by an administrator: change it under Folders → All offices → Access.</div></td>
                  </tr>
                );
              }
              const given = g?.all ? [] : g?.types || [];
              const edit = Boolean(g?.edit);
              return (
                <tr key={p.uid}>
                  <td><b>{p.displayName}</b><div className="xs muted">{every ? [p.email, p.office].filter(Boolean).join(' · ') : p.email}</div></td>
                  <td>
                    {!g && <span className="small muted">Own documents only</span>}
                    <span className="access-chips">
                      {g?.all && <span className="chip">All folders <button type="button" title="Remove" disabled={busy === p.uid} onClick={() => save(p, { all: false, types: [], edit })}>×</button></span>}
                      {given.map((c) => (
                        <span key={c} className={`chip${restricted.includes(c) ? ' chip-off' : ''}`} title={restricted.includes(c) ? `${nameOf(c)}: restricted` : nameOf(c)}>{c} <button type="button" title="Remove" disabled={busy === p.uid}
                          onClick={() => save(p, { all: false, types: given.filter((x) => x !== c), edit })}>×</button></span>
                      ))}
                    </span>
                  </td>
                  <td>
                    {!g?.all && (
                      <Select value="" aria-label={`Give ${p.displayName} access to`} disabled={busy === p.uid}
                        onChange={(e) => e.target.value && save(p, e.target.value === '*' ? { all: true, types: [], edit } : { all: false, types: [...given, e.target.value], edit })}>
                        <option value="">Choose a folder…</option>
                        <option value="*">All folders</option>
                        {allCodes.filter((c) => !given.includes(c)).map((c) => <option key={c} value={c}>{c} — {nameOf(c)}</option>)}
                      </Select>
                    )}
                  </td>
                  <td>
                    {g && (
                      <Select value={edit ? 'editor' : 'viewer'} aria-label={`${p.displayName}'s access`} disabled={busy === p.uid}
                        onChange={(e) => save(p, { all: g.all, types: given, edit: e.target.value === 'editor' })}>
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                      </Select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
