/**
 * Deep perf attribution · answers "which element made it slow?" without a
 * dependency. `layout-shift` entries carry their sources, `event` entries carry
 * their target, so we log a CSS-ish selector instead of just a number.
 * Chromium-only detail; other engines report the metric with `target: null`.
 */

import { track } from './beacon';

const max = 6;

/** Short, stable-ish path to an element: id > class > tag, capped at 4 steps. */
function selectorFor(node: EventTarget | null | undefined): string | null {
  const el = node as Element | null;
  if (!el || typeof (el as Element).tagName !== 'string') return null;
  if (el.id) return `#${el.id}`;
  const parts: string[] = [];
  let cur: Element | null = el;
  for (let i = 0; i < 4 && cur && cur.tagName; i++) {
    const cls = String(cur.className || '').trim().split(/\s+/)[0];
    parts.unshift(cls ? `${cur.tagName.toLowerCase()}.${cls}` : cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return parts.join('>').slice(0, 80);
}

let sent = false;
let idleTimer = 0;

const clsShifts: { v: number; src: string | null }[] = [];
const inpHits: { id: number; ms: number; target: string | null }[] = [];

function observe(type: string, cb: (e: PerformanceEntry) => void): void {
  try {
    new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({
      type,
      buffered: true,
    } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }
}

/** Feed the same aggregation as vitals.ts · imported to avoid a cycle. */
function flush(reason: string): void {
  if (sent) return;
  sent = true;
  clearTimeout(idleTimer);
  track('screen_perf_attr', {
    reason,
    // biggest shift first · that IS the culprit
    clsTop: clsShifts
      .slice()
      .sort((a, b) => b.v - a.v)
      .slice(0, max)
      .map((s) => ({ v: Math.round(s.v * 1000) / 1000, src: s.src })),
    inpTop: inpHits
      .slice()
      .sort((a, b) => b.ms - a.ms)
      .slice(0, max)
      .map((h) => ({ id: h.id, ms: Math.round(h.ms), target: h.target })),
  });
}

/** Call from the same boot effect as initVitals(). */
export function initPerfAttribution(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  try {
    if (sessionStorage.getItem('pt.sec.attr')) return;
    sessionStorage.setItem('pt.sec.attr', '1');
  } catch { /* private mode: still observe */ }

  observe('layout-shift', (e) => {
    const s = e as unknown as {
      value: number;
      hadRecentInput: boolean;
      sources?: { node?: EventTarget | null }[];
    };
    if (s.hadRecentInput || !s.value) return;
    if (clsShifts.length < 20) clsShifts.push({ v: s.value, src: selectorFor(s.sources?.[0]?.node) });
  });

  observe('event', (e) => {
    const t = e as unknown as PerformanceEventTiming & {
      interactionId?: number;
      target?: EventTarget | null;
    };
    if (!t.interactionId || !t.duration) return;
    const hit = inpHits.find((h) => h.id === t.interactionId);
    if (hit) {
      hit.ms = Math.max(hit.ms, t.duration);
      if (!hit.target) hit.target = selectorFor(t.target);
    } else if (inpHits.length < 20) {
      inpHits.push({ id: t.interactionId, ms: t.duration, target: selectorFor(t.target) });
    }
  });

  const onHide = () => { if (document.visibilityState === 'hidden') flush('hidden'); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => flush('pagehide'));
  idleTimer = window.setTimeout(() => flush('idle'), 125_000);
}