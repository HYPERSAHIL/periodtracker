// All dates are local-time ISO day strings (YYYY-MM-DD). No time zones involved:
// the app runs on the user's device and their "today" is the only today that matters.

// Display locale for formatted dates: app language when set (hi → Hindi),
// otherwise the device locale. Set once from settings; defaults to device.
let dateLocale: string | null = null;

export function setDateLocale(locale: string | null): void {
  dateLocale = locale;
}

function activeLocale(): string {
  if (dateLocale) return dateLocale;
  try {
    return typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  } catch {
    return 'en-US';
  }
}

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

export const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Locale weekday narrow names starting on weekStart (1 = Monday, 0 = Sunday). */
export function weekdayHeads(weekStart: 0 | 1): string[] {
  const fmt = new Intl.DateTimeFormat(activeLocale(), { weekday: 'narrow' });
  // 2026-08-02 was a Sunday; offsets give Sun..Sat in locale form
  const heads: string[] = [];
  for (let i = 0; i < 7; i++) heads.push(fmt.format(new Date(2026, 7, 2 + i)));
  return weekStart === 1 ? [...heads.slice(1), heads[0]] : heads;
}

export function monthLabel(year: number, month: number): string {
  // Intl with English fallback so an unexpected locale never blanks the header
  const loc = activeLocale();
  const name = (() => {
    try {
      return new Intl.DateTimeFormat(loc, { month: 'long' }).format(new Date(year, month, 1));
    } catch {
      return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(year, month, 1));
    }
  })();
  return `${name} ${year}`;
}

export function prettyDate(iso: string, opts?: { withYear?: boolean; weekday?: boolean }): string {
  const d = fromISO(iso);
  const parts = new Intl.DateTimeFormat(activeLocale(), {
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

/** 6x7 grid of ISO dates covering the given month. weekStart: 1 = Monday (default), 0 = Sunday. */
export function monthGrid(year: number, month: number, weekStart: 0 | 1 = 1): string[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
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
