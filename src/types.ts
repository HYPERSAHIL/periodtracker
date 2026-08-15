export type Flow = 'spotting' | 'light' | 'medium' | 'heavy';

export interface DayEntry {
  date: string; // YYYY-MM-DD
  flow: Flow | null;
  symptoms: string[];
  moods: string[];
  note: string;
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
};

export const FLOWS: { id: Flow; label: string; dots: number }[] = [
  { id: 'spotting', label: 'Spotting', dots: 1 },
  { id: 'light', label: 'Light', dots: 2 },
  { id: 'medium', label: 'Medium', dots: 3 },
  { id: 'heavy', label: 'Heavy', dots: 4 },
];

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
  'Body aches',
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
