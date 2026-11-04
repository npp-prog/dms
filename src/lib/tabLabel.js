// The labels of a document's tabs (PDF, its supporting documents, the checklist…): at most 10
// characters, spaces included. A longer one becomes "03 TO" (the number, then the initials of the
// words: "03 Travel Order"), or is cut with "…". The full name stays in the tab's tooltip.
export const TAB_MAX = 10;
const SMALL = new Set(['of', 'and', 'the', 'for', 'to', 'a', 'an', 'in', 'on', '&', '-']);

export function tabLabel(text, max = TAB_MAX) {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  const m = s.match(/^(\d{1,3}) (.+)$/);
  if (m) {
    const words = m[2].split(' ').filter((w) => !SMALL.has(w.toLowerCase()));
    if (words.length > 1) {
      const short = `${m[1]} ${words.map((w) => w[0]).join('').toUpperCase()}`;
      if (short.length <= max) return short;
    }
  }
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
