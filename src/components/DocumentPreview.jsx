import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { renderTemplate } from '../lib/template.js';
import { capsFor } from '../lib/forms.js';
import { signatoriesFrom } from '../lib/signatories.js';
import PrintPage from './PrintPage.jsx';
import { officeLetterhead } from '../lib/letterhead.js';

// Renders a document type's template with data. Output is sanitized because
// templates are authored in-app by admins.
// office: the office the document is from (its letterhead: Settings > Office letterheads).
export default function DocumentPreview({ type, data = {}, checklist = {}, controlNo = '', preparedBy = '', preparedByPosition = '', preparedByIdNo = '', settings = {}, signatories, office = '' }) {
  const html = useMemo(() => DOMPurify.sanitize(renderTemplate(type?.template, {
    data: capsFor(type?.fields, data),
    caps: true,
    checklist,
    controlNo,
    preparedBy,
    preparedByPosition,
    preparedByIdNo,
    fields: type?.fields,
    signatories: signatories || signatoriesFrom(settings),
    docType: { code: type?.code, name: type?.name },
    office: officeLetterhead(settings, type, office, data),
    lgu: {
      name: settings.lguName || 'Municipal Government of Candoni',
      address: settings.lguAddress || '',
      province: settings.province || '',
      seal: settings.sealUrl || '/municipal-seal.png',
    },
  })), [type, data, checklist, controlNo, preparedBy, preparedByPosition, preparedByIdNo, settings, signatories, office]);

  return (
    <PrintPage paperSize={type?.paperSize} orientation={type?.orientation}>
      <div className="doc-render" dangerouslySetInnerHTML={{ __html: html }} />
    </PrintPage>
  );
}
