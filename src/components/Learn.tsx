import { useState } from 'react';
import { AppProps } from '../App';
import { ARTICLES, PERI_RELIEF, PREG_CHECKLISTS, PREG_FAQS, TTC_CARDS, articlesByCategory, searchContent } from '../lib/content';

type View =
  | { kind: 'home' }
  | { kind: 'article'; slug: string }
  | { kind: 'ttc' }
  | { kind: 'peri' }
  | { kind: 'pregnancy' };

export default function Learn(p: AppProps) {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);

  const toggleBookmark = (slug: string) => {
    const has = p.settings.bookmarks.includes(slug);
    p.updateSettings({ bookmarks: has ? p.settings.bookmarks.filter((s) => s !== slug) : [...p.settings.bookmarks, slug] });
  };

  if (view.kind === 'article') {
    const a = ARTICLES.find((x) => x.slug === view.slug);
    if (!a) return null;
    const marked = p.settings.bookmarks.includes(a.slug);
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>
          ← All topics
        </button>
        <div className="card">
          <h3 style={{ textTransform: 'none', fontSize: 16, letterSpacing: 0 }}>{a.title}</h3>
          <div className="sub">
            <span className="tag gray">{a.category}</span>
            <span className="tag gray">{a.minutes} min read</span>
            {a.source !== '-' && <span className="tag gray">Guidance: {a.source}</span>}
          </div>
          {a.body.map((para, i) => (
            <p key={i} style={{ fontSize: 14.5, lineHeight: 1.65 }}>
              {para}
            </p>
          ))}
          <button className={`chip${marked ? ' on' : ''}`} onClick={() => toggleBookmark(a.slug)}>
            {marked ? '★ Bookmarked' : '☆ Bookmark'}
          </button>
          <p className="hint" style={{ marginTop: 12 }}>
            Educational only - not medical advice, diagnosis, or contraception guidance.
          </p>
        </div>
      </>
    );
  }

  if (view.kind === 'ttc') {
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>← All topics</button>
        <div className="card">
          <h3>Trying to conceive - the essentials</h3>
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
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>← All topics</button>
        <div className="card">
          <h3>Perimenopause relief guides</h3>
          <p className="hint" style={{ margin: '0 0 10px' }}>
            Self-care ideas and questions to bring to a clinician - by symptom domain. This is a burden-and-relief view, never a stage or diagnosis.
          </p>
          {PERI_RELIEF.map((g) => (
            <details key={g.slug} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <summary style={{ fontWeight: 800, fontSize: 14.5, cursor: 'pointer' }}>
                {g.domain} - {g.title}
              </summary>
              <p style={{ fontSize: 13.5, margin: '8px 0 4px', fontWeight: 700 }}>Try now</p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: 'var(--text-2)' }}>
                {g.tryNow.map((t) => <li key={t}>{t}</li>)}
              </ul>
              <p style={{ fontSize: 13.5, margin: '8px 0 4px', fontWeight: 700 }}>Ask your clinician</p>
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

  if (view.kind === 'pregnancy') {
    return (
      <>
        <button className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setView({ kind: 'home' })}>← All topics</button>
        {PREG_CHECKLISTS.map((g) => (
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
          <h3>Common questions</h3>
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

  const results = searchContent(q);
  const cats = onlyBookmarks
    ? [{ category: 'Bookmarked', articles: ARTICLES.filter((a) => p.settings.bookmarks.includes(a.slug)) }]
    : results.length
      ? [{ category: `Results for “${q}”`, articles: results }]
      : articlesByCategory();

  return (
    <>
      <input
        type="search"
        className="num-in"
        style={{ marginBottom: 14 }}
        placeholder="Search articles…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search articles"
      />
      <div className="chips" style={{ marginBottom: 14 }}>
        <button type="button" className={`chip${onlyBookmarks ? ' on' : ''}`} onClick={() => setOnlyBookmarks(!onlyBookmarks)}>
          ★ Bookmarks ({p.settings.bookmarks.length})
        </button>
      </div>

      {cats.map((cat) => (
        <div className="card" key={cat.category}>
          <h3>{cat.category}</h3>
          {cat.articles.length === 0 ? (
            <p className="hint">Nothing here yet.</p>
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
        <h3>Guides by goal</h3>
        <button className="topic-row" onClick={() => setView({ kind: 'ttc' })}>
          <span className="tr-main">
            <span className="tr-title">🌱 Trying to conceive</span>
            <span className="tr-sub">6 essentials - timing, tests, folic acid, when to seek help</span>
          </span>
          <span aria-hidden>›</span>
        </button>
        <button className="topic-row" onClick={() => setView({ kind: 'pregnancy' })}>
          <span className="tr-main">
            <span className="tr-title">🤰 Pregnancy checklists & FAQs</span>
            <span className="tr-sub">Trimester checklists and 6 common questions</span>
          </span>
          <span aria-hidden>›</span>
        </button>
        <button className="topic-row" onClick={() => setView({ kind: 'peri' })}>
          <span className="tr-main">
            <span className="tr-title">🍂 Perimenopause relief</span>
            <span className="tr-sub">Self-care and clinician questions by symptom domain</span>
          </span>
          <span aria-hidden>›</span>
        </button>
      </div>
    </>
  );
}
