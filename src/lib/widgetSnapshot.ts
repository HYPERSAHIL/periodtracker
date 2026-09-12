import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CycleStats } from './cycle';
import { isNative } from './native';

interface SnapshotPlugin {
  save(o: { json: string }): Promise<unknown>;
}

/** Push {cycleDay, nextStart} to the Android home-screen widget (no-op on web). */
export async function pushWidgetSnapshot(stats: CycleStats): Promise<void> {
  if (!isNative()) return;
  try {
    if (!Capacitor.isPluginAvailable('WidgetSnapshot')) return;
    const plugin = registerPlugin<SnapshotPlugin>('WidgetSnapshot');
    await plugin.save({
      json: JSON.stringify({ cycleDay: stats.cycleDay ?? null, nextStart: stats.nextStart }),
    });
  } catch {
    /* widget bridge is best-effort */
  }
}
