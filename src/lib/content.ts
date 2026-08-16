/**
 * Original educational content, written for Period Tracker. Facts are standard
 * public-health guidance (ACOG / CDC / NIA / FDA / WHO); wording is our own,
 * non-diagnostic, and deliberately hedged. No content here is copied from any
 * other app.
 */

export interface Article {
  slug: string;
  title: string;
  category: 'Cycle basics' | 'Fertility' | 'Symptoms' | 'Perimenopause' | 'Pregnancy' | 'Privacy';
  minutes: number;
  source: string;
  body: string[]; // paragraphs
}

export const ARTICLES: Article[] = [
  {
    slug: 'cycle-phases',
    title: 'The four phases of your cycle',
    category: 'Cycle basics',
    minutes: 3,
    source: 'ACOG',
    body: [
      'A menstrual cycle runs from the first day of one period to the first day of the next. Although everyone talks about "28 days", normal cycles span roughly 21 to 35 days in adults, and small month-to-month changes are expected.',
      'The menstrual phase is the bleeding itself, typically 2 to 7 days, driven by the lining of the uterus shedding.',
      'The follicular phase overlaps your period and continues after it: the brain sends FSH to the ovaries, follicles mature, and rising estrogen rebuilds the uterine lining. Many people notice steadily rising energy through this phase.',
      'Ovulation is the release of an egg, usually about 14 days before the next period — not 14 days after the previous one, which is why cycle-length changes mostly shift ovulation earlier or later while the second half stays steadier.',
      'The luteal phase follows: progesterone rises then falls, and its withdrawal is what starts the next period. This is when PMS symptoms — tender breasts, cramps, mood shifts — are most common.',
    ],
  },
  {
    slug: 'cycle-variation',
    title: 'How much cycle variation is normal?',
    category: 'Cycle basics',
    minutes: 2,
    source: 'ACOG',
    body: [
      'A cycle that arrives a few days early or late is usually just a normal cycle. Stress, illness, travel, big sleep changes, intense exercise, and weight shifts all nudge cycle length.',
      'Variation of up to about 7–9 days between cycles is common, especially in the first years after menarche and during the approach to menopause.',
      'Cycles that consistently fall outside 21–35 days, stop for 3+ months without pregnancy, or come with very heavy or long bleeding are worth a clinician conversation — not as an emergency, but as a pattern worth naming.',
      'The Insights tab tracks your own variation (± days across your recent cycles), which is far more useful than any population average.',
    ],
  },
  {
    slug: 'fertile-window',
    title: 'The fertile window, explained',
    category: 'Fertility',
    minutes: 3,
    source: 'ASRM / ACOG',
    body: [
      'The fertile window is the stretch of days in each cycle when intercourse can lead to pregnancy — roughly the 5 days before ovulation, ovulation day itself, and the day after. Sperm survive up to five days; the egg lives about a day.',
      'Apps estimate this window with the calendar method: ovulation is assumed to happen about 14 days before the next period. That is an average, not a promise — which is why predictions here are labeled estimates.',
      'If you are trying to conceive, timing intercourse every 1–2 days within the window is the standard advice. Ovulation (LH) tests detect the hormone surge that precedes ovulation by about a day; cervical mucus that is clear and stretchy like egg white is another classic sign.',
      'None of these signs are contraception. Fertility awareness for avoiding pregnancy requires dedicated training and strict rules, and typical-use failure rates are high.',
    ],
  },
  {
    slug: 'bbt-basics',
    title: 'Basal body temperature: what it can and cannot tell you',
    category: 'Fertility',
    minutes: 2,
    source: 'ACOG',
    body: [
      'Basal body temperature (BBT) is your body temperature at complete rest, taken immediately on waking. After ovulation, progesterone nudges it up by roughly 0.2–0.5°C (0.3–1°F) and it stays higher until the next period.',
      'The key limitation: the shift is retrospective. By the time you see it, the fertile window has already closed for that cycle. BBT confirms ovulation happened; it does not predict it.',
      'Measure at the same time each morning after at least a few hours of sleep, before getting up. Illness, alcohol, poor sleep, and travel can all blur the pattern.',
      'The Insights chart plots your BBT with an average line so sustained shifts are easy to spot.',
    ],
  },
  {
    slug: 'perimenopause-101',
    title: 'Perimenopause: the transition, briefly',
    category: 'Perimenopause',
    minutes: 3,
    source: 'NIA',
    body: [
      'Perimenopause is the years-long transition before menopause, usually starting in the 40s. Hormone levels become uneven rather than simply low — which is why cycles often become unpredictable in new ways: shorter, longer, heavier, lighter, or skipped for months.',
      'Common companions include hot flashes, night sweats, sleep disruption, mood changes, and brain fog. Their intensity varies enormously between people.',
      'Menopause itself is defined retrospectively: 12 consecutive months without a period. Until then, pregnancy is still possible.',
      'Bleeding after several months without a period, very heavy bleeding, or bleeding between periods should always be reported to a clinician — most causes are benign and treatable, but they deserve a check.',
      'Perimenopause mode in this app emphasizes gaps between periods and symptom burden rather than predicting your next period, because "regular" no longer applies.',
    ],
  },
  {
    slug: 'pregnancy-tests',
    title: 'Pregnancy tests: when to take them and how to read them',
    category: 'Pregnancy',
    minutes: 2,
    source: 'FDA',
    body: [
      'Home pregnancy tests detect hCG, a hormone that rises quickly after implantation. Most tests claim accuracy from the day of your expected period; testing earlier risks a false negative because hCG has not risen enough.',
      'A faint line is usually a positive — but retest in 48 hours; a healthy early pregnancy should produce a visibly darker line as hCG doubles roughly every two days.',
      'Morning urine is most concentrated and slightly more reliable early on. Read the result within the window in the instructions, not hours later — evaporation lines can masquerade as faint positives.',
      'If a test is negative but your period still does not arrive, retest after a few days. Persistent missed periods with negative tests deserve a clinician visit.',
    ],
  },
  {
    slug: 'cramps',
    title: 'Coping with menstrual cramps',
    category: 'Symptoms',
    minutes: 2,
    source: 'ACOG',
    body: [
      'Primary menstrual cramps come from uterine contractions driven by prostaglandins. They typically peak in the first 1–2 days of a period.',
      'Evidence-backed comfort measures: heat on the lower abdomen or back, regular exercise, adequate sleep, and NSAIDs like ibuprofen taken early — they work best started as cramps begin, because they block prostaglandin production.',
      'Cramps that stop you from normal activities, worsen over years, or come with pain at other times of the cycle deserve evaluation: endometriosis, fibroids, and adenomyosis are common and treatable causes that are often dismissed too long.',
    ],
  },
  {
    slug: 'privacy-local-first',
    title: 'Where your data actually lives',
    category: 'Privacy',
    minutes: 2,
    source: '—',
    body: [
      'Your logs live on your device and are backed up automatically to your private cloud space — no ads, no analytics, no data sale, ever.',
      'If you clear the app's site data or switch devices, signing in (or your backup code) brings everything back. You can also export a file backup any time from Settings.',
      'The optional app PIN keeps the app private on a shared device — handy, simple, and easy to turn on or off.',
    ],
  },
];

export interface TtcCard {
  slug: string;
  title: string;
  body: string;
  source: string;
}

export const TTC_CARDS: TtcCard[] = [
  {
    slug: 'ttc-window',
    title: 'The window is 6 days',
    body: 'Pregnancy is possible on roughly the 5 days before ovulation, ovulation day, and the day after. Timing intercourse every 1–2 days in the window is the standard advice.',
    source: 'ASRM',
  },
  {
    slug: 'ttc-opk',
    title: 'OPKs detect the LH surge, not release',
    body: 'A positive ovulation test means ovulation is likely within about 36 hours — it does not confirm the egg was released. Test mid-morning to early evening, and reduce fluids beforehand.',
    source: 'FDA',
  },
  {
    slug: 'ttc-bbt',
    title: 'BBT looks backward',
    body: 'The temperature shift confirms ovulation after it happened. Use it to learn your pattern across cycles, not to time intercourse in the current one.',
    source: 'ACOG',
  },
  {
    slug: 'ttc-negative',
    title: 'Early negatives are normal',
    body: 'Testing before your missed period often shows negative even during pregnancy — hCG needs time to rise. Retest every 2 days; a faint line counts, and should darken.',
    source: 'FDA',
  },
  {
    slug: 'ttc-folic',
    title: 'Start folic acid before conceiving',
    body: 'Public-health guidance recommends 400 mcg of folic acid daily starting at least a month before trying to conceive, because the neural tube closes very early — often before a positive test.',
    source: 'CDC',
  },
  {
    slug: 'ttc-when-help',
    title: 'When to seek an evaluation',
    body: 'If under 35, see a fertility specialist after 12 months of trying; at 35 or older, after 6 months. Earlier if cycles are irregular or you have known conditions.',
    source: 'ASRM',
  },
];

export interface ReliefGuide {
  slug: string;
  domain: string;
  title: string;
  tryNow: string[];
  askAbout: string[];
  source: string;
}

export const PERI_RELIEF: ReliefGuide[] = [
  {
    slug: 'peri-hot-flashes',
    domain: 'Hot flashes',
    title: 'When heat waves hit',
    tryNow: ['Dress in layers you can shed fast', 'Keep the bedroom cool and use breathable bedding', 'Note triggers — spicy food, alcohol, and stress are common ones'],
    askAbout: ['Whether non-hormonal prescription options make sense for you', 'Whether your hot-flash pattern or night versions are affecting sleep enough to treat'],
    source: 'NIA',
  },
  {
    slug: 'peri-sleep',
    domain: 'Sleep',
    title: 'Protecting sleep through the transition',
    tryNow: ['Keep a fixed wake time even after a rough night', 'Cut caffeine after noon and alcohol near bedtime', 'If you wake at 3 a.m. worried, keep lights low and try a boring task instead of scrolling'],
    askAbout: ['Whether sleep changes are hormone-driven or a separate sleep issue', 'Cognitive behavioral therapy for insomnia (CBT-I) as a first-line option'],
    source: 'NIA',
  },
  {
    slug: 'peri-focus',
    domain: 'Thinking & focus',
    title: 'Brain fog is real (and usually temporary)',
    tryNow: ['Offload memory: lists, calendars, one place for keys', 'Protect sleep and aerobic exercise — both measurably help cognition', 'Reduce multitasking; fog worsens with divided attention'],
    askAbout: ['Whether thyroid or sleep issues could be contributing', 'Whether your fog correlates with the worst sleep weeks — tracking helps spot this'],
    source: 'NIA',
  },
  {
    slug: 'peri-mood',
    domain: 'Mood',
    title: 'Mood swings and the transition',
    tryNow: ['Track mood alongside cycle chaos — seeing patterns reduces the "random" feeling', 'Regular movement and daylight exposure blunt mood dips for many people', 'Name it to people close to you; support helps more than silence'],
    askAbout: ['Whether mood changes warrant treatment in their own right', 'A history of depression reacting to hormonal shifts — it changes the options'],
    source: 'NIA / OWH',
  },
  {
    slug: 'peri-body',
    domain: 'Body & joints',
    title: 'Aches that showed up uninvited',
    tryNow: ['Strength training twice a week — muscle guards joints and bone', 'Keep moving; long stillness usually stiffens joints more', 'Warm baths and heat for flare days'],
    askAbout: ['Whether joint pain is hormone-related versus arthritis — the treatments differ', 'Bone-density screening if you have risk factors'],
    source: 'NIA',
  },
  {
    slug: 'peri-bleeding',
    domain: 'Cycle & bleeding',
    title: 'When bleeding changes, report it',
    tryNow: ['Log every bleed — dates, heaviness, clots; details make clinic visits far more useful', 'Keep iron-rich foods in rotation during heavy stretches'],
    askAbout: ['Any bleeding after 3+ months without a period', 'Periods lasting past 7 days, flooding, or clots larger than a grape — all standard reasons to get checked'],
    source: 'ACOG',
  },
];

export interface PregnancyChecklistGroup {
  id: string;
  title: string;
  items: { id: string; text: string }[];
}

export const PREG_CHECKLISTS: PregnancyChecklistGroup[] = [
  {
    id: 'start',
    title: 'Getting started',
    items: [
      { id: 'start-vitamins', text: 'Prenatal vitamin with 400+ mcg folic acid, if not already taking one' },
      { id: 'start-book', text: 'Book your first prenatal appointment (typically weeks 8–10)' },
      { id: 'start-review', text: 'Review current medications and supplements with a clinician' },
      { id: 'start-dates', text: 'Note the first day of your last period — dating starts there' },
    ],
  },
  {
    id: 't1',
    title: 'First trimester',
    items: [
      { id: 't1-water', text: 'Small, frequent meals and fluids for nausea' },
      { id: 't1-avoid', text: 'Alcohol, smoking, and high-mercury fish off the list' },
      { id: 't1-screen', text: 'Discuss screening options with your clinician' },
      { id: 't1-rest', text: 'Rest without guilt — first-trimester fatigue is hormonal, not laziness' },
    ],
  },
  {
    id: 't2',
    title: 'Second trimester',
    items: [
      { id: 't2-anatomy', text: 'Anatomy scan around weeks 18–22' },
      { id: 't2-movement', text: 'Watch for first fetal movements, often weeks 18–22' },
      { id: 't2-sleep', text: 'Side-sleeping becomes the recommended position' },
      { id: 't2-glucose', text: 'Glucose screening typically between weeks 24–28' },
    ],
  },
  {
    id: 't3',
    title: 'Third trimester',
    items: [
      { id: 't3-kick', text: 'Learn your baby’s movement pattern; report big drops promptly' },
      { id: 't3-bag', text: 'Pack a hospital bag and a rough birth plan around week 32–34' },
      { id: 't3-signs', text: 'Know labor signs: regular contractions, water breaking, bleeding' },
      { id: 't3-gdt', text: 'Group B strep screening around weeks 36–37' },
    ],
  },
];

export const PREG_FAQS: { q: string; a: string; source: string }[] = [
  {
    q: 'How is my due date calculated?',
    a: 'From the first day of your last period, counting 40 weeks — not from conception, which is typically around week 2 of that count. A first-trimester ultrasound is more accurate and can shift the date.',
    source: 'ACOG',
  },
  {
    q: 'Is spotting in early pregnancy normal?',
    a: 'Light spotting affects many pregnancies and often resolves on its own — but report any bleeding to your maternity team so they can rule out causes that need action.',
    source: 'ACOG',
  },
  {
    q: 'Can I keep exercising?',
    a: 'For most pregnancies, yes — moderate activity is encouraged. Contact sports, heavy lifting, and anything with fall risk are the usual exclusions. When in doubt, ask.',
    source: 'ACOG',
  },
  {
    q: 'What foods should I avoid?',
    a: 'The usual list: unpasteurized dairy, deli meats unless heated, high-mercury fish, and raw eggs/meat. Caffeine is usually capped around 200 mg per day.',
    source: 'CDC / FDA',
  },
  {
    q: 'When should I call immediately?',
    a: 'Heavy bleeding, severe or one-sided pain, fever, severe headache with vision changes, sudden swelling, or your water breaking — these warrant same-day contact.',
    source: 'ACOG',
  },
  {
    q: 'What if I go past my due date?',
    a: 'Most babies arrive between weeks 37 and 42, and only about 5% are born on the exact due date. Clinicians typically discuss induction between 41 and 42 weeks.',
    source: 'ACOG',
  },
];

export function articlesByCategory(): { category: string; articles: Article[] }[] {
  const cats = [...new Set(ARTICLES.map((a) => a.category))];
  return cats.map((category) => ({ category, articles: ARTICLES.filter((a) => a.category === category) }));
}

export function searchContent(q: string): Article[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return ARTICLES.filter(
    (a) => a.title.toLowerCase().includes(needle) || a.body.some((p) => p.toLowerCase().includes(needle))
  );
}
