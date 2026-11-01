import { useEffect, useState } from 'react';
import { newVersionOut } from '../lib/freshness.js';

// "DMS was updated": shown when a new version is deployed while this tab is open (checked when the
// tab comes back into view, and every 15 minutes).
export default function UpdateBar() {
  const [out, setOut] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => { if (document.visibilityState === 'visible') newVersionOut().then((v) => live && v && setOut(true)); };
    const timer = setInterval(check, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { live = false; clearInterval(timer); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, []);
  if (!out) return null;
  return (
    <div className="update-bar no-print" role="status">
      <span>DMS was updated. Reload to use the new version (save what you are typing first).</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}
