import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import UpdateBar from './UpdateBar.jsx';
import Icon, { Avatar } from './Icon.jsx';
import BackButton from './BackButton.jsx';
import AskDms from './AskDms.jsx';
import { isUnread, listInbox, watchConversations } from '../lib/api.js';
import { listCirculars, toReceive, watchCommunities, watchNotifications } from '../lib/social.js';
import { watchIdle } from '../lib/idle.js';

const ROLE_NAMES = { superadmin: 'Superadmin', admin: 'Administrator', user: 'User', payee: 'Third Party' };

// A supplier or payee may open only these: the documents referred to them, Messages, and their
// profile (certificate and signature mark).
const EXTERNAL_PAGES = /^\/(notifications|messages|profile|documents\/[^/]+)\/?$/;

export default function Layout() {
  const { user, profile, settings, isAdmin, isSuper, isHead, isRecords, isExternal, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  // Signed out after an hour without activity (Data Privacy Act: shared computers).
  useEffect(() => watchIdle(() => {
    try { sessionStorage.setItem('dms-signed-out', 'idle'); } catch { /* no notice then */ }
    logout();
  }), []);
  // Documents waiting in the user's office (refreshed as the user moves around).
  const [waiting, setWaiting] = useState(0);
  const [circulars, setCirculars] = useState([]); // ids of circulars the office has to receive
  useEffect(() => {
    if (!profile?.active) return;
    listInbox({ office: profile.office, uid: user.uid, head: isHead || isAdmin }).then((d) => setWaiting(d.length)).catch(() => {});
    if (!isExternal) listCirculars({ office: profile.office, uid: user.uid, isAdmin: false }).then((l) => setCirculars(toReceive(l, profile.office).map((c) => c.id))).catch(() => {});
  }, [location.pathname, profile?.office, profile?.active, isAdmin, isHead, user.uid]);

  // Conversations with a message not seen yet (live).
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!profile?.active) return undefined;
    return watchConversations(user.uid, (list) => setUnread(list.filter((c) => isUnread(c, user.uid)).length), () => setUnread(0));
  }, [user.uid, profile?.active]);

  // Updates not read yet (live), and communities with a message not seen yet.
  const [unreadUpdates, setUnreadUpdates] = useState([]);
  useEffect(() => {
    if (!profile?.active) return undefined;
    return watchNotifications(user.uid, (list) => setUnreadUpdates(list.filter((n) => !n.read)), () => setUnreadUpdates([]));
  }, [user.uid, profile?.active]);
  const [groupUnread, setGroupUnread] = useState(0);
  useEffect(() => {
    if (!profile?.active || isExternal) return undefined;
    return watchCommunities(user.uid, (list) => setGroupUnread(list.filter((c) => isUnread(c, user.uid)).length), () => setGroupUnread(0));
  }, [user.uid, profile?.active]);
  // A circular to receive that also has an unread update counts once.
  const notices = waiting + unreadUpdates.length
    + circulars.filter((id) => !unreadUpdates.some((n) => n.link === `/circulars/${id}`)).length;

  const groups = isExternal ? [
    { items: [['/notifications', 'bell', 'Documents for you', false, notices], ['/messages', 'chat', 'Messages', false, unread], ['/profile', 'user', 'My Profile']] },
  ] : [
    { items: [['/', 'home', 'Dashboard', true]] },
    {
      label: 'Documents',
      items: [
        ['/tracking', 'workflow', 'Tracking'],
        ['/documents', 'documents', isAdmin || isRecords ? 'All Documents' : isHead ? 'Office Documents' : 'My Documents'],
        ['/folders', 'folder', 'Folders'],
        ['/circulars', 'send', 'Circulars'],
        ['/archive', 'archive', 'Archive'],
        ['/checklists', 'check', 'Checklists'],
      ],
    },
    { label: 'Account', items: [['/messages', 'chat', 'Messages', false, unread], ['/communities', 'users', 'Communities', false, groupUnread], ['/profile', 'user', 'My Profile']] },
    isAdmin && {
      label: 'Administration',
      items: [
        ['/admin/types', 'types', 'Document Types'],
        ['/admin/workflow', 'workflow', 'Workflow'],
        ['/admin/users', 'users', 'Users'],
        isSuper && ['/admin/settings', 'settings', 'Settings'],
      ].filter(Boolean),
    },
  ].filter(Boolean);

  // The page name in the header: the menu item the page belongs to.
  const titles = [
    ...groups.flatMap((g) => g.items.map(([to, , label]) => [to, label])),
    ['/new', 'New Document'], ['/upload', 'Upload Document'], ['/formats', 'Document Types'], ['/admin/checklists', 'Checklists'],
  ];
  const path = location.pathname;
  const title = path === '/' ? 'Dashboard'
    : titles.filter(([to]) => to !== '/' && (path === to || path.startsWith(`${to}/`))).sort((a, b) => b[0].length - a[0].length)[0]?.[1] || 'DMS';

  // The panel button hides the menu (remembered on this device); on a phone it opens it.
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('dms-side') === 'hidden'; } catch { return false; } });
  const togglePanel = () => {
    if (window.matchMedia('(max-width: 900px)').matches) { setOpen(!open); return; }
    setHidden(!hidden);
    try { localStorage.setItem('dms-side', hidden ? 'shown' : 'hidden'); } catch { /* not remembered */ }
  };
  const name = profile?.displayName || profile?.email;

  return (
    <div className={`shell${open ? ' nav-open' : ''}${hidden ? ' side-hidden' : ''}`}>
      <nav className="side" aria-label="Main">
        <Link to="/" className="side-brand">
          <img className="seal" src="/municipal-seal.png" alt="" />
          <span><b>DMS</b><small>{settings.lguName || 'Municipal Government of Candoni'}</small></span>
        </Link>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && <div className="group">{g.label}</div>}
            {g.items.map(([to, icon, label, end, count]) => (
              <NavLink key={to} to={to} end={end}>
                <Icon name={icon} className="nav-ic" /><span className="lbl">{label}</span>
                {count > 0 && <span className="count">{count}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="side-foot">Document Management System · <a href="/privacy">Privacy</a></div>
      </nav>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="shell-main">
        <header className="topbar">
          <button className="icon-btn panel-btn" aria-label="Show or hide the menu" aria-expanded={open || !hidden} onClick={togglePanel}>
            <Icon name="panel" />
          </button>
          <span className="top-title">{title}</span>
          <div className="spacer" />
          <Link to="/profile" className="pill-btn hide-sm" title="My Profile">{ROLE_NAMES[profile?.role] || profile?.role}</Link>
          <button className="pill-btn" title="Log out" onClick={logout}>
            <Icon name="logout" /><span className="lo-txt">Log out</span>
          </button>
          <Link to="/notifications" className="square-btn" title={notices ? `${notices} new for you` : 'Notifications'}>
            <Icon name="bell" />{notices > 0 && <span className="bell-count">{notices > 99 ? '99+' : notices}</span>}
          </Link>
          <Link to="/profile" className="me" title={`${name} · My Profile`}>
            <Avatar name={name} photo={profile?.photo} size="sm" />
          </Link>
        </header>
        <main className="main">
          <UpdateBar />
          <BackButton />
          {isExternal && !EXTERNAL_PAGES.test(location.pathname) ? <Navigate to="/notifications" replace /> : <Outlet />}
        </main>
      </div>
      {profile?.active && <AskDms />}
    </div>
  );
}
