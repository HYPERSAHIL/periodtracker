export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-label="Period Tracker logo">
      <defs>
        <linearGradient id="pt-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset="1" stopColor="#be123c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#pt-lg)" />
      <path
        d="M32 11c4.8 8.4 15 14.6 15 24a15 15 0 0 1-30 0c0-9.4 10.2-15.6 15-24z"
        fill="#fff"
      />
      <circle cx="26.5" cy="37" r="3.4" fill="#fda4af" opacity="0.55" />
    </svg>
  );
}

type P = { className?: string };
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconHome = (_p: P) => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9.5v-5.5a2.5 2.5 0 0 1 5 0V21h3a1 1 0 0 0 1-1V9.5" />
  </svg>
);

export const IconCalendar = (_p: P) => (
  <svg viewBox="0 0 24 24" {...base}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);

export const IconChart = (_p: P) => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 20v-6M12.5 20V9M17 20v-9.5" />
  </svg>
);

export const IconBook = (_p: P) => (
  <svg viewBox="0 0 24 24" {...base}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path d="M4 20.5V5.5M20 18v3H6.5" />
  </svg>
);

export const IconGear = (_p: P) => (
  <svg viewBox="0 0 24 24" {...base}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19 12a7 7 0 0 0-.14-1.4l2-1.55-2-3.46-2.37.95A7 7 0 0 0 14 5.1L13.7 2.6h-3.4L10 5.1a7 7 0 0 0-2.49 1.44l-2.37-.95-2 3.46 2 1.55a7.06 7.06 0 0 0 0 2.8l-2 1.55 2 3.46 2.37-.95A7 7 0 0 0 10 18.9l.3 2.5h3.4l.3-2.5a7 7 0 0 0 2.49-1.44l2.37.95 2-3.46-2-1.55A7 7 0 0 0 19 12z" />
  </svg>
);
