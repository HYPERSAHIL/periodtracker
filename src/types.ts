export type Flow = 'spotting' | 'light' | 'medium' | 'heavy';
export type Mucus = 'dry' | 'sticky' | 'creamy' | 'watery' | 'eggwhite' | 'unusual';
export type TestResult = 'negative' | 'positive' | 'faint' | 'unclear';
export type Mode = 'cycle' | 'ttc' | 'pregnant' | 'perimenopause' | 'postpartum';
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

export const ALL_METHODS: ContraceptionMethod[] = [
  'none',
  'pill',
  'patch',
  'ring',
  'injection',
  'implant',
  'iud',
  'condom',
  'other',
];

/** Coerce unknown input to a valid method or null (prior-method answers). */
export function normMethod(v: unknown): ContraceptionMethod | null {
  return typeof v === 'string' && (ALL_METHODS as string[]).includes(v) ? (v as ContraceptionMethod) : null;
}

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
  painLevel: number | null; // 0-10 cramp/pain scale
  painAreas: string[]; // body-map ids, see PAIN_AREAS
  migraine: boolean; // migraine-day tag
  migraineAura: boolean;
  migraineMed: boolean; // acute med taken
  migraineHelped: boolean; // med helped
  giIssues: boolean; // bowel/GI issues (endo set)
  bladderPain: boolean; // bladder pain/urgency (endo set)
  endoFlare: boolean; // endo flare day tag
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
  customSymptoms: string[]; // user-added symptom names (data, shown as-is)
  customMoods: string[]; // user-added mood names (data, shown as-is)
  // granular notification controls (master = reminders)
  notifyPeriod: boolean;
  notifyOvulation: boolean;
  notifyDailyCheckin: boolean;
  notifyMeds: boolean; // daily medication/contraception reminder
  medTime: string | null; // "HH:MM" for the med reminder
  quietStart: string | null; // "HH:MM" 24h, local time
  quietEnd: string | null;
  showFertileWindow: boolean;
  weekStart: 0 | 1; // 1 = Monday (default), 0 = Sunday
  lang: 'en' | 'hi';
  irregular: boolean; // PCOS/irregular cycles: wider windows, no "late" nagging
  teen: boolean; // teen mode: fertile/TTC content hidden, simpler UI
  discreetNotifs: boolean; // lock-screen-safe notification text (no details)
  postpartum: { birthDate: string | null; exclusiveBF: boolean } | null;
  pmddCheckStart: string | null; // date a 2-cycle PMDD confirmation was started
  priorMethod: ContraceptionMethod | null; // method used before tracking (tailors counseling)
  excludedStarts: string[]; // period-start dates excluded from predictions (outlier cycles)
  tryingSince: string | null; // TTC start date for infertility timeline
  ppMood: { date: string; score: number } | null; // last postpartum mood screen
  // pregnancy extras ride the normal settings blob, so backup + sync carry them
  kickLog?: KickSession[];
  activeKick?: KickSession | null;
  apptList?: ApptItem[];
}

export interface KickSession {
  startedAt: number;
  endedAt: number | null;
  kicks: number[];
}

export interface ApptItem {
  id: number;
  text: string;
  done: boolean;
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
  customSymptoms: [],
  customMoods: [],
  notifyPeriod: true,
  notifyOvulation: false,
  notifyDailyCheckin: false,
  notifyMeds: false,
  medTime: '09:00',
  quietStart: null,
  quietEnd: null,
  showFertileWindow: true,
  weekStart: 1,
  lang: 'en',
  irregular: false,
  teen: false,
  discreetNotifs: false,
  postpartum: null,
  pmddCheckStart: null,
  priorMethod: null,
  excludedStarts: [],
  tryingSince: null,
  ppMood: null,
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

/** Body-map areas for the 0-10 pain scale. Ids are stable; labels translate at render. */
export const PAIN_AREAS: { id: string; emoji: string }[] = [
  { id: 'head', emoji: '🤕' },
  { id: 'jaw', emoji: '🦷' },
  { id: 'neck', emoji: '🧣' },
  { id: 'shoulders', emoji: '🤷' },
  { id: 'back', emoji: '🎒' },
  { id: 'lowerback', emoji: '🪑' },
  { id: 'abdomen', emoji: '🤰' },
  { id: 'pelvis', emoji: '🩸' },
  { id: 'breasts', emoji: '👚' },
  { id: 'joints', emoji: '🦵' },
  { id: 'legs', emoji: '🦶' },
  { id: 'fullbody', emoji: '🧍' },
];

export const MOODS: { id: string; emoji: string }[] = [  { id: 'Happy', emoji: '😊' },
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
  pregnant: { label: "I'm pregnant", blurb: 'Week by week tracking until due date', emoji: '🤰' },
  perimenopause: { label: 'Perimenopause', blurb: 'Irregular cycles and changing symptoms', emoji: '🍂' },
  postpartum: { label: 'Postpartum', blurb: 'Recovery, feeding, first period watch', emoji: '🍼' },
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

export const APP_VERSION = '3.0.1';

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
  { id: 'pain', label: 'Pain', description: '0-10 scale and body map' },
  { id: 'headache', label: 'Headache', description: 'Migraine days, aura, meds' },
  { id: 'endo', label: 'Endo & pelvic', description: 'Flares, bowel, bladder' },
  { id: 'note', label: 'Notes', description: 'Freeform journal' },
];
