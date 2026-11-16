/**
 * Funnel telemetry → POST /api/event (allowlisted server-side, lands in the
 * owner's admin Activity feed). Fire-and-forget: never throws, never blocks UI.
 * Events fired in the same tick are batched into ONE request — boot emits a
 * dozen beacons, and one round trip per beacon was costing seconds on mobile.
 * Failed sends are counted in localStorage and self-report on the next
 * successful send as data_beacon_status { failed, recovered }.
 */

import { apiUrl, isNative } from './native';
import { APP_VERSION } from '../types';

const FAILS_KEY = 'pt.beacon.fails';
let fails = (() => {
  try {
    return Number(localStorage.getItem(FAILS_KEY)) || 0;
  } catch {
    return 0;
  }
})();

const bumpFail = (n = 1) => {
  fails += n;
  try {
    localStorage.setItem(FAILS_KEY, String(fails));
  } catch {
    /* counter is best-effort */
  }
};

/** Timestamp of the most recent beacon send · error rows carry the gap. */
export let lastBeaconAt = 0;

/** Session token for beacon attribution · read live (sign-in/out needs no
    reload to take effect). Web-only: on native the API is cross-origin and an
    extra header would trigger a preflight the worker does not answer. */
function authHeader(): Record<string, string> {
  if (typeof navigator !== 'undefined' && isNative()) return {};
  try {
    const raw = localStorage.getItem('pt.cloud.v1');
    const t = raw && (JSON.parse(raw) as { token?: string }).token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

type QueuedEvent = { type: string; meta?: Record<string, unknown> };
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const events = queue;
  queue = [];
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // no radio wake for a batch that cannot land; not counted as a failure
      return;
    }
    void fetch(apiUrl('/api/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      // keepalive: unload-path beacons survive the navigation that triggered them
      keepalive: true,
      body: JSON.stringify({
        events: events.map((e) => ({ type: e.type, meta: { ...e.meta, appVersion: APP_VERSION } })),
      }),
    })
      .then((res) => {
        if (!res.ok) {
          bumpFail(events.length);
          return;
        }
        if (fails > 0) {
          const n = fails;
          fails = 0;
          try {
            localStorage.removeItem(FAILS_KEY);
          } catch {
            /* counter is best-effort */
          }
          if (!events.some((e) => e.type === 'data_beacon_status')) {
            track('data_beacon_status', { failed: n, recovered: true });
          }
        }
      })
      .catch(() => bumpFail(events.length));
  } catch {
    /* telemetry must never break the app */
  }
}

export function track(type: string, meta?: Record<string, unknown>): void {
  lastBeaconAt = Date.now();
  try {
    queue.push({ type, meta });
    // one microtask-level coalescing window groups boot's synchronous beacons;
    // pagehide/unload beacons flush immediately (keepalive keeps them alive)
    if (type === 'screen_vitals' || type === 'screen_pageleave') flush();
    else if (timer === null) timer = setTimeout(flush, 0);
  } catch {
    /* telemetry must never break the app */
  }
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
