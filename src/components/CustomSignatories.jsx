import PersonPicker from './PersonPicker.jsx';
import { CUSTOM_SIGNATORY_LIMIT } from '../lib/signatories.js';

// The signatories of a document whose type has no standard ones: who signs, as what. Each row: as
// what they sign, their name and position; choosing a person fills in their name and position.
export default function CustomSignatories({ value = [], onChange }) {
  const set = (i, patch) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div>
      {value.length > 0 && (
        <div className="custom-sigs">
          {value.map((s, i) => (
            <div key={i} className="custom-sig">
              <input value={s.label} maxLength={60} aria-label={`Signatory ${i + 1}: signs as`} placeholder="Signs as" onChange={(e) => set(i, { label: e.target.value })} />
              <input value={s.name} maxLength={80} aria-label={`Signatory ${i + 1}: name`} placeholder="Name" onChange={(e) => set(i, { name: e.target.value })} />
              <input value={s.position} maxLength={80} aria-label={`Signatory ${i + 1}: position`} placeholder="Position" onChange={(e) => set(i, { position: e.target.value })} />
              <button type="button" className="btn-icon" title="Remove" aria-label={`Remove signatory ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
      {value.length < CUSTOM_SIGNATORY_LIMIT && (
        <div className="row gap wrap">
          <PersonPicker value={null} placeholder="Add a person: type a name or email…"
            onChange={(p) => p && onChange([...value, { label: '', name: p.displayName || p.email || '', position: p.position || '' }])} />
          <button type="button" className="link small" onClick={() => onChange([...value, { label: '', name: '', position: '' }])}>+ Add someone not in DMS</button>
        </div>
      )}
      <p className="xs muted">They print at the end of the document, in this order, each with a line to sign on. &ldquo;Signs as&rdquo; is what is written above them (Prepared by, Noted by, Approved by…); leave it blank to print none.</p>
    </div>
  );
}
