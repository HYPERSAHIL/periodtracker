import { AppProps } from '../App';
import { PHASE_INFO, phaseFor } from '../lib/cycle';
import { diffDays, prettyDate, todayISO } from '../lib/date';
import { FLOWS, MUCUS_OPTIONS } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

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

  const daysSinceLast = stats.lastStart ? diffDays(stats.lastStart, today) : null;
  const latestBbt = Object.values(p.entries).filter((e) => e.bbt != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestWeight = Object.values(p.entries).filter((e) => e.weight != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastLhPositive = Object.values(p.entries).filter((e) => e.lhTest === 'positive').sort((a, b) => b.date.localeCompare(a.date))[0];
  const inFertile = todayFacts?.fertile;

  const statCards = () => {
    if (settings.mode === 'perimenopause') {
      return (
        <>
          <div className="stat">
            <div className="v">{daysSinceLast ?? '—'}</div>
            <div className="l">Days since last period</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgPeriod}d</div>
            <div className="l">Avg period</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgCycle}d</div>
            <div className="l">Avg cycle</div>
          </div>
        </>
      );
    }
    const ttc = settings.mode === 'ttc';
    return (
      <>
        <div className="stat" style={ttc && inFertile ? { borderColor: 'var(--leaf-600)' } : undefined}>
          <div className="v">
            {stats.fertileStart ? prettyDate(stats.fertileStart).replace(/,.*/, '') : '—'}
            {stats.fertileEnd ? `–${prettyDate(stats.fertileEnd).replace(/,.*/, '')}` : ''}
          </div>
          <div className="l">{inFertile ? 'Fertile — now!' : 'Fertile window'}</div>
        </div>
        <div className="stat">
          <div className="v">{stats.nextStart ? prettyDate(stats.nextStart) : '—'}</div>
          <div className="l">Next period{stats.usingDefaults ? ' (est.)' : ''}</div>
        </div>
        <div className="stat">
          <div className="v">{stats.avgCycle}d</div>
          <div className="l">Avg cycle</div>
        </div>
      </>
    );
  };

  return (
    <>
      {settings.predictionsPaused && settings.mode !== 'pregnant' && (
        <div className="banner">🌙 Predictions are paused. Log freely — nothing will be forecast until you resume them in Settings.</div>
      )}
      {settings.mode === 'ttc' && inFertile && (
        <div className="banner" style={{ background: 'var(--leaf-100)', borderColor: 'var(--leaf-600)', color: 'var(--leaf-700)' }}>
          🌱 You're inside your fertile window. An LH test today can help confirm ovulation is near.
        </div>
      )}
      {settings.mode === 'perimenopause' && daysSinceLast !== null && daysSinceLast > 60 && (
        <div className="banner">🍂 {daysSinceLast} days since your last period. Gaps like this are common in perimenopause — worth a clinician chat if they persist.</div>
      )}
      {!settings.predictionsPaused && stats.daysUntilNext !== null && stats.daysUntilNext <= 3 && settings.mode !== 'perimenopause' && (
        <div className="banner">
          🌸{' '}
          {stats.daysUntilNext === 0
            ? 'Your period is expected today.'
            : stats.daysUntilNext === 1
              ? 'Your period is expected tomorrow.'
              : `Your period is expected in ${stats.daysUntilNext} days.`}
        </div>
      )}
      {lastLhPositive && diffDays(lastLhPositive.date, today) <= 3 && (
        <div className="banner" style={{ background: '#f3e8ff', borderColor: '#c084fc', color: '#6b21a8' }}>
          🟣 LH test was positive on {prettyDate(lastLhPositive.date, { weekday: true })} — ovulation likely within ~36 hours of that test.
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

      <div className="stat-row">{statCards()}</div>

      {(latestBbt || latestWeight) && (
        <div className="card" style={{ display: 'flex', gap: 10 }}>
          {latestBbt?.bbt != null && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--rose-600)' }}>
                {settings.tempUnit === 'F'
                  ? round2((latestBbt.bbt * 9) / 5 + 32)
                  : round2(latestBbt.bbt)}
                °{settings.tempUnit}
              </div>
              <div className="hint">BBT · {prettyDate(latestBbt.date)}</div>
            </div>
          )}
          {latestWeight?.weight != null && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--rose-600)' }}>
                {settings.weightUnit === 'lb'
                  ? round2(latestWeight.weight * 2.20462)
                  : round2(latestWeight.weight)}
                {settings.weightUnit}
              </div>
              <div className="hint">Weight · {prettyDate(latestWeight.date)}</div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Today · {prettyDate(today, { weekday: true })}</h3>
        <button className="btn primary" onClick={() => p.openDay(today)}>
          {todayEntry ? 'Edit today’s log' : 'Log today'}
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
                {e.lhTest === 'positive' && <span className="tag rose" style={{ marginRight: 6 }}>LH+</span>}
                {e.mucus && <span className="tag gray" style={{ marginRight: 6 }}>{MUCUS_OPTIONS.find((m) => m.id === e.mucus)?.label}</span>}
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
