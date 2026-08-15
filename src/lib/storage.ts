import { DayEntry, DEFAULT_SETTINGS, Settings } from '../types';

const ENTRIES_KEY = 'pt.entries.v1';
const SETTINGS_KEY = 'pt.settings.v1';
const NOTIFY_KEY = 'pt.notified.v1';

export interface BackupFile {
  app: 'period-tracker';
  version: 1;
  exportedAt: string;
  settings: Settings;
  entries: DayEntry[];
}

export function loadEntries(): Record<string, DayEntry> {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: Record<string, DayEntry> = {};
    for (const e of parsed) {
      if (e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        out[e.date] = {
          date: e.date,
          flow: e.flow ?? null,
          symptoms: Array.isArray(e.symptoms) ? e.symptoms : [],
          moods: Array.isArray(e.moods) ? e.moods : [],
          note: typeof e.note === 'string' ? e.note : '',
        };
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
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    entries: Object.values(entries).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function parseBackup(text: string): { settings: Settings; entries: Record<string, DayEntry> } | null {
  try {
    const data = JSON.parse(text) as BackupFile;
    if (!data || data.app !== 'period-tracker' || !Array.isArray(data.entries)) return null;
    const entries: Record<string, DayEntry> = {};
    for (const e of data.entries) {
      if (e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
        entries[e.date] = {
          date: e.date,
          flow: e.flow ?? null,
          symptoms: Array.isArray(e.symptoms) ? e.symptoms : [],
          moods: Array.isArray(e.moods) ? e.moods : [],
          note: typeof e.note === 'string' ? e.note : '',
        };
      }
    }
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), onboarded: true };
    return { settings, entries };
  } catch {
    return null;
  }
}
