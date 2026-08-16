import { useEffect, useState } from 'react';
import { DayEntry, FLOWS, MOODS, MUCUS_OPTIONS, SYMPTOMS } from '../types';
import { DayFacts, Phase } from '../lib/cycle';
import { prettyDate } from '../lib/date';

const cToF = (c: number) => (c * 9) / 5 + 32;
const fToC = (f: number) => ((f - 32) * 5) / 9;
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function DaySheet({
  date,
  entry,
  facts,
  phase,
  tempUnit,
  weightUnit,
  onClose,
  onSave,
  onDelete,
}: {
  date: string;
  entry: DayEntry | null;
  facts?: DayFacts;
  phase: Phase;
  tempUnit: 'C' | 'F';
  weightUnit: 'kg' | 'lb';
  onClose: () => void;
  onSave: (e: DayEntry) => void;
  onDelete: () => void;
}) {
  const [flow, setFlow] = useState<DayEntry['flow']>(entry?.flow ?? null);
  const [symptoms, setSymptoms] = useState<string[]>(entry?.symptoms ?? []);
  const [moods, setMoods] = useState<string[]>(entry?.moods ?? []);
  const [note, setNote] = useState(entry?.note ?? '');
  const [mucus, setMucus] = useState<DayEntry['mucus']>(entry?.mucus ?? null);
  const [bbt, setBbt] = useState<string>(
    entry?.bbt != null ? String(round2(tempUnit === 'F' ? cToF(entry.bbt) : entry.bbt)) : ''
  );
  const [weight, setWeight] = useState<string>(
    entry?.weight != null
      ? String(round2(weightUnit === 'lb' ? entry.weight * 2.20462 : entry.weight))
      : ''
  );
  const [lhTest, setLhTest] = useState<DayEntry['lhTest']>(entry?.lhTest ?? null);
  const [pregnancyTest, setPregnancyTest] = useState<DayEntry['pregnancyTest']>(
    entry?.pregnancyTest ?? null
  );
  const [intercourse, setIntercourse] = useState(entry?.intercourse ?? false);
  const [contraception, setContraception] = useState(entry?.contraception ?? false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggle = (list: string[], setList: (v: string[]) => void, s: string) =>
    setList(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

  const parsedBbt = parseFloat(bbt);
  const parsedWeight = parseFloat(weight);
  const bbtC = Number.isFinite(parsedBbt) && parsedBbt > 0 ? (tempUnit === 'F' ? fToC(parsedBbt) : parsedBbt) : null;
  const weightKg =
    Number.isFinite(parsedWeight) && parsedWeight > 0
      ? weightUnit === 'lb'
        ? parsedWeight / 2.20462
        : parsedWeight
      : null;

  const isEmpty =
    !flow &&
    symptoms.length === 0 &&
    moods.length === 0 &&
    !note.trim() &&
    !mucus &&
    bbtC === null &&
    weightKg === null &&
    !lhTest &&
    !pregnancyTest &&
    !intercourse &&
    !contraception;

  const save = () => {
    if (isEmpty) {
      onDelete();
      return;
    }
    onSave({
      date,
      flow,
      symptoms,
      moods,
      note: note.trim(),
      mucus,
      bbt: bbtC != null ? round2(bbtC) : null,
      weight: weightKg != null ? round2(weightKg) : null,
      lhTest,
      pregnancyTest,
      intercourse,
      contraception,
    });
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

        <div className="field">
          <label>Flow</label>
          <div className="flow-row">
            <div
              className={`flow-opt${flow === null ? ' on' : ''}`}
              onClick={() => setFlow(null)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setFlow(null)}
            >
              <div className="drops">—</div>
              None
            </div>
            {FLOWS.map((f) => (
              <div
                key={f.id}
                className={`flow-opt${flow === f.id ? ' on' : ''}`}
                onClick={() => setFlow(flow === f.id ? null : f.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setFlow(flow === f.id ? null : f.id)}
              >
                <div className="drops">{'●'.repeat(f.dots)}</div>
                {f.label}
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Symptoms</label>
          <div className="chips">
            {SYMPTOMS.map((s) => (
              <button key={s} type="button" className={`chip${symptoms.includes(s) ? ' on' : ''}`} onClick={() => toggle(symptoms, setSymptoms, s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Mood</label>
          <div className="chips">
            {MOODS.map((m) => (
              <button key={m.id} type="button" className={`chip${moods.includes(m.id) ? ' on' : ''}`} onClick={() => toggle(moods, setMoods, m.id)}>
                <span aria-hidden>{m.emoji}</span> {m.id}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Discharge</label>
          <div className="chips">
            {MUCUS_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`chip${mucus === m.id ? ' on' : ''}`}
                onClick={() => setMucus(mucus === m.id ? null : m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="hint">Egg-white or watery discharge often marks the most fertile days.</p>
        </div>

        <div className="two-col">
          <div className="field">
            <label htmlFor="bbt-in">Temperature (°{tempUnit})</label>
            <input
              id="bbt-in"
              className="num-in"
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder={tempUnit === 'C' ? '36.5' : '97.7'}
              value={bbt}
              onChange={(e) => setBbt(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="weight-in">Weight ({weightUnit})</label>
            <input
              id="weight-in"
              className="num-in"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={weightUnit === 'kg' ? '60.0' : '132'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>Tests</label>
          <div className="chips">
            <button type="button" className={`chip${lhTest === 'positive' ? 'on' : ''}`} onClick={() => setLhTest(lhTest === 'positive' ? null : 'positive')}>
              🟣 LH positive
            </button>
            <button type="button" className={`chip${lhTest === 'negative' ? 'on' : ''}`} onClick={() => setLhTest(lhTest === 'negative' ? null : 'negative')}>
              LH negative
            </button>
            <button type="button" className={`chip${pregnancyTest === 'positive' ? 'on' : ''}`} onClick={() => setPregnancyTest(pregnancyTest === 'positive' ? null : 'positive')}>
              ✅ Preg. positive
            </button>
            <button type="button" className={`chip${pregnancyTest === 'negative' ? 'on' : ''}`} onClick={() => setPregnancyTest(pregnancyTest === 'negative' ? null : 'negative')}>
              Preg. negative
            </button>
          </div>
        </div>

        <div className="field">
          <label>Also today</label>
          <div className="chips">
            <button type="button" className={`chip${intercourse ? 'on' : ''}`} onClick={() => setIntercourse(!intercourse)}>
              💞 Intercourse
            </button>
            <button type="button" className={`chip${contraception ? 'on' : ''}`} onClick={() => setContraception(!contraception)}>
              💊 Contraception taken
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="day-note">Notes</label>
          <textarea
            id="day-note"
            className="note"
            placeholder="Anything you want to remember about today…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

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
