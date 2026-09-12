import { useMemo, useState } from 'react';
import { AppProps } from '../App';
import { frequency, regularity } from '../lib/cycle';
import { episodeSummary, trackingCompleteness, windowStats } from '../lib/stats';
import { entriesToCSV, entriesToFHIR } from '../lib/storage';
import { tx, txd } from '../lib/i18n';
import { prettyDate } from '../lib/date';
import { todayISO } from '../lib/date';
import { FLOWS } from '../types';

export default function Report(p: AppProps & { closeReport: () => void }) {
  const lang = p.settings.lang;
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
    const lens = p.stats.cycleLengths.slice(months === 6 ? -6 : -12);
    const entries = Object.values(p.entries).filter((e) => (since ? e.date >= since : true));
    return { clusters, lens, entries, since };
  }, [p.entries, p.stats, months]);

  const completeness = trackingCompleteness(p.entries);
  const w = windowStats(p.stats.cycleLengths, months);
  const reg = regularity(p.stats);
  const symptoms = frequency(p.entries, 'symptoms').slice(0, 10);
  const moods = frequency(p.entries, 'moods').slice(0, 5);
  const bbts = data.entries.filter((e) => e.bbt != null).sort((a, b) => a.date.localeCompare(b.date));
  const weights = data.entries.filter((e) => e.weight != null).sort((a, b) => a.date.localeCompare(b.date));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const dispTemp = (c: number) => (p.settings.tempUnit === 'F' ? round2((c * 9) / 5 + 32) : round2(c));
  const dispWeight = (kg: number) => (p.settings.weightUnit === 'lb' ? round2(kg * 2.20462) : round2(kg));
  const lhs = data.entries.filter((e) => e.lhTest);
  const notes = data.entries.filter((e) => e.note.trim());

  return (
    <div className="report-wrap">
      <div className="no-print">
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={p.closeReport}>← {tx(lang, 'Back')}</button>
        <div className="card">
          <h3>{tx(lang, 'Clinician summary')}</h3>
          <p className="hint" style={{ marginBottom: 12 }}>
            {tx(lang, 'A printable snapshot of your tracking. Sensitive sections are opt-in and excluded unless you enable them.')}
          </p>
          <div className="field">
            <label>{tx(lang, 'Period covered')}</label>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className={months === 6 ? 'on' : ''} onClick={() => setMonths(6)}>{tx(lang, 'Last 6 months')}</button>
              <button className={months === 12 ? 'on' : ''} onClick={() => setMonths(12)}>{tx(lang, 'Last 12 months')}</button>
            </div>
          </div>
          <div className="field">
            <label>{tx(lang, 'Include')}</label>
            <div className="chips">
              <button className={`chip${sections.cycles ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, cycles: !s.cycles }))}>{tx(lang, 'Cycles & bleeding')}</button>
              <button className={`chip${sections.symptoms ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, symptoms: !s.symptoms }))}>{tx(lang, 'Symptoms & mood')}</button>
              <button className={`chip${sections.measurements ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, measurements: !s.measurements }))}>{tx(lang, 'Temperature & weight')}</button>
              <button className={`chip${sections.fertility ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, fertility: !s.fertility }))}>{tx(lang, 'Fertility signs')}</button>
              <button className={`chip${sections.notes ? ' on' : ''}`} onClick={() => setSections((s) => ({ ...s, notes: !s.notes }))}>{tx(lang, 'Notes')}</button>
            </div>
          </div>
          <button className="btn primary" onClick={() => {
            // print-to-PDF takes the document title as filename
            const prev = document.title;
            document.title = `period-tracker-summary-${months}mo-${todayISO()}`;
            window.print();
            window.setTimeout(() => {
              document.title = prev;
            }, 500);
          }}>🖨️ {tx(lang, 'Print / save as PDF')}</button>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => {
            const blob = new Blob([entriesToCSV(p.entries)], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `period-tracker-${todayISO()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}>{tx(lang, 'Export CSV')}</button>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => {
            const blob = new Blob([entriesToFHIR(p.entries)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `period-tracker-fhir-${todayISO()}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}>{tx(lang, 'Export FHIR')}</button>
        </div>
      </div>

      <div className="print-sheet" id="report-sheet">
        <h2>{tx(lang, 'Period Tracker: cycle summary')}</h2>
        <p className="meta">
          {tx(lang, 'Generated {date} · period: last {m} months · patient-generated data, informational only', {
            date: prettyDate(todayISO(), { withYear: true, weekday: true }),
            m: months,
          })}
        </p>

        <h3>{tx(lang, 'Tracking overview')}</h3>
        <p>
          {tx(lang, 'Cycles logged (all time): {n} · tracking completeness: {pct}% of days since first log ({logged}/{total} days) · regularity read: {label}{variation}', {
            n: p.stats.cycleLengths.length,
            pct: completeness.pct,
            logged: completeness.logged,
            total: completeness.total,
            label: tx(lang, reg.label),
            variation: reg.variation !== null ? tx(lang, ' (±{v}d)', { v: reg.variation.toFixed(1) }) : '',
          })}
        </p>

        {sections.cycles && (
          <>
            <h3>{tx(lang, 'Bleeding episodes')}</h3>
            <table>
              <thead>
                <tr><th>{tx(lang, 'Start')}</th><th>{tx(lang, 'End')}</th><th>{tx(lang, 'Days')}</th><th>{tx(lang, 'Heaviest flow')}</th></tr>
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
                      <td>{heaviest ? txd(lang, `flow.${heaviest}`, FLOWS.find((f) => f.id === heaviest)?.label ?? heaviest) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p>
              {tx(lang, 'Cycle length stats (window): median {med}d · mean {mean}d · shortest {short}d · longest {long}d · range {r}d{trend}', {
                med: w.median ?? '-',
                mean: w.mean ?? '-',
                short: w.shortest ?? '-',
                long: w.longest ?? '-',
                r: w.range ?? '-',
                trend:
                  w.slope !== null
                    ? tx(lang, w.slope < 0 ? 'trend shortening ~{v} d/cycle' : 'trend lengthening ~{v} d/cycle', {
                        v: Math.abs(w.slope).toFixed(1),
                      })
                    : '',
              })}
            </p>
          </>
        )}

        {sections.symptoms && (
          <>
            <h3>{tx(lang, 'Most logged symptoms')}</h3>
            <p>{symptoms.length ? symptoms.map((s) => `${txd(lang, `symptom.${s.name}`, s.name)} (${s.count})`).join(', ') : tx(lang, 'None logged')}</p>
            <h3>{tx(lang, 'Most logged moods')}</h3>
            <p>{moods.length ? moods.map((s) => `${txd(lang, `mood.${s.name}`, s.name)} (${s.count})`).join(', ') : tx(lang, 'None logged')}</p>
            <PainEndoReport entries={data.entries} lang={lang} />
          </>
        )}

        {sections.measurements && (
          <>
            <h3>{tx(lang, 'Basal body temperature')}</h3>
            <p>
              {bbts.length
                ? tx(lang, '{n} readings, {lo}-{hi}°{u} (latest {date})', {
                    n: bbts.length,
                    lo: dispTemp(Math.min(...bbts.map((e) => e.bbt!))).toFixed(1),
                    hi: dispTemp(Math.max(...bbts.map((e) => e.bbt!))).toFixed(1),
                    u: p.settings.tempUnit,
                    date: prettyDate(bbts[bbts.length - 1].date),
                  })
                : tx(lang, 'None logged')}
            </p>
            <h3>{tx(lang, 'Weight')}</h3>
            <p>
              {weights.length
                ? tx(lang, '{n} entries, latest {v}{u} ({date})', {
                    n: weights.length,
                    v: dispWeight(weights[weights.length - 1].weight!).toFixed(1),
                    u: p.settings.weightUnit,
                    date: prettyDate(weights[weights.length - 1].date),
                  })
                : tx(lang, 'None logged')}
            </p>
          </>
        )}

        {sections.fertility && (
          <>
            <h3>{tx(lang, 'Fertility signs')}</h3>
            <p>
              {lhs.length
                ? lhs.map((e) => `${prettyDate(e.date)}: LH ${e.lhTest}`).join(' · ')
                : tx(lang, 'No ovulation tests logged')}
            </p>
            <p>
              {tx(lang, 'Current estimate: next period {date} (±{u}d)', {
                date: p.stats.nextStart ? prettyDate(p.stats.nextStart, { withYear: true }) : '-',
                u: p.stats.uncertaintyDays,
              })}
              {p.stats.fertileSuppressed && !p.settings.teen && ' · ' + tx(lang, 'fertility forecasts suppressed (hormonal contraception)')}
            </p>
          </>
        )}

        {sections.notes && notes.length > 0 && (
          <>
            <h3>{tx(lang, 'Notes')}</h3>
            <ul>
              {notes.slice(-20).map((e) => (
                <li key={e.date}>{prettyDate(e.date, { withYear: true })}: {e.note}</li>
              ))}
            </ul>
          </>
        )}

        <p className="footnote">
          {tx(lang, 'Patient generated using a local first tracking app. Estimates use the calendar method and are not clinical measurements. Predictions are informational, not diagnostic.')}
        </p>
      </div>
    </div>
  );
}

/** Pain + endo summary for the clinician report (0–10 readings, areas, flares). */
function PainEndoReport({ entries, lang }: { entries: import('../types').DayEntry[]; lang: string }) {
  const pains = entries.filter((e) => e.painLevel != null);
  const flares = entries.filter((e) => e.endoFlare);
  if (!pains.length && !flares.length) return null;
  const vals = pains.map((e) => e.painLevel!);
  const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
  const areas: Record<string, number> = {};
  for (const e of entries) for (const a of e.painAreas ?? []) areas[a] = (areas[a] ?? 0) + 1;
  const topAreas = Object.entries(areas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const gi = entries.filter((e) => e.giIssues).length;
  const bladder = entries.filter((e) => e.bladderPain).length;
  return (
    <>
      <h3>{tx(lang, 'Pain & pelvic')}</h3>
      <p>
        {pains.length > 0 &&
          tx(lang, 'Pain logged {n} days, avg {v}/10, worst {w}/10.', {
            n: pains.length,
            v: avg ?? '-',
            w: vals.length ? Math.max(...vals) : '-',
          })}{' '}
        {topAreas.length > 0 &&
          tx(lang, 'Top areas: {list}.', {
            list: topAreas.map(([a, c]) => `${txd(lang, `pain.${a}`, a)} ×${c}`).join(', '),
          })}{' '}
        {flares.length > 0 && tx(lang, '{n} endo flare days.', { n: flares.length })}{' '}
        {gi > 0 && tx(lang, '{n} days with bowel/GI issues.', { n: gi })}{' '}
        {bladder > 0 && tx(lang, '{n} days with bladder pain.', { n: bladder })}
      </p>
    </>
  );
}
