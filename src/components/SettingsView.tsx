import { useRef, useState } from 'react';
import { AppProps } from '../App';
import { parseBackup, toBackup } from '../lib/storage';
import { Stepper } from './Onboarding';
import { todayISO } from '../lib/date';

const APP_VERSION = '1.0.0';

export default function SettingsView(p: AppProps) {
  const { settings, updateSettings } = p;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(toBackup(p.entries, settings), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `period-tracker-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File) => {
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed) {
      setImportMsg('That file is not a valid Period Tracker backup.');
      return;
    }
    p.replaceAll(parsed.settings, parsed.entries);
    setImportMsg('Backup restored ✓');
  };

  const enableReminders = async (on: boolean) => {
    if (!on) {
      updateSettings({ reminders: false });
      return;
    }
    if (typeof Notification === 'undefined') return;
    let perm = Notification.permission;
    if (perm !== 'granted') perm = await Notification.requestPermission();
    updateSettings({ reminders: perm === 'granted' });
  };

  return (
    <>
      <div className="card">
        <h3>Your cycle</h3>
        <div className="set-row">
          <div>
            <div className="t">Average cycle length</div>
            <div className="d">{p.stats.usingDefaults ? 'Used until 2+ periods are logged' : 'Now learned from your logs'}</div>
          </div>
          <Stepper value={settings.avgCycleLength} min={15} max={60} onChange={(v) => updateSettings({ avgCycleLength: v })} suffix="d" />
        </div>
        <div className="set-row">
          <div>
            <div className="t">Average period length</div>
            <div className="d">Days of bleeding per period</div>
          </div>
          <Stepper value={settings.avgPeriodLength} min={1} max={14} onChange={(v) => updateSettings({ avgPeriodLength: v })} suffix="d" />
        </div>
        <div className="set-row">
          <div>
            <div className="t">Baseline last period</div>
            <div className="d">Used for predictions before you log</div>
          </div>
          <input
            type="date"
            style={{ width: 150 }}
            value={settings.lastPeriodStart ?? ''}
            max={todayISO()}
            onChange={(e) => updateSettings({ lastPeriodStart: e.target.value || null })}
          />
        </div>
      </div>

      <div className="card">
        <h3>Predictions &amp; reminders</h3>
        <div className="set-row">
          <div>
            <div className="t">Pause predictions</div>
            <div className="d">For pregnancy, menopause, or whenever you want forecasts off</div>
          </div>
          <button
            className={`switch${settings.predictionsPaused ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.predictionsPaused}
            aria-label="Pause predictions"
            onClick={() => updateSettings({ predictionsPaused: !settings.predictionsPaused })}
          />
        </div>
        <div className="set-row">
          <div>
            <div className="t">Period reminders</div>
            <div className="d">A notification when your period is near (while the app is open)</div>
          </div>
          <button
            className={`switch${settings.reminders ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.reminders}
            aria-label="Enable period reminders"
            onClick={() => enableReminders(!settings.reminders)}
          />
        </div>
        {settings.reminders && (
          <div className="set-row">
            <div>
              <div className="t">Remind me</div>
              <div className="d">Days before predicted period</div>
            </div>
            <div>
              {[1, 2, 3, 5].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip${settings.remindDaysBefore === d ? ' on' : ''}`}
                  style={{ marginRight: 6 }}
                  onClick={() => updateSettings({ remindDaysBefore: d })}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Appearance</h3>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              className={settings.theme === t ? 'on' : ''}
              role="radio"
              aria-checked={settings.theme === t}
              onClick={() => updateSettings({ theme: t })}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Your data</h3>
        <p className="hint" style={{ margin: '0 0 12px' }}>
          Everything lives in this browser only. Export a backup before switching phones or clearing
          browser data — there is no copy anywhere else.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" onClick={exportData}>Export JSON</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = '';
          }}
        />
        {importMsg && <p className="hint" style={{ marginTop: 10 }}>{importMsg}</p>}
        <button
          className="btn danger"
          style={{ marginTop: 10 }}
          onClick={() => {
            if (confirmErase) {
              p.eraseAll();
              setConfirmErase(false);
            } else {
              setConfirmErase(true);
              setTimeout(() => setConfirmErase(false), 4000);
            }
          }}
        >
          {confirmErase ? 'Tap again to erase everything' : 'Erase all data'}
        </button>
      </div>

      <div className="card">
        <h3>About</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '0 0 8px' }}>
          Period Tracker v{APP_VERSION} — free, open-source, and local-first. Predictions use the
          calendar method (ovulation ≈ 14 days before your next period) and are estimates, not
          medical advice.
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          <a href="https://github.com/HYPERSAHIL/periodtracker" target="_blank" rel="noreferrer" style={{ color: 'var(--rose-600)', fontWeight: 700 }}>
            View source on GitHub →
          </a>
        </p>
      </div>
    </>
  );
}
