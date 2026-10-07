/**
 * Client error fingerprinting — one row per distinct bug instead of one per
 * throw. Fingerprint = message + top stack frame + origin file, so a null-deref
 * inside a render loop collapses into a single row with a `repeats` counter that
 * increments every time it fires again. Recovers on the next clean load.
 */

import { track } from './beacon';

const KEY = 'pt.errfp.v1';
const REPORT_AFTER = 3; // repeat count that triggers the next row
const MAX_KEYS = 40;

type Store = Record<string, { n: number; last: string }>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Store;
  } catch {
    return {};
  }
}

function write(s: Store): void {
  try {
    const keys = Object.keys(s);
    if (keys.length > MAX_KEYS) {
      // drop the least recently seen so the map can't grow without bound
      keys
        .sort((a, b) => (s[a].last < s[b].last ? -1 : 1))
        .slice(0, keys.length - MAX_KEYS)
        .forEach((k) => delete s[k]);
    }
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

/** message + first meaningful frame: enough to separate bugs, stable enough to merge. */
export function fingerprint(message: string, stack: string, src: string): string {
  const frame = stack.split('\n').slice(1, 3).join('|').replace(/\d+/g, 'N').slice(0, 160);
  const raw = `${message}||${frame}||${src}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return `e${(h >>> 0).toString(36)}`;
}

/**
 * Record an error — the ONLY place screen_error is written. First sighting logs
 * the full payload; repeats increment a counter and only re-log when the count
 * crosses REPORT_AFTER (then every 5th), so a render-loop bug costs 2-3 rows
 * per session instead of one per throw.
 */
export function reportError(
  kind: 'error' | 'rejection',
  message: string,
  stack: string,
  src: string,
  extra?: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;
  const fp = fingerprint(message, stack, src);
  const store = read();
  const prev = store[fp];
  const now = new Date().toISOString();
  const n = (prev?.n || 0) + 1;
  store[fp] = { n, last: now };
  write(store);

  if (!prev) {
    track('screen_error', {
      ...extra,
      kind,
      message: message.slice(0, 300),
      src: src.slice(0, 150),
      stack: stack.slice(0, 300),
      fp,
      first: true,
    });
    return;
  }
  if (n === REPORT_AFTER || n === REPORT_AFTER * 5) {
    track('screen_error', { ...extra, kind, message: message.slice(0, 120), fp, repeats: n, last: now });
  }
}

/**
 * Cleared at boot: fingerprints accumulate within a session (so a render-loop
 * bug reports as `repeats: 3, 15, …`) and reset next visit, which keeps the
 * admin feed honest instead of showing a week-old pile.
 */
export function clearErrorFingerprints(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}