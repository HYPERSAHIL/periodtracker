import { useState } from 'react';
import { Mode, MODE_INFO, METHOD_INFO, ContraceptionMethod, Settings } from '../types';
import { todayISO, addDays, fromISO, prettyDate } from '../lib/date';
import { dueFromLmp } from '../lib/pregnancy';
import { Lang, tx, txd } from '../lib/i18n';
import { Logo } from './Icons';
import AccountScreen from './AccountScreen';
import { lazy, Suspense } from 'react';
const WorldsOnboarding = lazy(() => import('./WorldsOnboarding'));
import PhonePreview from './PhonePreview';

const MODES: Mode[] = ['cycle', 'ttc', 'pregnant', 'perimenopause', 'postpartum'];

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
  const [lang, setLang] = useState<Lang>('en');
  const [teen, setTeen] = useState(false);
  const [irregular, setIrregular] = useState(false);
  const [priorMethod, setPriorMethod] = useState<ContraceptionMethod | null>(null);
  const [tryingSince, setTryingSince] = useState('');
  const [worldsDone, setWorldsDone] = useState(false);

  const isPregnant = mode === 'pregnant';
  const isPostpartum = mode === 'postpartum';
  const accountStep = isPregnant ? 2 : 3;
  const totalSteps = accountStep + 1;

  const finish = () => {
    updateSettings({
      onboarded: true,
      mode,
      lang,
      teen,
      irregular: !isPregnant && !isPostpartum && irregular,
      showFertileWindow: teen ? false : true,
      lastPeriodStart: isPregnant || isPostpartum ? null : lastStart || todayISO(),
      avgPeriodLength: periodLength,
      avgCycleLength: cycleLength,
      dueDate: isPregnant ? dueDate || addDays(todayISO(), 200) : null,
      predictionsPaused: isPregnant || isPostpartum,
      postpartum: isPostpartum ? { birthDate: null, exclusiveBF: false } : undefined,
      priorMethod,
      tryingSince: mode === 'ttc' && tryingSince ? tryingSince : null,
    });
  };

  const dateOk = (iso: string) => !isNaN(fromISO(iso).getTime());

  if (!worldsDone) {
    return (
      <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
        <WorldsOnboarding onFinish={() => setWorldsDone(true)} />
      </Suspense>
    );
  }

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
              <h2 style={{ marginBottom: 0 }}>{tx(lang, 'Welcome to Period Tracker')}</h2>
            </div>
          </div>
          <p className="lead">
            {tx(lang, 'Track your cycle, predict your period and fertile window, and see your patterns. All of your data stays on your device.')}
          </p>

          <PhonePreview />

          <h2 style={{ fontSize: 19, marginBottom: 6 }}>{tx(lang, 'What brings you here?')}</h2>
          <p className="lead">{tx(lang, 'You can switch modes anytime in Settings. Nothing is locked in.')}</p>
          <div className="field" style={{ marginTop: 12 }}>
            <label>{tx(lang, 'Language')}</label>
            <div className="seg" role="radiogroup" aria-label={tx(lang, 'Language')} style={{ gridTemplateColumns: '1fr 1fr' }}>
              {(['en', 'hi'] as const).map((l) => (
                <button key={l} className={lang === l ? 'on' : ''} role="radio" aria-checked={lang === l} onClick={() => setLang(l)}>
                  {l === 'en' ? 'English' : 'हिन्दी'}
                </button>
              ))}
            </div>
          </div>
          <div className="mode-grid">
            {MODES.filter((m) => m === mode || !teen || (m !== 'ttc' && m !== 'pregnant')).map((m) => (
              <button
                key={m}
                type="button"
                className={`mode-card${mode === m ? ' on' : ''}`}
                onClick={() => setMode(m)}
              >
                <span className="mc-emoji" aria-hidden>{MODE_INFO[m].emoji}</span>
                <span className="mc-label">{txd(lang, `mode.${m}`, MODE_INFO[m].label)}</span>
                <span className="mc-blurb">{txd(lang, `mode.${m}.blurb`, MODE_INFO[m].blurb)}</span>
              </button>
            ))}
          </div>
          <div className="grow" />
          <button className="btn primary" onClick={() => setStep(1)}>
            {tx(lang, 'Continue')}
          </button>
          <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={() => setTeen(!teen)} aria-pressed={teen}>
            {teen ? `✓ ${tx(lang, 'Teen mode')}` : tx(lang, 'Teen mode: simpler, fertility content hidden')}
          </button>
        </div>
      )}

      {step === 1 && !isPregnant && (
        <div className="onboard-step" key="s1">
          <div className="steps">{tx(lang, 'Step 2 of 3 · Your last period')}</div>
          <h2>{tx(lang, 'When did your last period start?')}</h2>
          <p className="lead">
            {mode === 'perimenopause'
              ? tx(lang, 'Cycles getting harder to pin down? A rough date is fine. Irregularity is exactly what we will track.')
              : tx(lang, 'This anchors your first predictions. An approximate date is fine.')}
          </p>
          <div className="field">
            <label htmlFor="ob-start">{tx(lang, 'First day of bleeding')}</label>
            <input
              id="ob-start"
              type="date"
              value={lastStart}
              max={todayISO()}
              onChange={(e) => setLastStart(e.target.value)}
            />
          </div>
          <div className="field">
            <label>{tx(lang, 'How many days did it last?')}</label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Stepper value={periodLength} min={1} max={14} onChange={setPeriodLength} suffix={tx(lang, 'days')} lang={lang} />
            </div>
          </div>
          <div className="grow" />
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setStep(0)}>
            {tx(lang, 'Back')}
          </button>
          <button className="btn primary" disabled={!dateOk(lastStart)} onClick={() => setStep(2)}>
            {tx(lang, 'Continue')}
          </button>
        </div>
      )}

      {step === 1 && isPregnant && (
        <div className="onboard-step" key="s1p">
          <div className="steps">{tx(lang, 'Step 2 of 2 · Your pregnancy')}</div>
          <h2>{tx(lang, 'When is the baby due?')}</h2>
          <p className="lead">
            {tx(lang, 'Period predictions pause automatically during pregnancy. This app switches to week by week tracking.')}
          </p>
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 18 }}>
            <button className={dueFromScan ? 'on' : ''} onClick={() => setDueFromScan(true)}>
              {tx(lang, 'I know the date')}
            </button>
            <button className={!dueFromScan ? 'on' : ''} onClick={() => setDueFromScan(false)}>
              {tx(lang, 'From last period')}
            </button>
          </div>
          {dueFromScan ? (
            <div className="field">
              <label htmlFor="ob-due">{tx(lang, 'Due date (from a clinician or scan)')}</label>
              <input
                id="ob-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="ob-lmp">{tx(lang, 'First day of your last period')}</label>
              <input
                id="ob-lmp"
                type="date"
                value={dueDate ? addDays(dueDate, -280) : ''}
                max={todayISO()}
                onChange={(e) => setDueDate(e.target.value ? dueFromLmp(e.target.value) : '')}
              />
              {dateOk(dueDate) && (
                <p className="hint">{tx(lang, 'Estimated due date: {date}', { date: prettyDate(dueDate, { withYear: true }) })}</p>
              )}
            </div>
          )}
          <div className="grow" />
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setStep(0)}>
            {tx(lang, 'Back')}
          </button>
          <button className="btn primary" disabled={!dateOk(dueDate)} onClick={() => setStep(accountStep)}>
            {tx(lang, 'Continue')}
          </button>
        </div>
      )}

      {step === 2 && !isPregnant && (
        <div className="onboard-step" key="s2">
          <div className="steps">{tx(lang, 'Step 3 of 3 · Your typical cycle')}</div>
          <h2>{tx(lang, 'How long is your cycle?')}</h2>
          <p className="lead">
            {tx(lang, 'From the first day of one period to the first day of the next. The average is around 28 days. Anything from 21 to 35 is common.')}
          </p>
          <div className="field">
            <label>{tx(lang, 'Cycle length')}</label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Stepper value={cycleLength} min={15} max={60} onChange={setCycleLength} suffix={tx(lang, 'days')} lang={lang} />
            </div>
            <p className="hint" style={{ textAlign: 'center' }}>
              {tx(lang, 'Not sure? Leave it at 28. The app learns your real pattern as you log.')}
            </p>
            <button
              type="button"
              className={`chip${irregular ? ' on' : ''}`}
              style={{ marginTop: 10 }}
              aria-pressed={irregular}
              onClick={() => {
                const next = !irregular;
                setIrregular(next);
                if (next && cycleLength < 35) setCycleLength(35);
              }}
            >
              {irregular ? '✓ ' : ''}{tx(lang, 'Are your cycles irregular?')}
            </button>
            {irregular && (
              <p className="hint" style={{ textAlign: 'center' }}>
                {tx(lang, 'PCOS, postpartum, coming off the pill — predictions use wider windows and never nag about lateness.')}
              </p>
            )}
          </div>
          <div className="field">
            <label>{tx(lang, 'What were you using before? (optional)')}</label>
            <div className="chips" style={{ justifyContent: 'center' }}>
              {(['none', 'pill', 'patch', 'ring', 'injection', 'implant', 'iud', 'condom', 'other'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip${priorMethod === m ? ' on' : ''}`}
                  onClick={() => setPriorMethod(priorMethod === m ? null : m)}
                >
                  {txd(lang, `cm.${m}`, METHOD_INFO[m].label)}
                </button>
              ))}
            </div>
            <p className="hint" style={{ textAlign: 'center' }}>
              {tx(lang, 'Coming off hormonal methods can delay ovulation return — forecasts stay cautious.')}
            </p>
          </div>
          {mode === 'ttc' && (
            <div className="field">
              <label htmlFor="ob-trying">{tx(lang, 'Trying since (optional)')}</label>
              <input
                id="ob-trying"
                type="date"
                value={tryingSince}
                max={todayISO()}
                onChange={(e) => setTryingSince(e.target.value)}
              />
              <p className="hint" style={{ textAlign: 'center' }}>
                {tx(lang, 'Trying 12+ months (6+ over 35)? Guidelines suggest a fertility checkup.')}
              </p>
            </div>
          )}
          <div className="grow" />
          <button className="btn ghost" style={{ marginBottom: 10 }} onClick={() => setStep(1)}>
            {tx(lang, 'Back')}
          </button>
          <button className="btn primary" onClick={() => setStep(accountStep)}>
            {tx(lang, 'Continue')}
          </button>
        </div>
      )}

      {step === accountStep && <AccountScreen user={null} onDone={finish} onSkip={finish} lang={lang} />}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
  lang,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  lang?: string;
}) {
  return (
    <div className="stepper">
      <button type="button" aria-label={tx(lang, 'Decrease')} onClick={() => onChange(Math.max(min, value - 1))}>
        -
      </button>
      <div className="val">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </div>
      <button type="button" aria-label={tx(lang, 'Increase')} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}
