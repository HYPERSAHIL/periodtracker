export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
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
  'aria-hidden': true,
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

// --- inline replacements for decorative emoji ---------------------------
// Same 24px stroke language as the nav icons so nothing reads as clip-art.

export const IconReport = ({ size = 16 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M7 9V4h10v5" />
    <path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v7H7z" />
  </svg>
);

export const IconLock = ({ size = 16 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <rect x="4" y="10" width="16" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <path d="M12 15v2" />
  </svg>
);

export const IconSparkle = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  </svg>
);

export const IconBaby = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9 11.5h.01M15 11.5h.01" strokeWidth={2.4} />
    <path d="M9.5 15.5a4 4 0 0 0 5 0" />
  </svg>
);

export const IconSprout = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 20v-7" />
    <path d="M12 13c0-3.3-2.2-6-5.5-6 0 3.3 2.2 6 5.5 6z" />
    <path d="M12 13c0-3.9 2.7-7 6.5-7 0 3.9-2.7 7-6.5 7z" />
  </svg>
);

export const IconLeaf = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M5 19c0-8 5-13 14-13 0 9-5 13-11 13H5z" />
    <path d="M5 19c3-4 6-6 10-7" />
  </svg>
);

export const IconBag = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M5 8h14l-1 12H6L5 8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
);

export const IconChartBig = ({ size = 44 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24" strokeWidth={1.4}>
    <rect x="3" y="13" width="4.2" height="8" rx="1.4" />
    <rect x="9.9" y="8" width="4.2" height="13" rx="1.4" />
    <rect x="16.8" y="3.5" width="4.2" height="17.5" rx="1.4" />
  </svg>
);

export const IconAlert = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 4.5l8.5 15h-17l8.5-15z" />
    <path d="M12 10v4" />
    <path d="M12 17h.01" strokeWidth={2.4} />
  </svg>
);

export const IconClock = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconMoon = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
  </svg>
);

export const IconDove = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M3 14c3-6 7-9 12-8l4-2-1 4c1 5-2 9-7 10H6l1-3-4-1z" />
  </svg>
);

export const IconPill = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-40 12 12)" />
    <path d="M9.5 9.5l5 5" />
  </svg>
);

export const IconDroplet = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 3.5s6 6.6 6 10.4a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5z" />
  </svg>
);

export const IconHeart = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" />
  </svg>
);

export const IconShield = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 3.5l7 2.5v6c0 4.2-2.9 7.4-7 8.5-4.1-1.1-7-4.3-7-8.5V6l7-2.5z" />
  </svg>
);

export const IconSmoke = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <rect x="3" y="14" width="14" height="6" rx="1.5" />
    <path d="M17 15h2.5a2 2 0 0 0 0-5H17" />
    <path d="M8 11c0-1.5 1.5-1.8 1.5-3.3" />
  </svg>
);

export const IconMic = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3" />
  </svg>
);

export const IconBandage = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-40 12 12)" />
    <path d="M10.5 10.5l3 3" />
  </svg>
);

export const IconMilk = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M8 3h8l1 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7l1-4z" />
    <path d="M7 11h10" />
  </svg>
);

export const IconInfo = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" strokeWidth={2.4} />
  </svg>
);

export const IconDna = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <path d="M7 3c0 5 10 6 10 11M17 3c0 5-10 6-10 11" />
    <path d="M8 7h8M7 11h10M8 15h8M9 19h6" />
  </svg>
);

export const IconStop = ({ size = 15 }: { size?: number }) => (
  <svg {...base} width={size} height={size} viewBox="0 0 24 24">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" />
  </svg>
);

/** Renders a MODE_INFO icon by name so the mode pickers stay data-driven. */
export const ModeGlyph = ({ name, size = 20 }: { name: string; size?: number }) => {
  const M = {
    IconSparkle,
    IconSprout,
    IconBaby,
    IconLeaf,
    IconMilk,
  } as Record<string, (p: { size?: number }) => JSX.Element>;
  const C = M[name] || IconSparkle;
  return <C size={size} />;
};
