import { useEffect, useState } from 'react';
import { DayEntry, FLOWS, MOODS, SYMPTOMS } from '../types';
import { DayFacts, Phase } from '../lib/cycle';
import { prettyDate } from '../lib/date';

export default function DaySheet({
  date,
  entry,
  facts,
  phase,
  onClose,
  onSave,
  onDelete,
}: {
  date: string;
  entry: DayEntry | null;
  facts?: DayFacts;
  phase: Phase;
  onClose: () => void;
  onSave: (e: DayEntry) => void;
  onDelete: () => void;
}) {
  const [flow, setFlow] = useState<DayEntry['flow']>(entry?.flow ?? null);
  const [symptoms, setSymptoms] = useState<string[]>(entry?.symptoms ?? []);
  const [moods, setMoods] = useState<string[]>(entry?.moods ?? []);
  const [note, setNote] = useState(entry?.note ?? '');

  useEffect(() => {
    // close on Escape
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const toggle = (list: string[], setList: (v: string[]) => void, s: string) =>
    setList(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

  const isEmpty = !flow && symptoms.length === 0 && moods.length === 0 && !note.trim();

  const save = () => {
    if (isEmpty) {
      onDelete();
      return;
    }
    onSave({ date, flow, symptoms, moods, note: note.trim() });
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
