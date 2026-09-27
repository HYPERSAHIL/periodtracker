import { useEffect, useRef, useState } from 'react';
import { AppProps } from '../App';
import { parseBackup, parseCSVEntries, parseHealthXML, parseWearableCSV, mergeImportedEntries, toBackup } from '../lib/storage';
import { hashPin, randomSaltB64 } from '../lib/crypto';
import { tx, txd } from '../lib/i18n';
import { phaseFor } from '../lib/cycle';
import type { ShareRow, SharedSummary } from '../lib/cloud';
import { CRISIS_NOTE } from '../lib/safety';
import { Stepper } from './Onboarding';
import InstallCard from './InstallCard';
import { todayISO, prettyDate } from '../lib/date';
import { APP_VERSION, ContraceptionMethod, METHOD_INFO, Mode, MODE_INFO, MOODS, SYMPTOMS, TRACKER_SECTIONS } from '../types';

const MODES: Mode[] = ['cycle', 'ttc', 'pregnant', 'perimenopause', 'postpartum'];
const METHODS: ContraceptionMethod[] = ['none', 'pill', 'patch', 'ring', 'injection', 'implant', 'iud', 'condom', 'other'];

export default function SettingsView(p: AppProps) {
  const { settings, updateSettings } = p;
  const lang = settings.lang;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [shareFertile, setShareFertile] = useState(true);
  const [sharePhase, setSharePhase] = useState(true);
  const [shareNext, setShareNext] = useState(true);
  const [emailAddr, setEmailAddr] = useState('');
  const [emailFreq, setEmailFreq] = useState<'weekly' | 'monthly'>('weekly');
  const [emailLevel, setEmailLevel] = useState<'minimal' | 'full'>('minimal');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailOn, setEmailOn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    p.emailApi
      .status()
      .then((s) => {
        if (!live) return;
        if (s.sub) {
          setEmailAddr(s.sub.email);
          setEmailFreq(s.sub.freq);
          setEmailLevel(s.sub.level);
          setEmailOn(true);
        } else {
          setEmailOn(false);
        }
      })
      .catch(() => live && setEmailOn(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadShares = async () => {
    try {
      setShares(await p.shareApi.list());
    } catch {
      setShares([]);
    }
  };
  useEffect(() => {
    const load = () => {
      p.shareApi
        .list()
        .then((rows) => setShares(rows))
        .catch(() => setShares([]));
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reg = settings.contraception;

  // tracker ordering: single source, rendered in effect order so moves are visible
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const effOrder = settings.trackerOrder.length ? settings.trackerOrder : TRACKER_SECTIONS.map((t) => t.id);
  const setOrder = (ord: string[]) => updateSettings({ trackerOrder: ord });
  const moveTracker = (id: string, dir: -1 | 1) => {
    const ord = [...effOrder];
    const i = ord.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ord.length) return;
    [ord[i], ord[j]] = [ord[j], ord[i]];
    setOrder(ord);
  };
  const onDragMove = (clientY: number) => {
    const id = dragIdRef.current;
    if (!id) return;
    const rest = effOrder.filter((x) => x !== id);
    let at = rest.length;
    for (const oid of rest) {
      const el = rowRefs.current[oid];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        at = rest.indexOf(oid);
        break;
      }
    }
    const next = [...rest];
    next.splice(at, 0, id);
    if (next.join() !== effOrder.join()) setOrder(next);
  };
  const endDrag = () => {
    dragIdRef.current = null;
    setDragId(null);
  };

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
    if (/\.csv$/i.test(file.name)) {
      const csvEntries = parseCSVEntries(text);
      if (csvEntries && Object.keys(csvEntries).length) {
        const n = Object.keys(csvEntries).length;
        p.replaceAll(p.settings, mergeImportedEntries(p.entries, csvEntries));
        setImportMsg(tx(lang, 'CSV imported ✓ ({n} day{s})', { n, s: n === 1 ? '' : 's' }));
        return;
      }
      // not a tracker export? try wearable format (Oura/Fitbit/Withings/Health Connect)
      const wearable = parseWearableCSV(text, { dayFirst: lang === 'hi' });
      if (!wearable) {
        setImportMsg(tx(lang, 'That file is not a valid Period Tracker CSV.'));
        return;
      }
      const n = Object.keys(wearable.entries).length;
      p.replaceAll(p.settings, mergeImportedEntries(p.entries, wearable.entries));
      setImportMsg(
        tx(lang, 'Wearable data imported ✓ ({n} day{s}, {tu}/{wu})', { n, s: n === 1 ? '' : 's', tu: wearable.tempUnit, wu: wearable.weightUnit })
      );
      return;
    }
    if (/\.xml$/i.test(file.name)) {
      const xmlEntries = parseHealthXML(text);
      if (!xmlEntries) {
        setImportMsg(tx(lang, 'That file is not a valid Apple Health export.'));
        return;
      }
      const n = Object.keys(xmlEntries).length;
      p.replaceAll(p.settings, mergeImportedEntries(p.entries, xmlEntries));
      setImportMsg(tx(lang, 'Health data imported ✓ ({n} day{s})', { n, s: n === 1 ? '' : 's' }));
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed) {
      setImportMsg(tx(lang, 'That file is not a valid Period Tracker backup.'));
      return;
    }
    p.replaceAll(parsed.settings, parsed.entries);
    setImportMsg(tx(lang, 'Backup restored ✓'));
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
    // entering pregnancy/postpartum pauses forecasts; leaving resumes them (re-pausable via the toggle)
    updateSettings({
      mode: m,      predictionsPaused: m === 'pregnant' || m === 'postpartum',
      dueDate: m === 'pregnant' ? settings.dueDate : null,
      postpartum: m === 'postpartum' ? (settings.postpartum ?? { birthDate: null, exclusiveBF: false }) : settings.postpartum,
    });
  };

  const setTeen = (on: boolean) =>
    updateSettings({
      teen: on,
      // teen mode keeps things simple: no fertile displays, no TTC/pregnancy content
      showFertileWindow: on ? false : settings.showFertileWindow,
    });

  return (
    <>
      <InstallCard lang={lang} />
      <div className="card">
        <h3>{tx(lang, 'Mode')}</h3>
        <div className="mode-grid">
          {MODES.filter((m) => m === settings.mode || !settings.teen || (m !== 'ttc' && m !== 'pregnant')).map((m) => (
            <button
              key={m}
              type="button"
              className={`mode-card${settings.mode === m ? ' on' : ''}`}
              onClick={() => setMode(m)}
            >
              <span className="mc-emoji" aria-hidden>{MODE_INFO[m].emoji}</span>
              <span className="mc-label">{txd(lang, `mode.${m}`, MODE_INFO[m].label)}</span>
              <span className="mc-blurb">{txd(lang, `mode.${m}.blurb`, MODE_INFO[m].blurb)}</span>
            </button>
          ))}
        </div>
        {settings.mode === 'pregnant' && (
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label htmlFor="st-due">{tx(lang, 'Due date')}</label>
            <input
              id="st-due"
              type="date"
              value={settings.dueDate ?? ''}
              onChange={(e) => updateSettings({ dueDate: e.target.value || null })}
            />
            {settings.dueDate && (
              <p className="hint">{tx(lang, 'Week by week tracking runs from this date ({date}).', { date: prettyDate(settings.dueDate, { withYear: true }) })}</p>
            )}
          </div>
        )}
        {settings.mode === 'postpartum' && (
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label htmlFor="st-birth">{tx(lang, 'Birth date')}</label>
            <input
              id="st-birth"
              type="date"
              value={settings.postpartum?.birthDate ?? ''}
              max={todayISO()}
              onChange={(e) =>
                updateSettings({ postpartum: { birthDate: e.target.value || null, exclusiveBF: settings.postpartum?.exclusiveBF ?? false } })
              }
            />
            <div className="set-row" style={{ marginTop: 10 }}>
              <div>
                <div className="t">{tx(lang, 'Fully breastfeeding')}</div>
                <div className="d">{tx(lang, 'No formula or solids yet — LAM needs near-full breastfeeding.')}</div>
              </div>
              <button
                className={`switch${settings.postpartum?.exclusiveBF ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.postpartum?.exclusiveBF ?? false}
                aria-label={tx(lang, 'Fully breastfeeding')}
                onClick={() =>
                  updateSettings({
                    postpartum: { birthDate: settings.postpartum?.birthDate ?? null, exclusiveBF: !(settings.postpartum?.exclusiveBF ?? false) },
                  })
                }
              />
            </div>
          </div>
        )}
        {settings.mode !== 'cycle' && (
          <p className="hint" style={{ marginTop: 10 }}>
            {settings.mode === 'ttc' && tx(lang, 'TTC mode highlights fertile days and LH tests.')}
            {settings.mode === 'perimenopause' && tx(lang, 'Perimenopause mode emphasizes gaps between periods and changing symptoms.')}
          </p>
        )}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Your cycle')}</h3>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'Average cycle length')}</div>
            <div className="d">{p.stats.usingDefaults ? tx(lang, 'Used until 2+ periods are logged') : tx(lang, 'Now learned from your logs')}</div>
          </div>
          <Stepper value={settings.avgCycleLength} min={15} max={60} onChange={(v) => updateSettings({ avgCycleLength: v })} suffix={tx(lang, 'd')} lang={lang} />
        </div>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'Average period length')}</div>
            <div className="d">{tx(lang, 'Days of bleeding per period')}</div>
          </div>
          <Stepper value={settings.avgPeriodLength} min={1} max={14} onChange={(v) => updateSettings({ avgPeriodLength: v })} suffix={tx(lang, 'd')} lang={lang} />
        </div>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'Baseline last period')}</div>
            <div className="d">{tx(lang, 'Used for predictions before you log')}</div>
          </div>
          <input
            type="date"
            style={{ width: 150 }}
            value={settings.lastPeriodStart ?? ''}
            max={todayISO()}
            onChange={(e) => updateSettings({ lastPeriodStart: e.target.value || null })}
          />
        </div>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'Irregular cycles (PCOS & friends)')}</div>
            <div className="d">{tx(lang, 'Wider forecast windows, no late-period nagging. Honest mode for unpredictable cycles.')}</div>
          </div>
          <button
            className={`switch${settings.irregular ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.irregular}
            aria-label={tx(lang, 'Irregular cycles (PCOS & friends)')}
            onClick={() => updateSettings({ irregular: !settings.irregular })}
          />
        </div>
      </div>

      <div className="card">
        <h3>{tx(lang, 'Predictions & reminders')}</h3>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'Pause predictions')}</div>
            <div className="d">{settings.mode === 'pregnant' ? tx(lang, 'On automatically while in pregnancy mode') : tx(lang, 'For pregnancy, menopause, or whenever you want forecasts off')}</div>
          </div>
          <button
            className={`switch${p.stats.predictionsPaused ? ' on' : ''}`}
            role="switch"
            aria-checked={p.stats.predictionsPaused}
            aria-label={tx(lang, 'Pause predictions')}
            disabled={settings.mode === 'pregnant'}
            onClick={() => updateSettings({ predictionsPaused: !settings.predictionsPaused })}
          />
        </div>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'Reminders master')}</div>
            <div className="d">{tx(lang, 'Allow notifications. Then choose what you get and when')}</div>
          </div>
          <button
            className={`switch${settings.reminders ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.reminders}
            aria-label={tx(lang, 'Reminders master')}
            onClick={() => enableReminders(!settings.reminders)}
          />
        </div>
        {settings.reminders && (
          <>
            <div className="set-row">
              <div>
                <div className="t">{tx(lang, 'Period coming')}</div>
                <div className="d">{tx(lang, 'Heads-up before your predicted period')}</div>
              </div>
              <button
                className={`switch${settings.notifyPeriod ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.notifyPeriod}
                aria-label={tx(lang, 'Period coming')}
                onClick={() => updateSettings({ notifyPeriod: !settings.notifyPeriod })}
              />
            </div>
            {settings.notifyPeriod && (
              <div className="set-row">
                <div>
                  <div className="t">{tx(lang, 'Remind me')}</div>
                  <div className="d">{tx(lang, 'Days before predicted period')}</div>
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
                        {d}
                        {tx(lang, 'd')}
                      </button>
                    ))}
                  </div>
              </div>
            )}
            <div className="set-row">
              <div>
                <div className="t">{tx(lang, 'Fertile window')}</div>
                <div className="d">{tx(lang, 'When the fertile window starts (separate from period)')}</div>
              </div>
              <button
                className={`switch${settings.notifyOvulation ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.notifyOvulation}
                aria-label={tx(lang, 'Fertile window')}
                onClick={() => updateSettings({ notifyOvulation: !settings.notifyOvulation })}
              />
            </div>
            <div className="set-row">
              <div>
                <div className="t">{tx(lang, 'Daily check in nudge')}</div>
                <div className="d">{tx(lang, "Evening reminder to log today, only if you haven't checked in")}</div>
              </div>
              <button
                className={`switch${settings.notifyDailyCheckin ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.notifyDailyCheckin}
                aria-label={tx(lang, 'Daily check in nudge')}
                onClick={() => updateSettings({ notifyDailyCheckin: !settings.notifyDailyCheckin })}
              />
            </div>
            <div className="set-row">
              <div>
                <div className="t">{tx(lang, 'Medication reminder')}</div>
                <div className="d">{tx(lang, 'Daily nudge at your chosen time — pills, supplements, anything recurring.')}</div>
              </div>
              <button
                className={`switch${settings.notifyMeds ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.notifyMeds}
                aria-label={tx(lang, 'Medication reminder')}
                onClick={() => updateSettings({ notifyMeds: !settings.notifyMeds })}
              />
            </div>
            {settings.notifyMeds && (
              <div className="set-row">
                <div>
                  <div className="t">{tx(lang, 'Time')}</div>
                </div>
                <input
                  type="time"
                  value={settings.medTime ?? '09:00'}
                  onChange={(e) =>
                    updateSettings(
                      e.target.value ? { medTime: e.target.value } : { medTime: null, notifyMeds: false }
                    )
                  }
                  style={{ width: 110 }}
                  aria-label={tx(lang, 'Time')}
                />
              </div>
            )}
            <div className="set-row">
              <div>
                <div className="t">{tx(lang, 'Quiet hours')}</div>
                <div className="d">{tx(lang, 'No notifications between these times')}</div>
              </div>              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="time"
                  value={settings.quietStart ?? ''}
                  onChange={(e) => updateSettings({ quietStart: e.target.value || null })}
                  style={{ width: 110 }}
                  aria-label={tx(lang, 'Quiet hours start')}
                />
                <span style={{ color: 'var(--muted)' }}>-</span>
                <input
                  type="time"
                  value={settings.quietEnd ?? ''}
                  onChange={(e) => updateSettings({ quietEnd: e.target.value || null })}
                  style={{ width: 110 }}
                  aria-label={tx(lang, 'Quiet hours end')}
                />
              </div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {tx(lang, 'Leave quiet hours empty for no restriction. Example: 22:00 - 08:00 keeps nights silent. On the web, notifications appear only while the app is open; with the installed app they can appear in the background.')}
            </p>
            <div className="set-row">
              <div>
                <div className="t">{tx(lang, 'Discreet notifications')}</div>
                <div className="d">{tx(lang, 'Lock-screen-safe text — never mentions periods, fertility, or meds.')}</div>
              </div>
              <button
                className={`switch${settings.discreetNotifs ? ' on' : ''}`}
                role="switch"
                aria-checked={settings.discreetNotifs}
                aria-label={tx(lang, 'Discreet notifications')}
                onClick={() => updateSettings({ discreetNotifs: !settings.discreetNotifs })}
              />
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Display')}</h3>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'Show fertile window')}</div>
            <div className="d">{tx(lang, 'Hide it if you prefer to see only period predictions (stored locally, never shared)')}</div>
          </div>
          <button
            className={`switch${settings.showFertileWindow ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.showFertileWindow}
            aria-label={tx(lang, 'Show fertile window')}
            onClick={() => updateSettings({ showFertileWindow: !settings.showFertileWindow })}
          />
        </div>
        {!settings.showFertileWindow && (
          <p className="hint">{tx(lang, 'Fertile estimates hidden on your dashboard and calendar. Turn back on anytime in Settings.')}</p>
        )}
        <div className="set-row" style={{ marginTop: 12 }}>
          <div>
            <div className="t">{tx(lang, 'Week starts on')}</div>
            <div className="d">{tx(lang, 'First column of the calendar')}</div>
          </div>
          <div className="seg" role="radiogroup" aria-label={tx(lang, 'Week starts on')} style={{ gridTemplateColumns: '1fr 1fr', minWidth: 170 }}>
            {([1, 0] as const).map((w) => (
              <button
                key={w}
                className={settings.weekStart === w ? 'on' : ''}
                role="radio"
                aria-checked={settings.weekStart === w}
                onClick={() => updateSettings({ weekStart: w })}
              >
                {w === 1 ? tx(lang, 'Monday') : tx(lang, 'Sunday')}
              </button>
            ))}
          </div>
        </div>
        <div className="set-row" style={{ marginTop: 12 }}>
          <div>
            <div className="t">{tx(lang, 'Language')}</div>
            <div className="d">English / हिन्दी</div>
          </div>          <div className="seg" role="radiogroup" aria-label={tx(lang, 'Language')} style={{ gridTemplateColumns: '1fr 1fr', minWidth: 170 }}>
            {(['en', 'hi'] as const).map((l) => (
              <button
                key={l}
                className={settings.lang === l ? 'on' : ''}
                role="radio"
                aria-checked={settings.lang === l}
                onClick={() => updateSettings({ lang: l })}
              >
                {l === 'en' ? 'English' : 'हिन्दी'}
              </button>
            ))}
          </div>
        </div>
        <div className="set-row" style={{ marginTop: 12 }}>
          <div>
            <div className="t">{tx(lang, 'Teen mode')}</div>
            <div className="d">{tx(lang, 'Simpler home screen. Fertile window, TTC and pregnancy content stay hidden.')}</div>
          </div>
          <button
            className={`switch${settings.teen ? ' on' : ''}`}
            role="switch"
            aria-checked={settings.teen}
            aria-label={tx(lang, 'Teen mode')}
            onClick={() => setTeen(!settings.teen)}
          />
        </div>
      </div>

      <div className="card">
        <h3>{tx(lang, 'Appearance & units')}</h3>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>{tx(lang, 'Theme')}</label>
          <div className="seg" role="radiogroup" aria-label={tx(lang, 'Theme')}>
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                className={settings.theme === t ? 'on' : ''}
                role="radio"
                aria-checked={settings.theme === t}
                onClick={() => updateSettings({ theme: t })}
              >
                {tx(lang, t[0].toUpperCase() + t.slice(1))}
              </button>
            ))}
          </div>
        </div>
        <div className="two-col">
          <div className="field" style={{ margin: 0 }}>
            <label>{tx(lang, 'Temperature')}</label>
            <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {(['C', 'F'] as const).map((u) => (
                <button key={u} className={settings.tempUnit === u ? 'on' : ''} onClick={() => updateSettings({ tempUnit: u })}>
                  °{u}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>{tx(lang, 'Weight')}</label>
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
        <h3>{tx(lang, 'Account & sync')}</h3>
        <div className="set-row">
          <div>
            <div className="t">
              {p.cloudUser && !p.cloudUser.anonymous
                ? tx(lang, 'Signed in as {name}', { name: p.cloudUser.name ?? p.cloudUser.email ?? '' })
                : tx(lang, 'Not signed in')}
            </div>
            <div className="d">
              {p.cloudUser && !p.cloudUser.anonymous
                ? p.cloudUser.email ?? ''
                : tx(lang, 'Your data is backed up automatically.')}
            </div>
          </div>
        </div>
        {p.cloudUser && (
          <div className="set-row">
            <div>
              <div className="t">{tx(lang, 'Backup code')}</div>
              <div className="d" style={{ fontFamily: 'monospace', fontSize: 13 }}>{p.cloudUser.syncKey}</div>
            </div>
            <button
              className="btn ghost sm"
              onClick={() => navigator.clipboard?.writeText(p.cloudUser!.syncKey)}
            >
              {tx(lang, 'Copy')}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {p.cloudUser && !p.cloudUser.anonymous ? (
            <button className="btn ghost" onClick={p.signOutCloud}>{tx(lang, 'Sign out')}</button>
          ) : null}
          <button className="btn ghost" onClick={p.openAccount}>
            {p.cloudUser && !p.cloudUser.anonymous ? tx(lang, 'Switch account') : tx(lang, 'Sign in')}
          </button>
        </div>
      </div>

      {p.cloudUser && !p.cloudUser.anonymous && p.cloudUser.email && !p.cloudUser.emailVerified && (
        <VerifyEmailCard lang={lang} otpApi={p.otpApi} />
      )}

      <div className="card">
        <h3>{tx(lang, 'Partner share')}</h3>
        <p className="hint" style={{ margin: '0 0 12px' }}>
          {tx(lang, 'Share a read-only snapshot (cycle day, next period, fertile window). No symptoms, notes or history — ever. Links expire automatically.')}
        </p>
        {shares === null ? (
          <p className="hint">{tx(lang, 'Loading')}</p>
        ) : (
          <>
            {shares.length === 0 && <p className="hint">{tx(lang, 'No active links')}</p>}
            {shares.map((s) => {
              const link = `${location.origin}/?s=${s.token}`;
              return (
                <div key={s.token} className="set-row">
                  <div>
                    <div className="d" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {tx(lang, 'Expires {date}', { date: prettyDate(s.expires_at.slice(0, 10), { withYear: true }) })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn ghost sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard?.writeText(link);
                          setCopied(s.token);
                          window.setTimeout(() => setCopied((c) => (c === s.token ? null : c)), 2000);
                        } catch {
                          /* clipboard unavailable */
                        }
                      }}
                    >
                      {copied === s.token ? tx(lang, 'Copied') : tx(lang, 'Copy link')}
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={async () => {
                        try {
                          await p.shareApi.revoke(s.token);
                          loadShares();
                        } catch {
                          setShareMsg(tx(lang, 'Something went wrong.'));
                        }
                      }}
                    >
                      {tx(lang, 'Revoke')}
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <button
          className="btn ghost"
          style={{ marginTop: 4 }}
          onClick={async () => {
            try {
              const fertileVisible = settings.showFertileWindow && !p.stats.fertileSuppressed && !settings.teen;
              const summary: SharedSummary = {
                cycleDay: sharePhase ? p.stats.cycleDay : null,
                nextStart: shareNext ? p.stats.nextStart : null,
                fertileStart: shareFertile && fertileVisible ? p.stats.fertileStart : null,
                fertileEnd: shareFertile && fertileVisible ? p.stats.fertileEnd : null,
                // phase alone can reveal ovulation — null it with the fertile data
                phase: sharePhase && fertileVisible ? phaseFor(todayISO(), p.stats, p.facts) : null,
                generatedAt: todayISO(),
              };
              await p.shareApi.create(summary, 30);
              setShareMsg(null);
              loadShares();
            } catch {
              setShareMsg(tx(lang, 'Something went wrong.'));
            }
          }}
        >
          {tx(lang, 'Create 30-day link')}
        </button>
        <div style={{ marginTop: 10 }}>
          {(
            [
              ['fertile', shareFertile, setShareFertile, 'Include fertile window'],
              ['phase', sharePhase, setSharePhase, 'Include phase + cycle day'],
              ['next', shareNext, setShareNext, 'Include next period'],
            ] as const
          ).map(([id, on, set, label]) => (
            <div className="set-row" key={id}>
              <div>
                <div className="t">{tx(lang, label)}</div>
              </div>
              <button
                className={`switch${on ? ' on' : ''}`}
                role="switch"
                aria-checked={on}
                aria-label={tx(lang, label)}
                onClick={() => set(!on)}
              />
            </div>
          ))}
        </div>
        {shareMsg && <p className="hint" style={{ marginTop: 10 }}>{shareMsg}</p>}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Email summaries')}</h3>
        <p className="hint" style={{ margin: '0 0 12px' }}>
          {tx(lang, 'Opt-in weekly or monthly snapshot by email. Minimal level sends dates only — never symptoms or notes. One-click unsubscribe in every mail.')}
        </p>
        {emailOn === null ? (
          <p className="hint">{tx(lang, 'Loading')}</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="em-addr">{tx(lang, 'Email')}</label>
              <input
                id="em-addr"
                type="email"
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label>{tx(lang, 'How often')}</label>
              <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {(['weekly', 'monthly'] as const).map((f) => (
                  <button key={f} className={emailFreq === f ? 'on' : ''} onClick={() => setEmailFreq(f)}>
                    {f === 'weekly' ? tx(lang, 'Weekly') : tx(lang, 'Monthly')}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{tx(lang, 'Detail level')}</label>
              <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button className={emailLevel === 'minimal' ? 'on' : ''} onClick={() => setEmailLevel('minimal')}>
                  {tx(lang, 'Dates only')}
                </button>
                <button className={emailLevel === 'full' ? 'on' : ''} onClick={() => setEmailLevel('full')}>
                  {tx(lang, 'Detailed')}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                className="btn ghost"
                onClick={async () => {
                  try {
                    await p.emailApi.subscribe({ email: emailAddr.trim(), freq: emailFreq, level: emailLevel });
                    setEmailOn(true);
                    setEmailMsg(tx(lang, 'Subscribed ✓'));
                  } catch {
                    setEmailMsg(tx(lang, 'Please enter a valid email.'));
                  }
                }}
              >
                {emailOn ? tx(lang, 'Update') : tx(lang, 'Subscribe')}
              </button>
              {emailOn && (
                <button
                  className="btn ghost"
                  onClick={async () => {
                    await p.emailApi.unsubscribe();
                    setEmailOn(false);
                    setEmailMsg(tx(lang, 'Unsubscribed.'));
                  }}
                >
                  {tx(lang, 'Unsubscribe')}
                </button>
              )}
            </div>
            {emailMsg && <p className="hint" style={{ marginTop: 10 }}>{emailMsg}</p>}
          </>
        )}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Contraception')}</h3>        <div className="chips" style={{ marginBottom: 12 }}>
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${reg.method === m ? ' on' : ''}`}
              onClick={() => updateSettings({ contraception: { ...reg, method: m } })}
            >
              {txd(lang, `cm.${m}`, METHOD_INFO[m].label)}
            </button>
          ))}
        </div>
        {METHOD_INFO[reg.method].hormonal && (
          <p className="hint" style={{ marginBottom: 10 }}>
            {tx(lang, 'Hormonal method: fertile-window and ovulation estimates are suppressed (they assume ovulation). Period predictions stay, widened by your uncertainty.')}
          </p>
        )}
        {(reg.method === 'patch' || reg.method === 'ring') && (
          <div className="set-row">
            <div>
              <div className="t">{tx(lang, 'Change every')}</div>
              <div className="d">{tx(lang, 'Days between patch/ring changes')}</div>
            </div>
            <Stepper value={reg.changeEveryDays ?? 7} min={1} max={35} onChange={(v) => updateSettings({ contraception: { ...reg, changeEveryDays: v } })} suffix={tx(lang, 'd')} lang={lang} />
          </div>
        )}
        {reg.method !== 'none' && (
          <div className="set-row">
            <div>
              <div className="t">{tx(lang, 'Started on')}</div>
              <div className="d">{tx(lang, 'Anchors change/renewal reminders')}</div>
            </div>
            <input type="date" style={{ width: 150 }} value={reg.startDate ?? ''} onChange={(e) => updateSettings({ contraception: { ...reg, startDate: e.target.value || null } })} />
          </div>
        )}
        {['injection', 'implant', 'iud'].includes(reg.method) && (
          <div className="set-row">
            <div>
              <div className="t">{tx(lang, 'Next renewal')}</div>
              <div className="d">{tx(lang, 'Shown on your dashboard as it approaches')}</div>
            </div>
            <input type="date" style={{ width: 150 }} value={reg.nextRenewal ?? ''} onChange={(e) => updateSettings({ contraception: { ...reg, nextRenewal: e.target.value || null } })} />
          </div>
        )}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Trackers')}</h3>
        <p className="hint" style={{ margin: '0 0 8px' }}>{tx(lang, 'Show, hide, and reorder the sections in the daily log.')}</p>
        {effOrder.map((id) => {
          const s = TRACKER_SECTIONS.find((t) => t.id === id)!;
          const idx = effOrder.indexOf(s.id);
          const hidden = settings.trackerHidden.includes(s.id);
          const desc =
            s.id === 'symptoms'
              ? tx(lang, '{n} symptoms with severity', { n: SYMPTOMS.length })
              : s.id === 'mood'
                ? tx(lang, '{n} moods', { n: MOODS.length })
                : txd(lang, `sec.${s.id}.d`, s.description);
          return (
            <div
              key={s.id}
              ref={(el) => {
                rowRefs.current[s.id] = el;
              }}
              className="set-row"
              style={dragId === s.id ? { opacity: 0.55 } : undefined}
            >
              <span
                className="drag-handle"
                aria-hidden="true"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  dragIdRef.current = s.id;
                  setDragId(s.id);
                }}
                onPointerMove={(e) => {
                  if (dragIdRef.current) onDragMove(e.clientY);
                }}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                ⠿
              </span>
              <div>
                <div className="t" style={hidden ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>{txd(lang, `sec.${s.id}`, s.label)}</div>
                <div className="d">{desc}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="cal-nav" style={{ width: 36, height: 36, fontSize: 14 }} aria-label={tx(lang, 'Move {label} up', { label: txd(lang, `sec.${s.id}`, s.label) })} disabled={idx <= 0}
                  onClick={() => moveTracker(s.id, -1)}>↑</button>
                <button className="cal-nav" style={{ width: 36, height: 36, fontSize: 14 }} aria-label={tx(lang, 'Move {label} down', { label: txd(lang, `sec.${s.id}`, s.label) })} disabled={idx < 0 || idx >= effOrder.length - 1}
                  onClick={() => moveTracker(s.id, 1)}>↓</button>
                <button className={`chip${!hidden ? ' on' : ''}`} onClick={() => updateSettings({ trackerHidden: hidden ? settings.trackerHidden.filter((x) => x !== s.id) : [...settings.trackerHidden, s.id] })}>
                  {hidden ? tx(lang, 'Show') : tx(lang, 'Hide')}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Privacy & security')}</h3>
        <div className="set-row">
          <div>
            <div className="t">{tx(lang, 'App PIN')}</div>
            <div className="d">{settings.pinHash ? tx(lang, 'Asked when the app opens') : tx(lang, 'Protect the app with a PIN')}</div>
          </div>
          <button className="btn ghost sm" onClick={() => setPinModal(true)}>{settings.pinHash ? tx(lang, 'Change') : tx(lang, 'Set PIN')}</button>
        </div>
        {settings.pinHash && (
          <div className="set-row">
            <div>
              <div className="t">{tx(lang, 'Remove PIN')}</div>
              <div className="d">{tx(lang, 'Stop asking on launch')}</div>
            </div>
            <button className="btn ghost sm" onClick={clearPin}>{tx(lang, 'Remove')}</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Your data')}</h3>        <p className="hint" style={{ margin: '0 0 12px' }}>
          {tx(lang, 'Everything lives in this browser only. Export a backup before switching phones or clearing browser data - there is no copy anywhere else.')}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" onClick={() => exportData()}>{tx(lang, 'Export JSON')}</button>
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>{tx(lang, 'Import')}</button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {tx(lang, 'Takes tracker backups (.json), tracker CSV, Apple Health export (.xml), or wearable CSV (Oura, Fitbit, Withings).')}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,.csv,.xml"
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
          {confirmErase ? tx(lang, 'Tap again to erase everything') : tx(lang, 'Erase all data')}
        </button>
      </div>

      <div className="card">
        <h3>{tx(lang, 'Need support now?')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>{tx(lang, CRISIS_NOTE)}</p>
      </div>

      <div className="card">
        <h3>{tx(lang, 'About')}</h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0 }}>
          {tx(lang, 'Period Tracker v{version} - free and private. Predictions use the calendar method (ovulation ≈ 14 days before your next period); temperature and discharge signs add fertility awareness clues. All of it is estimation support, not medical advice.', { version: APP_VERSION })}
        </p>
        <p className="hint" style={{ marginTop: 8 }}>
          {tx(lang, 'Our pledge: tracking, predictions, reminders, and reports are free with no account and no ads — and they will never move behind a paywall. Fertility estimates are informational only and must never be used as contraception.')}
        </p>
      </div>

      {pinModal && (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setPinModal(false)}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="grab" />
            <h2>🔐 {tx(lang, 'App PIN')}</h2>
            <p className="hint" style={{ marginBottom: 14 }}>
              {tx(lang, '4-8 digits. This is a convenience gate, not encryption. Your data itself is unchanged on disk.')}
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
              {tx(lang, 'Save PIN')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function VerifyEmailCard({
  lang,
  otpApi,
}: {
  lang: string;
  otpApi: AppProps['otpApi'];
}) {
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <div className="card">
      <h3>{tx(lang, 'Verify your email')}</h3>
      <p className="hint" style={{ margin: '0 0 12px' }}>
        {tx(lang, 'Confirm your inbox with a 6-digit code. Your password stays as your sign-in.')}
      </p>
      {!sent ? (
        <button
          className="btn ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const r = await otpApi.request();
              if (r.verified) setDone(true);
              else setSent(true);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : tx(lang, 'Something went wrong.'));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tx(lang, 'Send code')}
        </button>
      ) : (
        <>
          <div className="field">
            <label htmlFor="st-otp">{tx(lang, '6-digit code')}</label>
            <input
              id="st-otp"
              className="num-in"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn ghost"
              disabled={busy || code.length !== 6}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                try {
                  await otpApi.verify(code);
                  setDone(true);
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : tx(lang, 'Something went wrong.'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tx(lang, 'Verify')}
            </button>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                try {
                  await otpApi.request();
                  setCode('');
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : tx(lang, 'Something went wrong.'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tx(lang, 'Resend code')}
            </button>
          </div>
        </>
      )}
      {msg && <p className="hint" style={{ marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
