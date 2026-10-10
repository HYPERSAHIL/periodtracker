import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CycleStats } from './cycle';
import { isNative } from './native';
import { track } from './beacon';

interface SnapshotPlugin {
  save(o: { json: string }): Promise<unknown>;
}

/** Push {cycleDay, nextStart} to the Android home-screen widget (no-op on web). */
let lastJson: string | null = null;
export async function pushWidgetSnapshot(stats: CycleStats): Promise<void> {
  if (!isNative()) return;
  try {
    if (!Capacitor.isPluginAvailable('WidgetSnapshot')) {
      track('data_health_push', { ok: false, kind: 'widget', reason: 'unavailable' });
      return;
    }
    const json = JSON.stringify({ cycleDay: stats.cycleDay ?? null, nextStart: stats.nextStart });
    if (json === lastJson) return;
    lastJson = json;
    const plugin = registerPlugin<SnapshotPlugin>('WidgetSnapshot');
    await plugin.save({ json });
    track('data_health_push', { ok: true, kind: 'widget' });
  } catch {
    track('data_health_push', { ok: false, kind: 'widget' });
  }
}
