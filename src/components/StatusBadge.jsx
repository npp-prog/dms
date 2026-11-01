import { STATUSES } from '../lib/defaults.js';
import { isArchived } from '../lib/archiveFiles.js';

// doc: the document (Processed once its route is done); or status alone.
export default function StatusBadge({ status, doc }) {
  const key = doc ? (doc.status !== 'cancelled' && isArchived(doc) ? 'processed' : doc.status) : status;
  const s = STATUSES[key] || { label: key, className: 'badge-gray' };
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}
