import { useEffect, useId, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getSavedCertificate, getSavedCertificateBytes, getSavedMark, removePhoto, removeSavedCertificate, removeSavedMark, saveCertificate, saveMark,
  savePhoto,
} from '../lib/api.js';
import { REMEMBER_CHOICES, certId, forgetPassword, rememberPassword, rememberedStatus } from '../lib/rememberPassword.js';
import { isValidAt, readCertificate } from '../lib/signing.js';
import { prepareMark } from '../lib/markImage.js';
import Select from '../components/Select.jsx';
import { Avatar } from '../components/Icon.jsx';
import { staleReload } from '../lib/freshness.js';
import { ROLE_NAMES } from '../lib/roles.js';

// A square JPEG (320 px) of the middle of the chosen picture, made on the device.
async function squarePhoto(file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Choose a picture (JPG, PNG or WebP).');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('This picture could not be read. Choose another one.'); });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 320, 320);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 320, 320);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');

// My Profile: the user's details and their digital signature, registered once and changed any
// time: the DICT PNPKI certificate file (.p12/.pfx) and the signature mark placed on the PDFs
// they sign. When signing, they then only type their certificate password.
export default function Profile() {
  const { user, profile, isHead, updateMyProfile } = useAuth();
  const id = useId();
  const [name, setName] = useState(profile.displayName || '');
  const [position, setPosition] = useState(profile.position || '');
  const [idNo, setIdNo] = useState(profile.idNo || '');
  const [cert, setCert] = useState(undefined);
  const [mark, setMark] = useState(undefined);
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  // When signing: ask for the password every time, or remember it on this device for a while.
  const [remembered, setRemembered] = useState(null);
  const [askMode, setAskMode] = useState('ask');
  const [days, setDays] = useState(REMEMBER_CHOICES[0].days);
  const [rememberPw, setRememberPw] = useState('');

  useEffect(() => {
    getSavedCertificate(user.uid).then(setCert).catch((e) => { setCert(null); setMsg({ ok: false, text: e.message }); });
    getSavedMark(user.uid).then(setMark).catch(() => setMark(null));
  }, [user.uid]);
  useEffect(() => {
    if (cert) rememberedStatus(user.uid, certId(cert)).then((r) => { setRemembered(r); setAskMode(r ? 'remember' : 'ask'); });
  }, [cert, user.uid]);
  const markUrl = useMemo(() => (mark ? URL.createObjectURL(new Blob([mark], { type: 'image/png' })) : ''), [mark]);

  const run = async (label, fn) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { if (!staleReload(e)) setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  const detailsChanged = name.trim() !== (profile.displayName || '') || position.trim() !== (profile.position || '')
    || idNo.trim() !== (profile.idNo || '');
  const saveDetails = () => run('Saving…', async () => {
    if (!name.trim()) throw new Error('Type your name.');
    await updateMyProfile({ displayName: name.trim().slice(0, 120), position: position.trim().slice(0, 120), idNo: idNo.trim().slice(0, 40) });
    setMsg({ ok: true, text: 'Your details were saved.' });
  });

  const changePhoto = (f) => run('Saving your picture…', async () => {
    if (!f) return;
    const url = await savePhoto(user.uid, await squarePhoto(f));
    await updateMyProfile({ photo: `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` });
    setMsg({ ok: true, text: 'Your profile picture was saved.' });
  });
  const dropPhoto = () => run('Removing…', async () => {
    if (!window.confirm('Remove your profile picture?')) return;
    if (/firebasestorage|:9199\//.test(profile.photo || '')) await removePhoto(user.uid);
    await updateMyProfile({ photo: '' });
  });

  // The password only checks that this is the user's certificate; it is not stored.
  const registerCert = () => run('Checking your certificate…', async () => {
    if (!file) throw new Error('Choose your certificate file (.p12 or .pfx).');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = readCertificate(bytes, password);
    if (!isValidAt(info)) throw new Error(`This certificate is not valid today (valid ${day(info.notBefore)} to ${day(info.notAfter)}). Renew it with DICT.`);
    if (!info.pnpki && !window.confirm(`This certificate was issued by "${info.issuer}", not by the DICT PNPKI. Register it anyway?`)) return;
    await saveCertificate(user.uid, bytes, info);
    await forgetPassword(user.uid); // a remembered password belonged to the previous certificate
    setRemembered(null); setAskMode('ask');
    setCert({ ...info, savedAt: new Date().toISOString() });
    setFile(null); setPassword(''); setReplacing(false);
    setMsg({ ok: true, text: `Certificate of ${info.name} registered. When you sign, you only type its password.` });
  });

  const removeCert = () => run('Removing…', async () => {
    if (!window.confirm('Remove your certificate from DMS? You will need to register it again to sign in DMS.')) return;
    await removeSavedCertificate(user.uid);
    await forgetPassword(user.uid);
    setCert(null); setRemembered(null);
    setMsg({ ok: true, text: 'Your certificate was removed from DMS.' });
  });

  // The password is checked against the registered certificate before it is remembered.
  const remember = () => run('Checking your password…', async () => {
    readCertificate(await getSavedCertificateBytes(user.uid), rememberPw);
    const until = await rememberPassword(user.uid, certId(cert), rememberPw, days, cert.notAfter);
    setRemembered({ until }); setRememberPw('');
    const capped = new Date(until).getTime() < Date.now() + days * 864e5 - 60000;
    setMsg({ ok: true, text: `Your password is remembered on this device until ${new Date(until).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}${capped ? ', when your certificate expires' : ''}. You sign without typing it.` });
  });
  const forget = () => run('Forgetting…', async () => {
    await forgetPassword(user.uid);
    setRemembered(null); setAskMode('ask');
    setMsg({ ok: true, text: 'Your password is no longer remembered on this device. You type it each time you sign.' });
  });

  const changeMark = (f) => run('Preparing your signature mark…', async () => {
    if (!f) return;
    const png = await prepareMark(f);
    await saveMark(user.uid, png);
    setMark(png);
    setMsg({ ok: true, text: 'Signature mark saved.' });
  });

  const removeMark = () => run('Removing…', async () => {
    if (!window.confirm('Remove your signature mark?')) return;
    await removeSavedMark(user.uid);
    setMark(null);
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My Profile</h1>
        </div>
      </div>
      {msg && <div className={msg.ok ? 'alert alert-ok' : 'alert'}>{msg.text}</div>}

      <div className="profile-grid">
        <section className="card">
          <h3>Details</h3>
          <div className="profile-photo">
            <Avatar name={profile.displayName || profile.email} photo={profile.photo} size="lg" />
            <div className="row gap wrap small">
              <label className="btn btn-ghost btn-sm">
                {profile.photo ? 'Change picture' : 'Upload picture'}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { changePhoto(e.target.files[0]); e.target.value = ''; }} />
              </label>
              {profile.photo && <button type="button" className="link" disabled={!!busy} onClick={dropPhoto}>Remove</button>}
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-name`}>Name</label>
            <input id={`${id}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-pos`}>Position</label>
            <input id={`${id}-pos`} value={position} maxLength={120} onChange={(e) => setPosition(e.target.value)} />
            <span className="xs muted">Your job title or designation. It shows with your name in DMS and prints under your name on the documents you prepare.</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-idno`}>ID No.</label>
            <input id={`${id}-idno`} value={idNo} maxLength={40} onChange={(e) => setIdNo(e.target.value)} />
            <span className="xs muted">Your employee ID number.</span>
          </div>
          <div><button className="btn btn-primary btn-sm" disabled={!!busy || !detailsChanged} onClick={saveDetails}>Save details</button></div>
          <dl className="details">
            <dt>Email</dt><dd>{profile.email}</dd>
            <dt>Office</dt><dd>{profile.office || '—'}{isHead && <> <span className="badge badge-blue">Office head</span></>}</dd>
            <dt>Role</dt><dd>{ROLE_NAMES[profile.role] || profile.role}</dd>
            {(profile.positions || []).length > 0 && <><dt>Acts as</dt><dd>{profile.positions.join(', ')}</dd></>}
          </dl>
          <p className="small muted">Your office, role and the positions that decide which steps you act on (Acts as) are set by an administrator.</p>
        </section>

        <section className="card">
          <h3>Digital signature certificate</h3>
          <p className="small muted">Your DICT PNPKI certificate file (.p12 or .pfx). Only you can use it in DMS; not even an administrator can
            open it. Your password is never stored on the server, so use a strong one.</p>
          {cert === undefined && <div className="spinner" />}
          {cert && !replacing && (
            <div className="saved-cert">
              <div><b>{cert.name}</b> {cert.pnpki ? <span className="badge badge-green">DICT PNPKI</span> : <span className="badge badge-yellow">Not PNPKI</span>}</div>
              <div className="small muted">Issued by {cert.issuer || '—'}{cert.notAfter ? ` · valid until ${day(cert.notAfter)}` : ''}</div>
              {cert.notAfter && new Date(cert.notAfter) < new Date() && <div className="small sig-problem">Expired: register your renewed certificate.</div>}
              <div className="row gap small">
                <button type="button" className="link" onClick={() => setReplacing(true)}>Change certificate</button>
                <button type="button" className="link" disabled={!!busy} onClick={removeCert}>Remove</button>
              </div>
            </div>
          )}
          {cert && !replacing && (
            <div className="pw-choice">
              <div className="field-label">When I sign</div>
              <label className="check"><input type="radio" name={`${id}-ask`} checked={askMode === 'ask'}
                onChange={() => (remembered ? forget() : setAskMode('ask'))} /> Ask for my password every time (recommended)</label>
              <label className="check"><input type="radio" name={`${id}-ask`} checked={askMode === 'remember'}
                onChange={() => setAskMode('remember')} /> Remember my password on this device</label>
              {askMode === 'remember' && (remembered ? (
                <div className="small">
                  Remembered on this device until <b>{new Date(remembered.until).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</b>.
                  {' '}<button type="button" className="link" disabled={!!busy} onClick={forget}>Forget it now</button>
                </div>
              ) : (
                <div className="sign-panel">
                  <div className="field">
                    <label className="field-label" htmlFor={`${id}-days`}>For</label>
                    <Select id={`${id}-days`} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                      {REMEMBER_CHOICES.map((c) => <option key={c.label} value={c.days}>{c.label}</option>)}
                    </Select>
                    {cert.notAfter && <span className="small muted">At most until your certificate expires ({day(cert.notAfter)}).</span>}
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor={`${id}-rpw`}>Certificate password</label>
                    <input id={`${id}-rpw`} type="password" autoComplete="off" value={rememberPw} onChange={(e) => setRememberPw(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && remember()} />
                  </div>
                  <p className="xs muted">Kept only in this browser, encrypted with a key it cannot export, never sent to DMS. While it is remembered,
                    anyone using your DMS account on this device can sign as you: use it only on a device that is yours, and log out of shared ones.</p>
                  <div><button className="btn btn-primary btn-sm" disabled={!!busy || !rememberPw} onClick={remember}>{busy || 'Remember'}</button></div>
                </div>
              ))}
            </div>
          )}
          {cert !== undefined && (!cert || replacing) && (
            <div className="sign-panel">
              <div className="field">
                <label className="field-label" htmlFor={`${id}-p12`}>Certificate file (.p12 or .pfx)</label>
                <input id={`${id}-p12`} type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setFile(e.target.files[0] || null)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${id}-pw`}>Certificate password (to check it is yours; not stored)</label>
                <input id={`${id}-pw`} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && registerCert()} />
              </div>
              <div className="row gap">
                <button className="btn btn-primary" disabled={!!busy || !file || !password} onClick={registerCert}>{busy || 'Register certificate'}</button>
                {replacing && <button className="btn btn-ghost" onClick={() => { setReplacing(false); setFile(null); setPassword(''); }}>Cancel</button>}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h3>Signature mark</h3>
          <p className="small muted">A picture of your handwritten signature, placed on the face of the PDFs you sign with your name and the date.
            A photo of dark ink on white paper works: DMS makes the paper see-through and crops it.</p>
          {mark === undefined && <div className="spinner" />}
          {mark && <img className="mark-preview mark-preview-lg" src={markUrl} alt="Your signature mark" />}
          {mark !== undefined && (
            <div className="row gap wrap small">
              <label className="btn btn-ghost btn-sm">
                {mark ? 'Change signature mark' : 'Upload signature mark'}
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => changeMark(e.target.files[0])} />
              </label>
              {mark && <button type="button" className="link" disabled={!!busy} onClick={removeMark}>Remove</button>}
              {busy && <span className="muted">{busy}</span>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
