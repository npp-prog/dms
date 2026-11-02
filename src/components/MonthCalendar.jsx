import { useState } from 'react';
import { monthGrid } from '../lib/workModel.js';
import { localDay } from '../lib/archiveFiles.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A month of calendar days (Philippine time) with entries on their day: { day: 'YYYY-MM-DD', key,
// label, tone, onOpen }. Used by a board (items by due date) and a project (milestones and items).
export default function MonthCalendar({ entries = [] }) {
  const today = localDay();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const days = monthGrid(ym.y, ym.m);
  const byDay = entries.reduce((acc, e) => { (acc[e.day] = acc[e.day] || []).push(e); return acc; }, {});
  const shift = (n) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const title = new Date(Date.UTC(ym.y, ym.m, 1)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const undated = entries.filter((e) => !e.day).length;
  return (
    <div className="wk-cal">
      <div className="wk-cal-head">
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <b>{title}</b>
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Next month" onClick={() => shift(1)}>›</button>
        <button type="button" className="link small" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}>Today</button>
      </div>
      <div className="wk-cal-grid" role="grid">
        {WEEKDAYS.map((w) => <div key={w} className="wk-cal-wd" role="columnheader">{w}</div>)}
        {days.map(({ day, inMonth }) => (
          <div key={day} role="gridcell" className={`wk-cal-day${inMonth ? '' : ' out'}${day === today ? ' today' : ''}`}>
            <span className="wk-cal-n">{Number(day.slice(8))}</span>
            {(byDay[day] || []).slice(0, 4).map((e) => (
              <button key={e.key} type="button" className={`wk-cal-e wk-cal-${e.tone || 'blue'}`} title={e.label} onClick={e.onOpen}>{e.label}</button>
            ))}
            {(byDay[day] || []).length > 4 && <span className="xs muted">+{byDay[day].length - 4} more</span>}
          </div>
        ))}
      </div>
      {undated > 0 && <p className="xs muted">{undated} without a date (not shown).</p>}
    </div>
  );
}
