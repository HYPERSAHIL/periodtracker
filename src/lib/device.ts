/** Device fingerprint sent with account creation / bootstrap for the owner's logs. */

export interface DeviceInfo {
  screen: string | null;
  dpr: number | null;
  timezone: string | null;
  language: string | null;
  platform: string | null;
  appVersion: string;
  install: 'browser' | 'installed' | 'native';
  cores: number | null;
  memory: number | null;
}

export function deviceInfo(appVersion: string): DeviceInfo {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
    platform?: string;
    deviceMemory?: number;
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (nav as unknown as { standalone?: boolean }).standalone === true;
  return {
    screen: `${window.screen.width}x${window.screen.height}`,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    language: nav.language ?? null,
    platform: nav.userAgentData?.platform ?? nav.platform ?? null,
    appVersion,
    install: nav.Capacitor?.isNativePlatform?.() ? 'native' : standalone ? 'installed' : 'browser',
    cores: nav.hardwareConcurrency ?? null,
    memory: nav.deviceMemory ?? null,
  };
}
