import { useAuth } from '../context/AuthContext.jsx';
import { useEffect, useState } from 'react';
import { LandingBar } from './Login.jsx';
import Icon from '../components/Icon.jsx';
import { isOwnerEmail } from '../lib/owner.js';
import { getSettings, myInvite, requestOffice } from '../lib/api.js';
import Select from '../components/Select.jsx';
import { DEFAULT_SETTINGS } from '../lib/defaults.js';

// The new account's office (from the list in Settings) and whether it heads it: asked at the first
// sign-in, by Google or by email; an administrator approves it.
function OfficeRequest({ user, profile, onSaved }) {
  const [offices, setOffices] = useState(null);
  useEffect(() => { getSettings().then((s) => setOffices(s.offices?.length ? s.offices : DEFAULT_SETTINGS.offices)).catch(() => setOffices(DEFAULT_SETTINGS.offices)); }, []);
  const asked = Boolean(profile?.requestedOffice || profile?.requestedExternal);
  const [editing, setEditing] = useState(!asked);
  const [office, setOffice] = useState(profile?.requestedExternal ? '__none' : profile?.requestedOffice || '');
  const [head, setHead] = useState(Boolean(profile?.requestedHead));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await requestOffice(user.uid, { office: office === '__none' ? '' : office, head, external: office === '__none' }); await onSaved(); setEditing(false); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  if (!editing) {
    return (
      <div className="office-request done">
        <span className="small">Your office: <b>{profile.requestedExternal ? 'Not with an LGU office (supplier, payee…)' : profile.requestedOffice}</b>{profile.requestedHead ? <> · <b>office head</b></> : ''}</span>
        <button type="button" className="link small" onClick={() => setEditing(true)}>Change</button>
      </div>
    );
  }
  return (
    <form className="office-request" onSubmit={save}>
      <label className="field"><span className="field-label">Which office do you belong to?</span>
        <Select value={office} onChange={(e) => setOffice(e.target.value)} disabled={!offices}>
          <option value="">— Select your office —</option>
          {(offices || []).map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__none">Not with an LGU office (supplier, payee…)</option>
        </Select></label>
      {office && office !== '__none' && (
        <fieldset className="office-head-q"><legend className="field-label">Are you the head of this office?</legend>
          <label className="check"><input type="radio" name="head" checked={head} onChange={() => setHead(true)} /> Yes, I am the office head</label>
          <label className="check"><input type="radio" name="head" checked={!head} onChange={() => setHead(false)} /> No</label>
        </fieldset>
      )}
      {error && <div className="alert small">{error}</div>}
      <div><button className="btn btn-primary btn-sm" disabled={busy || !office}>{busy ? 'Saving…' : 'Save'}</button></div>
      <p className="xs muted">An administrator confirms your office (and office head) when approving your account.</p>
    </form>
  );
}

// After signing in, until an administrator approves the account (or it cannot be loaded, or the
// superadmin's email is not verified yet).
export default function Pending({ error }) {
  const { user, profile, logout, refreshProfile, resendVerification } = useAuth();
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  // Added in advance by an administrator: only the email's verification is missing.
  const [invited, setInvited] = useState(false);
  useEffect(() => { if (user && !user.emailVerified) myInvite(user).then((i) => setInvited(Boolean(i))).catch(() => {}); }, [user]);
  const ownerUnverified = (isOwnerEmail(user?.email) || invited) && !user?.emailVerified;
  const check = async () => { setChecking(true); try { await refreshProfile(); } finally { setChecking(false); } };
  const steps = [
    ['Account created', user?.email || ''],
    ['An administrator approves it', 'and assigns you to your office'],
    ['Start using DMS', 'prepare, sign and route documents'],
  ];
  return (
    <div className="landing">
      <LandingBar>
        <button type="button" className="landing-link" onClick={logout}>Sign out</button>
      </LandingBar>
      <div className="pending">
        <span className={`pending-icon${error ? ' bad' : ''}`}><Icon name={error ? 'bell' : ownerUnverified ? 'send' : 'user'} /></span>
        <h1>{error ? 'Unable to load your account' : ownerUnverified ? 'Verify your email' : 'Waiting for approval'}</h1>
        {error ? (
          <>
            <div className="alert">{error}</div>
            {/permission/i.test(error) && (
              <p className="pending-text">The database rules are not published yet, or an older version is published.
                An administrator must open Firebase → Firestore Database → <b>Rules</b>, replace everything with the
                contents of <code>firestore.rules</code> from the DMS repository, and click <b>Publish</b>. Then click
                <b> Check again</b>.</p>
            )}
          </>
        ) : ownerUnverified ? (
          <>
            <p className="pending-text">{isOwnerEmail(user.email) ? `${user.email} is the DMS superadmin. To protect it,` : `An administrator added ${user.email} to DMS, with your office and role. To activate your account,`} Firebase
              must first confirm you own this address: open the verification link we emailed you (check Spam too), then click <b>Check again</b>.
              Or sign out and use <b>Continue with Google</b> with this account, which needs no link.</p>
            <p><button className="link" disabled={sent} onClick={() => resendVerification().then(() => setSent(true))}>
              {sent ? 'Verification email sent.' : 'Send the verification email again'}</button></p>
          </>
        ) : (
          <>
            <p className="pending-text">{profile?.deactivated
              ? <>Hi {profile?.displayName}. Your DMS account was deactivated by an administrator. Ask them if you need access again.</>
              : <>Hi {profile?.displayName}. Your account has been created. An administrator must approve it before you can use DMS.</>}</p>
            {!profile?.deactivated && <OfficeRequest user={user} profile={profile} onSaved={refreshProfile} />}
            <ol className="pending-steps">
              {steps.map(([t, d], i) => (
                <li key={t} className={i === 0 ? 'done' : i === 1 ? 'now' : ''}>
                  <span className="pending-dot">{i === 0 ? <Icon name="tick" /> : i + 1}</span>
                  <span><b>{t}</b><span className="small muted">{d}</span></span>
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="row gap pending-actions">
          <button className="btn btn-primary" disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Check again'}</button>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
