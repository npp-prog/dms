// A date, or a range of days, chosen on the calendar (field type 'daterange'): stored as the text
// the form prints under the field's key ("November 10, 2026", "November 10-12, 2026",
// "November 30 - December 2, 2026"), with the days chosen under `${key}From` and `${key}To`
// (YYYY-MM-DD; To empty for one day).
export const fromKey = (key) => `${key}From`;
export const toKey = (key) => `${key}To`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};

export function formatDateRange(from, to = '') {
  const a = parts(from);
  if (!a) return '';
  const b = parts(to);
  const one = `${MONTHS[a.m]} ${a.d}, ${a.y}`;
  if (!b || to <= from) return one;
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m]} ${a.d}-${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m]} ${a.d} - ${MONTHS[b.m]} ${b.d}, ${a.y}`;
  return `${one} - ${MONTHS[b.m]} ${b.d}, ${b.y}`;
}

// The values to store for a choice of days.
export function dateRangeValue(key, from, to = '') {
  const end = to && from && to > from ? to : '';
  return { [key]: formatDateRange(from, end), [fromKey(key)]: from || '', [toKey(key)]: end };
}

// How many days (1 for one day).
export const dayCount = (from, to) => {
  if (!parts(from)) return 0;
  if (!parts(to) || to <= from) return 1;
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;
};
