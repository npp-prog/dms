import { useEffect, useState } from 'react';
import { listDirectory } from '../lib/api.js';
import { Avatar } from './Icon.jsx';

// Choose an active DMS user by name or email (from the directory of active users).
// external: suppliers and payees are listed too (to refer a document to them); elsewhere (messages,
// communities, review) only LGU personnel. office: only the people of that office.
export default function PersonPicker({ value, onChange, exclude = [], external = false, office = '', placeholder = 'Type a name or email…' }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { listDirectory().then(setPeople).catch((e) => setError(e.message)); }, []);

  if (value) {
    return (
      <div className="person-chosen">
        <Avatar name={value.displayName || value.email} photo={value.photo} size="sm" />
        <span className="grow"><b>{value.displayName || value.email}</b>
          <span className="small muted">{[value.accountNo && `DMS No. ${value.accountNo}`, value.position, value.email, value.office].filter(Boolean).join(' · ')}</span></span>
        <button type="button" className="link small" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length
    ? (people || []).filter((p) => !exclude.includes(p.uid) && (external || !p.external) && (!office || p.office === office)
      && words.every((w) => `${p.displayName} ${p.email || ''} ${p.office} ${p.position || ''} ${p.idNo || ''} ${p.accountNo || ''}`.toLowerCase().includes(w))).slice(0, 8)
    : [];
  return (
    <div className="person-picker">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={people ? placeholder : 'Loading…'} disabled={!people} />
      {error && <div className="alert small">{error}</div>}
      {words.length > 0 && people && (
        <ul>
          {matches.length === 0 && <li className="small muted none">No active user matches.</li>}
          {matches.map((p) => (
            <li key={p.uid}>
              <button type="button" onClick={() => { onChange(p); setQ(''); }}>
                <Avatar name={p.displayName || p.email} photo={p.photo} size="sm" />
                <span className="person-t"><b>{p.displayName || p.email}</b>
                  <span className="small muted">{[p.accountNo && `DMS No. ${p.accountNo}`, p.position, p.email, p.external ? 'Third Party' : p.office].filter(Boolean).join(' · ')}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
