/**
 * Funnel telemetry → POST /api/event (allowlisted server-side, lands in the
 * owner's admin Activity feed). Fire-and-forget: never throws, never blocks UI.
 */

import { apiUrl } from './native';
import { APP_VERSION } from '../types';

export function track(type: string, meta?: Record<string, unknown>): void {
  try {
    void fetch(apiUrl('/api/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, meta: { ...meta, appVersion: APP_VERSION } }),
    }).catch(() => {});
  } catch {
    /* telemetry must never break the app */
  }
}
