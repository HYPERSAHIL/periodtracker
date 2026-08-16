import { ContraceptionRegimen, DayEntry, HORMONAL_METHODS, Settings } from '../types';
import { addDays, clamp, diffDays, todayISO } from './date';

export interface PeriodCluster {
  start: string;
  end: string;
  length: number;
}

export type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'unknown';

export interface CycleStats {
  clusters: PeriodCluster[];
  cycleLengths: number[]; // all valid intervals, chronological
  avgCycle: number; // robust median of recent intervals (or baseline)
  avgPeriod: number;
  usingDefaults: boolean;
  lastStart: string | null;
  nextStart: string | null;
  daysUntilNext: number | null; // negative = late
  lateBy: number | null; // days past the prediction, while still "late" not "reset"
  ovulationDate: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  cycleDay: number | null;
  predictionsPaused: boolean;
  stale: boolean; // last period too old to extrapolate from
  uncertaintyDays: number; // ± around nextStart
  periodWindow: { start: string; end: string } | null;
  fertileSuppressed: boolean; // hormonal contraception → fertility forecasts hidden
  includedLengths: number[];
  excludedLengths: number[];
}

/** Group logged flow days into consecutive-day bleeding episodes ("periods"). */
export function periodClusters(entries: Record<string, DayEntry>): PeriodCluster[] {
  const dates = Object.values(entries)
    .filter((e) => e.flow)
    .map((e) => e.date)
    .sort();
  const clusters: PeriodCluster[] = [];
  let start = '';
  let prev = '';
  for (const d of dates) {
    if (!start) {
      start = d;
    } else if (diffDays(prev, d) > 1) {
      clusters.push({ start, end: prev, length: diffDays(start, prev) + 1 });
      start = d;
    }
    prev = d;
  }
  if (start) clusters.push({ start, end: prev, length: diffDays(start, prev) + 1 });
  return clusters;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** ± days around the point forecast, derived from the user's own variation. */
function uncertaintyFromHistory(lengths: number[]): number {
  if (lengths.length <= 1) return 7;
  if (lengths.length === 2) return Math.min(14, Math.max(5, Math.ceil(Math.abs(lengths[1] - lengths[0]) / 2) + 3));
  const center = median(lengths);
  const mad = median(lengths.map((l) => Math.abs(l - center)));
  const residuals = lengths.map((l) => Math.abs(l - center)).sort((a, b) => a - b);
  const coverage = residuals[Math.ceil((residuals.length - 1) * 0.8)];
  // 1.4826 × MAD ≈ standard deviation; +2 days avoids false precision
  const spread = Math.ceil(Math.max(mad * 1.4826, coverage) + 2);
  return Math.min(14, Math.max(2, spread));
}

export function isHormonal(c: ContraceptionRegimen): boolean {
  return HORMONAL_METHODS.includes(c.method);
}

export function computeStats(entries: Record<string, DayEntry>, settings: Settings): CycleStats {
  const clusters = periodClusters(entries);
  const starts = clusters.map((c) => c.start);

  const allIntervals: number[] = [];
  const excluded: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = diffDays(starts[i - 1], starts[i]);
    if (len >= 15 && len <= 90) allIntervals.push(len);
    else excluded.push(len);
  }
  const included = allIntervals.slice(-6);
  const usingDefaults = starts.length < 2;

  const avgCycle = usingDefaults
    ? clamp(settings.avgCycleLength, 15, 90)
    : clamp(Math.round(median(included)), 15, 90);
  const avgPeriod = usingDefaults
    ? clamp(settings.avgPeriodLength, 1, 14)
    : clamp(Math.round(mean(clusters.slice(-6).map((c) => c.length))), 1, 14);

  const today = todayISO();
  const lastStart = starts.length ? starts[starts.length - 1] : settings.lastPeriodStart;
  const paused = settings.predictionsPaused || settings.mode === 'pregnant';
  const daysSinceLast = lastStart ? diffDays(lastStart, today) : null;
  const stale = !paused && daysSinceLast !== null && daysSinceLast > 90;

  const uncertaintyDays = usingDefaults ? 7 : uncertaintyFromHistory(included);

  let nextStart: string | null = null;
  let lateBy: number | null = null;
  let daysUntilNext: number | null = null;
  if (lastStart && !paused && !stale) {
    let anchor = addDays(lastStart, avgCycle);
    const overdue = diffDays(today, anchor); // >0 means anchor already passed
    if (overdue > 0) {
      if (overdue <= uncertaintyDays + 7) {
        lateBy = overdue; // plausible late period — surface it, don't silently re-anchor
      } else {
        // far overdue: likely a real change (or pregnancy) — re-anchor forward
        while (diffDays(today, anchor) < 0) anchor = addDays(anchor, avgCycle);
      }
    }
    nextStart = anchor;
    daysUntilNext = diffDays(today, anchor);
  }

  const fertileSuppressed = !paused && isHormonal(settings.contraception);
  const ovulationDate = nextStart && !fertileSuppressed ? addDays(nextStart, -14) : null;
  const fertileStart = ovulationDate ? addDays(ovulationDate, -5) : null;
  const fertileEnd = ovulationDate ? addDays(ovulationDate, 1) : null;
  const cycleDay = lastStart ? diffDays(lastStart, today) + 1 : null;

  return {
    clusters,
    cycleLengths: allIntervals,
    avgCycle,
    avgPeriod,
    usingDefaults,
    lastStart,
    nextStart,
    daysUntilNext,
    lateBy,
    ovulationDate,
    fertileStart,
    fertileEnd,
    cycleDay: cycleDay && cycleDay > 0 ? cycleDay : null,
    predictionsPaused: paused,
    stale,
    uncertaintyDays,
    periodWindow: nextStart
      ? { start: addDays(nextStart, -uncertaintyDays), end: addDays(nextStart, uncertaintyDays) }
      : null,
    fertileSuppressed,
    includedLengths: included,
    excludedLengths: excluded,
  };
}

export interface DayFacts {
  period: boolean; // logged bleeding
  predicted: boolean; // predicted bleeding
  fertile: boolean;
  ovulation: boolean;
}

/**
 * Precomputed facts for every interesting date: from the first logged day up to
 * ~10 months past today (6 future prediction cycles). Fertility markers are
 * omitted while hormonal contraception suppresses them.
 */
export function buildFacts(
  entries: Record<string, DayEntry>,
  stats: CycleStats,
  horizonMonths = 10
): Map<string, DayFacts> {
  const facts = new Map<string, DayFacts>();
  const touch = (d: string) => {
    if (!facts.has(d)) facts.set(d, { period: false, predicted: false, fertile: false, ovulation: false });
    return facts.get(d)!;
  };

  for (const e of Object.values(entries)) {
    if (e.flow) touch(e.date).period = true;
  }

  if (!stats.predictionsPaused && !stats.stale && stats.lastStart && stats.avgCycle) {
    const today = todayISO();
    let anchor = stats.nextStart ?? addDays(stats.lastStart, stats.avgCycle);
    let guard = 0;
    while (diffDays(today, anchor) < -stats.avgCycle && guard++ < 24) anchor = addDays(anchor, stats.avgCycle);
    for (let c = 0; c < 6; c++) {
      for (let i = 0; i < stats.avgPeriod; i++) touch(addDays(anchor, i)).predicted = true;
      if (!stats.fertileSuppressed) {
        const ovu = addDays(anchor, -14);
        for (let i = -5; i <= 1; i++) touch(addDays(ovu, i)).fertile = true;
        touch(ovu).ovulation = true;
      }
      anchor = addDays(anchor, stats.avgCycle);
      if (diffDays(today, anchor) > Math.round(horizonMonths * 30.5)) break;
    }
  }
  return facts;
}

export function phaseFor(dateISO: string, stats: CycleStats, facts: Map<string, DayFacts>): Phase {
  if (!stats.lastStart || diffDays(stats.lastStart, dateISO) < 0) return 'unknown';
  const f = facts.get(dateISO);
  if (f?.period || f?.predicted) return 'menstrual';
  if (stats.ovulationDate) {
    const d = diffDays(stats.ovulationDate, dateISO);
    if (d >= -1 && d <= 1) return 'ovulation';
    if (d > 1) return 'luteal';
  }
  if (stats.nextStart && diffDays(dateISO, stats.nextStart) >= 0) return 'luteal';
  return 'follicular';
}

export const PHASE_INFO: Record<Phase, { label: string; blurb: string }> = {
  menstrual: { label: 'Menstrual phase', blurb: 'Bleeding days. Rest, hydrate, and be kind to yourself.' },
  follicular: { label: 'Follicular phase', blurb: 'Estrogen is rising — many people feel their most energetic now.' },
  ovulation: { label: 'Ovulation phase', blurb: 'Around ovulation — the most fertile days of your cycle.' },
  luteal: { label: 'Luteal phase', blurb: 'After ovulation. PMS symptoms are most common in this phase.' },
  unknown: { label: 'Cycle phase', blurb: 'Log a period to unlock phase tracking and predictions.' },
};

/** Gentle, non-diagnostic regularity read based on cycle length variation. */
export function regularity(stats: CycleStats): { label: string; note: string; variation: number | null } {
  const lens = stats.cycleLengths.slice(-6);
  if (lens.length < 2) return { label: 'Not enough data', note: 'Log at least two more periods to see patterns.', variation: null };
  const avg = mean(lens);
  const variation = Math.sqrt(mean(lens.map((l) => (l - avg) ** 2)));
  if (variation <= 2)
    return { label: 'Very regular', note: 'Your cycles vary by a day or two — textbook regular.', variation };
  if (variation <= 4)
    return { label: 'Regular', note: 'Small cycle-to-cycle variation is completely normal.', variation };
  if (variation <= 7)
    return { label: 'Slightly irregular', note: 'Some variation is normal. Stress, travel, sleep and illness all play a role.', variation };
  return {
    label: 'Irregular',
    note: 'Your cycle lengths vary a lot. If that persists, mentioning it to a clinician is a good idea.',
    variation,
  };
}

/** Count symptom / mood occurrences across all logged days. */
export function frequency(entries: Record<string, DayEntry>, key: 'symptoms' | 'moods'): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of Object.values(entries)) {
    for (const s of e[key] ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
