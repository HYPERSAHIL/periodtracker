import { useState } from 'react';
import { AppProps } from '../App';
import { ARTICLES, PERI_RELIEF, PREG_CHECKLISTS, PREG_FAQS, TTC_CARDS, articlesByCategory, searchContent } from '../lib/content';
import { tx } from '../lib/i18n';

type View =
  | { kind: 'home' }
  | { kind: 'article'; slug: string }
  | { kind: 'ttc' }
  | { kind: 'peri' }
  | { kind: 'pregnancy' }
  | { kind: 'school' };

const SCHOOL_ITEMS = [
  'Emergency kit packed (pads, spare underwear, wipe, small bag)',
  'Know where school toilets with disposal bins are',
  'A trusted teacher named for emergencies',
  'Pre-menarche talk done (what periods are, what is normal)',
  'Pain plan known (heat, rest, when to ask for help)',
];

export default function Learn(p: AppProps) {
  const lang = p.settings.lang;
  const [view, setView] = useState<View>({ kind: 'home' });
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('pt.learn.checked.v1') ?? '[]') as string[]);
    } catch {
      return new Set<string>();
    }
  });
  const [schoolChecked, setSchoolChecked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('pt.school.checked.v1') ?? '[]') as string[]);
    } catch {
      return new Set<string>();
    }
  });
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);

  const toggleBookmark = (slug: string) => {
    const has = p.settings.bookmarks.includes(slug);
    p.updateSettings({ bookmarks: has ? p.settings.bookmarks.filter((s) => s !== slug) : [...p.settings.bookmarks, slug] });
  };

  const teenSafe = (a: { category: string }) =>
    !p.settings.teen || (a.category !== 'Fertility' && a.category !== 'Pregnancy');

  if (view.kind === 'article') {
    const a = ARTICLES.find((x) => x.slug === view.slug);
    if (!a || !teenSafe(a)) {
      return (
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>
          ← All topics
        </button>
      );
    }
    const marked = p.settings.bookmarks.includes(a.slug);
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>
          ← {tx(lang, 'All topics')}
        </button>
        <div className="card">
          <h3 style={{ textTransform: 'none', fontSize: 16, letterSpacing: 0 }}>{a.title}</h3>
          <div className="sub">
            <span className="tag gray">{a.category}</span>
            <span className="tag gray">{a.minutes} {tx(lang, 'min read')}</span>
            {a.source !== '-' && <span className="tag gray">{tx(lang, 'Guidance')}: {a.source}</span>}
          </div>
          {a.body.map((para, i) => (
            <p key={i} style={{ fontSize: 14.5, lineHeight: 1.65 }}>
              {para}
            </p>
          ))}
          {a.links && a.links.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>{tx(lang, 'Find help')}</div>
              {a.links.map((l) => (
                <div key={l.url} style={{ padding: '4px 0' }}>
                  <a href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
                </div>
              ))}
            </div>
          )}
          <button className={`chip${marked ? ' on' : ''}`} onClick={() => toggleBookmark(a.slug)}>
            {marked ? `★ ${tx(lang, 'Bookmarked')}` : `☆ ${tx(lang, 'Bookmark')}`}
          </button>
          <p className="hint" style={{ marginTop: 12 }}>
            {tx(lang, 'Educational only, not medical advice, diagnosis, or contraception guidance.')}
          </p>
        </div>
      </>
    );
  }

  if (view.kind === 'ttc') {
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>← {tx(lang, 'All topics')}</button>
        <div className="card">
          <h3>{tx(lang, 'Trying to conceive: the essentials')}</h3>
          {TTC_CARDS.map((c) => (
            <div key={c.slug} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{c.title}</div>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '4px 0 0' }}>{c.body}</p>
              <p className="hint">{c.source}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (view.kind === 'peri') {
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>← {tx(lang, 'All topics')}</button>
        <div className="card">
          <h3>{tx(lang, 'Perimenopause relief guides')}</h3>
          <p className="hint" style={{ margin: '0 0 10px' }}>
            {tx(lang, 'Self care ideas and questions to bring to a clinician, by symptom domain. This is a burden-and-relief view, never a stage or diagnosis.')}
          </p>
          {PERI_RELIEF.map((g) => (
            <details key={g.slug} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <summary style={{ fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>
                {g.domain}, {g.title}
              </summary>
              <p style={{ fontSize: 13.5, margin: '8px 0 4px', fontWeight: 700 }}>{tx(lang, 'Try now')}</p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--text-2)' }}>
                {g.tryNow.map((t) => <li key={t}>{t}</li>)}
              </ul>
              <p style={{ fontSize: 13.5, margin: '8px 0 4px', fontWeight: 700 }}>{tx(lang, 'Ask your clinician')}</p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--text-2)' }}>
                {g.askAbout.map((t) => <li key={t}>{t}</li>)}
              </ul>
              <p className="hint">{g.source}</p>
            </details>
          ))}
        </div>
      </>
    );
  }

  if (view.kind === 'school') {
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>← {tx(lang, 'All topics')}</button>
        <div className="card">
          <h3>{tx(lang, 'School readiness checklist')}</h3>
          <p className="hint" style={{ margin: '0 0 10px' }}>
            {tx(lang, 'For students, parents, and teachers. Half of girls learn about periods only after menarche — this list fixes that.')}
          </p>
          {SCHOOL_ITEMS.map((it) => {
            const on = schoolChecked.has(it);
            return (
              <button
                key={it}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                style={{ display: 'flex', margin: '0 8px 8px 0' }}
                onClick={() =>
                  setSchoolChecked((prev) => {
                    const n = new Set(prev);
                    if (n.has(it)) n.delete(it);
                    else n.add(it);
                    try {
                      localStorage.setItem('pt.school.checked.v1', JSON.stringify([...n]));
                    } catch {
                      /* best-effort */
                    }
                    return n;
                  })
                }
              >
                {on ? '✓' : '○'} {tx(lang, it)}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (view.kind === 'pregnancy') {
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>← {tx(lang, 'All topics')}</button>        {PREG_CHECKLISTS.map((g) => (
          <div className="card" key={g.id}>
            <h3>{g.title}</h3>
            {g.items.map((it) => {
              const key = `${g.id}:${it.id}`;
              const on = checked.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`chip${on ? ' on' : ''}`}
                  style={{ display: 'flex', margin: '0 8px 8px 0' }}
                  onClick={() =>
                    setChecked((prev) => {
                      const n = new Set(prev);
                      if (n.has(key)) n.delete(key);
                      else n.add(key);
                      try {
                        localStorage.setItem('pt.learn.checked.v1', JSON.stringify([...n]));
                      } catch {
                        /* checklist progress is best-effort */
                      }
                      return n;
                    })
                  }
                >
                  {on ? '✓' : '○'} {it.text}
                </button>
              );
            })}
          </div>
        ))}
        <div className="card">
          <h3>{tx(lang, 'Common questions')}</h3>
          {PREG_FAQS.map((f) => (
            <details key={f.q} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <summary style={{ fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{f.q}</summary>
              <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: '6px 0 0' }}>{f.a}</p>
              <p className="hint">{f.source}</p>
            </details>
          ))}
        </div>
      </>
    );
  }

  const results = searchContent(q).filter(teenSafe);
  const cats = onlyBookmarks
    ? [{ category: tx(lang, 'Bookmarked'), articles: ARTICLES.filter((a) => p.settings.bookmarks.includes(a.slug) && teenSafe(a)) }]
    : results.length
      ? [{ category: tx(lang, 'Results for “{q}”', { q }), articles: results }]
      : articlesByCategory()
          .map((c) => ({ ...c, articles: c.articles.filter(teenSafe) }))
          .filter((c) => c.articles.length > 0);

  return (
    <>
      <input
        type="search"
        className="num-in"
        style={{ marginBottom: 14 }}
        placeholder={tx(lang, 'Search articles…')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={tx(lang, 'Search articles')}
      />
      <div className="chips" style={{ marginBottom: 14 }}>
        <button type="button" className={`chip${onlyBookmarks ? ' on' : ''}`} onClick={() => setOnlyBookmarks(!onlyBookmarks)}>
          {tx(lang, '★ Bookmarks ({n})', { n: p.settings.bookmarks.length })}
        </button>
      </div>

      {cats.map((cat) => (
        <div className="card" key={cat.category}>
          <h3>{cat.category}</h3>
          {cat.articles.length === 0 ? (
            <p className="hint">{tx(lang, 'Nothing here yet.')}</p>
          ) : (
            cat.articles.map((a) => (
              <button
                key={a.slug}
                className="topic-row"
                onClick={() => setView({ kind: 'article', slug: a.slug })}
              >
                <span className="tr-main">
                  <span className="tr-title">{a.title}</span>
                  <span className="tr-sub">{a.category} · {a.minutes} min</span>
                </span>
                <span aria-hidden>›</span>
              </button>
            ))
          )}
        </div>
      ))}

      <div className="card">
        <h3>{tx(lang, 'Guides by goal')}</h3>
        {!p.settings.teen && (
        <button className="topic-row" onClick={() => setView({ kind: 'ttc' })}>
          <span className="tr-main">
            <span className="tr-title">🌱 {tx(lang, 'Trying to conceive')}</span>
            <span className="tr-sub">{tx(lang, '6 essentials: timing, tests, folic acid, when to seek help')}</span>
          </span>
          <span aria-hidden>›</span>
        </button>
        )}
        {!p.settings.teen && (
        <button className="topic-row" onClick={() => setView({ kind: 'pregnancy' })}>
          <span className="tr-main">
            <span className="tr-title">🤰 {tx(lang, 'Pregnancy checklists & FAQs')}</span>
            <span className="tr-sub">{tx(lang, 'Trimester checklists and 6 common questions')}</span>
          </span>
          <span aria-hidden>›</span>
        </button>
        )}
        <button className="topic-row" onClick={() => setView({ kind: 'peri' })}>
          <span className="tr-main">
            <span className="tr-title">🍂 {tx(lang, 'Perimenopause relief')}</span>
            <span className="tr-sub">{tx(lang, 'Self care and clinician questions by symptom domain')}</span>
          </span>
          <span aria-hidden>›</span>
        </button>
        <button className="topic-row" onClick={() => setView({ kind: 'school' })}>
          <span className="tr-main">
            <span className="tr-title">🎒 {tx(lang, 'School readiness')}</span>
            <span className="tr-sub">{tx(lang, 'Emergency kit, toilets, trusted teacher, first-talk checklist')}</span>
          </span>
          <span aria-hidden>›</span>
        </button>
      </div>
    </>
  );
}
