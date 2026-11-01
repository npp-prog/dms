import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Pending from './pages/Pending.jsx';
import Dashboard from './pages/Dashboard.jsx';
import FormatView from './pages/FormatView.jsx';
import PrepareDocument from './pages/PrepareDocument.jsx';
import Documents from './pages/Documents.jsx';
import Inbox from './pages/Inbox.jsx';
import Circulars, { CircularView } from './pages/Circulars.jsx';
import Communities from './pages/Communities.jsx';
import Archive from './pages/Archive.jsx';
import Folders from './pages/Folders.jsx';
import Privacy from './pages/Privacy.jsx';
import Profile from './pages/Profile.jsx';
import Verify from './pages/Verify.jsx';
import DocCheck from './pages/DocCheck.jsx';
import Messages from './pages/Messages.jsx';
import UploadDocument from './pages/UploadDocument.jsx';
import Tracking from './pages/Tracking.jsx';
import Workflow from './pages/admin/Workflow.jsx';
import DocumentView from './pages/DocumentView.jsx';
import DocumentTypes from './pages/admin/DocumentTypes.jsx';
import DocumentTypeEditor from './pages/admin/DocumentTypeEditor.jsx';
import Users from './pages/admin/Users.jsx';
import Settings from './pages/admin/Settings.jsx';
import Checklists from './pages/Checklists.jsx';
import ChecklistView from './pages/ChecklistView.jsx';
import ChecklistEditor from './pages/admin/ChecklistEditor.jsx';

function AdminOnly({ children, superOnly = false, users = false }) {
  const { isAdmin, isSuper, canManageUsers } = useAuth();
  if (superOnly ? !isSuper : users ? !canManageUsers : !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, profile, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  // Anyone can verify a document, signed in or not.
  if (location.pathname === '/verify' && (!user || !profile?.active)) return <Verify standalone />;
  // The privacy notice: for anyone.
  if (location.pathname === '/privacy' && (!user || !profile?.active)) return <Privacy standalone />;
  // The page a document's QR code opens: also for anyone.
  if (location.pathname.startsWith('/v/') && (!user || !profile?.active)) return <DocCheck standalone />;
  if (!user) return <Login />;
  if (error || !profile?.active) return <Pending error={error} />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="formats" element={<Navigate to="/new" replace />} />
        <Route path="formats/:typeId" element={<FormatView />} />
        <Route path="new" element={<PrepareDocument />} />
        <Route path="upload" element={<UploadDocument />} />
        <Route path="new/:typeId" element={<PrepareDocument />} />
        <Route path="checklists" element={<Checklists />} />
        <Route path="checklists/:code" element={<ChecklistView />} />
        <Route path="admin/checklists/new" element={<AdminOnly><ChecklistEditor /></AdminOnly>} />
        <Route path="admin/checklists/:code" element={<AdminOnly><ChecklistEditor /></AdminOnly>} />
        <Route path="notifications" element={<Inbox />} />
        <Route path="folders" element={<Folders />} />
        <Route path="folders/:code" element={<Folders />} />
        <Route path="archive" element={<Archive />} />
        <Route path="circulars" element={<Circulars />} />
        <Route path="circulars/:id" element={<CircularView />} />
        <Route path="communities" element={<Communities />} />
        <Route path="communities/:id" element={<Communities />} />
        <Route path="inbox" element={<Navigate to="/notifications" replace />} />
        <Route path="profile" element={<Profile />} />
        <Route path="messages" element={<Messages />} />
        <Route path="verify" element={<Verify />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="v/:docId" element={<DocCheck />} />
        <Route path="tracking" element={<Tracking />} />
        <Route path="workflow" element={<Navigate to="/tracking" replace />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:docId" element={<DocumentView />} />
        <Route path="documents/:docId/edit" element={<PrepareDocument />} />
        <Route path="admin/types" element={<AdminOnly><DocumentTypes /></AdminOnly>} />
        <Route path="admin/types/new" element={<AdminOnly><DocumentTypeEditor /></AdminOnly>} />
        <Route path="admin/types/:typeId" element={<AdminOnly><DocumentTypeEditor /></AdminOnly>} />
        <Route path="admin/workflow" element={<AdminOnly><Workflow /></AdminOnly>} />
        <Route path="admin/users" element={<AdminOnly users><Users /></AdminOnly>} />
        <Route path="admin/settings" element={<AdminOnly superOnly><Settings /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
