import { useRef, useState } from 'react';
import { AppProps } from '../App';
import { fromISO, isSameMonth, monthGrid, monthLabel, todayISO, weekdayHeads } from '../lib/date';
import { tx } from '../lib/i18n';

export default function CalendarView(p: AppProps) {
  const t = fromISO(todayISO());
  const [ym, setYm] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const [yearMode, setYearMode] = useState(false);
  const touchX = useRef<number | null>(null);
  const grid = monthGrid(ym.y, ym.m, p.settings.weekStart);
  const today = todayISO();
  const lang = p.settings.lang;
  const predictionsLive = !p.settings.predictionsPaused && !p.stats.stale;
  const showFertile = predictionsLive && p.settings.showFertileWindow && !p.stats.fertileSuppressed;

  const move = (delta: number) => {
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const cellFor = (iso: string, mini: boolean, dimMonth?: { y: number; m: number }) => {
    const f = p.facts.get(iso);
    const dim = dimMonth ?? ym;
    const inWindow =
      !p.stats.predictionsPaused &&
      !p.stats.stale &&
      !!p.stats.periodWindow &&
      iso >= p.stats.periodWindow.start &&
      iso <= p.stats.periodWindow.end;
    const cls = [
      'day',
      isSameMonth(iso, dim.y, dim.m) ? '' : 'out',
      iso === today ? 'today' : '',
      f?.period ? 'period' : '',
      !f?.period && f?.predicted ? 'predicted' : '',
      !f?.period && !f?.predicted && inWindow ? 'window' : '',
      showFertile && f?.fertile && !f.period ? 'fertile' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = [
      iso === today ? 'today' : null,
      f?.period ? 'period' : null,
      f?.predicted ? 'predicted period' : null,
      showFertile && f?.fertile ? 'fertile' : null,
      showFertile && f?.ovulation ? 'ovulation' : null,
      p.entries[iso]?.lhTest === 'positive' ? 'LH test positive' : null,
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <button
        key={iso}
        className={cls}
        onClick={() => p.openDay(iso)}
        aria-label={mini ? iso : `${iso}${label ? `: ${label}` : ''}`}
      >
        {fromISO(iso).getDate()}
        {!mini && showFertile && f?.ovulation && <span className="ovu" />}
        {!mini && p.entries[iso]?.lhTest === 'positive' && <span className="lh" title="LH test positive" />}
      </button>
    );
  };

  return (
    <>
      <div className="card">
        <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
          <button className={!yearMode ? 'on' : ''} onClick={() => setYearMode(false)}>{tx(lang, 'Month')}</button>
          <button className={yearMode ? 'on' : ''} onClick={() => setYearMode(true)}>{tx(lang, 'Year')}</button>
        </div>
        {!yearMode ? (
          <div
            onTouchStart={(e) => {
              touchX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (dx > 48) move(-1);
              else if (dx < -48) move(1);
            }}
          >
            <div className="cal-head">
              <button className="cal-nav" aria-label={tx(lang, 'Previous month')} onClick={() => move(-1)}>
                ‹
              </button>
              <div className="m">{monthLabel(ym.y, ym.m)}</div>
              <button className="cal-nav" aria-label={tx(lang, 'Next month')} onClick={() => move(1)}>
                ›
              </button>
            </div>
            <div className="cal-grid" role="grid">
              {weekdayHeads(p.settings.weekStart).map((w, i) => (
                <div key={i} className="wd" aria-hidden>
                  {w}
                </div>
              ))}
              {grid.map((iso) => cellFor(iso, false))}
            </div>
          </div>
        ) : (
          <div>
            <div className="cal-head">
              <button className="cal-nav" aria-label={tx(lang, 'Previous year')} onClick={() => setYm(({ y, m }) => ({ y: y - 1, m }))}>
                ‹
              </button>
              <div className="m">{ym.y}</div>
              <button className="cal-nav" aria-label={tx(lang, 'Next year')} onClick={() => setYm(({ y, m }) => ({ y: y + 1, m }))}>
                ›
              </button>
            </div>
            <div className="year-grid">
              {Array.from({ length: 12 }, (_, m) => (
                <div key={m}>
                  <button
                    className="mini-head"
                    onClick={() => {
                      setYm({ y: ym.y, m });
                      setYearMode(false);
                    }}
                  >
                    {monthLabel(ym.y, m).split(' ')[0]}
                  </button>
                  <div className="cal-grid mini">
                    {monthGrid(ym.y, m, p.settings.weekStart).map((iso) => cellFor(iso, true, { y: ym.y, m }))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="legend">
          <span className="li"><span className="sw p" /> {tx(lang, 'Period')}</span>
          <span className="li"><span className="sw pd" /> {tx(lang, 'Predicted')}</span>
          {p.stats.periodWindow && predictionsLive && (
            <span className="li"><span className="sw w" /> {tx(lang, 'Maybe')}</span>
          )}
          {showFertile && (
            <>
              <span className="li"><span className="sw f" /> {tx(lang, 'Fertile')}</span>
              <span className="li"><span className="sw o" /> {tx(lang, 'Ovulation')}</span>
            </>
          )}
          <span className="li"><span className="sw lhsw" /> LH+</span>
        </div>
      </div>
      <p className="hint" style={{ textAlign: 'center', padding: '0 12px' }}>
        {tx(lang, 'Tap any day to log or edit flow, symptoms, and mood.')}
        {p.settings.predictionsPaused && tx(lang, ' Predictions are paused, so only logged days are marked.')}
      </p>
    </>
  );
}
