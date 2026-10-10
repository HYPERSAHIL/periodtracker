/**
 * Android + WebView device exposure recon · what a visitor's browser *tells* us
 * about its attack surface, and (equally important) what it does not: no saved
 * credentials, no SMS, no contacts, no other apps. Everything here is derived
 * from APIs any page already has access to.
 *
 * CVE exposure itself lives in audit.ts (reportBrowserVersion → sec_browser_ver
 * with the Android escape-bucket list). This file covers the surrounding
 * surface: engine, WebView build, GMS presence, autofill availability, WebAPKs,
 * screen geometry, hardware, and client-hint device precision.
 */

import { sec } from './audit';


/** Retail Chrome omits Build/; WebView UAs carry the exact platform build. */
function webviewBuild(ua: string): Record<string, string | boolean | null> {
  const b = /;\s*wv\)/.test(ua);
  const build = /Build\/([^;)]+)/i.exec(ua)?.[1] ?? null;
  // model: "Pixel 7 Build/UQ1A.240105.004" or "; M2101K6G Build/..."
  const model = b
    ? /;\s*([^;)]+?)\s+Build\//i.exec(ua)?.[1]?.replace(/_/g, ' ') ?? null
    : null;
  const patch = build ? /(\d{4})\.(\d{2})/.exec(build) : null;
  return {
    webview: b,
    build,
    model,
    // security patch month · a patch-level exposure signal when present
    securityPatch: patch ? `${patch[1]}-${patch[2]}` : null,
    truncated: !!build && build.includes('++'),
  };
}

/**
 * Autofill-surface detection: the standard published technique every login page
 * uses to decide whether to show a password-manager hint. It can only ever
 * answer "some autofill UI exists here" · never a credential.
 */
function autofillSurface(): string {
  try {
    const probe = document.createElement('input');
    probe.setAttribute('autocomplete', 'username');
    probe.style.cssText = 'position:fixed;top:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(probe);
    // Chrome paints the autofill dropdown over this decoration container
    const deco = getComputedStyle(probe, '::-webkit-textfield-decoration-container').backgroundColor;
    const val = probe.value;
    probe.remove();
    if ((deco && deco !== 'rgba(0, 0, 0, 0)') || val === 'probe') return 'active';
  } catch {
    /* probing blocked */
  }
  return 'passive';
}

function apiSurface(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  try {
    const n = navigator as Navigator & Record<string, unknown>;
    const creds = n.credentials as { get?: unknown; PasswordCredential?: unknown } | undefined;
    out.credentials = typeof creds?.get === 'function';
    out.passwordCredential = typeof creds?.PasswordCredential === 'function';
    out.relatedApps = typeof n.getInstalledRelatedApps === 'function';
    out.webShare = typeof n.share === 'function';
    out.wakeLock = typeof n.wakeLock === 'object';
    out.bluetooth = typeof n.bluetooth === 'object';
    out.usb = typeof n.usb === 'object';
    out.serial = typeof n.serial === 'object';
    out.hid = typeof n.hid === 'object';
    out.fileSystemAccess = typeof n.showOpenFilePicker === 'function';
    const uad = n.userAgentData as { getHighEntropyValues?: unknown } | undefined;
    out.uaClientHints = typeof uad?.getHighEntropyValues === 'function';
  } catch {
    /* navigator locked down */
  }
  return out;
}

async function deviceHealth(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (nav.getBattery) {
      const b = await nav.getBattery();
      out.batteryPct = Math.round(b.level * 100);
      out.charging = b.charging;
    }
  } catch {
    /* not granted */
  }
  try {
    out.cores = navigator.hardwareConcurrency || null;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (mem) out.deviceMemoryGB = mem;
  } catch {
    /* blocked */
  }
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.quota) {
        out.quotaMB = Math.round(est.quota / 1048576);
        out.usedPct = est.usage != null ? Math.round((est.usage / est.quota) * 100) : null;
      }
    }
  } catch {
    /* blocked */
  }
  return out;
}

/** One row per load. Never contains credentials · see module header. */
export function reportDeviceSurface(): void {
  if (typeof window === 'undefined') return;
  // sessionStorage (not a module flag) so a duplicated module instance · or a
  // double-mounted effect · still reports exactly once per tab session
  try {
    if (sessionStorage.getItem('pt.sec.dsurf')) return;
    sessionStorage.setItem('pt.sec.dsurf', '1');
  } catch { /* private mode: fall through and report */ }
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const webview = webviewBuild(ua);
  const sdk = /Android\s+(\d+)/i.exec(ua)?.[1] ?? null;

  sec('device_surface', {
    isAndroid,
    sdk,
    ...webview,
    // GMS present = Play Protect + SafetyNet attestation in the threat model;
    // absent (custom ROM / degoogled) is a materially different device class.
    gms: /GMS|Google/i.test(ua) || !!webview.build,
    release: /Android\s+([\d.]+)/i.exec(ua)?.[1] ?? null,
    autofill: autofillSurface(),
    apis: apiSurface(),
    pwa: {
      displayMode: window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
      screen: window.screen ? `${window.screen.width}x${window.screen.height}` : null,
      avail: window.screen ? `${window.screen.availWidth}x${window.screen.availHeight}` : null,
      dpr: window.devicePixelRatio,
      orientation: window.matchMedia?.('(orientation: landscape)').matches ? 'landscape' : 'portrait',
    },
  });

  void deviceHealth().then((h) => {
    sec('device_health', Object.keys(h).length ? h : { blocked: true });
  });

  const uad = (navigator as unknown as {
    userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<Record<string, unknown>> };
  }).userAgentData;
  if (uad?.getHighEntropyValues) {
    uad
      .getHighEntropyValues(['model', 'platformVersion', 'uaFullVersion', 'bitness', 'architecture', 'fullVersionList'])
      .then((v) => sec('device_hints', v))
      .catch(() => {
        /* hints refused */
      });
  }
}