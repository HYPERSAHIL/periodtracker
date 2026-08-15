import { useState } from 'react';
import { AppProps } from '../App';
import { WEEKDAYS, fromISO, isSameMonth, monthGrid, monthLabel, todayISO } from '../lib/date';

export default function CalendarView(p: AppProps) {
  const t = fromISO(todayISO());
  const [ym, setYm] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const grid = monthGrid(ym.y, ym.m);
  const today = todayISO();

  const move = (delta: number) => {
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <>
      <div className="card">
        <div className="cal-head">
          <button className="cal-nav" aria-label="Previous month" onClick={() => move(-1)}>
            ‹
          </button>
          <div className="m">{monthLabel(ym.y, ym.m)}</div>
          <button className="cal-nav" aria-label="Next month" onClick={() => move(1)}>
            ›
          </button>
        </div>
        <div className="cal-grid" role="grid">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="wd" aria-hidden>
              {w}
            </div>
          ))}
          {grid.map((iso) => {
            const f = p.facts.get(iso);
            const cls = [
              'day',
              isSameMonth(iso, ym.y, ym.m) ? '' : 'out',
              iso === today ? 'today' : '',
              f?.period ? 'period' : '',
              f?.predicted ? 'predicted' : '',
              f?.fertile && !f.period ? 'fertile' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const label = [
              iso === today ? 'today' : null,
              f?.period ? 'period' : null,
              f?.predicted ? 'predicted period' : null,
              f?.fertile ? 'fertile' : null,
              f?.ovulation ? 'ovulation' : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <button key={iso} className={cls} onClick={() => p.openDay(iso)} aria-label={`${iso}${label ? ` — ${label}` : ''}`}>
                {fromISO(iso).getDate()}
                {f?.ovulation && <span className="ovu" />}
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span className="li"><span className="sw p" /> Period</span>
          <span className="li"><span className="sw pd" /> Predicted</span>
          <span className="li"><span className="sw f" /> Fertile</span>
          <span className="li"><span className="sw o" /> Ovulation</span>
        </div>
      </div>
      <p className="hint" style={{ textAlign: 'center', padding: '0 12px' }}>
        Tap any day to log or edit flow, symptoms, and mood.
        {p.settings.predictionsPaused && ' Predictions are paused, so only logged days are marked.'}
      </p>
    </>
  );
}
