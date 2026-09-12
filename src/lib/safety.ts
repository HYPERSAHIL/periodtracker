import { DayEntry, Settings } from '../types';
import { diffDays, todayISO } from './date';
import { PeriodCluster } from './cycle';
import { tx } from './i18n';

export type Urgency = 'none' | 'routine' | 'same day' | 'emergency';

export interface SafetyNotice {
  id: string;
  urgency: Exclude<Urgency, 'none'>;
  headline: string;
  detail: string;
  source: string;
}

const URGENCY_RANK: Record<Urgency, number> = { none: 0, routine: 1, 'same day': 2, emergency: 3 };

/**
 * Deterministic triage over the most recent week of logs. Fixed rules, fixed
 * thresholds, no probability, and always framed as "contact a clinician",
 * never a diagnosis. Sources referenced: ACOG patient guidance, NIMH crisis line.
 */
export function safetyTriage(entries: Record<string, DayEntry>, settings: Settings, clusters: PeriodCluster[]): SafetyNotice[] {
  const today = todayISO();
  const lang = settings.lang;
  const recent: DayEntry[] = [];
  for (let i = 0; i < 7; i++) {
    const d = Object.values(entries).find((e) => e.date === addDaysLocal(today, -i));
    if (d) recent.push(d);
  }
  const last = recent[0];
  const notices: SafetyNotice[] = [];
  const add = (n: SafetyNotice) => {
    if (!notices.some((x) => x.id === n.id)) notices.push(n);
  };

  // Heavy bleeding with systemic symptoms → same day; sustained heavy → routine
  const heavyDays = recent.filter((e) => e.flow === 'heavy').length;
  const systemic = recent.some((e) => e.symptoms.includes('Dizziness') || e.symptoms.includes('Fainting') || e.symptoms.includes('Breathlessness'));
  if (heavyDays >= 2 && systemic) {
    add({
      id: 'heavy systemic',
      urgency: 'same day',
      headline: tx(lang, 'Heavy bleeding with dizziness, fainting, or breathlessness'),
      detail: tx(lang, 'Soaking through protection repeatedly together with these symptoms is a pattern ACOG says should be assessed promptly. Contact a clinician today.'),
      source: 'ACOG: abnormal uterine bleeding',
    });
  } else if (heavyDays >= 3) {
    add({
      id: 'heavy sustained',
      urgency: 'routine',
      headline: tx(lang, 'Several days of heavy bleeding'),
      detail: tx(lang, 'Repeatedly heavy days are worth mentioning at your next appointment even if you feel okay.'),
      source: 'ACOG: abnormal uterine bleeding',
    });
  }

  // Bleeding longer than 7 days
  const currentCluster = [...clusters].reverse().find((c) => diffDays(c.end, today) <= 2 && diffDays(c.start, today) <= 14);
  if (currentCluster && currentCluster.length > 7) {
    add({
      id: 'bleeding long',
      urgency: 'routine',
      headline: tx(lang, 'Bleeding has lasted {n} days', { n: currentCluster.length }),
      detail: tx(lang, 'Periods lasting more than a week are a standard reason to check in with a clinician.'),
      source: 'ACOG: abnormal uterine bleeding',
    });
  }

  // Bleeding between periods (logged spotting outside a period cluster, this week)
  const spottingBetween = recent.filter((e) => {
    if (!e.flow) return false;
    const inCluster = clusters.some((c) => e.date >= c.start && e.date <= c.end);
    return !inCluster;
  }).length;
  if (spottingBetween >= 2) {
    add({
      id: 'bleeding between',
      urgency: 'routine',
      headline: tx(lang, 'Bleeding between periods'),
      detail: tx(lang, 'Bleeding on days outside your period is common and usually benign, but ACOG recommends reporting it if it repeats.'),
      source: 'ACOG: intermenstrual bleeding',
    });
  }

  // Bleeding after a long gap while in perimenopause mode
  if (settings.mode === 'perimenopause' && last?.flow) {
    const gap = clusters.length >= 2 ? diffDays(clusters[clusters.length - 2].start, clusters[clusters.length - 1].start) : 0;
    if (gap >= 90) {
      add({
        id: 'bleeding-after-gap',
        urgency: 'routine',
        headline: tx(lang, 'Bleeding after a 3+ month gap'),
        detail: tx(lang, 'Any bleeding after several months without a period should be evaluated by a clinician to rule out treatable causes.'),
        source: 'ACOG: postmenopausal bleeding guidance',
      });
    }
  }

  // Pregnancy + pain/bleeding
  if (settings.mode === 'pregnant') {
    const severePain = recent.some((e) => e.symptoms.includes('Severe pelvic pain'));
    const bleeding = recent.some((e) => !!e.flow);
    const shoulderOrFaint = recent.some((e) => e.symptoms.includes('Fainting') || e.symptoms.includes('Dizziness'));
    if (severePain && (bleeding || shoulderOrFaint)) {
      add({
        id: 'preg emergency',
        urgency: 'emergency',
        headline: tx(lang, 'Severe pain with bleeding or fainting during pregnancy'),
        detail: tx(lang, 'This combination needs emergency assessment now. It can signal an ectopic pregnancy, which is time sensitive.'),
        source: 'ACOG: ectopic pregnancy',
      });
    } else if (severePain || (bleeding && shoulderOrFaint)) {
      add({
        id: 'preg urgent',
        urgency: 'same day',
        headline: tx(lang, 'One sided or severe pain, or bleeding during pregnancy'),
        detail: tx(lang, 'Contact your maternity team today. Many causes are benign, but this pattern should always be checked the same day.'),
        source: 'ACOG: bleeding and pain in pregnancy',
      });
    }
  }

  // Unusual discharge
  if (recent.some((e) => e.mucus === 'unusual')) {
    add({
      id: 'discharge unusual',
      urgency: 'routine',
      headline: tx(lang, 'Unusual discharge logged'),
      detail: tx(lang, 'Discharge with an unusual color or smell often means an easily treated infection. A quick clinician visit can sort it out.'),
      source: 'CDC: vaginal infections',
    });
  }

  // Cycle deviations: infrequent (90d+), frequent (<21d) — FIGO/ACOG red flags
  if (clusters.length >= 2) {
    const lastGap = diffDays(clusters[clusters.length - 2].start, clusters[clusters.length - 1].start);
    if (lastGap > 90) {
      add({
        id: 'gap infrequent',
        urgency: 'routine',
        headline: tx(lang, '{n} days between periods — infrequent bleeding', { n: lastGap }),
        detail: tx(lang, 'Gaps over 90 days fall outside the typical range. Common causes include PCOS, thyroid, stress, and perimenopause — worth a clinician visit.'),
        source: 'ACOG: abnormal uterine bleeding',
      });
    } else if (lastGap < 21 && lastGap > 0) {
      add({
        id: 'gap frequent',
        urgency: 'routine',
        headline: tx(lang, '{n} days between periods — frequent bleeding', { n: lastGap }),
        detail: tx(lang, 'Bleeding more often than every 21 days is worth mentioning to a clinician, especially with heavy flow or fatigue.'),
        source: 'ACOG: abnormal uterine bleeding',
      });
    }
    // sudden change vs the previous interval: thyroid/prolactin nudge
    if (clusters.length >= 3) {
      const prevGap = diffDays(clusters[clusters.length - 3].start, clusters[clusters.length - 2].start);
      if (prevGap >= 21 && prevGap <= 45 && Math.abs(lastGap - prevGap) >= 14) {
        add({
          id: 'sudden change',
          urgency: 'routine',
          headline: tx(lang, 'Sudden cycle change ({a}d → {b}d)', { a: prevGap, b: lastGap }),
          detail: tx(lang, 'A sharp change after steady cycles can follow stress, illness, weight shifts — or thyroid and prolactin changes. Consider a checkup with TSH.'),
          source: 'ACOG: abnormal uterine bleeding',
        });
      }
    }
    // bleeding after a 12+ month gap: postmenopausal red flag
    if (lastGap >= 365) {
      add({
        id: 'bleeding after menopause',
        urgency: 'same day',
        headline: tx(lang, 'Bleeding after a year without periods'),
        detail: tx(lang, 'Any bleeding after 12 months without a period needs prompt clinician assessment to rule out serious causes.'),
        source: 'ACOG: postmenopausal bleeding',
      });
    }
  }

  // RED-S: lost period + heavy training load
  if (settings.mode !== 'pregnant' && settings.mode !== 'postpartum' && clusters.length > 0) {
    const lastStart = clusters[clusters.length - 1].start;
    const gapDays = diffDays(lastStart, today);
    if (gapDays > 60) {
      let exerciseMin = 0;
      for (let i = 0; i < 30; i++) {
        const d = Object.values(entries).find((e) => e.date === addDaysLocal(today, -i));
        exerciseMin += d?.exerciseMinutes ?? 0;
      }
      if (exerciseMin / 4 > 300) {
        add({
          id: 'red-s',
          urgency: 'routine',
          headline: tx(lang, 'Missed period with heavy training'),
          detail: tx(lang, 'Losing periods while training hard can mean low energy availability (RED-S), which harms bone and performance. Fueling up + a clinician visit help.'),
          source: 'IOC RED-S consensus',
        });
      }
    }
  }

  notices.sort((a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]);
  return notices.slice(0, 3);
}

function addDaysLocal(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const CRISIS_NOTE =
  'If you are having thoughts of harming yourself, please reach out now: in the US call or text 988 ' +
  '(Suicide & Crisis Lifeline); in the UK call 116 123 (Samaritans); elsewhere find your local line at ' +
  'findahelpline.com. You deserve support.';
