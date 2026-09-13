-- Period Tracker sync database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,          -- PBKDF2(server_salt, client_auth_hash)
  password_salt TEXT,
  name TEXT,
  age INTEGER,
  anonymous INTEGER NOT NULL DEFAULT 0,
  sync_key TEXT UNIQUE,        -- restore code for anonymous accounts
  email_verified INTEGER NOT NULL DEFAULT 0, -- 1 once the inbox OTP is confirmed
  country TEXT,                -- from Cloudflare IP geolocation header, never asked
  user_agent TEXT,             -- device type from request header, never asked
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
