import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

// The sign-in page's demo: a sample document going through DMS, a step every 3 seconds, round and
// round. Nothing here is real data.
const STEP_MS = 3000;
const STEPS = [
  { key: 'prepare', label: 'Prepare or upload', icon: 'new', text: 'Fill in the official format step by step, with its checklist of requirements, or upload a file you already have.' },
  { key: 'sign', label: 'Sign', icon: 'sign', text: 'Sign the PDF in DMS with your DICT PNPKI digital signature, or your e-signature mark if you have no PNPKI.' },
  { key: 'route', label: 'Route', icon: 'send', text: 'Route it to the next office on its route. Everyone can see where it is, and the preparer is notified at each step.' },
  { key: 'done', label: 'Processed', icon: 'check', text: 'The last office marks it processed: it is filed in the Archive, in its folder, and backed up to Google Drive.' },
];
const OFFICES = ['Requesting office', 'Budget', 'Accounting', 'Treasury', 'Mayor'];

function Sheet({ step, signed }) {
  return (
    <div className={`demo-sheet step-${step}`}>
      <div className="demo-sheet-head">
        <img src="/municipal-seal.png" alt="" />
        <div><b>DISBURSEMENT VOUCHER</b><span>Municipal Government of Candoni</span></div>
      </div>
      <div className="demo-rows">
        {[['Payee', 'Sample Supplier'], ['Office', 'Municipal Accounting Office'], ['Particulars', 'Office supplies'], ['Amount', '₱ 12,500.00'], ['Fund', 'General Fund'], ['Mode of payment', 'Check'], ['Certified', 'Funds available']].map(([k, v], i) => (
          <div key={k} className="demo-row" style={{ '--i': i }}><span>{k}</span><b>{v}</b></div>
        ))}
      </div>
      <div className="demo-sign">
        <svg viewBox="0 0 200 60" className={signed ? 'drawn' : ''} aria-hidden="true">
          <path d="M8 42 C 22 10, 34 10, 30 38 S 52 48, 60 26 S 74 8, 80 34 S 98 50, 108 30 C 114 20, 122 22, 124 34 S 140 44, 152 28 L 190 24" />
        </svg>
        <span className="demo-sign-line">Signature over printed name</span>
        {signed && <span className="demo-badge"><Icon name="tick" /> DICT PNPKI · verified</span>}
      </div>
      {step === 3 && <div className="demo-stamp">PROCESSED</div>}
    </div>
  );
}

export default function LoginDemo() {
  const [step, setStep] = useState(0);
  const [signed, setSigned] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [step]);
  // On the Sign step it signs itself a moment later.
  useEffect(() => {
    setSigned(step > 1);
    if (step !== 1) return undefined;
    const t = setTimeout(() => setSigned(true), 700);
    return () => clearTimeout(t);
  }, [step]);
  const s = STEPS[step];
  return (
    <section className="demo" aria-label="How DMS works">
      <div className="demo-stage">
        <div className="demo-copy">
          <span className="demo-icon"><Icon name={s.icon} /></span>
          <h3>{s.label}</h3>
          <p>{s.text}</p>
          {step === 0 && <span className="demo-upload"><Icon name="upload" /> Sample.pdf uploaded</span>}
        </div>
        <div className="demo-visual">
          <Sheet key={`${step}`} step={step} signed={signed} />
          {step >= 2 && (
            <ol className={`demo-route${step === 3 ? ' done' : ''}`}>
              {OFFICES.map((o, i) => <li key={o} style={{ '--i': i }}><span />{o}</li>)}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
