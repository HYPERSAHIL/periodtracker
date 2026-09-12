import { prettyDate } from '../lib/date';
import { tx, txd } from '../lib/i18n';
import type { SharedSummary } from '../lib/cloud';
import { Logo } from './Icons';

/** Public read-only view for partner share links (?s=TOKEN). No login, no data. */
export default function PartnerView({
  summary,
  expiresAt,
  lang,
}: {
  summary: SharedSummary;
  expiresAt: string;
  lang: string;
}) {
  return (
    <div className="app">
      <header className="topbar">
        <Logo />
        <div>
          <h1>{tx(lang, 'Period Tracker')}</h1>
          <div className="sub">{tx(lang, 'Shared cycle snapshot')}</div>
        </div>
      </header>
      <main className="screen">
        <section className="hero">
          <div className="ring" />
          <div className="ring r2" />
          <div aria-label="Current cycle day" className="cycle-day">
            {summary.cycleDay ?? '-'}
            <span>{tx(lang, 'cycle day')}</span>
          </div>
          <div className="phase">
            {summary.phase ? txd(lang, `phase.${summary.phase}`, summary.phase) : tx(lang, 'Cycle phase')}
          </div>
        </section>
        <div className="card">
          <div className="kv-grid">
            <span>{tx(lang, 'Next period')}</span>
            <strong>{summary.nextStart ? prettyDate(summary.nextStart, { withYear: true }) : '-'}</strong>
            <span>{tx(lang, 'Fertile window')}</span>
            <strong>
              {summary.fertileStart && summary.fertileEnd
                ? `${prettyDate(summary.fertileStart)} – ${prettyDate(summary.fertileEnd)}`
                : '-'}
            </strong>
          </div>
          <p className="hint">
            {tx(lang, 'Shared read-only snapshot. Symptoms, notes and history are never shared. Link expires {date}.', {
              date: prettyDate(expiresAt.slice(0, 10), { withYear: true }),
            })}
          </p>
        </div>
      </main>
    </div>
  );
}
