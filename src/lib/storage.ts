import { DayEntry, DEFAULT_SETTINGS, Settings } from '../types';

const ENTRIES_KEY = 'pt.entries.v1';
const SETTINGS_KEY = 'pt.settings.v1';
const NOTIFY_KEY = 'pt.notified.v1';

export interface BackupFile {
  app: 'period-tracker';
  version: 1 | 2;
  exportedAt: string;
  settings: Settings;
  entries: DayEntry[];
}

function normalizeEntry(e: Partial<DayEntry> & { date: string }): DayEntry {
  return {
    date: e.date,
    flow: (e.flow ?? null) as DayEntry['flow'],
    symptoms: Array.isArray(e.symptoms) ? e.symptoms.filter((s) => typeof s === 'string') : [],
    moods: Array.isArray(e.moods) ? e.moods.filter((s) => typeof s === 'string') : [],
    note: typeof e.note === 'string' ? e.note : '',
    mucus: (e.mucus ?? null) as DayEntry['mucus'],
    bbt: typeof e.bbt === 'number' && Number.isFinite(e.bbt) ? e.bbt : null,
    weight: typeof e.weight === 'number' && Number.isFinite(e.weight) ? e.weight : null,
    lhTest: e.lhTest === 'positive' || e.lhTest === 'negative' ? e.lhTest : null,
    pregnancyTest:
      e.pregnancyTest === 'positive' || e.pregnancyTest === 'negative' ? e.pregnancyTest : null,
    intercourse: !!e.intercourse,
    contraception: !!e.contraception,
  };
}

export function loadEntries(): Record<string, DayEntry> {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: Record<string, DayEntry> = {};
    for (const e of parsed) {
      if (e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        out[e.date] = normalizeEntry(e);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveEntries(entries: Record<string, DayEntry>): void {
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(Object.values(entries)));
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Remembers which day we last fired an "period is coming" notification for. */
export function lastNotifiedDay(): string | null {
  return localStorage.getItem(NOTIFY_KEY);
}

export function markNotifiedDay(day: string): void {
  localStorage.setItem(NOTIFY_KEY, day);
}

export function toBackup(entries: Record<string, DayEntry>, settings: Settings): BackupFile {
  return {
    app: 'period-tracker',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings,
    entries: Object.values(entries).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function parseBackup(text: string): { settings: Settings; entries: Record<string, DayEntry> } | null {
  try {
    const data = JSON.parse(text) as Partial<BackupFile>;
    if (!data || data.app !== 'period-tracker' || !Array.isArray(data.entries)) return null;
    const entries: Record<string, DayEntry> = {};
    for (const e of data.entries) {
      if (e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        entries[e.date] = normalizeEntry(e as DayEntry);
      }
    }
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), onboarded: true };
    return { settings, entries };
  } catch {
    return null;
  }
}
