export default function PhonePreview() {
  return (
    <div className="phone-preview" aria-hidden>
      <div className="phone-screen">
        <div className="phone-track">
          {/* Frame 1 — Home */}
          <div className="phone-frame">
            <div className="phone-mini-hero">
              <div className="pm-day">14<span style={{ fontSize: 12, fontWeight: 700, marginLeft: 4 }}>cycle day</span></div>
              <div className="pm-label">Follicular phase — steadily rising energy</div>
            </div>
            <div className="phone-mini-stats">
              <div className="phone-mini-stat"><div className="v">Sep 8</div><div className="l">Next period</div></div>
              <div className="phone-mini-stat"><div className="v">Sep 2-7</div><div className="l">Fertile</div></div>
              <div className="phone-mini-stat"><div className="v">28d</div><div className="l">Median</div></div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #F0DFDE', borderRadius: 14, padding: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#8F6F74', textTransform: 'uppercase', letterSpacing: 0.06 }}>Today</div>
              <div style={{ marginTop: 8, background: '#E11D63', color: '#fff', borderRadius: 10, padding: '8px 10px', fontSize: 11, fontWeight: 800, textAlign: 'center' }}>Log today</div>
            </div>
          </div>

          {/* Frame 2 — Calendar */}
          <div className="phone-frame m2">
            <div style={{ fontSize: 12, fontWeight: 800, textAlign: 'center' }}>August 2026</div>
            <div className="phone-mini-cal">
              {Array.from({ length: 28 }, (_, i) => {
                const n = i + 1;
                const cls = n >= 10 && n <= 14 ? 'd p' : n >= 18 && n <= 23 ? 'd f' : 'd';
                return <div key={n} className={cls}>{n}</div>;
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, fontSize: 8, color: '#8F6F74', fontWeight: 700, justifyContent: 'center' }}>
              <span>● Period</span><span style={{ color: '#E3F3EC' }}>● Fertile</span>
            </div>
          </div>

          {/* Frame 3 — Insights */}
          <div className="phone-frame m3">
            <div style={{ fontSize: 11, fontWeight: 800 }}>Insights</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <div className="phone-mini-stat"><div className="v">28d</div><div className="l">Median</div></div>
              <div className="phone-mini-stat"><div className="v">5d</div><div className="l">Period</div></div>
              <div className="phone-mini-stat"><div className="v">4</div><div className="l">Cycles</div></div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #F0DFDE', borderRadius: 14, padding: 10, height: 80, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              {[28, 27, 29, 28, 26, 28].map((h, i) => (
                <div key={i} style={{ flex: 1, background: i === 5 ? '#E11D63' : '#FCE7EE', height: `${(h - 24) * 8}px`, borderRadius: 4 }} />
              ))}
            </div>
            <div style={{ fontSize: 8, color: '#8F6F74', textAlign: 'center' }}>Your pattern, not a paywall.</div>
          </div>
        </div>
        <div className="phone-dots" aria-hidden><span /><span /><span /></div>
      </div>
    </div>
  );
}
