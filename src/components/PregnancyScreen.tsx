import { AppProps } from '../App';
import { babySize, pregnancyInfo, TRIMESTER_INFO } from '../lib/pregnancy';
import { prettyDate, todayISO } from '../lib/date';

export default function PregnancyScreen(p: AppProps) {
  const today = todayISO();
  const todayEntry = p.entries[today];

  if (!p.settings.dueDate) {
    return (
      <div className="card">
        <div className="empty">
          <div className="big">🤰</div>
          <strong>Pregnancy mode is on</strong>
          <br />
          <br />
          Add your due date in <strong>Settings → Mode</strong> to start week-by-week tracking.
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
          <span>{past ? 'due time' : `weeks + ${info.days} day${info.days === 1 ? '' : 's'}`}</span>
        </div>
        <div className="phase">Trimester {info.trimester}</div>
        <div className="since">{TRIMESTER_INFO[info.trimester]}</div>
        <div className="preg-bar" aria-hidden>
          <div className="preg-fill" style={{ width: `${Math.round(info.progress * 100)}%` }} />
        </div>
        <div className="since" style={{ marginTop: 6 }}>
          {past
            ? `Baby was due ${prettyDate(info.dueDate, { withYear: true })} — congratulations! Switch back to cycle tracking in Settings whenever you're ready.`
            : `${Math.round(info.progress * 100)}% · due ${prettyDate(info.dueDate, { withYear: true })} (in ${info.daysToDue} days)`}
        </div>
      </section>

      <div className="stat-row">
        <div className="stat">
          <div className="v">w{info.weeks}</div>
          <div className="l">Week</div>
        </div>
        <div className="stat">
          <div className="v">T{info.trimester}</div>
          <div className="l">Trimester</div>
        </div>
        <div className="stat">
          <div className="v">{past ? '—' : `${info.daysToDue}d`}</div>
          <div className="l">Until due date</div>
        </div>
      </div>

      <div className="card">
        <h3>Today · {prettyDate(today, { weekday: true })}</h3>
        <p style={{ margin: '0 0 12px', fontSize: 14.5 }}>
          👶 About the size of <strong>{babySize(info.weeks)}</strong>
        </p>
        <button className="btn primary" onClick={() => p.openDay(today)}>
          {todayEntry ? 'Edit today’s log' : 'Log today'}
        </button>
        <p className="hint" style={{ marginTop: 10 }}>
          Keep logging symptoms, moods, and notes — they're just as useful now.
        </p>
      </div>
    </>
  );
}
