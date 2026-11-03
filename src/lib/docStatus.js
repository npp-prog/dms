// The stage a document is at, as shown everywhere (lists, its page): worked out from what is stored
// (status, PDF, route), never stored itself.
//   Draft           being prepared (not converted to PDF yet)
//   For Processing  converted to PDF (or uploaded), on its way along its route
//   Returned        sent back by an office (until it is released again)
//   On Hold         an office holding it put it on hold: it does not move on until released
//   For Signature   a signature request is open (documents outside any route)
//   Complete        its route is done (it is in the Archive), or its main document's is
//   Cancelled
import { isArchived } from './archiveFiles.js';

export const DOC_STAGES = {
  draft: { label: 'Draft', className: 'badge-gray' },
  processing: { label: 'For Processing', className: 'badge-blue' },
  returned: { label: 'Returned', className: 'badge-yellow' },
  signing: { label: 'For Signature', className: 'badge-blue' },
  hold: { label: 'On Hold', className: 'badge-red' },
  complete: { label: 'Complete', className: 'badge-green' },
  cancelled: { label: 'Cancelled', className: 'badge-gray' },
};

export function docStage(d) {
  if (!d) return 'draft';
  const wf = d.workflow;
  if (d.status === 'cancelled' || wf?.state === 'cancelled') return 'cancelled';
  if (isArchived(d)) return 'complete';
  // A signature request (documents outside any route): for signature, then complete; declined
  // goes back to the preparer.
  const sr = d.signRequest;
  if (!wf && sr?.state === 'open') return 'signing';
  if (!wf && sr?.state === 'declined') return 'returned';
  if (!wf && sr?.state === 'done') return 'complete';
  if (wf?.state === 'in-progress' && wf.hold) return 'hold';
  // Returned: the route's last move was a return (holding, resuming or referring it does not change that).
  if (wf?.state === 'in-progress' && [...(wf.events || [])].reverse().find((e) => ['released', 'returned', 'started'].includes(e.type))?.type === 'returned') return 'returned';
  if ((d.pdf?.files || []).length > 0 || wf?.state === 'in-progress') return 'processing';
  return 'draft';
}
export const docStageOf = (d) => DOC_STAGES[docStage(d)];
