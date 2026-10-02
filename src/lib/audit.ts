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

// --- CVE exposure inventory (Chrome/WebView patch floor) ----------------
// Floor = latest Chromium stable carrying every known exploited fix:
// CVE-2026-87491/87481/87534/87483 (153.0.8010.36), CVE-2026-91728/91736
// (153.0.8010.47), CVE-2026-95339 SW UAF (154.0.8037.57). Bump after each
// verified Chrome stable release.
export const BROWSER_FLOOR = 154;

/** Log engine/version/platform once per session; flag majors below the floor. */
export function reportBrowserVersion(): void {
  try {
    if (sessionStorage.getItem('pt.sec.bver')) return;
    sessionStorage.setItem('pt.sec.bver', '1');
  } catch { /* private mode: relog dedupes in the grouped feed */ }
  const ua = navigator.userAgent;
  const m = ua.match(/(Chrome|Chromium|CriOS|EdgiOS|Edg|OPR)\/(\d+)/);
  const webview = /;\s*wv\)/.test(ua) || (/Android/i.test(ua) && !/Chrome\//.test(ua));
  const platform = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/.test(ua) ? 'ios'
    : /Windows/.test(ua) ? 'windows' : /Macintosh|Mac OS X/.test(ua) ? 'macos'
    : /Linux/.test(ua) ? 'linux' : 'other';
  const engine = !m
    ? (/Firefox|FxiOS/.test(ua) ? 'gecko' : /Safari\//.test(ua) ? 'webkit' : 'unknown')
    : m[1] === 'CriOS' || m[1] === 'EdgiOS' ? 'webkit' : 'chromium';
  const major = m ? Number(m[2]) : null;
  // Android WebView escape matrix: id present = version still below the fix.
  // e87481 (153.0.8010.36), e79256 (152.0.7977.65), e17722/17736 (151.0.7922.72),
  // e12448 (149.0.7827.155), e11167 (149.0.7827.53). Android Chromium only —
  // the Chrome/ token is shared by Chrome, Android WebView and Chromium forks.
  let esc: string | null = null;
  const vm = ua.match(/Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)/);
  if (platform === 'android' && engine === 'chromium' && vm) {
    const v = vm.slice(1).map(Number);
    const before = (b: number[]) =>
      v[0] !== b[0] ? v[0] < b[0] : v[1] !== b[1] ? v[1] < b[1] : v[2] !== b[2] ? v[2] < b[2] : v[3] < b[3];
    const hits = [
      [153, 0, 8010, 36, 'e87481'], [152, 0, 7977, 65, 'e79256'],
      [151, 0, 7922, 72, 'e17722'], [149, 0, 7827, 155, 'e12448'],
      [149, 0, 7827, 53, 'e11167'],
    ].filter((b) => before(b as number[]));
    if (hits.length) esc = hits.map((b) => b[4]).join('|');
  }
  sec('browser_ver', { engine, major, webview, platform, esc });
  // iOS Chrome/Edge are WebKit under the hood — the Chromium floor doesn't apply
  const webkitChrome = !!m && (m[1] === 'CriOS' || m[1] === 'EdgiOS');
  if (major != null && !webkitChrome && major < BROWSER_FLOOR) {
    sec('browser_outdated', { engine, major, floor: BROWSER_FLOOR, webview, platform });
  }
}

// --- injected-code canaries (GRIMWEDGE-class eval C2) -------------------
// Our bundle never evals, builds Functions, or passes strings to timers
// (verified against dist/) — any hit is foreign code. Canary, not a wall:
// a determined attacker unhooks, but the first call is already logged.
let dynHits = 0;
let canariesInited = false;
export function initDynamicCodeCanaries(): void {
  if (canariesInited || typeof window === 'undefined') return;
  canariesInited = true;
  const note = (api: string, src?: string) => {
    if (dynHits++ >= 10) return;
    sec('dynamic_eval', { api, src: src ? src.slice(0, 150) : null });
  };
  try {
    const origEval = window.eval;
    window.eval = function (this: unknown, src: string) {
      note('eval', src);
      return origEval.call(this, src);
    } as typeof window.eval;
  } catch { /* frozen global */ }
  try {
    const OrigFn = window.Function;
    window.Function = new Proxy(OrigFn, {
      construct(t, a) { note('Function'); return Reflect.construct(t, a); },
      apply(t, th, a) { note('Function'); return Reflect.apply(t, th, a); },
    }) as typeof window.Function;
  } catch { /* non-writable in some engines */ }
  try {
    const origST = window.setTimeout.bind(window);
    window.setTimeout = ((fn: TimerHandler, delay?: number, ...rest: unknown[]) => {
      if (typeof fn === 'string') note('setTimeout', fn);
      return origST(fn as () => void, delay, ...rest);
    }) as typeof window.setTimeout;
  } catch { /* noop */ }
}

// --- subresource origin observer ----------------------------------------
let resourceInited = false;
/** PerformanceObserver over resource entries: log anything loading off-origin. */
export function initResourceAudit(): void {
  if (resourceInited || typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  resourceInited = true;
  let allowed: string;
  try {
    allowed = new URL(apiUrl('/api/event'), location.href).origin;
  } catch {
    allowed = location.origin;
  }
  let last = 0;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        try {
          const u = new URL(e.name, location.href);
          if (u.protocol === 'data:' || u.origin === location.origin || u.origin === allowed) continue;
          const now = Date.now();
          if (now - last < 1000) continue; // 1/sec — CDN bursts don't flood the feed
          last = now;
          sec('resource_origin', { origin: u.origin.slice(0, 120), kind: e.initiatorType, path: u.pathname.slice(0, 120) });
        } catch { /* unparsable URL */ }
      }
    });
    po.observe({ type: 'resource', buffered: true }); // buffered: catch early loads (CF beacon, parser scripts)
  } catch { /* observer unsupported */ }
}

// --- boot posture checks ------------------------------------------------
export function runBootSecurityChecks(): void {
  // mixed content / non-HTTPS delivery
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    sec('insecure_context', { protocol: location.protocol });
  }
  // framed → clickjacking surface
  try {
    if (window.self !== window.top) {
      const anc = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
      sec('framed', {
        referrer: document.referrer.slice(0, 200),
        ancestors: anc ? Array.from(anc).slice(0, 5).join(' ') : null,
      });
    }
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
