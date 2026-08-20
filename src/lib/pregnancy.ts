import { addDays, diffDays, todayISO } from './date';

export interface PregnancyInfo {
  weeks: number; // completed weeks
  days: number; // extra days into the current week
  trimester: 1 | 2 | 3;
  dueDate: string;
  daysToDue: number; // negative once past the due date
  progress: number; // 0..1 through 40 weeks
  gestAgeDays: number;
}

/** Gestational age counting from an estimated due date (40 weeks / 280 days). */
export function pregnancyInfo(dueDate: string): PregnancyInfo {
  const today = todayISO();
  const daysToDue = diffDays(today, dueDate);
  const gestAgeDays = Math.min(300, Math.max(0, 280 - daysToDue));
  const weeks = Math.floor(gestAgeDays / 7);
  const trimester: 1 | 2 | 3 = weeks <= 13 ? 1 : weeks <= 27 ? 2 : 3;
  return {
    weeks,
    days: gestAgeDays % 7,
    trimester,
    dueDate,
    daysToDue,
    progress: Math.min(1, gestAgeDays / 280),
    gestAgeDays,
  };
}

/** Due date from the first day of the last menstrual period (Naegele's rule). */
export function dueFromLmp(lmp: string): string {
  return addDays(lmp, 280);
}

const SIZES: [week: number, size: string][] = [
  [4, 'a poppy seed'],
  [5, 'an apple seed'],
  [6, 'a lentil'],
  [7, 'a blueberry'],
  [8, 'a raspberry'],
  [9, 'a green olive'],
  [10, 'a prune'],
  [11, 'a fig'],
  [12, 'a lime'],
  [13, 'a peapod'],
  [14, 'a lemon'],
  [16, 'an avocado'],
  [18, 'a bell pepper'],
  [20, 'a banana'],
  [22, 'a papaya slice'],
  [24, 'an ear of corn'],
  [26, 'a zucchini'],
  [28, 'an eggplant'],
  [30, 'a large cabbage'],
  [32, 'a pineapple'],
  [34, 'a cantaloupe'],
  [36, 'a romaine lettuce head'],
  [38, 'a leek'],
  [40, 'a small pumpkin'],
];

export function babySize(week: number): string {
  let size = SIZES[0][1];
  for (const [w, s] of SIZES) {
    if (week >= w) size = s;
    else break;
  }
  return size;
}

export const TRIMESTER_INFO: Record<1 | 2 | 3, string> = {
  1: 'First trimester - foundations: organs form, and fatigue or nausea are common.',
  2: 'Second trimester - many people feel their best now; first movements often happen weeks 18-22.',
  3: 'Third trimester - rapid growth; watch for regular contractions and check in with your clinician.',
};
