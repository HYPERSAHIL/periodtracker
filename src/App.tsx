import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION, DayEntry, Settings, Tab } from './types';
import { buildFacts, computeStats, phaseFor } from './lib/cycle';
import {
  loadEntries,
  loadSettings,
  blankEntry,
  mergeImportedEntries,
  parseBackup,
  parseCSVEntries,
  parseHealthXML,
  lastNotifiedMeds,
  markNotifiedMeds,
  lastNotifiedDay,
  markNotifiedDay,
  lastNotifiedOvulation,
  markNotifiedOvulation,
  lastNotifiedDaily,
  markNotifiedDaily,
  inQuietHours,
  saveEntries,
  saveSettings,
  saveDeleted,
  loadDeleted,
} from './lib/storage';
import { todayISO, setDateLocale } from './lib/date';
import { Logo, IconHome, IconCalendar, IconChart, IconGear } from './components/Icons';
import { IconBook } from './components/Icons';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import Insights from './components/Insights';
import SettingsView from './components/SettingsView';
import Learn from './components/Learn';
import Report from './components/Report';
import PregnancyScreen from './components/PregnancyScreen';
import DaySheet from './components/DaySheet';
import PinGate from './components/PinGate';
import UpdateOverlay from './components/UpdateOverlay';
import withBoundary from './components/ErrorBoundary';
import AccountScreen from './components/AccountScreen';
import type { CloudUser } from './lib/cloud';
import { loadSession } from './lib/cloud';
import { fetchShared, type EmailSub, type SharedSummary, type ShareRow } from './lib/cloud';
import { updater } from './lib/updater';
import { lastBeaconAt, track } from './lib/beacon';
import {
  initDynamicCodeCanaries, initFetchAudit, initResourceAudit,
  noteInjection, reportBrowserVersion, runBootSecurityChecks, scanUrl, sec,
} from './lib/audit';
import { isNative } from './lib/native';
import { initVitals } from './lib/vitals';
import { initPerfAttribution } from './lib/perfattr';
import { reportDeviceSurface } from './lib/deviceSurface';
import { clearErrorFingerprints, reportError } from './lib/errfp';
import { tx } from './lib/i18n';
import { useCloudSync } from './hooks/useCloudSync';
import { scheduleNativeReminders } from './lib/nativeReminders';
import { pushWidgetSnapshot } from './lib/widgetSnapshot';
import { pushRecentToHealth } from './lib/healthSync';
import PartnerView from './components/PartnerView';

export interface AppProps {
  entries: Record<string, DayEntry>;
  settings: Settings;
  stats: ReturnType<typeof computeStats>;
  facts: ReturnType<typeof buildFacts>;
  upsert: (e: DayEntry) => void;
  remove: (date: string) => void;
  replaceAll: (s: Settings, e: Record<string, DayEntry>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  eraseAll: () => void;
  openDay: (date: string) => void;
  openReport: () => void;
  cloudUser: CloudUser | null;
  openAccount: () => void;
  signOutCloud: () => void;
  shareApi: {
    create: (s: SharedSummary, days?: number) => Promise<{ token: string; expiresInDays: number | null }>;
    list: () => Promise<ShareRow[]>;
    revoke: (t: string) => Promise<void>;
  };
  emailApi: {
    status: () => Promise<{ sub: EmailSub | null }>;
    subscribe: (i: { email: string; freq: 'weekly' | 'monthly'; level: 'minimal' | 'full' }) => Promise<void>;
    unsubscribe: () => Promise<void>;
  };
  otpApi: {
    request: () => Promise<{ verified: boolean }>;
    verify: (code: string) => Promise<CloudUser>;
  };
}

function MainApp() {
  const [entries, setEntries] = useState<Record<string, DayEntry>>(() => loadEntries());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  // boot effect runs once per load; snapshot the flag instead of depending on it
  const bootOnboarded = useRef(settings.onboarded);
  // minute tick so time-based reminders fire while the tab sits open
  const [minTick, setMinTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setMinTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);
  const [tab, setTab] = useState<Tab>('home');
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('pt.unlocked') === '1');
  const [accountSheet, setAccountSheet] = useState(false);
  const sync = useCloudSync({ entries, settings, setEntries, setSettings });
  const lang = settings.lang;
  // "error" on its own tells a user nothing. This app keeps every log on the
  // device first, so say that plainly instead of surfacing a bare state word.
  const statusText = sync.pending
    ? tx(lang, 'unsynced changes')
    : sync.syncStatus === 'error'
      ? tx(lang, 'sync failed · saved here')
      : sync.syncStatus === 'offline'
        ? tx(lang, 'offline · saved here')
        : tx(lang, sync.syncStatus);

  useEffect(() => saveEntries(entries), [entries]);
  useEffect(() => saveSettings(settings), [settings]);

  // localized date formatting follows the app language (hi → Hindi), else device
  useEffect(() => {
    setDateLocale(settings.lang === 'hi' ? 'hi' : null);
    try {
      document.documentElement.lang = settings.lang === 'hi' ? 'hi' : 'en';
    } catch {
      /* non-DOM renderers */
    }
  }, [settings.lang]);

  // Theme: resolved attribute on <html>, live-follows the OS in "system" mode.
  useEffect(() => {
    const apply = (via: 'init' | 'os') => {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = settings.theme === 'system' ? (dark ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = resolved;
      if (via === 'os') track('settings_theme_resolved', { resolved, theme: settings.theme, via });
    };
    apply('init');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('os');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme]);

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const facts = useMemo(() => buildFacts(entries, stats), [entries, stats]);

  // Granular "while open" notifications, period / fertile / daily check in, each once per day and respecting quiet hours.
  useEffect(() => {
    const suppress = (reason: string) => {
      if (notifySuppressSeen.has(reason)) return;
      notifySuppressSeen.add(reason);
      track('reminder_suppressed', { reason });
    };
    if (!settings.onboarded || !settings.reminders) {
      suppress(!settings.onboarded ? 'not_onboarded' : 'disabled');
      return;
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      suppress('permission');
      return;
    }
    if (inQuietHours(new Date(), settings.quietStart, settings.quietEnd)) {
      suppress('quiet_hours');
      return;
    }
    const today = todayISO();
    const lang = settings.lang;
    const discreet = settings.discreetNotifs === true;
    const notify = (body: string, tag: string) => {
      try {
        const n = new Notification(tx(lang, 'Period Tracker'), {
          body: discreet ? tx(lang, 'You have a reminder from Period Tracker.') : body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag,
        });
        track('reminder_delivered', { tag });
        n.onclick = () => track('reminder_clicked', { tag });
      } catch {
        /* banner still informs */
      }
    };

    // period coming
    if (settings.notifyPeriod !== false && lastNotifiedDay() !== today) {
      const d = stats.daysUntilNext;
      if (d !== null && d >= 0 && d <= settings.remindDaysBefore) {
        notify(
          d === 0
            ? tx(lang, 'Your period is expected today.')
            : tx(lang, 'Your period is expected in {n} day{s}.', { n: d, s: d === 1 ? '' : 's' }),
          'pt-upcoming'
        );
        markNotifiedDay(today);
      }
    }

    // fertile window opening
    if (settings.notifyOvulation && settings.showFertileWindow && lastNotifiedOvulation() !== today) {
      const f = stats.fertileStart;
      if (f) {
        const daysUntilFertile = Math.round((new Date(f).getTime() - new Date(today).getTime()) / 86400000);
        if (daysUntilFertile >= 0 && daysUntilFertile <= 1) {
          notify(
            daysUntilFertile === 0 ? tx(lang, 'Fertile window starts today.') : tx(lang, 'Fertile window starts tomorrow.'),
            'pt-fertile'
          );
          markNotifiedOvulation(today);
        }
      }
    }

    // daily check in nudge, evening, only if not already checked in today
    if (settings.notifyDailyCheckin && lastNotifiedDaily() !== today) {
      const hr = new Date().getHours();
      if (hr >= 19) {
        const e = entries[today];
        if (!e || !e.checkedIn) {
          notify(tx(lang, 'Quick check in? Log how today felt, 10 seconds.'), 'pt-daily');
          markNotifiedDaily(today);
        }
      }
    }

    // medication / contraception reminder at the chosen time
    if (settings.notifyMeds && lastNotifiedMeds() !== today && settings.medTime) {
      const [hh, mm] = settings.medTime.split(':').map(Number);
      const now = new Date();
      const fireAt = new Date(now);
      fireAt.setHours(hh, mm, 0, 0);
      if (
        Number.isInteger(hh) && Number.isInteger(mm) &&
        now.getTime() >= fireAt.getTime() &&
        !inQuietHours(fireAt, settings.quietStart, settings.quietEnd)
      ) {
        notify(tx(lang, 'Time for your medication / contraception.'), 'pt-meds');
        markNotifiedMeds(today);
      }
    }
  }, [
    settings.onboarded,
    settings.reminders,
    settings.notifyPeriod,
    settings.notifyOvulation,
    settings.notifyDailyCheckin,
    settings.notifyMeds,
    settings.medTime,
    settings.discreetNotifs,
    settings.lang,
    minTick,
    settings.quietStart,
    settings.quietEnd,
    settings.showFertileWindow,
    settings.remindDaysBefore,
    stats.daysUntilNext,
    stats.fertileStart,
    entries,
  ]);

  // APK auto-updater: background check, non-closable install overlay
  // + native reminder (re)scheduling via Capacitor (cancel-by-id makes re-runs cheap)
  useEffect(() => {
    updater.start();
    if (isNative() && settings.onboarded && settings.reminders) scheduleNativeReminders(settings, stats);
    if (isNative() && settings.onboarded) pushWidgetSnapshot(stats);
    if (isNative() && settings.onboarded) pushRecentToHealth(entries);
    return () => updater.stop();
  }, [settings, stats, entries]);

  // one-shot funnel beacons (each fires at most once per device)
  useEffect(() => {
    const seen = new Set(JSON.parse(localStorage.getItem('pt.funnel') || '[]') as string[]);
    const fire = (type: string) => {
      if (seen.has(type)) return;
      seen.add(type);
      localStorage.setItem('pt.funnel', JSON.stringify([...seen]));
      track(type);
    };
    if (settings.onboarded) fire('onboarding_completed');
    if (settings.reminders) fire('reminder_enabled');
    if (Object.keys(entries).length > 0) fire('first_entry_saved');
  }, [settings.onboarded, settings.reminders, entries]);

  useEffect(() => {
    if (showReport) track('report_opened');
  }, [showReport]);

  // screen views (nav tabs) · volume metric, no content
  useEffect(() => {
    if (settings.onboarded) track('screen_view', { tab });
  }, [tab, settings.onboarded]);

  // full interaction capture: clicks, keystroke-level inputs (values included),
  // keys, clipboard, pointer, scroll/wheel, resize, lifecycle, errors
  useEffect(() => {
    const nameOf = (t: EventTarget | null): { el: string; tag: string } => {
      const el = t instanceof Element ? t : null;
      if (!el) return { el: '', tag: '' };
      const tag = el.tagName.toLowerCase();
      const host = el.closest('[aria-label], button, a, [role="button"]') ?? el;
      const text = (host.getAttribute('aria-label') || host.textContent || '').replace(/\s+/g, ' ').trim();
      return { el: (text || host.id || tag).slice(0, 1000), tag };
    };
    const depth = () => {
      const h = document.documentElement;
      return Math.min(100, Math.round(((window.scrollY + window.innerHeight) / Math.max(h.scrollHeight, 1)) * 100));
    };
    const last: Record<string, number> = {};
    const throttle = (key: string, ms: number, fn: () => void) => {
      const now = Date.now();
      if (now - (last[key] ?? 0) < ms) return;
      last[key] = now;
      fn();
    };
    const hits: { x: number; y: number; t: number }[] = [];
    // rolling event-rate detector: script-driven DOM spam trips this, humans don't
    let rate = 0;
    let rateWindow = 0;
    let floodLast = 0;
    const bump = () => {
      const now = Date.now();
      if (now - rateWindow > 1000) {
        rateWindow = now;
        rate = 0;
      }
      rate++;
      if (rate > 40 && now - floodLast > 10000) {
        floodLast = now;
        sec('event_flood', { rate, tab });
      }
    };

    const onClick = (e: MouseEvent) => {
      bump();
      const { el, tag } = nameOf(e.target);
      track('screen_click', { el, tag, x: Math.round(e.clientX), y: Math.round(e.clientY), tab });
      hits.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      while (hits.length > 3) hits.shift();
      if (
        hits.length === 3 &&
        hits[2].t - hits[0].t <= 1000 &&
        Math.hypot(hits[2].x - hits[0].x, hits[2].y - hits[0].y) <= 30 &&
        Math.hypot(hits[1].x - hits[0].x, hits[1].y - hits[0].y) <= 30
      ) {
        track('screen_rageclick', { x: Math.round(e.clientX), y: Math.round(e.clientY), tab });
        hits.length = 0;
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      const { el, tag } = nameOf(e.target);
      track('screen_contextmenu', { el, tag, tab });
    };
    const onInput = (e: Event) => {
      bump();
      const el = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el || typeof el.value !== 'string') return;
      const id = el.id || el.name || el.getAttribute('aria-label') || el.tagName.toLowerCase();
      const tag = el.tagName.toLowerCase();
      if (el instanceof HTMLInputElement && el.type === 'password') {
        track('screen_input', { el: id.slice(0, 200), tag, pw: true, tab });
        return;
      }
      const value =
        el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')
          ? String(el.checked)
          : el.value.slice(0, 1000);
      noteInjection('input', el.value, { el: id.slice(0, 200), tag });
      track('screen_input', { el: id.slice(0, 200), tag, value, tab });
    };
    const onKey = (e: KeyboardEvent) => {
      bump();
      const { tag } = nameOf(e.target);
      track('screen_key', {
        key: e.key.slice(0, 40),
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
        tag,
        tab,
      });
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
        track('screen_undo', { key: e.key, shift: e.shiftKey, tag, tab });
      }
    };
    const onClip = (action: string) => (e: ClipboardEvent) => {
      const { el, tag } = nameOf(e.target);
      track('screen_clipboard', { action, el, tag, text: (e.clipboardData?.getData('text') || '').slice(0, 1000), tab });
    };
    const onSubmit = (e: Event) => {
      const { el, tag } = nameOf(e.target);
      track('screen_submit', { el, tag, tab });
    };
    const onPointerDown = (e: PointerEvent) => {
      const { tag } = nameOf(e.target);
      track('screen_pointerdown', {
        x: Math.round(e.clientX),
        y: Math.round(e.clientY),
        btn: e.button,
        ptype: e.pointerType,
        tag,
        tab,
      });
    };
    const onPointerMove = (e: PointerEvent) =>
      throttle('pointer', 1000, () => track('screen_pointer', { x: Math.round(e.clientX), y: Math.round(e.clientY), tab }));
    const onScroll = () => throttle('scroll', 500, () => track('screen_scroll', { depth: depth(), tab }));
    const onWheel = (e: WheelEvent) =>
      throttle('wheel', 500, () => track('screen_wheel', { dx: Math.round(e.deltaX), dy: Math.round(e.deltaY), tab }));
    const onResize = () => throttle('resize', 1000, () => track('screen_resize', { w: window.innerWidth, h: window.innerHeight }));
    const onVisibility = () => track('screen_visibility', { hidden: document.hidden, tab });
    const onPageHide = () => track('screen_pageleave', { depth: depth(), tab, sessionMs: Date.now() - SESSION_START });
    const onWinFocus = () => track('screen_focus', { kind: 'window', focused: true, tab });
    const onWinBlur = () => track('screen_focus', { kind: 'window', focused: false, tab });
    const onPageshow = (e: PageTransitionEvent) => track('screen_pageshow', { persisted: e.persisted, tab });
    const onFocusIn = (e: FocusEvent) => {
      const { el, tag } = nameOf(e.target);
      throttle('focusin', 1000, () => track('screen_focus', { kind: 'element', el, tag, tab }));
    };
    const onOnline = () => track('screen_connection', { online: true, tab });
    const onOffline = () => track('screen_connection', { online: false, tab });
    // since/lastBeacon line a client error up with the req rows that carry rid
    const errWhere = () => ({
      since: Date.now() - SESSION_START,
      lastBeacon: Date.now() - (lastBeaconAt || SESSION_START),
      route: location.pathname + location.search,
    });
    // fingerprinted: one row per distinct bug, repeats counted (lib/errfp.ts)
    const onError = (e: ErrorEvent) => {
      const err = e.error as Error | undefined;
      reportError('error', e.message || String(err), err?.stack || '', e.filename || '', {
        tab, ...errWhere(),
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const err = e.reason as Error | undefined;
      reportError('rejection', String(e.reason), err?.stack || '', '', { tab, ...errWhere() });
    };
    let cspN = 0;
    const onCsp = (e: Event) => {
      if (cspN++ >= 10) return;
      const ev = e as unknown as {
        documentURI?: string;
        blockedURI?: string;
        effectiveDirective?: string;
        violatedDirective?: string;
        sourceFile?: string;
        lineNumber?: number;
        sample?: string;
        disposition?: string;
      };
      sec('csp_violation', {
        doc: (ev.documentURI || '').slice(0, 200),
        blocked: (ev.blockedURI || '').slice(0, 200),
        directive: (ev.effectiveDirective || ev.violatedDirective || '').slice(0, 100),
        source: (ev.sourceFile || '').slice(0, 200) || null,
        line: ev.lineNumber ?? null,
        sample: (ev.sample || '').slice(0, 200),
        disposition: ev.disposition || null,
      });
    };
    let lastMsg = 0;
    const onMsg = (e: MessageEvent) => {
      const now = Date.now();
      if (now - lastMsg < 1000) return;
      lastMsg = now;
      sec('postmessage', { origin: (e.origin || '').slice(0, 200), type: typeof e.data, len: String(e.data ?? '').length });
    };
    const onMedia = (e: Event) => {
      const { el, tag } = nameOf(e.target);
      track('screen_media', { action: e.type, el, tag, tab });
    };
    const onDrag = (e: Event) => {
      const { el, tag } = nameOf(e.target);
      track('screen_drag', { phase: e.type, el, tag, tab });
    };
    const onFullscreen = () => track('screen_fullscreen', { active: !!document.fullscreenElement, tab });
    const onNavPop = () => track('screen_nav', { via: 'popstate' });
    const onNavHash = () => track('screen_nav', { via: 'hashchange' });
    const onHover = (e: MouseEvent) => {
      const { el, tag } = nameOf(e.target);
      throttle('hover', 1000, () => track('screen_hover', { el, tag, tab }));
    };
    const onSelection = () =>
      throttle('selection', 1000, () => {
        const text = window.getSelection()?.toString() ?? '';
        if (text) track('screen_selection', { text: text.slice(0, 500), chars: text.length, tab });
      });

    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('copy', onClip('copy'), true);
    document.addEventListener('cut', onClip('cut'), true);
    document.addEventListener('paste', onClip('paste'), true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('focus', onWinFocus);
    window.addEventListener('blur', onWinBlur);
    window.addEventListener('pageshow', onPageshow);
    document.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    document.addEventListener('play', onMedia, true);
    document.addEventListener('securitypolicyviolation', onCsp);
    window.addEventListener('message', onMsg);
    document.addEventListener('pause', onMedia, true);
    document.addEventListener('ended', onMedia, true);
    document.addEventListener('seeked', onMedia, true);
    document.addEventListener('dragstart', onDrag, true);
    document.addEventListener('drop', onDrag, true);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('popstate', onNavPop);
    window.addEventListener('hashchange', onNavHash);
    document.addEventListener('mouseover', onHover, true);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('copy', onClip('copy'), true);
      document.removeEventListener('cut', onClip('cut'), true);
      document.removeEventListener('paste', onClip('paste'), true);
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('focus', onWinFocus);
      window.removeEventListener('blur', onWinBlur);
      window.removeEventListener('pageshow', onPageshow);
      document.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      document.removeEventListener('play', onMedia, true);
      document.removeEventListener('securitypolicyviolation', onCsp);
      window.removeEventListener('message', onMsg);
      document.removeEventListener('pause', onMedia, true);
      document.removeEventListener('ended', onMedia, true);
      document.removeEventListener('seeked', onMedia, true);
      document.removeEventListener('dragstart', onDrag, true);
      document.removeEventListener('drop', onDrag, true);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('popstate', onNavPop);
      window.removeEventListener('hashchange', onNavHash);
      document.removeEventListener('mouseover', onHover, true);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, [tab]);

  // session context, load performance, PWA install prompts, security posture · once per load
  useEffect(() => {
    initFetchAudit();
    initDynamicCodeCanaries();
    initResourceAudit();
    initVitals();
    initPerfAttribution();
    clearErrorFingerprints();
    reportBrowserVersion();
    reportDeviceSurface();
    runBootSecurityChecks();
    scanUrl();
    let standalone = false;
    let reducedMotion = false;
    let colorScheme: string | null = null;
    try {
      standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      colorScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      /* matchMedia unavailable */
    }
    const conn = (
      navigator as unknown as {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      }
    ).connection;
    track('screen_context', {
      vw: window.innerWidth,
      vh: window.innerHeight,
      dpr: window.devicePixelRatio,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      referrer: document.referrer.slice(0, 300),
      standalone,
      reducedMotion,
      colorScheme,
      cores: navigator.hardwareConcurrency ?? null,
      memoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      touch: navigator.maxTouchPoints,
      cookies: navigator.cookieEnabled,
      connection: conn
        ? {
            effectiveType: conn.effectiveType ?? null,
            downlink: conn.downlink ?? null,
            rtt: conn.rtt ?? null,
            saveData: conn.saveData ?? null,
          }
        : null,
    });
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((st) => track('screen_permission', { name: 'geolocation', state: st.state }))
      .catch(() => track('screen_permission', { name: 'geolocation', state: 'unknown' }));
    // one anchor row per session: where they came from, how far along they are,
    // and how full the device is. Funnel drop-off is a single query on this.
    navigator.storage
      ?.estimate?.()
      .then((est) => {
        let firstSeen: string | null = null;
        let returning = false;
        try {
          firstSeen = localStorage.getItem('pt.firstSeen');
          if (!firstSeen) localStorage.setItem('pt.firstSeen', new Date().toISOString());
          else returning = true;
        } catch {
          /* private mode */
        }
        track('screen_session', {
          entry: returning ? 'returning' : document.referrer ? 'referral' : 'direct',
          firstSeen,
          onboarded: bootOnboarded.current,
          hasAccount: !!loadSession(),
          quotaMB: est.quota != null ? Math.round(est.quota / 1048576) : null,
          usedMB: est.usage != null ? Math.round((est.usage / 1048576) * 10) / 10 : null,
          usedPct: est.quota ? Math.round((est.usage! / est.quota) * 100) : null,
        });
      })
      .catch(() => {
        /* storage API blocked (private mode) · screen_session is best-effort */
      });
    if (!isNative()) {
      try {
        const prev = localStorage.getItem('pt.lastVersion');
        if (prev && prev !== APP_VERSION) track('update_web_version', { from: prev, to: APP_VERSION });
        localStorage.setItem('pt.lastVersion', APP_VERSION);
      } catch {
        /* storage unavailable */
      }
    }
    const onCtrl = () => track('update_sw_activated');
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', onCtrl);
    const perf = () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) track('screen_perf', { loadMs: Math.round(nav.loadEventEnd), domMs: Math.round(nav.domContentLoadedEventEnd) });
    };
    if (document.readyState === 'complete') perf();
    else window.addEventListener('load', perf, { once: true });
    const onPrompt = () => track('update_pwa_install', { stage: 'prompted' });
    const onInstalled = () => track('update_pwa_install', { stage: 'installed' });
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // mirror console errors/warnings into telemetry (warn throttled to 1/s)
    const origError = console.error;
    const origWarn = console.warn;
    let lastWarn = 0;
    console.error = (...args: unknown[]) => {
      track('screen_console', { level: 'error', msg: String(args[0] ?? '').slice(0, 500) });
      origError.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      const now = Date.now();
      if (now - lastWarn >= 1000) {
        lastWarn = now;
        track('screen_console', { level: 'warn', msg: String(args[0] ?? '').slice(0, 500) });
      }
      origWarn.apply(console, args);
    };
    const heartbeat = window.setInterval(
      () => track('screen_heartbeat', { sessionMs: Date.now() - SESSION_START }),
      300000
    );
    return () => {
      window.clearInterval(heartbeat);
      console.error = origError;
      console.warn = origWarn;
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', onCtrl);
      window.removeEventListener('load', perf);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const upsert = useCallback((e: DayEntry) => {
    setEntries((prev) => ({ ...prev, [e.date]: { ...e, updatedAt: Date.now() } }));
    track('entry_saved', {
      hasFlow: !!e.flow,
      symptomCount: e.symptoms?.length ?? 0,
      symptoms: e.symptoms ?? [],
      severity: e.symptomSeverity ?? null,
      hasNote: !!e.note,
    });
  }, []);

  const remove = useCallback((date: string) => {
    // Tombstone it: without this the next sync pulls the row back off the server
    // and "Delete this log" silently does nothing.
    saveDeleted({ ...loadDeleted(), [date]: Date.now() });
    setEntries((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
    track('entry_deleted', { date });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch, updatedAt: Date.now() }));
    // which knobs moved, not their values (e.g. no pin hash, no cycle length)
    track('settings_changed', { keys: Object.keys(patch).slice(0, 12) });
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) values[k] = Array.isArray(v) ? v.slice(0, 20) : v;
    track('settings_value_changed', { values });
  }, []);

  const replaceAll = useCallback((s: Settings, e: Record<string, DayEntry>) => {
    setSettings(s);
    setEntries(e);
  }, []);

  const eraseAll = useCallback(() => {
    const erased = Object.keys(entries).length;
    setEntries({});
    setSettings((s) => ({ ...s, lastPeriodStart: null, predictionsPaused: false, updatedAt: Date.now() }));
    track('data_erased', { days: erased });
  }, [entries]);

  const openDay = useCallback((date: string) => {
    // logging the future is not a thing a calendar app should allow; a stray
    // tap on a future cell used to open the sheet, which then saved junk
    if (date > todayISO()) {
      track('day_future_blocked', { date });
      return;
    }
    setSheetDate(date);
    track('day_opened', { date });
  }, []);
  const openReport = useCallback(() => setShowReport(true), []);
  const closeReport = useCallback(() => {
    setShowReport(false);
    track('report_closed');
  }, []);

  const openAccount = useCallback(() => {
    setAccountSheet(true);
    track('account_opened');
  }, []);

  // PWA share_target / file_handlers intake (stashed by main.tsx before render)
  useEffect(() => {
    if (!settings.onboarded) {
      const dropped = () => {
        try {
          if (sessionStorage.getItem('pt.shared.v1')) track('share_target_dropped', { reason: 'not_onboarded' });
        } catch {
          track('data_load_failed', { key: 'share_stash' });
        }
      };
      dropped();
      window.addEventListener('pt:shared', dropped);
      return () => window.removeEventListener('pt:shared', dropped);
    }
    const consumeShare = () => {
      let shared: string | null = null;
      try {
        shared = sessionStorage.getItem('pt.shared.v1');
        if (shared) sessionStorage.removeItem('pt.shared.v1');
      } catch {
        track('data_load_failed', { key: 'share_stash' });
      }
      if (!shared) return;
      const text = shared.slice(0, 2000);
      noteInjection('share_target', text, { chars: text.length });
      const t = todayISO();
      setEntries((prev) => {
        const cur = prev[t] ?? blankEntry(t);
        return { ...prev, [t]: { ...cur, note: cur.note ? `${cur.note}\n${text}` : text, updatedAt: Date.now() } };
      });
      setSheetDate(t);
      track('share_target_received', { chars: text.length });
    };
    consumeShare();
    window.addEventListener('pt:shared', consumeShare);
    return () => window.removeEventListener('pt:shared', consumeShare);
  }, [settings.onboarded]);

  useEffect(() => {
    if (!settings.onboarded) return;
    const consume = () => {
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem('pt.openfile.v1');
        if (raw) sessionStorage.removeItem('pt.openfile.v1');
      } catch {
        track('data_load_failed', { key: 'file_stash' });
      }
      if (!raw) return;
      try {
        const { name, text } = JSON.parse(raw) as { name: string; text: string };
        noteInjection('import_name', name ?? '');
        noteInjection('import_text', text ?? '');
        if (/\.xml$/i.test(name ?? '')) {
          const xmlEntries = parseHealthXML(text);
          if (!xmlEntries) {
            track('import_failed', { format: 'health_xml', via: 'pwa' });
            return;
          }
          track('data_imported', { format: 'health_xml', days: Object.keys(xmlEntries).length, via: 'pwa' });
          setEntries((prev) => mergeImportedEntries(prev, xmlEntries));
        } else if (/\.csv$/i.test(name ?? '')) {
          const csvEntries = parseCSVEntries(text);
          if (!csvEntries) {
            track('import_failed', { format: 'csv', via: 'pwa' });
            return;
          }
          track('data_imported', { format: 'csv', days: Object.keys(csvEntries).length, via: 'pwa' });
          setEntries((prev) => mergeImportedEntries(prev, csvEntries));
        } else {
          const parsed = parseBackup(text);
          if (!parsed) {
            track('import_failed', { format: 'backup', via: 'pwa' });
            return;
          }
          track('data_imported', { format: 'backup', days: Object.keys(parsed.entries).length, via: 'pwa', replaced: true });
          replaceAll(parsed.settings, parsed.entries);
        }
        setTab('insights');
      } catch {
        track('import_failed', { format: 'unknown', via: 'pwa', reason: 'malformed' });
      }
    };
    consume();
    window.addEventListener('pt:openfile', consume);
    return () => window.removeEventListener('pt:openfile', consume);
  }, [settings.onboarded, replaceAll]);

  const props: AppProps = {
    entries, settings, stats, facts, upsert, remove, replaceAll, updateSettings, eraseAll, openDay, openReport,
    cloudUser: sync.cloudUser, openAccount, signOutCloud: sync.signOutCloud, shareApi: sync.shareApi, emailApi: sync.emailApi, otpApi: sync.otpApi,
  };

  if (settings.pinHash && settings.pinSalt && !unlocked) {
    return <PinGate pinHash={settings.pinHash} pinSalt={settings.pinSalt} onUnlocked={() => setUnlocked(true)} lang={lang} />;
  }

  return (
    <>
      <div className="app">
        <header className="topbar">
          <Logo />
          <div>
            <h1>{tx(lang, 'Period Tracker')}</h1>
            <div className="sub">{tx(lang, 'Private cycle tracking')}</div>
          </div>
        </header>

        {!settings.onboarded ? (
          <Onboarding updateSettings={updateSettings} />
        ) : showReport ? (
          <main className="screen">
            <Report {...props} closeReport={closeReport} />
          </main>
        ) : (
          <>
            <main className="screen" key={tab}>
              {tab === 'home' &&
                withBoundary(settings.mode === 'pregnant' ? <PregnancyScreen {...props} /> : <Dashboard {...props} />, tx(lang, 'Home'), lang)}
              {tab === 'calendar' && withBoundary(<CalendarView {...props} />, tx(lang, 'Calendar'), lang)}
              {tab === 'insights' && withBoundary(<Insights {...props} />, tx(lang, 'Insights'), lang)}
              {tab === 'learn' && withBoundary(<Learn {...props} />, tx(lang, 'Learn'), lang)}
              {tab === 'settings' && withBoundary(<SettingsView {...props} />, tx(lang, 'Settings'), lang)}
            </main>
            <div className="footer">{tx(lang, 'Your data stays on this device · backed up automatically')} · {statusText}</div>
          </>
        )}
      </div>

      {settings.onboarded && !showReport && (
        <nav className="bottomnav" aria-label="Main navigation">
          <div className="inner">
            <NavBtn lang={lang} on={tab === 'home'} label="Home" icon={<IconHome />} go={() => setTab('home')} />
            <NavBtn lang={lang} on={tab === 'calendar'} label="Calendar" icon={<IconCalendar />} go={() => setTab('calendar')} />
            <NavBtn lang={lang} on={tab === 'insights'} label="Insights" icon={<IconChart />} go={() => setTab('insights')} />
            <NavBtn lang={lang} on={tab === 'learn'} label="Learn" icon={<IconBook />} go={() => setTab('learn')} />
            <NavBtn lang={lang} on={tab === 'settings'} label="Settings" icon={<IconGear />} go={() => setTab('settings')} />
          </div>
        </nav>
      )}

      {accountSheet && (
        <AccountScreen
          user={sync.cloudUser}
          lang={lang}
          onDone={() => {
            sync.adoptSession(loadSession());
            setAccountSheet(false);
          }}
          onClose={() => setAccountSheet(false)}
        />
      )}

      <UpdateOverlay lang={lang} />

      {sheetDate && (
        <DaySheet
          key={sheetDate}
          date={sheetDate}
          entry={entries[sheetDate] ?? null}
          facts={facts.get(sheetDate)}
          phase={phaseFor(sheetDate, stats, facts)}
          settings={settings}
          updateSettings={updateSettings}
          onClose={() => setSheetDate(null)}
          onSave={(e) => {
            upsert(e);
            setSheetDate(null);
          }}
          onDelete={() => {
            remove(sheetDate);
            setSheetDate(null);
          }}
        />
      )}
    </>
  );
}

/** Dedupe for reminder-suppression telemetry: one event per reason per session. */
const notifySuppressSeen = new Set<string>();
const SESSION_START = Date.now();

function NavBtn({ on, label, icon, go, lang }: { on: boolean; label: string; icon: JSX.Element; go: () => void; lang: string }) {
  return (
    <button className={on ? 'on' : ''} onClick={go} aria-current={on ? 'page' : undefined}>
      {icon}
      {tx(lang, label)}
    </button>
  );
}

/** Public partner link (?s=TOKEN): read-only snapshot, no login, no sync. */
function PartnerRoute({ token }: { token: string }) {
  const [shared, setShared] = useState<{ summary: SharedSummary; expiresAt: string } | 'loading' | 'invalid' | 'offline'>('loading');
  const lang = (() => {
    try {
      return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
    } catch {
      return 'en';
    }
  })();
  useEffect(() => {
    let live = true;
    if (!/^[a-f0-9]{32}$/i.test(token)) sec('bad_token', { len: token.length, sample: token.slice(0, 16) });
    fetchShared(token).then(
      (r) => {
        if (!live) return;
        if (r) track('share_link_viewed', { token });
        else track('share_link_invalid', { token });
        setShared(r ?? 'invalid');
      },
      () => {
        if (!live) return;
        track('share_link_failed', { token, reason: 'offline' });
        setShared('offline');
      }
    );
    return () => {
      live = false;
    };
  }, [token]);
  if (shared === 'loading')
    return (
      <div className="app">
        <main className="screen">
          <div className="card">{tx(lang, 'Loading')}</div>
        </main>
      </div>
    );
  if (shared === 'offline')
    return (
      <div className="app">
        <main className="screen">
          <div className="card">
            <p>{tx(lang, 'No connection. Check your internet and try again.')}</p>
            <button className="btn primary" onClick={() => {
              setShared('loading');
              fetchShared(token).then(
                (r) => {
                  if (r) track('share_link_viewed', { token });
                  else track('share_link_invalid', { token });
                  setShared(r ?? 'invalid');
                },
                () => {
                  track('share_link_failed', { token, reason: 'offline' });
                  setShared('offline');
                }
              );
            }}>
              {tx(lang, 'Try again')}
            </button>
          </div>
        </main>
      </div>
    );
  if (shared === 'invalid')
    return (
      <div className="app">
        <main className="screen">
          <div className="card">{tx(lang, 'This link is invalid or expired.')}</div>
        </main>
      </div>
    );
  return <PartnerView summary={shared.summary} expiresAt={shared.expiresAt} lang={lang} />;
}

export default function App() {
  const [shareToken] = useState(() => {
    try {
      return new URLSearchParams(location.search).get('s');
    } catch {
      return null;
    }
  });
  if (shareToken) return <PartnerRoute token={shareToken} />;
  return <MainApp />;
}
