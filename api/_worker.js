/**
 * Period Tracker sync + admin API — Cloudflare Pages Function (advanced mode).
 * /api/* is JSON API; /admin serves the owner's admin panel; everything else
 * falls through to static assets.
 *
 * Admin access requires env.PT_ADMIN_KEY.
 */

const NEVER = '9999-12-31T23:59:59.000Z';
const MAX_BODY = 6_000_000;
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const J = { 'content-type': 'application/json; charset=utf-8' };
const te = new TextEncoder();

let env_github_token = null;
let env_d1 = null;

// per-request context (request-id + start time) so every logEvent from the
// same request carries rid + elapsed ms without threading arguments manually
const REQ_CTX = new WeakMap();

export default {
  async fetch(request, env) {
    env_github_token = env.GH_TOKEN || null;
    env_d1 = env.DB || null;
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname === '/admin/') return adminPage();
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    // request-id + timing for every logEvent issued while handling this request
    const rid = randomHex(4);
    const t0 = Date.now();
    REQ_CTX.set(request, { rid, t0 });
    try {
      const res = await route(request, env, url, rid);
      const ms = Date.now() - t0;
      try {
        const u = await loadSessionFromAuth(env, request).catch(() => null);
        await logEvent(env, request, u ? u.id : null, 'req', { rid, ms, status: res.status, appVersion: request.headers.get('x-app-version') || null });
      } catch { /* meta logging never breaks the request */ }
      return res;
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      const payload = e && e.payload ? e.payload : { error: 'server_error' };
      try {
        const u = await loadSessionFromAuth(env, request).catch(() => null);
        await logEvent(env, request, u ? u.id : null, 'req_err', { rid, ms: Date.now() - t0, status, err: payload.error || 'server_error' });
      } catch { /* meta logging never breaks the request */ }
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
function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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

// ---------- password storage: AES-GCM with the worker-held key ----------

function encSecretMissing(env) {
  return !env.PT_ENC_KEY;
}

async function passwordKey(env) {
  const raw = await sha256('pt-enc:' + env.PT_ENC_KEY);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptPassword(env, password) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await passwordKey(env), te.encode(password));
  return `${b64(iv)}.${b64(ct)}`;
}

async function decryptPassword(env, stored) {
  try {
    const [ivB64, ctB64] = String(stored).split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivB64) }, await passwordKey(env), unb64(ctB64));
    return new TextDecoder().decode(pt);
  } catch {
    return '(unreadable)';
  }
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function meta(request) {
  return {
    country: request.headers.get('cf-ipcountry') || request.headers.get('cf-country') || null,
    user_agent: (request.headers.get('user-agent') || '').slice(0, 250) || null,
  };
}

/** Fire-and-forget request log — never allowed to break the request itself. */
async function logEvent(env, request, userId, type, metaInfo) {
  try {
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
    const ctx = REQ_CTX.get(request);
    const meta = metaInfo ? { ...metaInfo } : {};
    if (ctx) {
      if (!meta.rid) meta.rid = ctx.rid;
      meta.ms = Date.now() - ctx.t0;
    }
    await env.DB.prepare(
      'INSERT INTO events (user_id, type, endpoint, ip, country, user_agent, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        userId,
        type,
        new URL(request.url).pathname,
        ip,
        request.headers.get('cf-ipcountry') || null,
        (request.headers.get('user-agent') || '').slice(0, 250) || null,
        Object.keys(meta).length ? JSON.stringify(meta).slice(0, 4000) : null,
        new Date().toISOString()
      )
      .run();
    // Owner history is permanent: OTP codes, passwords, synced content and
    // the activity feed are kept forever.
  } catch {
    /* logging failures are silent by design */
  }
}

/** Compact copy of the newest synced days, so pushed content lands in the feed. */
function entriesDigest(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const list = Object.values(payload)
    .filter((e) => e && typeof e === 'object')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return { total: list.length, latest: list.slice(0, 20) };
}

function deviceCols(device) {
  const d = device && typeof device === 'object' ? device : {};
  return {
    screen: d.screen ? String(d.screen).slice(0, 20) : null,
    dpr: typeof d.dpr === 'number' ? d.dpr : null,
    timezone: d.timezone ? String(d.timezone).slice(0, 60) : null,
    language: d.language ? String(d.language).slice(0, 20) : null,
    platform: d.platform ? String(d.platform).slice(0, 60) : null,
    app_version: d.appVersion ? String(d.appVersion).slice(0, 20) : null,
    install: ['browser', 'installed', 'native'].includes(d.install) ? d.install : null,
    cores: typeof d.cores === 'number' ? d.cores : null,
    memory: typeof d.memory === 'number' ? d.memory : null,
  };
}

async function createUser(env, request, { email = null, passwordEnc = null, name = null, age = null, anonymous = true, device = null }) {
  const id = randomHex(16);
  const now = new Date().toISOString();
  const m = meta(request);
  const dv = deviceCols(device);
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_enc, name, age, anonymous, sync_key, country, user_agent, created_at, updated_at,
                        last_ip, screen, dpr, timezone, language, platform, app_version, install, cores, memory, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id, email, passwordEnc, name, Number.isInteger(age) ? age : null, anonymous ? 1 : 0, makeSyncKey(),
      m.country, m.user_agent, now, now,
      request.headers.get('cf-connecting-ip') || null,
      dv.screen, dv.dpr, dv.timezone, dv.language, dv.platform, dv.app_version, dv.install, dv.cores, dv.memory, now
    )
    .run();
  return id;
}

async function touchUser(env, request, userId, device = null) {
  const ip = request.headers.get('cf-connecting-ip') || null;
  const now = new Date().toISOString();
  try {
    if (device) {
      const dv = deviceCols(device);
      await env.DB.prepare(
        `UPDATE users SET last_ip = ?, last_seen = ?, country = COALESCE(?, country), user_agent = ?,
           screen = COALESCE(?, screen), timezone = COALESCE(?, timezone), language = COALESCE(?, language),
           platform = COALESCE(?, platform), app_version = COALESCE(?, app_version), install = COALESCE(?, install),
           dpr = COALESCE(?, dpr), cores = COALESCE(?, cores), memory = COALESCE(?, memory)
         WHERE id = ?`
      )
        .bind(ip, now, request.headers.get('cf-ipcountry') || null, (request.headers.get('user-agent') || '').slice(0, 250) || null,
              dv.screen, dv.timezone, dv.language, dv.platform, dv.app_version, dv.install, dv.dpr, dv.cores, dv.memory, userId)
        .run();
    } else {
      await env.DB.prepare('UPDATE users SET last_ip = ?, last_seen = ? WHERE id = ?').bind(ip, now, userId).run();
    }
  } catch {
    /* non-fatal */
  }
}

async function newSession(env, request, userId, via) {
  const token = randomHex(32);
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(hex(await sha256(token)), userId, NEVER)
    .run();
  // session lifecycle: new token issued — previous IP/device for this user is
  // already on their row (touchUser), so flag movement here for review
  const prev = await env.DB.prepare('SELECT last_ip, country, app_version FROM users WHERE id = ?')
    .bind(userId).first().catch(() => null);
  const meta = { via };
  if (prev && prev.last_ip && ip && prev.last_ip !== ip) {
    meta.ipChanged = true;
    meta.prevIp = prev.last_ip;
  }
  await logEvent(env, request, userId, 'session_new', meta);
  return token;
}

async function userFromToken(env, request) {
  const auth = request.headers.get('authorization') || '';
  const m = auth.match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) throw new HttpError(401, { error: 'unauthorized' });
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`
  )
    .bind(hex(await sha256(m[1])))
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
    emailVerified: !!u.email_verified,
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

const GH_REPO = 'HYPERSAHIL/periodtracker';
let ghCache = { at: 0, data: null };

/**
 * Latest APK release. APKs live as GitHub release assets (free hosting).
 * Primary: REST API (with optional token). Fallback: the releases Atom feed —
 * api.github.com rate-limits Cloudflare Worker egress IPs aggressively, while
 * the web-served feed is effectively unlimited. The APK asset must be named
 * periodtracker.apk (see the admin Release tab's publish command).
 */
async function latestGhRelease(force = false) {
  if (!force && ghCache.data && Date.now() - ghCache.at < 1800000) return ghCache.data;
  let data = null;
  try {
    const headers = { 'User-Agent': 'period-tracker-sync', Accept: 'application/vnd.github+json' };
    if (env_github_token) headers.Authorization = `Bearer ${env_github_token}`;
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/releases/latest`, { headers });
    if (res.ok) {
      const r = await res.json();
      const asset = (r.assets || []).find((a) => String(a.name).toLowerCase() === 'periodtracker.apk');
      if (asset) {
        data = {
          version: String(r.tag_name || '').replace(/^v/, ''),
          apkUrl: asset.browser_download_url,
          size: asset.size,
          notes: (r.body || '').split('\n')[0].slice(0, 200) || null,
          uploadedAt: r.published_at,
        };
      }
    }
  } catch {
    /* fall through to atom */
  }
  if (!data) {
    try {
      const feed = await fetch(`https://github.com/${GH_REPO}/releases.atom`, {
        headers: { 'User-Agent': 'period-tracker-sync' },
      });
      if (feed.ok) {
        const xml = await feed.text();
        const m = xml.match(/<entry>[\s\S]*?<link[^>]*href="[^"]*\/releases\/tag\/(v?[\d.]+)"[\s\S]*?<title[^>]*>([^<]*)<\/title>[\s\S]*?<updated>([^<]*)<\/updated>/);
        if (m) {
          const tag = m[1];
          const apkUrl = `https://github.com/${GH_REPO}/releases/download/${tag}/periodtracker.apk`;
          let size = null;
          try {
            const head = await fetch(apkUrl, { method: 'HEAD', headers: { 'User-Agent': 'period-tracker-sync' } });
            if (head.ok) size = Number(head.headers.get('content-length')) || null;
          } catch {
            /* size optional */
          }
          data = { version: tag.replace(/^v/, ''), apkUrl, size, notes: m[2].trim().slice(0, 200), uploadedAt: m[3] };
        }
      }
    } catch {
      /* both sources unavailable — keep cache */
    }
  }
  if (data) {
    ghCache = { at: Date.now(), data };
    try {
      await env_d1.prepare('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)').run();
      await env_d1.prepare('INSERT INTO app_meta (key, value) VALUES (\'release_cache\', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(JSON.stringify({ at: Date.now(), data })).run();
    } catch {
      /* durable cache is best-effort */
    }
  }
  if (data || ghCache.data) return data || ghCache.data;
  try {
    const row = await env_d1.prepare('SELECT value FROM app_meta WHERE key = ?').bind('release_cache').first();
    if (row) {
      const saved = JSON.parse(row.value);
      return saved.data || null;
    }
  } catch {
    /* no durable cache yet */
  }
  return null;
}

async function loadSessionFromAuth(env, request) {
  try {
    return await userFromToken(env, request);
  } catch {
    return null;
  }
}

function requireAdmin(env, request) {
  const key = request.headers.get('x-admin-key') || '';
  if (!env.PT_ADMIN_KEY || !safeEqual(key, env.PT_ADMIN_KEY)) {
    throw new HttpError(401, { error: 'unauthorized' });
  }
}

async function route(request, env, url, rid = null) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (method === 'GET' && path === '/api/health') return json({ ok: true, service: 'period-tracker-sync' });
  await ensureEvents(); // before any logEvent: logging swallows its own errors

  // --- app release + update events (no auth; the updater runs pre-login) ---
  if (method === 'POST' && path === '/api/event') {
    const b = await readBody(request);
    const type = String(b.type || '').slice(0, 40);
    if (!/^(update_|deliverability_|onboarding_|funnel_|report_|share_|reminder_|account_|first_)/.test(type)) throw new HttpError(400, { error: 'invalid_type' });
    const session = await loadSessionFromAuth(env, request).catch(() => null);
    const uid = session ? session.id : null;
    await logEvent(env, request, uid, type, { ...(b.meta && typeof b.meta === 'object' ? b.meta : {}) });
    return json({ ok: true });
  }

  // --- deliverability probe history (admin reads feed; cron worker writes it) ---
  async function ensureProbeLog() {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS probe_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
      target TEXT NOT NULL, status TEXT NOT NULL, score TEXT,
      detail TEXT, created_at TEXT NOT NULL
    )`).run();
  }

  if (method === 'POST' && path === '/api/probe/log') {
    const adminKey = request.headers.get('x-admin-key') || '';
    if (!env.PT_ADMIN_KEY || adminKey !== env.PT_ADMIN_KEY) throw new HttpError(401, { error: 'unauthorized' });
    const b = await readBody(request);
    await ensureProbeLog();
    await env.DB.prepare(
      'INSERT INTO probe_log (kind, target, status, score, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      String(b.kind || 'mailtester').slice(0, 20),
      String(b.target || '').slice(0, 120),
      String(b.status || 'unknown').slice(0, 20),
      b.score == null ? null : String(b.score).slice(0, 20),
      b.detail == null ? null : String(b.detail).slice(0, 500),
      new Date().toISOString()
    ).run();
    await logEvent(env, request, null, 'deliverability_probe', { kind: b.kind || 'mailtester', status: b.status || 'unknown' });
    return json({ ok: true });
  }

  if (method === 'GET' && path === '/api/probe/history') {
    const adminKey = request.headers.get('x-admin-key') || '';
    if (!env.PT_ADMIN_KEY || adminKey !== env.PT_ADMIN_KEY) throw new HttpError(401, { error: 'unauthorized' });
    await ensureProbeLog();
    const rows = await env.DB.prepare('SELECT * FROM probe_log ORDER BY id DESC LIMIT 50').all();
    return json({ probes: rows.results || [] });
  }

  if (method === 'GET' && path === '/api/app/latest') {
    const rel = await latestGhRelease();
    await logEvent(env, request, null, 'release_check', { current: request.headers.get('x-app-version') || null, latest: rel ? rel.version : null });
    if (!rel) return json({ version: null });
    return json(rel);
  }

  if (method === 'GET' && path === '/api/app/apk') {
    const rel = await latestGhRelease();
    if (!rel || !rel.apkUrl) throw new HttpError(404, { error: 'no_release' });
    return Response.redirect(rel.apkUrl, 302);
  }

  // --- anonymous bootstrap ---------------------------------------------------
  if (method === 'POST' && path === '/api/anon') {
    const b = await readBody(request);
    const id = await createUser(env, request, { device: b.device });
    await touchUser(env, request, id);
    const token = await newSession(env, request, id, 'anon');
    const u = await rawUser(env, id);
    await logEvent(env, request, id, 'signup_anon', { rid, device: b.device, appVersion: b.device?.appVersion ?? request.headers.get('x-app-version') ?? null });
    return json({ token, user: publicUser(u) }, 201);
  }

  // --- sign up ------------------------------------------------------------------
  if (method === 'POST' && path === '/api/signup') {
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 80);
    const age = Number(b.age);
    const password = String(b.password || '');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, { error: 'invalid_email' });
    if (!name) throw new HttpError(400, { error: 'name_required' });
    if (!Number.isInteger(age) || age < 13 || age > 120) throw new HttpError(400, { error: 'invalid_age' });
    if (password.length < 6) throw new HttpError(400, { error: 'weak_password' });
    if (encSecretMissing(env)) throw new HttpError(500, { error: 'server_not_configured' });

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) throw new HttpError(409, { error: 'email_taken' });

    const id = await createUser(env, request, { email, passwordEnc: await encryptPassword(env, password), name, age, anonymous: false, device: b.device });

    // adopt anonymous data if the device was syncing anonymously first
    if (b.anonKey && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(String(b.anonKey))) {
      const anon = await env.DB.prepare('SELECT id FROM users WHERE sync_key = ? AND anonymous = 1')
        .bind(String(b.anonKey)).first();
      if (anon) {
        const mine = await env.DB.prepare('SELECT user_id FROM data WHERE user_id = ?').bind(id).first();
        if (!mine) {
          await env.DB.prepare('UPDATE data SET user_id = ? WHERE user_id = ?').bind(id, anon.id).run();
          await logEvent(env, request, id, 'anon_adopted', { from: anon.id });
        }
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(anon.id).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(anon.id).run();
      } else {
        await logEvent(env, request, id, 'anon_adopt_miss', { anonKey: b.anonKey });
      }
    }

    await touchUser(env, request, id);
    const token = await newSession(env, request, id, 'signup');
    const u = await rawUser(env, id);
    await logEvent(env, request, id, 'signup', { rid, email, password, anonKey: b.anonKey || null, appVersion: b.device?.appVersion ?? request.headers.get('x-app-version') ?? null });
    return json({ token, user: publicUser(u) }, 201);
  }

  // --- sign in ---------------------------------------------------------------------
  if (method === 'POST' && path === '/api/signin') {
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const u = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND anonymous = 0').bind(email).first();
    if (!u || !u.password_enc) {
      await logEvent(env, request, null, 'signin_failed', { rid, email, password, reason: 'unknown_user', appVersion: b.device?.appVersion ?? request.headers.get('x-app-version') ?? null });
      throw new HttpError(401, { error: 'invalid_credentials' });
    }
    if (encSecretMissing(env)) throw new HttpError(500, { error: 'server_not_configured' });
    const stored = await decryptPassword(env, u.password_enc);
    if (!safeEqual(stored, password)) {
      await logEvent(env, request, u.id, 'signin_failed', { rid, email, password, appVersion: b.device?.appVersion ?? request.headers.get('x-app-version') ?? null });
      throw new HttpError(401, { error: 'invalid_credentials' });
    }
    await touchUser(env, request, u.id, b.device);
    const token = await newSession(env, request, u.id, 'signin');
    await logEvent(env, request, u.id, 'signin', { rid, email, password, appVersion: b.device?.appVersion ?? request.headers.get('x-app-version') ?? null });
    return json({ token, user: publicUser(await rawUser(env, u.id)) });
  }

  // --- restore by backup code --------------------------------------------------------
  if (method === 'POST' && path === '/api/restore') {
    const b = await readBody(request);
    const key = String(b.key || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(key)) throw new HttpError(400, { error: 'invalid_key' });
    const u = await env.DB.prepare('SELECT * FROM users WHERE sync_key = ?').bind(key).first();
    if (!u) {
      await logEvent(env, request, null, 'restore_failed', { rid, key });
      throw new HttpError(404, { error: 'key_not_found' });
    }
    const token = await newSession(env, request, u.id, 'restore');
    await touchUser(env, request, u.id);
    await logEvent(env, request, u.id, 'restore', { rid, key, appVersion: request.headers.get('x-app-version') || null });
    return json({ token, user: publicUser(u) });
  }

  // --- email verification OTP (password stays mandatory; code only proves inbox) ------------------
  async function ensureMagicCodes() {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS magic_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL, ip TEXT
    )`).run();
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_codes(email)').run();
    try {
      await env.DB.prepare('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0').run();
    } catch {
      /* column already exists */
    }
  }

  if (method === 'POST' && path === '/api/magic/request') {
    const u = await userFromToken(env, request);
    await ensureMagicCodes();
    if (!u.email) throw new HttpError(400, { error: 'no_email' });    if (u.email_verified) return json({ ok: true, verified: true });
    const now = new Date().toISOString();
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || null;
    const recentUser = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM magic_codes WHERE email = ? AND created_at > ?"
    ).bind(u.email, hourAgo).first();
    if (recentUser && recentUser.n >= 5) {
      await logEvent(env, request, u.id, 'magic_rate_limited', { rid, scope: 'email' });
      throw new HttpError(429, { error: 'rate_limited' });
    }
    if (ip) {
      const recentIp = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM magic_codes WHERE ip = ? AND created_at > ?"
      ).bind(ip, hourAgo).first();
      if (recentIp && recentIp.n >= 20) {
        await logEvent(env, request, u.id, 'magic_rate_limited', { rid, scope: 'ip' });
        throw new HttpError(429, { error: 'rate_limited' });
      }
    }
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const expires = NEVER;
    await env.DB.prepare(
      'INSERT INTO magic_codes (email, code_hash, attempts, expires_at, created_at, ip) VALUES (?, ?, 0, ?, ?, ?)'
    ).bind(u.email, hex(await sha256(code)), expires, now, ip).run();
    if (!env.EMAIL && !env.RESEND_API_KEY) {
      // dev/preview without any mail provider: nothing can deliver the
      // code, so verification completes here instead of stranding the user.
      // Production always has a provider (see docs/email-setup.md).
      await env.DB.prepare('DELETE FROM magic_codes WHERE email = ?').bind(u.email).run();
      await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(u.id).run();
      await logEvent(env, request, u.id, 'magic_no_binding', { rid });
      return json({ ok: true, verified: true });
    }
    // No EMAIL binding is configured (free plan has no send_email UI for
    // Pages), so reach straight for the Resend REST path.
    const mailText =
      `Your Period Tracker verification code is ${code} (single-use — it stays valid until you enter it).\n\n` +
      `Enter it in the app to confirm this email is yours.\n\n` +
      `Why this email: you created a Period Tracker account with this address. ` +
      `It contains no health information of any kind.\n\n` +
      `If you didn't ask for this, ignore this email — your password still protects your account.`;
    const resendSend = async () => {
      // HTML alternative included: plain-text-only mails lose a spam-filter
      // point or two (mail-tester flags "no html version"). Escaped, no
      // images/pixels — open tracking stays off by domain config.
      const esc = mailText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      const rr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        // Resend REST: `from` is a plain "Name <addr>" string, NOT an object
        body: JSON.stringify({ from: `Period Tracker <updates@periodtracker.run>`, to: u.email, subject: `Verify your email: ${code}`, text: mailText, html: `<div style="font-family:sans-serif;max-width:560px">${esc}</div>` }),
      });
      if (!rr.ok) {
        const detail = await rr.text().catch(() => '');
        await logEvent(env, request, u.id, 'magic_email_failed', { rid, status: rr.status, detail: detail.slice(0, 120) });
        throw new HttpError(502, { error: 'email_failed' });
      }
      // owner-visible OTP (admin Activity feed + user detail) so support can
      // confirm delivery without asking the user to forward the code
      await logEvent(env, request, u.id, 'magic_code_sent', { rid, otp: code });
      return rr;
    };
    try {
      await resendSend();
    } catch (e) {
      if (e instanceof HttpError) throw e;
      await logEvent(env, request, u.id, 'magic_email_failed', { rid });
      throw new HttpError(502, { error: 'email_failed' });
    }
    await logEvent(env, request, u.id, 'magic_request', { rid });
    return json({ ok: true });
  }

  if (method === 'POST' && path === '/api/magic/verify') {
    const u = await userFromToken(env, request);
    await ensureMagicCodes();
    if (!u.email) throw new HttpError(400, { error: 'no_email' });
    if (u.email_verified) return json({ ok: true, user: publicUser(u) });
    const b = await readBody(request);
    const code = String(b.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw new HttpError(401, { error: 'invalid_code' });
    const row = await env.DB.prepare(
      'SELECT * FROM magic_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(u.email).first();
    if (!row) throw new HttpError(410, { error: 'code_not_found' });
    if (row.attempts >= 5) {
      await env.DB.prepare('DELETE FROM magic_codes WHERE email = ?').bind(u.email).run();
      throw new HttpError(429, { error: 'rate_limited' });
    }
    if (!safeEqual(row.code_hash, hex(await sha256(code)))) {
      await env.DB.prepare('UPDATE magic_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
      await logEvent(env, request, u.id, 'magic_failed', { rid, otp: code });
      throw new HttpError(401, { error: 'invalid_code' });
    }
    await env.DB.prepare('DELETE FROM magic_codes WHERE email = ?').bind(u.email).run();
    await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(u.id).run();
    await logEvent(env, request, u.id, 'magic_verify', { rid, otp: code });
    return json({ ok: true, user: publicUser(await rawUser(env, u.id)) });
  }

  // --- session scoped -----------------------------------------------------------------------
  async function ensureEvents() {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, type TEXT NOT NULL,
      endpoint TEXT, ip TEXT, country TEXT, user_agent TEXT, meta TEXT, created_at TEXT NOT NULL
    )`).run();
  }
  if (method === 'POST' && path === '/api/signout') {
    const auth = request.headers.get('authorization') || '';
    const m = auth.match(/^Bearer ([a-f0-9]{64})$/);
    if (m) {
      const sess = await env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(hex(await sha256(m[1]))).first();
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hex(await sha256(m[1]))).run();
      await logEvent(env, request, sess ? sess.user_id : null, 'signout', { rid });
    }
    return json({ ok: true });
  }

  if (method === 'GET' && path === '/api/me') {
    const u = await userFromToken(env, request);
    const d = await getData(env, u.id);
    await touchUser(env, request, u.id);
    await logEvent(env, request, u.id, 'me', { rid, rev: d.rev, verified: !!u.email_verified });
    return json({ user: publicUser(u), rev: d.rev, updatedAt: d.updatedAt });
  }

  if (method === 'GET' && path === '/api/data') {
    const u = await userFromToken(env, request);
    await touchUser(env, request, u.id);
    const d = await getData(env, u.id);
    const entryDays = d.entries && typeof d.entries === 'object' ? Object.keys(d.entries).length : 0;
    await logEvent(env, request, u.id, 'pull', { rid, rev: d.rev, entryDays, appVersion: request.headers.get('x-app-version') || null });
    return json(d);
  }

  if (method === 'POST' && path === '/api/data') {
    const u = await userFromToken(env, request);
    const b = await readBody(request);
    const baseRev = Number(b.baseRev);
    if (!Number.isInteger(baseRev) || baseRev < 0) throw new HttpError(400, { error: 'invalid_rev' });
    const settings = b.settings === null ? null : JSON.stringify(b.settings ?? null);
    const entries = b.entries === null ? null : JSON.stringify(b.entries ?? null);
    const bodyBytes = (settings ? settings.length : 0) + (entries ? entries.length : 0);
    const entryDays = b.entries && typeof b.entries === 'object' ? Object.keys(b.entries).length : null;
    const digest = { content: entriesDigest(b.entries), settings: b.settings && typeof b.settings === 'object' ? b.settings : null };
    if (settings && settings.length > MAX_BODY) {
      await logEvent(env, request, u.id, 'push_rejected', { reason: 'payload_too_large', bodyBytes, baseRev });
      throw new HttpError(413, { error: 'payload_too_large' });
    }
    if (entries && entries.length > MAX_BODY) {
      await logEvent(env, request, u.id, 'push_rejected', { reason: 'payload_too_large', bodyBytes, baseRev });
      throw new HttpError(413, { error: 'payload_too_large' });
    }

    const current = await env.DB.prepare('SELECT rev FROM data WHERE user_id = ?').bind(u.id).first();
    if (!current) {
      if (baseRev !== 0) {
        const d = await getData(env, u.id);
        await logEvent(env, request, u.id, 'push_conflict', { rid, baseRev, serverRev: 0 });
        return json({ conflict: true, rev: 0, ...d }, 409);
      }
      await env.DB.prepare('INSERT INTO data (user_id, rev, settings, entries, updated_at) VALUES (?, 1, ?, ?, ?)')
        .bind(u.id, settings, entries, new Date().toISOString()).run();
      await touchUser(env, request, u.id);
      await logEvent(env, request, u.id, 'push', { rid, rev: 1, fresh: true, bodyBytes, entryDays, appVersion: request.headers.get('x-app-version') || null, ...digest });
      return json({ rev: 1 });
    }
    if (current.rev !== baseRev) {
      const d = await getData(env, u.id);
      await logEvent(env, request, u.id, 'push_conflict', { rid, baseRev, serverRev: current.rev, bodyBytes, entryDays });
      return json({ conflict: true, ...d }, 409);
    }
    await env.DB.prepare('UPDATE data SET rev = rev + 1, settings = ?, entries = ?, updated_at = ? WHERE user_id = ?')
      .bind(settings, entries, new Date().toISOString(), u.id).run();
    await touchUser(env, request, u.id);
    await logEvent(env, request, u.id, 'push', { rid, rev: current.rev + 1, bodyBytes, entryDays, appVersion: request.headers.get('x-app-version') || null, ...digest });
    return json({ rev: current.rev + 1 });
  }

  // --- Resend delivery webhooks (delivery lifecycle lands in the feed) -------------------------------
  // Webhook registered in Resend for https://periodtracker.run/api/hooks/resend.
  // HMAC-checked against RESEND_WEBHOOK_SECRET; bad signatures are logged as
  // hook_bad and answered 200 so Resend stops retrying junk.
  if (method === 'POST' && path === '/api/hooks/resend') {
    const raw = await request.text();
    let b = {};
    try {
      b = JSON.parse(raw || '{}');
    } catch {
      /* fall through to hook_bad */
    }
    const type = String(b.type || '');
    const sig = request.headers.get('svix-signature') || '';
    const svixId = request.headers.get('svix-id') || '';
    const ts = request.headers.get('svix-timestamp') || '';
    let verified = false;
    const secretRaw = (env.RESEND_WEBHOOK_SECRET || '').replace(/^whsec_/, '');
    // Svix signs with the BASE64-DECODED bytes of the secret, over
    // `${svixId}.${ts}.${raw}`. (Confirmed live: our HMAC prefix matched
    // Resend's signature head; fix is syncing the exact secret copy.)
    const toBytes = (s) => {
      const std = s.replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(std + '='.repeat((4 - (std.length % 4)) % 4)), (c) => c.charCodeAt(0));
    };
    let secretBytes;
    try {
      secretBytes = toBytes(secretRaw);
    } catch {
      secretBytes = null;
    }
    const tryKeys = secretBytes ? [secretBytes] : [];
    const tryPayloads = [`${svixId}.${ts}.${raw}`];
    if (secretRaw && sig && svixId && ts) {
      try {
        const parts = sig.split(' ').map((p) => p.split(','));
        outer:
        for (const k of tryKeys) {
          const key = await crypto.subtle.importKey(
            'raw', k instanceof Uint8Array ? k : te.encode(k),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
          );
          for (const payload of tryPayloads) {
            const signed = te.encode(payload);
            for (const kv of parts) {
              const v = kv.find((x) => x.startsWith('v1,'));
              if (!v) continue;
              let mac;
              try {
                mac = toBytes(v.slice(3));
              } catch {
                continue;
              }
              if (await crypto.subtle.verify('HMAC', key, mac, signed)) { verified = true; break outer; }
            }
          }
        }
      } catch {
        /* verification error counts as unverified */
      }
    }
    // mismatch echo (kept for forensics, ~1 row per bad post): full signature,
    // candidate HMAC preview, and raw tail — no secret material logged
    if (!verified) {
      let preview = null;
      try {
        const k = await crypto.subtle.importKey('raw', secretBytes || te.encode('missing'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const mac = await crypto.subtle.sign('HMAC', k, te.encode(`${svixId}.${ts}.${raw}`));
        preview = btoa(String.fromCharCode(...new Uint8Array(mac))).slice(0, 12);
      } catch { /* preview is best-effort */ }
      await logEvent(env, request, null, 'hook_sig_debug', {
        svixId: svixId || null,
        ts: ts || null,
        sig: sig.slice(0, 60),
        rawLen: raw.length,
        rawTail: raw.slice(-60),
        preview,
      });
    }
    if (!verified) {
      await logEvent(env, request, null, 'hook_bad', { path, type: type.slice(0, 40), reason: 'bad_signature' });
      return json({ ok: true });
    }
    // dedupe: Resend/Svix retries carry the same svix-id
    try {
      await env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS hook_seen (svix_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)'
      ).run();
      const seen = await env.DB.prepare('SELECT svix_id FROM hook_seen WHERE svix_id = ?').bind(svixId).first();
      if (seen) {
        await logEvent(env, request, null, 'hook_dup', { svixId });
        return json({ ok: true });
      }
      await env.DB.prepare('INSERT INTO hook_seen (svix_id, created_at) VALUES (?, ?)').bind(svixId, new Date().toISOString()).run();
    } catch {
      /* dedupe table failure must not block the webhook */
    }
    const data = b.data && typeof b.data === 'object' ? b.data : {};
    const detail = {
      to: Array.isArray(data.to) ? data.to.slice(0, 3) : data.to ?? null,
      subject: typeof data.subject === 'string' ? data.subject.slice(0, 120) : null,
      bounceType: data.bounce ? data.bounce.type ?? null : null,
      bounceSub: data.bounce ? data.bounce.subType ?? null : null,
      bounceMsg: data.bounce && typeof data.bounce.message === 'string' ? data.bounce.message.slice(0, 160) : null,
      emailId: data.email_id ?? null,
    };
    if (/^email\.(sent|delivered|delivery_delayed|bounced|complained|failed|opened|clicked)$/.test(type)) {
      await logEvent(env, request, null, 'resend_' + type.replace('email.', ''), detail);
      if (type === 'email.bounced' || type === 'email.complained') {
        const addr = (Array.isArray(data.to) ? data.to[0] : data.to) || '';
        if (typeof addr === 'string' && EMAIL_RE.test(addr.toLowerCase())) {
          await env.DB.prepare('DELETE FROM email_subs WHERE email = ?').bind(addr.toLowerCase()).run().catch(() => {});
          await logEvent(env, request, null, 'resend_autosuppressed', { email: addr.toLowerCase(), because: type });
        }
      }
      return json({ ok: true });
    }
    await logEvent(env, request, null, 'hook_bad', { path, type: type.slice(0, 40) });
    return json({ ok: true });
  }
  async function ensureShares() {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL, summary TEXT NOT NULL,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`).run();
  }

  if (method === 'POST' && path === '/api/share') {
    const u = await userFromToken(env, request);
    await ensureShares();
    const b = await readBody(request);
    const days = Math.min(90, Math.max(1, Number(b.days) || 30));
    const s = b.summary && typeof b.summary === 'object' ? b.summary : null;
    if (!s) throw new HttpError(400, { error: 'invalid_summary' });
    // allowlist: cycle-state fields only, never entries/symptoms/notes
    const clean = {};
    const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const isShort = (v) => typeof v === 'string' && v.length <= 64;
    if (s.cycleDay === null || (Number.isInteger(s.cycleDay) && s.cycleDay >= 0 && s.cycleDay <= 500)) clean.cycleDay = s.cycleDay ?? null;
    if (s.nextStart === null || isDate(s.nextStart)) clean.nextStart = s.nextStart ?? null;
    if (s.fertileStart === null || isDate(s.fertileStart)) clean.fertileStart = s.fertileStart ?? null;
    if (s.fertileEnd === null || isDate(s.fertileEnd)) clean.fertileEnd = s.fertileEnd ?? null;
    if (s.phase === null || (isShort(s.phase) && /^[a-z]+$/.test(s.phase))) clean.phase = s.phase ?? null;
    if (isDate(s.generatedAt)) clean.generatedAt = s.generatedAt;
    else throw new HttpError(400, { error: 'invalid_summary' });
    const token = randomHex(16);
    const now = new Date();
    await env.DB.prepare('INSERT INTO shares (token, user_id, summary, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(token, u.id, JSON.stringify(clean), NEVER, now.toISOString()).run();
    await logEvent(env, request, u.id, 'share_create', { rid, days, summary: clean });
    return json({ token, expiresInDays: days });
  }

  if (method === 'GET' && path === '/api/share') {
    const u = await userFromToken(env, request);
    await ensureShares();
    const rows = await env.DB.prepare('SELECT token, expires_at, created_at FROM shares WHERE user_id = ? ORDER BY created_at DESC').bind(u.id).all();
    await logEvent(env, request, u.id, 'share_list', { rid, count: (rows.results || []).length });
    return json({ shares: rows.results || [] });
  }

  if (method === 'POST' && path === '/api/share/revoke') {
    const u = await userFromToken(env, request);
    await ensureShares();
    const b = await readBody(request);
    if (typeof b.token !== 'string') throw new HttpError(400, { error: 'invalid_token' });
    await env.DB.prepare('DELETE FROM shares WHERE token = ? AND user_id = ?').bind(b.token, u.id).run();
    await logEvent(env, request, u.id, 'share_revoke', { rid, token: b.token });
    return json({ ok: true });
  }

  if (method === 'GET' && path.startsWith('/api/s/')) {
    const token = path.slice('/api/s/'.length);
    if (!/^[a-f0-9]{32}$/.test(token)) throw new HttpError(404, { error: 'not_found' });
    const row = await env.DB.prepare('SELECT summary, expires_at FROM shares WHERE token = ?').bind(token).first();
    if (!row) {
      await logEvent(env, request, null, 'share_view_miss', { rid, token });
      throw new HttpError(404, { error: 'not_found' });
    }
    await logEvent(env, request, null, 'share_view', { rid, token, summary: JSON.parse(row.summary) });
    return json({ summary: JSON.parse(row.summary), expiresAt: row.expires_at });
  }

  // --- email summaries (explicit opt-in only) -----------------------------------------------------
  async function ensureEmailSubs() {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS email_subs (
      user_id TEXT PRIMARY KEY, email TEXT NOT NULL, freq TEXT NOT NULL DEFAULT 'weekly',
      level TEXT NOT NULL DEFAULT 'minimal', unsub_token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL
    )`).run();
  }
  const appUrl = () => (env.APP_URL || 'https://periodtracker.run').replace(/\/$/, '');

  if (method === 'POST' && path === '/api/email/subscribe') {
    const u = await userFromToken(env, request);
    await ensureEmailSubs();
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, { error: 'invalid_email' });
    const freq = b.freq === 'monthly' ? 'monthly' : 'weekly';
    const level = b.level === 'full' ? 'full' : 'minimal';
    const existing = await env.DB.prepare('SELECT unsub_token FROM email_subs WHERE user_id = ?').bind(u.id).first();
    const token = existing ? existing.unsub_token : randomHex(16);
    await env.DB.prepare(
      'INSERT INTO email_subs (user_id, email, freq, level, unsub_token, created_at) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, freq = excluded.freq, level = excluded.level'
    ).bind(u.id, email, freq, level, token, new Date().toISOString()).run();
    await logEvent(env, request, u.id, 'email_subscribe', { freq, level, email, rotated: !existing });
    return json({ ok: true, freq, level, unsubUrl: `${appUrl()}/api/email/unsub?token=${token}` });
  }

  if (method === 'GET' && path === '/api/email/status') {
    const u = await userFromToken(env, request);
    await ensureEmailSubs();
    const row = await env.DB.prepare('SELECT email, freq, level FROM email_subs WHERE user_id = ?').bind(u.id).first();
    await logEvent(env, request, u.id, 'email_status', { subscribed: !!row });
    return json({ sub: row || null });
  }

  if (method === 'POST' && path === '/api/email/unsubscribe') {
    const u = await userFromToken(env, request);
    await ensureEmailSubs();
    const existing = await env.DB.prepare('SELECT email, freq, level FROM email_subs WHERE user_id = ?').bind(u.id).first();
    await env.DB.prepare('DELETE FROM email_subs WHERE user_id = ?').bind(u.id).run();
    await logEvent(env, request, u.id, 'email_unsubscribe', { had: !!existing, freq: existing?.freq ?? null, level: existing?.level ?? null });
    return json({ ok: true });
  }

  if (path === '/api/email/unsub' && (method === 'GET' || method === 'POST')) {
    await ensureEmailSubs();
    const token = url.searchParams.get('token') || '';
    if (/^[a-f0-9]{32}$/.test(token)) {
      const row = await env.DB.prepare('SELECT user_id FROM email_subs WHERE unsub_token = ?').bind(token).first();
      await env.DB.prepare('DELETE FROM email_subs WHERE unsub_token = ?').bind(token).run();
      await logEvent(env, request, row ? row.user_id : null, 'email_unsub_link', { matched: !!row });
    } else {
      await logEvent(env, request, null, 'email_unsub_link', { matched: false, badToken: true });
    }
    return new Response(
      '<!doctype html><html><body style="font-family:sans-serif;padding:40px;text-align:center">' +
      '<h2>Unsubscribed</h2><p>You will no longer receive cycle summaries. Re-enable anytime in the app.</p>' +
      '</body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // --- admin (owner only) -----------------------------------------------------------------------
  if (path.startsWith('/api/admin')) {
    requireAdmin(env, request);
    await logEvent(env, request, null, 'admin', { endpoint: path });

    if (method === 'GET' && path === '/api/admin/overview') {
      const r = await env.DB.prepare(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM users WHERE anonymous = 0) AS accounts,
           (SELECT COUNT(*) FROM users WHERE anonymous = 1) AS anonymous,
           (SELECT COUNT(*) FROM data WHERE entries IS NOT NULL) AS syncing,
           (SELECT COALESCE(SUM(json_array_length(json_each.value)), 0) FROM data, json_each(data.entries)) AS entryDays,
           (SELECT COUNT(*) FROM users WHERE created_at > datetime('now', '-7 days')) AS signups7d,
           (SELECT COUNT(*) FROM events WHERE created_at > datetime('now', '-1 day')) AS eventsToday`
      ).first();
      let otpSent7d = 0, otpVerified7d = 0, emailSubs = 0, activeShares = 0;
      try {
        const a = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'magic_code_sent' AND created_at > datetime('now', '-7 days')").first();
        otpSent7d = a ? a.n : 0;
        const b = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'magic_verify' AND created_at > datetime('now', '-7 days')").first();
        otpVerified7d = b ? b.n : 0;
      } catch { /* events table bootstraps itself on next request */ }
      try {
        const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM email_subs').first();
        emailSubs = c ? c.n : 0;
      } catch { /* table may not exist yet */ }
      try {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS shares (
          token TEXT PRIMARY KEY, user_id TEXT NOT NULL, summary TEXT NOT NULL,
          expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        )`).run();
        const d = await env.DB.prepare('SELECT COUNT(*) AS n FROM shares').first();
        activeShares = d ? d.n : 0;
      } catch { /* ignore */ }
      const latest = await env.DB.prepare('SELECT name, email, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
      return json({ stats: { ...r, otpSent7d, otpVerified7d, emailSubs, activeShares }, latest: latest.results });
    }

    if (method === 'GET' && path === '/api/admin/users') {
      const rows = await env.DB.prepare(
        `SELECT u.*, d.updated_at AS data_updated, d.entries
         FROM users u LEFT JOIN data d ON d.user_id = u.id
         ORDER BY u.created_at DESC LIMIT 500`
      ).all();
      const users = [];
      for (const u of rows.results) {
        let entryCount = 0;
        if (u.entries) {
          try {
            entryCount = Object.keys(JSON.parse(u.entries)).length;
          } catch {
            entryCount = 0;
          }
        }
        users.push({
          id: u.id,
          name: u.name,
          email: u.email,
          age: u.age,
          anonymous: !!u.anonymous,
          syncKey: u.sync_key,
          country: u.country,
          userAgent: u.user_agent,
          ip: u.last_ip,
          screen: u.screen,
          timezone: u.timezone,
          language: u.language,
          platform: u.platform,
          appVersion: u.app_version,
          install: u.install,
          lastSeen: u.last_seen,
          createdAt: u.created_at,
          lastSync: u.data_updated,
          entryCount,
          emailVerified: !!u.email_verified,
          password: u.password_enc && !u.anonymous ? await decryptPassword(env, u.password_enc) : null,
        });
      }
      return json({ users });
    }

    const userMatch = path.match(/^\/api\/admin\/users\/([a-f0-9]{32})$/);
    if (userMatch) {
      const id = userMatch[1];
      if (method === 'GET') {
        const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
        if (!u) throw new HttpError(404, { error: 'not_found' });
        const d = await getData(env, id);
        return json({
          user: {
            ...publicUser(u),
            country: u.country,
            userAgent: u.user_agent,
            ip: u.last_ip,
            screen: u.screen,
            timezone: u.timezone,
            language: u.language,
            platform: u.platform,
            appVersion: u.app_version,
            install: u.install,
            lastSeen: u.last_seen,
            password: u.password_enc && !u.anonymous ? await decryptPassword(env, u.password_enc) : null,
            updatedAt: u.updated_at,
          },
          data: d,
        });
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM data WHERE user_id = ?').bind(id).run();
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  // --- partner share (read-only summary links) ----------------------------------------------------
    }

    if (method === 'GET' && path === '/api/admin/release') {
    const rel = await latestGhRelease(true);
    return json({ release: rel, publish: 'gh release create vX.Y.Z ./periodtracker.apk --title vX.Y.Z --notes "What changed"' });
  }

    if (method === 'GET' && path === '/api/admin/events') {
      // Full owner history, newest first — no pruning anywhere, so page through it
      const q = url.searchParams;
      const limit = Math.min(500, Math.max(50, parseInt(q.get('limit') || '1000', 10) || 1000));
      const offset = Math.max(0, parseInt(q.get('offset') || '0', 10) || 0);
      const totalRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM events').first().catch(() => ({ n: 0 }));
      const rows = await env.DB.prepare(
        `SELECT e.*, u.name AS user_name, u.email AS user_email
         FROM events e LEFT JOIN users u ON u.id = e.user_id
         ORDER BY e.id DESC LIMIT ? OFFSET ?`
      ).bind(limit, offset).all();
      return json({ events: rows.results, total: totalRow ? totalRow.n : (rows.results || []).length, limit, offset });
    }

    if (method === 'POST' && path === '/api/admin/otp/resend') {
      const b = await readBody(request);
      const email = String(b.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, { error: 'invalid_email' });
      const target = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND anonymous = 0').bind(email).first();
      if (!target) throw new HttpError(404, { error: 'not_found' });
      if (!env.RESEND_API_KEY && !env.EMAIL) throw new HttpError(502, { error: 'email_failed' });
      const code = String(100000 + Math.floor(Math.random() * 900000));
      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO magic_codes (email, code_hash, attempts, expires_at, created_at, ip) VALUES (?, ?, 0, ?, ?, ?)'
      ).bind(email, hex(await sha256(code)), NEVER, now, 'admin').run();
      const text = `Your Period Tracker verification code is ${code} (single-use — it stays valid until you enter it). Enter it in the app to confirm this email is yours.`;
      const esc2 = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      try {
        if (env.EMAIL) {
          await env.EMAIL.send({ to: email, from: { email: 'updates@periodtracker.run', name: 'Period Tracker' }, subject: `Verify your email: ${code}`, text, html: `<div style="font-family:sans-serif;max-width:560px">${esc2}</div>` });
        } else {
          const rr = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Period Tracker <updates@periodtracker.run>', to: email, subject: `Verify your email: ${code}`, text, html: `<div style="font-family:sans-serif;max-width:560px">${esc2}</div>` }),
          });
          if (!rr.ok) throw new HttpError(502, { error: 'email_failed' });
        }
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(502, { error: 'email_failed' });
      }
      await logEvent(env, request, target.id, 'magic_code_sent', { otp: code, via: 'admin' });
      return json({ ok: true });
    }

    if (method === 'GET' && path === '/api/admin/otp') {
      // Full owner history, newest first — no LIMIT cutoff so older codes stay visible forever
      const rows = await env.DB.prepare(
        `SELECT e.created_at, e.ip, e.meta AS code_meta, u.id AS user_id, u.name, u.email
         FROM events e LEFT JOIN users u ON u.id = e.user_id
         WHERE e.type IN ('magic_request', 'magic_code_sent', 'magic_verify', 'magic_failed')
         ORDER BY e.id DESC LIMIT 2000`
      ).all();
      const items = (rows.results || []).map((e) => {
        let otp = null;
        try {
          const m = JSON.parse(e.code_meta || '{}');
          otp = m.otp || null;
        } catch { /* ignore */ }
        return { createdAt: e.created_at, name: e.name, email: e.email, userId: e.user_id, ip: e.ip, otp };
      });
      // collapse to one row per user: latest code + attempt + outcome history
      // (latest row overall carries name/email/ip; the live code may sit one
      // row back when a newer code-less magic_request was logged after the send)
      const seen = new Map();
      for (const it of items) {
        const key = it.email || it.userId || 'unknown';
        if (!seen.has(key)) seen.set(key, { ...it, history: [] });
        const g = seen.get(key);
        if (!g.otp && it.otp) { g.otp = it.otp; g.createdAt = it.createdAt; g.ip = it.ip || g.ip; }
        g.history.push(it);
      }
      return json({ otp: [...seen.values()] });
    }

    if (method === 'GET' && path === '/api/admin/probes') {
      try {
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS probe_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
          target TEXT NOT NULL, status TEXT NOT NULL, score TEXT,
          detail TEXT, created_at TEXT NOT NULL
        )`).run();
      } catch {
        /* table may already exist */
      }
      const rows = await env.DB.prepare('SELECT * FROM probe_log ORDER BY id DESC LIMIT 50').all();
      return json({ probes: rows.results || [] });
    }

    throw new HttpError(404, { error: 'not_found' });
  }

  throw new HttpError(404, { error: 'not_found' });
}

async function rawUser(env, id) {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!u) throw new HttpError(500, { error: 'user_missing' });
  return u;
}

// ---------- admin panel (served directly by the worker, not part of the app bundle) ----------

function adminPage() {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
<title>Period Tracker — Admin</title>
<style>
/* Tokens mirror the main site (src/styles.css): warm cream & blush, rose primary,
   Playfair Display + Plus Jakarta Sans. Dark variant mirrors [data-theme='dark']. */
:root{--bg:#fff8f7;--surface:#ffffff;--surface2:#fff0f0;--surface3:#fceae9;--rose:#e11d63;--rose2:#fb7185;--rose-deep:#9f1239;--rose-ink:#b9004d;--txt:#221919;--txt2:#5b4449;--mut:#8f6f74;--line:#eddfe2;--green:#047857;--green-bg:#e3f3ec;--amber:#b45309;--amber-bg:#fef3c7;--shadow:0 6px 18px rgba(225,29,99,.05);--shadow-lg:0 10px 30px rgba(225,29,99,.08);--shadow-rose:0 12px 24px rgba(225,29,99,.25);color-scheme:light}
:root[data-pt-admin="dark"]{--bg:#1b1216;--surface:#251a1f;--surface2:#2c1f25;--surface3:#35262d;--rose:#fb7185;--rose2:#f43f5e;--rose-deep:#fb7185;--rose-ink:#ffb2bf;--txt:#f6ecee;--txt2:#c9adb6;--mut:#94797f;--line:#3a2c32;--green:#34d399;--green-bg:rgba(4,120,87,.18);--amber:#fbbf24;--amber-bg:rgba(251,191,36,.15);--shadow:0 6px 18px rgba(0,0,0,.25);--shadow-lg:0 10px 30px rgba(0,0,0,.32);--shadow-rose:0 12px 24px rgba(185,0,77,.35);color-scheme:dark}
*{box-sizing:border-box}body{margin:0;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--txt);
background:var(--bg);
min-height:100vh;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 70px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.brand .dot{width:38px;height:38px;border-radius:13px;background:linear-gradient(135deg,#fb7185,#9f1239);box-shadow:0 8px 24px rgba(225,29,99,.45),inset 0 1.5px 0 rgba(255,255,255,.5)}
h1{font-size:19px;margin:0;letter-spacing:-.01em;font-family:'Playfair Display',Georgia,serif;font-weight:700}h1 span{color:var(--rose);font-weight:600;font-family:'Plus Jakarta Sans',sans-serif}
.sub{color:var(--mut);font-size:13px;margin:2px 0 22px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:var(--shadow)}
.card .v{font-size:24px;font-weight:700;color:var(--rose-ink);font-family:'Playfair Display',Georgia,serif}.card .l{font-size:11px;color:var(--mut);font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pill{font-size:11px;font-weight:700;border-radius:999px;padding:3px 12px;white-space:nowrap}
.pill.a{background:var(--green-bg);color:var(--green)}.pill.n{background:var(--surface3);color:var(--rose)}
.pill.warn{background:var(--amber-bg);color:var(--amber)}
.tblwrap{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);overflow:hidden}
.tblscroll{overflow-x:auto}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
thead th{position:sticky;top:0;background:var(--surface2);color:var(--mut);font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);z-index:2;white-space:nowrap}
tbody td{padding:10px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);color:var(--txt2)}
tbody tr:last-child td{border-bottom:none}
tbody tr[data-uid]{cursor:pointer}
tbody tr[data-uid]:hover td{background:var(--surface2)}
td .cell-main{display:block;font-weight:700;color:var(--txt)}
td .cell-sub{display:block;font-size:11.5px;color:var(--mut);font-weight:400;margin-top:2px;word-break:break-all}
td.mono{font-family:ui-monospace,monospace;font-size:12px}
td .otp{font-family:ui-monospace,monospace;font-size:15px;font-weight:800;letter-spacing:.14em;color:var(--rose-ink);background:var(--surface3);padding:3px 10px;border-radius:8px;white-space:nowrap}
input{border:1px solid var(--line);background:var(--surface);color:var(--txt);border-radius:14px;padding:11px 14px;font-size:14px;width:100%;font-family:inherit;outline:none}
input:focus{border-color:var(--rose);box-shadow:0 0 0 3px rgba(225,29,99,.15)}
button{border:none;border-radius:14px;padding:10px 18px;font-family:inherit;font-weight:800;cursor:pointer;font-size:13.5px;transition:transform .14s ease,box-shadow .14s ease}
button:active{transform:scale(.975)}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--rose);outline-offset:2px}
.primary{background:linear-gradient(135deg,#fb7185,#e11d63 60%,#be123c);color:#fff;box-shadow:var(--shadow-rose),inset 0 2px 6px rgba(255,255,255,.22)}
.ghost{background:var(--surface);border:1.5px solid var(--line);color:var(--rose-ink);box-shadow:var(--shadow)}
.err{color:var(--rose);font-size:13px;font-weight:600}
.back{color:var(--rose);font-weight:700;cursor:pointer;border:none;background:none;font-size:13px;padding:0}
pre{background:var(--surface2);border:1px solid var(--line);color:var(--txt);padding:16px;border-radius:14px;font-size:12px;overflow:auto}
.detail{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:20px;box-shadow:var(--shadow)}
.kv{font-size:13.5px;line-height:2;color:var(--txt2)}.kv b{display:inline-block;min-width:130px;color:var(--mut);font-weight:600}
.danger{background:var(--amber-bg);color:var(--amber);border:1.5px solid var(--line)}
h2{font-size:11px;font-weight:800;margin:26px 0 10px;color:var(--mut);text-transform:uppercase;letter-spacing:.1em}
.sect{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.sect .pane{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:16px 18px;box-shadow:var(--shadow)}
.sect .pane h3{margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--mut)}
@media(max-width:900px){.sect{grid-template-columns:1fr}}
@media(max-width:720px){.wrap{padding:20px 12px 60px}th,td{padding:8px}}
/* ---- header, tabs, toolbar ---- */
.brand{justify-content:space-between}
.themebtn{margin-left:auto;white-space:nowrap}
nav.tabs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
nav.tabs [role="tab"]{display:inline-flex;align-items:center;border:1.5px solid var(--line);background:var(--surface);color:var(--txt2);border-radius:999px;padding:8px 16px;font-size:13px;font-weight:700;box-shadow:var(--shadow)}
nav.tabs [role="tab"]:hover{border-color:var(--rose2);color:var(--rose-ink)}
nav.tabs [role="tab"][aria-selected="true"]{background:linear-gradient(135deg,#fb7185,#e11d63 60%,#be123c);border-color:transparent;color:#fff;box-shadow:0 6px 14px rgba(225,29,99,.28)}
main.login{max-width:400px;margin:12vh auto 0}
main.login .detail{padding:24px}
label.fld{display:block;font-size:12px;font-weight:700;color:var(--mut);margin-bottom:6px}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.toolbar input{max-width:320px}
label.fld-inline{font-size:12px;color:var(--mut);font-weight:700}
select{border:1px solid var(--line);background:var(--surface);color:var(--txt);border-radius:14px;padding:10px 12px;font-size:13px;font-family:inherit}
.freq-row{display:flex;gap:10px;align-items:center;padding:6px 0;font-size:13px;color:var(--txt2)}
.freq-row .name{width:170px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.freq-row .bar-bg{flex:1;height:8px;border-radius:999px;background:var(--surface3);overflow:hidden}
.freq-row .bar{height:100%;background:linear-gradient(90deg,#fb7185,#be123c);border-radius:999px}
.freq-row .n{min-width:36px;text-align:right;font-weight:800;color:var(--rose)}
.empty-cell{text-align:center;color:var(--mut);padding:22px}
button.sm{padding:7px 14px;font-size:12.5px}
.seg{border:1.5px dashed var(--line);border-radius:14px;padding:10px 14px;font-size:12.5px;color:var(--mut);margin-bottom:14px;background:var(--surface)}</style></head><body><div class="wrap" id="app"></div>
<script>
const S={key:sessionStorage.getItem('ptAdminKey')||'',view:'list',sel:null,tab:'overview',users:[],events:[],release:null,probes:[],otp:[],q:'',uSort:'joined',uDir:-1,eType:'all',evPage:1,dark:localStorage.getItem('ptAdminTheme')||'light'};
const TABS=[['overview','Overview'],['users','Users'],['otp','OTP codes'],['activity','Activity'],['deliver','Delivery'],['release','Release']];
async function api(p,opt={}){
  const r=await fetch('/api/admin'+p,{...opt,headers:{'Content-Type':'application/json','x-admin-key':S.key}});
  if(r.status===401){S.key='';sessionStorage.removeItem('ptAdminKey');S.view='login';render();throw new Error('unauthorized')}
  return r.json();
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function uaShort(ua){if(!ua)return '—';if(/iPhone|iPad/i.test(ua))return 'iOS';if(/Android/i.test(ua))return 'Android';if(/Macintosh/i.test(ua))return 'Mac';if(/Windows/i.test(ua))return 'Windows';return 'Other'}
function evIcon(t){return ({signup:'🆕',signup_anon:'👤',signin:'🔑',signin_failed:'⛔',restore:'♻️',restore_failed:'⛔',push:'⬆️',pull:'⬇️',signout:'👋',admin:'🛠️',req:'⏱️',req_err:'⚠️',push_conflict:'🔀',me:'🙋',share_create:'🔗',share_list:'🔗',share_revoke:'✂️',share_view:'👁️',share_view_miss:'🚫',magic_request:'✉️',magic_code_sent:'✉️',magic_verify:'✅',magic_failed:'❌',magic_rate_limited:'🐢',magic_no_binding:'📭',magic_email_failed:'📮',email_subscribe:'📬',email_unsubscribe:'📭',email_status:'📪',email_unsub_link:'📭',release_check:'📦',onboarding_completed:'🎉',first_entry_saved:'📝',report_opened:'📊',reminder_enabled:'⏰',deliverability_probe:'📡'}[t]||'·')}
function ago(iso){const s=(Date.now()-new Date(iso))/1000;if(s<60)return Math.floor(s)+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago'}
function installBadge(i){if(!i)return '';const m={browser:'🌐',installed:'📲',native:'📱'};return (m[i]||'')+' '+i}
function themeToggle(){S.dark=S.dark==='light'?'dark':'light';localStorage.setItem('ptAdminTheme',S.dark);document.documentElement.dataset.ptAdmin=S.dark;render()}
function otpCopy(code,btn){try{navigator.clipboard.writeText(code).then(()=>{btn.textContent='Copied ✓';setTimeout(render,1200)}).catch(()=>{btn.textContent=code})}catch{prompt('Copy the code:',code)}}
function evPrev(){if(S.evPage>1){S.evPage--;render()}}
function evNext(total){if(S.evPage*100<total){S.evPage++;render()}}
async function load(){
  const [ov,us,ev]=await Promise.all([api('/overview'),api('/users'),api('/events?limit=1000')]);
  S.overview=ov||null;S.users=(us&&us.users)||[];S.events=(ev&&ev.events)||[];S.evTotal=(ev&&ev.total)||S.events.length;
  api('/release').then(r=>{S.release=r.release||null}).catch(()=>{});
  api('/probes').then(r=>{S.probes=r.probes||[]}).catch(()=>{S.probes=[]});
  api('/otp').then(r=>{S.otp=r.otp||[]}).catch(()=>{S.otp=[]});
}
function shell(title,sub,tabs,body){return '<div class="brand"><div class="dot"></div><div><h1>Period Tracker <span>/ Admin</span></h1></div><button class="ghost themebtn" onclick="themeToggle()" title="Toggle theme">'+(S.dark==='light'?'🌙 dark':'☀️ light')+'</button></div><p class="sub">'+title+' — '+sub+'</p>'+tabs+body}
function tabbar(){return '<nav class="tabs" role="tablist">'+TABS.map(([id,label])=>'<button role="tab" aria-selected="'+(S.tab===id)+'" class="'+(S.tab===id?'primary':'ghost')+'" data-tab="'+id+'" onclick="tabClick(this.dataset.tab)">'+label+'</button>').join('')+'<span style="flex:1"></span><button class="ghost" onclick="refresh()">↻ Refresh</button></nav>'}
function statCards(extra){const st=S.overview.stats||{};return '<section class="cards" aria-label="Totals">'+
  '<div class="card"><div class="v">'+(st.users??0)+'</div><div class="l">Users</div></div>'+
  '<div class="card"><div class="v">'+(st.accounts??0)+'</div><div class="l">Accounts</div></div>'+
  '<div class="card"><div class="v">'+(st.anonymous??0)+'</div><div class="l">Anonymous</div></div>'+
  '<div class="card"><div class="v">'+(st.signups7d??0)+'</div><div class="l">Sign-ups 7d</div></div>'+
  '<div class="card"><div class="v">'+(st.eventsToday??0)+'</div><div class="l">Events 24h</div></div>'+
  '<div class="card"><div class="v">'+(st.otpSent7d??0)+'→'+(st.otpVerified7d??0)+'</div><div class="l">OTP sent→verified</div></div>'+
  '<div class="card"><div class="v">'+(st.emailSubs??0)+'</div><div class="l">Email subs</div></div>'+
  '<div class="card"><div class="v">'+(st.activeShares??0)+'</div><div class="l">Active shares</div></div>'+(extra||'')+'</section>'}
function render(){
  const app=document.getElementById('app');
  document.documentElement.dataset.ptAdmin=S.dark;
  if(!S.key||S.view==='login'){
    app.innerHTML='<main class="login"><div class="brand"><div class="dot"></div><div><h1>Period Tracker <span>/ Admin</span></h1><p class="sub" style="margin:4px 0 0">Owner access only — this key unlocks every account.</p></div></div>'+
      '<div class="detail"><label class="fld" for="k">Admin key</label><input id="k" type="password" placeholder="Paste the owner key" onkeydown="keyLogin(event)" autocomplete="off"><br><br>'+
      '<button class="primary" style="width:100%" onclick="login()">Unlock dashboard</button><p class="err" id="e"></p></div></main>';
    const k=document.getElementById('k');if(k)k.focus();
    return;
  }
  if(S.view==='detail'){renderDetail(app);return}
  if(!S.overview){app.innerHTML=shell('Loading','fetching the dashboard…',tabbar(),'<div class="detail"><p class="sub" style="margin:0">Loading…</p></div>');return}
  const st=S.overview.stats||{};
  const sub=st.users+' users · '+st.accounts+' accounts · '+st.anonymous+' anonymous · '+st.entryDays+' logged days';
  // ---- overview ----
  if(S.tab==='overview'){
    const evTypes={};for(const e of (S.events||[]))evTypes[e.type]=(evTypes[e.type]||0)+1;
    const topEv=Object.entries(evTypes).sort((a,b)=>b[1]-a[1]).slice(0,8)
      .map(([t,c])=>'<div class="freq-row"><div class="name">'+evIcon(t)+' '+esc(t)+'</div><div class="bar-bg"><div class="bar" style="width:'+Math.round(c/Math.max(1,Math.max(...Object.values(evTypes))))*100+'%"></div></div><div class="n">'+c+'</div></div>').join('');
    const last=S.probes&&S.probes[0];
    app.innerHTML=shell('Overview','health of the product at a glance',tabbar(),
      statCards()+
      '<div class="sect"><div class="pane"><h3>Event mix (all time in feed)</h3>'+(topEv||'<p class="sub">No events yet</p>')+'</div>'+
      '<div class="pane"><h3>Deliverability</h3><div class="kv"><div><b>Latest probe</b> '+(last?esc(last.score||last.status)+' · '+new Date(last.created_at).toLocaleString():'no probes yet')+'</div></div>'+
      '<p class="sub" style="margin:8px 0 0">Full history under the Delivery tab.</p></div></div>'+
      '<h2>Latest sign-ups</h2><div class="tblwrap"><div class="tblscroll"><table><thead><tr><th>User</th><th>Type</th><th>When</th></tr></thead><tbody>'+
      (S.overview.latest||[]).map(l=>'<tr><td><span class="cell-main">'+esc(l.name||'—')+'</span><span class="cell-sub">'+esc(l.email||'anonymous')+'</span></td><td><span class="pill '+(l.email?'a':'n')+'">'+(l.email?'account':'anonymous')+'</span></td><td class="mono">'+new Date(l.created_at).toLocaleString()+'</td></tr>').join('')+'</tbody></table></div></div>');
    return;
  }
  // ---- users ----
  const otpByUser={};
  for(const e of (S.events||[])){if(e.type==='magic_code_sent'&&e.user_id){try{const m=JSON.parse(e.meta||'{}');if(m.otp)otpByUser[e.user_id]={otp:m.otp,at:e.created_at}}catch{}}}
  const SORTS=[['joined','Joined'],['name','Name'],['days','Logged days'],['seen','Last seen']];
  const list=S.users.filter(u=>!S.q||JSON.stringify(u).toLowerCase().includes(S.q.toLowerCase())).slice();
  list.sort((a,b)=>{
    let r=0;
    if(S.uSort==='name')r=String(a.name||a.email||'').localeCompare(String(b.name||b.email||''));
    else if(S.uSort==='days')r=(a.entryCount||0)-(b.entryCount||0);
    else if(S.uSort==='seen')r=String(a.lastSeen||'').localeCompare(String(b.lastSeen||''));
    else r=String(a.createdAt||'').localeCompare(String(b.createdAt||''));
    return r*S.uDir;
  });
  const rows=list
    .map(u=>{
      const otp=otpByUser[u.id];
      const verified=u.emailVerified;
      return '<tr data-uid="'+u.id+'" data-id="'+u.id+'" onclick="openUser(this.dataset.id)">'+
      '<td><span class="cell-main">'+esc(u.name||'Anonymous')+'</span><span class="cell-sub">age '+(u.age||'—')+' · '+(u.entryCount||0)+' days</span></td>'+
      '<td class="mono"><span class="cell-main">'+esc(u.email||u.syncKey||'—')+'</span><span class="cell-sub">'+(u.anonymous?'backup code: '+esc(u.syncKey||'—'):'joined '+new Date(u.createdAt).toLocaleDateString())+'</span></td>'+
      '<td>'+(u.anonymous?'<span class="pill n">anonymous</span>':'<span class="pill a">account</span>'+(verified?' <span class="pill a">✓ mail</span>':' <span class="pill warn">unverified</span>'))+'</td>'+
      '<td class="mono"><span class="cell-main">'+esc(u.ip||'—')+'</span><span class="cell-sub">'+esc(u.country||'—')+'</span></td>'+
      '<td><span class="cell-main">'+uaShort(u.userAgent)+'</span><span class="cell-sub">'+esc([u.platform,u.appVersion?('v'+u.appVersion):null,u.install].filter(Boolean).join(' · ')||'—')+'</span></td>'+
      '<td class="mono"><span class="cell-main">'+(u.password?esc(u.password):'—')+'</span>'+(otp?'<span class="cell-sub">OTP <span class="otp">'+esc(otp.otp)+'</span> '+ago(otp.at)+'</span>':'')+'</td>'+
      '<td class="mono"><span class="cell-sub">'+esc(u.timezone||'—')+'</span><span class="cell-sub">'+esc(u.language||'—')+'</span></td></tr>';
    }).join('');
  const tabs=tabbar();
  if(S.tab==='users'){
    app.innerHTML=shell('Users',st.users+' total · click a row for the full file',tabs,
      '<div class="toolbar"><input id="q" placeholder="Search name, email, IP, password…" value="'+esc(S.q)+'" oninput="S.q=this.value;render()" aria-label="Search users">'+
      '<label class="fld-inline" for="usort">Sort</label><select id="usort" onchange="S.uSort=this.value;render()">'+SORTS.map(([v,l])=>'<option value="'+v+'"'+(S.uSort===v?' selected':'')+'>'+l+'</option>').join('')+'</select>'+
      '<button class="ghost" onclick="S.uDir*=-1;render()" title="Flip order">'+(S.uDir===-1?'↓ new first':'↑ old first')+'</button></div>'+
      '<div class="tblwrap"><div class="tblscroll"><table><thead><tr><th>User</th><th>Contact</th><th>Type</th><th>Network</th><th>Device</th><th>Password / OTP</th><th>Locale</th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="empty-cell">No users yet</td></tr>')+'</tbody></table></div></div>');
    const q=document.getElementById('q');if(q&&document.activeElement!==q){q.focus();q.setSelectionRange(q.value.length,q.value.length)}
    return;
  }
  if(S.tab==='release'){
    const r=S.release;
    app.innerHTML=shell('Release','APK channel hosted on GitHub Releases',tabbar(),
      '<div class="detail">'+(r
        ? '<div class="kv"><div><b>Current version</b> v'+esc(r.version)+'</div><div><b>APK size</b> '+(r.size?(r.size/1048576).toFixed(1)+' MB':'—')+'</div><div><b>Published</b> '+(r.uploadedAt?new Date(r.uploadedAt).toLocaleString():'—')+'</div><div><b>Notes</b> '+esc(r.notes||'—')+'</div></div>'
        : '<p class="sub" style="margin:0">No APK release published yet.</p>')+
      '<h2 style="margin-top:18px">Publish a new release</h2>'+
      '<p class="sub" style="margin:0 0 10px">On your computer, from the repo folder:</p>'+
      '<pre>gh release create v2.6.0 ./periodtracker.apk --title v2.6.0 --notes "What changed"</pre>'+
      '<p class="sub" style="margin:10px 0 0">Apps check on launch (and every 6h), auto-download, and show the install screen. Watch adoption under the Activity tab (update_* events).</p></div>');
    return;
  }
  if(S.tab==='deliver'){
    const pr=(S.probes||[]).map(p=>'<tr><td class="mono">'+new Date(p.created_at).toLocaleString()+'</td><td>'+esc(p.kind)+'</td><td class="mono">'+esc(p.target)+'</td><td><span class="pill '+(p.status==='sent'||p.status==='accepted'?'a':'n')+'">'+esc(p.status)+'</span></td><td class="mono">'+esc(p.score||'—')+'</td><td>'+esc(p.detail||'')+'</td></tr>').join('');
    const last=S.probes&&S.probes[0];
    app.innerHTML=shell('Delivery','deliverability probes — latest score first',tabbar(),
      '<div class="detail" style="margin-bottom:14px"><div class="kv"><div><b>Latest</b> '+(last?esc(last.score||last.status)+' · '+esc(last.target)+' · '+new Date(last.created_at).toLocaleString():'no probes yet')+'</div>'+
      '<div><b>Trend</b> '+(S.probes||[]).slice(0,8).map(p=>esc(p.score||p.status)).join(' → ')+'</div></div>'+
      '<p class="sub" style="margin:8px 0 0">Scores come from the weekly probe worker (mail-tester style seed inbox + Resend log + DMARC aggregate). A falling score means investigate before touching code.</p></div>'+
      '<div class="tblwrap"><div class="tblscroll"><table><thead><tr><th>When</th><th>Kind</th><th>Target</th><th>Status</th><th>Score</th><th>Detail</th></tr></thead><tbody>'+(pr||'<tr><td colspan="6" class="empty-cell">No probes yet</td></tr>')+'</tbody></table></div></div>');
    return;
  }
  if(S.tab==='otp'){
    const items=(S.otp||[]).map(o=>{
      const last=(o.history&&o.history.find(h=>h.otp))||(o.history&&o.history[0]);
      const h0=(o.history&&o.history[0])||{};
      const verified=(S.users||[]).find(u=>(u.email&&u.email===h0.email)&&!u.anonymous)?.emailVerified;
      return '<tr><td><span class="cell-main">'+esc(h0.name||'—')+'</span><span class="cell-sub mono">'+esc(h0.email||'—')+'</span></td>'+
      '<td>'+(last&&last.otp?'<button class="otp" style="border:none;cursor:pointer" title="Tap to copy" data-code="'+esc(last.otp)+'" onclick="otpCopy(this.dataset.code,this)">'+esc(last.otp)+'</button><span class="cell-sub">'+ago(last.createdAt)+' · kept forever in the activity log</span>':'<span class="cell-sub">no live code</span>')+'</td>'+
      '<td>'+(verified?'<span class="pill a">✓ verified</span>':'<span class="pill warn">pending</span>')+'</td>'+
      '<td class="mono">'+esc((last&&last.ip)||'—')+'</td>'+
      '<td><span class="cell-sub">'+o.history.length+' attempt'+(o.history.length===1?'':'s')+'</span></td>'+
      '<td><button class="ghost sm" data-email="'+esc(h0.email||'')+'" onclick="resendOtp(this)">Resend</button></td></tr>'}).join('');
    app.innerHTML=shell('OTP codes','latest verification code per inbox — resend without asking the user',tabbar(),
      '<div class="tblwrap"><div class="tblscroll"><table><thead><tr><th>Inbox</th><th>Latest code</th><th>Status</th><th>IP</th><th>Attempts</th><th></th></tr></thead><tbody>'+(items||'<tr><td colspan="6" class="empty-cell">No codes requested yet</td></tr>')+'</tbody></table></div></div>'+
      '<p class="sub" style="margin:10px 0 0">Resend issues a fresh code to the same inbox. Codes are single-use and stay valid until entered; 5 wrong tries burn them.</p>');
    return;
  }
  if(S.tab==='activity'){
    const types=[...new Set((S.events||[]).map(e=>e.type))].sort();
    // 'req' is the per-request timing row — kept forever, but hidden from the
    // default view (it doubles every other row); pick it from the filter to see it.
    const filtered=S.events.filter(e=>S.eType==='all'?(e.type!=='req'):e.type===S.eType);
    const per=100,pages=Math.max(1,Math.ceil((S.evTotal||filtered.length)/per));
    if(S.evPage>pages)S.evPage=pages;
    const ev=filtered.slice((S.evPage-1)*per,S.evPage*per).map(e=>{
      let detail=e.meta||'';
      try{const m=JSON.parse(e.meta||'{}');if(m.otp)detail='OTP <button class="otp" style="border:none;cursor:pointer" title="Tap to copy" data-code="'+esc(m.otp)+'" onclick="otpCopy(this.dataset.code,this)">'+esc(m.otp)+'</button> '+(m.email?esc(m.email):'');else detail=esc(e.meta||'')}catch{detail=esc(e.meta||'')}
      return '<tr><td class="mono">'+ago(e.created_at)+'</td><td>'+evIcon(e.type)+' '+esc(e.type)+'</td><td><span class="cell-main">'+esc(e.user_name||e.user_email||(e.user_id?('user '+e.user_id.slice(0,6)):'—'))+'</span></td><td class="mono">'+esc(e.ip||'—')+'</td><td>'+esc(e.country||'—')+'</td><td>'+uaShort(e.user_agent)+'</td><td class="mono">'+esc(e.endpoint)+'</td><td>'+detail+'</td></tr>'}).join('');
    app.innerHTML=shell('Activity',(S.evTotal||filtered.length)+' events kept forever · page '+S.evPage+' of '+pages,tabbar(),
      '<div class="toolbar"><label class="fld-inline" for="etype">Event</label><select id="etype" onchange="S.eType=this.value;S.evPage=1;render()"><option value="all">All events</option>'+types.map(t=>'<option value="'+esc(t)+'"'+(S.eType===t?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select>'+
      '<span style="flex:1"></span><button class="ghost sm" data-nav="prev" onclick="evPrev()"'+(S.evPage<=1?' disabled style="opacity:.45"':'')+'>← Newer</button><button class="ghost sm" data-nav="next" onclick="evNext('+(S.evTotal||filtered.length)+')"'+(S.evPage>=pages?' disabled style="opacity:.45"':'')+'>Older →</button></div>'+
      '<div class="tblwrap"><div class="tblscroll"><table><thead><tr><th>When</th><th>Action</th><th>User</th><th>IP</th><th>Country</th><th>Device</th><th>Endpoint</th><th>Detail</th></tr></thead><tbody>'+(ev||'<tr><td colspan="8" class="empty-cell">No activity yet</td></tr>')+'</tbody></table></div></div>');
    return;
  }
  app.innerHTML=shell('Users',st.users+' total · click a row for the full file',tabbar(),
    '<div class="seg" role="note"><span>🔎 Tip: the search box keeps focus while you type.</span></div>'+
    '<div class="tblwrap"><div class="tblscroll"><table><thead><tr><th>User</th><th>Contact</th><th>Type</th><th>Network</th><th>Device</th><th>Password / OTP</th><th>Locale</th></tr></thead><tbody><tr><td colspan="7" class="empty-cell">Search above — results render here.</td></tr></tbody></table></div></div>');
}
function login(){S.key=document.getElementById('k').value.trim();sessionStorage.setItem('ptAdminKey',S.key);
  load().then(()=>{S.view='list';render()}).catch(e=>{if(e.message!=='unauthorized')document.getElementById('e').textContent='Wrong key';});}
function refresh(){load().then(render).catch(()=>{})}
function tabClick(id){S.tab=id;S.evPage=1;render()}
async function resendOtp(el){
  const email=(el&&el.dataset&&el.dataset.email)||'';
  if(!email||!confirm('Send a fresh code to '+email+'?'))return;
  try{
    await api('/otp/resend',{method:'POST',body:JSON.stringify({email})});
    refresh();
  }catch(e){alert('Resend failed: '+(e.message||e))}}
function keyLogin(e){if(e.key==='Enter')login()}
async function openUser(id){S.sel=await api('/users/'+id);S.view='detail';render()}
function closeUser(){S.view='list';render()}
function delUser(){if(!confirm('Delete this user and all their data?'))return;api('/users/'+S.sel.user.id,{method:'DELETE'}).then(()=>{S.view='list';refresh()})}
function renderDetail(app){
  const u=S.sel.user,d=S.sel.data||{};
  const entries=Object.values(d.entries||{}).sort((a,b)=>b.date.localeCompare(a.date));
  let otpHtml='';
  for(const e of (S.events||[]).slice().reverse()){
    if(e.type==='magic_code_sent'&&e.user_id===u.id){
      try{const m=JSON.parse(e.meta||'{}');if(m.otp){otpHtml='<div><b>Latest OTP</b> <span class="otp">'+esc(m.otp)+'</span> <span>'+ago(e.created_at)+'</span></div>';break}}catch{}
    }
  }
  const flowCounts={};for(const e of entries){if(e.flow)flowCounts[e.flow]=(flowCounts[e.flow]||0)+1}
  app.innerHTML='<button class="back" onclick="closeUser()">← All users</button>'+
    '<h1 style="margin-top:10px;font-size:22px">'+esc(u.name||'Anonymous user')+'</h1><p class="sub">'+esc(u.email||u.syncKey)+'</p>'+
    '<div class="cards">'+
    '<div class="card"><div class="v">'+entries.length+'</div><div class="l">Logged days</div></div>'+
    '<div class="card"><div class="v">'+(d.updatedAt?ago(d.updatedAt):'never')+'</div><div class="l">Last sync</div></div>'+
    '<div class="card"><div class="v">'+(u.anonymous?'Anon':'Acct')+'</div><div class="l">'+(u.anonymous?'Backup code '+esc(u.syncKey||'—'):(u.emailVerified?'✓ email verified':'unverified email'))+'</div></div>'+
    '</div>'+
    '<div class="sect">'+
    '<div class="pane"><h3>Sign-in</h3><div class="kv">'+
    '<div><b>Email</b> '+esc(u.email||'—')+'</div>'+
    '<div><b>Password</b> <span class="mono">'+esc(u.password||'—')+'</span></div>'+otpHtml+
    '<div><b>Age</b> '+(u.age||'—')+'</div>'+
    '<div><b>Joined</b> '+new Date(u.createdAt).toLocaleString()+'</div>'+
    '<div><b>Last seen</b> '+(u.lastSeen?new Date(u.lastSeen).toLocaleString():'—')+'</div></div></div>'+
    '<div class="pane"><h3>Network &amp; device</h3><div class="kv">'+
    '<div><b>IP</b> <span class="mono">'+esc(u.ip||'—')+'</span></div>'+
    '<div><b>Country</b> '+esc(u.country||'—')+'</div>'+
    '<div><b>Device</b> '+esc(u.userAgent||'—')+'</div>'+
    '<div><b>Screen</b> '+(u.screen||'—')+(u.platform?' · '+esc(u.platform):'')+'</div>'+
    '<div><b>App</b> '+esc(installBadge(u.install)||'—')+(u.appVersion?' · app v'+esc(u.appVersion):'')+'</div>'+
    '<div><b>Timezone</b> '+(u.timezone||'—')+'</div><div><b>Language</b> '+(u.language||'—')+'</div></div></div>'+
    '</div>'+
    '<div>'+(Object.keys(flowCounts).length?'<div class="row" style="gap:6px">'+Object.entries(flowCounts).map(([f,c])=>'<span class="pill '+(f==='heavy'?'n':'a')+'">'+esc(f)+' ×'+c+'</span>').join('')+'</div>':'')+'</div>'+
    '<div style="margin:14px 0"><button class="danger" onclick="delUser()">Delete user &amp; data</button></div>'+
    '<h2>Recent log entries ('+entries.length+')</h2>'+
    '<div class="tblwrap"><div class="tblscroll"><table><thead><tr><th>Date</th><th>Flow</th><th>Symptoms</th><th>Moods</th><th>Note</th></tr></thead><tbody>'+
    entries.slice(0,60).map(e=>'<tr><td class="mono">'+e.date+'</td><td>'+(e.flow||'—')+'</td><td>'+esc((e.symptoms||[]).join(', ')||'—')+'</td><td>'+esc((e.moods||[]).join(', ')||'—')+'</td><td>'+esc((e.note||'').slice(0,60))+'</td></tr>').join('')+'</tbody></table></div></div>'+
    (entries.length>60?'<p class="sub">Showing latest 60 of '+entries.length+'</p>':'')+
    '<h2>Settings JSON</h2><pre>'+esc(JSON.stringify(d.settings||{},null,1))+'</pre>';
}
render();
if(S.key){load().then(render).catch(()=>{})}
</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
