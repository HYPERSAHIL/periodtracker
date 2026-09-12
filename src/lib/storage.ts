import { DayEntry, DEFAULT_SETTINGS, PAIN_AREAS, Settings, TRACKER_SECTIONS, normMethod } from '../types';
import { normLang } from './i18n';

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
  const flow = (v: unknown): DayEntry['flow'] =>
    ['spotting', 'light', 'medium', 'heavy'].includes(v as string) ? (v as DayEntry['flow']) : null;
  const mucus = (v: unknown): DayEntry['mucus'] =>
    ['dry', 'sticky', 'creamy', 'watery', 'eggwhite', 'unusual'].includes(v as string)
      ? (v as DayEntry['mucus'])
      : null;
  return {
    date: e.date,
    updatedAt: num(e.updatedAt) ?? undefined,
    checkedIn: !!e.checkedIn,
    flow: flow(e.flow),
    clots: !!e.clots,
    symptoms: Array.isArray(e.symptoms) ? e.symptoms.filter((s) => typeof s === 'string') : [],
    moods: Array.isArray(e.moods) ? e.moods.filter((s) => typeof s === 'string') : [],
    note: typeof e.note === 'string' ? e.note : '',
    mucus: mucus(e.mucus),
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
    migraine: !!e.migraine,
    migraineAura: !!e.migraineAura,
    migraineMed: !!e.migraineMed,
    migraineHelped: !!e.migraineHelped,
    giIssues: !!e.giIssues,
    bladderPain: !!e.bladderPain,
    endoFlare: !!e.endoFlare,
    symptomSeverity: (['mild', 'moderate', 'severe'].includes(e.symptomSeverity as string)
      ? e.symptomSeverity
      : null) as DayEntry['symptomSeverity'],
    painLevel:
      typeof e.painLevel === 'number' && Number.isFinite(e.painLevel)
        ? Math.min(10, Math.max(0, Math.round(e.painLevel)))
        : null,
    painAreas: Array.isArray(e.painAreas)
      ? [...new Set(e.painAreas.filter((s) => typeof s === 'string' && PAIN_AREAS.some((a) => a.id === s)))]
      : [],
    routineImpact: (['none', 'some', 'lot'].includes(e.routineImpact as string)
      ? e.routineImpact
      : null) as DayEntry['routineImpact'],
  };
}

/** Empty day shell with every field defaulted (for programmatic day creation). */
export function blankEntry(date: string): DayEntry {
  return normalizeEntry({ date });
}

/** One-time move of pre-2.8 kick/appointment keys into the settings blob. */
function adoptLegacyPregnancy(s: Settings): void {
  try {
    if (s.kickLog === undefined) {
      const raw = localStorage.getItem('pt.kicks.v1');
      if (raw) {
        const old = JSON.parse(raw) as { sessions?: Settings['kickLog']; active?: Settings['activeKick'] };
        if (Array.isArray(old.sessions)) s.kickLog = old.sessions;
        if (old.active) s.activeKick = old.active;
        localStorage.removeItem('pt.kicks.v1');
      }
    }
    if (s.apptList === undefined) {
      const raw = localStorage.getItem('pt.preg.appts.v1');
      if (raw) {
        const old = JSON.parse(raw);
        if (Array.isArray(old)) s.apptList = old;
        localStorage.removeItem('pt.preg.appts.v1');
      }
    }
  } catch {
    /* migration is best-effort */
  }
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
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(Object.values(entries)));
  } catch {
    /* quota/private-mode: in-memory copy stays usable this session */
  }
}

/** Coerce unknown input to a clean string list (custom symptoms/moods). */
function strList(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string').map((s) => s.slice(0, 24)))] : [];
}

function validTime(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** Known section ids first (in their saved order), then any new ones appended. */
export function normalizeTrackerOrder(order: string[], hidden: string[]): { order: string[]; hidden: string[] } {  const known = TRACKER_SECTIONS.map((s) => s.id);
  const o = [...new Set([...order.filter((id) => known.includes(id)), ...known])];
  const h = [...new Set(hidden.filter((id) => known.includes(id)))];
  return { order: o, hidden: h };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const t = normalizeTrackerOrder([], []);
      return { ...DEFAULT_SETTINGS, trackerOrder: t.order, trackerHidden: t.hidden };
    }
    const s: Settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    s.contraception = { ...DEFAULT_SETTINGS.contraception, ...(s.contraception ?? {}) };
    s.contraception.method = normMethod(s.contraception.method) ?? 'none';
    if (s.weekStart !== 0 && s.weekStart !== 1) s.weekStart = 1;
    s.lang = normLang(s.lang);
    s.customSymptoms = strList(s.customSymptoms);
    s.customMoods = strList(s.customMoods);
    s.medTime = validTime(s.medTime) ? (s.medTime as string) : null;
    s.notifyMeds = s.notifyMeds === true && s.medTime !== null;
    s.irregular = s.irregular === true;
    s.teen = s.teen === true;
    s.notifyPeriod = s.notifyPeriod !== false;
    s.discreetNotifs = s.discreetNotifs === true;
    s.priorMethod = normMethod(s.priorMethod);
    s.excludedStarts = Array.isArray(s.excludedStarts)
      ? s.excludedStarts.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
    s.tryingSince =
      typeof s.tryingSince === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.tryingSince) ? s.tryingSince : null;
    const ppMood = s.ppMood;
    if (ppMood == null || typeof ppMood.score !== 'number' || typeof ppMood.date !== 'string') {
      s.ppMood = null;
    }
    s.pmddCheckStart = typeof s.pmddCheckStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.pmddCheckStart) ? s.pmddCheckStart : null;
    if (s.postpartum != null) {
      const pp = s.postpartum as { birthDate?: unknown; exclusiveBF?: unknown };
      s.postpartum =
        typeof pp.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pp.birthDate)
          ? { birthDate: pp.birthDate, exclusiveBF: pp.exclusiveBF === true }
          : null;
    }
    if (Array.isArray(s.kickLog)) s.kickLog = s.kickLog.filter((k) => k && typeof k.startedAt === 'number');
    else if (s.kickLog !== undefined) delete s.kickLog;
    if (s.activeKick != null && typeof s.activeKick.startedAt !== 'number') delete s.activeKick;
    if (Array.isArray(s.apptList)) s.apptList = s.apptList.filter((a) => a && typeof a.text === 'string');
    else if (s.apptList !== undefined) delete s.apptList;
    adoptLegacyPregnancy(s);
    const t = normalizeTrackerOrder(s.trackerOrder ?? [], s.trackerHidden ?? []);
    s.trackerOrder = t.order;
    s.trackerHidden = t.hidden;
    return s;
  } catch {
    const t = normalizeTrackerOrder([], []);
    return { ...DEFAULT_SETTINGS, trackerOrder: t.order, trackerHidden: t.hidden };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* quota/private-mode: in-memory copy stays usable this session */
  }
}

/** Remembers which day we last fired an "period is coming" notification for. */
export function lastNotifiedDay(): string | null {
  return localStorage.getItem(NOTIFY_KEY);
}

export function markNotifiedDay(day: string): void {
  localStorage.setItem(NOTIFY_KEY, day);
}

const NOTIFY_OVU_KEY = 'pt.notified.ovu.v1';
const NOTIFY_DAILY_KEY = 'pt.notified.daily.v1';
const NOTIFY_MEDS_KEY = 'pt.notified.meds.v1';

export function lastNotifiedOvulation(): string | null {
  return localStorage.getItem(NOTIFY_OVU_KEY);
}
export function markNotifiedOvulation(day: string): void {
  localStorage.setItem(NOTIFY_OVU_KEY, day);
}
export function lastNotifiedDaily(): string | null {
  return localStorage.getItem(NOTIFY_DAILY_KEY);
}
export function markNotifiedDaily(day: string): void {
  localStorage.setItem(NOTIFY_DAILY_KEY, day);
}

export function lastNotifiedMeds(): string | null {
  return localStorage.getItem(NOTIFY_MEDS_KEY);
}
export function markNotifiedMeds(day: string): void {
  localStorage.setItem(NOTIFY_MEDS_KEY, day);
}

function parseQuietMinutes(s: string | null): number | null {
  if (!s || !/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function inQuietHours(now: Date, start: string | null, end: string | null): boolean {
  const s = parseQuietMinutes(start);
  const e = parseQuietMinutes(end);
  if (s === null || e === null) return false;
  if (s === e) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s < e) return cur >= s && cur < e;
  return cur >= s || cur < e;
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
    const merged: Settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}), onboarded: true };
    merged.contraception = { ...DEFAULT_SETTINGS.contraception, ...(merged.contraception ?? {}) };
    merged.contraception.method = normMethod(merged.contraception.method) ?? 'none';
    if (merged.weekStart !== 0 && merged.weekStart !== 1) merged.weekStart = 1;
    merged.lang = normLang(merged.lang);
    merged.customSymptoms = strList(merged.customSymptoms);
    merged.customMoods = strList(merged.customMoods);
    merged.medTime = validTime(merged.medTime) ? (merged.medTime as string) : null;
    merged.notifyMeds = merged.notifyMeds === true && merged.medTime !== null;
    merged.irregular = merged.irregular === true;
    merged.teen = merged.teen === true;
    merged.discreetNotifs = merged.discreetNotifs === true;
    merged.priorMethod = normMethod(merged.priorMethod);
    merged.excludedStarts = Array.isArray(merged.excludedStarts)
      ? merged.excludedStarts.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
    merged.tryingSince =
      typeof merged.tryingSince === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(merged.tryingSince) ? merged.tryingSince : null;
    merged.pmddCheckStart =      typeof merged.pmddCheckStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(merged.pmddCheckStart)
        ? merged.pmddCheckStart
        : null;
    if (merged.postpartum != null) {
      const pp = merged.postpartum as { birthDate?: unknown; exclusiveBF?: unknown };
      merged.postpartum =
        typeof pp.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pp.birthDate)
          ? { birthDate: pp.birthDate, exclusiveBF: pp.exclusiveBF === true }
          : null;
    }
    const t = normalizeTrackerOrder(merged.trackerOrder ?? [], merged.trackerHidden ?? []);
    merged.trackerOrder = t.order;
    merged.trackerHidden = t.hidden;
    return { settings: merged, entries };
  } catch {
    return null;
  }
}

// ---------- CSV interchange (spreadsheet / other-app friendly) ----------

const CSV_COLS = [
  'date',
  'flow',
  'clots',
  'symptoms',
  'moods',
  'mucus',
  'note',
  'bbt',
  'weight',
  'lhTest',
  'pregnancyTest',
  'sleepHours',
  'steps',
  'water',
  'painLevel',
  'painAreas',
  'migraine',
  'migraineAura',
  'migraineMed',
  'migraineHelped',
  'giIssues',
  'bladderPain',
  'endoFlare',
  'checkedIn',
] as const;

function csvCell(v: unknown): string {
  const s = v == null ? '' : Array.isArray(v) ? v.join('|') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCSV(entries: Record<string, DayEntry>): string {
  const rows = Object.values(entries)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) =>
      [
        e.date,
        e.flow ?? '',
        e.clots ? '1' : '',
        (e.symptoms ?? []).join('|'),
        (e.moods ?? []).join('|'),
        e.mucus ?? '',
        e.note ?? '',
        e.bbt ?? '',
        e.weight ?? '',
        e.lhTest ?? '',
        e.pregnancyTest ?? '',
        e.sleepHours ?? '',
        e.steps ?? '',
        e.water ?? '',
        e.painLevel ?? '',
        (e.painAreas ?? []).join('|'),
        e.migraine ? '1' : '',
        e.migraineAura ? '1' : '',
        e.migraineMed ? '1' : '',
        e.migraineHelped ? '1' : '',
        e.giIssues ? '1' : '',
        e.bladderPain ? '1' : '',
        e.endoFlare ? '1' : '',
        e.checkedIn ? '1' : '',
      ]
        .map(csvCell)
        .join(',')
    );
  return [CSV_COLS.join(','), ...rows].join('\n');
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      cells.push(cur);
      cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/** Lenient CSV → entries (unknown columns ignored, bad rows skipped). */export function parseCSVEntries(text: string): Record<string, DayEntry> | null {
  try {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) return null;
    const head = parseCSVLine(lines[0]);
    if (head[0] !== 'date') return null;
    const num = (v: string): number | null => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const list = (v: string): string[] => (v ? v.split('|').filter(Boolean) : []);
    const out: Record<string, DayEntry> = {};
    for (const line of lines.slice(1)) {
      const cells = parseCSVLine(line);
      const row: Record<string, string> = {};
      head.forEach((h, i) => {
        row[h] = cells[i] ?? '';
      });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
      // enum-id columns are case-insensitive (hand-edited files say "Heavy")
      const enumId = (v: unknown): string | null => {
        const t = String(v ?? '').trim().toLowerCase();
        return t || null;
      };
      out[row.date] = normalizeEntry({
        date: row.date,
        flow: enumId(row.flow) as DayEntry['flow'],
        clots: row.clots === '1',
        symptoms: list(row.symptoms),
        moods: list(row.moods),
        mucus: enumId(row.mucus ?? '') as DayEntry['mucus'],
        note: row.note,
        bbt: num(row.bbt),
        weight: num(row.weight),
        lhTest: enumId(row.lhTest) as DayEntry['lhTest'],
        pregnancyTest: enumId(row.pregnancyTest) as DayEntry['pregnancyTest'],
        sleepHours: num(row.sleepHours),
        steps: num(row.steps),
        water: num(row.water),
        painLevel: num(row.painLevel),
        painAreas: list(row.painAreas),
        migraine: (row.migraine ?? '') === '1',
        migraineAura: (row.migraineAura ?? '') === '1',
        migraineMed: (row.migraineMed ?? '') === '1',
        migraineHelped: (row.migraineHelped ?? '') === '1',
        giIssues: (row.giIssues ?? '') === '1',
        bladderPain: (row.bladderPain ?? '') === '1',
        endoFlare: (row.endoFlare ?? '') === '1',
        checkedIn: row.checkedIn === '1',
        updatedAt: Date.now(),
      });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Apple Health export.xml → entries (weight, temperature, steps, sleep).
 * Regex-based so it runs anywhere (no DOMParser needed); unknown record
 * types are ignored. Imported days are marked checked-in.
 */export function parseHealthXML(text: string): Record<string, DayEntry> | null {
  try {
    if (!/<HealthData[\s>]/.test(text)) return null;
    const agg = new Map<string, { weight?: number; bbt?: number; steps?: number; sleep?: number }>();
    const rec = (d: string) => {
      let a = agg.get(d);
      if (!a) {
        a = {};
        agg.set(d, a);
      }
      return a;
    };
    const attr = (tag: string, name: string): string | null => {
      const m = tag.match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1] : null;
    };
    const dayOf = (dt: string | null): string | null => {
      const m = dt?.match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    };
    const stamp = (dt: string | null): number => {
      const m = dt?.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (!m) return NaN;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    };
    for (const m of text.matchAll(/<Record\b[^>]*\/>/g)) {
      const tag = m[0];
      const type = attr(tag, 'type');
      // sleep counts toward the morning it ends on, everything else toward its start
      const day =
        type === 'HKQuantityTypeIdentifierSleepAnalysis'
          ? dayOf(attr(tag, 'endDate'))
          : dayOf(attr(tag, 'startDate'));
      if (!type || !day) continue;
      const val = Number(attr(tag, 'value') ?? '');
      if (type === 'HKQuantityTypeIdentifierBodyMass' && Number.isFinite(val)) {
        const unit = attr(tag, 'unit');
        const kg = unit === 'lb' ? val / 2.20462 : unit === 'g' ? val / 1000 : unit === 'oz' ? val / 35.274 : unit === 'kg' || unit == null ? val : NaN;
        if (Number.isFinite(kg)) rec(day).weight = kg;
      } else if (type === 'HKQuantityTypeIdentifierBodyTemperature' && Number.isFinite(val)) {
        const unit = attr(tag, 'unit');
        const c = unit === 'degF' ? ((val - 32) * 5) / 9 : unit === 'degC' || unit == null ? val : unit === 'K' ? val - 273.15 : NaN;
        if (Number.isFinite(c)) rec(day).bbt = c;
      } else if (type === 'HKQuantityTypeIdentifierStepCount' && Number.isFinite(val)) {
        const a = rec(day);
        a.steps = (a.steps ?? 0) + val;
      } else if (type === 'HKQuantityTypeIdentifierSleepAnalysis') {
        const v = attr(tag, 'value') ?? '';
        if (v.includes('Asleep')) {
          const dur = stamp(attr(tag, 'endDate')) - stamp(attr(tag, 'startDate'));
          if (Number.isFinite(dur) && dur > 0) {
            const a = rec(day);
            a.sleep = Math.min(24, (a.sleep ?? 0) + dur / 3600000);
          }
        }
      }
    }
    if (!agg.size) return null;
    const out: Record<string, DayEntry> = {};
    for (const [date, a] of agg) {
      out[date] = normalizeEntry({
        date,
        weight: a.weight != null ? Math.round(a.weight * 100) / 100 : null,
        bbt: a.bbt != null ? Math.round(a.bbt * 100) / 100 : null,
        steps: a.steps != null ? Math.round(a.steps) : null,
        sleepHours: a.sleep != null ? Math.round(a.sleep * 10) / 10 : null,
        // passive metrics only — not an explicit check-in
        updatedAt: Date.now(),
      });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Additive import merge: incoming days fill gaps but never delete what the
 * user already logged (CSV/Health rows carry only a subset of columns).
 */
export function mergeImportedEntries(
  prev: Record<string, DayEntry>,
  incoming: Record<string, DayEntry>
): Record<string, DayEntry> {
  const out: Record<string, DayEntry> = { ...prev };
  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  for (const [date, inc] of Object.entries(incoming)) {
    const cur = out[date];
    if (!cur) {
      out[date] = inc;
      continue;
    }
    const next: DayEntry = {
      ...cur,
      flow: inc.flow ?? cur.flow,
      clots: inc.clots || cur.clots,
      symptoms: inc.symptoms.length ? union(cur.symptoms, inc.symptoms) : cur.symptoms,
      moods: inc.moods.length ? union(cur.moods, inc.moods) : cur.moods,
      note: inc.note ? (cur.note ? `${cur.note}\n${inc.note}` : inc.note) : cur.note,
      mucus: inc.mucus ?? cur.mucus,
      bbt: inc.bbt ?? cur.bbt,
      weight: inc.weight ?? cur.weight,
      lhTest: inc.lhTest ?? cur.lhTest,
      pregnancyTest: inc.pregnancyTest ?? cur.pregnancyTest,
      intercourse: inc.intercourse ?? cur.intercourse,
      drive: inc.drive ?? cur.drive,
      sleepHours: inc.sleepHours ?? cur.sleepHours,
      sleepQuality: inc.sleepQuality ?? cur.sleepQuality,
      water: inc.water ?? cur.water,
      steps: inc.steps ?? cur.steps,
      exerciseMinutes: inc.exerciseMinutes ?? cur.exerciseMinutes,
      alcohol: inc.alcohol ?? cur.alcohol,
      caffeine: inc.caffeine ?? cur.caffeine,
      smoked: inc.smoked || cur.smoked,
      supplements: inc.supplements || cur.supplements,
      pillTaken: inc.pillTaken || cur.pillTaken,
      pillMissed: inc.pillMissed || cur.pillMissed,
      migraine: inc.migraine || cur.migraine,
      migraineAura: inc.migraineAura || cur.migraineAura,
      migraineMed: inc.migraineMed || cur.migraineMed,
      migraineHelped: inc.migraineHelped || cur.migraineHelped,
      giIssues: inc.giIssues || cur.giIssues,
      bladderPain: inc.bladderPain || cur.bladderPain,
      endoFlare: inc.endoFlare || cur.endoFlare,
      symptomSeverity: inc.symptomSeverity ?? cur.symptomSeverity,
      routineImpact: inc.routineImpact ?? cur.routineImpact,
      painLevel: inc.painLevel ?? cur.painLevel,
      painAreas: inc.painAreas.length ? union(cur.painAreas, inc.painAreas) : cur.painAreas,
      checkedIn: inc.checkedIn || cur.checkedIn,
      updatedAt: cur.updatedAt,
    };
    // stamp only on real change so no-op imports don't manufacture sync conflicts
    const { updatedAt: _a, ...nextRest } = next;
    const { updatedAt: _b, ...curRest } = cur;
    next.updatedAt =
      JSON.stringify(nextRest) === JSON.stringify(curRest) ? cur.updatedAt : Date.now();
    out[date] = next;
  }
  return out;
}

const WEARABLE_COLS: { key: 'date' | 'bbt' | 'weight' | 'steps' | 'sleepHours'; names: string[] }[] = [
  { key: 'date', names: ['date', 'day', 'timestamp', 'time', 'datetime', 'sleep day', 'calendarDate'] },
  { key: 'bbt', names: ['temp', 'temperature', 'body temp', 'body_temp', 'wrist temp', 'skin temp', 'basal', 'bbt', 'avg temp'] },
  { key: 'weight', names: ['weight', 'body mass', 'body_mass', 'mass', 'weight kg', 'weightkg'] },
  { key: 'steps', names: ['steps', 'step count', 'step_count', 'total steps'] },
  { key: 'sleepHours', names: ['sleep', 'sleep hours', 'sleep_hours', 'sleep duration', 'asleep hours', 'total sleep', 'sleep (h)'] },
];

export interface WearableImport {
  entries: Record<string, DayEntry>;
  tempUnit: 'C' | 'F';
  weightUnit: 'kg' | 'lb';
}

/**
 * Generic wearable CSV (Oura/Withings/Fitbit exports, Health Connect dumps):
 * header synonyms auto-mapped, units inferred from magnitudes (temp > 45 →
 * °F, avg weight > 250 → lb — the ambiguous middle stays metric), unknown
 * columns ignored. Set dayFirst for DD/MM/YYYY exports.
 */
export function parseWearableCSV(text: string, opts?: { dayFirst?: boolean }): WearableImport | null {
  try {
    const dayFirst = opts?.dayFirst === true;
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) return null;
    const head = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    const col: Record<string, number> = {};
    for (const { key, names } of WEARABLE_COLS) {
      if (key in col) continue;
      let i = head.findIndex((h) => names.some((n) => h === n));
      if (i < 0) {
        // fallback: match on token boundaries, not raw substring
        i = head.findIndex((h) => names.some((n) => h.split(/[^a-z0-9]+/).includes(n)));
      }
      if (i >= 0) col[key] = i;
    }
    if (!('date' in col)) return null;
    const num = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const validDate = (y: number, m: number, d: number): boolean => {
      if (m < 1 || m > 12 || d < 1 || d > 31) return false;
      const dt = new Date(y, m - 1, d);
      return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
    };
    const rows: { date: string; bbt: number | null; weight: number | null; steps: number | null; sleep: number | null }[] = [];
    for (const line of lines.slice(1)) {
      const cells = parseCSVLine(line);
      const raw = (cells[col.date] ?? '').trim().slice(0, 10);
      let date = '';
      const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso && validDate(+iso[1], +iso[2], +iso[3])) {
        date = raw;
      } else {
        const m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
        if (m) {
          const a = +m[1];
          const b = +m[2];
          const y = +m[3];
          // disambiguate by range; ties broken by dayFirst (DD/MM locales)
          const mdy = a <= 12 && b <= 31;
          const dmy = b <= 12 && a <= 31;
          let mm = 0;
          let dd = 0;
          if (mdy && !dmy) {
            mm = a;
            dd = b;
          } else if (dmy && !mdy) {
            mm = b;
            dd = a;
          } else if (mdy && dmy) {
            mm = dayFirst ? b : a;
            dd = dayFirst ? a : b;
          } else continue;
          if (!validDate(y, mm, dd)) continue;
          date = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
        } else continue;
      }
      rows.push({
        date,
        bbt: 'bbt' in col ? num(cells[col.bbt] ?? '') : null,
        weight: 'weight' in col ? num(cells[col.weight] ?? '') : null,
        steps: 'steps' in col ? num(cells[col.steps] ?? '') : null,
        sleep: 'sleepHours' in col ? num(cells[col.sleepHours] ?? '') : null,
      });
    }
    if (!rows.length) return null;
    const temps = rows.map((r) => r.bbt).filter((v): v is number => v != null);
    const weights = rows.map((r) => r.weight).filter((v): v is number => v != null);
    const tempUnit = temps.length && Math.max(...temps) > 45 ? 'F' : 'C';
    const avgW = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 0;
    const weightUnit = weights.length && avgW > 250 ? 'lb' : 'kg';
    const out: Record<string, DayEntry> = {};
    for (const r of rows) {
      const bbtC = r.bbt == null ? null : tempUnit === 'F' ? ((r.bbt - 32) * 5) / 9 : r.bbt;
      const weightKg = r.weight == null ? null : weightUnit === 'lb' ? r.weight / 2.20462 : r.weight;
      if (bbtC == null && weightKg == null && r.steps == null && r.sleep == null) continue;
      out[r.date] = normalizeEntry({
        date: r.date,
        bbt: bbtC != null ? Math.round(bbtC * 100) / 100 : null,
        weight: weightKg != null ? Math.round(weightKg * 100) / 100 : null,
        steps: r.steps != null ? Math.round(r.steps) : null,
        sleepHours: r.sleep != null ? Math.round(r.sleep * 10) / 10 : null,
        updatedAt: Date.now(),
      });
    }
    if (!Object.keys(out).length) return null;
    return { entries: out, tempUnit, weightUnit };
  } catch {
    return null;
  }
}

/**
 * Minimal FHIR R4 bundle for clinicians: Patient + Observations (menstruation
 * flow, body temperature, body weight, pain score). Importable by EHRs that
 * accept patient-generated bundles.
 */
export function entriesToFHIR(entries: Record<string, DayEntry>): string {
  const obs: unknown[] = [];
  const days = Object.values(entries).sort((a, b) => a.date.localeCompare(b.date));
  for (const e of days) {
    const push = (code: string, display: string, value: unknown, unit?: string) =>
      obs.push({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ system: 'http://loinc.org', code, display }] },
        subject: { reference: 'Patient/self' },
        effectiveDateTime: e.date,
        ...(typeof value === 'number'
          ? { valueQuantity: { value, ...(unit ? { unit } : {}) } }
          : { valueString: String(value) }),
      });
    if (e.flow) push('49033-4', 'Menstruation flow', e.flow);
    if (e.bbt != null) push('8310-5', 'Body temperature', e.bbt, 'Cel');
    if (e.weight != null) push('29463-7', 'Body weight', e.weight, 'kg');
    if (e.painLevel != null) push('72514-3', 'Pain severity', e.painLevel, '{score}');
    if (e.lhTest === 'positive') push('59603-2', 'LH urine test', 'positive');
  }
  return JSON.stringify(
    {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: [{ resource: { resourceType: 'Patient', id: 'self' } }, ...obs.map((resource) => ({ resource }))],
    },
    null,
    2
  );
}
