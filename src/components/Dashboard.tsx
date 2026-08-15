import { AppProps } from '../App';
import { PHASE_INFO, phaseFor } from '../lib/cycle';
import { prettyDate, todayISO } from '../lib/date';
import { FLOWS } from '../types';

export default function Dashboard(p: AppProps) {
  const { stats, facts, settings } = p;
  const today = todayISO();
  const todayEntry = p.entries[today];
  const phase = phaseFor(today, stats, facts);
  const info = PHASE_INFO[phase];
  const todayFacts = facts.get(today);

  const recent = Object.values(p.entries)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  return (
    <>
      {settings.predictionsPaused && (
        <div className="banner">🌙 Predictions are paused. Log freely — nothing will be forecast until you resume them in Settings.</div>
      )}
      {!settings.predictionsPaused && stats.daysUntilNext !== null && stats.daysUntilNext <= 3 && (
        <div className="banner">
          🌸{' '}
          {stats.daysUntilNext === 0
            ? 'Your period is expected today.'
            : stats.daysUntilNext === 1
              ? 'Your period is expected tomorrow.'
              : `Your period is expected in ${stats.daysUntilNext} days.`}
        </div>
      )}

      <section className="hero">
        <div className="ring" />
        <div className="ring r2" />
        <div aria-label="Current cycle day" className="cycle-day">
          {stats.cycleDay ?? '—'}
          <span>cycle day{stats.cycleDay ? '' : ' · log a period to begin'}</span>
        </div>
        <div className="phase">{info.label}</div>
        <div className="since">{info.blurb}</div>
      </section>

      <div className="stat-row">
        <div className="stat">
          <div className="v">
            {stats.nextStart ? prettyDate(stats.nextStart) : '—'}
          </div>
          <div className="l">Next period{stats.usingDefaults ? ' (est.)' : ''}</div>
        </div>
        <div className="stat">
          <div className="v">
            {stats.fertileStart ? prettyDate(stats.fertileStart).replace(/,.*/, '') : '—'}
            {stats.fertileEnd ? `–${prettyDate(stats.fertileEnd).replace(/,.*/, '')}` : ''}
          </div>
          <div className="l">Fertile window</div>
        </div>
        <div className="stat">
          <div className="v">{stats.avgCycle}d</div>
          <div className="l">Avg cycle</div>
        </div>
      </div>

      <div className="card">
        <h3>Today · {prettyDate(today, { weekday: true })}</h3>
        <button className="btn primary" onClick={() => p.openDay(today)}>
          {todayEntry?.flow ? 'Edit today’s log' : 'Log today'}
        </button>
        {todayEntry?.flow && (
          <p className="hint" style={{ marginTop: 10 }}>
            Logged:{' '}
            <span className={`flow-pill ${todayEntry.flow}`}>
              {FLOWS.find((f) => f.id === todayEntry.flow)?.label}
            </span>
            {todayEntry.symptoms.length > 0 && `${todayEntry.symptoms.length} symptom(s)`}
            {todayEntry.moods.length > 0 && ` · ${todayEntry.moods.join(', ')}`}
          </p>
        )}
        {todayFacts?.predicted && !todayEntry?.flow && (
          <p className="hint" style={{ marginTop: 10 }}>This is a predicted period day.</p>
        )}
      </div>

      <div className="card">
        <h3>Recent logs</h3>
        {recent.length === 0 ? (
          <div className="empty" style={{ padding: '18px 8px' }}>
            Nothing logged yet. Tap <strong>Log today</strong> to start your history.
          </div>
        ) : (
          recent.map((e) => (
            <div key={e.date} className="recent-item" onClick={() => p.openDay(e.date)} role="button" tabIndex={0}
              onKeyDown={(ev) => ev.key === 'Enter' && p.openDay(e.date)}>
              <div className="dt">
                <div className="d1">{prettyDate(e.date, { weekday: true })}</div>
                <div className="d2">{prettyDate(e.date, { withYear: true })}</div>
              </div>
              <div className="info">
                {e.flow ? (
                  <span className={`flow-pill ${e.flow}`}>{FLOWS.find((f) => f.id === e.flow)?.label}</span>
                ) : (
                  <span className="flow-pill spotting" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                    No flow
                  </span>
                )}
                {e.symptoms.length > 0 && <div>{e.symptoms.join(' · ')}</div>}
                {e.moods.length > 0 && <div>{e.moods.join(' · ')}</div>}
                {e.note && <div style={{ fontStyle: 'italic' }}>“{e.note}”</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
