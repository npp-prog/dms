import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getRedirectResult, onAuthStateChanged,
  sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup,
  signInWithRedirect, signOut, updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase.js';
import { ensureUserProfile, getFolderAccess, getSettings, setupSite, syncDirectory, syncDirectoryEntry, updateUser } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({});
  // Folders the office head gave this user (Folders → Access), viewer or editor.
  const [folderGrant, setFolderGrant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Registration details waiting for the auth listener to create the profile.
  const pendingProfile = useRef(null);

  const [setupNotice, setSetupNotice] = useState([]);

  const loadProfile = useCallback(async (firebaseUser) => {
    const p = await ensureUserProfile(firebaseUser, pendingProfile.current || {});
    pendingProfile.current = null;
    if (p.active && ['admin', 'superadmin'].includes(p.role)) {
      // New site: install the starter formats, checklists and settings. Existing site:
      // bring in the formats and checklists DMS has revised since.
      const installed = await setupSite({ uid: firebaseUser.uid }).catch(() => []);
      if (installed.length) setSetupNotice(installed);
    }
    // No profile picture yet: the one of their Google account, if any (once: a picture they
    // removed stays removed).
    if (p.active && !('photo' in p) && /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(firebaseUser.photoURL || '')) {
      await updateUser(firebaseUser.uid, { photo: firebaseUser.photoURL }).then(() => { p.photo = firebaseUser.photoURL; }).catch(() => {});
    }
    setProfile(p);
    if (p.active) {
      setSettings(await getSettings().catch(() => ({})));
      setFolderGrant(p.role !== 'payee' ? await getFolderAccess(firebaseUser.uid).catch(() => null) : null);
      syncDirectoryEntry(firebaseUser.uid, p).catch(() => {});
      if (['admin', 'superadmin'].includes(p.role)) syncDirectory().catch(() => {});
    }
    return p;
  }, []);

  // Finish a Google sign-in that fell back to a full-page redirect.
  useEffect(() => { getRedirectResult(auth).catch((e) => setError(e.message)); }, []);

  useEffect(() => onAuthStateChanged(auth, async (firebaseUser) => {
    setLoading(true);
    setUser(firebaseUser);
    setError('');
    if (!firebaseUser) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      await loadProfile(firebaseUser);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }), [loadProfile]);

  const value = {
    user,
    profile,
    settings,
    setSettings,
    folderGrant,
    setupNotice,
    dismissSetupNotice: () => setSetupNotice([]),
    loading,
    error,
    isAdmin: profile?.active && ['admin', 'superadmin'].includes(profile.role),
    isSuper: profile?.active && profile.role === 'superadmin',
    // The office head sees every document of the office (Users > Office head).
    isHead: Boolean(profile?.active && profile.office && profile.head),
    // The Records Officer (a position, Users) sees and downloads every document.
    isRecords: Boolean(profile?.active && (profile.positions || []).includes('Records Officer')),
    // A supplier or payee (not LGU personnel): only the documents referred to them.
    isExternal: Boolean(profile?.active && profile.role === 'payee'),
    // May refer a document they hold to any active user outside its route (Users > May route to
    // any person); admins always may.
    canRefer: Boolean(profile?.active && (['admin', 'superadmin'].includes(profile.role) || profile.canRefer)),
    // Saves changes to the user's own profile (e.g. their name) and shows them at once.
    updateMyProfile: async (patch) => {
      await updateUser(user.uid, patch);
      setProfile((p) => ({ ...p, ...patch }));
      syncDirectoryEntry(user.uid, { ...profile, ...patch }).catch(() => {});
    },
    // Combined identity used when stamping documents.
    actor: user && profile ? {
      uid: user.uid, email: user.email, displayName: profile.displayName, office: profile.office,
      position: profile.position || '', idNo: profile.idNo || '', photo: profile.photo || '',
    } : null,
    login: (email, password) => signInWithEmailAndPassword(auth, email, password),
    loginWithGoogle: async () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // Popups can be blocked (some phones, in-app browsers): use a full-page redirect instead.
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
          await signInWithRedirect(auth, provider);
        } else if (e.code !== 'auth/popup-closed-by-user') {
          throw e;
        }
      }
    },
    register: async ({ email, password, displayName, office }) => {
      pendingProfile.current = { displayName, office };
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      sendEmailVerification(cred.user).catch(() => {});
    },
    resendVerification: () => (user ? sendEmailVerification(user) : Promise.resolve()),
    resetPassword: (email) => sendPasswordResetEmail(auth, email),
    logout: () => signOut(auth),
    refreshProfile: async () => {
      if (!user) return;
      setError('');
      try {
        // Pick up a just-verified email in both the user and its ID token (the rules read the token).
        await user.reload();
        await user.getIdToken(true);
        await loadProfile(user);
      } catch (e) { setError(e.message); }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
