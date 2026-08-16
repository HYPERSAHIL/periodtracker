import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DayEntry, Settings, Tab } from './types';
import { buildFacts, computeStats, phaseFor } from './lib/cycle';
import {
  loadEntries,
  loadSettings,
  lastNotifiedDay,
  markNotifiedDay,
  saveEntries,
  saveSettings,
} from './lib/storage';
import { todayISO } from './lib/date';
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
import AccountScreen from './components/AccountScreen';
import {
  CloudUser, SyncStatus, ensureAnonymousSession, loadSession, signOut, syncCycle,
} from './lib/cloud';
import { deviceInfo } from './lib/device';
import { APP_VERSION } from './types';

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
}

export default function App() {
  const [entries, setEntries] = useState<Record<string, DayEntry>>(() => loadEntries());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [tab, setTab] = useState<Tab>('home');
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('pt.unlocked') === '1');
  const [, setSyncStatus] = useState<SyncStatus>('idle');
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(() => loadSession()?.user ?? null);
  const [accountSheet, setAccountSheet] = useState(false);
  const cloudRef = useRef<{ token: string | null }>({ token: loadSession()?.token ?? null });
  const syncTimer = useRef<number | null>(null);
  const firstPaint = useRef(true);

  useEffect(() => saveEntries(entries), [entries]);
  useEffect(() => saveSettings(settings), [settings]);

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

  // "Period is coming" notification — once per day, only while the app is open.
  useEffect(() => {
    if (!settings.onboarded || !settings.reminders) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const today = todayISO();
    if (lastNotifiedDay() === today) return;
    const d = stats.daysUntilNext;
    if (d !== null && d >= 0 && d <= settings.remindDaysBefore) {
      try {
        new Notification('Period Tracker', {
          body: d === 0 ? 'Your period is expected today.' : `Your period is expected in ${d} day${d === 1 ? '' : 's'}.`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: 'pt-upcoming',
        });
      } catch {
        /* some browsers restrict constructor usage — banner below still informs */
      }
      markNotifiedDay(today);
    }
  }, [settings.onboarded, settings.reminders, settings.remindDaysBefore, stats.daysUntilNext]);

  const runSync = useCallback(async (currentEntries: Record<string, DayEntry>, currentSettings: Settings) => {
    const token = cloudRef.current.token;
    if (!token || !navigator.onLine) {
      setSyncStatus(navigator.onLine ? 'error' : 'offline');
      return;
    }
    setSyncStatus('syncing');
    try {
      await syncCycle(token, currentEntries, currentSettings, (m) => {
        if (m.changed) {
          if (m.entries) setEntries(m.entries);
          if (m.settings) setSettings(m.settings);
        }
      });
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }
  }, []);

  // bootstrap: anonymous session (sync works without sign-in), then initial sync
  useEffect(() => {
    if (!settings.onboarded) return;
    let cancelled = false;
    (async () => {
      setSyncStatus('connecting');
      try {
        if (!cloudRef.current.token) {
          const s = await ensureAnonymousSession(deviceInfo(APP_VERSION));
          if (cancelled) return;
          cloudRef.current.token = s.token;
          setCloudUser(s.user);
        }
        await runSync(entries, settings);
      } catch {
        if (!cancelled) setSyncStatus('error');
      }
    })();
    const onOnline = () => runSync(entriesRef.current, settingsRef.current);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.onboarded]);

  // keep latest data reachable for event-driven syncs
  const entriesRef = useRef(entries);
  const settingsRef = useRef(settings);
  useEffect(() => { entriesRef.current = entries; settingsRef.current = settings; });

  // debounced auto-sync on every change (skips the very first paint)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    if (!settings.onboarded || !cloudRef.current.token) return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => runSync(entriesRef.current, settingsRef.current), 2500);
  }, [entries, settings, runSync, settings.onboarded]);

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

  const signOutCloud = useCallback(async () => {
    const token = cloudRef.current.token;
    if (token) await signOut(token);
    cloudRef.current.token = null;
    setCloudUser(null);
    try {
      const s = await ensureAnonymousSession();
      cloudRef.current.token = s.token;
      setCloudUser(s.user);
      await runSync(entriesRef.current, settingsRef.current);
    } catch {
      setSyncStatus('error');
    }
  }, [runSync]);

  const props: AppProps = {
    entries, settings, stats, facts, upsert, remove, replaceAll, updateSettings, eraseAll, openDay, openReport,
    cloudUser, openAccount, signOutCloud,
  };

  if (settings.pinHash && settings.pinSalt && !unlocked) {
    return <PinGate pinHash={settings.pinHash} pinSalt={settings.pinSalt} onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <>
      <div className="app">
        <header className="topbar">
          <Logo />
          <div>
            <h1>Period Tracker</h1>
            <div className="sub">Private cycle tracking</div>
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
                (settings.mode === 'pregnant' ? <PregnancyScreen {...props} /> : <Dashboard {...props} />)}
              {tab === 'calendar' && <CalendarView {...props} />}
              {tab === 'insights' && <Insights {...props} />}
              {tab === 'learn' && <Learn {...props} />}
              {tab === 'settings' && <SettingsView {...props} />}
            </main>
            <div className="footer">
              Your data stays on this device · <a href="https://github.com/HYPERSAHIL/periodtracker">source</a>
            </div>
          </>
        )}
      </div>

      {settings.onboarded && !showReport && (
        <nav className="bottomnav" aria-label="Main navigation">
          <div className="inner">
            <NavBtn on={tab === 'home'} label="Home" icon={<IconHome />} go={() => setTab('home')} />
            <NavBtn on={tab === 'calendar'} label="Calendar" icon={<IconCalendar />} go={() => setTab('calendar')} />
            <NavBtn on={tab === 'insights'} label="Insights" icon={<IconChart />} go={() => setTab('insights')} />
            <NavBtn on={tab === 'learn'} label="Learn" icon={<IconBook />} go={() => setTab('learn')} />
            <NavBtn on={tab === 'settings'} label="Settings" icon={<IconGear />} go={() => setTab('settings')} />
          </div>
        </nav>
      )}

      {accountSheet && (
        <AccountScreen
          user={cloudUser}
          onDone={() => {
            const s = loadSession();
            cloudRef.current.token = s?.token ?? null;
            setCloudUser(s?.user ?? null);
            if (s?.token) runSync(entriesRef.current, settingsRef.current);
            setAccountSheet(false);
          }}
          onClose={() => setAccountSheet(false)}
        />
      )}

      {sheetDate && (
        <DaySheet
          date={sheetDate}
          entry={entries[sheetDate] ?? null}
          facts={facts.get(sheetDate)}
          phase={phaseFor(sheetDate, stats, facts)}
          settings={settings}
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

function NavBtn({ on, label, icon, go }: { on: boolean; label: string; icon: JSX.Element; go: () => void }) {
  return (
    <button className={on ? 'on' : ''} onClick={go} aria-current={on ? 'page' : undefined}>
      {icon}
      {label}
    </button>
  );
}
