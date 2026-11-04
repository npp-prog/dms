import { resolveOffice } from './workflow.js';
import { issuedByMayor, viceApproves, viceMayorOffice } from './approver.js';

// The letterhead of the office a document is from (Settings > Office letterheads): the title
// printed under the LGU (e.g. the Office of the Mayor's), its email address and contact number.
// A format may name its issuing office (documentType.headerOffice, e.g. the Travel Order is the
// Mayor's); otherwise it is the office of the document. Templates: {{office.letterhead}},
// {{office.email}}, {{office.contact}}, {{office.name}}.
// data: the document's details: a format issued by the Mayor's office whose signatory is the Vice
// Mayor (Legislative) prints the Vice Mayor's office letterhead.
export function officeLetterhead(settings = {}, type = {}, office = '', data = {}) {
  const name = type?.headerOffice
    ? (issuedByMayor(type) && viceApproves(data) ? viceMayorOffice(settings.offices) : resolveOffice(type.headerOffice, settings.offices || []))
    : office || '';
  const c = settings.officeContacts?.[name] || {};
  return { name, letterhead: c.letterhead || name, email: c.email || '', contact: c.contact || '' };
}
