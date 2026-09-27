/**
 * First-party product analytics. No third-party SDK, no cookies, no fingerprinting.
 * Events queue locally and flush in small batches to POST /api/event.
 * Best-effort: failures are swallowed so analytics can never break the app.
 * Never log free text, note bodies, symptoms, passwords, or OTP codes —
 * only screen names, action names, counts, booleans, and durations.
 */
import { loadSession } from './cloud';
import { apiUrl } from './native';
import { APP_VERSION } from '../types';

export type AnalyticsMeta = Record<string, string | number | boolean | null>;

interface QueuedEvent {
  type: string;
  meta: AnalyticsMeta;
}

const queue: QueuedEvent[] = [];
const MAX_QUEUE = 200;
let flushTimer: number | null = null;
let sessionLogged = false;
let sessionEndSent = false;

function hasDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/** Fire-and-forget flush. Exported for tests. */
export async function flushAnalytics(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, 50);
  try {
    const token = loadSession()?.token ?? null;
    await fetch(apiUrl('/api/event'), {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ events: batch.map((e) => ({ type: e.type, meta: e.meta })) }),
    });
  } catch {
    /* analytics must never break the app; drop the batch */
  }
  if (queue.length > 0) scheduleFlush();
}

/** Exported for tests. */
export function pendingAnalyticsCount(): number {
  return queue.length;
}

function scheduleFlush(): void {
  if (flushTimer !== null || !hasDom()) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, 4000);
}

/** Core track call. Type allowlist is enforced server-side. */
export function track(type: string, meta: AnalyticsMeta = {}): void {
  queue.push({ type, meta });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  scheduleFlush();
  if (hasDom()) {
    try {
      if (document.visibilityState === 'hidden') void flushAnalytics();
    } catch {
      /* ignore */
    }
  }
}

/** Convenience for action clicks: track('action', { action: name, ...meta }). */
export function trackAction(action: string, meta: AnalyticsMeta = {}): void {
  track('action', { action, ...meta });
}

// ---------- screens + durations ----------

let currentScreen: { name: string; start: number } | null = null;

function now(): number {
  return Date.now();
}

/**
 * Call whenever the visible screen changes. Logs page_view for the new
 * screen and page_time (ms) for the one being left. No-op on repeats.
 */
export function trackScreen(name: string): void {
  const t = now();
  if (currentScreen && currentScreen.name !== name) {
    const ms = Math.max(0, t - currentScreen.start);
    // cap at 30 min so background tabs don't skew averages
    track('page_time', { screen: currentScreen.name, ms: Math.min(ms, 30 * 60 * 1000) });
  }
  if (!currentScreen || currentScreen.name !== name) {
    currentScreen = { name, start: t };
    track('page_view', { screen: name });
  }
}

// ---------- sessions ----------

export function trackSessionStart(extra: AnalyticsMeta = {}): void {
  if (sessionLogged) return;
  sessionLogged = true;
  sessionEndSent = false;
  track('session_start', { appVersion: APP_VERSION, ...extra });
  if (hasDom()) {
    const end = () => trackSessionEnd();
    try {
      window.addEventListener('pagehide', end, { once: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flushAnalytics();
      });
    } catch {
      /* ignore */
    }
  }
}

let sessionStartTs = 0;

export function markSessionStart(): void {
  sessionStartTs = now();
}

export function trackSessionEnd(): void {
  if (sessionEndSent) return;
  sessionEndSent = true;
  const ms = sessionStartTs > 0 ? Math.max(0, now() - sessionStartTs) : 0;
  track('page_time', { screen: '__session__', ms: Math.min(ms, 12 * 60 * 60 * 1000) });
  track('session_end', { ms: Math.min(ms, 12 * 60 * 60 * 1000) });
  void flushAnalytics();
}

// ---------- hover (desktop pointer dwell on key CTAs) ----------

const hoverLastSent: Record<string, number> = {};

/**
 * Log pointer dwell time on a labelled control. Throttled: one event per
 * label per 5 minutes, and only for dwells >= 400ms, to keep volume sane.
 */
export function trackHover(label: string, ms: number): void {
  if (ms < 400) return;
  const last = hoverLastSent[label] ?? 0;
  if (now() - last < 5 * 60 * 1000) return;
  hoverLastSent[label] = now();
  track('hover_nav', { label, ms: Math.round(ms) });
}
