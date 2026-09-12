import { Settings } from '../types';
import { CycleStats } from './cycle';
import { inQuietHours } from './storage';
import { diffDays, todayISO } from './date';
import { tx } from './i18n';

/**
 * Native reminders: (re)schedule heads-ups via Capacitor, respecting the
 * granular toggles + quiet hours. Web uses the Notification path in App.
 */
export async function scheduleNativeReminders(settings: Settings, stats: CycleStats): Promise<void> {
  const lang = settings.lang;
  const discreetBody = () => tx(lang, 'You have a reminder from Period Tracker.');
  const body = (normal: string) => (settings.discreetNotifs ? discreetBody() : normal);
  try {
    const LN = (await import('@capacitor/local-notifications')).LocalNotifications;
    const perm = await LN.requestPermissions();
    if (perm.display !== 'granted') return;
    // cancel by fixed ids - extra payload doesn't round-trip on Android
    await LN.cancel({ notifications: [{ id: 4101 }, { id: 4102 }, { id: 4103 }, { id: 4104 }, { id: 4105 }] }).catch(
      () => undefined
    );
    const toSchedule: Array<{
      id: number;
      title: string;
      body: string;
      schedule: { at: Date } | { on: { hour: number; minute: number } };
      extra: { pt: true };
    }> = [];

    const quiet = (date: Date) => inQuietHours(date, settings.quietStart, settings.quietEnd);

    // period
    if (settings.notifyPeriod !== false) {
      const d = stats.daysUntilNext;
      if (d !== null && d >= 0 && d <= 60) {
        const when = new Date();
        when.setDate(when.getDate() + Math.max(0, d - settings.remindDaysBefore));
        when.setHours(9, 0, 0, 0);
        // past 9am on the fire day → nudge soon instead of skipping the day
        const at = when.getTime() > Date.now() ? when : new Date(Date.now() + 5000);
        if (!quiet(at)) {
          toSchedule.push({
            id: 4101,
            title: 'Period Tracker',
            body: body(
              d - settings.remindDaysBefore <= 0 ? 'Your period is expected today.' : 'Your period is expected soon.'
            ),
            schedule: { at },
            extra: { pt: true },
          });
        }
      }
    }

    // fertile window
    if (settings.notifyOvulation && settings.showFertileWindow && stats.fertileStart) {
      const f = new Date(stats.fertileStart);
      f.setHours(9, 0, 0, 0);
      f.setDate(f.getDate() - 1); // day before window
          if (f.getTime() > Date.now()) {
            if (!quiet(f)) {
              toSchedule.push({
                id: 4102,
                title: 'Period Tracker',
                body: body(tx(lang, 'Fertile window starts tomorrow.')),
                schedule: { at: f },
                extra: { pt: true },
              });
            }
          } else if (f.toDateString() === new Date().toDateString()) {
            // opened after 9am on the fire day → nudge soon
            const soon = new Date(Date.now() + 5000);
            if (!quiet(soon)) {
              toSchedule.push({
                id: 4102,
                title: 'Period Tracker',
                body: body(tx(lang, 'Fertile window starts tomorrow.')),
                schedule: { at: soon },
                extra: { pt: true },
              });
            }
          }
    }

    // daily check in - repeating 20:00 if not quiet
    if (settings.notifyDailyCheckin) {
      const probe = new Date();
      probe.setHours(20, 0, 0, 0);
      if (!quiet(probe)) {
        toSchedule.push({
          id: 4103,
          title: 'Period Tracker',
          body: body(tx(lang, 'Quick check in? Log how today felt.')),
          schedule: { on: { hour: 20, minute: 0 } },
          extra: { pt: true },
        } as unknown as (typeof toSchedule)[0]);
      }
    }

    // contraception change / renewal due within a week
    {
      const reg = settings.contraception;
      const due = reg.nextRenewal ?? null;
      if (due) {
        const n = diffDays(todayISO(), due);
        if (n <= 7) {
          const when = new Date(due);
          when.setHours(9, 0, 0, 0);
          const at = when.getTime() > Date.now() ? when : new Date(Date.now() + 5000);
          if (!quiet(at)) {
            toSchedule.push({
              id: 4104,
              title: 'Period Tracker',
              body: body(
                n < 0
                  ? tx(lang, 'Contraception change is overdue.')
                  : n === 0
                    ? tx(lang, 'Contraception change is due today.')
                    : tx(lang, 'Contraception change due in {n} day{s}.', { n, s: n === 1 ? '' : 's' })
              ),
              schedule: { at },
              extra: { pt: true },
            });
          }
        }
      }
    }

    // daily medication / contraception - repeating at the chosen time
    if (settings.notifyMeds && settings.medTime) {
      const [hh, mm] = settings.medTime.split(':').map(Number);
      if (Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        const probe = new Date();
        probe.setHours(hh, mm, 0, 0);
        // med time inside quiet hours: stay silent rather than buzz at night
        if (!quiet(probe)) {
          toSchedule.push({
            id: 4105,
            title: 'Period Tracker',
            body: body(tx(lang, 'Time for your medication / contraception.')),
            schedule: { on: { hour: hh, minute: mm } },
            extra: { pt: true },
          } as unknown as (typeof toSchedule)[0]);
        }
      }
    }

    if (toSchedule.length) await LN.schedule({ notifications: toSchedule as never });
  } catch {
    /* plugin unavailable or not permitted - web banner path still works */
  }
}
