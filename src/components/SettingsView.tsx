import { useRef, useState } from 'react';
import { AppProps } from '../App';
import { parseBackup, toBackup } from '../lib/storage';
import { Stepper } from './Onboarding';
import { todayISO, prettyDate } from '../lib/date';
import { Mode, MODE_INFO } from '../types';

const APP_VERSION = '1.1.0';
const MODES: Mode[] = ['cycle', 'ttc', 'pregnant', 'perimenopause'];

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

  const setMode = (m: Mode) => {
    // entering pregnancy pauses forecasts; leaving it resumes them (re-pausable via the toggle)
    updateSettings({
      mode: m,
      predictionsPaused: m === 'pregnant',
      dueDate: m === 'pregnant' ? settings.dueDate : null,
    });
  };

  return (
    <>
      <div className="card">
        <h3>Mode</h3>
        <div className="mode-grid">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-card${settings.mode === m ? ' on' : ''}`}
              onClick={() => setMode(m)}
            >
              <span className="mc-emoji" aria-hidden>{MODE_INFO[m].emoji}</span>
              <span className="mc-label">{MODE_INFO[m].label}</span>
              <span className="mc-blurb">{MODE_INFO[m].blurb}</span>
            </button>
          ))}
        </div>
        {settings.mode === 'pregnant' && (
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label htmlFor="st-due">Due date</label>
            <input
              id="st-due"
              type="date"
              value={settings.dueDate ?? ''}
              onChange={(e) => updateSettings({ dueDate: e.target.value || null })}
            />
            {settings.dueDate && (
              <p className="hint">Week-by-week tracking runs from this date ({prettyDate(settings.dueDate, { withYear: true })}).</p>
            )}
          </div>
        )}
        {settings.mode !== 'cycle' && (
          <p className="hint" style={{ marginTop: 10 }}>
            {settings.mode === 'ttc' && 'TTC mode highlights fertile days and LH tests.'}
            {settings.mode === 'perimenopause' && 'Perimenopause mode emphasizes gaps between periods and changing symptoms.'}
          </p>
        )}
      </div>

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
            <div className="d">{settings.mode === 'pregnant' ? 'On automatically while in pregnancy mode' : 'For pregnancy, menopause, or whenever you want forecasts off'}</div>
          </div>
          <button
            className={`switch${p.stats.predictionsPaused ? ' on' : ''}`}
            role="switch"
            aria-checked={p.stats.predictionsPaused}
            aria-label="Pause predictions"
            disabled={settings.mode === 'pregnant'}
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
        <h3>Appearance &amp; units</h3>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Theme</label>
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
        <div className="two-col">
          <div className="field" style={{ margin: 0 }}>
            <label>Temperature</label>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {(['C', 'F'] as const).map((u) => (
                <button key={u} className={settings.tempUnit === u ? 'on' : ''} onClick={() => updateSettings({ tempUnit: u })}>
                  °{u}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Weight</label>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {(['kg', 'lb'] as const).map((u) => (
                <button key={u} className={settings.weightUnit === u ? 'on' : ''} onClick={() => updateSettings({ weightUnit: u })}>
                  {u}
                </button>
              ))}
            </div>
          </div>
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
          calendar method (ovulation ≈ 14 days before your next period); temperature and discharge
          signs add fertility awareness clues. All of it is estimation support, not medical advice.
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
