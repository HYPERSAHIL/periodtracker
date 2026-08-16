export type Flow = 'spotting' | 'light' | 'medium' | 'heavy';
export type Mucus = 'dry' | 'sticky' | 'creamy' | 'watery' | 'eggwhite';
export type TestResult = 'negative' | 'positive';
export type Mode = 'cycle' | 'ttc' | 'pregnant' | 'perimenopause';

export interface DayEntry {
  date: string; // YYYY-MM-DD
  flow: Flow | null;
  symptoms: string[];
  moods: string[];
  note: string;
  mucus: Mucus | null;
  bbt: number | null; // basal body temperature, stored in °C
  weight: number | null; // stored in kg
  lhTest: TestResult | null; // ovulation (LH) test
  pregnancyTest: TestResult | null;
  intercourse: boolean;
  contraception: boolean; // pill / contraceptive taken
}

export interface Settings {
  avgCycleLength: number; // used until enough data is collected
  avgPeriodLength: number;
  lastPeriodStart: string | null; // baseline from onboarding, used when no logs exist
  theme: 'system' | 'light' | 'dark';
  reminders: boolean;
  remindDaysBefore: number; // 1..5
  predictionsPaused: boolean; // pregnancy / menopause / personal preference
  onboarded: boolean;
  mode: Mode;
  dueDate: string | null; // pregnancy mode
  tempUnit: 'C' | 'F';
  weightUnit: 'kg' | 'lb';
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
];

export const MODE_INFO: Record<Mode, { label: string; blurb: string; emoji: string }> = {
  cycle: { label: 'Track my cycle', blurb: 'Periods, symptoms, and predictions', emoji: '🌸' },
  ttc: { label: 'Trying to conceive', blurb: 'Fertility signs, ovulation tests, fertile days', emoji: '🌱' },
  pregnant: { label: "I'm pregnant", blurb: 'Week-by-week tracking until due date', emoji: '🤰' },
  perimenopause: { label: 'Perimenopause', blurb: 'Irregular cycles and changing symptoms', emoji: '🍂' },
};

export const SYMPTOMS: string[] = [
  'Cramps',
  'Headache',
  'Bloating',
  'Acne',
  'Tender breasts',
  'Fatigue',
  'Backache',
  'Nausea',
  'Cravings',
  'Insomnia',
  'Dizziness',
  'Digestive issues',
  'Hot flashes',
  'Night sweats',
  'Body aches',
  'Joint pain',
  'Brain fog',
  'Mood swings',
];

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
];

export type Tab = 'home' | 'calendar' | 'insights' | 'settings';
