import { useMemo, useState } from 'react';
import { AppProps } from '../App';
import { frequency, regularity } from '../lib/cycle';
import { episodeSummary, trackingCompleteness, windowStats } from '../lib/stats';
import { prettyDate } from '../lib/date';
import { FLOWS } from '../types';

export default function Report(p: AppProps & { closeReport: () => void }) {
  const [months, setMonths] = useState<6 | 12>(6);
  const [sections, setSections] = useState({
    cycles: true,
    symptoms: true,
    measurements: true,
    fertility: false,
    notes: false,
  });

  const data = useMemo(() => {
    const clusters = episodeSummary(p.stats.clusters, months);
    const since = clusters.length ? clusters[0].start : null;
    const lens = p.stats.cycleLengths.slice(-months === 6 ? -6 : -12);
    const entries = Object.values(p.entries).filter((e) => (since ? e.date >= since : true));
    return { clusters, lens, entries, since };
  }, [p.entries, p.stats, months]);

  const completeness = trackingCompleteness(p.entries);
  const w = windowStats(p.stats.cycleLengths, months);
  const reg = regularity(p.stats);
  const symptoms = frequency(p.entries, 'symptoms').slice(0, 10);
  const moods = frequency(p.entries, 'moods').slice(0, 5);
  const bbts = data.entries.filter((e) => e.bbt != null);
  const weights = data.entries.filter((e) => e.weight != null);
  const lhs = data.entries.filter((e) => e.lhTest);
  const notes = data.entries.filter((e) => e.note.trim());

  return (
    <div className="report-wrap">
      <div className="no-print">
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={p.closeReport}>← Back</button>
        <div className="card">
          <h3>Clinician summary</h3>
          <p className="hint" style={{ marginBottom: 12 }}>
            A printable snapshot of your tracking. Sensitive sections are opt-in and excluded unless you enable them.
          </p>
          <div className="field">
            <label>Period covered</label>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className={months === 6 ? 'on' : ''} onClick={() => setMonths(6)}>Last 6 months</button>
              <button className={months === 12 ? 'on' : ''} onClick={() => setMonths(12)}>Last 12 months</button>
            </div>
          </div>
          <div className="field">
            <label>Include</label>
            <div className="chips">
              <button className={`chip${sections.cycles ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, cycles: !s.cycles }))}>Cycles & bleeding</button>
              <button className={`chip${sections.symptoms ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, symptoms: !s.symptoms }))}>Symptoms & mood</button>
              <button className={`chip${sections.measurements ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, measurements: !s.measurements }))}>Temperature & weight</button>
              <button className={`chip${sections.fertility ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, fertility: !s.fertility }))}>Fertility signs</button>
              <button className={`chip${sections.notes ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, notes: !s.notes }))}>Notes</button>
            </div>
          </div>
          <button className="btn primary" onClick={() => window.print()}>🖨️ Print / save as PDF</button>
        </div>
      </div>

      <div className="print-sheet" id="report-sheet">
        <h2>Period Tracker — cycle summary</h2>
        <p className="meta">
          Generated {prettyDate(new Date().toISOString().slice(0, 10), { withYear: true, weekday: true })} · period: last {months} months ·
          patient-generated data, informational only
        </p>

        <h3>Tracking overview</h3>
        <p>
          Cycles logged (all time): {p.stats.cycleLengths.length} · tracking completeness: {completeness.pct}% of days since first log ({completeness.logged}/{completeness.total} days) ·
          regularity read: {reg.label}{reg.variation !== null ? ` (±${reg.variation.toFixed(1)}d)` : ''}
        </p>

        {sections.cycles && (
          <>
            <h3>Bleeding episodes</h3>
            <table>
              <thead>
                <tr><th>Start</th><th>End</th><th>Days</th><th>Heaviest flow</th></tr>
              </thead>
              <tbody>
                {data.clusters.map((c) => {
                  const flows = data.entries.filter((e) => e.date >= c.start && e.date <= c.end && e.flow);
                  const rank = { spotting: 0, light: 1, medium: 2, heavy: 3 } as const;
                  const heaviest = flows.reduce<string | null>((acc, e) => (!acc || rank[e.flow!] > rank[acc as keyof typeof rank] ? e.flow : acc), null);
                  return (
                    <tr key={c.start}>
                      <td>{prettyDate(c.start, { withYear: true })}</td>
                      <td>{prettyDate(c.end, { withYear: true })}</td>
                      <td>{c.length}</td>
                      <td>{heaviest ? FLOWS.find((f) => f.id === heaviest)?.label : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p>
              Cycle length stats (window): median {w.median ?? '—'}d · mean {w.mean ?? '—'}d · shortest {w.shortest ?? '—'}d · longest {w.longest ?? '—'}d · range {w.range ?? '—'}d
              {w.slope !== null && ` · trend ${w.slope < 0 ? 'shortening' : 'lengthening'} ~${Math.abs(w.slope).toFixed(1)}d/cycle`}
            </p>
          </>
        )}

        {sections.symptoms && (
          <>
            <h3>Most-logged symptoms</h3>
            <p>{symptoms.length ? symptoms.map((s) => `${s.name} (${s.count})`).join(', ') : 'None logged'}</p>
            <h3>Most-logged moods</h3>
            <p>{moods.length ? moods.map((s) => `${s.name} (${s.count})`).join(', ') : 'None logged'}</p>
          </>
        )}

        {sections.measurements && (
          <>
            <h3>Basal body temperature</h3>
            <p>
              {bbts.length
                ? `${bbts.length} readings, ${Math.min(...bbts.map((e) => e.bbt!)).toFixed(1)}–${Math.max(...bbts.map((e) => e.bbt!)).toFixed(1)} °C (latest ${prettyDate(bbts[bbts.length - 1].date)})`
                : 'None logged'}
            </p>
            <h3>Weight</h3>
            <p>
              {weights.length
                ? `${weights.length} entries, latest ${weights[weights.length - 1].weight!.toFixed(1)} kg (${prettyDate(weights[weights.length - 1].date)})`
                : 'None logged'}
            </p>
          </>
        )}

        {sections.fertility && (
          <>
            <h3>Fertility signs</h3>
            <p>
              {lhs.length
                ? lhs.map((e) => `${prettyDate(e.date)}: LH ${e.lhTest}`).join(' · ')
                : 'No ovulation tests logged'}
            </p>
            <p>
              Current estimate: next period {p.stats.nextStart ? prettyDate(p.stats.nextStart, { withYear: true }) : '—'} (±{p.stats.uncertaintyDays}d){p.stats.fertileSuppressed && ' · fertility forecasts suppressed (hormonal contraception)'}
            </p>
          </>
        )}

        {sections.notes && notes.length > 0 && (
          <>
            <h3>Notes</h3>
            <ul>
              {notes.slice(-20).map((e) => (
                <li key={e.date}>{prettyDate(e.date, { withYear: true })}: {e.note}</li>
              ))}
            </ul>
          </>
        )}

        <p className="footnote">
          Patient-generated using a local-first tracking app. Estimates use the calendar method and are not clinical
          measurements. Predictions are informational, not diagnostic.
        </p>
      </div>
    </div>
  );
}
