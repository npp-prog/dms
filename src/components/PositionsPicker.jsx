import Select from './Select.jsx';

const NEW = '@new';

// Chosen positions as chips (× removes one) and a dropdown to add another. With onNew, the dropdown
// also offers "+ New position…", which asks for the name and adds it to the list (Settings).
export default function PositionsPicker({ value = [], onChange, choices = [], onNew, placeholder = '+ Add a position…', disabled }) {
  const left = choices.filter((p) => !value.includes(p));
  const add = async (v) => {
    if (v === '-') return;
    if (v !== NEW) { onChange([...value, v]); return; }
    const name = window.prompt('Name of the new position:')?.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const known = choices.find((p) => p.toLowerCase() === name.toLowerCase());
    if (!known) {
      try { await onNew(name); } catch (e) { window.alert(e.message); return; }
    }
    if (!value.includes(known || name)) onChange([...value, known || name]);
  };
  return (
    <div className="row gap wrap positions-picker">
      {value.map((p) => (
        <span key={p} className="alt-chip">{p}
          {!disabled && <button type="button" title="Remove" onClick={() => onChange(value.filter((x) => x !== p))}>×</button>}</span>
      ))}
      {!disabled && (
        <Select value="" aria-label="Add a position" placeholder={placeholder} onChange={(e) => add(e.target.value)}>
          <option value="-">{placeholder}</option>
          {left.map((p) => <option key={p} value={p}>{p}</option>)}
          {onNew && <option value={NEW}>+ New position…</option>}
        </Select>
      )}
    </div>
  );
}
