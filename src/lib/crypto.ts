/** PIN hashing for the app lock. A gate for prying eyes, not encryption. */

const enc = new TextEncoder();

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function randomSaltB64(): string {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return b64(s);
}

/** Salted SHA-256 for the app PIN. */
export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(saltB64 + ':' + pin));
  return b64(digest);
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'qwerty', 'qwerty123', '123456', '12345678',
  'letmein', 'welcome', 'admin', 'iloveyou', 'monkey', 'dragon', 'sunshine',
  'princess', 'football', 'baseball',
]);

const COMMON_PINS = new Set(['6969', '1212', '1122', '1313', '1004', '2580', '2000', '0807']);

function repeated(v: string): boolean {
  return v.length > 1 && [...v].every((c) => c === v[0]);
}

function sequential(v: string): boolean {
  if (v.length < 3) return false;
  let up = true;
  let down = true;
  for (let i = 1; i < v.length; i++) {
    const d = v.charCodeAt(i) - v.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

/** Reason a cloud password is weak, or null if it passes. */
export function weakPasswordReason(pw: string): string | null {
  if (pw.length < 8) return 'short';
  const l = pw.toLowerCase();
  if (COMMON_PASSWORDS.has(l)) return 'common';
  if (repeated(pw)) return 'repeated';
  if (sequential(pw)) return 'sequential';
  return null;
}

/** Reason an app-lock PIN is weak, or null if it passes. */
export function weakPinReason(pin: string): string | null {
  if (pin.length < 4) return 'short';
  if (COMMON_PINS.has(pin)) return 'common';
  if (repeated(pin)) return 'repeated';
  if (sequential(pin)) return 'sequential';
  if (/^(19|20)\d{2}$/.test(pin)) return 'year';
  if (/^(\d)\1(\d)\2$/.test(pin)) return 'pairs';
  return null;
}
