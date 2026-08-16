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
