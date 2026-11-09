import { useEffect, useRef, useState } from 'react';
import { watchNotifications } from './social.js';

// A number that goes up when the lists may have changed for this user: a new notification arrives
// (a document routed to them, forwarded, sent for their signature, signed…), or they come back to the
// tab after a while. Pages put it in their loading effect, so they reload by themselves.
export function useLiveRefresh(uid) {
  const [tick, setTick] = useState(0);
  const newest = useRef(null);
  useEffect(() => {
    if (!uid) return undefined;
    // (At most one reload every 15 seconds: a burst of notifications, e.g. a circular to many
    // offices, reloads the page once, not once each.)
    let last = 0;
    let timer = null;
    const bump = () => {
      const wait = 15000 - (Date.now() - last);
      if (wait <= 0) { last = Date.now(); setTick((t) => t + 1); return; }
      if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); setTick((t) => t + 1); }, wait);
    };
    const stop = watchNotifications(uid, (list) => {
      const top = list[0]?.id || '';
      if (newest.current !== null && top !== newest.current) bump();
      newest.current = top;
    }, () => {});
    let hidden = 0;
    const onVisible = () => {
      if (document.hidden) { hidden = Date.now(); return; }
      if (hidden && Date.now() - hidden > 30000) bump();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [uid]);
  return tick;
}
