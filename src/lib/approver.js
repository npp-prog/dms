// Who approves a document whose format prints the Mayor (an Approved by box, {{sig.mayor}}): the
// Municipal Mayor or, in their place, the Municipal Vice Mayor. The preparer chooses (the
// "approver" field, as on the DV); the form then prints the Vice Mayor's name and position.
export const APPROVERS = ['Municipal Mayor', 'Municipal Vice Mayor'];

export const viceApproves = (data) => /vice/i.test(String(data?.approver || ''));

// A format that prints the Mayor and has no approver field of its own gets one, in its last step.
export function withApprover(type) {
  if (!type || !String(type.template || '').includes('sig.mayor') || (type.fields || []).some((f) => f.key === 'approver')) return type;
  const steps = type.steps || [];
  return {
    ...type,
    fields: [...(type.fields || []), {
      key: 'approver', label: 'Approved by', type: 'select', options: APPROVERS, default: APPROVERS[0], required: true,
      ...(steps.length ? { step: steps[steps.length - 1].id } : {}),
      help: 'The Vice Mayor approves in place of the Mayor: the form then prints the Vice Mayor\'s name and position.',
    }],
  };
}

// The signatories as the form prints them: the Vice Mayor in the Mayor's place when chosen.
export function approverSignatories(sig = {}, data = {}) {
  return viceApproves(data) ? { ...sig, mayor: sig.viceMayor || '', mayorPosition: sig.viceMayorPosition || 'Municipal Vice Mayor' } : sig;
}

// A format issued by the Mayor's office (documentType.headerOffice, e.g. the Travel Order) follows
// its signatory: Executive (the Mayor) or Legislative (the Vice Mayor). Legislative: the Vice
// Mayor's letterhead, and the Vice Mayor's office handles the Mayor's steps of its route and
// assigns its number (its own series).
export const APPROVER_LABELS = { 'Municipal Mayor': 'Executive (Municipal Mayor)', 'Municipal Vice Mayor': 'Legislative (Municipal Vice Mayor)' };
export const isMayorOffice = (o) => /mayor/i.test(String(o || '')) && !/vice/i.test(String(o || ''));
export const issuedByMayor = (type) => isMayorOffice(type?.headerOffice);
// The Vice Mayor's office as listed in Settings (or its usual name).
export const viceMayorOffice = (offices = []) => (offices || []).find((o) => /vice mayor/i.test(o)) || 'Office of the Municipal Vice Mayor';
