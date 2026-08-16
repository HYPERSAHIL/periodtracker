/**
 * Period Tracker sync API — Cloudflare Pages Function (advanced mode).
 * Same-origin at /api/*; everything else falls through to static assets.
 *
 * Auth model:
 *  - anonymous accounts keyed by a server-generated sync code (restorable)
 *  - optional email accounts (name + age collected; location never asked —
 *    country comes from Cloudflare's IP geolocation header, device from UA)
 *  - passwords are hashed client-side (PBKDF2, 200k iters) before transport;
 *    the server re-hashes the derived value with its own salt (10k iters, fits
 *    the Workers free-tier CPU budget)
 * Data model: one blob per user {settings, entries} with a revision counter;
 * writes use optimistic concurrency (baseRev mismatch → 409 + current state),
 * and per-field last-write-wins merging happens on the client.
 */

const ITER_SERVER = 10000;
const SESSION_DAYS = 90;
const MAX_BODY = 6_000_000;
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars

const J = { 'content-type': 'application/json; charset=utf-8' };
const te = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      const payload = e && e.payload ? e.payload : { error: 'server_error' };
      return new Response(JSON.stringify(payload), { status, headers: J });
    }
  },
};

class HttpError extends Error {
  constructor(status, payload) {
    super(String(payload && payload.error));
    this.status = status;
    this.payload = payload;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: J });
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, { error: 'payload_too_large' });
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, { error: 'invalid_json' });
  }
}

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s) {
  return crypto.subtle.digest('SHA-256', te.encode(s));
}
function randomHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return hex(b);
}
function makeSyncKey() {
  let k = '';
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  for (const x of b) k += KEY_ALPHABET[x % KEY_ALPHABET.length];
  return `${k.slice(0, 5)}-${k.slice(5)}`;
}

async function serverHash(authHash, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', te.encode(authHash), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITER_SERVER, hash: 'SHA-256' },
    base,
    256
  );
  return hex(bits);
}
function saltB64() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}

function meta(request) {
  return {
    country: (request.headers.get('cf-ipcountry') || request.headers.get('cf-country') || null),
    user_agent: (request.headers.get('user-agent') || '').slice(0, 250) || null,
  };
}

async function createUser(env, request, { email = null, passwordAuth = null, name = null, age = null, anonymous = true }) {
  const id = randomHex(16);
  const now = new Date().toISOString();
  let password_hash = null;
  let password_salt = null;
  if (passwordAuth) {
    password_salt = saltB64();
    password_hash = await serverHash(passwordAuth, password_salt);
  }
  const m = meta(request);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, name, age, anonymous, sync_key, country, user_agent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id, email, password_hash, password_salt, name,
      Number.isInteger(age) ? age : null,
      anonymous ? 1 : 0,
      makeSyncKey(), m.country, m.user_agent, now, now
    )
    .run();
  return { id, created_at: now };
}

async function newSession(env, userId) {
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(hex(await sha256(token)), userId, expires)
    .run();
  return token;
}

async function userFromToken(env, request) {
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) throw new HttpError(401, { error: 'unauthorized' });
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(hex(await sha256(m[1])), new Date().toISOString())
    .first();
  if (!row) throw new HttpError(401, { error: 'unauthorized' });
  return row;
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    age: u.age,
    anonymous: !!u.anonymous,
    syncKey: u.sync_key,
    createdAt: u.created_at,
  };
}

async function getData(env, userId) {
  const row = await env.DB.prepare('SELECT rev, settings, entries, updated_at FROM data WHERE user_id = ?')
    .bind(userId)
    .first();
  if (!row) return { rev: 0, settings: null, entries: null, updatedAt: null };
  return {
    rev: row.rev,
    settings: row.settings ? JSON.parse(row.settings) : null,
    entries: row.entries ? JSON.parse(row.entries) : null,
    updatedAt: row.updated_at,
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (method === 'GET' && path === '/api/health') return json({ ok: true, service: 'period-tracker-sync' });

  // --- anonymous bootstrap -------------------------------------------------
  if (method === 'POST' && path === '/api/anon') {
    const u = await createUser(env, request, {});
    const token = await newSession(env, u.id);
    return json({ token, user: { ...publicUser(await rawUser(env, u.id)) } }, 201);
  }

  // --- sign up --------------------------------------------------------------
  if (method === 'POST' && path === '/api/signup') {
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 80);
    const age = Number(b.age);
    const authHash = String(b.authHash || '');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, { error: 'invalid_email' });
    if (!name) throw new HttpError(400, { error: 'name_required' });
    if (!Number.isInteger(age) || age < 13 || age > 120) throw new HttpError(400, { error: 'invalid_age' });
    if (!/^[a-f0-9]{64}$/.test(authHash)) throw new HttpError(400, { error: 'invalid_auth_hash' });

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) throw new HttpError(409, { error: 'email_taken' });

    const u = await createUser(env, request, { email, passwordAuth: authHash, name, age, anonymous: false });

    // adopt anonymous data if the device was syncing anonymously first
    if (b.anonKey && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(String(b.anonKey))) {
      const anon = await env.DB.prepare('SELECT id FROM users WHERE sync_key = ? AND anonymous = 1')
        .bind(String(b.anonKey)).first();
      if (anon) {
        const mine = await env.DB.prepare('SELECT user_id FROM data WHERE user_id = ?').bind(u.id).first();
        if (!mine) {
          await env.DB.prepare('UPDATE data SET user_id = ? WHERE user_id = ?').bind(u.id, anon.id).run();
        }
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(anon.id).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(anon.id).run();
      }
    }

    const token = await newSession(env, u.id);
    return json({ token, user: { ...publicUser(await rawUser(env, u.id)) } }, 201);
  }

  // --- sign in ---------------------------------------------------------------
  if (method === 'POST' && path === '/api/signin') {
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    const authHash = String(b.authHash || '');
    const u = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND anonymous = 0').bind(email).first();
    if (!u) throw new HttpError(401, { error: 'invalid_credentials' });
    const candidate = await serverHash(authHash, u.password_salt);
    // constant-ish compare
    if (candidate.length !== u.password_hash.length || candidate !== u.password_hash) {
      throw new HttpError(401, { error: 'invalid_credentials' });
    }
    const m = meta(request);
    await env.DB.prepare('UPDATE users SET country = COALESCE(?, country), user_agent = ?, updated_at = ? WHERE id = ?')
      .bind(m.country, m.user_agent, new Date().toISOString(), u.id).run();
    const token = await newSession(env, u.id);
    return json({ token, user: { ...publicUser(await rawUser(env, u.id)) } });
  }

  // --- restore by sync code ----------------------------------------------------
  if (method === 'POST' && path === '/api/restore') {
    const b = await readBody(request);
    const key = String(b.key || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(key)) throw new HttpError(400, { error: 'invalid_key' });
    const u = await env.DB.prepare('SELECT * FROM users WHERE sync_key = ?').bind(key).first();
    if (!u) throw new HttpError(404, { error: 'key_not_found' });
    const token = await newSession(env, u.id);
    return json({ token, user: { ...publicUser(u) } });
  }

  // --- session scoped ------------------------------------------------------------
  if (method === 'POST' && path === '/api/signout') {
    const auth = request.headers.get('authorization') || '';
    const m = auth.match(/^Bearer ([a-f0-9]{64})$/);
    if (m) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hex(await sha256(m[1]))).run();
    }
    return json({ ok: true });
  }

  if (method === 'GET' && path === '/api/me') {
    const u = await userFromToken(env, request);
    const d = await getData(env, u.id);
    return json({ user: publicUser(u), rev: d.rev, updatedAt: d.updatedAt });
  }

  if (method === 'GET' && path === '/api/data') {
    const u = await userFromToken(env, request);
    return json(await getData(env, u.id));
  }

  if (method === 'POST' && path === '/api/data') {
    const u = await userFromToken(env, request);
    const b = await readBody(request);
    const baseRev = Number(b.baseRev);
    if (!Number.isInteger(baseRev) || baseRev < 0) throw new HttpError(400, { error: 'invalid_rev' });
    const settings = b.settings === null ? null : JSON.stringify(b.settings ?? null);
    const entries = b.entries === null ? null : JSON.stringify(b.entries ?? null);
    if (settings && settings.length > MAX_BODY) throw new HttpError(413, { error: 'payload_too_large' });
    if (entries && entries.length > MAX_BODY) throw new HttpError(413, { error: 'payload_too_large' });

    const current = await env.DB.prepare('SELECT rev FROM data WHERE user_id = ?').bind(u.id).first();
    if (!current) {
      if (baseRev !== 0) {
        const d = await getData(env, u.id);
        return json({ conflict: true, rev: 0, ...d }, 409);
      }
      await env.DB.prepare(
        'INSERT INTO data (user_id, rev, settings, entries, updated_at) VALUES (?, 1, ?, ?, ?)'
      ).bind(u.id, settings, entries, new Date().toISOString()).run();
      return json({ rev: 1 });
    }
    if (current.rev !== baseRev) {
      const d = await getData(env, u.id);
      return json({ conflict: true, ...d }, 409);
    }
    await env.DB.prepare(
      'UPDATE data SET rev = rev + 1, settings = ?, entries = ?, updated_at = ? WHERE user_id = ?'
    ).bind(settings, entries, new Date().toISOString(), u.id).run();
    return json({ rev: current.rev + 1 });
  }

  throw new HttpError(404, { error: 'not_found' });
}

async function rawUser(env, id) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!u) throw new HttpError(500, { error: 'user_missing' });
  return u;
}
