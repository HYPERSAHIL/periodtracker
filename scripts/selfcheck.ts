/**
 * Zero-dependency self-check for the pure cycle math (run: bun scripts/selfcheck.ts).
 * Covers the fixed regressions: Report latest-index is UI-level, but the
 * calendar/dashboard fertile agreement, pattern-card denominators, and the
 * most-recent-cluster safety read all live here.
 */
import { strict as assert } from 'node:assert';
import { DEFAULT_SETTINGS, type DayEntry, type Settings } from '../src/types';
import { addDays, monthGrid, todayISO, weekdayHeads } from '../src/lib/date';
import { buildFacts, computeStats, periodClusters } from '../src/lib/cycle';
import { mergeImportedEntries, parseCSVEntries, parseHealthXML, parseWearableCSV } from '../src/lib/storage';
import { adherenceConfidence, detectThermalShift, perimenstrualMigraine, variabilityPhenotype } from '../src/lib/stats';
import { guideAnswer } from '../src/lib/guide';
import { normLang, tx } from '../src/lib/i18n';
import { patternCards, trackingCompleteness, windowStats } from '../src/lib/stats';
import { safetyTriage } from '../src/lib/safety';

const today = todayISO();
const ago = (n: number) => addDays(today, -n);

function entry(date: string, patch: Partial<DayEntry> = {}): DayEntry {
  return {
    date,
    checkedIn: true,
    flow: null,
    clots: false,
    symptoms: [],
    moods: [],
    note: '',
    mucus: null,
    bbt: null,
    weight: null,
    lhTest: null,
    pregnancyTest: null,
    intercourse: null,
    drive: null,
    sleepHours: null,
    sleepQuality: null,
    water: null,
    steps: null,
    exerciseMinutes: null,
    alcohol: null,
    caffeine: null,
    smoked: false,
    supplements: false,
    pillTaken: false,
    pillMissed: false,
    symptomSeverity: null,
    routineImpact: null,
    painLevel: null,
    painAreas: [],
    updatedAt: 1,
    ...patch,
  };
}

function flowDays(startAgo: number, len: number): DayEntry[] {
  const out: DayEntry[] = [];
  for (let i = 0; i < len; i++) out.push(entry(ago(startAgo - i), { flow: 'medium' }));
  return out;
}

const settings: Settings = { ...DEFAULT_SETTINGS, onboarded: true };

// 1. consecutive flow days group into one cluster
{
  const entries: Record<string, DayEntry> = {};
  for (const e of flowDays(60, 5)) entries[e.date] = e;
  const clusters = periodClusters(entries);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].length, 5);
}

// 2. forecast: two 28d-apart periods → avg 28, next = last + 28
// 3. fertile markers in buildFacts agree with computeStats (no hardcoded -14)
{
  const entries: Record<string, DayEntry> = {};
  for (const e of [...flowDays(56, 5), ...flowDays(28, 5)]) entries[e.date] = e;
  const stats = computeStats(entries, settings);
  assert.equal(stats.avgCycle, 28);
  assert.equal(stats.nextStart, addDays(ago(28), 28));
  const facts = buildFacts(entries, stats);
  assert.ok(stats.ovulationDate);
  assert.equal(facts.get(stats.ovulationDate!)?.ovulation, true);
  assert.equal(facts.get(stats.fertileStart!)?.fertile, true);
}

// 4. LH personalization: LH+ 12d before next start → luteal 12, ovulation shifts
{
  const entries: Record<string, DayEntry> = {};
  for (const e of [...flowDays(56, 5), ...flowDays(28, 5)]) entries[e.date] = e;
  entries[ago(40)] = entry(ago(40), { lhTest: 'positive' }); // 12d before ago(28)
  const stats = computeStats(entries, settings);
  assert.equal(stats.lutealLength, 12);
  assert.equal(stats.ovulationDate, addDays(stats.nextStart!, -12));
}

// 5. pattern cards don't crash on empty history; window stats sane
{
  const stats = computeStats({}, settings);
  assert.deepEqual(patternCards({}, stats, new Map(), settings), []);
  const w = windowStats([28, 30, 29], 6);
  assert.equal(w.median, 29);
  assert.equal(trackingCompleteness({}).pct, 0);
}

// 6. safety uses the MOST RECENT cluster: old 11-day bleed + fresh 1-day
//    bleed must NOT raise "bleeding long"
{
  const entries: Record<string, DayEntry> = {};
  for (const e of [...flowDays(12, 11), ...flowDays(0, 1)]) entries[e.date] = e;
  const clusters = periodClusters(entries);
  assert.equal(clusters.length, 2);
  const notices = safetyTriage(entries, settings, clusters);
  assert.ok(!notices.some((n) => n.id === 'bleeding long'), 'stale long bleed must not fire');
  // and a genuinely current 8-day bleed DOES fire
  const entries2: Record<string, DayEntry> = {};
  for (const e of flowDays(0, 8)) entries2[e.date] = e;
  const notices2 = safetyTriage(entries2, settings, periodClusters(entries2));
  assert.ok(notices2.some((n) => n.id === 'bleeding long'), 'current long bleed must fire');
}

// 7. week-start grids: Monday-first default, Sunday-first optional, 42 cells each
{
  const mon = monthGrid(2026, 7, 1); // August 2026 starts on a Saturday
  const sun = monthGrid(2026, 7, 0);
  assert.equal(mon.length, 42);
  assert.equal(sun.length, 42);
  assert.equal(mon[0], '2026-07-27'); // Monday
  assert.equal(sun[0], '2026-07-26'); // Sunday
  assert.ok(mon.includes('2026-08-01') && sun.includes('2026-08-31'));
  assert.equal(weekdayHeads(1).length, 7);
  assert.equal(weekdayHeads(0).length, 7);
}

// 8. Apple Health export.xml: units convert, steps sum, sleep sums, junk ignored
{
  const xml = `<HealthData locale="en_US">
   <Record type="HKQuantityTypeIdentifierBodyMass" value="60.5" unit="kg" startDate="2026-08-01 07:00:00 +0530"/>
   <Record type="HKQuantityTypeIdentifierBodyMass" value="132" unit="lb" startDate="2026-08-02 07:00:00 +0530"/>
   <Record type="HKQuantityTypeIdentifierBodyTemperature" value="36.6" unit="degC" startDate="2026-08-01 07:05:00 +0530"/>
   <Record type="HKQuantityTypeIdentifierBodyTemperature" value="97.7" unit="degF" startDate="2026-08-02 07:05:00 +0530"/>
   <Record type="HKQuantityTypeIdentifierStepCount" value="3000" startDate="2026-08-01 08:00:00 +0530"/>
   <Record type="HKQuantityTypeIdentifierStepCount" value="5000" startDate="2026-08-01 18:00:00 +0530"/>
   <Record type="HKQuantityTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAsleep" startDate="2026-07-31 23:00:00 +0530" endDate="2026-08-01 07:00:00 +0530"/>
   <Record type="HKQuantityTypeIdentifierHeartRate" value="72" startDate="2026-08-01 09:00:00 +0530"/>
  </HealthData>`;
  const out = parseHealthXML(xml)!;
  assert.ok(out);
  assert.equal(out['2026-08-01'].weight, 60.5);
  assert.equal(out['2026-08-01'].bbt, 36.6);
  assert.equal(out['2026-08-01'].steps, 8000);
  assert.equal(out['2026-08-01'].sleepHours, 8);
  assert.ok(Math.abs(out['2026-08-02'].weight! - 59.87) < 0.01); // 132 lb → kg
  assert.ok(Math.abs(out['2026-08-02'].bbt! - 36.5) < 0.06); // 97.7 °F → °C
  assert.equal(parseHealthXML('<nope/>'), null);
  assert.equal(parseHealthXML('<HealthData></HealthData>'), null);
}

// 9. import merge never deletes; validators + i18n guards hold
{
  const cur = entry(ago(5), { flow: 'medium', symptoms: ['Cramps'], note: 'keep me', steps: 1000 });
  const inc = { ...entry(ago(5), { steps: 8000, weight: 60 }), symptoms: [], note: '' };
  const merged = mergeImportedEntries({ [cur.date]: cur }, { [inc.date]: inc });
  const m = merged[cur.date];
  assert.equal(m.flow, 'medium');
  assert.deepEqual(m.symptoms, ['Cramps']);
  assert.equal(m.note, 'keep me');
  assert.equal(m.steps, 8000);
  assert.equal(m.weight, 60);
  // junk flow/mucus rejected at normalize; case-insensitive enums accepted
  const junk = parseCSVEntries('date,flow,mucus\n2026-01-01,Heavy,goo\n2026-01-02,heavy,Eggwhite')!;
  assert.equal(junk['2026-01-01'].flow, 'heavy');
  assert.equal(junk['2026-01-01'].mucus, null);
  assert.equal(junk['2026-01-02'].flow, 'heavy');
  assert.equal(junk['2026-01-02'].mucus, 'eggwhite');
  // unknown Health units skipped, not stored raw
  const xu = parseHealthXML('<HealthData><Record type="HKQuantityTypeIdentifierBodyMass" value="60000" unit="g" startDate="2026-01-03 07:00:00 +0000"/><Record type="HKQuantityTypeIdentifierBodyMass" value="9" unit="st" startDate="2026-01-04 07:00:00 +0000"/></HealthData>')!;
  assert.equal(xu['2026-01-03'].weight, 60);
  assert.equal(xu['2026-01-04'], undefined);
  // metric-only imports are not check-ins
  assert.equal(xu['2026-01-03'].checkedIn, false);
  // i18n: $ in values stays literal; BCP-47 Hindi accepted
  assert.equal(tx('en', 'Signed in as {name}', { name: 'A$&B' }), 'Signed in as A$&B');
  assert.equal(normLang('hi-IN'), 'hi');
  assert.equal(normLang('HI'), 'hi');
  assert.equal(normLang(undefined), 'en');
}

// 10. thermal shift, wearable CSV, pain validation
{
  const temps: Record<string, import('../src/types').DayEntry> = {};
  const base = ['36.4', '36.5', '36.4', '36.6', '36.5', '36.4'];
  base.forEach((t, i) => {
    temps[`2026-07-${10 + i}`] = entry(`2026-07-${10 + i}`, { bbt: Number(t) });
  });
  ['36.9', '37.0', '36.9'].forEach((t, i) => {
    temps[`2026-07-${16 + i}`] = entry(`2026-07-${16 + i}`, { bbt: Number(t) });
  });
  const shift = detectThermalShift(temps);
  assert.ok(shift);
  assert.equal(shift!.date, '2026-07-16');
  assert.equal(shift!.ovulation, '2026-07-15');
  assert.ok(detectThermalShift({}) === null);

  const w = parseWearableCSV('date,avg temp,WeightKG,total steps,sleep hours\n2026-08-01,36.6,60.5,8000,7.5\n08/02/2026,36.7,60.2,5000,6')!;
  assert.ok(w);
  assert.equal(w.tempUnit, 'C');
  assert.equal(w.weightUnit, 'kg');
  assert.equal(w.entries['2026-08-01'].bbt, 36.6);
  assert.equal(w.entries['2026-08-01'].steps, 8000);
  assert.equal(w.entries['2026-08-02'].sleepHours, 6);
  assert.equal(parseWearableCSV('foo,bar\n1,2'), null);

  // pain: clamp + area whitelist + merge union
  const pc = parseCSVEntries('date,painLevel,painAreas\n2026-02-01,15,pelvis|moonglow\n2026-02-02,7,back')!;
  assert.equal(pc['2026-02-01'].painLevel, 10);
  assert.deepEqual(pc['2026-02-01'].painAreas, ['pelvis']);
  const pm = mergeImportedEntries(
    { '2026-02-02': { ...pc['2026-02-02'], painAreas: ['back'] } },
    { '2026-02-02': { ...pc['2026-02-02'], painAreas: ['pelvis'], painLevel: null } }
  );
  assert.deepEqual(pm['2026-02-02'].painAreas, ['back', 'pelvis']);
  assert.equal(pm['2026-02-02'].painLevel, 7);
}

console.log('selfcheck: all 10 groups passed');

// 11. phenotype, adherence, migraine window, guide engine, wearable dayFirst
{
  assert.equal(variabilityPhenotype([28, 28, 29, 28]), 'stable');
  assert.equal(variabilityPhenotype([28, 35, 26, 40]), 'highly-variable');
  assert.equal(variabilityPhenotype([28]), 'unknown');
  assert.equal(adherenceConfidence({}).low, false);
  const sparse: Record<string, import('../src/types').DayEntry> = {};
  sparse['2026-01-01'] = entry('2026-01-01', { checkedIn: true });
  assert.equal(adherenceConfidence(sparse).low, false); // <30d history, no verdict

  const mig: Record<string, import('../src/types').DayEntry> = {};
  mig['2026-03-01'] = entry('2026-03-01', { flow: 'medium' });
  mig['2026-02-28'] = entry('2026-02-28', { migraine: true });
  mig['2026-03-02'] = entry('2026-03-02', { migraine: true });
  mig['2026-03-20'] = entry('2026-03-20', { migraine: true });
  const mw = perimenstrualMigraine(mig, periodClusters(mig));
  assert.equal(mw.total, 3);
  assert.equal(mw.inWindow, 2);

  const wd = parseWearableCSV('date,steps\n13/08/2026,1000\n02/08/2026,2000', { dayFirst: true })!;
  assert.ok(wd.entries['2026-08-13']);
  assert.ok(wd.entries['2026-08-02']); // tie broken DD/MM
  const wm = parseWearableCSV('date,steps\n02/08/2026,2000')!;
  assert.ok(wm.entries['2026-02-08']); // tie broken MM/DD by default

  const entries: Record<string, import('../src/types').DayEntry> = {};
  for (const e of [...flowDays(56, 5), ...flowDays(28, 5)]) entries[e.date] = e;
  const st = computeStats(entries, settings);
  const facts = buildFacts(entries, st);
  const late = await guideAnswer(entries, settings, st, facts, 'why is my period late?');
  assert.ok(late.articles.includes('cycle-variation'));
  assert.ok(late.disclaimer);
  const unknown = await guideAnswer(entries, settings, st, facts, 'zzqx jumbled nonsense');
  assert.equal(unknown.articles.length, 0);
}

console.log('selfcheck: all 11 groups passed');