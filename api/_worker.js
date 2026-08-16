/**
 * Period Tracker sync + admin API — Cloudflare Pages Function (advanced mode).
 * /api/* is JSON API; /admin serves the owner's admin panel; everything else
 * falls through to static assets.
 *
 * Passwords are stored encrypted-at-rest with a key held only by this Worker
 * (env.PT_ENC_KEY), so the admin panel can recover them while a raw database
 * export alone cannot. Admin access requires env.PT_ADMIN_KEY.
 */

const SESSION_DAYS = 90;
const MAX_BODY = 6_000_000;
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const J = { 'content-type': 'application/json; charset=utf-8' };
const te = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/admin' || url.pathname === '/admin/') return adminPage();
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
        metaInfo ? JSON.stringify(metaInfo).slice(0, 500) : null,
        new Date().toISOString()
      )
      .run();
    if (Math.random() < 0.02) {
      await env.DB.prepare("DELETE FROM events WHERE created_at < datetime('now', '-90 days')").run();
    }
  } catch {
    /* logging failures are silent by design */
  }
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

function requireAdmin(env, request) {
  const key = request.headers.get('x-admin-key') || '';
  if (!env.PT_ADMIN_KEY || !safeEqual(key, env.PT_ADMIN_KEY)) {
    throw new HttpError(401, { error: 'unauthorized' });
  }
}

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (method === 'GET' && path === '/api/health') return json({ ok: true, service: 'period-tracker-sync' });

  // --- anonymous bootstrap ---------------------------------------------------
  if (method === 'POST' && path === '/api/anon') {
    const b = await readBody(request);
    const id = await createUser(env, request, { device: b.device });
    const token = await newSession(env, id);
    const u = await rawUser(env, id);
    await logEvent(env, request, id, 'signup_anon', { device: b.device });
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
        }
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(anon.id).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(anon.id).run();
      }
    }

    const token = await newSession(env, id);
    const u = await rawUser(env, id);
    await logEvent(env, request, id, 'signup', { email });
    return json({ token, user: publicUser(u) }, 201);
  }

  // --- sign in ---------------------------------------------------------------------
  if (method === 'POST' && path === '/api/signin') {
    const b = await readBody(request);
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    const u = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND anonymous = 0').bind(email).first();
    if (!u || !u.password_enc) {
      await logEvent(env, request, null, 'signin_failed', { email, reason: 'unknown_user' });
      throw new HttpError(401, { error: 'invalid_credentials' });
    }
    if (encSecretMissing(env)) throw new HttpError(500, { error: 'server_not_configured' });
    const stored = await decryptPassword(env, u.password_enc);
    if (!safeEqual(stored, password)) {
      await logEvent(env, request, u.id, 'signin_failed', { email });
      throw new HttpError(401, { error: 'invalid_credentials' });
    }
    await touchUser(env, request, u.id, b.device);
    const token = await newSession(env, u.id);
    await logEvent(env, request, u.id, 'signin', { email });
    return json({ token, user: publicUser(await rawUser(env, u.id)) });
  }

  // --- restore by backup code --------------------------------------------------------
  if (method === 'POST' && path === '/api/restore') {
    const b = await readBody(request);
    const key = String(b.key || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(key)) throw new HttpError(400, { error: 'invalid_key' });
    const u = await env.DB.prepare('SELECT * FROM users WHERE sync_key = ?').bind(key).first();
    if (!u) {
      await logEvent(env, request, null, 'restore_failed', {});
      throw new HttpError(404, { error: 'key_not_found' });
    }
    const token = await newSession(env, u.id);
    await touchUser(env, request, u.id);
    await logEvent(env, request, u.id, 'restore', {});
    return json({ token, user: publicUser(u) });
  }

  // --- session scoped -----------------------------------------------------------------------
  if (method === 'POST' && path === '/api/signout') {
    const auth = request.headers.get('authorization') || '';
    const m = auth.match(/^Bearer ([a-f0-9]{64})$/);
    if (m) {
      const sess = await env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').bind(hex(await sha256(m[1]))).first();
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hex(await sha256(m[1]))).run();
      await logEvent(env, request, sess ? sess.user_id : null, 'signout', {});
    }
    return json({ ok: true });
  }

  if (method === 'GET' && path === '/api/me') {
    const u = await userFromToken(env, request);
    const d = await getData(env, u.id);
    await touchUser(env, request, u.id);
    return json({ user: publicUser(u), rev: d.rev, updatedAt: d.updatedAt });
  }

  if (method === 'GET' && path === '/api/data') {
    const u = await userFromToken(env, request);
    await touchUser(env, request, u.id);
    await logEvent(env, request, u.id, 'pull', {});
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
      await env.DB.prepare('INSERT INTO data (user_id, rev, settings, entries, updated_at) VALUES (?, 1, ?, ?, ?)')
        .bind(u.id, settings, entries, new Date().toISOString()).run();
      await touchUser(env, request, u.id);
      await logEvent(env, request, u.id, 'push', { rev: 1, fresh: true });
      return json({ rev: 1 });
    }
    if (current.rev !== baseRev) {
      const d = await getData(env, u.id);
      return json({ conflict: true, ...d }, 409);
    }
    await env.DB.prepare('UPDATE data SET rev = rev + 1, settings = ?, entries = ?, updated_at = ? WHERE user_id = ?')
      .bind(settings, entries, new Date().toISOString(), u.id).run();
    await touchUser(env, request, u.id);
    await logEvent(env, request, u.id, 'push', { rev: current.rev + 1 });
    return json({ rev: current.rev + 1 });
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
           (SELECT COALESCE(SUM(json_array_length(json_each.value)), 0) FROM data, json_each(data.entries)) AS entryDays`
      ).first();
      const latest = await env.DB.prepare('SELECT name, email, created_at FROM users ORDER BY created_at DESC LIMIT 5').all();
      return json({ stats: r, latest: latest.results });
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
    }

    if (method === 'GET' && path === '/api/admin/events') {
      const rows = await env.DB.prepare(
        `SELECT e.*, u.name AS user_name, u.email AS user_email
         FROM events e LEFT JOIN users u ON u.id = e.user_id
         ORDER BY e.id DESC LIMIT 200`
      ).all();
      return json({ events: rows.results });
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
<title>Period Tracker — Admin</title>
<style>
:root{--rose:#fb7185;--rose2:#e11d63;--ink:#0d0a0d;--surf:rgba(255,255,255,.045);--surf2:rgba(255,255,255,.08);--line:rgba(255,255,255,.1);--txt:#f4ecef;--mut:#a08a92}
*{box-sizing:border-box}body{margin:0;font-family:'Inter',-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--txt);
background:radial-gradient(1100px 500px at 85% -10%,rgba(225,29,99,.22),transparent 60%),radial-gradient(900px 500px at -10% 25%,rgba(190,18,60,.12),transparent 55%),#120d11;
min-height:100vh;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:28px 20px 70px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:4px}
.brand .dot{width:38px;height:38px;border-radius:13px;background:linear-gradient(135deg,#fb7185,#9f1239);box-shadow:0 8px 24px rgba(225,29,99,.45),inset 0 1.5px 0 rgba(255,255,255,.5)}
h1{font-size:19px;margin:0;letter-spacing:-.01em}h1 span{color:var(--rose);font-weight:400}
.sub{color:var(--mut);font-size:13px;margin:2px 0 22px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.card{background:var(--surf);border:1px solid var(--line);border-radius:18px;padding:16px;backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.07)}
.card .v{font-size:24px;font-weight:800;color:var(--rose)}.card .l{font-size:11px;color:var(--mut);font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-top:2px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pill{font-size:11px;font-weight:700;border-radius:99px;padding:2px 10px}
.pill.a{background:rgba(4,120,87,.18);color:#34d399}.pill.n{background:rgba(225,29,99,.16);color:var(--rose)}
table{width:100%;border-collapse:separate;border-spacing:0;background:var(--surf);border:1px solid var(--line);border-radius:18px;overflow:hidden;font-size:13px;backdrop-filter:blur(14px)}
thead th{position:sticky;top:0;background:#1c1419;color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);z-index:2}
th,td{padding:9px 12px;text-align:left;white-space:nowrap}
tbody td{border-bottom:1px solid rgba(255,255,255,.05)}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:var(--surf2);cursor:pointer}
input{border:1px solid var(--line);background:var(--surf2);color:var(--txt);border-radius:12px;padding:11px 14px;font-size:14px;width:100%;font-family:inherit;outline:none}
input:focus{border-color:var(--rose)}
button{border:none;border-radius:12px;padding:10px 18px;font-family:inherit;font-weight:700;cursor:pointer;font-size:13.5px}
.primary{background:linear-gradient(135deg,#fb7185,#be123c);color:#fff;box-shadow:0 8px 20px rgba(225,29,99,.35)}
.ghost{background:var(--surf2);border:1px solid var(--line);color:var(--txt)}
.pw{font-family:ui-monospace,monospace;background:rgba(225,29,99,.14);color:#fda4af;padding:2px 8px;border-radius:8px;cursor:pointer}
.err{color:#fda4af;font-size:13px;font-weight:600}
.back{color:var(--rose);font-weight:700;cursor:pointer;border:none;background:none;font-size:13px;padding:0}
pre{background:#0a070a;border:1px solid var(--line);color:#f4ecef;padding:16px;border-radius:14px;font-size:12px;overflow:auto}
.detail{background:var(--surf);border:1px solid var(--line);border-radius:18px;padding:20px;backdrop-filter:blur(14px)}
.kv{font-size:13.5px;line-height:2}.kv b{display:inline-block;min-width:130px;color:var(--mut);font-weight:600}
.danger{background:rgba(220,38,38,.14);color:#fca5a5;border:1px solid rgba(220,38,38,.3)}
h2{font-size:13px;margin:26px 0 10px;color:var(--mut);text-transform:uppercase;letter-spacing:.08em}
@media(max-width:720px){.wrap{padding:20px 12px 60px}th,td{padding:7px 8px;font-size:12px}}
</style></head><body><div class="wrap" id="app"></div>
<script>
const S={key:sessionStorage.getItem('ptAdminKey')||'',view:'list',sel:null,tab:'users',users:[],events:[],q:''};
async function api(p,opt={}){
  const r=await fetch('/api/admin'+p,{...opt,headers:{'Content-Type':'application/json','x-admin-key':S.key}});
  if(r.status===401){S.key='';sessionStorage.removeItem('ptAdminKey');S.view='login';render();throw new Error('unauthorized')}
  return r.json();
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function uaShort(ua){if(!ua)return '—';if(/iPhone|iPad/i.test(ua))return 'iOS';if(/Android/i.test(ua))return 'Android';if(/Macintosh/i.test(ua))return 'Mac';if(/Windows/i.test(ua))return 'Windows';return 'Other'}
function evIcon(t){return ({signup:'🆕',signup_anon:'👤',signin:'🔑',signin_failed:'⛔',restore:'♻️',restore_failed:'⛔',push:'⬆️',pull:'⬇️',signout:'👋',admin:'🛠️'}[t]||'·')}
function ago(iso){const s=(Date.now()-new Date(iso))/1000;if(s<60)return Math.floor(s)+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago'}
function installBadge(i){if(!i)return '';const m={browser:'🌐',installed:'📲',native:'📱'};return (m[i]||'')+' '+i}
async function load(){
  const [ov,us,ev]=await Promise.all([api('/overview'),api('/users'),api('/events')]);
  S.overview=ov;S.users=us.users;S.events=ev.events||[];
}
function render(){
  const app=document.getElementById('app');
  if(!S.key||S.view==='login'){
    app.innerHTML='<div class="brand"><div class="dot"></div><h1>Period Tracker <span>/ Admin</span></h1></div><p class="sub">Owner access only</p>'+
      '<div style="max-width:340px"><input id="k" type="password" placeholder="Admin key" onkeydown="keyLogin(event)"><br><br>'+
      '<button class="primary" onclick="login()">Unlock</button><p class="err" id="e"></p></div>';
    return;
  }
  if(S.view==='detail'){renderDetail(app);return}
  const st=S.overview.stats||{};
  const rows=S.users.filter(u=>!S.q||JSON.stringify(u).toLowerCase().includes(S.q.toLowerCase()))
    .map(u=>'<tr onclick="openUser(\\''+u.id+'\\')"><td>'+esc(u.name||'—')+'</td><td>'+esc(u.email||'')+'</td><td>'+(u.age||'—')+
      '</td><td><span class="pill '+(u.anonymous?'n':'a')+'">'+(u.anonymous?'anonymous':'account')+'</span></td><td>'+esc(u.country||'—')+
      '</td><td>'+uaShort(u.userAgent)+'</td><td>'+(u.password?'<span class="pw" title="click to hide" onclick="revealPw(this)">••••••</span><span style="display:none">'+esc(u.password)+'</span>':'—')+
      '</td><td>'+(u.entryCount||0)+'</td><td>'+new Date(u.createdAt).toLocaleDateString()+'</td></tr>').join('');
  const tabs='<div class="row" style="margin-bottom:14px;gap:6px">'+
    '<button class="'+(S.tab==='users'?'primary':'ghost')+'" onclick="tabClick(0)">Users</button>'+
    '<button class="'+(S.tab==='activity'?'primary':'ghost')+'" onclick="tabClick(1)">Activity</button>'+
    '<span style="flex:1"></span><button class="ghost" onclick="refresh()">Refresh</button></div>';
  if(S.tab==='activity'){
    const ev=S.events.map(e=>'<tr><td>'+ago(e.created_at)+'</td><td>'+evIcon(e.type)+' '+esc(e.type)+'</td><td>'+esc(e.user_name||e.user_email||(e.user_id?('user '+e.user_id.slice(0,6)):'—'))+'</td><td>'+esc(e.ip||'—')+'</td><td>'+esc(e.country||'—')+'</td><td>'+uaShort(e.user_agent)+'</td><td>'+esc(e.endpoint)+'</td><td>'+esc(e.meta||'')+'</td></tr>').join('');
    app.innerHTML='<div class="brand"><div class="dot"></div><h1>Period Tracker <span>/ Admin</span></h1></div><p class="sub">'+st.users+' users · '+st.accounts+' accounts · '+st.anonymous+' anonymous · '+st.entryDays+' logged days</p>'+tabs+
      '<table><thead><tr><th>When</th><th>Action</th><th>User</th><th>IP</th><th>Country</th><th>Device</th><th>Endpoint</th><th>Detail</th></tr></thead><tbody>'+(ev||'<tr><td colspan="8" style="text-align:center;color:var(--muted)">No activity yet</td></tr>')+'</tbody></table>';
    return;
  }
  app.innerHTML='<div class="brand"><div class="dot"></div><h1>Period Tracker <span>/ Admin</span></h1></div><p class="sub">'+st.users+' users · '+st.accounts+' accounts · '+st.anonymous+' anonymous · '+st.entryDays+' logged days</p>'+tabs+
    '<div class="row" style="margin-bottom:14px"><input id="q" placeholder="Search users…" value="'+esc(S.q)+'" oninput="S.q=this.value;render()" style="max-width:280px"></div>'+
    '<table><thead><tr><th>Name</th><th>Email</th><th>Age</th><th>Type</th><th>Country</th><th>IP</th><th>Device</th><th>Install</th><th>Password</th><th>Days</th><th>Joined</th></tr></thead><tbody>'+(rows||'<tr><td colspan="11" style="text-align:center;color:var(--muted)">No users yet</td></tr>')+'</tbody></table>'+
    '<h2>Latest sign-ups</h2><table><thead><tr><th>Name</th><th>Email</th><th>When</th></tr></thead><tbody>'+
    (S.overview.latest||[]).map(l=>'<tr><td>'+esc(l.name||'—')+'</td><td>'+esc(l.email||'anonymous')+'</td><td>'+new Date(l.created_at).toLocaleString()+'</td></tr>').join('')+'</tbody></table>';
}
function login(){S.key=document.getElementById('k').value.trim();sessionStorage.setItem('ptAdminKey',S.key);
  load().then(()=>{S.view='list';render()}).catch(e=>{if(e.message!=='unauthorized')document.getElementById('e').textContent='Wrong key';});}
function refresh(){load().then(render).catch(()=>{})}
function tabClick(i){S.tab=i===0?'users':'activity';render()}
function keyLogin(e){if(e.key==='Enter')login()}
function revealPw(el){el.style.display='none';el.nextElementSibling.style.display=''}
async function openUser(id){S.sel=await api('/users/'+id);S.view='detail';render()}
function closeUser(){S.view='list';render()}
function delUser(){if(!confirm('Delete this user and all their data?'))return;api('/users/'+S.sel.user.id,{method:'DELETE'}).then(()=>{S.view='list';refresh()})}
function renderDetail(app){
  const u=S.sel.user,d=S.sel.data||{};
  const entries=Object.values(d.entries||{}).sort((a,b)=>b.date.localeCompare(a.date));
  app.innerHTML='<button class="back" onclick="closeUser()">← All users</button>'+
    '<h1 style="margin-top:10px;font-size:22px">'+esc(u.name||'Anonymous user')+'</h1><p class="sub">'+esc(u.email||u.syncKey)+'</p>'+
    '<div class="detail"><div class="kv">'+
    '<div><b>Type</b> '+(u.anonymous?'Anonymous (code '+esc(u.syncKey)+')':'Account')+'</div>'+
    '<div><b>Password</b> <span class="pw" onclick="this.textContent=this.dataset.p" data-p="'+esc(u.password||'')+'">'+(u.password?'reveal':'—')+'</span></div>'+
    '<div><b>Age</b> '+(u.age||'—')+'</div><div><b>Country</b> '+(u.country||'—')+'</div>'+
    '<div><b>IP address</b> '+(u.ip||'—')+'</div><div><b>Device</b> '+esc(u.userAgent||'—')+'</div>'+
    '<div><b>Screen</b> '+(u.screen||'—')+(u.platform?' · '+esc(u.platform):'')+'</div>'+
    '<div><b>Install</b> '+esc(installBadge(u.install)||'—')+(u.appVersion?' · app v'+esc(u.appVersion):'')+'</div>'+
    '<div><b>Timezone</b> '+(u.timezone||'—')+'</div><div><b>Language</b> '+(u.language||'—')+'</div>'+
    '<div><b>Last seen</b> '+(u.lastSeen?new Date(u.lastSeen).toLocaleString():'—')+'</div>'+
    '<div><b>Joined</b> '+new Date(u.createdAt).toLocaleString()+'</div>'+
    '<div><b>Last sync</b> '+(d.updatedAt?new Date(d.updatedAt).toLocaleString():'never')+'</div>'+
    '<div><b>Logged days</b> '+entries.length+'</div></div>'+
    '<div style="margin-top:14px"><button class="danger" onclick="delUser()">Delete user &amp; data</button></div></div>'+
    '<h2>Recent log entries ('+entries.length+')</h2>'+
    '<table><thead><tr><th>Date</th><th>Flow</th><th>Symptoms</th><th>Moods</th><th>Note</th></tr></thead><tbody>'+
    entries.slice(0,60).map(e=>'<tr><td>'+e.date+'</td><td>'+(e.flow||'—')+'</td><td>'+esc((e.symptoms||[]).join(', ')||'—')+'</td><td>'+esc((e.moods||[]).join(', ')||'—')+'</td><td>'+esc((e.note||'').slice(0,60))+'</td></tr>').join('')+'</tbody></table>'+
    (entries.length>60?'<p class="sub">Showing latest 60 of '+entries.length+'</p>':'')+
    '<h2>Settings JSON</h2><pre>'+esc(JSON.stringify(d.settings||{},null,1))+'</pre>';
}
render();
if(S.key){load().then(render).catch(()=>{})}
</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
