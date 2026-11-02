import nodemailer from 'nodemailer';

// Sends DMS notices by email from the mailbox set in Netlify (SMTP_USER, SMTP_PASS; optional
// SMTP_HOST, SMTP_PORT, EMAIL_FROM). Used by functions/email.mjs and functions/work-reminders.mjs.
export const mailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LABEL = { document: 'Your document', circular: 'Circular', community: 'Community', work: 'Work item', mention: 'Mention', reminder: 'Reminder' };

// groups: [{ text, link, kind, fromName, to: [emails] }] — one email per group (one recipient: To;
// several: Bcc in groups of 50, so nobody sees the others' addresses). Returns how many were sent.
export async function sendGroups(groups) {
  if (!mailConfigured() || !groups.length) return 0;
  const port = Number(process.env.SMTP_PORT || 465);
  const mail = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const from = process.env.EMAIL_FROM || `DMS <${process.env.SMTP_USER}>`;
  const site = (process.env.URL || '').replace(/\/$/, '');
  let sent = 0;
  for (const g of groups) {
    const url = site && g.link.startsWith('/') ? `${site}${g.link}` : '';
    const subject = `DMS · ${LABEL[g.kind] || 'Update'}: ${g.text.slice(0, 90)}${g.text.length > 90 ? '…' : ''}`;
    const text = `${g.text}\n\n${g.fromName ? `From ${g.fromName}\n` : ''}${url ? `Open it in DMS: ${url}\n` : ''}\nDocument Management System, Municipal Government of Candoni`;
    const html = `<p style="font:15px/1.5 Arial,sans-serif">${escape(g.text)}</p>
      ${g.fromName ? `<p style="font:13px Arial,sans-serif;color:#555">From ${escape(g.fromName)}</p>` : ''}
      ${url ? `<p><a href="${escape(url)}" style="font:14px Arial,sans-serif;background:#2f5f7a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open in DMS</a></p>` : ''}
      <p style="font:12px Arial,sans-serif;color:#888">Document Management System, Municipal Government of Candoni</p>`;
    const lists = g.to.length === 1 ? [g.to] : Array.from({ length: Math.ceil(g.to.length / 50) }, (_, i) => g.to.slice(i * 50, i * 50 + 50));
    for (const list of lists) {
      try {
        await mail.sendMail(list.length === 1 ? { from, to: list[0], subject, text, html } : { from, to: from, bcc: list, subject, text, html });
        sent += list.length;
      } catch (e) {
        console.error('email failed', e.message);
      }
    }
  }
  return sent;
}
