import { DOC_STAGES, docStageOf } from '../lib/docStatus.js';

// The document's stage (lib/docStatus.js): Draft, For Processing, Returned, On Hold, Complete.
// doc: the document; or stage alone (a key of DOC_STAGES).
export default function StatusBadge({ status, doc }) {
  const s = doc ? docStageOf(doc) : DOC_STAGES[status] || { label: status, className: 'badge-gray' };
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}
