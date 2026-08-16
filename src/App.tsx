import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import Insights from './components/Insights';
import SettingsView from './components/SettingsView';
import PregnancyScreen from './components/PregnancyScreen';
import DaySheet from './components/DaySheet';

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
}

export default function App() {
  const [entries, setEntries] = useState<Record<string, DayEntry>>(() => loadEntries());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [tab, setTab] = useState<Tab>('home');
  const [sheetDate, setSheetDate] = useState<string | null>(null);

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

  const upsert = useCallback((e: DayEntry) => {
    setEntries((prev) => ({ ...prev, [e.date]: e }));
  }, []);

  const remove = useCallback((date: string) => {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const replaceAll = useCallback((s: Settings, e: Record<string, DayEntry>) => {
    setSettings(s);
    setEntries(e);
  }, []);

  const eraseAll = useCallback(() => {
    setEntries({});
    setSettings((s) => ({ ...s, lastPeriodStart: null, predictionsPaused: false }));
  }, []);

  const openDay = useCallback((date: string) => setSheetDate(date), []);

  const props: AppProps = {
    entries, settings, stats, facts, upsert, remove, replaceAll, updateSettings, eraseAll, openDay,
  };

  return (
    <>
      <div className="app">
        <header className="topbar">
          <Logo />
          <div>
            <h1>Period Tracker</h1>
            <div className="sub">Private cycle tracking · on-device</div>
          </div>
        </header>

        {!settings.onboarded ? (
          <Onboarding updateSettings={updateSettings} />
        ) : (
          <>
            <main className="screen" key={tab}>
              {tab === 'home' &&
                (settings.mode === 'pregnant' ? <PregnancyScreen {...props} /> : <Dashboard {...props} />)}
              {tab === 'calendar' && <CalendarView {...props} />}
              {tab === 'insights' && <Insights {...props} />}
              {tab === 'settings' && <SettingsView {...props} />}
            </main>
            <div className="footer">
              Your data stays on this device · <a href="https://github.com/HYPERSAHIL/periodtracker">source</a>
            </div>
          </>
        )}
      </div>

      {settings.onboarded && (
        <nav className="bottomnav" aria-label="Main navigation">
          <div className="inner">
            <NavBtn on={tab === 'home'} label="Home" icon={<IconHome />} go={() => setTab('home')} />
            <NavBtn on={tab === 'calendar'} label="Calendar" icon={<IconCalendar />} go={() => setTab('calendar')} />
            <NavBtn on={tab === 'insights'} label="Insights" icon={<IconChart />} go={() => setTab('insights')} />
            <NavBtn on={tab === 'settings'} label="Settings" icon={<IconGear />} go={() => setTab('settings')} />
          </div>
        </nav>
      )}

      {sheetDate && (
        <DaySheet
          date={sheetDate}
          entry={entries[sheetDate] ?? null}
          facts={facts.get(sheetDate)}
          phase={phaseFor(sheetDate, stats, facts)}
          tempUnit={settings.tempUnit}
          weightUnit={settings.weightUnit}
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
