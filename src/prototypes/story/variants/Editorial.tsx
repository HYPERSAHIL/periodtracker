import { useEffect, useRef, useState } from 'react';

const phases = [
  { n: '01', title: 'Bleed', sub: 'Day 1-5 · Menstrual', copy: 'The lining sheds. Cramps peak day 1 to 2. Rest and warmth help more than pushing through.', stat: '5d avg', color: '#C94C5A' },
  { n: '02', title: 'Rebuild', sub: 'Day 6-13 · Follicular', copy: 'Estrogen rises. Follicles mature. Many feel energy return. This is when planning feels lighter.', stat: '8d window', color: '#5B6B7A' },
  { n: '03', title: 'Release', sub: 'Day 14 · Ovulation', copy: 'An egg is released. Fertile window is the 5 days before plus the day itself. A single LH surge hints it is near.', stat: '6d fertile', color: '#2D5A5A' },
  { n: '04', title: 'Hold', sub: 'Day 15-28 · Luteal', copy: 'Progesterone rises then falls. Tender breasts and mood shifts live here. Tracking makes the pattern visible.', stat: '14d luteal', color: '#8F6F74' },
];

export default function Editorial() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) {
          const idx = Number((e.target as HTMLElement).dataset.idx);
          setActive(idx);
        }
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
    );
    refs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ background: '#F9F7F4', color: '#1C1E22' }}>
      {/* header */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 0.08, fontWeight: 800, color: '#8A8D93', textTransform: 'uppercase' }}>Period Tracker · Story</div>
          <h1 style={{ fontSize: 42, fontWeight: 800, letterSpacing: -0.03, margin: '8px 0 0', lineHeight: 0.95 }}>Your cycle,<br />in four acts.</h1>
        </div>
        <div style={{ fontSize: 13, color: '#5C5F66', maxWidth: 280, lineHeight: 1.5 }}>Scroll slowly. The phone stays, the story moves. Built for first-run understanding, not daily use.</div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 40, alignItems: 'start' }}>
        {/* left — scroll story */}
        <div>
          {phases.map((p, i) => (
            <div
              key={p.n}
              ref={(el) => { refs.current[i] = el; }}
              data-idx={i}
              style={{
                padding: '72px 0',
                borderTop: i === 0 ? '1px solid #E8E2DD' : '1px solid #E8E2DD',
                opacity: active === i ? 1 : 0.35,
                transform: active === i ? 'none' : 'translateY(4px)',
                transition: 'opacity 320ms cubic-bezier(0.23, 1, 0.32, 1), transform 320ms cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: p.color, letterSpacing: 0.08, textTransform: 'uppercase' }}>{p.n} — {p.sub}</div>
              <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.02, margin: '8px 0 10px' }}>{p.title}</h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: '#5C5F66', margin: 0, maxWidth: 420 }}>{p.copy}</p>
              <div style={{ marginTop: 14, display: 'inline-flex', padding: '6px 10px', borderRadius: 999, background: '#FFFFFF', border: '1px solid #E8E2DD', fontSize: 11, fontWeight: 800, color: '#1C1E22' }}>{p.stat}</div>
            </div>
          ))}
          <div style={{ padding: '40px 0', borderTop: '1px solid #E8E2DD' }}>
            <p style={{ fontSize: 13, color: '#8A8D93', lineHeight: 1.6, margin: 0 }}>No paywall on insights. No ads. Your pattern, not an average. This is the editorial view — calm, pinned, scroll-driven.</p>
          </div>
        </div>

        {/* right — pinned phone */}
        <div style={{ position: 'sticky', top: 24, height: 'fit-content' }}>
          <div style={{ width: 280, height: 560, margin: '0 auto', border: '10px solid #1C1E22', borderRadius: 36, background: '#0A0A0A', overflow: 'hidden', position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 90, height: 18, background: '#1C1E22', borderRadius: '0 0 14px 14px', zIndex: 2 }} />
            <div style={{ width: '100%', height: '100%', background: '#FFFFFF', padding: '22px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: `linear-gradient(135deg, ${phases[active].color}, #1C1E22)`, borderRadius: 18, padding: 16, color: '#fff', transition: 'background 320ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{phases[active].n}<span style={{ fontSize: 12, fontWeight: 700, marginLeft: 6, opacity: 0.9 }}>{phases[active].title}</span></div>
                <div style={{ fontSize: 11, opacity: 0.9, marginTop: 4 }}>{phases[active].sub}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[
                  { v: 'Sep 8', l: 'Next' },
                  { v: 'Sep 2-7', l: 'Fertile' },
                  { v: '28d', l: 'Median' },
                ].map((s) => (
                  <div key={s.l} style={{ background: '#fff', border: '1px solid #E8E2DD', borderRadius: 12, padding: '10px 6px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#1C1E22' }}>{s.v}</div>
                    <div style={{ fontSize: 7, color: '#8A8D93', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04 }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', border: '1px solid #E8E2DD', borderRadius: 14, padding: 10, flex: 1 }}>
                <div style={{ height: 6, background: '#E8E2DD', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(active + 1) * 25}%`, height: '100%', background: phases[active].color, transition: 'width 320ms cubic-bezier(0.23, 1, 0.32, 1), background 320ms cubic-bezier(0.23, 1, 0.32, 1)' }} />
                </div>
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {Array.from({ length: 21 }, (_, i) => {
                    const activeDay = active * 5 + 3;
                    const isP = i >= activeDay && i <= activeDay + 2;
                    return <div key={i} style={{ aspectRatio: '1', borderRadius: 7, background: isP ? phases[active].color : '#F2EDE9', opacity: isP ? 1 : 0.6 }} />;
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: '#5C5F66', lineHeight: 1.5 }}>{phases[active].copy}</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#8A8D93', marginTop: 10 }}>Scroll to advance · 4 acts</div>
        </div>
      </div>

      <style>{`@media (max-width: 860px) { div[style*="gridTemplateColumns: 1.1fr 0.9fr"] { grid-template-columns: 1fr !important; } div[style*="position: sticky"] { position: relative !important; top: auto !important; } }`}</style>
    </div>
  );
}
