-- Period Tracker sync database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_enc TEXT,            -- server-side encryption of the account password
  name TEXT,
  age INTEGER,
  anonymous INTEGER NOT NULL DEFAULT 0,
  sync_key TEXT UNIQUE,        -- restore code for anonymous accounts
  email_verified INTEGER NOT NULL DEFAULT 0, -- 1 once the inbox OTP is confirmed
  country TEXT,                -- from Cloudflare IP geolocation header, never asked
  user_agent TEXT,             -- device type from request header, never asked
  last_ip TEXT,
  screen TEXT,
  dpr REAL,
  timezone TEXT,
  language TEXT,
  platform TEXT,
  app_version TEXT,
  install TEXT,
  cores INTEGER,
  memory INTEGER,
  last_seen TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data (
  user_id TEXT PRIMARY KEY,
  rev INTEGER NOT NULL DEFAULT 0,
  settings TEXT,
  entries TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- read-only partner share links (summary blobs only, never entries)
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);

-- opt-in cycle summary emails (explicit consent only)
CREATE TABLE IF NOT EXISTS email_subs (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  freq TEXT NOT NULL DEFAULT 'weekly',
  level TEXT NOT NULL DEFAULT 'minimal',
  unsub_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

-- email verification OTPs (password stays mandatory; code only proves the inbox)
CREATE TABLE IF NOT EXISTS magic_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_magic_email ON magic_codes(email);

-- weekly deliverability probes (mail-tester score log, admin feed)
CREATE TABLE IF NOT EXISTS probe_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  score TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

-- fire-and-forget request log (auto-created too; kept here for fresh DBs)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  type TEXT NOT NULL,
  endpoint TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);

-- Hourly fleet rollup (written by workers/email-cron on the */15 * * * * trigger).
-- One row per hour so trend questions are a single SELECT, not a raw scan.
CREATE TABLE IF NOT EXISTS fleet_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket TEXT NOT NULL,              -- 'YYYY-MM-DDTHH' (UTC hour)
  sessions INTEGER,                  -- screen_session rows in the hour
  vitals INTEGER,                    -- screen_vitals rows
  p75_lcp_ms REAL,
  p75_inp_ms REAL,
  p75_cls REAL,
  sync_ok INTEGER,
  sync_fail INTEGER,
  sync_fail_pct REAL,
  errors INTEGER,
  esc_visitors INTEGER,              -- sessions on a device below a known fix
  esc_by_bucket TEXT,                -- JSON {"e102327":2,...}
  android_visitors INTEGER,
  detail TEXT,                       -- JSON: percentiles + tails for the admin tab
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_bucket ON fleet_health(bucket);
