import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getFileBytes, isUnread } from '../lib/api.js';
import {
  addCommunityMember, createCommunity, deleteCommunity, deleteCommunityMessage, managesCommunity, markCommunityRead,
  postToCommunity, removeCommunityMember, updateCommunity, watchCommunities, watchCommunityMessages,
} from '../lib/social.js';
import PersonPicker from '../components/PersonPicker.jsx';
import { Avatar } from '../components/Icon.jsx';

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

// Communities: groups any user creates (e.g. a committee), with members from any office. The
// creator, the head of their office and administrators add and remove members. Members talk and share files.
export default function Communities() {
  const { id: openId = '' } = useParams();
  const navigate = useNavigate();
  const { user, profile, isAdmin, isHead, actor } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const who = { uid: user.uid, office: profile.office, isHead, isAdmin };

  useEffect(() => watchCommunities(user.uid, setList, (e) => setError(e.code === 'permission-denied'
    ? 'Communities are not switched on yet: an administrator must publish the latest firestore.rules (Firebase console → Firestore → Rules).'
    : e.message)), [user.uid]);

  const open = (list || []).find((c) => c.id === openId);

  return (
    <div className="page messages-page">
      <div className="page-head">
        <div><h1>Communities</h1></div>
      </div>
      {error && <div className="alert">{error}</div>}
      {creating && <NewCommunity me={actor} onCancel={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); navigate(`/communities/${id}`); }} />}
      <div className="chat-layout card">
        <aside className={`chat-list${open ? ' has-open' : ''}`}>
          {!creating && (
            <div className="chat-list-head">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New community</button>
            </div>
          )}
          {list === null && !error && <div className="spinner" />}
          {list?.length === 0 && <p className="small muted chat-empty">No communities yet. Create one, or someone adds you to theirs.</p>}
          <ul>
            {(list || []).map((c) => (
              <li key={c.id}>
                <button type="button" className={`${c.id === openId ? 'active' : ''}${isUnread(c, user.uid) ? ' unread' : ''}`}
                  onClick={() => navigate(`/communities/${c.id}`)}>
                  <Avatar name={c.name} size="sm" />
                  <span className="chat-list-t">
                    <span className="chat-list-top"><b>{c.name}</b><span className="xs muted">{when(c.lastAt)}</span></span>
                    <span className="small muted chat-preview">{c.lastText ? `${c.lastBy === user.uid ? 'You' : (c.names?.[c.lastBy] || '').split(' ')[0]}: ${c.lastText}` : [`${c.members.length} members`, c.office].filter(Boolean).join(' · ')}</span>
                  </span>
                  {isUnread(c, user.uid) && <span className="chat-dot" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="chat-main">
          {open
            ? <Room key={open.id} c={open} me={actor} manages={managesCommunity(open, who)} onBack={() => navigate('/communities')}
              onGone={() => navigate('/communities', { replace: true })} />
            : <div className="chat-none muted">{openId && list ? 'This community is not available: you may have been removed from it.' : 'Choose a community.'}</div>}
        </section>
      </div>
    </div>
  );
}

function NewCommunity({ me, onCancel, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { onCreated(await createCommunity({ name, description, members }, me)); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3>New community</h3>
      <div className="fields">
        <div className="field field-wide"><label className="field-label" htmlFor="cm-name">Name <span className="req">*</span></label>
          <input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
        <div className="field field-wide"><label className="field-label" htmlFor="cm-desc">What it is for (optional)</label>
          <textarea id="cm-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></div>
        <div className="field field-wide"><span className="field-label">Members</span>
          <PersonPicker value={null} onChange={(p) => p && !members.some((m) => m.uid === p.uid) && setMembers([...members, p])}
            exclude={[me.uid, ...members.map((m) => m.uid)]} />
          <div className="member-chips">
            {members.map((m) => (
              <span key={m.uid} className="member-chip">{m.displayName || m.email}{m.office ? <span className="muted"> · {m.office}</span> : null}
                <button type="button" aria-label={`Remove ${m.displayName}`} onClick={() => setMembers(members.filter((x) => x.uid !== m.uid))}>×</button></span>
            ))}
          </div>
          <div className="help">People from any office. {me.office ? `${me.office} administers it` : 'You administer it'}; you can add or remove members later.</div>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create community'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// A file shared in the community: opened from Storage on demand.
function SharedFile({ file }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const bytes = await getFileBytes(file.path);
      const url = URL.createObjectURL(new Blob([bytes], { type: file.type || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.target = '_blank'; a.rel = 'noreferrer';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { window.alert(e.message); } finally { setBusy(false); }
  };
  return <button type="button" className="chat-file" disabled={busy} onClick={open}>📎 {file.name}{busy ? ' …' : ''}</button>;
}

function Room({ c, me, manages, onBack, onGone }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [managing, setManaging] = useState(false);
  const fileRef = useRef(null);
  const end = useRef(null);

  // Only members read the messages (those who manage it but are not in it change its name and members).
  const member = c.members.includes(me.uid);
  useEffect(() => (member ? watchCommunityMessages(c.id, setMessages, (e) => setError(e.message)) : undefined), [c.id, member]);
  useEffect(() => { if (member && isUnread(c, me.uid)) markCommunityRead(c.id, me.uid).catch(() => {}); }, [c.lastAt]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  const days = useMemo(() => {
    const out = [];
    for (const m of messages || []) {
      const day = new Date(m.at).toLocaleDateString('en-PH', { dateStyle: 'medium' });
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1).items.push(m);
    }
    return out;
  }, [messages]);

  const send = async (e) => {
    e?.preventDefault();
    if (busy) return; // Enter pressed again while sending
    if (!text.trim() && !file) return;
    setBusy(true); setError('');
    try { await postToCommunity(c, me, { text, file }); setText(''); setFile(null); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="chat-head">
        <button type="button" className="btn-icon chat-back" title="Back" onClick={onBack}>←</button>
        <Avatar name={c.name} size="sm" />
        <div className="chat-head-t"><b>{c.name}</b><div className="xs muted">{c.members.length} members · {c.office || 'administrators'}</div></div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setManaging(!managing)}>{managing ? 'Close' : manages ? 'Manage' : 'Members'}</button>
      </div>
      {!managing && !member && (
        <p className="small muted chat-empty">Only the members of a community read its messages and files. You can manage its name and members (Manage).</p>
      )}
      {managing ? <Manage c={c} me={me} manages={manages} onGone={onGone} /> : member && (
        <>
          <div className="chat-body">
            {c.description && <p className="small muted chat-empty">{c.description}</p>}
            {messages === null && <div className="spinner" />}
            {messages?.length === 0 && <p className="small muted chat-empty">No messages yet.</p>}
            {days.map((g) => (
              <div key={g.day}>
                <div className="chat-day xs muted">{g.day}</div>
                {g.items.map((m, i) => {
                  const run = (a, b) => a && b && a.from === b.from && Math.abs(new Date(b.at) - new Date(a.at)) < 5 * 60e3;
                  const first = !run(g.items[i - 1], m);
                  const last = !run(m, g.items[i + 1]);
                  const mine = m.from === me.uid;
                  return (
                    <div key={m.id} className={`chat-msg ${mine ? 'mine' : 'theirs'}${first ? ' first' : ''}${last ? ' last' : ''}`}>
                      {first && !mine && <div className="xs muted chat-from">{m.fromName}</div>}
                      <div className="chat-bubble">
                        {m.text}
                        {m.file && <SharedFile file={m.file} />}
                      </div>
                      {last && (
                        <div className="xs muted chat-time">{new Date(m.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                          {(mine || manages) && <>{' '}<button type="button" className="link xs" onClick={() => window.confirm('Delete this message?') && deleteCommunityMessage(c.id, m.id).catch((e) => setError(e.message))}>· Delete</button></>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={end} />
          </div>
          {error && <div className="alert small">{error}</div>}
          {file && <div className="chat-attach small">📎 {file.name} <button type="button" className="link small" onClick={() => setFile(null)}>Remove</button></div>}
          <form className="chat-send" onSubmit={send}>
            <button type="button" className="btn-icon" title="Attach a file" aria-label="Attach a file" onClick={() => fileRef.current.click()}>📎</button>
            <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.zip" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Message" placeholder="Write a message…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="btn btn-primary btn-sm" disabled={busy || (!text.trim() && !file)}>{busy ? '…' : 'Send'}</button>
          </form>
        </>
      )}
    </>
  );
}

function Manage({ c, me, manages, onGone }) {
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const people = c.members.map((uid) => ({ uid, name: c.names?.[uid] || 'User' })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="chat-body community-manage">
      {manages && (
        <div className="fields">
          <div className="field field-wide"><label className="field-label" htmlFor="cm-n">Name</label>
            <input id="cm-n" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
          <div className="field field-wide"><label className="field-label" htmlFor="cm-d">What it is for</label>
            <textarea id="cm-d" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></div>
          <div className="row gap">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim() || (name === c.name && description === (c.description || ''))}
              onClick={() => run(() => updateCommunity(c.id, { name: name.trim(), description: description.trim() }))}>Save</button>
          </div>
        </div>
      )}
      <h4>Members ({people.length})</h4>
      {manages && <PersonPicker value={null} onChange={(p) => p && run(() => addCommunityMember(c, p, me))} exclude={c.members} placeholder="Add a member: type a name or email…" />}
      <ul className="receipts">
        {people.map((p) => (
          <li key={p.uid}>
            <span>{p.name}{p.uid === c.createdBy && <span className="muted small"> · created it</span>}</span>
            {manages && p.uid !== me.uid && <button type="button" className="link small" disabled={busy} onClick={() => run(() => removeCommunityMember(c, p.uid))}>Remove</button>}
          </li>
        ))}
      </ul>
      {error && <div className="alert small">{error}</div>}
      <div className="row gap" style={{ marginTop: '1rem' }}>
        {!manages && <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
          onClick={() => window.confirm(`Leave ${c.name}?`) && run(async () => { await removeCommunityMember(c, me.uid); onGone(); })}>Leave the community</button>}
        {manages && <button type="button" className="btn btn-danger btn-sm" disabled={busy}
          onClick={() => window.confirm(`Delete ${c.name} for everyone? Its messages are no longer shown.`) && run(async () => { await deleteCommunity(c.id); onGone(); })}>Delete the community</button>}
      </div>
    </div>
  );
}
