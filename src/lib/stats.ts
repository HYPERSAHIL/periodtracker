import { DayEntry, PERIMENO_HIGHLIGHT, Settings } from '../types';
import { CycleStats, PeriodCluster, phaseFor } from './cycle';
import { DayFacts } from './cycle';
import { diffDays } from './date';

export interface WindowStats {
  count: number;
  median: number | null;
  mean: number | null;
  shortest: number | null;
  longest: number | null;
  range: number | null;
  /** days per cycle of linear trend across the window (negative = shortening) */
  slope: number | null;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function slope(nums: number[]): number | null {
  if (nums.length < 3) return null;
  const n = nums.length;
  const xs = nums.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = nums.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (nums[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function windowStats(lengths: number[], windowSize: 6 | 12): WindowStats {
  const lens = lengths.slice(-windowSize);
  if (!lens.length) {
    return { count: 0, median: null, mean: null, shortest: null, longest: null, range: null, slope: null };
  }
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  return {
    count: lens.length,
    median: Math.round(median(lens) * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    shortest: Math.min(...lens),
    longest: Math.max(...lens),
    range: Math.max(...lens) - Math.min(...lens),
    slope: slope(lens),
  };
}

/** Share of days since the first log that have any entry or explicit check-in. */
export function trackingCompleteness(entries: Record<string, DayEntry>): { pct: number; logged: number; total: number } {
  const dates = Object.keys(entries).sort();
  if (dates.length === 0) return { pct: 0, logged: 0, total: 0 };
  const total = diffDays(dates[0], dates[dates.length - 1]) + 1;
  const logged = dates.length;
  return { pct: Math.round((logged / total) * 100), logged, total };
}

export interface PhaseBreakdown {
  phase: string;
  days: number;
  topSymptoms: { name: string; count: number }[];
}

/** Symptom counts grouped by cycle phase (only counted on checked-in days). */
export function symptomsByPhase(
  entries: Record<string, DayEntry>,
  stats: CycleStats,
  facts: Map<string, DayFacts>
): PhaseBreakdown[] {
  const phases = ['menstrual', 'follicular', 'ovulation', 'luteal'] as const;
  const labels: Record<string, string> = {
    menstrual: 'Menstrual',
    follicular: 'Follicular',
    ovulation: 'Ovulation',
    luteal: 'Luteal',
  };
  return phases.map((ph) => {
    const counts = new Map<string, number>();
    let days = 0;
    for (const e of Object.values(entries)) {
      if (!e.checkedIn) continue;
      if (phaseFor(e.date, stats, facts) !== ph) continue;
      days++;
      for (const s of e.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return {
      phase: labels[ph],
      days,
      topSymptoms: [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    };
  });
}

export interface PatternCard {
  id: string;
  title: string;
  detail: string;
}

/**
 * Deterministic pattern cards - only surfaced when an explicit threshold is
 * met, always worded as an observation, never a diagnosis.
 */
export function patternCards(
  entries: Record<string, DayEntry>,
  stats: CycleStats,
  facts: Map<string, DayFacts>,
  settings: Settings
): PatternCard[] {
  const cards: PatternCard[] = [];

  // Trend: consistent shortening or lengthening over the last 5+ cycles
  const w = windowStats(stats.cycleLengths, 12);
  if (w.slope !== null && Math.abs(w.slope) >= 0.8 && stats.cycleLengths.length >= 5) {
    const dir = w.slope < 0 ? 'getting shorter' : 'getting longer';
    cards.push({
      id: 'trend',
      title: `Cycles have been ${dir}`,
      detail: `Across your last ${w.count} cycles the trend is about ${Math.abs(w.slope).toFixed(1)} days ${w.slope < 0 ? 'shorter' : 'longer'} per cycle. Gradual drift is common with age; a steady change over 6+ months is worth mentioning to a clinician.`,
    });
  }

  // Luteal symptom clustering: a symptom in luteal phase in ≥60% of recent checked-in cycles
  const recentStarts = stats.clusters.slice(-5);
  if (recentStarts.length >= 3) {
    const tally = new Map<string, { cycles: number; total: number }>();
    for (const c of recentStarts) {
      const nextStart = stats.clusters.find((x) => diffDays(c.start, x.start) > 0);
      if (!nextStart) continue;
      const lutealDays = Object.values(entries).filter((e) => {
        if (!e.checkedIn) return false;
        const inWindow = e.date > addDaysLocal(c.end, 3) && e.date < nextStart.start;
        return inWindow && phaseFor(e.date, stats, facts) === 'luteal';
      });
      const seen = new Set<string>();
      for (const e of lutealDays) for (const s of e.symptoms) seen.add(s);
      for (const s of seen) {
        const t = tally.get(s) ?? { cycles: 0, total: 0 };
        t.cycles++;
        tally.set(s, t);
      }
      for (const t of tally.values()) t.total++;
    }
    for (const [s, t] of tally) {
      const denom = Math.max(t.total, 1);
      if (t.cycles / denom >= 0.6 && t.cycles >= 2) {
        cards.push({
          id: `luteal-${s}`,
          title: `${s} clusters before your period`,
          detail: `${s} appeared in the luteal phase in ${t.cycles} of your last ${denom} tracked cycles. Recognizable PMS-style patterns like this are often manageable - and easier to discuss with a clinician when you can show the data.`,
        });
        break; // one card is enough signal
      }
    }
  }

  // PMDD-adjacent mood clustering: luteal mood in ≥60% of recent cycles (non-diagnostic)
  if (recentStarts.length >= 3) {
    const pmddMoods = new Set(['Anxious', 'Irritable', 'Sad', 'Weepy', 'Angry', 'Numb', 'Stressed', 'Sensitive']);
    const tallyMood = new Map<string, { cycles: number; total: number }>();
    for (const c of recentStarts) {
      const nextStart = stats.clusters.find((x) => diffDays(c.start, x.start) > 0);
      if (!nextStart) continue;
      const lutealMoody = Object.values(entries).filter((e) => {
        if (!e.checkedIn) return false;
        const inWindow = e.date > addDaysLocal(c.end, 3) && e.date < nextStart.start;
        return inWindow && phaseFor(e.date, stats, facts) === 'luteal' && e.moods.some((m) => pmddMoods.has(m));
      });
      const seenM = new Set<string>();
      for (const e of lutealMoody) for (const m of e.moods) if (pmddMoods.has(m)) seenM.add(m);
      for (const m of seenM) {
        const t = tallyMood.get(m) ?? { cycles: 0, total: 0 };
        t.cycles++;
        tallyMood.set(m, t);
      }
      for (const t of tallyMood.values()) t.total++;
    }
    for (const [m, t] of tallyMood) {
      const denom = Math.max(t.total, 1);
      if (t.cycles / denom >= 0.6 && t.cycles >= 2) {
        cards.push({
          id: `luteal-mood-${m}`,
          title: `${m} often appears before your period`,
          detail: `${m} was logged in the luteal phase in ${t.cycles} of your last ${denom} tracked cycles. If luteal mood changes affect work or relationships, this dated log is exactly what clinicians use to tell PMS from PMDD - bring it to an appointment. Learn more in Learn → PMS vs PMDD.`,
        });
        break;
      }
    }
  }

  // Perimenopause burden (mode-aware)
  if (settings.mode === 'perimenopause') {
  const days30 = Object.values(entries).filter((e) => {
    const today = new Date().toISOString().slice(0, 10);
    const delta = diffDays(e.date, today);
    return delta <= 30 && delta >= 0;
  });
    const burden = days30.filter((e) => e.symptoms.some((s) => PERIMENO_HIGHLIGHT.has(s))).length;
    if (days30.length >= 10 && burden / days30.length >= 0.4) {
      cards.push({
        id: 'peri-burden',
        title: 'High symptom burden this month',
        detail: `${burden} of the last ${days30.length} logged days included perimenopause-typical symptoms. This is a burden snapshot, not a stage or diagnosis - but it is exactly the kind of summary worth bringing to an appointment.`,
      });
    }
  }

  return cards.slice(0, 3);
}

function addDaysLocal(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Bleeding-episode summary for the clinician report. */
export function episodeSummary(clusters: PeriodCluster[], months = 6): PeriodCluster[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cut = cutoff.toISOString().slice(0, 10);
  return clusters.filter((c) => c.end >= cut);
}
