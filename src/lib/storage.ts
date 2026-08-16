import { DayEntry, DEFAULT_SETTINGS, Settings, TRACKER_SECTIONS } from '../types';

const ENTRIES_KEY = 'pt.entries.v1';
const SETTINGS_KEY = 'pt.settings.v1';
const NOTIFY_KEY = 'pt.notified.v1';

export interface BackupFile {
  app: 'period-tracker';
  version: number;
  exportedAt: string;
  settings: Settings;
  entries: DayEntry[];
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function normalizeEntry(e: Partial<DayEntry> & { date: string }): DayEntry {
  const test = (v: unknown): DayEntry['lhTest'] =>
    ['negative', 'positive', 'faint', 'unclear'].includes(v as string) ? (v as DayEntry['lhTest']) : null;
  return {
    date: e.date,
    checkedIn: !!e.checkedIn,
    flow: (e.flow ?? null) as DayEntry['flow'],
    clots: !!e.clots,
    symptoms: Array.isArray(e.symptoms) ? e.symptoms.filter((s) => typeof s === 'string') : [],
    moods: Array.isArray(e.moods) ? e.moods.filter((s) => typeof s === 'string') : [],
    note: typeof e.note === 'string' ? e.note : '',
    mucus: (e.mucus ?? null) as DayEntry['mucus'],
    bbt: num(e.bbt),
    weight: num(e.weight),
    lhTest: test(e.lhTest),
    pregnancyTest: test(e.pregnancyTest),
    intercourse: (['protected', 'unprotected'].includes(e.intercourse as string)
      ? e.intercourse
      : null) as DayEntry['intercourse'],
    drive: (['low', 'normal', 'high'].includes(e.drive as string) ? e.drive : null) as DayEntry['drive'],
    sleepHours: num(e.sleepHours),
    sleepQuality: (['poor', 'fair', 'good'].includes(e.sleepQuality as string)
      ? e.sleepQuality
      : null) as DayEntry['sleepQuality'],
    water: num(e.water),
    steps: num(e.steps),
    exerciseMinutes: num(e.exerciseMinutes),
    alcohol: num(e.alcohol),
    caffeine: num(e.caffeine),
    smoked: !!e.smoked,
    supplements: !!e.supplements,
    pillTaken: !!e.pillTaken,
    pillMissed: !!e.pillMissed,
    symptomSeverity: (['mild', 'moderate', 'severe'].includes(e.symptomSeverity as string)
      ? e.symptomSeverity
      : null) as DayEntry['symptomSeverity'],
    routineImpact: (['none', 'some', 'lot'].includes(e.routineImpact as string)
      ? e.routineImpact
      : null) as DayEntry['routineImpact'],
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

/** Known section ids first (in their saved order), then any new ones appended. */
export function normalizeTrackerOrder(order: string[], hidden: string[]): { order: string[]; hidden: string[] } {
  const known = TRACKER_SECTIONS.map((s) => s.id);
  const o = [...new Set([...order.filter((id) => known.includes(id)), ...known])];
  const h = [...new Set(hidden.filter((id) => known.includes(id)))];
  return { order: o, hidden: h };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    s.contraception = { ...DEFAULT_SETTINGS.contraception, ...(s.contraception ?? {}) };
    const t = normalizeTrackerOrder(s.trackerOrder ?? [], s.trackerHidden ?? []);
    s.trackerOrder = t.order;
    s.trackerHidden = t.hidden;
    return s;
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
    version: 3,
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
    const merged = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), onboarded: true };
    merged.contraception = { ...DEFAULT_SETTINGS.contraception, ...(merged.contraception ?? {}) };
    const t = normalizeTrackerOrder(merged.trackerOrder ?? [], merged.trackerHidden ?? []);
    merged.trackerOrder = t.order;
    merged.trackerHidden = t.hidden;
    return { settings: merged, entries };
  } catch {
    return null;
  }
}
