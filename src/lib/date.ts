// All dates are local-time ISO day strings (YYYY-MM-DD). No time zones involved:
// the app runs on the user's device and their "today" is the only today that matters.

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(from: string, to: string): number {
  const a = fromISO(from).getTime();
  const b = fromISO(to).getTime();
  return Math.round((b - a) / 86400000);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

export function prettyDate(iso: string, opts?: { withYear?: boolean; weekday?: boolean }): string {
  const d = fromISO(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(opts?.withYear ? { year: 'numeric' } : {}),
    ...(opts?.weekday ? { weekday: 'short' } : {}),
  }).format(d);
  return parts;
}

export function isSameMonth(iso: string, year: number, month: number): boolean {
  const d = fromISO(iso);
  return d.getFullYear() === year && d.getMonth() === month;
}

/** 6x7 grid of ISO dates covering the given month (weeks start on Monday). */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  // Monday=0 .. Sunday=6
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(toISO(d));
  }
  return cells;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
