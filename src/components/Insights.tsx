import { AppProps } from '../App';
import { frequency, regularity } from '../lib/cycle';
import { prettyDate } from '../lib/date';
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
  const reg = regularity(stats);
  const symptoms = frequency(p.entries, 'symptoms').slice(0, 8);
  const moods = frequency(p.entries, 'moods').slice(0, 8);
  const lens = stats.cycleLengths.slice(-12);
  const maxLen = Math.max(...lens, 45);
  const minLen = Math.min(...lens, 15);
  const bbtPoints = series(p.entries, 'bbt');
  const weightPoints = series(p.entries, 'weight');
  const lhPositives = Object.values(p.entries)
    .filter((e) => e.lhTest === 'positive')
    .sort((a, b) => b.date.localeCompare(a.date));

  if (stats.clusters.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">📊</div>
          <strong>No data yet</strong>
          <br />
          <br />
          Log at least one period and your patterns will appear here — cycle lengths, regularity,
          temperatures, and your most frequent symptoms and moods.
        </div>
      </div>
    );
  }

  // SVG bar chart geometry
  const W = 320;
  const H = 150;
  const padL = 26;
  const padB = 22;
  const padT = 14;
  const plotH = H - padB - padT;
  const bw = lens.length ? Math.min(34, (W - padL - 8) / lens.length - 8) : 0;
  const y = (v: number) => padT + plotH * (1 - (v - minLen + 2) / (maxLen - minLen + 4));

  return (
    <>
      <div className="stat-row">
        <div className="stat"><div className="v">{stats.avgCycle}d</div><div className="l">Avg cycle length</div></div>
        <div className="stat"><div className="v">{stats.avgPeriod}d</div><div className="l">Avg period</div></div>
        <div className="stat"><div className="v">{stats.cycleLengths.length}</div><div className="l">Cycles logged</div></div>
      </div>

      <div className="card">
        <h3>Regularity</h3>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--rose-600)' }}>{reg.label}</div>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '6px 0 0' }}>{reg.note}</p>
        {reg.variation !== null && (
          <p className="hint">Cycle-to-cycle variation: ±{reg.variation.toFixed(1)} days (last {Math.min(6, stats.cycleLengths.length)} cycles)</p>
        )}
      </div>

      {lens.length >= 1 && (
        <div className="card">
          <h3>Cycle lengths</h3>
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
            {lens.map((len, i) => {
              const x = padL + 10 + i * ((W - padL - 12) / Math.max(lens.length, 1));
              const h = H - padB - y(len);
              const start = stats.clusters[i]?.start;
              return (
                <g key={i}>
                  <rect x={x} y={y(len)} width={bw} height={Math.max(h, 2)} rx="4" fill="var(--rose-600)" opacity={i === lens.length - 1 ? 1 : 0.75} />
                  <text x={x + bw / 2} y={y(len) - 4} fontSize="8.5" fill="var(--text)" textAnchor="middle" fontWeight="700">{len}</text>
                  {start && (
                    <text x={x + bw / 2} y={H - 9} fontSize="7" fill="var(--muted)" textAnchor="middle">
                      {prettyDate(start).replace(',', '')}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="hint" style={{ textAlign: 'center' }}>Days between period starts — your last {lens.length} cycle{lens.length === 1 ? '' : 's'}</p>
        </div>
      )}

      {bbtPoints.length >= 3 && (
        <div className="card">
          <h3>Basal body temperature (°{settings.tempUnit})</h3>
          <LineChart
            points={bbtPoints}
            format={(v) => (settings.tempUnit === 'F' ? round2((v * 9) / 5 + 32).toFixed(1) : v.toFixed(1))}
          />
          <p className="hint" style={{ textAlign: 'center' }}>
            A sustained rise of ~0.2–0.5°C after ovulation is the classic post-ovulatory shift.
          </p>
        </div>
      )}

      {weightPoints.length >= 3 && (
        <div className="card">
          <h3>Weight ({settings.weightUnit})</h3>
          <LineChart
            points={weightPoints}
            format={(v) =>
              (settings.weightUnit === 'lb' ? round2(v * 2.20462) : round2(v)).toFixed(1)
            }
          />
        </div>
      )}

      {lhPositives.length > 0 && (
        <div className="card">
          <h3>Positive LH tests</h3>
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
          <h3>Most-logged symptoms</h3>
          {symptoms.map((s) => (
            <div key={s.name} className="freq-row">
              <div className="name">{s.name}</div>
              <div className="bar-bg"><div className="bar" style={{ width: `${(s.count / symptoms[0].count) * 100}%` }} /></div>
              <div className="n">{s.count}</div>
            </div>
          ))}
        </div>
      )}

      {moods.length > 0 && (
        <div className="card">
          <h3>Most-logged moods</h3>
          {moods.map((m) => (
            <div key={m.name} className="freq-row">
              <div className="name">{m.name}</div>
              <div className="bar-bg"><div className="bar" style={{ width: `${(m.count / moods[0].count) * 100}%` }} /></div>
              <div className="n">{m.count}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
