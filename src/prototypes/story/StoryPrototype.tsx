import { useEffect, useRef, useState } from 'react';
import Editorial from './variants/Editorial';
import Cinematic from './variants/Cinematic';
import Playful from './variants/Playful';

const variants = [
  { name: 'Editorial', Comp: Editorial },
  { name: 'Cinematic', Comp: Cinematic },
  { name: 'Playful', Comp: Playful },
];

export default function StoryPrototype() {
  const [current, setCurrent] = useState(() => {
    const v = parseInt(new URLSearchParams(window.location.search).get('v') || '1', 10);
    return Math.min(Math.max(v - 1, 0), variants.length - 1);
  });
  const [replayKey, setReplayKey] = useState(0);
  const pickerRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const moveHighlight = () => {
    const el = itemsRef.current[current];
    const hl = highlightRef.current;
    if (!el || !hl) return;
    hl.style.width = el.offsetWidth + 'px';
    hl.style.transform = `translateX(${el.offsetLeft}px)`;
  };

  useEffect(() => {
    moveHighlight();
    const onResize = () => moveHighlight();
    window.addEventListener('resize', onResize);
    // enable slide after first paint
    requestAnimationFrame(() => requestAnimationFrame(() => pickerRef.current?.setAttribute('data-ready', '')));
    return () => window.removeEventListener('resize', onResize);
  }, [current]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(current + 1));
    window.history.replaceState(null, '', url);
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/(INPUT|TEXTAREA|SELECT)/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= variants.length) setCurrent(num - 1);
      else if (e.key === 'ArrowRight') setCurrent((c) => (c + 1) % variants.length);
      else if (e.key === 'ArrowLeft') setCurrent((c) => (c - 1 + variants.length) % variants.length);
      else if (e.key === 'r' || e.key === 'R') setReplayKey((k) => k + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ActiveComp = variants[current].Comp;

  return (
    <div style={{ minHeight: '100dvh', background: '#F9F7F4' }}>
      <div key={`${current}-${replayKey}`} style={{ minHeight: '100dvh' }}>
        <ActiveComp />
      </div>

      <nav ref={pickerRef} className="proto-picker" aria-label="Prototype variants">
        <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
        {variants.map((v, i) => (
          <button
            key={v.name}
            ref={(el) => { itemsRef.current[i] = el; }}
            className="proto-picker-item"
            data-active={i === current ? '' : undefined}
            aria-current={i === current ? 'true' : undefined}
            onClick={() => setCurrent(i)}
          >
            {v.name}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={() => setReplayKey((k) => k + 1)}>
          ↻
        </button>
      </nav>

      <style>{`
        .proto-picker {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(10, 10, 10, 0.82);
          -webkit-backdrop-filter: blur(12px) saturate(1.4);
          backdrop-filter: blur(12px) saturate(1.4);
          box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.08) inset,
            0 8px 24px rgba(0, 0, 0, 0.24),
            0 2px 6px rgba(0, 0, 0, 0.12);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          line-height: 1;
          -webkit-font-smoothing: antialiased;
          user-select: none;
          -webkit-user-select: none;
        }
        .proto-picker-highlight {
          position: absolute;
          top: 4px;
          left: 0;
          height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          will-change: transform;
        }
        .proto-picker[data-ready] .proto-picker-highlight {
          transition:
            transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
            width 250ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
        }
        .proto-picker-item {
          position: relative;
          display: flex;
          align-items: center;
          height: 28px;
          padding: 0 12px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: rgba(255, 255, 255, 0.55);
          font: inherit;
          cursor: pointer;
          transition: color 150ms ease-out;
        }
        .proto-picker-item:hover { color: rgba(255, 255, 255, 0.85); }
        .proto-picker-item:active { transform: scale(0.97); }
        .proto-picker-item:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.4); outline-offset: 2px; }
        .proto-picker-item[data-active] { color: #fff; }
        .proto-picker-divider { width: 1px; height: 16px; margin: 0 4px; background: rgba(255, 255, 255, 0.12); }
        .proto-picker-replay { padding: 0 10px; font-size: 14px; }
      `}</style>
    </div>
  );
}
