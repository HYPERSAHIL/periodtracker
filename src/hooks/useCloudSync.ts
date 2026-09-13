import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { APP_VERSION, DayEntry, Settings } from '../types';
import {
  CloudUser,
  EmailSub,
  SharedSummary,
  ShareRow,
  SyncStatus,
  emailStatus,
  emailSubscribe,
  emailUnsubscribe,
  ensureAnonymousSession,
  loadSession,
  requestEmailCode,
  shareCreate,
  shareList,
  shareRevoke,
  signOut,
  syncCycle,
  verifyEmailCode,
} from '../lib/cloud';
import { deviceInfo } from '../lib/device';

/** Cloud backup state machine: session bootstrap, debounced push/pull, pending flag. */
export function useCloudSync({
  entries,
  settings,
  setEntries,
  setSettings,
}: {
  entries: Record<string, DayEntry>;
  settings: Settings;
  setEntries: Dispatch<SetStateAction<Record<string, DayEntry>>>;
  setSettings: Dispatch<SetStateAction<Settings>>;
}) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pending, setPending] = useState(() => {
    try {
      return localStorage.getItem('pt.pending.v1') === '1';
    } catch {
      return false;
    }
  });
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(() => loadSession()?.user ?? null);
  const cloudRef = useRef<{ token: string | null }>({ token: loadSession()?.token ?? null });
  const syncTimer = useRef<number | null>(null);
  const firstPaint = useRef(true);

  const markPending = (yes: boolean) => {
    setPending(yes);
    try {
      if (yes) localStorage.setItem('pt.pending.v1', '1');
      else localStorage.removeItem('pt.pending.v1');
    } catch {
      /* flag is best-effort */
    }
  };

  const runSync = useCallback(
    async (currentEntries: Record<string, DayEntry>, currentSettings: Settings) => {
      const token = cloudRef.current.token;
      if (!token || !navigator.onLine) {
        setSyncStatus(navigator.onLine ? 'error' : 'offline');
        markPending(true);
        return;
      }
      setSyncStatus('syncing');
      try {
        await syncCycle(token, currentEntries, currentSettings, (m) => {
          if (m.changed) {
            if (m.entries) setEntries(m.entries);
            if (m.settings) setSettings(m.settings);
          }
        });
        setSyncStatus('synced');
        markPending(false);
      } catch {
        setSyncStatus('error');
        markPending(true);
      }
    },
    [setEntries, setSettings]
  );

  // keep latest data reachable for event-driven syncs
  const entriesRef = useRef(entries);
  const settingsRef = useRef(settings);
  useEffect(() => {
    entriesRef.current = entries;
    settingsRef.current = settings;
  });

  // bootstrap: anonymous session (sync works without sign-in), then initial sync
  useEffect(() => {
    if (!settings.onboarded) return;
    let cancelled = false;
    (async () => {
      setSyncStatus('connecting');
      try {
        if (!cloudRef.current.token) {
          const s = await ensureAnonymousSession(deviceInfo(APP_VERSION));
          if (cancelled) return;
          cloudRef.current.token = s.token;
          setCloudUser(s.user);
        }
        await runSync(entriesRef.current, settingsRef.current);
      } catch {
        if (!cancelled) setSyncStatus('error');
      }
    })();
    const onOnline = () => runSync(entriesRef.current, settingsRef.current);
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [settings.onboarded, runSync]);

  // debounced auto-sync on every change (skips the very first paint)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false;
      return;
    }
    if (!settings.onboarded || !cloudRef.current.token) return;
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => runSync(entriesRef.current, settingsRef.current), 2500);
  }, [entries, settings, runSync, settings.onboarded]);

  const signOutCloud = useCallback(async () => {    const token = cloudRef.current.token;
    if (token) await signOut(token);
    cloudRef.current.token = null;
    setCloudUser(null);
    try {
      const s = await ensureAnonymousSession();
      cloudRef.current.token = s.token;
      setCloudUser(s.user);
      await runSync(entriesRef.current, settingsRef.current);
    } catch {
      setSyncStatus('error');
    }
  }, [runSync]);

  const adoptSession = useCallback(
    (s: { token: string; user: CloudUser } | null) => {
      cloudRef.current.token = s?.token ?? null;
      setCloudUser(s?.user ?? null);
      if (s?.token) runSync(entriesRef.current, settingsRef.current);
    },
    [runSync]
  );

  const shareApi = {
    create: async (summary: SharedSummary, days = 30) => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      return shareCreate(t, summary, days);
    },
    list: async (): Promise<ShareRow[]> => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      return shareList(t);
    },
    revoke: async (shareToken: string) => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      return shareRevoke(t, shareToken);
    },
  };

  const emailApi = {
    status: async (): Promise<{ sub: EmailSub | null }> => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      return emailStatus(t);
    },
    subscribe: async (input: { email: string; freq: 'weekly' | 'monthly'; level: 'minimal' | 'full' }) => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      return emailSubscribe(t, input);
    },
    unsubscribe: async () => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      return emailUnsubscribe(t);
    },
  };

  const otpApi = {
    request: async (): Promise<{ verified: boolean }> => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      return requestEmailCode(t);
    },
    verify: async (code: string): Promise<CloudUser> => {
      const t = cloudRef.current.token;
      if (!t) throw new Error('no session');
      const user = await verifyEmailCode(t, code);
      setCloudUser(user);
      return user;
    },
  };

  return { syncStatus, pending, cloudUser, setCloudUser, adoptSession, runSync, signOutCloud, shareApi, emailApi, otpApi };
}
