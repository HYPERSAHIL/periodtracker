export type Flow = 'spotting' | 'light' | 'medium' | 'heavy';
export type Mucus = 'dry' | 'sticky' | 'creamy' | 'watery' | 'eggwhite' | 'unusual';
export type TestResult = 'negative' | 'positive' | 'faint' | 'unclear';
export type Mode = 'cycle' | 'ttc' | 'pregnant' | 'perimenopause';
export type Severity = 'mild' | 'moderate' | 'severe';
export type ContraceptionMethod =
  | 'none'
  | 'pill'
  | 'patch'
  | 'ring'
  | 'injection'
  | 'implant'
  | 'iud'
  | 'condom'
  | 'other';

export const HORMONAL_METHODS: ContraceptionMethod[] = ['pill', 'patch', 'ring', 'injection', 'implant', 'iud'];

export interface DayEntry {
  date: string; // YYYY-MM-DD
  /** epoch-ms of the last local edit - used for last-write-wins cloud sync */
  updatedAt?: number;
  /** Explicit "I checked in today" marker - distinguishes no-symptom days from forgotten days. */
  checkedIn: boolean;
  flow: Flow | null;
  clots: boolean;
  symptoms: string[];
  moods: string[];
  note: string;
  mucus: Mucus | null;
  bbt: number | null; // basal body temperature, stored in °C
  weight: number | null; // stored in kg
  lhTest: TestResult | null; // ovulation (LH) test
  pregnancyTest: TestResult | null;
  intercourse: 'protected' | 'unprotected' | null;
  drive: 'low' | 'normal' | 'high' | null;
  sleepHours: number | null;
  sleepQuality: 'poor' | 'fair' | 'good' | null;
  water: number | null; // glasses
  steps: number | null;
  exerciseMinutes: number | null;
  alcohol: number | null; // drinks
  caffeine: number | null; // cups
  smoked: boolean;
  supplements: boolean; // prenatal vitamin / supplements taken
  pillTaken: boolean;
  pillMissed: boolean;
  symptomSeverity: Severity | null; // overall severity for the day
  routineImpact: 'none' | 'some' | 'lot' | null; // impact on daily routine
}

export interface ContraceptionRegimen {
  method: ContraceptionMethod;
  startDate: string | null;
  /** patch / ring change interval */
  changeEveryDays: number | null;
  /** injection / implant / IUD next date */
  nextRenewal: string | null;
}

export interface Settings {
  /** epoch-ms of the last local edit - used for last-write-wins cloud sync */
  updatedAt?: number;
  avgCycleLength: number;
  avgPeriodLength: number;
  lastPeriodStart: string | null;
  theme: 'system' | 'light' | 'dark';
  reminders: boolean;
  remindDaysBefore: number;
  predictionsPaused: boolean;
  onboarded: boolean;
  mode: Mode;
  dueDate: string | null;
  tempUnit: 'C' | 'F';
  weightUnit: 'kg' | 'lb';
  contraception: ContraceptionRegimen;
  trackerOrder: string[]; // section ids in display order
  trackerHidden: string[];
  pinHash: string | null; // salted SHA-256, gate only (not encryption)
  pinSalt: string | null;
  bookmarks: string[]; // content slugs
  // granular notification controls (master = reminders)
  notifyPeriod: boolean;
  notifyOvulation: boolean;
  notifyDailyCheckin: boolean;
  quietStart: string | null; // "HH:MM" 24h, local time
  quietEnd: string | null;
  showFertileWindow: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  avgCycleLength: 28,
  avgPeriodLength: 5,
  lastPeriodStart: null,
  theme: 'system',
  reminders: false,
  remindDaysBefore: 2,
  predictionsPaused: false,
  onboarded: false,
  mode: 'cycle',
  dueDate: null,
  tempUnit: 'C',
  weightUnit: 'kg',
  contraception: { method: 'none', startDate: null, changeEveryDays: null, nextRenewal: null },
  trackerOrder: [],
  trackerHidden: [],
  pinHash: null,
  pinSalt: null,
  bookmarks: [],
  notifyPeriod: true,
  notifyOvulation: false,
  notifyDailyCheckin: false,
  quietStart: null,
  quietEnd: null,
  showFertileWindow: true,
};

export const FLOWS: { id: Flow; label: string; dots: number }[] = [
  { id: 'spotting', label: 'Spotting', dots: 1 },
  { id: 'light', label: 'Light', dots: 2 },
  { id: 'medium', label: 'Medium', dots: 3 },
  { id: 'heavy', label: 'Heavy', dots: 4 },
];

export const MUCUS_OPTIONS: { id: Mucus; label: string }[] = [
  { id: 'dry', label: 'Dry' },
  { id: 'sticky', label: 'Sticky' },
  { id: 'creamy', label: 'Creamy' },
  { id: 'watery', label: 'Watery' },
  { id: 'eggwhite', label: 'Egg white' },
  { id: 'unusual', label: 'Unusual color/smell' },
];

export const SYMPTOMS: string[] = [
  'Cramps',
  'Headache',
  'Migraine',
  'Bloating',
  'Acne',
  'Tender breasts',
  'Fatigue',
  'Backache',
  'Nausea',
  'Cravings',
  'Insomnia',
  'Dizziness',
  'Fainting',
  'Digestive issues',
  'Diarrhea',
  'Constipation',
  'Hot flashes',
  'Night sweats',
  'Body aches',
  'Joint pain',
  'Brain fog',
  'Mood swings',
  'Breathlessness',
  'Palpitations',
  'Severe pelvic pain',
  'Pelvic pain',
  'Pain with intercourse',
  'Urinary discomfort',
  'Vision changes',
  'Hair loss',
  'Cold hands/feet',
  'Swelling/edema',
];

export const PERIMENO_HIGHLIGHT = new Set([
  'Hot flashes',
  'Night sweats',
  'Brain fog',
  'Mood swings',
  'Joint pain',
  'Insomnia',
]);

export const MOODS: { id: string; emoji: string }[] = [
  { id: 'Happy', emoji: '😊' },
  { id: 'Calm', emoji: '😌' },
  { id: 'Energized', emoji: '⚡' },
  { id: 'Confident', emoji: '😎' },
  { id: 'Sad', emoji: '😢' },
  { id: 'Anxious', emoji: '😰' },
  { id: 'Irritable', emoji: '😤' },
  { id: 'Stressed', emoji: '😣' },
  { id: 'Sensitive', emoji: '🥺' },
  { id: 'Tired', emoji: '🥱' },
  { id: 'Weepy', emoji: '😢' },
  { id: 'Angry', emoji: '😡' },
  { id: 'Numb', emoji: '😶' },
  { id: 'Foggy', emoji: '🌀' },
];

export const MODE_INFO: Record<Mode, { label: string; blurb: string; emoji: string }> = {
  cycle: { label: 'Track my cycle', blurb: 'Periods, symptoms, and predictions', emoji: '🌸' },
  ttc: { label: 'Trying to conceive', blurb: 'Fertility signs, ovulation tests, fertile days', emoji: '🌱' },
  pregnant: { label: "I'm pregnant", blurb: 'Week-by-week tracking until due date', emoji: '🤰' },
  perimenopause: { label: 'Perimenopause', blurb: 'Irregular cycles and changing symptoms', emoji: '🍂' },
};

export const METHOD_INFO: Record<ContraceptionMethod, { label: string; hormonal: boolean }> = {
  none: { label: 'None', hormonal: false },
  pill: { label: 'Pill', hormonal: true },
  patch: { label: 'Patch', hormonal: true },
  ring: { label: 'Ring', hormonal: true },
  injection: { label: 'Injection', hormonal: true },
  implant: { label: 'Implant', hormonal: true },
  iud: { label: 'Hormonal IUD', hormonal: true },
  condom: { label: 'Condom / barrier', hormonal: false },
  other: { label: 'Other', hormonal: false },
};

export type Tab = 'home' | 'calendar' | 'insights' | 'learn' | 'settings';

export const APP_VERSION = '2.7.3';

/** Logging sheet sections - ids are stable and persisted in trackerOrder/trackerHidden. */
export interface TrackerSectionDef {
  id: string;
  label: string;
  description: string;
}

export const TRACKER_SECTIONS: TrackerSectionDef[] = [
  { id: 'flow', label: 'Flow', description: 'Bleeding intensity and clots' },
  { id: 'checkin', label: 'Check-in', description: 'Mark today as reviewed' },
  { id: 'symptoms', label: 'Symptoms', description: `${SYMPTOMS.length} symptoms with severity` },
  { id: 'mood', label: 'Mood', description: `${MOODS.length} moods` },
  { id: 'discharge', label: 'Discharge', description: 'Cervical mucus quality' },
  { id: 'measurements', label: 'Measurements', description: 'Temperature, weight' },
  { id: 'tests', label: 'Tests', description: 'Ovulation (LH) and pregnancy tests' },
  { id: 'intimacy', label: 'Intimacy', description: 'Intercourse and drive' },
  { id: 'sleep', label: 'Sleep', description: 'Hours and quality' },
  { id: 'activity', label: 'Activity', description: 'Exercise, steps, water' },
  { id: 'lifestyle', label: 'Lifestyle', description: 'Alcohol, caffeine, smoking' },
  { id: 'meds', label: 'Medication', description: 'Contraception, supplements' },
  { id: 'note', label: 'Notes', description: 'Freeform journal' },
];
