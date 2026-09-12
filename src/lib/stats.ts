import { DayEntry, PERIMENO_HIGHLIGHT, Settings } from '../types';
import { CycleStats, PeriodCluster, phaseFor } from './cycle';
import { DayFacts } from './cycle';
import { diffDays } from './date';
import { tx, txd } from './i18n';

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

/** Share of days since the first log that have any entry or explicit check in. */
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
  const lang = settings.lang;

  // Trend: consistent shortening or lengthening over the last 5+ cycles
  const w = windowStats(stats.cycleLengths, 12);
  if (w.slope !== null && Math.abs(w.slope) >= 0.8 && stats.cycleLengths.length >= 5) {
    const shorter = w.slope < 0;
    cards.push({
      id: 'trend',
      title: tx(lang, shorter ? 'Cycles have been getting shorter' : 'Cycles have been getting longer'),
      detail: tx(
        lang,
        shorter
          ? 'Across your last {n} cycles the trend is about {v} days shorter per cycle. Gradual drift is common with age; a steady change over 6+ months is worth mentioning to a clinician.'
          : 'Across your last {n} cycles the trend is about {v} days longer per cycle. Gradual drift is common with age; a steady change over 6+ months is worth mentioning to a clinician.',
        { n: w.count, v: Math.abs(w.slope).toFixed(1) }
      ),
    });
  }

  // Luteal symptom clustering: a symptom in luteal phase in ≥60% of recent checked-in cycles
  const recentStarts = stats.clusters.slice(-5);
  if (recentStarts.length >= 3) {
    const tally = new Map<string, { cycles: number; total: number }>();
    let evaluated = 0;
    for (const c of recentStarts) {
      const nextStart = stats.clusters.find((x) => diffDays(c.start, x.start) > 0);
      if (!nextStart) continue;
      evaluated++;
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
      for (const t of tally.values()) t.total = evaluated;
    }
    for (const [s, t] of tally) {
      const denom = Math.max(evaluated, 1);
      if (t.cycles / denom >= 0.6 && t.cycles >= 2) {
        const name = txd(lang, `symptom.${s}`, s);
        cards.push({
          id: `luteal-${s}`,
          title: tx(lang, '{s} clusters before your period', { s: name }),
          detail: tx(
            lang,
            '{s} appeared in the luteal phase in {c} of your last {n} tracked cycles. Recognizable PMS style patterns like this are often manageable - and easier to discuss with a clinician when you can show the data.',
            { s: name, c: t.cycles, n: denom }
          ),
        });
        break; // one card is enough signal
      }
    }
  }

  // PMDD adjacent mood clustering: luteal mood in ≥60% of recent cycles (non-diagnostic)
  if (recentStarts.length >= 3) {
    const pmddMoods = new Set(['Anxious', 'Irritable', 'Sad', 'Weepy', 'Angry', 'Numb', 'Stressed', 'Sensitive']);
    const tallyMood = new Map<string, { cycles: number; total: number }>();
    let evaluatedMood = 0;
    for (const c of recentStarts) {
      const nextStart = stats.clusters.find((x) => diffDays(c.start, x.start) > 0);
      if (!nextStart) continue;
      evaluatedMood++;
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
      for (const t of tallyMood.values()) t.total = evaluatedMood;
    }
    for (const [m, t] of tallyMood) {
      const denom = Math.max(evaluatedMood, 1);
      if (t.cycles / denom >= 0.6 && t.cycles >= 2) {
        const name = txd(lang, `mood.${m}`, m);
        cards.push({
          id: `luteal-mood-${m}`,
          title: tx(lang, '{m} often appears before your period', { m: name }),
          detail: tx(
            lang,
            '{m} was logged in the luteal phase in {c} of your last {n} tracked cycles. If luteal mood changes affect work or relationships, this dated log is exactly what clinicians use to tell PMS from PMDD - bring it to an appointment.',
            { m: name, c: t.cycles, n: denom }
          ),
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
        title: tx(lang, 'High symptom burden this month'),
        detail: tx(
          lang,
          '{b} of the last {n} logged days included perimenopause typical symptoms. This is a burden snapshot, not a stage or diagnosis - but it is exactly the kind of summary worth bringing to an appointment.',
          { b: burden, n: days30.length }
        ),
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

/** Bleeding-episode summary for the clinician report. */export function episodeSummary(clusters: PeriodCluster[], months = 6): PeriodCluster[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cut = cutoff.toISOString().slice(0, 10);
  return clusters.filter((c) => c.end >= cut);
}

export interface MigraineWindow {
  inWindow: number;
  total: number;
}

/** Marquette-style double check: monitor peak (LH+) + mucus peak in the same cycle. */
export function marquetteStatus(
  entries: Record<string, DayEntry>,
  lastStart: string | null
): 'double' | 'single' | 'none' {
  if (!lastStart) return 'none';
  let lh = false;
  let mucus = false;
  for (const e of Object.values(entries)) {
    if (e.date < lastStart) continue;
    if (e.lhTest === 'positive') lh = true;
    if (e.mucus === 'eggwhite') mucus = true;
  }
  if (lh && mucus) return 'double';
  if (lh || mucus) return 'single';
  return 'none';
}

/** Variability phenotype from recent history: stable / variable / highly variable. */
export function variabilityPhenotype(lengths: number[]): 'stable' | 'variable' | 'highly-variable' | 'unknown' {
  const lens = lengths.slice(-6);
  if (lens.length < 2) return 'unknown';
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  if (sd <= 2) return 'stable';
  if (sd <= 5) return 'variable';
  return 'highly-variable';
}

/** Share of days since first log with any entry — low coverage means low-confidence forecasts. */
export function adherenceConfidence(entries: Record<string, DayEntry>): { pct: number; low: boolean } {
  const c = trackingCompleteness(entries);
  return { pct: c.pct, low: c.total >= 30 && c.pct < 40 };
}

/** Migraine/headache days falling in the perimenstrual window (start−2 … start+3). */
export function perimenstrualMigraine(
  entries: Record<string, DayEntry>,
  clusters: PeriodCluster[]
): MigraineWindow {
  const isMigraine = (e: DayEntry) =>
    e.migraine || e.symptoms.includes('Migraine') || e.symptoms.includes('Headache');
  let inWindow = 0;
  let total = 0;
  for (const e of Object.values(entries)) {
    if (!isMigraine(e)) continue;
    total++;
    const hit = clusters.some((c) => {
      const s = new Date(c.start + 'T00:00:00').getTime();
      const t = new Date(e.date + 'T00:00:00').getTime();
      const d = Math.round((t - s) / 86400000);
      return d >= -2 && d <= 3;
    });
    if (hit) inWindow++;
  }
  return { inWindow, total };
}

export interface ThermalShift {
  /** first day of the sustained rise */
  date: string;
  /** estimated ovulation day (day before the rise) */
  ovulation: string;
  /** rise over the previous baseline, °C */
  rise: number;
}

/**
 * NFP-lite thermal shift: ≥0.2°C above the previous 6-day max, holding 3+
 * consecutive calendar days, no fever (≥37.5°C voids the run). Returns the
 * most recent shift only. Non-diagnostic clue, not proof.
 */
export function detectThermalShift(entries: Record<string, DayEntry>): ThermalShift | null {
  const pts = Object.values(entries)
    .filter((e) => e.bbt != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 9) return null;
  const shiftDay = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };
  for (let i = pts.length - 1; i >= 8; i--) {
    const window = pts.slice(i - 8, i + 1); // 6 baseline days + 3 high days
    let consecutive = true;
    for (let j = 1; j < window.length; j++) {
      if (diffDays(window[j - 1].date, window[j].date) !== 1) {
        consecutive = false;
        break;
      }
    }
    if (!consecutive) continue;
    if (window.some((e) => e.bbt! >= 37.5)) continue; // fever voids the run
    const base = Math.max(...window.slice(0, 6).map((e) => e.bbt!));
    const high = window.slice(6);
    if (high.every((e) => e.bbt! - base >= 0.2)) {
      return {
        date: high[0].date,
        ovulation: shiftDay(high[0].date, -1),
        rise: Math.round((high[0].bbt! - base) * 10) / 10,
      };
    }
  }
  return null;
}
