import { useEffect, useState } from 'react';
import { getPrivacy } from '../lib/api.js';
import { LandingBar } from './Login.jsx';

// The privacy notice (Data Privacy Act of 2012, RA 10173): what DMS keeps, why, who sees it, how
// long, and how to reach the Data Protection Officer. Open to anyone, signed in or not.
export default function Privacy({ standalone = false }) {
  const [dpo, setDpo] = useState(null);
  useEffect(() => { getPrivacy().then(setDpo).catch(() => setDpo({})); }, []);
  const body = (
    <article className="privacy">
      <h1>Privacy notice</h1>
      <p>The Municipal Government of Candoni uses DMS, its Document Management System, to prepare, sign, route and keep its official
        documents. It processes personal information under the Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules
        and the issuances of the National Privacy Commission.</p>

      <h2>What DMS keeps</h2>
      <ul>
        <li><b>Your account:</b> name, email address, office, position and role; when you sign in (handled by Google Firebase Authentication).</li>
        <li><b>Documents and their files:</b> what the official forms ask for, such as names of payees, suppliers and employees, addresses,
          TIN, amounts, bank or check details, and the attached supporting documents.</li>
        <li><b>Signatures:</b> the signatures on the PDFs, with the name and certificate details of each signatory. Your PNPKI certificate
          file and signature mark are stored for you alone; your certificate password is never stored by DMS.</li>
        <li><b>Records of actions:</b> who routed, returned, signed, numbered or processed a document, when, and their remarks.</li>
        <li><b>Messages, communities and notes:</b> what you write there, and the files you share.</li>
      </ul>

      <h2>Why</h2>
      <p>To carry out the municipality's functions and its obligations under the law: processing disbursements, procurement, travel and
        other transactions, keeping public records, and accounting for them to the Commission on Audit and other oversight bodies
        (RA 10173, Sections 12 (c) and (e), and 13 (b) and (f)). Personal information is not used for anything else, nor sold or shared
        for marketing.</p>

      <h2>Who sees it</h2>
      <ul>
        <li>Each person sees only what their work needs: the documents they prepared, the documents waiting in their office, and those
          their office head gave them access to. Office heads see their office's documents; administrators and the Records Officer
          keep all the records.</li>
        <li>Third parties (suppliers, payees) see only the documents sent to them for signature.</li>
        <li>Messages are read only by the two people in the conversation; a community's messages only by its members; your notes only by you.</li>
        <li>The QR code on a document's PDF opens its public page, for anyone holding the document to check that it is genuine: its type,
          number, payee or subject, office, route and signatories, and its current PDF. Earlier versions stay private.</li>
      </ul>

      <h2>Service providers</h2>
      <p>DMS runs on Google Firebase (accounts, database and files) and Netlify (the website), which store the data on our behalf under their
        data processing terms. Processed documents are backed up to the municipality's Google Drive accounts. Questions typed into Ask DMS
        are sent to Anthropic's AI service to answer them; it does not see documents, so do not type personal information there.
        Notifications may be sent by email.</p>

      <h2>How long</h2>
      <p>Documents are public records, kept for as long as the law and the National Archives of the Philippines' records disposition
        schedules require, then disposed of as those schedules allow. Accounts of people who leave are deactivated; their actions stay
        in the records.</p>

      <h2>How it is protected</h2>
      <p>Access is checked on Google's servers for every read and write; data travels encrypted and is stored encrypted. Every action is
        recorded and cannot be changed afterwards; PDF versions are never overwritten; signatures can be verified. Accounts are approved
        by an administrator, and an idle session signs out by itself.</p>

      <h2>Your rights</h2>
      <p>You may ask to be informed about, to access, and to correct the personal information about you, to object to its processing, and to
        have it erased or blocked where it is not needed for a public record or a legal obligation; you may also file a complaint with the
        National Privacy Commission (privacy.gov.ph). You can correct your own name in My Profile.</p>

      <h2>Contact</h2>
      {dpo === null ? <p className="muted">…</p> : dpo.dpoName || dpo.dpoEmail || dpo.dpoPhone ? (
        <p>Data Protection Officer, Municipal Government of Candoni: <b>{dpo.dpoName}</b>
          {dpo.dpoEmail && <> · <a href={`mailto:${dpo.dpoEmail}`}>{dpo.dpoEmail}</a></>}
          {dpo.dpoPhone && <> · {dpo.dpoPhone}</>}</p>
      ) : <p>Data Protection Officer, Municipal Government of Candoni (Municipal Building, Rizal St., Candoni, Negros Occidental).</p>}
    </article>
  );
  if (!standalone) return <div className="page">{body}</div>;
  return (
    <div className="landing">
      <LandingBar><a className="landing-link" href="/">Sign in</a></LandingBar>
      <div className="privacy-standalone">{body}</div>
    </div>
  );
}
