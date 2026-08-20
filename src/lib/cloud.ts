/**
 * Cloud sync client. Local-first: the device copy is always fully usable;
 * sync pulls the server copy, merges by per-field updatedAt (last write wins),
 * and pushes the merged result with optimistic-concurrency checks.
 */

import { DayEntry, Settings } from '../types';
import { DeviceInfo } from './device';
import { apiUrl } from './native';

const CLOUD_KEY = 'pt.cloud.v1';

export type SyncStatus = 'idle' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';

export interface CloudUser {
  id: string;
  email: string | null;
  name: string | null;
  age: number | null;
  anonymous: boolean;
  syncKey: string;
  createdAt: string;
}

export interface CloudSession {
  token: string;
  user: CloudUser;
}

export function loadSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(CLOUD_KEY);
    return raw ? (JSON.parse(raw) as CloudSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: CloudSession | null): void {
  if (s) localStorage.setItem(CLOUD_KEY, JSON.stringify(s));
  else localStorage.removeItem(CLOUD_KEY);
}

async function api(path: string, body?: unknown, token?: string): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(apiUrl(`/api/${path}`), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  return { ok: res.ok, status: res.status, data };
}

export async function ensureAnonymousSession(device?: DeviceInfo): Promise<CloudSession> {
  const existing = loadSession();
  if (existing) return existing;
  const r = await api('anon', { device });
  if (!r.ok) throw new Error('anon bootstrap failed');
  const s = { token: r.data.token, user: r.data.user } as CloudSession;
  saveSession(s);
  return s;
}

export async function signUp(input: {
  name: string;
  age: number;
  email: string;
  password: string;
  anonKey?: string;
  device?: DeviceInfo;
}): Promise<CloudSession> {
  const r = await api('signup', input);
  if (!r.ok) {
    if (r.data?.error === 'email_taken') throw new Error('That email already has an account. Try signing in.');
    if (r.data?.error === 'invalid_age') throw new Error('Please enter a valid age.');
    if (r.data?.error === 'weak_password') throw new Error('Please use at least 6 characters for your password.');
    throw new Error('Sign-up failed. Please try again.');
  }
  const s = { token: r.data.token, user: r.data.user } as CloudSession;
  saveSession(s);
  return s;
}

export async function signIn(email: string, password: string): Promise<CloudSession> {
  const r = await api('signin', { email, password });
  if (!r.ok) throw new Error('Wrong email or password.');
  const s = { token: r.data.token, user: r.data.user } as CloudSession;
  saveSession(s);
  return s;
}

export async function restoreWithKey(key: string): Promise<CloudSession> {
  const r = await api('restore', { key });
  if (!r.ok) {
    if (r.data?.error === 'key_not_found') throw new Error('That backup code was not found. Check it and try again.');
    throw new Error('Restore failed.');
  }
  const s = { token: r.data.token, user: r.data.user } as CloudSession;
  saveSession(s);
  return s;
}

export async function signOut(token: string): Promise<void> {
  await api('signout', {}, token).catch(() => undefined);
  saveSession(null);
}

// ---------- merge ----------

export function mergeEntries(
  local: Record<string, DayEntry>,
  remote: Record<string, DayEntry> | null
): Record<string, DayEntry> {
  const out: Record<string, DayEntry> = { ...(remote ?? {}) };
  for (const [date, e] of Object.entries(local)) {
    const r = out[date];
    if (!r || (e.updatedAt ?? 0) >= (r.updatedAt ?? 0)) out[date] = e;
  }
  return out;
}

export function mergeSettings(local: Settings, remote: Settings | null): Settings {
  if (!remote) return local;
  return (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0) ? local : remote;
}

// ---------- sync cycle ----------

export interface SyncResult {
  entries?: Record<string, DayEntry>;
  settings?: Settings;
  changed: boolean;
}

export async function syncCycle(
  token: string,
  entries: Record<string, DayEntry>,
  settings: Settings,
  applyMerged: (m: SyncResult) => void
): Promise<void> {
  const pulled = await api('data', undefined, token);
  if (pulled.status === 401) throw new Error('session_expired');
  if (!pulled.ok) throw new Error('pull_failed');

  const remoteEntries = pulled.data.entries;
  const remoteSettings = pulled.data.settings;
  const mergedEntries = mergeEntries(entries, remoteEntries);
  const mergedSettings = mergeSettings(settings, remoteSettings);
  const localChanged =
    JSON.stringify(mergedEntries) !== JSON.stringify(remoteEntries ?? {}) ||
    JSON.stringify({ ...mergedSettings }) !== JSON.stringify(remoteSettings ?? null);
  if (localChanged) {
    applyMerged({ entries: mergedEntries, settings: mergedSettings, changed: true });
  }

  const push = await api('data', { baseRev: pulled.data.rev, settings: mergedSettings, entries: mergedEntries }, token);
  if (push.status === 409 && !push.ok) {
    const retry = await api('data', undefined, token);
    if (!retry.ok) throw new Error('conflict_retry_failed');
    const m2e = mergeEntries(entries, retry.data.entries);
    const m2s = mergeSettings(settings, retry.data.settings);
    applyMerged({ entries: m2e, settings: m2s, changed: true });
    const push2 = await api('data', { baseRev: retry.data.rev, settings: m2s, entries: m2e }, token);
    if (!push2.ok) throw new Error('push_conflict');
  } else if (!push.ok) {
    throw new Error('push_failed');
  }
}
