import { useState } from 'react';
import { AppProps } from '../App';
import { PHASE_INFO, phaseFor } from '../lib/cycle';
import { diffDays, prettyDate, todayISO } from '../lib/date';
import { FLOWS, MUCUS_OPTIONS, METHOD_INFO } from '../types';
import { safetyTriage } from '../lib/safety';

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function Dashboard(p: AppProps) {
  const { stats, facts, settings } = p;
  const today = todayISO();
  const todayEntry = p.entries[today];
  const phase = phaseFor(today, stats, facts);
  const info = PHASE_INFO[phase];
  const todayFacts = facts.get(today);
  const [showWhy, setShowWhy] = useState(false);
  const notices = safetyTriage(p.entries, settings, stats.clusters);

  const recent = Object.values(p.entries)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const daysSinceLast = stats.lastStart ? diffDays(stats.lastStart, today) : null;
  const latestBbt = Object.values(p.entries).filter((e) => e.bbt != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestWeight = Object.values(p.entries).filter((e) => e.weight != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastLhPositive = Object.values(p.entries).filter((e) => e.lhTest === 'positive').sort((a, b) => b.date.localeCompare(a.date))[0];
  const inFertile = todayFacts?.fertile;

  const regimen = settings.contraception;
  const methodInfo = METHOD_INFO[regimen.method];
  const nextChange =
    regimen.changeEveryDays && regimen.startDate
      ? (() => {
          let d = regimen.startDate;
          const step = regimen.changeEveryDays;
          let guard = 0;
          while (diffDays(today, d) < 0 && guard++ < 200) d = addDaysLocal(d, step);
          return d;
        })()
      : null;

  const statCards = () => {
    if (settings.mode === 'perimenopause') {
      return (
        <>
          <div className="stat">
            <div className="v">{daysSinceLast ?? '-'}</div>
            <div className="l">Days since last period</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgPeriod}d</div>
            <div className="l">Avg period</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgCycle}d</div>
            <div className="l">Median cycle</div>
          </div>
        </>
      );
    }
    const ttc = settings.mode === 'ttc';
    if (!settings.showFertileWindow) {
      return (
        <>
          <div className="stat">
            <div className="v">{stats.nextStart ? prettyDate(stats.nextStart) : '-'}</div>
            <div className="l">
              {stats.lateBy ? 'Late by ' + stats.lateBy + 'd' : 'Next period' + (stats.usingDefaults ? ' (est.)' : '')}
            </div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgCycle}d</div>
            <div className="l">{stats.usingDefaults ? 'Your baseline' : 'Median cycle'}</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgPeriod}d</div>
            <div className="l">Avg period</div>
          </div>
        </>
      );
    }
    return (
      <>
        <div className="stat" style={ttc && inFertile ? { borderColor: 'var(--leaf-600)' } : undefined}>
          <div className="v">
            {stats.fertileSuppressed
              ? '-'
              : stats.fertileStart
                ? prettyDate(stats.fertileStart).replace(/,.*/, '')
                : '-'}
            {stats.fertileEnd ? `-${prettyDate(stats.fertileEnd).replace(/,.*/, '')}` : ''}
          </div>
          <div className="l">
            {stats.fertileSuppressed ? 'Suppressed (hormonal)' : inFertile ? 'Fertile - now!' : 'Fertile window'}
          </div>
        </div>
        <div className="stat">
          <div className="v">{stats.nextStart ? prettyDate(stats.nextStart) : '-'}</div>
          <div className="l">
            {stats.lateBy ? 'Late by ' + stats.lateBy + 'd' : 'Next period' + (stats.usingDefaults ? ' (est.)' : '')}
          </div>
        </div>
        <div className="stat">
          <div className="v">{stats.avgCycle}d</div>
          <div className="l">{stats.usingDefaults ? 'Your baseline' : 'Median cycle'}</div>
        </div>
      </>
    );
  };

  return (
    <>
      {notices.map((n) => (
        <div
          key={n.id}
          className="banner"
          style={
            n.urgency === 'emergency'
              ? { background: 'var(--danger-bg)', borderColor: 'var(--danger)', color: 'var(--danger)' }
              : n.urgency === 'same-day'
                ? { background: '#fff7ed', borderColor: '#f59e0b', color: '#9a3412' }
                : undefined
          }
        >
          <span aria-hidden>{n.urgency === 'emergency' ? '🚨' : n.urgency === 'same-day' ? '⚠️' : 'ℹ️'}</span>
          <span>
            <strong>{n.headline}.</strong> {n.detail} <em>({n.source})</em>
          </span>
        </div>
      ))}

      {stats.stale && (
        <div className="banner">
          🕰️ Your last logged period is {daysSinceLast} days ago - too far back to forecast from. Predictions resume when you log your next period.
        </div>
      )}
      {settings.predictionsPaused && settings.mode !== 'pregnant' && (
        <div className="banner">🌙 Predictions are paused. Log freely - nothing will be forecast until you resume them in Settings.</div>
      )}
      {stats.lateBy && settings.mode !== 'perimenopause' && (
        <div className="banner">
          🕊️ Your period is {stats.lateBy} day{stats.lateBy === 1 ? '' : 's'} past the estimate (±{stats.uncertaintyDays}d). Late periods are common - stress, illness, and sleep all shift cycles. If you might be pregnant, a test now is reliable.
        </div>
      )}
      {settings.mode === 'ttc' && inFertile && settings.showFertileWindow && !stats.fertileSuppressed && (
        <div className="banner" style={{ background: 'var(--leaf-100)', borderColor: 'var(--leaf-600)', color: 'var(--leaf-700)' }}>
          🌱 You're inside your fertile window. An LH test today can help confirm ovulation is near.
        </div>
      )}
      {settings.mode === 'perimenopause' && daysSinceLast !== null && daysSinceLast > 60 && (
        <div className="banner">🍂 {daysSinceLast} days since your last period. Gaps like this are common in perimenopause - worth a clinician chat if they persist.</div>
      )}
      {!stats.predictionsPaused && !stats.stale && stats.daysUntilNext !== null && stats.daysUntilNext >= 0 && stats.daysUntilNext <= 3 && settings.mode !== 'perimenopause' && (
        <div className="banner">
          🌸{' '}
          {stats.daysUntilNext === 0
            ? 'Your period is expected around today.'
            : stats.daysUntilNext === 1
              ? 'Your period is expected tomorrow.'
              : `Your period is expected in ${stats.daysUntilNext} days.`}
        </div>
      )}
      {lastLhPositive && diffDays(lastLhPositive.date, today) <= 3 && !stats.fertileSuppressed && (
        <div className="banner" style={{ background: '#f3e8ff', borderColor: '#c084fc', color: '#6b21a8' }}>
          🟣 LH test was positive on {prettyDate(lastLhPositive.date, { weekday: true })} - ovulation likely within ~36 hours of that test.
        </div>
      )}

      <section className="hero">
        <div className="ring" />
        <div className="ring r2" />
        <div aria-label="Current cycle day" className="cycle-day">
          {stats.cycleDay ?? '-'}
          <span>cycle day{stats.cycleDay ? '' : ' · log a period to begin'}</span>
        </div>
        <div className="phase">{info.label}</div>
        <div className="since">{info.blurb}</div>
        {stats.periodWindow && !stats.stale && (
          <button className="why-link" onClick={() => setShowWhy(!showWhy)}>
            {showWhy ? 'Hide' : 'Why'} this estimate{stats.usingDefaults ? ' (baseline)' : ` (±${stats.uncertaintyDays}d)`}
          </button>
        )}
      </section>

      {showWhy && (
        <div className="card">
          <h3>How this estimate was made</h3>
          {stats.usingDefaults ? (
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
              You have fewer than two logged periods, so predictions use your stated baseline of{' '}
              {settings.avgCycleLength} days and {settings.avgPeriodLength}-day periods. Log two periods and the app
              switches to your own history.
            </p>
          ) : (
            <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
              <p style={{ margin: '0 0 6px' }}>
                Forecast from your last {stats.includedLengths.length} cycle length(s) ({stats.includedLengths.join(', ') || '-'} →{' '}
                <strong>{stats.avgCycle} days</strong>), weighting recent cycles more and easing toward the
                population average while your history is short.
                {stats.excludedLengths.length > 0 && ' Intervals outside 15-90 days were excluded as logging gaps.'}
              </p>
              <p style={{ margin: '0 0 6px' }}>
                Uncertainty window: <strong>±{stats.uncertaintyDays} days</strong>, derived from your own cycle
                variation, so the period is expected between {prettyDate(stats.periodWindow!.start)} and{' '}
                {prettyDate(stats.periodWindow!.end)}.
              </p>
              <p style={{ margin: 0 }}>
                {!settings.showFertileWindow
                  ? 'Fertile-window estimates are hidden - turn them on in Settings → Display if you want to see them.'
                  : stats.fertileSuppressed
                    ? 'Fertile-window and ovulation estimates are hidden because a hormonal contraception method is active.'
                    : stats.ovuEvidenceCount > 0
                      ? `Ovulation is placed ${stats.lutealLength} days before the next period - learned from your own ${stats.ovuEvidenceCount} positive LH test(s), not a fixed average.`
                      : 'Ovulation is assumed ~14 days before the next period (calendar method) - log LH tests to personalize this.'}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="stat-row">{statCards()}</div>

      {(latestBbt || latestWeight) && (
        <div className="card" style={{ display: 'flex', gap: 10 }}>
          {latestBbt?.bbt != null && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--rose-600)' }}>
                {settings.tempUnit === 'F' ? round2(cToF(latestBbt.bbt)) : round2(latestBbt.bbt)}°{settings.tempUnit}
              </div>
              <div className="hint">BBT · {prettyDate(latestBbt.date)}</div>
            </div>
          )}
          {latestWeight?.weight != null && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--rose-600)' }}>
                {settings.weightUnit === 'lb' ? round2(latestWeight.weight * 2.20462) : round2(latestWeight.weight)}
                {settings.weightUnit}
              </div>
              <div className="hint">Weight · {prettyDate(latestWeight.date)}</div>
            </div>
          )}
          {methodInfo.hormonal && (nextChange || regimen.nextRenewal) && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--rose-600)' }}>
                {nextChange && (!regimen.nextRenewal || nextChange <= regimen.nextRenewal)
                  ? prettyDate(nextChange)
                  : regimen.nextRenewal
                    ? prettyDate(regimen.nextRenewal)
                    : '-'}
              </div>
              <div className="hint">{regimen.nextRenewal && (!nextChange || regimen.nextRenewal < nextChange) ? 'Next renewal' : 'Next change'}</div>
            </div>
          )}
        </div>
      )}

      {p.stats.cycleLengths.length >= 2 && (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="t" style={{ fontWeight: 800 }}>Clinician report - ready</div>
            <div className="d">Printable summary of your last 6 months (symptoms & cycle lengths). Free, no paywall.</div>
          </div>
          <button className="btn ghost sm" onClick={p.openReport} style={{ flexShrink: 0 }}>
            🖨️ View
          </button>
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
                {e.checkedIn && e.symptoms.length === 0 && <span className="tag leaf" style={{ marginRight: 6 }}>✓ checked in</span>}
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

const cToF = (c: number) => (c * 9) / 5 + 32;

function addDaysLocal(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
