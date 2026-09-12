import { DayEntry, Settings } from '../types';
import { CycleStats, DayFacts } from './cycle';
import { ARTICLES } from './content';
import { prettyDate } from './date';
import { tx } from './i18n';

export interface GuideResult {
  text: string;
  articles: string[];
  disclaimer: boolean;
}

/** Future LLM seam: anything matching this can replace the rule engine. */
export interface GuideProvider {
  answer(q: string, ctx: { entries: Record<string, DayEntry>; settings: Settings }): Promise<GuideResult>;
}

let provider: GuideProvider | null = null;

export function registerGuideProvider(p: GuideProvider | null): void {
  provider = p;
}

interface Intent {
  id: string;
  patterns: RegExp[];
  reply: (lang: string, s: Ctx) => string;
  articles: string[];
}

interface Ctx {
  settings: Settings;
  stats: CycleStats;
  facts: Map<string, DayFacts>;
}

const INTENTS: Intent[] = [
  {
    id: 'late',
    patterns: [/late/i, /delay/i, /missed period/i, /लेट/, /देर/],
    reply: (lang, s) => {
      const base = tx(
        lang,
        s.stats.nextStart
          ? 'Your estimate was {d}. Being a few days off is normal — stress, illness, travel, and sleep all shift cycles.'
          : 'Log two periods and estimates appear — until then every cycle is a guess.',
        { d: s.stats.nextStart ? prettyDate(s.stats.nextStart, { withYear: true }) : '' }
      );
      return `${base} ${tx(lang, 'If you might be pregnant, a test now is reliable. Over a week late with negative tests? See a clinician.')}`;
    },
    articles: ['cycle-variation', 'pregnancy-tests'],
  },
  {
    id: 'pain',
    patterns: [/pain/i, /cramp/i, /endo/i, /dysmenorr/i, /दर्द/, /ऐंठन/],
    reply: (lang) =>
      tx(
        lang,
        'Rate pain 0–10 with where it spreads. NSAIDs work best started early, heat helps many, and 7+ pain, pain with sex, or bowel/bladder pain deserves a workup — that log moves things forward.'
      ),
    articles: ['cramps', 'pain-toolkit'],
  },
  {
    id: 'ttc',
    patterns: [/\bttc\b/i, /conceiv/i, /pregnant/i, /fertile/i, /ovulat/i, /गर्भ/],
    reply: (lang) =>
      tx(
        lang,
        'The fertile window is the 5 days before ovulation plus ovulation day. LH tests plus egg-white discharge together beat any calendar estimate.'
      ),
    articles: ['fertile-window', 'pregnancy-tests'],
  },
  {
    id: 'peri',
    patterns: [/perimeno/i, /menopaus/i, /hot flash/i, /night sweat/i, /flash/i, /रजोनिवृत्ति/],
    reply: (lang) =>
      tx(
        lang,
        'Widening gaps and skipped cycles are the hallmark pattern. Track flashes, sleep, and mood together for a month — that combined log is what guides treatment.'
      ),
    articles: ['perimenopause-101', 'sleep-flash-gsm', 'menopause-hrt-basics'],
  },
  {
    id: 'postpartum',
    patterns: [/postpartum/i, /breastfeed/i, /nursing/i, /lochia/i, /lactation/i, /स्तनपान/, /डिलीवरी/],
    reply: (lang) =>
      tx(
        lang,
        'Early bleeding is usually lochia, not a period — and ovulation can return before the first period, even while breastfeeding. LAM needs all three: under 6 months, no periods, near-full breastfeeding.'
      ),
    articles: ['postpartum-mood'],
  },
  {
    id: 'contraception',
    patterns: [/pill/i, /contracept/i, /iud/i, /implant/i, /missed dose/i, /patch/i, /ring/i, /गर्भनिरोध/],
    reply: (lang) =>
      tx(
        lang,
        'Bleeding changes top the quit reasons and usually settle in 3 months. Mood dips on a new method deserve an early call, not silent stopping — and log missed pills with backup.'
      ),
    articles: ['contraception-mood-bleeding'],
  },
  {
    id: 'mood',
    patterns: [/pms/i, /pmdd/i, /mood/i, /anxi/i, /depress/i, /sleep/i, /मूड/, /नींद/],
    reply: (lang) =>
      tx(
        lang,
        'Luteal mood shifts are common; a PMDD call needs 2 full cycles of daily tracking. The Insights luteal-mood check walks you through it.'
      ),
    articles: ['pmdd-pms'],
  },
  {
    id: 'privacy',
    patterns: [/privacy/i, /data/i, /export/i, /backup/i, /sync/i, /share/i, /delete/i, /डिलीट/, /बैकअप/],
    reply: (lang) =>
      tx(
        lang,
        'Your logs live on your device with automatic private backup. Export JSON/CSV anytime from Settings → Your data, share read-only partner links, revoke anytime.'
      ),
    articles: ['privacy-local first'],
  },
];

function scoreArticle(q: string, title: string, body: string[]): number {  const words = q.toLowerCase().split(/[^\p{Script=Devanagari}a-z0-9]+/iu).filter((w) => w.length > 2);
  const hay = `${title} ${body.join(' ')}`.toLowerCase();
  let s = 0;
  for (const w of words) if (hay.includes(w)) s += w.length > 5 ? 2 : 1;
  return s;
}

/**
 * Offline guide: intent templates first, content search as fallback.
 * Deterministic, free, private — swap via registerGuideProvider when desired.
 */
export async function guideAnswer(
  entries: Record<string, DayEntry>,
  settings: Settings,
  stats: CycleStats,
  facts: Map<string, DayFacts>,
  q: string
): Promise<GuideResult> {
  if (provider) return provider.answer(q, { entries, settings });
  const lang = settings.lang;
  // layer-1 topic guard: never spend a (future) paid call on off-topic chat
  if (isOffTopic(q)) {
    return {
      text: tx(
        lang,
        'I only answer questions about periods, cycles, fertility, pregnancy, and using this app — try one of those, or browse Learn.'
      ),
      articles: [],
      disclaimer: false,
    };
  }
  const ctx: Ctx = { settings, stats, facts };
  const intent = INTENTS.find((t) => t.patterns.some((re) => re.test(q)));
  if (intent) {
    return { text: intent.reply(lang, ctx), articles: intent.articles, disclaimer: true };
  }
  const ranked = ARTICLES.map((a) => ({ a, s: scoreArticle(q, a.title, a.body) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, 2);
  if (ranked.length) {
    return {
      text: tx(lang, 'Closest matches from the library:'),
      articles: ranked.map((x) => x.a.slug),
      disclaimer: false,
    };
  }
  void entries;
  void facts;
  return { text: tx(lang, 'Try asking about periods, pain, fertility, mood, or privacy.'), articles: [], disclaimer: false };
}

const OFF_TOPIC = [
  'code',
  'coding',
  'python',
  'javascript',
  'typescript',
  'program',
  'homework',
  'math',
  'essay',
  'recipe',
  'football',
  'cricket',
  'movie',
  'song',
  'game',
  'crypto',
  'stock',
  'visa',
  'job interview',
  'resume',
  'कोड',
  'गणित',
  'होमवर्क',
];

/** Layer-1 abuse guard: keep paid/API answers scoped to health + app help. */
export function isOffTopic(q: string): boolean {
  const s = q.toLowerCase();
  return OFF_TOPIC.some((k) => s.includes(k));
}
