import { useEffect, useState } from 'react';
import { AppProps } from '../App';
import { babySize, pregnancyInfo, TRIMESTER_INFO } from '../lib/pregnancy';
import { PREG_TIPS } from '../lib/content';
import { prettyDate, todayISO, toISO } from '../lib/date';
import { tx } from '../lib/i18n';
import type { ApptItem, KickSession } from '../types';

const defaultAppts = (lang: string): ApptItem[] => [
  { id: 1, text: tx(lang, 'First prenatal visit (8–10 weeks)'), done: false },
  { id: 2, text: tx(lang, 'Anatomy scan (~20 weeks)'), done: false },
  { id: 3, text: tx(lang, 'Glucose screening (~24–28 weeks)'), done: false },
];

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function PregnancyScreen(p: AppProps) {
  const lang = p.settings.lang;
  const today = todayISO();
  const todayEntry = p.entries[today];
  // kick + appointment state lives in settings, so backup + sync carry it
  const kickLog = p.settings.kickLog ?? [];
  const active = p.settings.activeKick ?? null;
  const appts = p.settings.apptList ?? defaultAppts(lang);
  const [apptText, setApptText] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const kickActive = active !== null;

  // live elapsed timer while a kick session runs
  useEffect(() => {
    if (!kickActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [kickActive]);

  const updateKicks = (fn: (prev: { sessions: KickSession[]; active: KickSession | null }) => {
    sessions: KickSession[];
    active: KickSession | null;
  }) => {
    const next = fn({ sessions: kickLog, active });
    p.updateSettings({ kickLog: next.sessions, activeKick: next.active });
  };

  const toggleAppt = (id: number) =>
    p.updateSettings({ apptList: appts.map((a) => (a.id === id ? { ...a, done: !a.done } : a)) });

  const addAppt = () => {
    const text = apptText.trim().slice(0, 120);
    if (!text) return;
    p.updateSettings({ apptList: [...appts, { id: Date.now(), text, done: false }] });
    setApptText('');
  };

  if (!p.settings.dueDate) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">🤰</div>
          <strong>{tx(lang, 'Pregnancy mode is on')}</strong>
          <br />
          <br />
          {tx(lang, 'Add your due date in Settings → Mode to start week by week tracking.')}
        </div>
      </div>
    );
  }

  const info = pregnancyInfo(p.settings.dueDate);
  const past = info.daysToDue < 0;

  return (
    <>
      <section className="hero">
        <div className="ring" />
        <div className="ring r2" />
        <div aria-label="Current pregnancy week" className="cycle-day">
          {past ? '🌟' : info.weeks}
          <span>{past ? tx(lang, 'due time') : tx(lang, 'weeks + {n} day{s}', { n: info.days, s: info.days === 1 ? '' : 's' })}</span>
        </div>
        <div className="phase">{tx(lang, 'Trimester')} {info.trimester}</div>
        <div className="since">{TRIMESTER_INFO[info.trimester]}</div>
        <div className="preg-bar" aria-hidden>
          <div className="preg-fill" style={{ width: `${Math.round(info.progress * 100)}%` }} />
        </div>
        <div className="since" style={{ marginTop: 6 }}>
          {past
            ? tx(lang, 'Baby was due {date} - congratulations! Switch back to cycle tracking in Settings whenever you are ready.', { date: prettyDate(info.dueDate, { withYear: true }) })
            : tx(lang, '{pct}% · due {date} (in {n} days)', { pct: Math.round(info.progress * 100), date: prettyDate(info.dueDate, { withYear: true }), n: info.daysToDue })}
        </div>
      </section>

      <div className="stat-row">
        <div className="stat">
          <div className="v">w{info.weeks}</div>
          <div className="l">{tx(lang, 'Week')}</div>
        </div>
        <div className="stat">
          <div className="v">T{info.trimester}</div>
          <div className="l">{tx(lang, 'Trimester')}</div>
        </div>
        <div className="stat">
          <div className="v">{past ? '-' : `${info.daysToDue}d`}</div>
          <div className="l">{tx(lang, 'Until due date')}</div>
        </div>
      </div>

      <div className="card">
        <h3>{tx(lang, 'Today · {date}', { date: prettyDate(today, { weekday: true }) })}</h3>
        <p style={{ margin: '0 0 12px', fontSize: 14.5 }}>
          👶 {tx(lang, 'About the size of {size}', { size: babySize(info.weeks) })}
        </p>
        <button className="btn primary" onClick={() => p.openDay(today)}>
          {todayEntry ? tx(lang, 'Edit today’s log') : tx(lang, 'Log today')}
        </button>
        <p className="hint" style={{ marginTop: 10 }}>
          {tx(lang, 'Keep logging symptoms, moods, and notes. They are just as useful now.')}
        </p>
      </div>

      <div className="card">
        <h3>{tx(lang, 'Trimester {n} check-ins', { n: info.trimester })}</h3>
        {(PREG_TIPS[info.trimester as 1 | 2 | 3] ?? []).map((tip) => (
          <p key={tip.slice(0, 24)} style={{ fontSize: 13.5, margin: '0 0 6px' }}>
            • {tx(lang, tip)}
          </p>
        ))}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Kick counter')}</h3>
        {active ? (
          <>
            <div style={{ fontSize: 34, fontWeight: 800, textAlign: 'center', color: 'var(--rose-600)' }}>
              {active.kicks.length}
            </div>
            <p className="hint" style={{ textAlign: 'center' }}>
              {tx(lang, '{elapsed} elapsed · tap for every kick', { elapsed: fmtElapsed(now - active.startedAt) })}
            </p>
            <button
              className="btn primary"
              style={{ width: '100%', padding: '18px 0', fontSize: 17 }}
              onClick={() =>
                updateKicks((prev) =>
                  prev.active ? { ...prev, active: { ...prev.active, kicks: [...prev.active.kicks, Date.now()] } } : prev
                )
              }
            >
              👶 {tx(lang, 'Tap — kick!')}
            </button>
            <button
              className="btn ghost"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() =>
                updateKicks((prev) =>
                  prev.active
                    ? {
                        sessions: [{ ...prev.active, endedAt: Date.now() }, ...prev.sessions].slice(0, 20),
                        active: null,
                      }
                    : prev
                )
              }
            >
              {tx(lang, 'End & save session')}
            </button>
          </>
        ) : (
          <>
            <p className="hint" style={{ margin: '0 0 12px' }}>
              {tx(lang, 'Count kicks to 10 — most clinicians like to see 10 movements within 2 hours.')}
            </p>
            <button
              className="btn primary"
              onClick={() => updateKicks((prev) => ({ ...prev, active: { startedAt: Date.now(), endedAt: null, kicks: [] } }))}
            >
              {tx(lang, 'Start counting')}
            </button>
          </>
        )}
        {kickLog.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {kickLog.slice(0, 5).map((s) => (
              <div key={s.startedAt} className="hint" style={{ padding: '4px 0' }}>
                {prettyDate(toISO(new Date(s.startedAt)), { weekday: true })} · {s.kicks.length}{' '}
                {tx(lang, 'kicks')}
                {s.endedAt ? tx(lang, ' in {dur}', { dur: fmtElapsed(s.endedAt - s.startedAt) }) : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>{tx(lang, 'Appointments')}</h3>
        {appts.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`chip${a.done ? ' on' : ''}`}
            style={{ display: 'flex', margin: '0 8px 8px 0' }}
            onClick={() => toggleAppt(a.id)}
          >
            {a.done ? '✓' : '○'} {a.text}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <input
            className="num-in"
            style={{ flex: 1 }}
            value={apptText}
            maxLength={120}
            placeholder={tx(lang, 'Add appointment…')}
            aria-label={tx(lang, 'New appointment')}
            onChange={(e) => setApptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addAppt();
            }}
          />
          <button className="btn ghost sm" onClick={addAppt}>
            {tx(lang, 'Add')}
          </button>
        </div>
      </div>
    </>
  );
}
