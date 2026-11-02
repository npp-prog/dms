import Select from './Select.jsx';

// An input for one of a board's own columns (work item panel). value: as stored in item.fields.
export default function WorkFieldInput({ column: c, value, onChange, disabled, people = [], offices = [] }) {
  const v = value ?? '';
  if (c.type === 'checkbox') {
    return <label className="check field wk-field-check"><input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /> {c.label}</label>;
  }
  let input;
  if (c.type === 'dropdown') {
    input = (
      <Select value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(c.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  } else if (c.type === 'person') {
    input = (
      <Select value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {people.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
        {v && !people.some((p) => p.uid === v) && <option value={v}>Someone no longer on the board</option>}
      </Select>
    );
  } else if (c.type === 'office') {
    input = (
      <Select value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {offices.map((o) => <option key={o} value={o}>{o}</option>)}
        {v && !offices.includes(v) && <option value={v}>{v}</option>}
      </Select>
    );
  } else if (c.type === 'date') {
    input = <input type="date" value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  } else if (c.type === 'number' || c.type === 'currency') {
    input = <input type="number" step={c.type === 'currency' ? '0.01' : 'any'} inputMode="decimal" value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  } else {
    input = <input value={v} maxLength={500} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  return <label className="field"><span className="field-label">{c.label}{c.type === 'currency' ? ' (₱)' : ''}</span>{input}</label>;
}
