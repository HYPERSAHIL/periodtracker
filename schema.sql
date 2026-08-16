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
