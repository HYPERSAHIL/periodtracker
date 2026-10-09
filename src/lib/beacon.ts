/**
 * Funnel telemetry → POST /api/event (allowlisted server-side, lands in the
 * owner's admin Activity feed). Fire-and-forget: never throws, never blocks UI.
 * Failed sends are counted in localStorage and self-report on the next
 * successful send as data_beacon_status { failed, recovered }.
 */

import { apiUrl } from './native';
import { APP_VERSION } from '../types';

const FAILS_KEY = 'pt.beacon.fails';
let fails = (() => {
  try {
    return Number(localStorage.getItem(FAILS_KEY)) || 0;
  } catch {
    return 0;
  }
})();

const bumpFail = () => {
  fails += 1;
  try {
    localStorage.setItem(FAILS_KEY, String(fails));
  } catch {
    /* counter is best-effort */
  }
};

/** Timestamp of the most recent beacon send · error rows carry the gap. */
export let lastBeaconAt = 0;

export function track(type: string, meta?: Record<string, unknown>): void {
  try {
    lastBeaconAt = Date.now();
    void fetch(apiUrl('/api/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive: unload-path beacons survive the navigation that triggered them
      keepalive: type === 'screen_vitals' || type === 'screen_pageleave',
      body: JSON.stringify({ type, meta: { ...meta, appVersion: APP_VERSION } }),
    })
      .then((res) => {
        if (!res.ok) {
          bumpFail();
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
          if (type !== 'data_beacon_status') track('data_beacon_status', { failed: n, recovered: true });
        }
      })
      .catch(bumpFail);
  } catch {
    /* telemetry must never break the app */
  }
}
