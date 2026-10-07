/**
 * Core Web Vitals + long-task jank — one `screen_vitals` beacon per session.
 * Buffered PerformanceObservers, flushed once on hide/leave. Nothing renders,
 * nothing blocks, no dependency: the web platform already ships the metrics.
 */

import { track } from './beacon';

const MAX_LONG_MS = 5_000; // a single task over this is a freeze, not jank

let inited = false;
let sent = false;
let idleTimer = 0;

const v = {
  lcp: null as number | null,
  cls: 0,
  inp: null as number | null,
  interactions: 0,
  fcp: null as number | null,
  ttfb: null as number | null,
  longTasks: 0,
  maxLong: 0,
  sumLong: 0,
};

function flush(reason: string): void {
  if (sent) return;
  sent = true;
  clearTimeout(idleTimer);
  if (v.ttfb == null) {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    v.ttfb = nav ? nav.responseStart : null;
  }
  track('screen_vitals', {
    reason,
    lcpMs: v.lcp != null ? Math.round(v.lcp) : null,
    cls: Math.round(v.cls * 1000) / 1000,
    inpMs: v.inp != null ? Math.round(v.inp) : null,
    interactions: v.interactions,
    fcpMs: v.fcp != null ? Math.round(v.fcp) : null,
    ttfbMs: v.ttfb != null ? Math.round(v.ttfb) : null,
    longTasks: v.longTasks,
    maxLongMs: Math.round(v.maxLong),
    sumLongMs: Math.round(v.sumLong),
  });
}

function observe(type: string, cb: (e: PerformanceEntry) => void): void {
  try {
    new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({
      type,
      buffered: true,
    } as PerformanceObserverInit);
  } catch {
    /* entry type unsupported in this engine */
  }
}

/** Start collecting; call once from the boot effect. */
export function initVitals(): void {
  if (inited || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  inited = true;

  observe('largest-contentful-paint', (e) => { v.lcp = e.startTime; });
  observe('paint', (e) => {
    if ((e as PerformanceEventTiming).name === 'first-contentful-paint') v.fcp = e.startTime;
  });
  observe('layout-shift', (e) => {
    const s = e as unknown as { value: number; hadRecentInput: boolean };
    if (!s.hadRecentInput) v.cls += s.value;
  });
  observe('event', (e) => {
    const t = e as unknown as PerformanceEventTiming & { interactionId?: number };
    if (t.interactionId) {
      v.interactions++;
      if (t.duration > (v.inp ?? 0)) v.inp = t.duration;
    }
  });
  observe('longtask', (e) => {
    if (e.duration > MAX_LONG_MS) return;
    v.longTasks++;
    v.sumLong += e.duration;
    if (e.duration > v.maxLong) v.maxLong = e.duration;
  });

  const onHide = () => { if (document.visibilityState === 'hidden') flush('hidden'); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => flush('pagehide'));
  // ponytail: a tab left open in the foreground for hours never hides — one
  // 2-minute snapshot beats no row at all. Raise it if INP-at-close matters.
  idleTimer = window.setTimeout(() => flush('idle'), 120_000);
}