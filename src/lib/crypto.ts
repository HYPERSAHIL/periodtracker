/** WebCrypto helpers: PIN hashing and passphrase-encrypted backups. */

const enc = new TextEncoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSaltB64(): string {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return b64(s);
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Salted SHA-256 for the app PIN. A gate, not encryption — see Settings copy. */
export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(saltB64 + ':' + pin));
  return b64(digest);
}

export interface EncryptedBackup {
  app: 'period-tracker';
  format: 'encrypted';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
}

export async function encryptBackup(plainJson: string, passphrase: string): Promise<EncryptedBackup> {
  const iterations = 150000;
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(plainJson)
  );
  return {
    app: 'period-tracker',
    format: 'encrypted',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(ct),
    createdAt: new Date().toISOString(),
  };
}

/** Returns the decrypted JSON string, or null on wrong passphrase / corrupt file. */
export async function decryptBackup(file: unknown, passphrase: string): Promise<string | null> {
  try {
    const d = file as EncryptedBackup;
    if (!d || d.app !== 'period-tracker' || d.format !== 'encrypted' || !d.ciphertext) return null;
    const key = await deriveKey(passphrase, unb64(d.salt), d.iterations);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(d.iv) as unknown as BufferSource },
      key,
      unb64(d.ciphertext) as unknown as BufferSource
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null; // auth failure or malformed input — both mean "can't read it"
  }
}
