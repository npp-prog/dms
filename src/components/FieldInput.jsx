import { useState } from 'react';
import { computeRow, toCaps } from '../lib/forms.js';
import { formatCurrency, sumColumn } from '../lib/template.js';
import Select from './Select.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fundsOf } from '../lib/defaults.js';
import PersonPicker from './PersonPicker.jsx';
import { dmsNoKey, isAccountNo, personValue, positionsKey, positionsOf } from '../lib/accountNo.js';
import { dateRangeValue, dayCount, fromKey, toKey } from '../lib/dateRange.js';

// One day, or several days, chosen on the calendar (lib/dateRange.js): the form prints them as
// "November 10, 2026" or "November 10-12, 2026".
function DateRangeField({ id, value, from, to, disabled, onPick }) {
  const [several, setSeveral] = useState(Boolean(to));
  const n = dayCount(from, to);
  return (
    <div className="date-range" id={id}>
      <div className="date-range-row">
        <label className="date-range-part"><span className="xs muted">{several ? 'From' : 'Date'}</span>
          <input type="date" value={from || ''} disabled={disabled}
            onChange={(e) => onPick(e.target.value, several && to > e.target.value ? to : '')} /></label>
        {several && (
          <label className="date-range-part"><span className="xs muted">To</span>
            <input type="date" value={to || ''} min={from || undefined} disabled={disabled || !from}
              onChange={(e) => onPick(from, e.target.value)} /></label>
        )}
      </div>
      <label className="check"><input type="checkbox" checked={several} disabled={disabled}
        onChange={(e) => { setSeveral(e.target.checked); if (!e.target.checked) onPick(from, ''); }} /> More than one day</label>
      {value && from && <span className="xs muted">Prints as: <b>{value}</b>{n > 1 ? ` (${n} days)` : ''}</span>}
      {value && !from && <span className="xs warn-text">Written before: {value}. Choose the date or dates on the calendar.</span>}
    </div>
  );
}

// A person field (or table column): chosen from DMS, so that the document records the person's
// DMS account number with their name (lib/accountNo.js). A name typed before (an older document)
// shows until someone is chosen.
function PersonField({ id, name, dmsNo, disabled, onPick }) {
  if (isAccountNo(dmsNo)) {
    return (
      <div className="person-chosen person-field" id={id}>
        <span className="grow"><b>{name}</b><span className="small muted">DMS No. {dmsNo}</span></span>
        {!disabled && <button type="button" className="link small" onClick={() => onPick(null)}>Change</button>}
      </div>
    );
  }
  if (disabled) return <div className="person-chosen person-field" id={id}><span className="grow"><b>{name || '—'}</b></span></div>;
  return (
    <div className="person-field" id={id}>
      {name && <div className="xs warn-text">{name}: choose this person from DMS to record their DMS account no.</div>}
      <PersonPicker value={null} external onChange={(p) => p && onPick(p)} placeholder="Type a name, email or DMS no.…" />
    </div>
  );
}

// The Position of a person chosen from DMS: from their DMS profile. One position: shown as it is;
// several: a dropdown of the positions they hold; none in their profile: typed. list: their
// positions, or null when no person is chosen yet.
function PositionField({ id, value, list, disabled, keepCase, onChange }) {
  if (list && list.length > 1) {
    const options = value && !list.includes(value) ? [...list, value] : list;
    return (
      <Select id={id} value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  }
  if (list && list.length === 1) return <input id={id} value={value || list[0]} readOnly className="computed" title="From their DMS profile" />;
  return (
    <input id={id} value={value ?? ''} disabled={disabled || list === null} className={keepCase ? '' : 'caps'}
      title={list === null ? 'Choose the person first' : 'No position in their DMS profile: type it'}
      onChange={(e) => onChange(keepCase ? e.target.value : toCaps(e.target.value))} />
  );
}

// The value to store for a chosen person: the name (in capitals unless printed as typed), their
// DMS account no. and user.
const pick = (key, p, keepCase) => {
  const v = personValue(key, p);
  return keepCase ? v : { ...v, [key]: toCaps(v[key]) };
};

function inputType(type) {
  if (type === 'number' || type === 'currency') return 'number';
  if (type === 'date') return 'date';
  return 'text';
}

function TableInput({ field, value, onChange, disabled }) {
  const rows = Array.isArray(value) ? value : [];
  const columns = field.columns || [];
  const personCol = columns.find((c) => c.type === 'person');
  const blank = () => Object.fromEntries(columns.map((c) => [c.key, '']));
  const setRow = (i, key, v) => {
    const next = rows.map((r, idx) => (idx === i ? computeRow(columns, { ...r, [key]: v }) : r));
    onChange(next);
  };
  return (
    <div className="table-input">
      <table>
        <thead>
          <tr>
            <th style={{ width: 32 }}>#</th>
            {columns.map((c) => <th key={c.key} style={c.type === 'textarea' || c.type === 'person' ? { minWidth: 260 } : undefined}>{c.label}</th>)}
            {!disabled && <th style={{ width: 40 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="muted">{i + 1}</td>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.type === 'person' ? (
                    <PersonField name={row[c.key] ?? ''} dmsNo={row[dmsNoKey(c.key)]} disabled={disabled}
                      onPick={(p) => onChange(rows.map((r, idx) => (idx === i ? computeRow(columns, {
                        ...r, ...pick(c.key, p, c.keepCase),
                        // The Position column follows their DMS profile (the first of their positions).
                        ...(columns.some((x) => x.key === 'position') ? { position: positionsOf(p)[0] || '' } : {}),
                      }) : r)))} />
                  ) : c.key === 'position' && personCol ? (
                    <PositionField value={row.position} disabled={disabled} keepCase={c.keepCase}
                      list={isAccountNo(row[dmsNoKey(personCol.key)]) ? (Array.isArray(row[positionsKey(personCol.key)]) ? row[positionsKey(personCol.key)] : []) : null}
                      onChange={(v) => setRow(i, 'position', v)} />
                  ) : c.type === 'textarea' ? (
                    <textarea rows={3} value={row[c.key] ?? ''} disabled={disabled} className={c.keepCase ? '' : 'caps'}
                      onChange={(e) => setRow(i, c.key, c.keepCase ? e.target.value : toCaps(e.target.value))} />
                  ) : (
                    <input
                      type={inputType(c.type)}
                      step={c.type === 'currency' ? '0.01' : undefined}
                      value={row[c.key] ?? ''}
                      readOnly={Boolean(c.compute)}
                      disabled={disabled}
                      className={c.compute ? 'computed' : c.keepCase ? '' : 'caps'}
                      onChange={(e) => setRow(i, c.key, inputType(c.type) === 'text' && !c.keepCase ? toCaps(e.target.value) : e.target.value)}
                    />
                  )}
                </td>
              ))}
              {!disabled && (
                <td>
                  <button type="button" className="btn-icon" title="Remove row"
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>×</button>
                </td>
              )}
            </tr>
          ))}
          {columns.some((c) => c.total) && rows.length > 0 && (
            <tr className="total-row">
              <td />
              {columns.map((c, idx) => (
                <td key={c.key} className="num">
                  {c.total ? formatCurrency(sumColumn(rows, c.key)) : idx === 0 ? 'TOTAL' : ''}
                </td>
              ))}
              {!disabled && <td />}
            </tr>
          )}
        </tbody>
      </table>
      {!disabled && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rows, blank()])}>
          + Add row
        </button>
      )}
    </div>
  );
}

// onPatch(values, person): a person field sets several keys at once (the name, DMS no. and user).
// positions: for a Position field that follows a person field of the form, the person's positions
// (null: no person chosen yet; undefined: an ordinary field).
export default function FieldInput({ field, value, onChange, onPatch, data = {}, positions, disabled, invalid }) {
  const { settings } = useAuth();
  const funds = fundsOf(settings);
  const label = (
    <label className="field-label" htmlFor={`f-${field.key}`}>
      {field.label} {field.required && <span className="req">*</span>}
    </label>
  );
  let control;
  if (field.type === 'table') {
    control = <TableInput field={field} value={value} onChange={onChange} disabled={disabled} />;
  } else if (positions !== undefined) {
    control = <PositionField id={`f-${field.key}`} value={value} list={positions} disabled={disabled} keepCase={field.keepCase} onChange={onChange} />;
  } else if (field.type === 'person') {
    control = <PersonField id={`f-${field.key}`} name={value ?? ''} dmsNo={data[dmsNoKey(field.key)]} disabled={disabled}
      onPick={(p) => (onPatch ? onPatch(pick(field.key, p, field.keepCase), p) : onChange(pick(field.key, p, field.keepCase)[field.key]))} />;
  } else if (field.type === 'daterange') {
    control = <DateRangeField id={`f-${field.key}`} value={value ?? ''} from={data[fromKey(field.key)]} to={data[toKey(field.key)]} disabled={disabled}
      onPick={(from, to) => (onPatch ? onPatch(dateRangeValue(field.key, from, to)) : onChange(dateRangeValue(field.key, from, to)[field.key]))} />;
  } else if (field.type === 'textarea') {
    control = <textarea id={`f-${field.key}`} rows={3} value={value ?? ''} disabled={disabled} className={field.keepCase ? '' : 'caps'}
      onChange={(e) => onChange(field.keepCase ? e.target.value : toCaps(e.target.value))} />;
  } else if (field.type === 'select') {
    // The Fund field lists the LGU's funds (Settings), not the ones saved in the format; a field
    // listing offices (optionsFrom: 'offices') the offices in Settings. A value chosen earlier stays listed.
    const listed = field.key === 'fund' ? funds : field.optionsFrom === 'offices' ? (settings?.offices || []) : (field.options || []);
    const options = value && !listed.includes(value) ? [...listed, value] : listed;
    control = (
      <Select id={`f-${field.key}`} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{field.optionLabels?.[o] || o}</option>)}
      </Select>
    );
  } else {
    control = <input id={`f-${field.key}`} type={inputType(field.type)} value={value ?? ''} disabled={disabled}
      readOnly={Boolean(field.compute)} className={field.compute ? 'computed' : field.keepCase ? '' : 'caps'}
      step={field.type === 'currency' ? '0.01' : undefined}
      onChange={(e) => onChange(inputType(field.type) === 'text' && !field.keepCase ? toCaps(e.target.value) : e.target.value)} />;
  }
  return (
    <div className={`field ${field.type === 'table' || field.type === 'textarea' ? 'field-wide' : ''} ${invalid ? 'invalid' : ''}`}>
      {label}
      {control}
      {field.help && <div className="help">{field.help}</div>}
    </div>
  );
}
