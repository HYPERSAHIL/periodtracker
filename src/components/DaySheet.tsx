import { useEffect, useState } from 'react';
import {
  DayEntry,
  FLOWS,
  MOODS,
  MUCUS_OPTIONS,
  SYMPTOMS,
  Settings,
} from '../types';
import { DayFacts, Phase } from '../lib/cycle';
import { prettyDate } from '../lib/date';

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
}: {
  date: string;
  entry: DayEntry | null;
  facts?: DayFacts;
  phase: Phase;
  settings: Settings;
  onClose: () => void;
  onSave: (e: DayEntry) => void;
  onDelete: () => void;
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
  }));
  const [bbtText, setBbtText] = useState(
    entry?.bbt != null ? String(round2(settings.tempUnit === 'F' ? cToF(entry.bbt) : entry.bbt)) : ''
  );
  const [weightText, setWeightText] = useState(
    entry?.weight != null ? String(round2(settings.weightUnit === 'lb' ? kgToLb(entry.weight) : entry.weight)) : ''
  );

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
    !d.routineImpact;

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
            <label>Flow</label>
            <div className="flow-row">
              <div
                className={`flow-opt${d.flow === null ? ' on' : ''}`}
                onClick={() => set({ flow: null })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && set({ flow: null })}
              >
                <div className="drops">-</div>
                None
              </div>
              {FLOWS.map((f) => (
                <div
                  key={f.id}
                  className={`flow-opt${d.flow === f.id ? ' on' : ''}`}
                  onClick={() => set({ flow: d.flow === f.id ? null : f.id })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && set({ flow: d.flow === f.id ? null : f.id })}
                >
                  <div className="drops">{'●'.repeat(f.dots)}</div>
                  {f.label}
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
                Clots
              </button>
            )}
          </div>
        );
      case 'checkin':
        return (
          <div className="field" key={id}>
            <label>Check-in</label>
            <button type="button" className={`chip${d.checkedIn ? ' on' : ''}`} onClick={() => set({ checkedIn: !d.checkedIn })}>
              ✓ I checked in today - this reflects how I felt
            </button>
            <p className="hint">Explicit check-ins make your insights trustworthy: a missing day means “forgot”, not “felt fine”.</p>
          </div>
        );
      case 'symptoms':
        return (
          <div className="field" key={id}>
            <label>Symptoms</label>
            <div className="chips">
              {SYMPTOMS.map((s) => (
                <button key={s} type="button" className={`chip${d.symptoms.includes(s) ? ' on' : ''}`} onClick={() => toggle('symptoms', s)}>
                  {s}
                </button>
              ))}
            </div>
            {d.symptoms.length > 0 && (
              <>
                <div className="chips" style={{ marginTop: 10 }}>
                  <span className="chip static">Overall severity:</span>
                  {SEVERITY_CYCLE.map((s) => (
                    <button key={s} type="button" className={`chip${d.symptomSeverity === s ? ' on' : ''}`} onClick={() => set({ symptomSeverity: d.symptomSeverity === s ? null : s })}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="chips" style={{ marginTop: 8 }}>
                  <span className="chip static">Affected my day:</span>
                  {IMPACT_CYCLE.map((s) => (
                    <button key={s} type="button" className={`chip${d.routineImpact === s ? ' on' : ''}`} onClick={() => set({ routineImpact: d.routineImpact === s ? null : s })}>
                      {s === 'none' ? 'Not much' : s === 'some' ? 'Somewhat' : 'A lot'}
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
            <label>Mood</label>
            <div className="chips">
              {MOODS.map((m) => (
                <button key={m.id} type="button" className={`chip${d.moods.includes(m.id) ? ' on' : ''}`} onClick={() => toggle('moods', m.id)}>
                  <span aria-hidden>{m.emoji}</span> {m.id}
                </button>
              ))}
            </div>
          </div>
        );
      case 'discharge':
        return (
          <div className="field" key={id}>
            <label>Discharge</label>
            <div className="chips">
              {MUCUS_OPTIONS.map((m) => (
                <button key={m.id} type="button" className={`chip${d.mucus === m.id ? ' on' : ''}`} onClick={() => set({ mucus: d.mucus === m.id ? null : m.id })}>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="hint">Egg-white or watery discharge often marks the most fertile days.</p>
          </div>
        );
      case 'measurements':
        return (
          <div className="two-col" key={id}>
            <div className="field">
              <label htmlFor="bbt-in">Temperature (°{settings.tempUnit})</label>
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
              <label htmlFor="weight-in">Weight ({settings.weightUnit})</label>
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
            <label>Tests</label>
            <div className="chips">
              <button type="button" className={`chip${d.lhTest === 'positive' ? 'on' : ''}`} onClick={() => set({ lhTest: d.lhTest === 'positive' ? null : 'positive' })}>
                🟣 LH positive
              </button>
              <button type="button" className={`chip${d.lhTest === 'negative' ? 'on' : ''}`} onClick={() => set({ lhTest: d.lhTest === 'negative' ? null : 'negative' })}>
                LH negative
              </button>
              <button type="button" className={`chip${d.pregnancyTest === 'positive' ? 'on' : ''}`} onClick={() => set({ pregnancyTest: d.pregnancyTest === 'positive' ? null : 'positive' })}>
                ✅ Preg. positive
              </button>
              <button type="button" className={`chip${d.pregnancyTest === 'faint' ? 'on' : ''}`} onClick={() => set({ pregnancyTest: d.pregnancyTest === 'faint' ? null : 'faint' })}>
                Faint line
              </button>
              <button type="button" className={`chip${d.pregnancyTest === 'negative' ? 'on' : ''}`} onClick={() => set({ pregnancyTest: d.pregnancyTest === 'negative' ? null : 'negative' })}>
                Preg. negative
              </button>
            </div>
          </div>
        );
      case 'intimacy':
        return (
          <div className="field" key={id}>
            <label>Intimacy</label>
            <div className="chips">
              <button type="button" className={`chip${d.intercourse === 'protected' ? 'on' : ''}`} onClick={() => set({ intercourse: d.intercourse === 'protected' ? null : 'protected' })}>
                💞 Protected
              </button>
              <button type="button" className={`chip${d.intercourse === 'unprotected' ? 'on' : ''}`} onClick={() => set({ intercourse: d.intercourse === 'unprotected' ? null : 'unprotected' })}>
                💞 Unprotected
              </button>
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="chip static">Drive:</span>
              {(['low', 'normal', 'high'] as const).map((v) => (
                <button key={v} type="button" className={`chip${d.drive === v ? ' on' : ''}`} onClick={() => set({ drive: d.drive === v ? null : v })}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        );
      case 'sleep':
        return (
          <div className="field" key={id}>
            <label>Sleep</label>
            <div className="chips">
              <span className="chip static">Hours:</span>
              {[5, 6, 7, 8, 9, 10].map((h) => (
                <button key={h} type="button" className={`chip${d.sleepHours === h ? ' on' : ''}`} onClick={() => set({ sleepHours: d.sleepHours === h ? null : h })}>
                  {h}
                </button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="chip static">Quality:</span>
              {(['poor', 'fair', 'good'] as const).map((q) => (
                <button key={q} type="button" className={`chip${d.sleepQuality === q ? ' on' : ''}`} onClick={() => set({ sleepQuality: d.sleepQuality === q ? null : q })}>
                  {q[0].toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
          </div>
        );
      case 'activity':
        return (
          <div className="field" key={id}>
            <label>Activity</label>
            <div className="two-col">
              <div>
                <label className="mini" htmlFor="ex-in">Exercise (min)</label>
                <input id="ex-in" className="num-in" type="number" inputMode="numeric" min="0" value={d.exerciseMinutes ?? ''} onChange={(e) => set({ exerciseMinutes: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
              </div>
              <div>
                <label className="mini" htmlFor="steps-in">Steps</label>
                <input id="steps-in" className="num-in" type="number" inputMode="numeric" min="0" step="500" value={d.steps ?? ''} onChange={(e) => set({ steps: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
              </div>
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="chip static">Water (glasses):</span>
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
            <label>Lifestyle</label>
            <div className="chips">
              <span className="chip static">Alcohol:</span>
              {[0, 1, 2, 3, 5].map((n) => (
                <button key={n} type="button" className={`chip${d.alcohol === n ? 'on' : ''}`} onClick={() => set({ alcohol: d.alcohol === n ? null : n })}>
                  {n === 0 ? 'None' : n}
                </button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="chip static">Caffeine (cups):</span>
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} type="button" className={`chip${d.caffeine === n ? 'on' : ''}`} onClick={() => set({ caffeine: d.caffeine === n ? null : n })}>
                  {n}
                </button>
              ))}
              <button type="button" className={`chip${d.smoked ? 'on' : ''}`} onClick={() => set({ smoked: !d.smoked })}>
                🚬 Smoked/vaped
              </button>
            </div>
          </div>
        );
      case 'meds':
        return (
          <div className="field" key={id}>
            <label>Medication</label>
            <div className="chips">
              <button type="button" className={`chip${d.pillTaken ? 'on' : ''}`} onClick={() => set({ pillTaken: !d.pillTaken, pillMissed: false })}>
                💊 Contraception taken
              </button>
              <button type="button" className={`chip${d.pillMissed ? 'on' : ''}`} onClick={() => set({ pillMissed: !d.pillMissed, pillTaken: false })}>
                ⏰ Missed / late
              </button>
              <button type="button" className={`chip${d.supplements ? 'on' : ''}`} onClick={() => set({ supplements: !d.supplements })}>
                🧬 Supplements/prenatal
              </button>
            </div>
          </div>
        );
      case 'note':
        return (
          <div className="field" key={id}>
            <label htmlFor="day-note">Notes</label>
            <textarea
              id="day-note"
              className="note"
              placeholder="Anything you want to remember about today…"
              value={d.note}
              onChange={(e) => set({ note: e.target.value })}
            />
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
          <span className="tag gray">{phase[0].toUpperCase() + phase.slice(1)} phase</span>
          {facts?.period && <span className="tag rose">Logged period</span>}
          {facts?.predicted && !facts?.period && <span className="tag rose">Predicted period</span>}
          {facts?.fertile && <span className="tag leaf">Fertile window</span>}
          {facts?.ovulation && <span className="tag leaf">Ovulation (est.)</span>}
        </div>

        {visible.map((id) => section(id))}

        <button className="btn primary" onClick={save}>
          {isEmpty ? 'Clear this day' : 'Save'}
        </button>
        {entry && (
          <button className="btn danger" style={{ marginTop: 10 }} onClick={onDelete}>
            Delete this log
          </button>
        )}
      </div>
    </div>
  );
}
