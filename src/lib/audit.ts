/**
 * Security / abuse telemetry — sec_* events into the same Activity feed.
 * Detection and forensics only: nothing here blocks, sanitizes, or alters
 * behaviour; we log what we see and keep rendering exactly as before.
 */

import { track } from './beacon';
import { apiUrl, isNative } from './native';

/** Fire a sec_ event (type truncated to the 40-char allowlist). */
export function sec(type: string, meta?: Record<string, unknown>): void {
  track(`sec_${type}`.slice(0, 40), meta);
}

// --- injection attempts -------------------------------------------------
// Patterns seen in XSS/SQLi/path-traversal payloads. We only *log* matches.
const INJECTION: Array<[RegExp, string]> = [
  [/<\s*script/i, 'script_tag'],
  [/javascript\s*:/i, 'javascript_uri'],
  [/vbscript\s*:/i, 'vbscript_uri'],
  [/data\s*:\s*text\/html/i, 'data_html_uri'],
  [/<\s*(iframe|object|embed|svg|math|body|video|audio|form)\b/i, 'html_embed'],
  [/\bon(error|load|click|mouseover|focus|toggle|animationstart)\s*=/i, 'html_handler'],
  [/<\s*!--/i, 'html_comment'],
  [/\.\.\//, 'path_traversal'],
  [/\\\.\.\\/, 'path_traversal_win'],
  [/\/etc\/passwd/i, 'etc_passwd'],
  [/union\s+select/i, 'sqli_union'],
  [/\bdrop\s+(table|database)\b/i, 'sqli_drop'],
  [/('\s*or\s*'?\s*1\s*=\s*1)|(\bor\b\s+1\s*=\s*1)/i, 'sqli_or1'],
  [/\b(sleep|benchmark|load_file|pg_sleep)\s*\(/i, 'sqli_fn'],
  [/;\s*(shutdown|drop)\b/i, 'sqli_stack'],
  [/\{\{[^}]{0,40}\}\}|\$\{[^}]{0,40}\}/, 'template_inject'],
  [/srcdoc\s*=/i, 'srcdoc'],
  [/(<|%3c)\s*svg\b/i, 'svg_xss'],
  [/base64[,"']/i, 'base64_blob'],
];

/** Returns the pattern name if the value carries an injection-shaped payload. */
export function scanInjection(value: string): string | null {
  if (!value) return null;
  if (value.includes(String.fromCharCode(0))) return 'null_byte';
  for (const [re, name] of INJECTION) if (re.test(value)) return name;
  return null;
}

/** Log an injection match with an excerpt of what triggered it. */
export function noteInjection(where: string, value: string, extra?: Record<string, unknown>): void {
  const pattern = scanInjection(value);
  if (!pattern) return;
  sec('injection', { where, pattern, excerpt: value.slice(0, 200), ...extra });
}

/** Scan every URL parameter for injection-shaped values. */
export function scanUrl(): void {
  try {
    const params = new URLSearchParams(location.search);
    for (const [k, v] of params) noteInjection(`url:${k.slice(0, 50)}`, v, { param: k.slice(0, 50) });
    if (location.hash.length > 1) noteInjection('url:hash', location.hash.slice(1, 2000));
  } catch {
    /* malformed URL is itself uninteresting */
  }
}

// --- abuse thresholds ---------------------------------------------------
const fails: Record<string, number> = {};
/** Count auth failures; signal every 5th as a brute-force pattern. */
export function noteAuthFailure(kind: string): void {
  const n = (fails[kind] ?? 0) + 1;
  fails[kind] = n;
  if (n >= 5 && n % 5 === 0) sec('bruteforce_signal', { kind, count: n });
}

// --- global fetch audit -------------------------------------------------
let fetchInited = false;
/** Log any fetch that leaves our own origins (beacon/API excluded by origin allow). */
export function initFetchAudit(): void {
  if (fetchInited || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  fetchInited = true;
  const orig = window.fetch.bind(window);
  let allowed: string;
  try {
    allowed = new URL(apiUrl('/api/event'), location.href).origin;
  } catch {
    allowed = location.origin;
  }
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const abs = new URL(raw, location.href);
      if (abs.origin !== location.origin && abs.origin !== allowed) {
        sec('fetch_cross_origin', { origin: abs.origin, path: abs.pathname.slice(0, 200) });
      }
    } catch {
      /* unparsable target is logged by the caller's own error path */
    }
    return orig(input, init);
  };
}

// --- boot posture checks ------------------------------------------------
export function runBootSecurityChecks(): void {
  // mixed content / non-HTTPS delivery
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    sec('insecure_context', { protocol: location.protocol });
  }
  // framed → clickjacking surface
  try {
    if (window.self !== window.top) sec('framed', { referrer: document.referrer.slice(0, 200) });
  } catch {
    sec('framed', { referrer: document.referrer.slice(0, 200), crossOrigin: true });
  }
  // prototype pollution: Object.prototype should have zero enumerable keys
  try {
    const extra = Object.keys(Object.prototype);
    if (extra.length) sec('proto_polluted', { keys: extra.slice(0, 10).join(',').slice(0, 200) });
  } catch {
    /* probe failure is suspicious too, but keep boot clean */
  }
  // active service worker must be same-origin
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const url = navigator.serviceWorker.controller.scriptURL;
      if (new URL(url, location.href).origin !== location.origin) sec('sw_origin', { url: url.slice(0, 200) });
    }
  } catch {
    /* controller probe is best-effort */
  }
  // devtools heuristic: outer vs inner viewport gap
  try {
    const dw = window.outerWidth - window.innerWidth;
    const dh = window.outerHeight - window.innerHeight;
    if (dw > 160 || dh > 160) sec('devtools_open', { dw, dh });
  } catch {
    /* some browsers omit outer* */
  }
  // security headers on our own document (web only — native has no server doc)
  if (!isNative()) {
    fetch(location.href, { method: 'HEAD', cache: 'no-store' })
      .then((res) => {
        const want = [
          'content-security-policy',
          'x-frame-options',
          'strict-transport-security',
          'x-content-type-options',
          'referrer-policy',
        ];
        const missing = want.filter((h) => !res.headers.has(h));
        if (missing.length) sec('headers_missing', { missing: missing.join(','), status: res.status });
      })
      .catch(() => {
        /* offline boot: nothing to assert */
      });
  }
}

// --- storage integrity (tamper detection, not protection) ---------------
// ponytail: FNV-1a detects casual localStorage edits between save and load;
// swap for SubtleCrypto HMAC if hostile-tamper ever matters.
const INTEGRITY_KEY = 'pt.integrity.v1';

export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function writeIntegrity(part: 'entries' | 'settings', data: string): void {
  try {
    const raw = localStorage.getItem(INTEGRITY_KEY);
    const rec: Record<string, string> = raw ? JSON.parse(raw) : {};
    rec[part] = fnv1a(data);
    localStorage.setItem(INTEGRITY_KEY, JSON.stringify(rec));
  } catch {
    // a failed baseline would false-positive next boot — drop it instead
    try {
      localStorage.removeItem(INTEGRITY_KEY);
    } catch {
      /* nothing left to do */
    }
  }
}

export function verifyIntegrity(part: 'entries' | 'settings', data: string): void {
  try {
    const raw = localStorage.getItem(INTEGRITY_KEY);
    if (!raw) return;
    const rec = JSON.parse(raw) as Record<string, string>;
    const want = rec[part];
    if (want && want !== fnv1a(data)) {
      sec('storage_tamper', { key: part, want, got: fnv1a(data), bytes: data.length });
    }
  } catch {
    /* unreadable baseline = no assertion */
  }
}
