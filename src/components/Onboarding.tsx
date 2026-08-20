import { useState } from 'react';
import { Mode, MODE_INFO, Settings } from '../types';
import { todayISO, addDays, fromISO, prettyDate } from '../lib/date';
import { dueFromLmp } from '../lib/pregnancy';
import { Logo } from './Icons';
import AccountScreen from './AccountScreen';
import PhonePreview from './PhonePreview';

const MODES: Mode[] = ['cycle', 'ttc', 'pregnant', 'perimenopause'];

export default function Onboarding({
  updateSettings,
}: {
  updateSettings: (patch: Partial<Settings>) => void;
}) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>('cycle');
  const [lastStart, setLastStart] = useState(addDays(todayISO(), -5));
  const [periodLength, setPeriodLength] = useState(5);
  const [cycleLength, setCycleLength] = useState(28);
  const [dueDate, setDueDate] = useState(addDays(todayISO(), 200));
  const [dueFromScan, setDueFromScan] = useState(true); // true: due date known; false: compute from LMP

  const isPregnant = mode === 'pregnant';
  const accountStep = isPregnant ? 2 : 3;
  const totalSteps = accountStep + 1;

  const finish = () => {
    updateSettings({
      onboarded: true,
      mode,
      lastPeriodStart: isPregnant ? null : lastStart || todayISO(),
      avgPeriodLength: periodLength,
      avgCycleLength: cycleLength,
      dueDate: isPregnant ? dueDate || addDays(todayISO(), 200) : null,
      predictionsPaused: isPregnant,
    });
  };

  const dateOk = (iso: string) => !isNaN(fromISO(iso).getTime());

  return (
    <div className="onboard">
      <div className="progress" aria-hidden>
        <div className="fill" style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
      </div>

      {step === 0 && (
        <div className="onboard-step" key="s0">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <Logo size={56} />
            <div>
              <h2 style={{ marginBottom: 0 }}>Welcome to Period&nbsp;Tracker</h2>
            </div>
          </div>
          <p className="lead">
            Track your cycle, predict your period and fertile window, and see your patterns. All of your data stays on your device.
          </p>

          <PhonePreview />

          <h2 style={{ fontSize: 19, marginBottom: 6 }}>What brings you here?</h2>
          <p className="lead">You can switch modes anytime in Settings. Nothing is locked in.</p>
          <div className="mode-grid">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`mode-card${mode === m ? ' on' : ''}`}
                onClick={() => setMode(m)}
              >
                <span className="mc-emoji" aria-hidden>{MODE_INFO[m].emoji}</span>
                <span className="mc-label">{MODE_INFO[m].label}</span>
                <span className="mc-blurb">{MODE_INFO[m].blurb}</span>
              </button>
            ))}
          </div>
          <div className="grow" />
          <button className="btn primary" onClick={() => setStep(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 1 && !isPregnant && (
        <div className="onboard-step" key="s1">
          <div className="steps">Step 2 of 3 · Your last period</div>
          <h2>When did your last period start?</h2>
          <p className="lead">
            {mode === 'perimenopause'
              ? 'Cycles getting harder to pin down? A rough date is fine. Irregularity is exactly what we will track.'
              : 'This anchors your first predictions. An approximate date is fine.'}
          </p>
          <div className="field">
            <label htmlFor="ob-start">First day of bleeding</label>
            <input
              id="ob-start"
              type="date"
              value={lastStart}
              max={todayISO()}
              onChange={(e) => setLastStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label>How many days did it last?</label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Stepper value={periodLength} min={1} max={14} onChange={setPeriodLength} suffix="days" />
            </div>
          </div>
          <div className="grow" />
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setStep(0)}>
            Back
          </button>
          <button className="btn primary" disabled={!dateOk(lastStart)} onClick={() => setStep(2)}>
            Continue
          </button>
        </div>
      )}

      {step === 1 && isPregnant && (
        <div className="onboard-step" key="s1p">
          <div className="steps">Step 2 of 2 · Your pregnancy</div>
          <h2>When is the baby due?</h2>
          <p className="lead">
            Period predictions pause automatically during pregnancy. This app switches to
            week by week tracking.
          </p>
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 18 }}>
            <button className={dueFromScan ? 'on' : ''} onClick={() => setDueFromScan(true)}>
              I know the date
            </button>
            <button className={!dueFromScan ? 'on' : ''} onClick={() => setDueFromScan(false)}>
              From last period
            </button>
          </div>
          {dueFromScan ? (
            <div className="field">
              <label htmlFor="ob-due">Due date (from a clinician or scan)</label>
              <input
                id="ob-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="ob-lmp">First day of your last period</label>
              <input
                id="ob-lmp"
                type="date"
                value={dueDate ? addDays(dueDate, -280) : ''}
                max={todayISO()}
                onChange={(e) => setDueDate(dueFromLmp(e.target.value))}
              />
              {dateOk(dueDate) && (
                <p className="hint">Estimated due date: {prettyDate(dueDate, { withYear: true })}</p>
              )}
            </div>
          )}
          <div className="grow" />
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setStep(0)}>
            Back
          </button>
          <button className="btn primary" disabled={!dateOk(dueDate)} onClick={() => setStep(accountStep)}>
            Continue
          </button>
        </div>
      )}

      {step === 2 && !isPregnant && (
        <div className="onboard-step" key="s2">
          <div className="steps">Step 3 of 3 · Your typical cycle</div>
          <h2>How long is your cycle?</h2>
          <p className="lead">
            From the first day of one period to the first day of the next. The average is around
            28 days. Anything from 21 to 35 is common.
          </p>
          <div className="field">
            <label>Cycle length</label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Stepper value={cycleLength} min={15} max={60} onChange={setCycleLength} suffix="days" />
            </div>
            <p className="hint" style={{ textAlign: 'center' }}>
              Not sure? Leave it at 28. The app learns your real pattern as you log.
            </p>
          </div>
          <div className="grow" />
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setStep(1)}>
            Back
          </button>
          <button className="btn primary" onClick={() => setStep(accountStep)}>
            Continue
          </button>
        </div>
      )}

      {step === accountStep && <AccountScreen user={null} onDone={finish} onSkip={finish} />}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - 1))}>
        -
      </button>
      <div className="val">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </div>
      <button type="button" aria-label="Increase" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}
