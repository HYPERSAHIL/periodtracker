import { useCallback, useEffect, useMemo, useState } from 'react';
import { DayEntry, Settings, Tab } from './types';
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
import { isNative } from './lib/native';
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
    create: (s: SharedSummary, days?: number) => Promise<{ token: string; expiresInDays: number }>;
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
  const statusText = sync.pending ? tx(lang, 'unsynced changes') : tx(lang, sync.syncStatus);

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
    const apply = () => {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = settings.theme === 'system' ? (dark ? 'dark' : 'light') : settings.theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const facts = useMemo(() => buildFacts(entries, stats), [entries, stats]);

  // Granular "while open" notifications, period / fertile / daily check in, each once per day and respecting quiet hours.
  useEffect(() => {
    if (!settings.onboarded || !settings.reminders) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (inQuietHours(new Date(), settings.quietStart, settings.quietEnd)) return;
    const today = todayISO();
    const lang = settings.lang;
    const discreet = settings.discreetNotifs === true;
    const notify = (body: string, tag: string) => {
      try {
        new Notification(tx(lang, 'Period Tracker'), {
          body: discreet ? tx(lang, 'You have a reminder from Period Tracker.') : body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag,
        });
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

  const upsert = useCallback((e: DayEntry) => {
    setEntries((prev) => ({ ...prev, [e.date]: { ...e, updatedAt: Date.now() } }));
  }, []);

  const remove = useCallback((date: string) => {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch, updatedAt: Date.now() }));
  }, []);

  const replaceAll = useCallback((s: Settings, e: Record<string, DayEntry>) => {
    setSettings(s);
    setEntries(e);
  }, []);

  const eraseAll = useCallback(() => {
    setEntries({});
    setSettings((s) => ({ ...s, lastPeriodStart: null, predictionsPaused: false, updatedAt: Date.now() }));
  }, []);

  const openDay = useCallback((date: string) => setSheetDate(date), []);
  const openReport = useCallback(() => setShowReport(true), []);

  const openAccount = useCallback(() => setAccountSheet(true), []);

  // PWA share_target / file_handlers intake (stashed by main.tsx before render)
  useEffect(() => {
    if (!settings.onboarded) return;
    const consumeShare = () => {
      let shared: string | null = null;
      try {
        shared = sessionStorage.getItem('pt.shared.v1');
        if (shared) sessionStorage.removeItem('pt.shared.v1');
      } catch {
        /* intake is best-effort */
      }
      if (!shared) return;
      const text = shared.slice(0, 2000);
      const t = todayISO();
      setEntries((prev) => {
        const cur = prev[t] ?? blankEntry(t);
        return { ...prev, [t]: { ...cur, note: cur.note ? `${cur.note}\n${text}` : text, updatedAt: Date.now() } };
      });
      setSheetDate(t);
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
        /* intake is best-effort */
      }
      if (!raw) return;
      try {
        const { name, text } = JSON.parse(raw) as { name: string; text: string };
        if (/\.xml$/i.test(name ?? '')) {
          const xmlEntries = parseHealthXML(text);
          if (!xmlEntries) return;
          setEntries((prev) => mergeImportedEntries(prev, xmlEntries));
        } else if (/\.csv$/i.test(name ?? '')) {
          const csvEntries = parseCSVEntries(text);
          if (!csvEntries) return;
          setEntries((prev) => mergeImportedEntries(prev, csvEntries));
        } else {
          const parsed = parseBackup(text);
          if (!parsed) return;
          replaceAll(parsed.settings, parsed.entries);
        }
        setTab('insights');
      } catch {
        /* malformed payloads are ignored */
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
            <Report {...props} closeReport={() => setShowReport(false)} />
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
    fetchShared(token).then(
      (r) => {
        if (live) setShared(r ?? 'invalid');
      },
      () => {
        if (live) setShared('offline');
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
                (r) => setShared(r ?? 'invalid'),
                () => setShared('offline')
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
