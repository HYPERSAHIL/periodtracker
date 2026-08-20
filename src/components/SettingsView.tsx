import { useRef, useState } from 'react';
import { AppProps } from '../App';
import { parseBackup, toBackup } from '../lib/storage';
import { hashPin, randomSaltB64 } from '../lib/crypto';
import { CRISIS_NOTE } from '../lib/safety';
import { Stepper } from './Onboarding';
import { todayISO, prettyDate } from '../lib/date';
import { APP_VERSION, ContraceptionMethod, METHOD_INFO, Mode, MODE_INFO, TRACKER_SECTIONS } from '../types';

const MODES: Mode[] = ['cycle', 'ttc', 'pregnant', 'perimenopause'];
const METHODS: ContraceptionMethod[] = ['none', 'pill', 'patch', 'ring', 'injection', 'implant', 'iud', 'condom', 'other'];

export default function SettingsView(p: AppProps) {
  const { settings, updateSettings } = p;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState('');

  const reg = settings.contraception;

  const download = (obj: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportData = () => {
    download(toBackup(p.entries, settings), `period-tracker-backup-${todayISO()}.json`);
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

  const savePin = async () => {
    if (!/^\d{4,8}$/.test(pin)) return;
    const salt = randomSaltB64();
    const h = await hashPin(pin, salt);
    updateSettings({ pinHash: h, pinSalt: salt });
    sessionStorage.setItem('pt.unlocked', '1');
    setPinModal(false);
    setPin('');
  };

  const clearPin = () => {
    updateSettings({ pinHash: null, pinSalt: null });
    setPinModal(false);
    setPin('');
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
              <p className="hint">Week by week tracking runs from this date ({prettyDate(settings.dueDate, { withYear: true })}).</p>
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
            <div className="t">Reminders master</div>
            <div className="d">Allow notifications. Then choose what you get and when</div>
          </div>
          <button
            className={`switch${settings.reminders ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.reminders}
            aria-label="Enable reminders master"
            onClick={() => enableReminders(!settings.reminders)}
          />
        </div>
        {settings.reminders && (
          <>
            <div className="set-row">
              <div>
                <div className="t">Period coming</div>
                <div className="d">Heads-up before your predicted period</div>
              </div>
              <button
                className={`switch${settings.notifyPeriod ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.notifyPeriod}
                aria-label="Period coming reminder"
                onClick={() => updateSettings({ notifyPeriod: !settings.notifyPeriod })}
              />
            </div>
            {settings.notifyPeriod && (
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
            <div className="set-row">
              <div>
                <div className="t">Fertile window</div>
                <div className="d">When the fertile window starts (separate from period)</div>
              </div>
              <button
                className={`switch${settings.notifyOvulation ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.notifyOvulation}
                aria-label="Fertile window reminder"
                onClick={() => updateSettings({ notifyOvulation: !settings.notifyOvulation })}
              />
            </div>
            <div className="set-row">
              <div>
                <div className="t">Daily check in nudge</div>
                <div className="d">Evening reminder to log today, only if you haven't checked in</div>
              </div>
              <button
                className={`switch${settings.notifyDailyCheckin ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.notifyDailyCheckin}
                aria-label="Daily check in nudge"
                onClick={() => updateSettings({ notifyDailyCheckin: !settings.notifyDailyCheckin })}
              />
            </div>
            <div className="set-row">
              <div>
                <div className="t">Quiet hours</div>
                <div className="d">No notifications between these times</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="time"
                  value={settings.quietStart ?? ''}
                  onChange={(e) => updateSettings({ quietStart: e.target.value || null })}
                  style={{ width: 110 }}
                  aria-label="Quiet hours start"
                />
                <span style={{ color: 'var(--muted)' }}>-</span>
                <input
                  type="time"
                  value={settings.quietEnd ?? ''}
                  onChange={(e) => updateSettings({ quietEnd: e.target.value || null })}
                  style={{ width: 110 }}
                  aria-label="Quiet hours end"
                />
              </div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Leave quiet hours empty for no restriction. Example: 22:00 - 08:00 keeps nights silent. On the web, notifications appear only while the app is open; with the installed app they can appear in the background.
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h3>Display</h3>
        <div className="set-row">
          <div>
            <div className="t">Show fertile window</div>
            <div className="d">Hide it if you prefer to see only period predictions (stored locally, never shared)</div>
          </div>
          <button
            className={`switch${settings.showFertileWindow ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.showFertileWindow}
            aria-label="Show fertile window"
            onClick={() => updateSettings({ showFertileWindow: !settings.showFertileWindow })}
          />
        </div>
        {!settings.showFertileWindow && (
          <p className="hint">Fertile estimates hidden on your dashboard and calendar. Turn back on anytime in Settings.</p>
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
        <h3>Account &amp; sync</h3>
        <div className="set-row">
          <div>
            <div className="t">
              {p.cloudUser && !p.cloudUser.anonymous
                ? `Signed in as ${p.cloudUser.name ?? p.cloudUser.email}`
                : 'Not signed in'}
            </div>
            <div className="d">
              {p.cloudUser && !p.cloudUser.anonymous
                ? p.cloudUser.email ?? ''
                : 'Your data is backed up automatically.'}
            </div>
          </div>
        </div>
        {p.cloudUser && (
          <div className="set-row">
            <div>
              <div className="t">Backup code</div>
              <div className="d" style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.cloudUser.syncKey}</div>
            </div>
            <button
              className="btn ghost sm"
              onClick={() => navigator.clipboard?.writeText(p.cloudUser!.syncKey)}
            >
              Copy
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {p.cloudUser && !p.cloudUser.anonymous ? (
            <button className="btn ghost" onClick={p.signOutCloud}>Sign out</button>
          ) : null}
          <button className="btn ghost" onClick={p.openAccount}>
            {p.cloudUser && !p.cloudUser.anonymous ? 'Switch account' : 'Sign in'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Contraception</h3>
        <div className="chips" style={{ marginBottom: 12 }}>
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${reg.method === m ? 'on' : ''}`}
              onClick={() => updateSettings({ contraception: { ...reg, method: m } })}
            >
              {METHOD_INFO[m].label}
            </button>
          ))}
        </div>
        {METHOD_INFO[reg.method].hormonal && (
          <p className="hint" style={{ marginBottom: 10 }}>
            Hormonal method: fertile-window and ovulation estimates are suppressed (they assume ovulation). Period predictions stay, widened by your uncertainty.
          </p>
        )}
        {(reg.method === 'patch' || reg.method === 'ring') && (
          <div className="set-row">
            <div>
              <div className="t">Change every</div>
              <div className="d">Days between patch/ring changes</div>
            </div>
            <Stepper value={reg.changeEveryDays ?? 7} min={1} max={35} onChange={(v) => updateSettings({ contraception: { ...reg, changeEveryDays: v } })} suffix="d" />
          </div>
        )}
        {reg.method !== 'none' && (
          <div className="set-row">
            <div>
              <div className="t">Started on</div>
              <div className="d">Anchors change/renewal reminders</div>
            </div>
            <input type="date" style={{ width: 150 }} value={reg.startDate ?? ''} onChange={(e) => updateSettings({ contraception: { ...reg, startDate: e.target.value || null } })} />
          </div>
        )}
        {['injection', 'implant', 'iud'].includes(reg.method) && (
          <div className="set-row">
            <div>
              <div className="t">Next renewal</div>
              <div className="d">Shown on your dashboard as it approaches</div>
            </div>
            <input type="date" style={{ width: 150 }} value={reg.nextRenewal ?? ''} onChange={(e) => updateSettings({ contraception: { ...reg, nextRenewal: e.target.value || null } })} />
          </div>
        )}
      </div>

      <div className="card">
        <h3>Trackers</h3>
        <p className="hint" style={{ margin: '0 0 8px' }}>Show, hide, and reorder the sections in the daily log.</p>
        {TRACKER_SECTIONS.map((s) => {
          const idx = settings.trackerOrder.indexOf(s.id);
          const hidden = settings.trackerHidden.includes(s.id);
          return (
            <div key={s.id} className="set-row">
              <div>
                <div className="t" style={hidden ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>{s.label}</div>
                <div className="d">{s.description}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="cal-nav" style={{ width: 30, height: 30, fontSize: 13 }} aria-label={`Move ${s.label} up`} disabled={idx <= 0}
                  onClick={() => {
                    const order = [...settings.trackerOrder];
                    const i = order.indexOf(s.id);
                    [order[i - 1], order[i]] = [order[i], order[i - 1]];
                    updateSettings({ trackerOrder: order });
                  }}>↑</button>
                <button className="cal-nav" style={{ width: 30, height: 30, fontSize: 13 }} aria-label={`Move ${s.label} down`} disabled={idx < 0 || idx >= settings.trackerOrder.length - 1}
                  onClick={() => {
                    const order = [...settings.trackerOrder];
                    const i = order.indexOf(s.id);
                    [order[i + 1], order[i]] = [order[i], order[i + 1]];
                    updateSettings({ trackerOrder: order });
                  }}>↓</button>
                <button className={`chip${!hidden ? 'on' : ''}`} onClick={() => updateSettings({ trackerHidden: hidden ? settings.trackerHidden.filter((x) => x !== s.id) : [...settings.trackerHidden, s.id] })}>
                  {hidden ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Privacy &amp; security</h3>
        <div className="set-row">
          <div>
            <div className="t">App PIN</div>
            <div className="d">{settings.pinHash ? 'Asked when the app opens' : 'Protect the app with a PIN'}</div>
          </div>
          <button className="btn ghost sm" onClick={() => setPinModal(true)}>{settings.pinHash ? 'Change' : 'Set PIN'}</button>
        </div>
        {settings.pinHash && (
          <div className="set-row">
            <div>
              <div className="t">Remove PIN</div>
              <div className="d">Stop asking on launch</div>
            </div>
            <button className="btn ghost sm" onClick={clearPin}>Remove</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Your data</h3>
        <p className="hint" style={{ margin: '0 0 12px' }}>
          Everything lives in this browser only. Export a backup before switching phones or clearing
          browser data - there is no copy anywhere else.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" onClick={() => exportData()}>Export JSON</button>
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
        <h3>Need support now?</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{CRISIS_NOTE}</p>
      </div>

      <div className="card">
        <h3>About</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          Period Tracker v{APP_VERSION} - free and private. Predictions use the calendar method
          (ovulation ≈ 14 days before your next period); temperature and discharge signs add
          fertility awareness clues. All of it is estimation support, not medical advice.
        </p>
      </div>

      {pinModal && (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setPinModal(false)}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="grab" />
            <h2>🔐 App PIN</h2>
            <p className="hint" style={{ marginBottom: 14 }}>
              4-8 digits. This is a convenience gate, not encryption. Your data itself is unchanged on disk.
            </p>
            <input
              className="num-in"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              aria-label="PIN"
            />
            <button className="btn primary" style={{ marginTop: 12 }} disabled={!/^\d{4,8}$/.test(pin)} onClick={savePin}>
              Save PIN
            </button>
          </div>
        </div>
      )}
    </>
  );
}
