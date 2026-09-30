import { Capacitor, registerPlugin } from '@capacitor/core';
import type { DayEntry } from '../types';
import { isNative } from './native';
import { track } from './beacon';

interface HealthBridge {
  push(o: { days: string }): Promise<unknown>;
}

/**
 * Push recent flow/BBT/weight to the OS health store (HealthKit / Health
 * Connect) for two-way sync. No-op on web and without the native plugin.
 */
export async function pushRecentToHealth(entries: Record<string, DayEntry>): Promise<void> {
  if (!isNative()) return;
  try {
    if (!Capacitor.isPluginAvailable('HealthBridge')) {
      track('data_health_push', { ok: false, kind: 'health', reason: 'unavailable' });
      return;
    }
    const days = Object.values(entries)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90)
      .map((e) => ({
        date: e.date,
        ...(e.flow ? { flow: e.flow } : {}),
        ...(e.bbt != null ? { bbt: e.bbt } : {}),
        ...(e.weight != null ? { weight: e.weight } : {}),
      }))
      .filter((d) => d.flow || d.bbt != null || d.weight != null);
    if (!days.length) return;
    const plugin = registerPlugin<HealthBridge>('HealthBridge');
    await plugin.push({ days: JSON.stringify(days) });
    track('data_health_push', { ok: true, kind: 'health', days: days.length });
  } catch {
    track('data_health_push', { ok: false, kind: 'health' });
  }
}
