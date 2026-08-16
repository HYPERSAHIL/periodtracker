/**
 * APK auto-updater (native only; the web/PWA updates via its service worker).
 *
 * Flow — check in background → auto-download → non-closable install overlay.
 * First install on a device walks the Android "install unknown apps" permission
 * trip; once the OS grants it (queryable via the plugin), future updates go
 * straight to the installer with no prompt. Every step is logged server-side
 * and lands in the owner's admin Activity feed.
 */

import ApkInstaller from 'pt-apk-installer';
import { apiUrl, isNative } from './native';
import { APP_VERSION } from '../types';

export type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'need_permission';

export interface UpdateState {
  stage: UpdateStage;
  version: string | null;
  progress: number; // 0..100
  sizeBytes: number | null;
  notes: string | null;
}

const PERM_FLAG = 'pt.update.permKnown';

type Listener = (s: UpdateState) => void;

class UpdateManager {
  state: UpdateState = { stage: 'idle', version: null, progress: 0, sizeBytes: null, notes: null };
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private async logEvent(type: string, meta: Record<string, unknown>) {
    try {
      await fetch(apiUrl('/api/event'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, meta: { ...meta, appVersion: APP_VERSION } }),
      });
    } catch {
      /* update logging must never break the flow */
    }
  }

  /** Compare dotted versions: returns true when remote is newer. */
  private isNewer(remote: string, local: string): boolean {
    const p = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
    const a = p(remote);
    const b = p(local);
    for (let i = 0; i < 3; i++) {
      if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
      if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
    }
    return false;
  }

  /** Boot-time check: detect completed version change + kick background cycle. */
  async start() {
    if (!isNative()) return;

    const last = localStorage.getItem('pt.lastVersion');
    if (last && last !== APP_VERSION) {
      // the app restarted on a new version → previous update installed fine
      localStorage.setItem('pt.lastVersion', APP_VERSION);
      localStorage.setItem(PERM_FLAG, '1');
      await this.logEvent('update_installed', { from: last, to: APP_VERSION });
    } else if (!last) {
      localStorage.setItem('pt.lastVersion', APP_VERSION);
    }

    ApkInstaller.addListener?.('downloadProgress', (s: { progress: number }) => {
      if (this.state.stage === 'downloading') this.set({ progress: Math.min(100, s.progress) });
    });

    await this.check();
    // background re-check every 6 hours while the app is open
    window.setInterval(() => this.check(), 6 * 3600 * 1000);
  }

  async check(): Promise<void> {
    if (!isNative()) return;
    this.set({ stage: 'checking' });
    try {
      const res = await fetch(apiUrl('/api/app/latest'));
      if (!res.ok) throw new Error('bad status');
      const rel = await res.json();
      if (!rel.version || !this.isNewer(rel.version, APP_VERSION)) {
        this.set({ stage: 'idle', version: null });
        return;
      }
      this.set({ stage: 'available', version: rel.version, sizeBytes: rel.size ?? null, notes: rel.notes ?? null });
      await this.logEvent('update_available', { newVersion: rel.version, size: rel.size ?? null });
      // auto-download as requested — the overlay appears once it's ready
      await this.download(rel.version, rel.apkUrl);
    } catch {
      this.set({ stage: 'idle' });
    }
  }

  private async download(version: string, apkUrl: string): Promise<void> {
    this.set({ stage: 'downloading', progress: 0 });
    try {
      const r = await ApkInstaller.download({ url: apkUrl });
      this.set({ stage: 'ready', progress: 100, sizeBytes: r.size });
      await this.logEvent('update_downloaded', { version, size: r.size });
    } catch (e) {
      // failed download falls back to idle — next background check retries
      this.set({ stage: 'idle' });
      await this.logEvent('update_download_failed', { version, error: String(e).slice(0, 120) });
    }
  }

  /** The overlay's Install button. Handles the first-time permission trip. */
  async installPressed(): Promise<void> {
    try {
      const { permitted } = await ApkInstaller.isInstallPermitted();
      if (!permitted) {
        const firstTime = !localStorage.getItem(PERM_FLAG);
        this.set({ stage: 'need_permission' });
        await this.logEvent('update_perm_prompt', { firstTime });
        await ApkInstaller.openInstallPermissionSettings();
        return; // user enables it in Settings, returns, presses Install again
      }
      localStorage.setItem(PERM_FLAG, '1');
      this.set({ stage: 'installing' });
      await this.logEvent('update_install_started', { version: this.state.version });
      await ApkInstaller.install();
      // if the user cancels the system installer and comes back, allow retry
      window.setTimeout(() => {
        if (this.state.stage === 'installing') this.set({ stage: 'ready' });
      }, 8000);
    } catch (e) {
      this.set({ stage: 'ready' });
      await this.logEvent('update_install_failed', { error: String(e).slice(0, 120) });
    }
  }
}

export const updater = new UpdateManager();
