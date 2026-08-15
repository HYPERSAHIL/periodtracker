import { useState } from 'react';
import { Settings } from '../types';
import { todayISO, addDays, fromISO } from '../lib/date';
import { Logo } from './Icons';

export default function Onboarding({
  updateSettings,
}: {
  updateSettings: (patch: Partial<Settings>) => void;
}) {
  const [step, setStep] = useState(0);
  const [lastStart, setLastStart] = useState(addDays(todayISO(), -5));
  const [periodLength, setPeriodLength] = useState(5);
  const [cycleLength, setCycleLength] = useState(28);

  const finish = () => {
    updateSettings({
      onboarded: true,
      lastPeriodStart: lastStart || todayISO(),
      avgPeriodLength: periodLength,
      avgCycleLength: cycleLength,
    });
  };

  const dateOk = (() => {
    try {
      return !isNaN(fromISO(lastStart).getTime());
    } catch {
      return false;
    }
  })();

  return (
    <div className="onboard">
      <div className="progress" aria-hidden>
        <div className="fill" style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      {step === 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <Logo size={56} />
            <div>
              <h2 style={{ marginBottom: 0 }}>Welcome to Period&nbsp;Tracker</h2>
            </div>
          </div>
          <p className="lead">
            Track your cycle, predict your next period and fertile window, and see your patterns —
            with all of your data staying on your device.
          </p>
          <ul className="privacy-list">
            <li>
              <span className="ic">✓</span>
              <span><strong>No account, no cloud, no tracking.</strong> Everything is stored locally in your browser.</span>
            </li>
            <li>
              <span className="ic">✓</span>
              <span><strong>Predictions you can understand.</strong> Based on your own logged cycles, not a black box.</span>
            </li>
            <li>
              <span className="ic">✓</span>
              <span><strong>Free forever</strong> — and open source, so anyone can verify the claims above.</span>
            </li>
          </ul>
          <div className="grow" />
          <button className="btn primary" onClick={() => setStep(1)}>
            Get started
          </button>
          <p className="hint" style={{ textAlign: 'center' }}>
            Takes less than a minute — you can edit everything later.
          </p>
        </>
      )}

      {step === 1 && (
        <>
          <div className="steps">Step 2 of 3 · Your last period</div>
          <h2>When did your last period start?</h2>
          <p className="lead">This anchors your first predictions. An approximate date is fine.</p>
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
          <button className="btn primary" disabled={!dateOk} onClick={() => setStep(2)}>
            Continue
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="steps">Step 3 of 3 · Your typical cycle</div>
          <h2>How long is your cycle?</h2>
          <p className="lead">
            From the first day of one period to the first day of the next. The average is around
            28 days — anything from 21 to 35 is common.
          </p>
          <div className="field">
            <label>Cycle length</label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Stepper value={cycleLength} min={15} max={60} onChange={setCycleLength} suffix="days" />
            </div>
            <p className="hint" style={{ textAlign: 'center' }}>
              Not sure? Leave it at 28 — the app learns your real pattern as you log.
            </p>
          </div>
          <div className="grow" />
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setStep(1)}>
            Back
          </button>
          <button className="btn primary" onClick={finish}>
            Start tracking
          </button>
        </>
      )}
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
        −
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
