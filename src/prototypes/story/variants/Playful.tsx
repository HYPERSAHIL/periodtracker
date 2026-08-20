import { useState } from 'react';

const steps = [
  { emoji: '🌙', title: 'You bleed', color: '#C94C5A', bg: '#FFF0F0', tip: 'Heat, water, rest. Log flow — even light counts.', days: 'Day 1-5' },
  { emoji: '🌱', title: 'You lift', color: '#5B7A5A', bg: '#E6F0EC', tip: 'Energy often returns. Good days to plan, move, create.', days: 'Day 6-13' },
  { emoji: '✨', title: 'You spark', color: '#2D5A5A', bg: '#E6F3F0', tip: 'Fertile window is 6 days. LH surge → ~36h to ovulation.', days: 'Day 14' },
  { emoji: '🍂', title: 'You hold', color: '#8F6F74', bg: '#F2EDE9', tip: 'Progesterone dips. Mood and cravings make sense here. Tracking makes it kinder.', days: 'Day 15-28' },
];

export default function Playful() {
  const [i, setI] = useState(0);
  const s = steps[i];

  return (
    <div style={{ minHeight: '100dvh', background: '#FFFBF8', color: '#1C1E22', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '32px 24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.08, color: '#8A8D93', textTransform: 'uppercase' }}>Playful · Companion</div>
          <div style={{ fontSize: 12, color: '#8A8D93' }}>{i + 1} / {steps.length}</div>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.03, margin: '12px 0 8px', lineHeight: 0.95 }}>A companion,<br />not a tracker.</h1>
        <p style={{ fontSize: 14, color: '#5C5F66', lineHeight: 1.6, maxWidth: 520, margin: 0 }}>Four friendly check-ins. No judgment, no “Pimpletown.” Just you and a little character who gets it.</p>
      </div>

      <div style={{ flex: 1, maxWidth: 1100, width: '100%', margin: '0 auto', padding: '24px 24px 40px', display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 24, alignItems: 'center' }}>
        {/* character stage */}
        <div style={{ background: s.bg, borderRadius: 24, padding: 24, border: '1px solid #E8E2DD', transition: 'background 400ms cubic-bezier(0.23, 1, 0.32, 1)', minHeight: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
          <div
            key={i}
            style={{
              width: 140,
              height: 140,
              borderRadius: 32,
              background: '#fff',
              border: '1px solid #E8E2DD',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 56,
              boxShadow: '0 12px 24px rgba(28,30,34,0.08)',
              animation: 'pop 420ms cubic-bezier(0.23, 1, 0.32, 1)',
            }}
          >
            {s.emoji}
          </div>
          <div key={`t-${i}`} style={{ marginTop: 16, textAlign: 'center', animation: 'fadeUp 360ms cubic-bezier(0.23, 1, 0.32, 1)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: s.color, letterSpacing: 0.08, textTransform: 'uppercase' }}>{s.days}</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: '#5C5F66', lineHeight: 1.5, marginTop: 6, maxWidth: 280 }}>{s.tip}</div>
          </div>
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
            {steps.map((_, idx) => (
              <div key={idx} style={{ width: idx === i ? 18 : 6, height: 6, borderRadius: 99, background: idx === i ? s.color : '#E8E2DD', transition: 'all 240ms cubic-bezier(0.23, 1, 0.32, 1)' }} />
            ))}
          </div>
        </div>

        {/* controls */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {steps.map((st, idx) => (
              <button
                key={st.title}
                onClick={() => setI(idx)}
                style={{
                  textAlign: 'left',
                  background: idx === i ? '#1C1E22' : '#fff',
                  color: idx === i ? '#fff' : '#1C1E22',
                  border: `1px solid ${idx === i ? '#1C1E22' : '#E8E2DD'}`,
                  borderRadius: 16,
                  padding: 16,
                  cursor: 'pointer',
                  transform: idx === i ? 'scale(1.02)' : 'none',
                  transition: 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background 160ms ease-out, border-color 160ms ease-out',
                }}
              >
                <div style={{ fontSize: 20 }}>{st.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6 }}>{st.title}</div>
                <div style={{ fontSize: 11, opacity: idx === i ? 0.7 : 0.6, marginTop: 2 }}>{st.days}</div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16, background: '#fff', border: '1px solid #E8E2DD', borderRadius: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#8A8D93', textTransform: 'uppercase', letterSpacing: 0.06 }}>Why this is playful</div>
            <div style={{ fontSize: 13, color: '#5C5F66', lineHeight: 1.6, marginTop: 6 }}>No charts to decode on day one. A character and a single sentence. You learn by tapping, not by reading a manual. The delight lives here because you see it once.</div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={() => setI((v) => (v - 1 + steps.length) % steps.length)} style={{ flex: 1, background: '#fff', border: '1px solid #E8E2DD', borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Back</button>
            <button onClick={() => setI((v) => (v + 1) % steps.length)} style={{ flex: 1, background: s.color, color: '#fff', border: `1px solid ${s.color}`, borderRadius: 12, padding: '12px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', transition: 'background 200ms ease-out, border-color 200ms ease-out' }}>Next</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pop {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          div[style*="animation: pop"], div[style*="animation: fadeUp"] { animation: none !important; }
        }
        @media (max-width: 860px) {
          div[style*="gridTemplateColumns: 0.9fr 1.1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
