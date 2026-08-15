import { DayEntry, Settings } from '../types';
import { addDays, clamp, diffDays, todayISO } from './date';

export interface PeriodCluster {
  start: string;
  end: string;
  length: number;
}

export type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'unknown';

export interface CycleStats {
  clusters: PeriodCluster[]; // chronological
  cycleLengths: number[]; // chronological, between consecutive period starts
  avgCycle: number;
  avgPeriod: number;
  usingDefaults: boolean; // true until two or more period starts have been logged
  lastStart: string | null;
  nextStart: string | null; // null while predictions are paused
  daysUntilNext: number | null;
  ovulationDate: string | null; // predicted, current cycle
  fertileStart: string | null;
  fertileEnd: string | null;
  cycleDay: number | null; // 1-based day of current cycle
  predictionsPaused: boolean;
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

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeStats(
  entries: Record<string, DayEntry>,
  settings: Settings
): CycleStats {
  const clusters = periodClusters(entries);
  const starts = clusters.map((c) => c.start);
  const cycleLengths: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = diffDays(starts[i - 1], starts[i]);
    if (len >= 15 && len <= 90) cycleLengths.push(len); // ignore logging gaps/artifacts
  }
  const recentLengths = cycleLengths.slice(-6);
  const recentPeriods = clusters.slice(-6).map((c) => c.length);

  const usingDefaults = starts.length < 2;
  const avgCycle = usingDefaults
    ? clamp(settings.avgCycleLength, 15, 90)
    : clamp(Math.round(mean(recentLengths)), 15, 90);
  const avgPeriod = usingDefaults
    ? clamp(settings.avgPeriodLength, 1, 14)
    : clamp(Math.round(mean(recentPeriods)), 1, 14);

  const today = todayISO();
  const lastStart = starts.length ? starts[starts.length - 1] : settings.lastPeriodStart;
  const paused = settings.predictionsPaused;
  const nextStart = lastStart && !paused ? addDays(lastStart, avgCycle) : null;


  // If the predicted start is already in the past (late period), roll predictions
  // forward from the missed prediction so the calendar keeps showing a future window.
  let effectiveNext = nextStart;
  if (effectiveNext) {
    while (diffDays(today, effectiveNext) < 0) effectiveNext = addDays(effectiveNext, avgCycle);
  }

  const daysUntilNext = effectiveNext ? diffDays(today, effectiveNext) : null;
  const ovulationDate = effectiveNext ? addDays(effectiveNext, -14) : null;
  const fertileStart = ovulationDate ? addDays(ovulationDate, -5) : null;
  const fertileEnd = ovulationDate ? addDays(ovulationDate, 1) : null;
  const cycleDay = lastStart ? diffDays(lastStart, today) + 1 : null;

  return {
    clusters,
    cycleLengths,
    avgCycle,
    avgPeriod,
    usingDefaults,
    lastStart,
    nextStart: effectiveNext,
    daysUntilNext,
    ovulationDate,
    fertileStart,
    fertileEnd,
    cycleDay: cycleDay && cycleDay > 0 ? cycleDay : null,
    predictionsPaused: paused,
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
 * ~10 months past today (6 future prediction cycles).
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

  if (!stats.predictionsPaused && stats.lastStart && stats.avgCycle) {
    const today = todayISO();
    const end = addDays(today, Math.round(horizonMonths * 30.5));

    // Future period predictions (start from the last *logged* prediction anchor)
    let anchor = stats.nextStart ?? addDays(stats.lastStart, stats.avgCycle);
    let guard = 0;
    while (diffDays(today, anchor) < -stats.avgCycle && guard++ < 24) {
      anchor = addDays(anchor, stats.avgCycle);
    }
    for (let c = 0; c < 6; c++) {
      for (let i = 0; i < stats.avgPeriod; i++) touch(addDays(anchor, i)).predicted = true;
      const ovu = addDays(anchor, -14);
      for (let i = -5; i <= 1; i++) touch(addDays(ovu, i)).fertile = true;
      touch(ovu).ovulation = true;
      anchor = addDays(anchor, stats.avgCycle);
      if (diffDays(today, anchor) > diffDays(today, end)) break;
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
