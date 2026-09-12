import { useState, type ReactNode } from 'react';
import { AppProps } from '../App';
import { frequency, regularity } from '../lib/cycle';
import { adherenceConfidence, detectThermalShift, marquetteStatus, patternCards, perimenstrualMigraine, symptomsByPhase, trackingCompleteness, variabilityPhenotype, windowStats } from '../lib/stats';
import { addDays, diffDays, todayISO } from '../lib/date';
import { prettyDate } from '../lib/date';
import { tx, txd } from '../lib/i18n';
import { DayEntry } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;

function LineChart({ points, format }: { points: { date: string; value: number }[]; format: (v: number) => string }) {
  const W = 320;
  const H = 130;
  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(max - min, 0.001);
  const x = (i: number) => padL + (plotW * i) / Math.max(points.length - 1, 1);
  const y = (v: number) => padT + plotH * (1 - (v - min) / span);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart">
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--border)" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--border)" />
      <text x={padL - 3} y={y(max) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{format(max)}</text>
      <text x={padL - 3} y={y(min) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{format(min)}</text>
      <line x1={padL} y1={y(avg)} x2={W - padR} y2={y(avg)} stroke="var(--rose-400)" strokeDasharray="4 3" />
      <text x={W - padR} y={y(avg) - 3} fontSize="8" fill="var(--rose-600)" textAnchor="end" fontWeight="700">avg {format(avg)}</text>
      <path d={path} fill="none" stroke="var(--rose-600)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.date} cx={x(i)} cy={y(p.value)} r="2.2" fill="var(--rose-600)" />
      ))}
      <text x={padL} y={H - 7} fontSize="7.5" fill="var(--muted)">{prettyDate(points[0].date).replace(',', '')}</text>
      <text x={W - padR} y={H - 7} fontSize="7.5" fill="var(--muted)" textAnchor="end">
        {prettyDate(points[points.length - 1].date).replace(',', '')}
      </text>
    </svg>
  );
}

function series(entries: Record<string, DayEntry>, key: 'bbt' | 'weight'): { date: string; value: number }[] {
  return Object.values(entries)
    .filter((e) => e[key] != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-45)
    .map((e) => ({ date: e.date, value: e[key] as number }));
}

export default function Insights(p: AppProps) {
  const { stats, settings } = p;
  const lang = settings.lang;
  const [win, setWin] = useState<6 | 12>(6);
  const reg = regularity(stats);
  const symptoms = frequency(p.entries, 'symptoms').slice(0, 8);
  const moods = frequency(p.entries, 'moods').slice(0, 8);
  const userExcluded = new Set(settings.excludedStarts ?? []);
  const lensPairs = (() => {
    const pairs: { len: number; start: string; prev: string; valid: boolean }[] = [];
    for (let i = 1; i < stats.clusters.length; i++) {
      const prev = stats.clusters[i - 1].start;
      const start = stats.clusters[i].start;
      const len = diffDays(prev, start);
      const valid = len >= 15 && len <= 90 && !userExcluded.has(prev) && !userExcluded.has(start);
      pairs.push({ len, start, prev, valid });
    }
    return pairs.slice(-12);
  })();
  const lens = lensPairs.filter((x) => x.valid).map((x) => x.len);
  const maxLen = Math.max(...lens, 45);
  const minLen = Math.min(...lens, 15);
  const bbtPoints = series(p.entries, 'bbt');
  const weightPoints = series(p.entries, 'weight');
  const lhPositives = Object.values(p.entries)
    .filter((e) => e.lhTest === 'positive')
    .sort((a, b) => b.date.localeCompare(a.date));
  const w = windowStats(stats.cycleLengths, win);
  const comp = trackingCompleteness(p.entries);
  const patterns = patternCards(p.entries, stats, p.facts, settings);
  const phases = symptomsByPhase(p.entries, stats, p.facts);
  const cutoff = addDays(todayISO(), -60);
  const recentShift = (() => {
    const s = detectThermalShift(p.entries);
    if (!s) return null;
    // stale shifts (before the current cycle / older than 60d) aren't live clues
    if (stats.lastStart && s.date < stats.lastStart) return null;
    if (s.date < cutoff) return null;
    return s;
  })();
  const shift = recentShift;
  const fertileMucus = Object.values(p.entries)
    .filter((e) => (e.mucus === 'eggwhite' || e.mucus === 'watery') && e.date >= cutoff && (!stats.lastStart || e.date >= stats.lastStart))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (stats.clusters.length === 0) {
    return (
      <>
        <div className="card" style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn ghost sm" onClick={p.openReport}>🖨️ {tx(lang, 'Clinician report')}</button>
        </div>
        <div className="card">
          <div className="empty">
            <div className="big">📊</div>
            <strong>{tx(lang, 'No data yet')}</strong>
            <br />
            <br />
            {tx(lang, 'Log at least one period and your patterns will appear here. Cycle lengths, regularity, temperatures, and your most frequent symptoms and moods.')}
          </div>
        </div>
      </>
    );
  }

  // SVG bar chart geometry
  const W = 320;
  const H = 150;
  const padL = 26;
  const padB = 22;
  const padT = 14;
  const plotH = H - padB - padT;
  const bw = lensPairs.length ? Math.min(34, (W - padL - 8) / lensPairs.length - 8) : 0;
  const y = (v: number) => padT + plotH * (1 - (v - minLen + 2) / (maxLen - minLen + 4));

  return (
    <>
      <div className="stat-row">
        <div className="stat"><div className="v">{w.median ?? stats.avgCycle}d</div><div className="l">{tx(lang, 'Median cycle')}</div></div>
        <div className="stat"><div className="v">{stats.avgPeriod}d</div><div className="l">{tx(lang, 'Avg period')}</div></div>
        <div className="stat"><div className="v">{stats.cycleLengths.length}</div><div className="l">{tx(lang, 'Cycles logged')}</div></div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
          <button className={win === 6 ? 'on' : ''} onClick={() => setWin(6)}>{tx(lang, '6 cycles')}</button>
          <button className={win === 12 ? 'on' : ''} onClick={() => setWin(12)}>{tx(lang, '12 cycles')}</button>
        </div>
        <button className="btn ghost sm" onClick={p.openReport}>🖨️ {tx(lang, 'Clinician report')}</button>
      </div>

      <div className="card">
        <h3>{tx(lang, 'Window statistics')}</h3>
        <div className="kv-grid">
          <span>{tx(lang, 'Median')}</span><strong>{w.median ?? '-'} d</strong>
          <span>{tx(lang, 'Mean')}</span><strong>{w.mean ?? '-'} d</strong>
          <span>{tx(lang, 'Shortest / longest')}</span><strong>{w.shortest ?? '-'} / {w.longest ?? '-'} d</strong>
          <span>{tx(lang, 'Range')}</span><strong>{w.range ?? '-'} d</strong>
          <span>{tx(lang, 'Trend')}</span><strong>{w.slope === null ? '-' : tx(lang, '{sign}{v} d/cycle', { sign: w.slope < 0 ? '-' : '+', v: Math.abs(w.slope).toFixed(1) })}</strong>
          <span>{tx(lang, 'Completeness')}</span><strong>{comp.pct}% {tx(lang, 'of days')}</strong>
        </div>
        {comp.total > 0 && (
          <p className="hint">{tx(lang, 'Explicit daily check ins improve phase analysis.')}</p>
        )}
      </div>

      {patterns.length > 0 && (
        <div className="card">
          <h3>{tx(lang, 'Patterns')}</h3>
          {patterns.map((c) => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{c.title}</div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '4px 0 0' }}>{c.detail}</p>
            </div>
          ))}
          <p className="hint">{tx(lang, 'Deterministic observations from your logs - patterns, not diagnoses.')}</p>
        </div>
      )}

      <div className="card">
        <h3>{tx(lang, 'Regularity')}</h3>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rose-600)' }}>{tx(lang, reg.label)}</div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '6px 0 0' }}>{tx(lang, reg.note)}</p>
        {reg.variation !== null && (
          <p className="hint">{tx(lang, 'Cycle to cycle variation: ±{v} days (last {n} cycles)', { v: reg.variation.toFixed(1), n: Math.min(6, stats.cycleLengths.length) })}</p>
        )}
      </div>

      {settings.mode === 'ttc' && <TtcCard p={p} />}
      {settings.mode === 'perimenopause' && <PeriCard p={p} />}
      <PmddCard p={p} />
      <EvidenceCards p={p} />

      {lens.length >= 1 && (
        <div className="card">
          <h3>{tx(lang, 'Cycle lengths')}</h3>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart of your recent cycle lengths">
            <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--border)" strokeWidth="1" />
            <line x1={padL} y1={H - padB} x2={W - 4} y2={H - padB} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 4} y={y(maxLen) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{maxLen}</text>
            <text x={padL - 4} y={y(minLen) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{minLen}</text>
            {lens.length > 1 && (
              <>
                <line
                  x1={padL} y1={y(stats.avgCycle)} x2={W - 4} y2={y(stats.avgCycle)}
                  stroke="var(--rose-400)" strokeWidth="1" strokeDasharray="4 3"
                />
                <text x={W - 6} y={y(stats.avgCycle) - 3} fontSize="8" fill="var(--rose-600)" textAnchor="end" fontWeight="700">
                  avg {stats.avgCycle}d
                </text>
              </>
            )}
            {lensPairs.map((pair, i) => {
              const x = padL + 10 + i * ((W - padL - 12) / Math.max(lensPairs.length, 1));
              const h = H - padB - y(pair.len);
              const start = pair.start;
              return (
                <g
                  key={start}
                  onClick={() => {
                    const cur = settings.excludedStarts ?? [];
                    p.updateSettings({
                      excludedStarts: cur.includes(start) ? cur.filter((s) => s !== start) : [...cur, start],
                    });
                  }}
                  style={{ cursor: 'pointer', opacity: pair.valid ? (i === lensPairs.length - 1 ? 1 : 0.85) : 0.3 }}
                >
                  <title>{pair.valid ? tx(lang, 'Tap to exclude from predictions') : tx(lang, 'Excluded from predictions — tap to include')}</title>
                  <rect x={x} y={y(pair.len)} width={bw} height={Math.max(h, 2)} rx="4" fill="var(--rose-600)" />
                  <text x={x + bw / 2} y={y(pair.len) - 4} fontSize="8.5" fill="var(--text)" textAnchor="middle" fontWeight="700">{pair.len}</text>
                  {start && (
                    <text x={x + bw / 2} y={H - 9} fontSize="7" fill="var(--muted)" textAnchor="middle">
                      {prettyDate(start).replace(',', '')}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="hint" style={{ textAlign: 'center' }}>{tx(lang, 'Days between period starts - your last {n} cycle{s}', { n: lensPairs.length, s: lensPairs.length === 1 ? '' : 's' })} · {tx(lang, 'Tap a bar to exclude an outlier cycle.')}</p>
        </div>
      )}

      {bbtPoints.length >= 3 && (
        <div className="card">
          <h3>{tx(lang, 'Basal body temperature (°{u})', { u: settings.tempUnit })}</h3>
          <LineChart
            points={bbtPoints}
            format={(v) => (settings.tempUnit === 'F' ? round2((v * 9) / 5 + 32).toFixed(1) : v.toFixed(1))}
          />
          <p className="hint" style={{ textAlign: 'center' }}>
            {tx(lang, 'A sustained rise of ~0.2-0.5°C after ovulation is the classic post ovulatory shift.')}
          </p>
        </div>
      )}

      {weightPoints.length >= 3 && (
        <div className="card">
          <h3>{tx(lang, 'Weight ({u})', { u: settings.weightUnit })}</h3>
          <LineChart
            points={weightPoints}
            format={(v) =>
              (settings.weightUnit === 'lb' ? round2(v * 2.20462) : round2(v)).toFixed(1)
            }
          />
        </div>
      )}

      {(shift || fertileMucus.length > 0) && (
        <div className="card">
          <h3>{tx(lang, 'Fertility clues')}</h3>          {shift && (
            <p style={{ fontSize: 13.5, margin: '0 0 8px' }}>
              🌡️ {tx(lang, 'Sustained temperature rise on {date} (+{v}°C) — ovulation likely the day before. A clue, not proof.', { date: prettyDate(shift.date, { weekday: true }), v: shift.rise })}
            </p>
          )}
          {fertileMucus.length > 0 && (
            <p style={{ fontSize: 13.5, margin: 0 }}>
              💧 {tx(lang, 'Fertile-type discharge on {dates}.', { dates: fertileMucus.map((e) => prettyDate(e.date)).join(', ') })}
            </p>
          )}
          {stats.lastStart &&
            lhPositives.some((e) => e.date >= stats.lastStart!) &&
            fertileMucus.some((e) => e.date >= stats.lastStart!) && (
              <p style={{ fontSize: 13.5, margin: '8px 0 0', fontWeight: 700 }}>
                ✓ {tx(lang, 'LH surge plus peak discharge this cycle — double-confirmed fertile marker.')}
              </p>
            )}
          {marquetteStatus(p.entries, stats.lastStart) === 'double' && (
            <p style={{ fontSize: 13.5, margin: '8px 0 0' }}>
              {tx(lang, 'Monitor peak plus mucus peak agree — fertile through 3 full days past the peak day (Marquette rule).')}
            </p>
          )}
          <p className="hint">{tx(lang, 'Estimates only — not contraception.')}</p>
        </div>
      )}

      {lhPositives.length > 0 && (
        <div className="card">
          <h3>{tx(lang, 'Positive LH tests')}</h3>
          {lhPositives.slice(0, 5).map((e) => (
            <div key={e.date} className="freq-row">
              <div className="name">{prettyDate(e.date, { withYear: true })}</div>
              <div className="bar-bg" style={{ flex: 1 }} />
              <div className="n">LH+</div>
            </div>
          ))}
        </div>
      )}

      {symptoms.length > 0 && (
        <div className="card">
          <h3>{tx(lang, 'Symptoms by phase')}</h3>
          {phases.map((ph) => (
            <div key={ph.phase} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <strong style={{ width: 82, flex: 'none' }}>{txd(lang, `phase.${ph.phase.toLowerCase()}`, ph.phase)}</strong>
              <span style={{ color: 'var(--text-2)' }}>
                {ph.days > 0
                  ? ph.topSymptoms.length
                    ? ph.topSymptoms.map((s) => `${txd(lang, `symptom.${s.name}`, s.name)} ×${s.count}`).join(' · ')
                    : tx(lang, 'no symptoms logged')
                  : tx(lang, 'no check ins')}
              </span>
            </div>
          ))}
          <p className="hint">{tx(lang, 'Counted only on days with an explicit check in, so silent days don\'t dilute the picture.')}</p>
        </div>
      )}

      {symptoms.length > 0 && (
        <div className="card">
          <h3>{tx(lang, 'Most logged symptoms')}</h3>
          {symptoms.map((s) => (
            <div key={s.name} className="freq-row">
              <div className="name">{txd(lang, `symptom.${s.name}`, s.name)}</div>
              <div className="bar-bg"><div className="bar" style={{ width: `${(s.count / symptoms[0].count) * 100}%` }} /></div>
              <div className="n">{s.count}</div>
            </div>
          ))}
        </div>
      )}

      {moods.length > 0 && (
        <div className="card">
          <h3>{tx(lang, 'Most logged moods')}</h3>
          {moods.map((m) => (
            <div key={m.name} className="freq-row">
              <div className="name">{txd(lang, `mood.${m.name}`, m.name)}</div>
              <div className="bar-bg"><div className="bar" style={{ width: `${(m.count / moods[0].count) * 100}%` }} /></div>
              <div className="n">{m.count}</div>
            </div>
          ))}
        </div>
      )}

      <MoveCard p={p} />
    </>
  );
}

/** TTC: fertile-window timing coverage + daily logging streak, this cycle. */
function TtcCard({ p }: { p: AppProps }) {
  const lang = p.settings.lang;
  const today = todayISO();
  const start = p.stats.lastStart;
  const fertileDays = start
    ? [...p.facts.keys()].filter((d) => d >= start && d <= today && p.facts.get(d)?.fertile)
    : [];
  const covered = fertileDays.filter((d) => p.entries[d]?.intercourse);
  let streak = 0;
  let d = p.entries[today]?.checkedIn ? today : addDays(today, -1);
  while (p.entries[d]?.checkedIn) {
    streak++;
    d = addDays(d, -1);
  }
  return (
    <div className="card">
      <h3>{tx(lang, 'Trying to conceive · this cycle')}</h3>      <div className="kv-grid">
        <span>{tx(lang, 'Fertile days covered')}</span>
        <strong>
          {fertileDays.length ? `${covered.length} / ${fertileDays.length}` : '-'}
        </strong>
        <span>{tx(lang, 'Logging streak')}</span>
        <strong>{streak > 0 ? tx(lang, '{n} day{s}', { n: streak, s: streak === 1 ? '' : 's' }) : '-'}</strong>
        <span>{tx(lang, 'LH+ this cycle')}</span>
        <strong>
          {start ? Object.values(p.entries).filter((e) => e.date >= start && e.lhTest === 'positive').length : '-'}
        </strong>
      </div>
      <p className="hint">{tx(lang, 'Coverage counts fertile-window days with intimacy logged. Every-other-day through the window is the standard guidance.')}</p>
      {p.settings.priorMethod && p.settings.priorMethod !== 'none' && (
        <p className="hint">
          {tx(lang, 'Coming off {m} can delay ovulation return for a few cycles — give predictions time to relearn.', {
            m: txd(lang, `cm.${p.settings.priorMethod}`, p.settings.priorMethod),
          })}
        </p>
      )}
      {p.settings.tryingSince && diffDays(p.settings.tryingSince, today) >= 365 && (
        <p style={{ fontSize: 13.5, fontWeight: 700, margin: '8px 0 0' }}>
          {tx(lang, 'Trying 12+ months? Guidelines suggest a fertility checkup — bring this log.')}
        </p>
      )}
    </div>
  );
}

/** Perimenopause: variability snapshot — longest cycle, long-cycle share, current gap. */function PeriCard({ p }: { p: AppProps }) {
  const lang = p.settings.lang;
  const lens = p.stats.cycleLengths;
  const long = lens.filter((l) => l >= 45);
  const gap = p.stats.lastStart ? diffDays(p.stats.lastStart, todayISO()) : null;
  return (
    <div className="card">
      <h3>{tx(lang, 'Perimenopause · variability')}</h3>
      <div className="kv-grid">
        <span>{tx(lang, 'Longest cycle')}</span>
        <strong>{lens.length ? `${Math.max(...lens)} days` : '-'}</strong>
        <span>{tx(lang, 'Cycles ≥ 45 days')}</span>
        <strong>{lens.length ? `${long.length} of ${lens.length}` : '-'}</strong>
        <span>{tx(lang, 'Days since last period')}</span>
        <strong>{gap ?? '-'}</strong>
      </div>
      <p className="hint">{tx(lang, 'Widening gaps and skipped cycles are the hallmark pattern. This snapshot travels well to appointments.')}</p>
    </div>
  );
}

/** Evidence-anchored cards: luteal length, anovulation, short cycles, peak mucus, migraine window. */
function EvidenceCards({ p }: { p: AppProps }) {
  const { stats, settings } = p;
  const lang = settings.lang;
  const cards: ReactNode[] = [];
  const adherence = adherenceConfidence(p.entries);

  if (adherence.low) {
    cards.push(
      <div className="card" key="adherence">
        <h3>{tx(lang, 'Low logging confidence')}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          {tx(lang, 'Only {n}% of days have entries, and gaps look like missing logs — not biology. Forecasts stay cautious until logging steadies.', { n: adherence.pct })}
        </p>
      </div>
    );
  }

  if (stats.cycleLengths.length >= 3) {
    const pheno = variabilityPhenotype(stats.cycleLengths);
    if (pheno !== 'stable') {
      cards.push(
        <div className="card" key="pheno">
          <h3>{tx(lang, 'Variable pattern')}</h3>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
            {pheno === 'highly-variable'
              ? tx(lang, 'Your cycles vary a lot — predictions use extra-wide windows. Tap outlier bars above to exclude sick/stress months.')
              : tx(lang, 'Your cycles vary somewhat — predictions already widen for that.')}
          </p>
        </div>
      );
    }
  }

  if (stats.ovuEvidenceCount > 0) {
    const verdict =
      stats.lutealLength <= 9
        ? tx(lang, 'Short (≤9 days) — worth mentioning to a clinician.')
        : stats.lutealLength <= 11
          ? tx(lang, 'Borderline (10–11 days) — keep watching across cycles.')
          : tx(lang, 'Typical (12–17 days).');
    cards.push(
      <div className="card" key="luteal">
        <h3>{tx(lang, 'Luteal phase')}</h3>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{tx(lang, '{n} days', { n: stats.lutealLength })}</div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '6px 0 0' }}>
          {tx(lang, 'Learned from {n} positive LH test(s). {v}', { n: stats.ovuEvidenceCount, v: verdict })}
        </p>
      </div>
    );
  }

  const everLH = Object.values(p.entries).some((e) => e.lhTest === 'positive');
  const everBBT = Object.values(p.entries).some((e) => e.bbt != null);
  const everMucus = Object.values(p.entries).some((e) => e.mucus === 'eggwhite' || e.mucus === 'watery');
  if (stats.cycleLengths.length >= 2 && !everLH && !everBBT && !everMucus) {
    cards.push(
      <div className="card" key="anov">
        <h3>{tx(lang, 'Ovulation unconfirmed')}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          {tx(lang, 'Regular bleeding does not confirm ovulation — only about two-thirds of regular cycles ovulate. Log LH tests, temperature, or discharge to confirm.')}
        </p>
      </div>
    );
  }

  if (stats.cycleLengths.length >= 2 && stats.avgCycle < 30) {
    cards.push(
      <div className="card" key="short">
        <h3>{tx(lang, 'Shorter cycles')}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          {tx(lang, 'Your average is {n} days. Cycles around 30–31 days are the most fecund on average — one data point, not a diagnosis.', { n: stats.avgCycle })}
        </p>
      </div>
    );
  }

  if (stats.lastStart) {
    const today = todayISO();
    const peak = [...p.facts.keys()]
      .filter((d) => d >= stats.lastStart! && d <= today && p.facts.get(d)?.fertile)
      .filter((d) => p.entries[d]?.mucus === 'eggwhite')
      .sort();
    if (peak.length > 0) {
      cards.push(
        <div className="card" key="peak">
          <h3>{tx(lang, 'Peak fertility markers')}</h3>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
            {tx(lang, 'Egg-white discharge on fertile days ({dates}) — the strongest at-home fertility sign.', {
              dates: peak.slice(0, 5).map((d) => prettyDate(d)).join(', '),
            })}
          </p>
        </div>
      );
    }
  }

  const mig = perimenstrualMigraine(p.entries, stats.clusters);
  if (mig.total >= 3 && mig.inWindow / mig.total >= 0.5) {
    cards.push(
      <div className="card" key="mig">
        <h3>{tx(lang, 'Headache timing')}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          {tx(lang, '{a} of {b} headache days fall in the 2-days-before to 3-days-after window — a perimenstrual pattern worth showing a clinician.', { a: mig.inWindow, b: mig.total })}
        </p>
      </div>
    );
  }

  return <>{cards}</>;
}

/**
 * PMDD 2-cycle confirmation: once a luteal-mood pattern exists, offer a
 * structured 2-cycle check; completion yields a clinician-ready summary.
 */
function PmddCard({ p }: { p: AppProps }) {
  const lang = p.settings.lang;
  const starts = p.stats.clusters.map((c) => c.start);
  const checkStart = p.settings.pmddCheckStart;
  if (!checkStart) {
    const hasPattern = p.stats.clusters.length >= 3;
    if (!hasPattern) return null;
    return (
      <div className="card">
        <h3>{tx(lang, 'Luteal mood check')}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 12px' }}>
          {tx(lang, 'Mood patterns need 2 cycles of daily tracking to confirm — a single bad month is not PMDD.')}
        </p>
        <button className="btn ghost sm" onClick={() => p.updateSettings({ pmddCheckStart: todayISO() })}>
          {tx(lang, 'Start 2-cycle check')}
        </button>
      </div>
    );
  }
  const cyclesSince = starts.filter((s) => s >= checkStart).length;
  const done = cyclesSince >= 2;
  return (
    <div className="card">
      <h3>{tx(lang, 'Luteal mood check')} · {cyclesSince}/2</h3>
      <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 12px' }}>
        {done
          ? tx(lang, 'Two cycles tracked. Bring this log to a clinician — dated evidence is exactly how PMS and PMDD are told apart.')
          : tx(lang, 'Keep logging moods daily, especially the week before each period. {n} cycle(s) to go.', { n: 2 - cyclesSince })}
      </p>
      {done && (
        <button className="btn ghost sm" onClick={() => p.updateSettings({ pmddCheckStart: null })}>
          {tx(lang, 'Dismiss')}
        </button>
      )}
    </div>
  );
}

/** Weekly movement minutes (last 6 weeks) + med-effectiveness + trigger notes. */
function MoveCard({ p }: { p: AppProps }) {
  const lang = p.settings.lang;
  const today = todayISO();
  const weeks: { label: string; min: number }[] = [];
  for (let w = 5; w >= 0; w--) {
    const end = addDays(today, -w * 7);
    const start = addDays(end, -6);
    let min = 0;
    for (const e of Object.values(p.entries)) {
      if (e.date >= start && e.date <= end) min += e.exerciseMinutes ?? 0;
    }
    weeks.push({ label: prettyDate(start).replace(',', ''), min });
  }
  const anyMove = weeks.some((x) => x.min > 0);
  const max = Math.max(...weeks.map((x) => x.min), 1);

  // migraine med effectiveness
  const medDays = Object.values(p.entries).filter((e) => e.migraineMed);
  const helped = medDays.filter((e) => e.migraineHelped).length;

  // sleep/caffeine/alcohol triggers: top symptom rate on exposed vs rested days
  const scored = Object.values(p.entries).filter((e) => e.checkedIn && e.symptoms.length > 0);
  const freq: Record<string, number> = {};
  for (const e of scored) for (const s of e.symptoms) freq[s] = (freq[s] ?? 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
  const exposures: { key: string; label: string; test: (e: (typeof scored)[number]) => boolean }[] = [
    { key: 'sleep', label: tx(lang, 'short-sleep'), test: (e) => e.sleepHours != null && e.sleepHours < 6 },
    { key: 'caffeine', label: tx(lang, 'high-caffeine'), test: (e) => (e.caffeine ?? 0) >= 3 },
    { key: 'alcohol', label: tx(lang, 'alcohol'), test: (e) => (e.alcohol ?? 0) > 0 },
  ];
  let trigger: string | null = null;
  if (top && top[1] >= 4) {
    for (const ex of exposures) {
      const exp = scored.filter(ex.test);
      const rest = scored.filter((e) => !ex.test(e));
      if (exp.length < 3 || rest.length < 3) continue;
      const rExp = exp.filter((e) => e.symptoms.includes(top[0])).length / exp.length;
      const rRest = rest.filter((e) => e.symptoms.includes(top[0])).length / rest.length;
      if (rExp >= 2 * rRest && rExp > 0) {
        trigger = tx(
          lang,
          '{s} shows up on {a}% of {x} days vs {b}% otherwise — {x} may be a trigger worth testing.',
          {
            s: txd(lang, `symptom.${top[0]}`, top[0]),
            a: Math.round(rExp * 100),
            b: Math.round(rRest * 100),
            x: ex.label,
          }
        );
        break;
      }
    }
  }

  if (!anyMove && medDays.length === 0 && !trigger) return null;
  return (
    <div className="card">
      <h3>{tx(lang, 'Movement & what helps')}</h3>
      {anyMove && (
        <>
          {weeks.map((x) => (
            <div key={x.label} className="freq-row">
              <div className="name">{x.label}</div>
              <div className="bar-bg"><div className="bar" style={{ width: `${(x.min / max) * 100}%` }} /></div>
              <div className="n">{x.min}m</div>
            </div>
          ))}
        </>
      )}
      {medDays.length > 0 && (
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '8px 0 0' }}>
          {tx(lang, 'Migraine med helped {a} of {b} times logged.', { a: helped, b: medDays.length })}
        </p>
      )}
      {trigger && <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '8px 0 0' }}>{trigger}</p>}
      <p className="hint">{tx(lang, 'Correlations, not causes — but exactly what to test next.')}</p>
    </div>
  );
}
