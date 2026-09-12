import { useState } from 'react';
import { AppProps } from '../App';
import { tx, txd } from '../lib/i18n';
import { PHASE_TIPS } from '../lib/content';
import { PHASE_INFO, phaseFor } from '../lib/cycle';
import { diffDays, prettyDate, todayISO } from '../lib/date';
import { FLOWS, MUCUS_OPTIONS, METHOD_INFO } from '../types';
import { safetyTriage } from '../lib/safety';

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function Dashboard(p: AppProps) {
  const { stats, facts, settings } = p;
  const lang = settings.lang;
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
  const lhAgo = lastLhPositive ? diffDays(lastLhPositive.date, today) : null;
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
  const renewalDue =
    nextChange && (!regimen.nextRenewal || nextChange <= regimen.nextRenewal) ? nextChange : regimen.nextRenewal;
  const renewalIn = renewalDue ? diffDays(today, renewalDue) : null;

  const statCards = () => {
    if (settings.mode === 'perimenopause') {
      return (
        <>
          <div className="stat">
            <div className="v">{daysSinceLast ?? '-'}</div>
            <div className="l">{tx(lang, 'Days since last period')}</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgPeriod}d</div>
            <div className="l">{tx(lang, 'Avg period')}</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgCycle}d</div>
            <div className="l">{tx(lang, 'Median cycle')}</div>
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
              {stats.lateBy ? tx(lang, 'Late by {n}d', { n: stats.lateBy }) : tx(lang, 'Next period') + (stats.usingDefaults ? tx(lang, ' (est.)') : '')}
            </div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgCycle}d</div>
            <div className="l">{stats.usingDefaults ? tx(lang, 'Your baseline') : tx(lang, 'Median cycle')}</div>
          </div>
          <div className="stat">
            <div className="v">{stats.avgPeriod}d</div>
            <div className="l">{tx(lang, 'Avg period')}</div>
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
            {stats.fertileSuppressed
              ? settings.teen
                ? tx(lang, 'Hidden in teen mode')
                : tx(lang, 'Suppressed (hormonal)')
              : inFertile
                ? tx(lang, 'Fertile now!')
                : tx(lang, 'Fertile window')}
          </div>
        </div>
        <div className="stat">
          <div className="v">{stats.nextStart ? prettyDate(stats.nextStart) : '-'}</div>
          <div className="l">
            {stats.lateBy ? tx(lang, 'Late by {n}d', { n: stats.lateBy }) : tx(lang, 'Next period') + (stats.usingDefaults ? tx(lang, ' (est.)') : '')}
          </div>
        </div>
        <div className="stat">
          <div className="v">{stats.avgCycle}d</div>
          <div className="l">{stats.usingDefaults ? tx(lang, 'Your baseline') : tx(lang, 'Median cycle')}</div>
        </div>
      </>
    );
  };

  return (
    <>
      {settings.mode === 'postpartum' && <LamCard p={p} lang={lang} />}
      {settings.mode === 'postpartum' && <PostpartumMood p={p} lang={lang} />}
      {settings.mode === 'postpartum' && <RecoveryCheck lang={lang} />}
      {notices.map((n) => (
        <div
          key={n.id}
          className="banner"
          style={
            n.urgency === 'emergency'
              ? { background: 'var(--danger-bg)', borderColor: 'var(--danger)', color: 'var(--danger)' }
              : n.urgency === 'same day'
                ? { background: '#fff7ed', borderColor: '#f59e0b', color: '#9a3412' }
                : undefined
          }
        >
          <span aria-hidden>{n.urgency === 'emergency' ? '🚨' : n.urgency === 'same day' ? '⚠️' : 'ℹ️'}</span>
          <span>
            <strong>{n.headline}.</strong> {n.detail} <em>({n.source})</em>
          </span>
        </div>
      ))}

      {stats.stale && (
        <div className="banner">
          🕰️ {tx(lang, 'Your last logged period is {n} days ago. Too far back to forecast from. Predictions resume when you log your next period.', { n: daysSinceLast ?? '?' })}
        </div>
      )}
      {settings.predictionsPaused && settings.mode !== 'pregnant' && (
        <div className="banner">🌙 {tx(lang, 'Predictions are paused. Log freely. Nothing will be forecast until you resume them in Settings.')}</div>
      )}
      {stats.lateBy && settings.mode !== 'perimenopause' && (!settings.irregular || stats.lateBy > 14) && (
        <div className="banner">
          🕊️ {tx(lang, 'Your period is {n} day{s} past the estimate (±{u}d). Late periods are common. Stress, illness, and sleep all shift cycles. If you might be pregnant, a test now is reliable.', { n: stats.lateBy, s: stats.lateBy === 1 ? '' : 's', u: stats.uncertaintyDays })}
        </div>
      )}
      {settings.mode === 'ttc' && inFertile && settings.showFertileWindow && !stats.fertileSuppressed && (
        <div className="banner" style={{ background: 'var(--leaf-100)', borderColor: 'var(--leaf-600)', color: 'var(--leaf-700)' }}>
          🌱 {tx(lang, "You're inside your fertile window. An LH test today can help confirm ovulation is near.")}
        </div>
      )}
      {settings.mode === 'perimenopause' && daysSinceLast !== null && daysSinceLast > 60 && (
        <div className="banner">🍂 {tx(lang, '{n} days since your last period. Gaps like this are common in perimenopause. Worth a clinician chat if they persist.', { n: daysSinceLast })}</div>
      )}
      {!stats.predictionsPaused && !stats.stale && stats.daysUntilNext !== null && stats.daysUntilNext >= 0 && stats.daysUntilNext <= 3 && settings.mode !== 'perimenopause' && (
        <div className="banner">
          🌸{' '}
          {stats.daysUntilNext === 0
            ? tx(lang, 'Your period is expected around today.')
            : stats.daysUntilNext === 1
              ? tx(lang, 'Your period is expected tomorrow.')
              : tx(lang, 'Your period is expected in {n} days.', { n: stats.daysUntilNext })}
        </div>
      )}
      {methodInfo.hormonal && renewalIn !== null && renewalIn <= 7 && (
        <div className="banner">
          💊{' '}
          {renewalIn < 0
            ? tx(lang, 'Contraception change was due {n} day{s} ago ({date}).', { n: -renewalIn, s: renewalIn === -1 ? '' : 's', date: prettyDate(renewalDue!) })
            : renewalIn === 0
              ? tx(lang, 'Contraception change is due today.')
              : tx(lang, 'Contraception change due in {n} day{s} ({date}).', { n: renewalIn, s: renewalIn === 1 ? '' : 's', date: prettyDate(renewalDue!) })}
        </div>
      )}
      {lastLhPositive && lhAgo !== null && lhAgo >= 0 && lhAgo <= 3 && !stats.fertileSuppressed && (
        <div className="banner" style={{ background: '#f3e8ff', borderColor: '#c084fc', color: '#6b21a8' }}>
          🟣 {tx(lang, 'LH test was positive on {date}. Ovulation likely within ~36 hours of that test.', { date: prettyDate(lastLhPositive.date, { weekday: true }) })}
        </div>
      )}

      <section className="hero">
        <div className="ring" />
        <div className="ring r2" />
        <div aria-label="Current cycle day" className="cycle-day">
          {stats.cycleDay ?? '-'}
          <span>{tx(lang, 'cycle day')}{stats.cycleDay ? '' : tx(lang, ' · log a period to begin')}</span>
        </div>
        <div className="phase">{txd(lang, `phase.${phase}`, info.label)}</div>
        <div className="since">{txd(lang, `phase.${phase}.blurb`, info.blurb)}</div>
        {stats.periodWindow && !stats.stale && (
          <button className="why-link" onClick={() => setShowWhy(!showWhy)}>
            {showWhy ? tx(lang, 'Hide this estimate') : tx(lang, 'Why this estimate')}{stats.usingDefaults ? tx(lang, ' (baseline)') : tx(lang, ' (±{u}d)', { u: stats.uncertaintyDays })}
          </button>
        )}
      </section>

      {showWhy && (
        <div className="card">
          <h3>{tx(lang, 'How this estimate was made')}</h3>
          {stats.usingDefaults ? (
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
              {tx(lang, 'You have fewer than two logged periods, so predictions use your stated baseline of {c} days and {p}-day periods. Log two periods and the app switches to your own history.', { c: settings.avgCycleLength, p: settings.avgPeriodLength })}
            </p>
          ) : (
            <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
              <p style={{ margin: '0 0 6px' }}>
                {tx(lang, 'Forecast from your last {k} cycle length(s) ({lens} → {avg} days), weighting recent cycles more and easing toward the population average while your history is short.', { k: stats.includedLengths.length, lens: stats.includedLengths.join(', ') || '-', avg: stats.avgCycle })}
                {stats.excludedLengths.length > 0 && tx(lang, ' Intervals outside 15-90 days were excluded as logging gaps.')}
              </p>
              <p style={{ margin: '0 0 6px' }}>
                {tx(lang, 'Uncertainty window: ±{u} days, derived from your own cycle variation, so the period is expected between {a} and {b}.', { u: stats.uncertaintyDays, a: prettyDate(stats.periodWindow!.start), b: prettyDate(stats.periodWindow!.end) })}
              </p>
              <p style={{ margin: 0 }}>
                {!settings.showFertileWindow
                  ? tx(lang, 'Fertile window estimates are hidden. Turn them on in Settings → Display if you want to see them.')
                  : stats.fertileSuppressed
                    ? tx(lang, 'Fertile window and ovulation estimates are hidden because a hormonal contraception method is active.')
                    : stats.ovuEvidenceCount > 0
                      ? tx(lang, 'Ovulation is placed {l} days before the next period, learned from your own {n} positive LH test(s), not a fixed average.', { l: stats.lutealLength, n: stats.ovuEvidenceCount })
                      : tx(lang, 'Ovulation is assumed ~14 days before the next period (calendar method). Log LH tests to personalize this.')}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>🌿 {tx(lang, 'In sync with your cycle')}</h3>
        {(PHASE_TIPS[phase] ?? PHASE_TIPS.unknown).map((tip) => (
          <p key={tip.slice(0, 24)} style={{ fontSize: 13.5, margin: '0 0 6px' }}>
            • {tx(lang, tip)}
          </p>
        ))}
      </div>

      <div className="stat-row">{statCards()}</div>

      {(latestBbt || latestWeight) && (
        <div className="card" style={{ display: 'flex', gap: 10 }}>
          {latestBbt?.bbt != null && (
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--rose-600)' }}>
                {settings.tempUnit === 'F' ? round2(cToF(latestBbt.bbt)) : round2(latestBbt.bbt)}°{settings.tempUnit}
              </div>
              <div className="hint">BBT · {prettyDate(latestBbt.date)}</div>            </div>
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
              <div className="hint">{regimen.nextRenewal && (!nextChange || regimen.nextRenewal < nextChange) ? tx(lang, 'Next renewal') : tx(lang, 'Next change')}</div>
            </div>
          )}
        </div>
      )}

      {p.stats.cycleLengths.length >= 2 && (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="t" style={{ fontWeight: 800 }}>{tx(lang, 'Clinician report ready')}</div>
            <div className="d">{tx(lang, 'Printable summary of your last 6 months (symptoms & cycle lengths). Free, no paywall.')}</div>
          </div>
          <button className="btn ghost sm" onClick={p.openReport} style={{ flexShrink: 0 }}>
            🖨️ {tx(lang, 'View')}
          </button>
        </div>
      )}

      <div className="card">
        <h3>{tx(lang, 'Today · {date}', { date: prettyDate(today, { weekday: true }) })}</h3>
        <button className="btn primary" onClick={() => p.openDay(today)}>
          {todayEntry ? tx(lang, 'Edit today’s log') : tx(lang, 'Log today')}
        </button>
        {todayEntry?.flow && (
          <p className="hint" style={{ marginTop: 10 }}>
            {tx(lang, 'Logged')}:{' '}
            <span className={`flow-pill ${todayEntry.flow}`}>
              {txd(lang, `flow.${todayEntry.flow}`, FLOWS.find((f) => f.id === todayEntry.flow)?.label ?? todayEntry.flow)}
            </span>
            {todayEntry.symptoms.length > 0 && tx(lang, '{n} symptom(s)', { n: todayEntry.symptoms.length })}
            {todayEntry.moods.length > 0 && ` · ${todayEntry.moods.map((m) => txd(lang, `mood.${m}`, m)).join(', ')}`}
          </p>
        )}
        {todayFacts?.predicted && !todayEntry?.flow && (
          <p className="hint" style={{ marginTop: 10 }}>{tx(lang, 'This is a predicted period day.')}</p>
        )}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Recent logs')}</h3>
        {recent.length === 0 ? (
          <div className="empty" style={{ padding: '18px 8px' }}>
            {tx(lang, 'Nothing logged yet. Tap Log today to start your history.')}
          </div>
        ) : (
          recent.map((e) => (
            <div key={e.date} className="recent-item" onClick={() => p.openDay(e.date)} role="button" tabIndex={0}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && p.openDay(e.date)}>
              <div className="dt">
                <div className="d1">{prettyDate(e.date, { weekday: true })}</div>
                <div className="d2">{prettyDate(e.date, { withYear: true })}</div>
              </div>
              <div className="info">
                {e.flow ? (
                  <span className={`flow-pill ${e.flow}`}>{txd(lang, `flow.${e.flow}`, FLOWS.find((f) => f.id === e.flow)?.label ?? e.flow)}</span>
                ) : (
                  <span className="flow-pill spotting" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                    {tx(lang, 'No flow')}
                  </span>
                )}
                {e.lhTest === 'positive' && <span className="tag rose" style={{ marginRight: 6 }}>LH+</span>}
                {e.checkedIn && e.symptoms.length === 0 && <span className="tag leaf" style={{ marginRight: 6 }}>✓ {tx(lang, 'checked in')}</span>}
                {e.mucus && <span className="tag gray" style={{ marginRight: 6 }}>{txd(lang, `mucus.${e.mucus}`, MUCUS_OPTIONS.find((m) => m.id === e.mucus)?.label ?? e.mucus)}</span>}
                {e.symptoms.length > 0 && <div>{e.symptoms.map((s) => txd(lang, `symptom.${s}`, s)).join(' · ')}</div>}
                {e.moods.length > 0 && <div>{e.moods.map((m) => txd(lang, `mood.${m}`, m)).join(' · ')}</div>}
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

/** Postpartum red-flag checklist (local-only, best-effort persistence). */
function RecoveryCheck({ lang }: { lang: string }) {
  const [done, setDone] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('pt.pp.check.v1');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const items = [
    'Bleeding is slowing (not soaking a pad hourly)',
    'No fever over 38°C for 24h',
    'No severe headache, vision changes, or sudden swelling',
    'No thoughts of harming yourself',
  ];
  const toggle = (t: string) =>
    setDone((prev) => {
      const next = prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
      try {
        localStorage.setItem('pt.pp.check.v1', JSON.stringify(next));
      } catch {
        /* best-effort */
      }
      return next;
    });
  return (
    <div className="card">
      <h3>🩹 {tx(lang, 'Recovery watch')}</h3>
      {items.map((t) => (
        <button
          key={t}
          type="button"
          className={`chip${done.includes(t) ? ' on' : ''}`}
          style={{ display: 'flex', margin: '0 8px 8px 0' }}
          onClick={() => toggle(t)}
        >
          {done.includes(t) ? '✓' : '○'} {tx(lang, t)}
        </button>
      ))}
      <p className="hint">{tx(lang, 'Any unchecked red flag with symptoms → call your clinician or maternity line now.')}</p>
    </div>
  );
}

/** Brief postpartum mood screen (PHQ-2 style). Nudge, never diagnosis. */
function PostpartumMood({ p, lang }: { p: AppProps; lang: string }) {
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const done = a !== null && b !== null;
  const score = (a ?? 0) + (b ?? 0);
  const last = p.settings.ppMood;
  const ask = (label: string, v: number | null, set: (n: number) => void) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{label}</div>
      <div className="chips" style={{ marginTop: 6 }}>
        {[0, 1, 2, 3].map((n) => (
          <button key={n} type="button" className={`chip${v === n ? ' on' : ''}`} onClick={() => set(n)}>
            {n}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: '4px 0 0' }}>0 = {tx(lang, 'not at all')} · 3 = {tx(lang, 'nearly every day')}</p>
    </div>
  );
  return (
    <div className="card">
      <h3>💜 {tx(lang, 'How have the last 2 weeks felt?')}</h3>
      {ask(tx(lang, 'Little interest or pleasure in things'), a, setA)}
      {ask(tx(lang, 'Feeling down or hopeless'), b, setB)}
      {done && (
        <p style={{ fontSize: 13.5, fontWeight: 800, margin: '10px 0 0' }}>
          {score >= 3
            ? tx(lang, 'Score {n}/6 — worth a call to your clinician or midwife today. Help exists and works.', { n: score })
            : tx(lang, 'Score {n}/6 — in the typical range. Keep an eye on it.', { n: score })}
        </p>
      )}
      {done && (
        <button
          className="btn ghost sm"
          style={{ marginTop: 8 }}
          onClick={() => p.updateSettings({ ppMood: { date: todayISO(), score } })}
        >
          {tx(lang, 'Save result')}
        </button>
      )}
      {last && (
        <p className="hint" style={{ marginTop: 8 }}>
          {tx(lang, 'Last screen {date}: {n}/6', { date: prettyDate(last.date, { withYear: true }), n: last.score })}
        </p>
      )}
    </div>
  );
}

/** Postpartum LAM status card: 3 criteria, countdown, lochia guide. */
function LamCard({ p, lang }: { p: AppProps; lang: string }) {
  const today = todayISO();
  const pp = p.settings.postpartum;
  const birth = pp?.birthDate ?? null;
  const babyDays = birth ? diffDays(birth, today) : null;
  const amenorrheic =
    birth != null && !Object.values(p.entries).some((e) => e.date >= birth && !!e.flow);
  const exclusive = pp?.exclusiveBF === true;
  const under6mo = babyDays != null && babyDays >= 0 && babyDays < 183;
  const lamOk = amenorrheic && exclusive && under6mo;
  const crit = (ok: boolean, text: string) => (
    <div style={{ fontSize: 13.5, padding: '3px 0' }}>
      {ok ? '✓' : '○'} {text}
    </div>
  );
  return (
    <div className="card">
      <h3>🍼 {tx(lang, 'Postpartum & feeding')}</h3>
      {!birth ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          {tx(lang, 'Add the birth date in Settings → Mode to unlock LAM tracking.')}
        </p>
      ) : (
        <>
          {crit(under6mo, tx(lang, 'Baby under 6 months ({n} days old)', { n: babyDays ?? '?' }))}
          {crit(exclusive, tx(lang, 'Near-full breastfeeding, no formula or solids'))}
          {crit(amenorrheic, tx(lang, 'No period since birth'))}
          <p style={{ fontSize: 13.5, fontWeight: 800, margin: '8px 0 0' }}>
            {lamOk
              ? tx(lang, 'LAM criteria met (~98% effective). {n} days of cover left.', { n: 183 - (babyDays ?? 0) })
              : tx(lang, 'LAM not met — use backup contraception.')}
          </p>
        </>
      )}
      <p className="hint" style={{ marginTop: 8 }}>
        {tx(lang, 'Bleeding in the first weeks is usually lochia, not a period. And ovulation can return before the first period — even while breastfeeding.')}
      </p>
    </div>
  );
}

function addDaysLocal(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
