import { useEffect, useRef, useState } from 'react';
import {
  DayEntry,
  FLOWS,
  MOODS,
  MUCUS_OPTIONS,
  PAIN_AREAS,
  SYMPTOMS,
  Settings,
} from '../types';
import { DayFacts, Phase } from '../lib/cycle';
import { prettyDate } from '../lib/date';
import { tx, txd } from '../lib/i18n';

const cToF = (c: number) => (c * 9) / 5 + 32;
const fToC = (f: number) => ((f - 32) * 5) / 9;
const kgToLb = (kg: number) => kg * 2.20462;
const lbToKg = (lb: number) => lb / 2.20462;
const round2 = (n: number) => Math.round(n * 100) / 100;

const SEVERITY_CYCLE = ['mild', 'moderate', 'severe'] as const;
const IMPACT_CYCLE = ['none', 'some', 'lot'] as const;

export default function DaySheet({
  date,
  entry,
  facts,
  phase,
  settings,
  onClose,
  onSave,
  onDelete,
  updateSettings,
}: {
  date: string;
  entry: DayEntry | null;
  facts?: DayFacts;
  phase: Phase;
  settings: Settings;
  onClose: () => void;
  onSave: (e: DayEntry) => void;
  onDelete: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}) {
  const [d, setD] = useState<DayEntry>(() => ({
    date,
    checkedIn: entry?.checkedIn ?? false,
    flow: entry?.flow ?? null,
    clots: entry?.clots ?? false,
    symptoms: entry?.symptoms ?? [],
    moods: entry?.moods ?? [],
    note: entry?.note ?? '',
    mucus: entry?.mucus ?? null,
    bbt: entry?.bbt ?? null,
    weight: entry?.weight ?? null,
    lhTest: entry?.lhTest ?? null,
    pregnancyTest: entry?.pregnancyTest ?? null,
    intercourse: entry?.intercourse ?? null,
    drive: entry?.drive ?? null,
    sleepHours: entry?.sleepHours ?? null,
    sleepQuality: entry?.sleepQuality ?? null,
    water: entry?.water ?? null,
    steps: entry?.steps ?? null,
    exerciseMinutes: entry?.exerciseMinutes ?? null,
    alcohol: entry?.alcohol ?? null,
    caffeine: entry?.caffeine ?? null,
    smoked: entry?.smoked ?? false,
    supplements: entry?.supplements ?? false,
    pillTaken: entry?.pillTaken ?? false,
    pillMissed: entry?.pillMissed ?? false,
    symptomSeverity: entry?.symptomSeverity ?? null,
    routineImpact: entry?.routineImpact ?? null,
    painLevel: entry?.painLevel ?? null,
    painAreas: entry?.painAreas ?? [],
    migraine: entry?.migraine ?? false,
    migraineAura: entry?.migraineAura ?? false,
    migraineMed: entry?.migraineMed ?? false,
    migraineHelped: entry?.migraineHelped ?? false,
    giIssues: entry?.giIssues ?? false,
    bladderPain: entry?.bladderPain ?? false,
    endoFlare: entry?.endoFlare ?? false,
  }));
  const [bbtText, setBbtText] = useState(
    entry?.bbt != null ? String(round2(settings.tempUnit === 'F' ? cToF(entry.bbt) : entry.bbt)) : ''
  );
  const [weightText, setWeightText] = useState(
    entry?.weight != null ? String(round2(settings.weightUnit === 'lb' ? kgToLb(entry.weight) : entry.weight)) : ''
  );
  const lang = settings.lang;

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (patch: Partial<DayEntry>) => setD((prev) => ({ ...prev, ...patch }));

  const toggle = (list: 'symptoms' | 'moods', s: string) =>
    set({
      [list]: d[list].includes(s) ? d[list].filter((x) => x !== s) : [...d[list], s],
    } as Partial<DayEntry>);

  const parsedBbt = parseFloat(bbtText);
  const parsedWeight = parseFloat(weightText);
  const bbtC = Number.isFinite(parsedBbt) && parsedBbt > 0 ? (settings.tempUnit === 'F' ? fToC(parsedBbt) : parsedBbt) : null;
  const weightKg =
    Number.isFinite(parsedWeight) && parsedWeight > 0
      ? settings.weightUnit === 'lb'
        ? lbToKg(parsedWeight)
        : parsedWeight
      : null;

  const isEmpty =
    !d.checkedIn &&
    !d.flow &&
    !d.clots &&
    d.symptoms.length === 0 &&
    d.moods.length === 0 &&
    !d.note.trim() &&
    !d.mucus &&
    bbtC === null &&
    weightKg === null &&
    !d.lhTest &&
    !d.pregnancyTest &&
    !d.intercourse &&
    !d.drive &&
    d.sleepHours == null &&
    !d.sleepQuality &&
    d.water == null &&
    d.steps == null &&
    d.exerciseMinutes == null &&
    d.alcohol == null &&
    d.caffeine == null &&
    !d.smoked &&
    !d.supplements &&
    !d.pillTaken &&
    !d.pillMissed &&
    !d.symptomSeverity &&
    !d.routineImpact &&
    d.painLevel == null &&
    d.painAreas.length === 0 &&
    !d.migraine &&
    !d.migraineAura &&
    !d.migraineMed &&
    !d.migraineHelped &&
    !d.giIssues &&
    !d.bladderPain &&
    !d.endoFlare;

  const save = () => {
    if (isEmpty) {
      onDelete();
      return;
    }
    onSave({
      ...d,
      bbt: bbtC != null ? round2(bbtC) : null,
      weight: weightKg != null ? round2(weightKg) : null,
      note: d.note.trim(),
    });
  };

  const order = settings.trackerOrder.length
    ? settings.trackerOrder
    : ['flow', 'checkin', 'symptoms', 'mood', 'discharge', 'measurements', 'tests', 'intimacy', 'sleep', 'activity', 'lifestyle', 'meds', 'note'];
  const visible = order.filter((id) => !settings.trackerHidden.includes(id));

  const section = (id: string) => {
    switch (id) {
      case 'flow':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Flow')}</label>
            <div className="flow-row">
              <div
                className={`flow-opt${d.flow === null ? ' on' : ''}`}
                onClick={() => set({ flow: null })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && set({ flow: null })}
              >
                <div className="drops">-</div>
                {tx(lang, 'None')}
              </div>
              {FLOWS.map((f) => (
                <div
                  key={f.id}
                  className={`flow-opt${d.flow === f.id ? ' on' : ''}`}
                  onClick={() => set({ flow: d.flow === f.id ? null : f.id })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && set({ flow: d.flow === f.id ? null : f.id })}
                >
                  <div className="drops">{'●'.repeat(f.dots)}</div>
                  {txd(lang, `flow.${f.id}`, f.label)}
                </div>
              ))}
            </div>
            {d.flow && (
              <button
                type="button"
                className={`chip${d.clots ? ' on' : ''}`}
                style={{ marginTop: 8 }}
                onClick={() => set({ clots: !d.clots })}
              >
                {tx(lang, 'Clots')}
              </button>
            )}
          </div>
        );
      case 'checkin':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Check-in')}</label>
            <button type="button" className={`chip${d.checkedIn ? ' on' : ''}`} onClick={() => set({ checkedIn: !d.checkedIn })}>
              {tx(lang, '✓ I checked in today. This reflects how I felt')}
            </button>
            <p className="hint">{tx(lang, 'Explicit check ins make your insights trustworthy: a missing day means “forgot”, not “felt fine”.')}</p>
          </div>
        );
      case 'symptoms':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Symptoms')}</label>
            <div className="chips">
              {SYMPTOMS.map((s) => (
                <button key={s} type="button" className={`chip${d.symptoms.includes(s) ? ' on' : ''}`} onClick={() => toggle('symptoms', s)}>
                  {txd(lang, `symptom.${s}`, s)}
                </button>
              ))}
              {(settings.customSymptoms ?? []).map((s) => (
                <button key={'c:' + s} type="button" className={`chip${d.symptoms.includes(s) ? ' on' : ''}`} onClick={() => toggle('symptoms', s)}>
                  {s}
                </button>
              ))}
            </div>
            <CustomAdd
              lang={lang}
              placeholder={tx(lang, 'New symptom…')}
              onAdd={(v) => {
                const list = settings.customSymptoms ?? [];
                if (list.length >= 20 || list.includes(v)) return;
                updateSettings({ customSymptoms: [...list, v] });
              }}
            />
            {d.symptoms.length > 0 && (
              <>
                <div className="chips" style={{ marginTop: 10 }}>
                  <span className="chip static">{tx(lang, 'Overall severity:')}</span>
                  {SEVERITY_CYCLE.map((s) => (
                    <button key={s} type="button" className={`chip${d.symptomSeverity === s ? ' on' : ''}`} onClick={() => set({ symptomSeverity: d.symptomSeverity === s ? null : s })}>
                      {txd(lang, `sev.${s}`, s[0].toUpperCase() + s.slice(1))}
                    </button>
                  ))}
                </div>
                <div className="chips" style={{ marginTop: 8 }}>
                  <span className="chip static">{tx(lang, 'Affected my day:')}</span>
                  {IMPACT_CYCLE.map((s) => (
                    <button key={s} type="button" className={`chip${d.routineImpact === s ? ' on' : ''}`} onClick={() => set({ routineImpact: d.routineImpact === s ? null : s })}>
                      {txd(lang, `impact.${s}`, s === 'none' ? 'Not much' : s === 'some' ? 'Somewhat' : 'A lot')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      case 'mood':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Mood')}</label>
            <div className="chips">
              {MOODS.map((m) => (
                <button key={m.id} type="button" className={`chip${d.moods.includes(m.id) ? ' on' : ''}`} onClick={() => toggle('moods', m.id)}>
                  <span aria-hidden>{m.emoji}</span> {txd(lang, `mood.${m.id}`, m.id)}
                </button>
              ))}
              {(settings.customMoods ?? []).map((s) => (
                <button key={'c:' + s} type="button" className={`chip${d.moods.includes(s) ? ' on' : ''}`} onClick={() => toggle('moods', s)}>
                  {s}
                </button>
              ))}
            </div>
            <CustomAdd
              lang={lang}
              placeholder={tx(lang, 'New mood…')}
              onAdd={(v) => {
                const list = settings.customMoods ?? [];
                if (list.length >= 20 || list.includes(v)) return;
                updateSettings({ customMoods: [...list, v] });
              }}
            />
          </div>
        );
      case 'discharge':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Discharge')}</label>
            <div className="chips">
              {MUCUS_OPTIONS.map((m) => (
                <button key={m.id} type="button" className={`chip${d.mucus === m.id ? ' on' : ''}`} onClick={() => set({ mucus: d.mucus === m.id ? null : m.id })}>
                  {txd(lang, `mucus.${m.id}`, m.label)}
                </button>
              ))}
            </div>
            <p className="hint">{tx(lang, 'Egg-white or watery discharge often marks the most fertile days.')}</p>
          </div>
        );
      case 'measurements':
        return (
          <div className="two-col" key={id}>
            <div className="field">
              <label htmlFor="bbt-in">{tx(lang, 'Temperature ({u})', { u: settings.tempUnit })}</label>
              <input
                id="bbt-in"
                className="num-in"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder={settings.tempUnit === 'C' ? '36.5' : '97.7'}
                value={bbtText}
                onChange={(e) => setBbtText(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="weight-in">{tx(lang, 'Weight ({u})', { u: settings.weightUnit })}</label>
              <input
                id="weight-in"
                className="num-in"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder={settings.weightUnit === 'kg' ? '60.0' : '132'}
                value={weightText}
                onChange={(e) => setWeightText(e.target.value)}
              />
            </div>
          </div>
        );
      case 'tests':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Tests')}</label>
            <div className="chips">
              <button type="button" className={`chip${d.lhTest === 'positive' ? ' on' : ''}`} onClick={() => set({ lhTest: d.lhTest === 'positive' ? null : 'positive' })}>
                🟣 {tx(lang, 'LH positive')}
              </button>
              <button type="button" className={`chip${d.lhTest === 'negative' ? ' on' : ''}`} onClick={() => set({ lhTest: d.lhTest === 'negative' ? null : 'negative' })}>
                {tx(lang, 'LH negative')}
              </button>
              <button type="button" className={`chip${d.pregnancyTest === 'positive' ? ' on' : ''}`} onClick={() => set({ pregnancyTest: d.pregnancyTest === 'positive' ? null : 'positive' })}>
                ✅ {tx(lang, 'Preg. positive')}
              </button>
              <button type="button" className={`chip${d.pregnancyTest === 'faint' ? ' on' : ''}`} onClick={() => set({ pregnancyTest: d.pregnancyTest === 'faint' ? null : 'faint' })}>
                {tx(lang, 'Faint line')}
              </button>
              <button type="button" className={`chip${d.pregnancyTest === 'negative' ? ' on' : ''}`} onClick={() => set({ pregnancyTest: d.pregnancyTest === 'negative' ? null : 'negative' })}>
                {tx(lang, 'Preg. negative')}
              </button>
            </div>
          </div>
        );
      case 'intimacy':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Intimacy')}</label>
            <div className="chips">
              <button type="button" className={`chip${d.intercourse === 'protected' ? ' on' : ''}`} onClick={() => set({ intercourse: d.intercourse === 'protected' ? null : 'protected' })}>
                💞 {tx(lang, 'Protected')}
              </button>
              <button type="button" className={`chip${d.intercourse === 'unprotected' ? ' on' : ''}`} onClick={() => set({ intercourse: d.intercourse === 'unprotected' ? null : 'unprotected' })}>
                💞 {tx(lang, 'Unprotected')}
              </button>
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="chip static">{tx(lang, 'Drive:')}</span>
              {(['low', 'normal', 'high'] as const).map((v) => (
                <button key={v} type="button" className={`chip${d.drive === v ? ' on' : ''}`} onClick={() => set({ drive: d.drive === v ? null : v })}>
                  {txd(lang, `drive.${v}`, v[0].toUpperCase() + v.slice(1))}
                </button>
              ))}
            </div>
          </div>
        );
      case 'sleep':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Sleep')}</label>
            <div className="chips">
              <span className="chip static">{tx(lang, 'Hours:')}</span>
              {[5, 6, 7, 8, 9, 10].map((h) => (
                <button key={h} type="button" className={`chip${d.sleepHours === h ? ' on' : ''}`} onClick={() => set({ sleepHours: d.sleepHours === h ? null : h })}>
                  {h}
                </button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="chip static">{tx(lang, 'Quality:')}</span>
              {(['poor', 'fair', 'good'] as const).map((q) => (
                <button key={q} type="button" className={`chip${d.sleepQuality === q ? ' on' : ''}`} onClick={() => set({ sleepQuality: d.sleepQuality === q ? null : q })}>
                  {txd(lang, `sleepq.${q}`, q[0].toUpperCase() + q.slice(1))}
                </button>
              ))}
            </div>
          </div>
        );
      case 'activity':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Activity')}</label>
            <div className="two-col">
              <div>
                <label className="mini" htmlFor="ex-in">{tx(lang, 'Exercise (min)')}</label>
                <input id="ex-in" className="num-in" type="number" inputMode="numeric" min="0" value={d.exerciseMinutes ?? ''} onChange={(e) => { const n = Number(e.target.value); set({ exerciseMinutes: e.target.value === '' || !Number.isFinite(n) ? null : Math.max(0, n) }); }} />
              </div>
              <div>
                <label className="mini" htmlFor="steps-in">{tx(lang, 'Steps')}</label>
                <input id="steps-in" className="num-in" type="number" inputMode="numeric" min="0" step="500" value={d.steps ?? ''} onChange={(e) => { const n = Number(e.target.value); set({ steps: e.target.value === '' || !Number.isFinite(n) ? null : Math.max(0, n) }); }} />
              </div>
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="chip static">{tx(lang, 'Water (glasses):')}</span>
              {[2, 4, 6, 8, 10].map((w) => (
                <button key={w} type="button" className={`chip${d.water === w ? ' on' : ''}`} onClick={() => set({ water: d.water === w ? null : w })}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        );
      case 'lifestyle':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Lifestyle')}</label>
            <div className="chips">
              <span className="chip static">{tx(lang, 'Alcohol:')}</span>
              {[0, 1, 2, 3, 5].map((n) => (
                <button key={n} type="button" className={`chip${d.alcohol === n ? ' on' : ''}`} onClick={() => set({ alcohol: d.alcohol === n ? null : n })}>
                  {n === 0 ? tx(lang, 'None') : n}
                </button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="chip static">{tx(lang, 'Caffeine (cups):')}</span>
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} type="button" className={`chip${d.caffeine === n ? ' on' : ''}`} onClick={() => set({ caffeine: d.caffeine === n ? null : n })}>
                  {n}
                </button>
              ))}
              <button type="button" className={`chip${d.smoked ? ' on' : ''}`} onClick={() => set({ smoked: !d.smoked })}>
                🚬 {tx(lang, 'Smoked/vaped')}
              </button>
            </div>
          </div>
        );
      case 'meds':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Medication')}</label>
            <div className="chips">
              <button type="button" className={`chip${d.pillTaken ? ' on' : ''}`} onClick={() => set({ pillTaken: !d.pillTaken, pillMissed: false })}>
                💊 {tx(lang, 'Contraception taken')}
              </button>
              <button type="button" className={`chip${d.pillMissed ? ' on' : ''}`} onClick={() => set({ pillMissed: !d.pillMissed, pillTaken: false })}>
                ⏰ {tx(lang, 'Missed / late')}
              </button>
              <button type="button" className={`chip${d.supplements ? ' on' : ''}`} onClick={() => set({ supplements: !d.supplements })}>
                🧬 {tx(lang, 'Supplements/prenatal')}
              </button>
            </div>
          </div>
        );
      case 'pain':
        return (
          <div className="field" key={id}>
            <label htmlFor="pain-range">{tx(lang, 'Pain (0-10)')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                id="pain-range"
                type="range"
                min={0}
                max={10}
                step={1}
                value={d.painLevel ?? 0}
                onChange={(e) => set({ painLevel: Number(e.target.value) })}
                style={{ flex: 1 }}
                aria-valuetext={d.painLevel == null ? tx(lang, 'No pain logged') : `${d.painLevel}/10`}
              />
              <strong style={{ minWidth: 44, textAlign: 'center', fontSize: 17 }}>
                {d.painLevel == null ? '–' : `${d.painLevel}/10`}
              </strong>
              {d.painLevel != null && (
                <button type="button" className="chip" onClick={() => set({ painLevel: null })}>
                  {tx(lang, 'Clear')}
                </button>
              )}
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              {PAIN_AREAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`chip${d.painAreas.includes(a.id) ? ' on' : ''}`}
                  onClick={() =>
                    set({ painAreas: d.painAreas.includes(a.id) ? d.painAreas.filter((x) => x !== a.id) : [...d.painAreas, a.id] })
                  }
                >
                  <span aria-hidden>{a.emoji}</span> {txd(lang, `pain.${a.id}`, a.id)}
                </button>
              ))}
            </div>
            <p className="hint">{tx(lang, 'Rate cramp or pain and mark where. Severe or new pain is worth a clinician visit.')}</p>
          </div>
        );
      case 'headache':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Headache & migraine')}</label>
            <div className="chips">
              <button type="button" className={`chip${d.migraine ? ' on' : ''}`} onClick={() => set({ migraine: !d.migraine })}>
                {tx(lang, 'Migraine day')}
              </button>
              <button type="button" className={`chip${d.migraineAura ? ' on' : ''}`} onClick={() => set({ migraineAura: !d.migraineAura })}>
                {tx(lang, 'Aura')}
              </button>
              <button type="button" className={`chip${d.migraineMed ? ' on' : ''}`} onClick={() => set({ migraineMed: !d.migraineMed })}>
                {tx(lang, 'Took med')}
              </button>
              <button type="button" className={`chip${d.migraineHelped ? ' on' : ''}`} onClick={() => set({ migraineHelped: !d.migraineHelped })}>
                {tx(lang, 'Med helped')}
              </button>
            </div>
            <p className="hint">{tx(lang, 'Migraines clustering 2 days before to 3 days after period start may be menstrual-related.')}</p>
          </div>
        );
      case 'endo':
        return (
          <div className="field" key={id}>
            <label>{tx(lang, 'Endo & pelvic')}</label>
            <div className="chips">
              <button type="button" className={`chip${d.endoFlare ? ' on' : ''}`} onClick={() => set({ endoFlare: !d.endoFlare })}>
                {tx(lang, 'Flare day')}
              </button>
              <button type="button" className={`chip${d.giIssues ? ' on' : ''}`} onClick={() => set({ giIssues: !d.giIssues })}>
                {tx(lang, 'Bowel / GI issues')}
              </button>
              <button type="button" className={`chip${d.bladderPain ? ' on' : ''}`} onClick={() => set({ bladderPain: !d.bladderPain })}>
                {tx(lang, 'Bladder pain')}
              </button>
            </div>
            <p className="hint">{tx(lang, 'Flares outside bleeding days are the pattern clinicians look for.')}</p>
          </div>
        );
      case 'note':
        return (
          <div className="field" key={id}>
            <label htmlFor="day-note">{tx(lang, 'Notes')}</label>
            <textarea
              id="day-note"
              className="note"
              placeholder={tx(lang, 'Anything you want to remember about today…')}
              value={d.note}
              maxLength={2000}
              onChange={(e) => set({ note: e.target.value.slice(0, 2000) })}
            />
            <VoiceNote lang={lang} onText={(t) => set({ note: (d.note ? d.note + '\n' : '') + t.slice(0, 2000 - d.note.length - 1) })} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Log for ${date}`}>
        <div className="grab" />
        <h2>{prettyDate(date, { withYear: true, weekday: true })}</h2>
        <div className="sub">
          <span className="tag gray">{txd(lang, `phase.${phase}`, phase[0].toUpperCase() + phase.slice(1) + ' phase')}</span>
          {facts?.period && <span className="tag rose">{tx(lang, 'Logged period')}</span>}
          {facts?.predicted && !facts?.period && <span className="tag rose">{tx(lang, 'Predicted period')}</span>}
          {facts?.fertile && <span className="tag leaf">{tx(lang, 'Fertile window')}</span>}
          {facts?.ovulation && <span className="tag leaf">{tx(lang, 'Ovulation (est.)')}</span>}
        </div>

        {visible.map((id) => section(id))}

        <button className="btn primary" onClick={save}>
          {isEmpty ? tx(lang, 'Clear this day') : tx(lang, 'Save')}
        </button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>
          {tx(lang, 'Close')}
        </button>
        {entry && (
          <button className="btn danger" style={{ marginTop: 10 }} onClick={onDelete}>
            {tx(lang, 'Delete this log')}
          </button>
        )}
      </div>
    </div>
  );
}

function CustomAdd({ lang, placeholder, onAdd }: { lang: string; placeholder: string; onAdd: (v: string) => void }) {  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="chip" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        ＋ {tx(lang, 'Custom')}
      </button>
    );
  }
  const commit = () => {
    const v = text.trim().slice(0, 24);
    if (v) onAdd(v);
    setText('');
    setOpen(false);
  };
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input
        className="num-in"
        style={{ flex: 1 }}
        value={text}
        maxLength={24}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button type="button" className="btn ghost sm" onClick={commit}>
        {tx(lang, 'Add')}
      </button>
    </div>
  );
}

interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/** Free on-device/cloud voice input (Web Speech API, no key). Hidden where unsupported. */
function VoiceNote({ lang, onText }: { lang: string; onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const Ctor =
    typeof window !== 'undefined'
      ? (window as unknown as Record<string, (new () => SpeechRec) | undefined>)[
          'SpeechRecognition'
        ] ??
        (window as unknown as Record<string, (new () => SpeechRec) | undefined>)[
          'webkitSpeechRecognition'
        ]
      : undefined;
  if (!Ctor) return null;
  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (ev) => {
        const t = ev.results[ev.results.length - 1]?.[0]?.transcript?.trim();
        if (t) onText(t);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };
  return (
    <button type="button" className="chip" style={{ marginTop: 8 }} onClick={toggle} aria-pressed={listening}>
      {listening ? `⏹ ${tx(lang, 'Stop listening')}` : `🎙 ${tx(lang, 'Dictate note')}`}
    </button>
  );
}
