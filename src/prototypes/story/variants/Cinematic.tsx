import { useEffect, useRef, useState } from 'react';

const beats = [
  { title: 'The bleed begins', day: 'Day 1', copy: 'Day 1 is not day 14. Your next period is not 14 days after the last. It is 14 days before the next. That one shift fixes most predictions.', visual: 'M' },
  { title: 'The rebuild', day: 'Day 8', copy: 'Follicles mature. Energy lifts for many. Tracking now is learning, not guessing.', visual: 'F' },
  { title: 'The window', day: 'Day 14', copy: 'Fertile window is 6 days. 5 before ovulation, the day itself, plus one. An LH surge means about 36 hours.', visual: 'O' },
  { title: 'The hold', day: 'Day 22', copy: 'Luteal phase. Progesterone holds then falls. This is where PMS lives. Your log makes it visible.', visual: 'L' },
];

export default function Cinematic() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    timer.current = window.setTimeout(() => setIdx((i) => (i + 1) % beats.length), 2600);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [idx, paused]);

  return (
    <div style={{ minHeight: '100dvh', background: '#0A0A0A', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* top bar */}
      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: 0.08, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Cinematic · Auto</div>
        <button onClick={() => setPaused((p) => !p)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {paused ? 'Play' : 'Pause'}
        </button>
      </div>

      {/* stage */}
      <div style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '24px 24px 32px', display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {beats.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: '#fff',
                    transformOrigin: 'left',
                    transform: i < idx ? 'scaleX(1)' : i === idx && !paused ? 'scaleX(1)' : 'scaleX(0)',
                    transition: i === idx && !paused ? 'transform 2600ms linear' : 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}
                />
              </div>
            ))}
          </div>

          <div key={idx} style={{ animation: 'cinIn 420ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.08, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{beats[idx].day}</div>
            <h1 style={{ fontSize: 48, fontWeight: 800, letterSpacing: -0.04, lineHeight: 0.9, margin: '8px 0 14px' }}>{beats[idx].title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)', maxWidth: 480, margin: 0 }}>{beats[idx].copy}</p>
            <div style={{ marginTop: 22, display: 'flex', gap: 8 }}>
              <button onClick={() => setIdx((i) => (i - 1 + beats.length) % beats.length)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Back</button>
              <button onClick={() => setIdx((i) => (i + 1) % beats.length)} style={{ background: '#fff', color: '#0A0A0A', border: '1px solid #fff', borderRadius: 12, padding: '10px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Next</button>
            </div>
            <div style={{ marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Auto-advances every 2.6s. Tap to control. No scroll needed.</div>
          </div>
        </div>

        {/* visual — morphing blob + phone */}
        <div style={{ position: 'relative', height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            key={idx}
            style={{
              width: 280,
              height: 460,
              borderRadius: 32,
              background: '#FFFFFF',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45), 0 8px 20px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              position: 'relative',
              animation: 'phoneFloat 5s ease-in-out infinite',
            }}
          >
            <div style={{ height: 140, background: idx === 0 ? '#C94C5A' : idx === 1 ? '#5B6B7A' : idx === 2 ? '#2D5A5A' : '#8F6F74', transition: 'background 420ms cubic-bezier(0.23, 1, 0.32, 1)', padding: 18, color: '#fff' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.08, textTransform: 'uppercase', opacity: 0.9 }}>{beats[idx].day}</div>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{beats[idx].title}</div>
            </div>
            <div style={{ padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ height: 44, borderRadius: 12, background: '#F9F7F4', border: '1px solid #E8E2DD' }} />
              <div style={{ height: 44, borderRadius: 12, background: '#F9F7F4', border: '1px solid #E8E2DD' }} />
              <div style={{ height: 90, borderRadius: 14, background: '#F9F7F4', border: '1px solid #E8E2DD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#1C1E22' }}>{beats[idx].visual}</div>
            </div>
            {/* morphing blob behind */}
            <div
              key={`blob-${idx}`}
              style={{
                position: 'absolute',
                inset: -40,
                background: `radial-gradient(600px 400px at 70% 30%, ${idx === 0 ? 'rgba(201,76,90,0.18)' : idx === 1 ? 'rgba(91,107,122,0.16)' : idx === 2 ? 'rgba(45,90,90,0.16)' : 'rgba(143,111,116,0.16)'}, transparent 60%)`,
                animation: 'blobMorph 2600ms cubic-bezier(0.23, 1, 0.32, 1)',
                pointerEvents: 'none',
              }}
            />
          </div>
          {/* film grain */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '3px 3px', opacity: 0.3, pointerEvents: 'none' }} />
        </div>
      </div>

      <style>{`
        @keyframes cinIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        @keyframes phoneFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes blobMorph {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style*="animation:"] { animation: none !important; }
        }
        @media (max-width: 860px) {
          div[style*="gridTemplateColumns: 1.2fr 0.8fr"] { grid-template-columns: 1fr !important; }
          div[style*="height: 520"] { height: 420px !important; }
        }
      `}</style>
    </div>
  );
}
