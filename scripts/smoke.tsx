/** Render smoke test: every screen in EN + HI via renderToString (run: bun scripts/smoke.tsx). */
import React from 'react';
import { renderToString } from 'react-dom/server';
import App from '../src/App';
import { DEFAULT_SETTINGS, type DayEntry } from '../src/types';
import { blankEntry, loadEntries, loadSettings } from '../src/lib/storage';
import { buildFacts, computeStats, phaseFor } from '../src/lib/cycle';
import Dashboard from '../src/components/Dashboard';
import CalendarView from '../src/components/CalendarView';
import Insights from '../src/components/Insights';
import Learn from '../src/components/Learn';
import SettingsView from '../src/components/SettingsView';
import Report from '../src/components/Report';
import PregnancyScreen from '../src/components/PregnancyScreen';
import DaySheet from '../src/components/DaySheet';
import AccountScreen from '../src/components/AccountScreen';

// --- minimal browser shims (renderToString needs no DOM, but libs touch these) ---
const store = new Map<string, string>();
// @ts-expect-error shim
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
// @ts-expect-error shim
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// @ts-expect-error shim
globalThis.navigator = { language: 'en-US' };

function seed(lang: 'en' | 'hi', onboarded: boolean) {
  store.clear();
  store.set(
    'pt.settings.v1',
    JSON.stringify({ ...DEFAULT_SETTINGS, lang, onboarded, lastPeriodStart: '2026-08-01' })
  );
  const e1: DayEntry = {
    ...blankEntry('2026-08-01'),
    flow: 'medium',
    checkedIn: true,
    symptoms: ['Cramps'],
    moods: ['Tired'],
    bbt: 36.6,
    weight: 60,
    lhTest: 'positive',
    updatedAt: 1,
  };
  const e2: DayEntry = { ...blankEntry('2026-08-02'), updatedAt: 1 };
  const e3: DayEntry = { ...blankEntry('2026-08-29'), flow: 'light', checkedIn: true, updatedAt: 2 };
  store.set('pt.entries.v1', JSON.stringify([e1, e2, e3]));
}

let failures = 0;
for (const lang of ['en', 'hi'] as const) {
  for (const onboarded of [false, true]) {
    seed(lang, onboarded);
    try {
      const html = renderToString(React.createElement(App));
      if (lang === 'hi' && onboarded && !html.includes('होम')) throw new Error('hindi nav missing');
      // fresh sessions render the lazy 3D gate fallback server-side
      if (!onboarded && !html.includes('onboard') && !html.includes('60vh')) throw new Error('onboarding missing');
      console.log(`ok: app lang=${lang} onboarded=${onboarded} (${html.length} chars)`);
    } catch (e) {
      failures++;
      console.log(`FAIL: app lang=${lang} onboarded=${onboarded}:`, (e as Error).message.slice(0, 200));
    }
  }
}
// per-tab screens with real props (Hindi, onboarded)
{
  seed('hi', true);
  const entries = loadEntries();
  const settings = loadSettings();
  const stats = computeStats(entries, settings);
  const facts = buildFacts(entries, stats);
  const noop = () => {};
  const base = {
    entries,
    settings,
    stats,
    facts,
    upsert: noop,
    remove: noop,
    replaceAll: noop,
    updateSettings: noop,
    eraseAll: noop,
    openDay: noop,
    openReport: noop,
    cloudUser: null,
    openAccount: noop,
    signOutCloud: async () => {},
    shareApi: {
      create: async () => ({ token: 'x', expiresInDays: 30 }),
      list: async () => [],
      revoke: async () => {},
    },
  };
  const screens: [string, React.ComponentType<never>][] = [
    ['Dashboard', Dashboard as never],
    ['CalendarView', CalendarView as never],
    ['Insights', Insights as never],
    ['Learn', Learn as never],
    ['SettingsView', SettingsView as never],
    ['Report', Report as never],
    ['PregnancyScreen', PregnancyScreen as never],
  ];
  for (const [name, C] of screens) {
    try {
      const html = renderToString(
        React.createElement(C, (name === 'Report' ? { ...base, closeReport: noop } : base) as never)
      );
      console.log(`ok: screen=${name} (${html.length} chars)`);
    } catch (e) {
      failures++;
      console.log(`FAIL: screen=${name}:`, (e as Error).message.slice(0, 200));
    }
  }
  // PregnancyScreen full UI needs a due date
  try {
    const pregSettings = { ...settings, mode: 'pregnant' as const, dueDate: '2027-05-01' };
    const html = renderToString(React.createElement(PregnancyScreen, { ...base, settings: pregSettings } as never));
    if (!html.includes('Kick counter') && !html.includes('किक काउंटर')) throw new Error('kick counter missing');
    console.log(`ok: screen=PregnancyScreen-full (${html.length} chars)`);
  } catch (e) {
    failures++;
    console.log('FAIL: screen=PregnancyScreen-full:', (e as Error).message.slice(0, 200));
  }
  // AccountScreen: password gate intact, no passwordless tab
  try {
    const html = renderToString(
      React.createElement(AccountScreen, { user: null, onDone: noop, lang: 'en' } as never)
    );
    if (!html.includes('ac-pass')) throw new Error('password field missing');
    if (html.includes('email code instead') || html.includes('mg-email')) throw new Error('passwordless tab leaked');
    console.log(`ok: screen=AccountScreen (${html.length} chars)`);
  } catch (e) {
    failures++;
    console.log('FAIL: screen=AccountScreen:', (e as Error).message.slice(0, 200));
  }
  try {
    const html = renderToString(
      React.createElement(DaySheet, {
        date: '2026-08-29',
        entry: entries['2026-08-29'] ?? null,
        facts: facts.get('2026-08-29'),
        phase: phaseFor('2026-08-29', stats, facts),
        settings,
        updateSettings: noop,
        onClose: noop,
        onSave: noop,
        onDelete: noop,
      })
    );
    console.log(`ok: screen=DaySheet (${html.length} chars)`);
  } catch (e) {
    failures++;
    console.log('FAIL: screen=DaySheet:', (e as Error).message.slice(0, 200));
  }
}
console.log(failures === 0 ? 'smoke: ALL PASSED' : `smoke: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
