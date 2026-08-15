import { AppProps } from '../App';
import { frequency, regularity } from '../lib/cycle';
import { prettyDate } from '../lib/date';

export default function Insights(p: AppProps) {
  const { stats } = p;
  const reg = regularity(stats);
  const symptoms = frequency(p.entries, 'symptoms').slice(0, 8);
  const moods = frequency(p.entries, 'moods').slice(0, 8);
  const lens = stats.cycleLengths.slice(-12);
  const maxLen = Math.max(...lens, 45);
  const minLen = Math.min(...lens, 15);

  if (stats.clusters.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">📊</div>
          <strong>No data yet</strong>
          <br />
          <br />
          Log at least one period and your patterns will appear here — cycle lengths, regularity,
          and your most frequent symptoms and moods.
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
            {/* y-axis */}
            <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="var(--border)" strokeWidth="1" />
            <line x1={padL} y1={H - padB} x2={W - 4} y2={H - padB} stroke="var(--border)" strokeWidth="1" />
            <text x={padL - 4} y={y(maxLen) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{maxLen}</text>
            <text x={padL - 4} y={y(minLen) + 3} fontSize="8" fill="var(--muted)" textAnchor="end">{minLen}</text>
            {/* average line */}
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
