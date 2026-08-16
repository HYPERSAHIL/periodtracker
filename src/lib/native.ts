/**
 * Native (Capacitor) environment helpers.
 * The web app uses same-origin relative API paths; the APK/webview loads from a
 * local origin, so API calls must target the production origin absolutely.
 */

export const API_ORIGIN = 'https://periodtracker.run';

export function isNative(): boolean {
  const nav = navigator as Navigator & { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!nav.Capacitor?.isNativePlatform?.();
}

/** Absolute API base for fetch calls — same-origin on the web, full URL in the APK. */
export function apiUrl(path: string): string {
  if (isNative()) return `${API_ORIGIN}${path}`;
  if (location.origin === API_ORIGIN) return path;
  return `${API_ORIGIN}${path}`;
}
