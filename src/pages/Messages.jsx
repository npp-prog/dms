import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { conversationId, isUnread, listDirectory, markConversationRead, sendMessage, setOnlineMode, watchConversations, watchMessages, watchPresence } from '../lib/api.js';
import { isOnline } from '../lib/presence.js';
import PersonPicker from '../components/PersonPicker.jsx';
import { Avatar } from '../components/Icon.jsx';
import { Link } from 'react-router-dom';
import { LinkEditor } from '../components/DocLinks.jsx';

// Text with its links clickable: a link to a DMS page (this site) opens in DMS; other web links
// in a new tab.
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
function Linked({ text }) {
  return String(text || '').split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    let url;
    try { url = new URL(part); } catch { return part; }
    const inDms = url.origin === window.location.origin || /(^|\.)dms\.mgocandoni\.com$/.test(url.hostname);
    // (always a path on this site: "//other.site" or a backslash would lead elsewhere)
    const path = `/${url.pathname.replace(/\\/g, '/').replace(/^\/+/, '')}${url.search}${url.hash}`;
    return inDms
      ? <Link key={i} to={path}>{part}</Link>
      : <a key={i} href={url.href} target="_blank" rel="noopener noreferrer">{part}</a>;
  });
}

// A DMS document sent in a message: it opens in DMS (only for those who may see it).
function DocCard({ d }) {
  return (
    <Link className="chat-doc" to={`/documents/${d.id}`}>
      <span className="chat-doc-ic">📄</span>
      <span className="chat-doc-t"><b>{d.typeCode} {d.controlNo}</b>{d.title && <span className="xs">{d.title}</span>}</span>
    </Link>
  );
}

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

// Messages between users: the conversations on the left, the open one on the right. Live: new
// messages appear as they are sent. Only the two people in a conversation can read it.
export default function Messages() {
  const { user, profile } = useAuth();
  const me = { uid: user.uid, displayName: profile.displayName, email: profile.email };
  const [convos, setConvos] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState('');
  const [newTo, setNewTo] = useState(null); // a person picked for a new conversation
  const [starting, setStarting] = useState(false);

  useEffect(() => watchConversations(user.uid, setConvos, (e) => setError(e.code === 'permission-denied'
    ? 'Messages are not switched on yet: an administrator must publish the latest firestore.rules (Firebase console → Firestore → Rules).'
    : e.message)), [user.uid]);

  // Their profile picture and position (directory of active users).
  const [people, setPeople] = useState({});
  // Who is online (lib/presence.js); re-checked every 30 seconds. The user may turn theirs off.
  const [presence, setPresence] = useState({});
  const [, setTick] = useState(0);
  // (only the people on screen: the conversation partners, the new one, and the user)
  const watched = [user.uid, ...(convos || []).slice(0, 100).map((c) => c.members.find((m) => m !== user.uid)), newTo?.uid].filter(Boolean);
  const watchedKey = [...new Set(watched)].sort().join(',');
  useEffect(() => watchPresence(watchedKey.split(','), setPresence, () => {}), [watchedKey]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30e3); return () => clearInterval(t); }, []);
  const online = (uid) => isOnline(presence[uid]);
  const meVisible = !presence[user.uid]?.hidden;
  const [modeBusy, setModeBusy] = useState(false);
  const toggleMode = () => { setModeBusy(true); setOnlineMode(user.uid, !meVisible).catch((e) => setError(e.message)).finally(() => setModeBusy(false)); };
  useEffect(() => { listDirectory().then((l) => setPeople(Object.fromEntries(l.map((p) => [p.uid, p])))).catch(() => {}); }, []);

  const other = (c) => {
    const uid = c.members.find((m) => m !== user.uid);
    return { uid, displayName: c.names?.[uid] || 'User', photo: people[uid]?.photo || '', position: people[uid]?.position || '', online: online(uid) };
  };
  const open = (convos || []).find((c) => c.id === openId);
  const partner = newTo || (open ? other(open) : null);
  const pick = (p) => {
    if (!p) return;
    const id = conversationId(user.uid, p.uid);
    setStarting(false);
    if ((convos || []).some((c) => c.id === id)) { setOpenId(id); setNewTo(null); } else { setOpenId(id); setNewTo(p); }
  };

  return (
    <div className="page messages-page">
      <div className="page-head">
        <div><h1>Messages</h1></div>
        <button type="button" className={`online-toggle${meVisible ? ' on' : ''}`} disabled={modeBusy} onClick={toggleMode} aria-pressed={meVisible}
          title={meVisible ? 'Others see when you are online. Click to turn it off.' : 'Others do not see when you are online. Click to turn it on.'}>
          <span className="online-switch" aria-hidden="true"><span /></span>{meVisible ? 'Online' : 'Online status off'}
        </button>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="chat-layout card">
        <aside className={`chat-list${partner ? ' has-open' : ''}`}>
          <div className="chat-list-head">
            {starting
              ? <PersonPicker value={null} onChange={pick} exclude={[user.uid]} external placeholder="Type a name or email…" />
              : <button type="button" className="btn btn-primary btn-sm" onClick={() => setStarting(true)}>+ New message</button>}
          </div>
          {convos === null && !error && <div className="spinner" />}
          {convos?.length === 0 && <p className="small muted chat-empty">No messages yet.</p>}
          <ul>
            {(convos || []).map((c) => {
              const o = other(c);
              return (
                <li key={c.id}>
                  <button type="button" className={`${c.id === openId ? 'active' : ''}${isUnread(c, user.uid) ? ' unread' : ''}`}
                    onClick={() => { setOpenId(c.id); setNewTo(null); setStarting(false); }}>
                    <span className="av-wrap"><Avatar name={o.displayName} photo={o.photo} size="sm" />{o.online && <span className="online-dot" title="Online" />}</span>
                    <span className="chat-list-t">
                      <span className="chat-list-top"><b>{o.displayName}</b><span className="xs muted">{when(c.lastAt)}</span></span>
                      <span className="small muted chat-preview">{c.lastBy === user.uid ? 'You: ' : ''}{c.lastText}</span>
                    </span>
                    {isUnread(c, user.uid) && <span className="chat-dot" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="chat-main">
          {partner
            ? <Conversation key={conversationId(user.uid, partner.uid)} me={me} partner={{ ...partner, online: online(partner.uid) }} convo={open}
              onBack={() => { setOpenId(''); setNewTo(null); }} onSent={() => setNewTo(null)} />
            : <div className="chat-none muted">Choose a conversation, or start a new message.</div>}
        </section>
      </div>
    </div>
  );
}

function Conversation({ me, partner, convo, onBack, onSent }) {
  const id = conversationId(me.uid, partner.uid);
  const [messages, setMessages] = useState(convo ? null : []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // the message being answered
  const [attach, setAttach] = useState(null); // a DMS document to send
  const [picking, setPicking] = useState(false);
  const input = useRef(null);
  const nameOf = (uid) => (uid === me.uid ? 'You' : partner.displayName);
  const quoteOf = (m) => (m.text || (m.doc ? `${m.doc.typeCode} ${m.doc.controlNo}` : '')).slice(0, 200);
  const jump = (mid) => {
    const el = document.getElementById(`msg-${mid}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200);
  };
  const [error, setError] = useState('');
  const end = useRef(null);

  // Listen once the conversation is on the server (a new one is created with its first message);
  // after that keep listening, even while a later change of it is being saved.
  const [ready, setReady] = useState(false);
  useEffect(() => { if (convo?.saved) setReady(true); }, [convo?.saved]);
  useEffect(() => (ready ? watchMessages(id, setMessages, (e) => setError(e.message)) : undefined), [id, ready]);
  // Seen: mark it read when it is open and something new came in.
  useEffect(() => { if (convo && isUnread(convo, me.uid)) markConversationRead(id, me.uid).catch(() => {}); }, [convo?.lastAt]);
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
    if (!text.trim() && !attach) return;
    setBusy(true); setError('');
    // Sent: the conversation is on the server, so its messages can be listened to (a new one too).
    try {
      await sendMessage(me, partner, text, { doc: attach, replyTo: replyTo && { id: replyTo.id, from: replyTo.from, name: nameOf(replyTo.from) === 'You' ? me.displayName || me.email : partner.displayName, text: quoteOf(replyTo) } });
      setText(''); setAttach(null); setReplyTo(null); setReady(true); onSent();
    } catch (err) { setError(err.code === 'permission-denied' ? 'Sending documents and replies needs the latest firestore.rules published (Firebase console → Firestore → Rules).' : err.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="chat-head">
        <button type="button" className="btn-icon chat-back" title="Back" onClick={onBack}>←</button>
        <span className="av-wrap"><Avatar name={partner.displayName} photo={partner.photo} size="sm" />{partner.online && <span className="online-dot" />}</span>
        <span className="chat-who"><b>{partner.displayName}</b>
          <span className="xs muted">{partner.online ? <span className="online-text">Online</span> : null}{partner.online && partner.position ? ' · ' : ''}{partner.position}</span></span>
      </div>
      <div className="chat-body">
        {messages === null && <div className="spinner" />}
        {messages?.length === 0 && <p className="small muted chat-empty">No messages yet. Say hello.</p>}
        {days.map((g) => (
          <div key={g.day}>
            <div className="chat-day xs muted">{g.day}</div>
            {g.items.map((m, i) => {
              // One run: the same person, within 5 minutes. The time shows under its last message.
              const run = (a, b) => a && b && a.from === b.from && Math.abs(new Date(b.at) - new Date(a.at)) < 5 * 60e3;
              const first = !run(g.items[i - 1], m);
              const last = !run(m, g.items[i + 1]);
              return (
                <div key={m.id} id={`msg-${m.id}`} className={`chat-msg ${m.from === me.uid ? 'mine' : 'theirs'}${first ? ' first' : ''}${last ? ' last' : ''}`}>
                  {m.replyTo && (
                    <button type="button" className="chat-quote" onClick={() => jump(m.replyTo.id)} title="Show the message it replies to">
                      <span className="xs">{m.from === me.uid ? 'You' : partner.displayName} replied to {m.replyTo.from === me.uid ? 'you' : m.replyTo.from === m.from ? 'themself' : m.replyTo.name || partner.displayName}</span>
                      <span className="chat-quote-t">{m.replyTo.text}</span>
                    </button>
                  )}
                  <div className="chat-row">
                    <div className="chat-bubble">
                      {m.doc && <DocCard d={m.doc} />}
                      {m.text && <Linked text={m.text} />}
                    </div>
                    <button type="button" className="chat-reply" title="Reply" aria-label="Reply to this message"
                      onClick={() => { setReplyTo(m); input.current?.focus(); }}>↩</button>
                  </div>
                  {last && <div className="xs muted chat-time">{new Date(m.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</div>}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <div className="alert small">{error}</div>}
      {picking && (
        <div className="chat-pick">
          <LinkEditor onAdd={(d) => { setAttach(d); setPicking(false); input.current?.focus(); }} onCancel={() => setPicking(false)} />
        </div>
      )}
      {(replyTo || attach) && (
        <div className="chat-compose-extra">
          {replyTo && (
            <div className="chat-replying">
              <span className="grow"><span className="xs muted">Replying to {replyTo.from === me.uid ? 'yourself' : partner.displayName}</span>
                <span className="chat-quote-t small">{quoteOf(replyTo)}</span></span>
              <button type="button" className="btn-icon" aria-label="Cancel the reply" onClick={() => setReplyTo(null)}>×</button>
            </div>
          )}
          {attach && (
            <div className="chat-replying">
              <span className="grow small">📄 <b>{attach.typeCode} {attach.controlNo}</b> {attach.title}</span>
              <button type="button" className="btn-icon" aria-label="Remove the document" onClick={() => setAttach(null)}>×</button>
            </div>
          )}
        </div>
      )}
      <form className="chat-send" onSubmit={send}>
        <button type="button" className="btn-icon chat-attach" title="Send a DMS document" aria-label="Send a DMS document" onClick={() => setPicking((x) => !x)}>📎</button>
        <textarea ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Message" placeholder="Write a message…"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="btn btn-primary btn-sm" disabled={busy || (!text.trim() && !attach)}>Send</button>
      </form>
    </>
  );
}
