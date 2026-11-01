import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { addPosition, deleteInvite, inviteKey, listInvites, listUsers, saveInvite, setFolderAccess, syncDirectory, updateUser } from '../../lib/api.js';
import { positionsOf } from '../../lib/defaults.js';
import Select from '../../components/Select.jsx';
import PositionsPicker from '../../components/PositionsPicker.jsx';
import { Avatar } from '../../components/Icon.jsx';
import { ROLE_NAMES } from '../../lib/roles.js';


// One person: name, office and what they may do at a glance; Edit opens their settings below.
function UserRow({ u, me, isSuper, givesStaff, settings, offices, canManage, onChange, onNewPosition }) {
  const [open, setOpen] = useState(false);
  const editable = canManage || (isSuper && u.id === me.uid);
  const tags = [u.head && 'Office head', ...(u.positions || []), u.canRefer && 'Routes to any person'].filter(Boolean);
  return (
    <li className={`user-row${open ? ' open' : ''}`}>
      <div className="user-main">
        <Avatar name={u.displayName || u.email} photo={u.photo} size="sm" />
        <div className="user-who">
          <span className="user-name"><b>{u.displayName || u.email}</b>{u.id === me.uid && <span className="muted"> (you)</span>}</span>
          <span className="small muted">{u.email}</span>
          {(u.position || u.idNo) && <span className="xs muted">{[u.position, u.idNo && `ID No. ${u.idNo}`].filter(Boolean).join(' · ')}</span>}
        </div>
        <div className="user-office">
          <span className="small">{u.office || (u.role === 'payee' ? 'Not LGU personnel' : 'No office')}</span>
          {u.requestedOffice && u.requestedOffice !== u.office && <span className="xs muted">Asked for: {u.requestedOffice}</span>}
          {tags.length > 0 && <span className="user-tags">{tags.map((t) => <span key={t} className="chip">{t}</span>)}</span>}
        </div>
        <div className="user-side">
          <span className="small muted user-role">{ROLE_NAMES[u.role] || u.role}</span>
          <span className={`badge ${u.active ? 'badge-green' : u.deactivated ? 'badge-gray' : 'badge-yellow'}`}>{u.active ? 'Active' : u.deactivated ? 'Deactivated' : 'Pending'}</span>
          {canManage && !u.active && <button className="btn btn-primary btn-sm" onClick={() => onChange({ active: true })}>Approve</button>}
          {editable && <button className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button>}
        </div>
      </div>
      {open && (
        <div className="user-edit">
          <label className="field"><span className="field-label">Office</span>
            <Select value={u.office || ''} disabled={u.role === 'payee'} onChange={(e) => onChange({ office: e.target.value, ...(e.target.value ? {} : { head: false }) })}>
              <option value="">— No office —</option>
              {[...new Set([...offices, ...(u.office ? [u.office] : [])])].map((o) => <option key={o}>{o}</option>)}
            </Select>
          </label>
          <label className="field"><span className="field-label">Role</span>
            {canManage ? (
              // Third Party: not LGU personnel; only signs the documents referred to them.
              <Select value={u.role} onChange={(e) => onChange({ role: e.target.value, ...(e.target.value === 'payee' ? { office: '', head: false, positions: [], canRefer: false } : {}) })}>
                <option value="user">User</option>
                <option value="payee">Third Party</option>
                {isSuper && <option value="admin">Admin</option>}
                {givesStaff && <option value="itadmin">IT Admin</option>}
                {givesStaff && <option value="records">Records Officer</option>}
                {isSuper && <option value="superadmin">Superadmin</option>}
              </Select>
            ) : <span className="small">{ROLE_NAMES[u.role] || u.role}</span>}
          </label>
          {u.office && (
            <div className="field field-wide"><span className="field-label">Position</span>
              <PositionsPicker value={u.positions || []} choices={positionsOf(settings)} onNew={onNewPosition} onChange={(positions) => onChange({ positions })} />
            </div>
          )}
          <div className="field field-wide user-checks">
            {u.office && (
              <label className="check small">
                <input type="checkbox" checked={Boolean(u.head)} onChange={(e) => onChange({ head: e.target.checked })} />
                Office head <span className="muted">(sees all documents of the office)</span>
              </label>
            )}
            {u.role === 'user' && canManage && (
              <label className="check small">
                <input type="checkbox" checked={Boolean(u.canRefer)} onChange={(e) => onChange({ canRefer: e.target.checked })} />
                May route documents to any person
              </label>
            )}
          </div>
          {canManage && u.active && (
            <div className="field-wide user-danger">
              <button className="btn btn-ghost btn-sm" onClick={() => window.confirm(`Deactivate ${u.displayName || u.email}? They can no longer sign in to DMS.`) && onChange({ active: false })}>Deactivate</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// + Add user: a person added by email before they sign up; their first sign-in with that email
// (Google, or email and password once verified) gives them this office, role and positions.
function InviteForm({ initial, isSuper, givesStaff, settings, offices, onNewPosition, onSave, onCancel }) {
  const [f, setF] = useState({ email: '', displayName: '', role: 'user', office: '', positions: [], head: false, canRefer: false, ...initial });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const payee = f.role === 'payee';
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await onSave(f); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <form className="card invite-form" onSubmit={submit}>
      <h3>{initial?.email ? 'Edit added user' : 'Add a user'}</h3>
      <p className="small muted">When this person first signs in with this email (Continue with Google, or an account with email and password once
        they open the verification link), they get the office, role and positions below, without waiting for approval.</p>
      <div className="user-edit invite-fields">
        <label className="field"><span className="field-label">Email *</span>
          <input type="email" required value={f.email} disabled={Boolean(initial?.email)} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="field"><span className="field-label">Name</span>
          <input value={f.displayName} onChange={(e) => set({ displayName: e.target.value })} /></label>
        <label className="field"><span className="field-label">Role</span>
          <Select value={f.role} onChange={(e) => set({ role: e.target.value, ...(e.target.value === 'payee' ? { office: '', positions: [], head: false, canRefer: false } : {}) })}>
            <option value="user">User</option>
            <option value="payee">Third Party</option>
            {isSuper && <option value="admin">Admin</option>}
            {givesStaff && <option value="itadmin">IT Admin</option>}
            {givesStaff && <option value="records">Records Officer</option>}
          </Select></label>
        <label className="field"><span className="field-label">Office</span>
          <Select value={f.office} disabled={payee} onChange={(e) => set({ office: e.target.value, ...(e.target.value ? {} : { head: false }) })}>
            <option value="">— No office —</option>
            {offices.map((o) => <option key={o}>{o}</option>)}
          </Select></label>
        {!payee && f.office && (
          <div className="field field-wide"><span className="field-label">Position</span>
            <PositionsPicker value={f.positions} choices={positionsOf(settings)} onNew={onNewPosition} onChange={(positions) => set({ positions })} /></div>
        )}
        {!payee && (
          <div className="field field-wide user-checks">
            {f.office && <label className="check small"><input type="checkbox" checked={f.head} onChange={(e) => set({ head: e.target.checked })} /> Office head <span className="muted">(sees all documents of the office)</span></label>}
            <label className="check small"><input type="checkbox" checked={f.canRefer} onChange={(e) => set({ canRefer: e.target.checked })} /> May route documents to any person</label>
          </div>
        )}
      </div>
      {error && <div className="alert small">{error}</div>}
      <div className="row gap">
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function Users() {
  const { user: me, isSuper, profile: myProfile, settings, setSettings, canManageSettings, refreshProfile } = useAuth();
  // The superadmin and an Admin give the IT Admin and Records Officer roles (lib/roles.js).
  const givesStaff = isSuper || myProfile?.role === 'admin';
  const newPosition = async (name) => {
    const positions = await addPosition(settings, name);
    setSettings((s) => ({ ...s, positions }));
  };
  const offices = settings.offices || [];
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [invites, setInvites] = useState([]);
  const [inviting, setInviting] = useState(null); // null, {} (new) or an invite (edit)
  const loadInvites = () => listInvites().then(setInvites).catch(() => setInvites([]));
  useEffect(() => { loadInvites(); }, []);

  // The directory (finding people by name, e.g. in Messages) follows approvals and office changes.
  const load = () => listUsers().then((u) => { syncDirectory(u).catch(() => {}); return u; }).then((u) => setUsers(u.sort((a, b) => Number(a.active) - Number(b.active) || (a.displayName || '').localeCompare(b.displayName || '')))).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const change = async (u, patch) => {
    setError('');
    try {
      // Deactivated (not the same as never approved, for "Pending approval"); approved again.
      const full = { ...patch, ...(patch.active === false ? { deactivated: true } : patch.active === true ? { deactivated: false } : {}) };
      await updateUser(u.id, full);
      // Deactivated: an invitation left for that email would let them back in.
      if (patch.active === false && u.email) { await deleteInvite(u.email).catch(() => {}); loadInvites(); }
      // Deactivated, made a third party or moved to another office: the folder access they had
      // (given for their old office) goes.
      if (u.folderGrant && (patch.active === false || patch.role === 'payee' || ('office' in patch && patch.office !== (u.office || '')))) {
        await setFolderAccess({ uid: u.id, office: u.office || '' }, { all: false, types: [] }, me).catch(() => {});
      }
      // Their own row (the superadmin): the app follows at once.
      if (u.id === me.uid) await refreshProfile().catch(() => {});
      await load();
    } catch (e) { setError(e.message); }
  };

  const canManage = (u) => u.id !== me.uid && (isSuper || u.role === 'user' || u.role === 'payee' || (givesStaff && ['itadmin', 'records'].includes(u.role)));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (users || [])
    .filter((u) => filter === 'all' || (filter === 'pending' ? !u.active && !u.deactivated : u.active))
    .filter((u) => words.every((w) => `${u.displayName} ${u.email} ${u.office || ''} ${(u.positions || []).join(' ')} ${ROLE_NAMES[u.role] || u.role}`.toLowerCase().includes(w)));
  const pending = (users || []).filter((u) => !u.active && !u.deactivated).length;
  // Added, not signed up yet: no account with that email.
  const emails = new Set((users || []).map((u) => inviteKey(u.email)));
  const waiting = invites.filter((i) => !emails.has(i.email))
    .filter((i) => words.every((w) => `${i.displayName} ${i.email} ${i.office} ${(i.positions || []).join(' ')}`.toLowerCase().includes(w)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
        </div>
        {!inviting && <button type="button" className="btn btn-primary btn-sm" onClick={() => setInviting({})}>+ Add user</button>}
      </div>
      {inviting && (
        <InviteForm initial={inviting} isSuper={isSuper} givesStaff={givesStaff} settings={settings} offices={offices} onNewPosition={canManageSettings ? newPosition : undefined}
          onCancel={() => setInviting(null)}
          onSave={async (f) => { await saveInvite(f, me); setInviting(null); await loadInvites(); }} />
      )}
      <div className="filters">
        <input className="search" placeholder="Search name, email, office or position…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
          <option value="all">All users</option>
          <option value="pending">Pending approval{pending ? ` (${pending})` : ''}</option>
          <option value="active">Active</option>
        </Select>
      </div>
      {error && <div className="alert">{error}</div>}
      {waiting.length > 0 && filter !== 'active' && (
        <>
          <h3 className="users-sub">Added, not signed up yet</h3>
          <ul className="card user-list">
            {waiting.map((i) => (
              <li key={i.email} className="user-row">
                <div className="user-main">
                  <Avatar name={i.displayName || i.email} size="sm" />
                  <div className="user-who"><span className="user-name"><b>{i.displayName || i.email}</b></span><span className="small muted">{i.email}</span></div>
                  <div className="user-office">
                    <span className="small">{i.office || (i.role === 'payee' ? 'Not LGU personnel' : 'No office')}</span>
                    {(i.head || (i.positions || []).length > 0 || i.canRefer) && (
                      <span className="user-tags">{[i.head && 'Office head', ...(i.positions || []), i.canRefer && 'Routes to any person'].filter(Boolean).map((t) => <span key={t} className="chip">{t}</span>)}</span>
                    )}
                  </div>
                  <div className="user-side">
                    <span className="small muted user-role">{ROLE_NAMES[i.role] || i.role}</span>
                    <span className="badge badge-gray">Added</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setInviting(i)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => window.confirm(`Remove ${i.email}? They can still sign up, and wait for approval.`) && deleteInvite(i.email).then(loadInvites).catch((e) => setError(e.message))}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <h3 className="users-sub">Users</h3>
        </>
      )}
      {!users && !error && <div className="spinner" />}
      {users && (shown.length === 0 ? <p className="muted">No user matches.</p> : (
        <ul className="card user-list">
          {shown.map((u) => (
            <UserRow key={u.id} u={u} me={me} isSuper={isSuper} givesStaff={givesStaff} settings={settings} offices={offices} canManage={canManage(u)}
              onChange={(patch) => change(u, patch)} onNewPosition={canManageSettings ? newPosition : undefined} />
          ))}
        </ul>
      ))}
    </div>
  );
}
