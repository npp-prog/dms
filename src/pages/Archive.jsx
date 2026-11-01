import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { matchesSearch } from '../lib/docSearch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import {
  backupStatus, buildBackup, driveCall, fileInArchive, getArchiveSettings, isArchived, listArchive, listBackups, logBackup,
  processedAt, saveArchiveSettings, saveBackup, toBackUp,
} from '../lib/archive.js';
import { drnOf } from '../lib/naming.js';
import { localDay } from '../lib/archiveFiles.js';
import Select from '../components/Select.jsx';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// The Archive: processed documents (their route is complete). Everyone sees the processed
// documents they may open; the Records Officer (and administrators) see them all, record where
// each is filed, and back the archive up to the devices they keep.
export default function Archive() {
  const { user, profile, isAdmin, isHead, isRecords, actor } = useAuth();
  const keeper = isRecords || isAdmin;
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', type: '', office: '', year: '' });
  const [filing, setFiling] = useState(null); // { id, location, note }

  const load = () => (keeper ? listArchive() : listDocuments({ uid: user.uid, office: profile.office, head: isHead, granted: true }).then((l) => l.filter(isArchived)))
    .then(setDocs).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [keeper, user.uid, profile.office, isHead]);

  const types = useMemo(() => [...new Set((docs || []).map((d) => d.typeCode))].sort(), [docs]);
  const offices = useMemo(() => [...new Set((docs || []).map((d) => d.office).filter(Boolean))].sort(), [docs]);
  // The year it was processed, in Philippine time (as the backups file it).
  const yearOf = (d) => (processedAt(d) ? localDay(processedAt(d)).slice(0, 4) : '');
  const years = useMemo(() => [...new Set((docs || []).map(yearOf).filter(Boolean))].sort().reverse(), [docs]);
  const shown = useMemo(() => (docs || []).filter((d) => {
    const q = filters.q.toLowerCase();
    return (!filters.type || d.typeCode === filters.type)
      && (!filters.office || d.office === filters.office)
      && (!filters.year || yearOf(d) === filters.year)
      && matchesSearch(d, q);
  }), [docs, filters]);

  const saveFiling = async () => {
    try { await fileInArchive(filing.id, filing, actor); setFiling(null); await load(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Archive</h1></div></div>
      {keeper && <DriveBackup />}
      {keeper && docs && <Backups docs={docs} me={actor} />}
      <div className="filters">
        <input className="search" placeholder="Search by number, payee, where filed or anything in the document…" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </Select>
        <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </Select>
        {keeper && (
          <Select value={filters.office} onChange={(e) => setFilters({ ...filters, office: e.target.value })} aria-label="Office">
            <option value="">All offices</option>
            {offices.map((o) => <option key={o}>{o}</option>)}
          </Select>
        )}
      </div>
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Control No.</th><th>DRN</th><th>Type</th><th>Payee / Subject</th>{keeper && <th>Office</th>}<th>Processed</th><th>Filed at</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="muted">No processed documents{filters.q || filters.type || filters.year || filters.office ? ' match' : ' yet'}.</td></tr>}
              {shown.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                  <td className="small">{drnOf(d) || '—'}</td>
                  <td>{d.typeCode}</td>
                  <td>{d.title}</td>
                  {keeper && <td className="small">{d.office || '—'}</td>}
                  <td className="small">{day(processedAt(d))}</td>
                  <td className="small">
                    {filing?.id === d.id ? (
                      <div className="archive-file">
                        <input aria-label="Where it is filed" value={filing.location} onChange={(e) => setFiling({ ...filing, location: e.target.value })} />
                        <input aria-label="Note" placeholder="Note (optional)" value={filing.note} onChange={(e) => setFiling({ ...filing, note: e.target.value })} />
                        <div className="row gap">
                          <button type="button" className="btn btn-primary btn-sm" onClick={saveFiling}>Save</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiling(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {d.archive?.location ? <><b>{d.archive.location}</b>{d.archive.note && <div className="muted">{d.archive.note}</div>}</> : <span className="muted">Not filed yet</span>}
                        {keeper && <div><button type="button" className="link xs" onClick={() => setFiling({ id: d.id, location: d.archive?.location || '', note: d.archive?.note || '' })}>{d.archive?.location ? 'Change' : 'Record where it is filed'}</button></div>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const DRIVE_RESULT = {
  connected: { ok: true, text: 'Your Google Drive is connected. The archive is backed up to it every 10 minutes.' },
  cancelled: { ok: false, text: 'Not connected: the Google sign-in was cancelled.' },
  expired: { ok: false, text: 'Not connected: the sign-in took too long. Try again.' },
  'no-token': { ok: false, text: 'Not connected: Google gave no lasting access. Remove DMS from the account (myaccount.google.com → Security → Third-party access) and connect again.' },
  failed: { ok: false, text: 'Not connected: Google refused. Its reason:' },
  'not-set-up': { ok: false, text: 'The Google Drive backup is not set up in Netlify yet (see the README).' },
  taken: { ok: false, text: 'Not connected: that Google account is already connected by someone else. Use another Google account.' },
};

// Automatic backup to Google Drive: every 10 minutes, a server function copies new and changed
// processed documents to each connected account's Drive (folder DMS Archive). Each Records Officer
// or administrator may connect their own Google account; each Drive keeps its own full copy.
function DriveAccount({ a, busy, canDisconnect, onRun, onDisconnect }) {
  return (
    <li className="drive-account">
      <div className="drive-account-main">
        <div className="drive-account-who">
          <b>{a.email}</b>
          <span className="xs muted">Connected by {a.by}{a.mine ? ' (you)' : ''} · {when(a.at)}</span>
          <span className="xs muted">{a.lastRunAt ? `Last run ${when(a.lastRunAt)}` : 'Not run yet'}{a.documents ? ` · ${a.documents} document(s), ${a.files || 0} file(s)` : ''}{a.lastRunAt && a.caughtUp === false ? ' · still catching up' : ''}</span>
        </div>
        <div className="drive-account-side">
          <span className={`badge ${a.lastError ? 'badge-red' : 'badge-green'}`}>{a.lastError ? 'Problem' : 'Automatic'}</span>
          <button type="button" className="btn btn-sm" disabled={!!busy} onClick={onRun}>{busy === `run:${a.uid}` ? 'Backing up…' : 'Back up now'}</button>
          {canDisconnect && <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={onDisconnect}>Disconnect</button>}
        </div>
      </div>
      {a.lastMissing?.length > 0 && <p className="xs muted">Files that could not be read last time: {a.lastMissing.join('; ')}.</p>}
      {a.lastError && <div className="alert small">Last run failed: {a.lastError}</div>}
    </li>
  );
}

function DriveBackup() {
  // Someone else's Drive: only the Admin and the superadmin disconnect it.
  const { canManageSettings: disconnectsAny } = useAuth();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const m = DRIVE_RESULT[q.get('drive')];
    return m && q.get('reason') ? { ...m, text: `${m.text} ${q.get('reason')}` } : m || null;
  });
  const load = () => driveCall('drive-backup-now', { action: 'status' }).then(setS).catch((e) => setS({ unavailable: e.message }));
  useEffect(() => { load(); }, []);
  const act = async (label, fn) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); load(); }
  };
  const connect = () => act('connect', async () => { window.location.href = (await driveCall('drive-auth', { action: 'start' })).url; });
  const disconnect = (a) => window.confirm(`Stop backing up to ${a.email}? The files already there stay in its Drive.`)
    && act(`off:${a.uid}`, () => driveCall('drive-auth', { action: 'disconnect', uid: a.uid }));
  const run = (a) => act(`run:${a.uid}`, async () => {
    const r = await driveCall('drive-backup-now', { action: 'run', uid: a.uid });
    setMsg(r.skipped ? { ok: false, text: r.skipped } : r.error ? { ok: false, text: r.error }
      : { ok: true, text: `${a.email}: backed up ${r.documents} document(s), ${r.files} new file(s)${r.caughtUp ? '. Everything is backed up.' : '. More to go: it goes on every 10 minutes.'}` });
  });
  if (!s) return null;
  if (s.unavailable || s.configured === false) {
    return (
      <section className="card archive-backup">
        <div className="card-head"><h3>Google Drive</h3><span className="badge badge-gray">Not set up</span></div>
        <p className="small muted">{s.unavailable || 'The automatic backup to Google Drive is not set up yet: an administrator adds the Google OAuth client in Netlify (README).'}</p>
      </section>
    );
  }
  const accounts = s.accounts || [];
  const mine = accounts.some((a) => a.mine);
  return (
    <section className="card archive-backup">
      <div className="card-head">
        <h3>Google Drive</h3>
        <span className={`badge ${accounts.length ? (accounts.some((a) => a.lastError) ? 'badge-red' : 'badge-green') : 'badge-gray'}`}>
          {accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'}` : 'Not connected'}</span>
      </div>
      <p className="small muted">Every 10 minutes, processed documents are copied automatically to the folder <b>DMS Archive</b> in each account below.
        The Records Officer and each administrator can connect their own; each keeps a full copy. If someone who connected one stops being the Records Officer or an administrator, connect it again.</p>
      {accounts.length > 0 && (
        <ul className="drive-accounts">
          {accounts.map((a) => (
            <DriveAccount key={a.uid} a={a} busy={busy} canDisconnect={a.mine || disconnectsAny}
              onRun={() => run(a)} onDisconnect={() => disconnect(a)} />
          ))}
        </ul>
      )}
      {!mine && <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={connect}>{busy === 'connect' ? 'Opening Google…' : accounts.length ? 'Connect my Google Drive too' : 'Connect Google Drive'}</button>}
      {msg && <div className={`alert small ${msg.ok ? 'alert-ok' : ''}`}>{msg.text}</div>}
    </section>
  );
}

// Backups of the archive to the Records Officer's devices: which devices, how often, the last
// backup to each, and Back up now (a ZIP saved to the device).
function Backups({ docs, me }) {
  const [settings, setSettings] = useState(null);
  const [backups, setBackups] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ device: '', kind: 'new' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = () => Promise.all([getArchiveSettings(), listBackups()]).then(([s, b]) => {
    setSettings(s); setBackups(b);
    setForm((f) => ({ ...f, device: f.device || s.devices[0]?.id || '' }));
  }).catch((e) => setMsg({ ok: false, text: e.code === 'permission-denied'
    ? 'Backups are not switched on yet: an administrator must publish the latest firestore.rules (Firebase console → Firestore → Rules).' : e.message }));
  useEffect(() => { load(); }, []);
  if (!settings) return msg ? <div className="alert">{msg.text}</div> : null;

  const status = backupStatus(backups, settings);
  // The chosen device, else the first (e.g. one just added, or the chosen one removed).
  const device = settings.devices.find((d) => d.id === form.device) || settings.devices[0];
  const last = device ? backups.find((b) => b.device === device.id) : null;
  const batch = toBackUp(docs, last, form.kind);

  const run = async () => {
    setBusy('Preparing…'); setMsg(null);
    try {
      const { blob, files, failed } = await buildBackup(batch, setBusy);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      const saved = await saveBackup(blob, `DMS archive ${stamp} ${form.kind === 'all' ? 'all' : 'new'}.zip`);
      if (saved === 'cancelled') { setMsg({ ok: false, text: 'Not saved: no backup recorded.' }); return; }
      await logBackup({ device: device.id, deviceName: device.name, kind: form.kind, count: batch.length, files, failed: failed.length }, me);
      await load();
      setMsg({ ok: !failed.length, text: `${saved === 'saved' ? 'Saved' : 'Downloaded: move the ZIP to'} ${saved === 'saved' ? `to ${device.name}` : device.name}. ${batch.length} document(s), ${files} file(s)${failed.length ? `; ${failed.length} file(s) could not be added (listed in could-not-be-added.txt)` : ''}.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(''); }
  };

  return (
    <section className="card archive-backup">
      <div className="card-head">
        <h3>Backups to devices</h3>
        {!editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Devices and schedule</button>}
      </div>
      {editing ? <Devices settings={settings} onCancel={() => setEditing(false)} onSaved={(s) => { setSettings(s); setEditing(false); setForm((f) => ({ ...f, device: s.devices.some((d) => d.id === f.device) ? f.device : s.devices[0]?.id || '' })); }} /> : (
        <>
          <details className="how-it-works" open={status.length === 0}>
            <summary className="small"><b>How it works</b></summary>
            <ol className="small">
              <li><b>Add your devices once</b> (<b>Devices and schedule</b>): the Records Office computer, external drive, flash drive or network storage that keeps copies, and how often to back up.</li>
              <li><b>Back up when it is due.</b> DMS shows <b>Due</b> here and reminds you on the Dashboard. Plug in the device, choose it below and click <b>Back up</b>.</li>
              <li><b>Save the ZIP to the device.</b> DMS makes one ZIP file (each document's PDFs, attachments and record, by year and type, with an index). On a computer with Chrome or Edge a window opens: choose a folder on the device. On other browsers, tablets and phones it goes to Downloads: move it to the device.</li>
              <li><b>It is recorded</b> in the Backup log: when, which device, how many documents, by whom.</li>
            </ol>
            <p className="small muted">Nothing is saved to a device by itself: a backup happens only when someone clicks <b>Back up</b>. To stop backing up to a device, remove it in <b>Devices and schedule</b> (its past backups stay in the log); the reminders for it stop too. The copy to Google Drive above is the automatic one.</p>
          </details>
          {status.length === 0 && <p className="small muted">No device yet: click <b>Devices and schedule</b> to add one.</p>}
          <ul className="receipts">
            {status.map((d) => (
              <li key={d.id}>
                <span><b>{d.name}</b>{d.note && <span className="muted small"> · {d.note}</span>}</span>
                <span className="small">{d.last ? <>Last backup {when(d.last.at)} by {d.last.byName}</> : 'Never backed up'}
                  {' '}<span className={`badge ${d.due ? 'badge-yellow' : 'badge-green'}`}>{d.due ? 'Due' : 'Up to date'}</span></span>
              </li>
            ))}
          </ul>
          {status.length > 0 && (
            <div className="archive-run">
              <Select value={device?.id || ''} onChange={(e) => setForm({ ...form, device: e.target.value })} aria-label="Device">
                {settings.devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="What to back up">
                <option value="new">New and changed since the last backup to it</option>
                <option value="all">Everything in the archive</option>
              </Select>
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !batch.length} onClick={run}>{busy || `Back up ${batch.length} document${batch.length === 1 ? '' : 's'}`}</button>
            </div>
          )}
          {status.length > 0 && <p className="help">Due every {settings.everyDays} day{settings.everyDays === 1 ? '' : 's'} for each device.</p>}
          {msg && <div className={`alert small ${msg.ok ? 'alert-ok' : ''}`}>{msg.text}</div>}
          {backups.length > 0 && (
            <details className="archive-log">
              <summary className="small">Backup log ({backups.length})</summary>
              <ul className="receipts">
                {backups.slice(0, 50).map((b) => (
                  <li key={b.id} className="small"><span>{when(b.at)} · {b.deviceName}</span>
                    <span>{b.kind === 'all' ? 'Everything' : 'New and changed'}: {b.count} document(s), {b.files} file(s){b.failed ? `, ${b.failed} not added` : ''} · {b.byName}</span></li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Devices({ settings, onSaved, onCancel }) {
  const [devices, setDevices] = useState(settings.devices.length ? settings.devices : [{ id: `d${Date.now().toString(36)}`, name: '', note: '' }]);
  const [everyDays, setEveryDays] = useState(settings.everyDays);
  const [error, setError] = useState('');
  const set = (i, patch) => setDevices(devices.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const save = async () => {
    const clean = devices.map((d) => ({ ...d, name: d.name.trim(), note: (d.note || '').trim() })).filter((d) => d.name);
    try { await saveArchiveSettings({ devices: clean, everyDays }); onSaved({ ...settings, devices: clean, everyDays: Number(everyDays) || 7 }); } catch (e) { setError(e.message); }
  };
  return (
    <div className="devices-editor">
      <div className="field-label">Devices</div>
      <div className="help">Where the backups are kept: a computer, external drive, flash drive or network storage. Removing one keeps its past backups in the log.</div>
      <div className="device-rows">
        <div className="device-row device-row-head small muted"><span>Name</span><span>Where it is kept</span><span /></div>
        {devices.map((d, i) => (
          <div key={d.id} className="device-row">
            <input aria-label="Device name" placeholder="Name" value={d.name} onChange={(e) => set(i, { name: e.target.value })} />
            <input aria-label="Where it is kept" placeholder="Optional" value={d.note || ''} onChange={(e) => set(i, { note: e.target.value })} />
            <button type="button" className="btn-icon" title="Remove this device" onClick={() => setDevices(devices.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDevices([...devices, { id: `d${Date.now().toString(36)}`, name: '', note: '' }])}>+ Add device</button>
      <div className="every-days">
        <label htmlFor="ar-every" className="field-label">Back up every</label>
        <input id="ar-every" type="number" min={1} max={90} value={everyDays} onChange={(e) => setEveryDays(e.target.value)} />
        <span className="small">days</span>
      </div>
      <div className="help">A device not backed up for this long shows as Due, here and on the Dashboard.</div>
      {error && <div className="alert small">{error}</div>}
      <div className="row gap devices-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
