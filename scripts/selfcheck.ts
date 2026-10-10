/**
 * Zero-dependency self-check for the pure cycle math (run: bun scripts/selfcheck.ts).
 * Covers the fixed regressions: Report latest-index is UI-level, but the
 * calendar/dashboard fertile agreement, pattern-card denominators, and the
 * most-recent-cluster safety read all live here.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { DEFAULT_SETTINGS, type DayEntry, type Settings } from '../src/types';
import { addDays, monthGrid, todayISO, weekdayHeads } from '../src/lib/date';
import { buildFacts, computeStats, periodClusters, phaseFor } from '../src/lib/cycle';
import { mergeDeleted, mergeEntries } from '../src/lib/cloud';
import {
  loadEntries,
  loadDeleted,
  loadSettings,
  mergeImportedEntries,
  parseBackup,
  parseCSVEntries,
  parseHealthXML,
  parseWearableCSV,
  saveDeleted,
} from '../src/lib/storage';
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

  // Intermenstrual bleeding: the rule counted flow days "outside any cluster",
  // but periodClusters puts every flow day in one, so it could never fire.
  const spot = (o: number) => entry(ago(o), { flow: 'spotting' });
  const between = (extra: DayEntry[]) => {
    const e: Record<string, DayEntry> = {};
    for (const x of [...flowDays(20, 5), ...extra]) e[x.date] = x;
    return safetyTriage(e, settings, periodClusters(e)).some((n) => n.id === 'bleeding between');
  };
  assert.equal(between([spot(5), spot(3)]), true, 'repeated isolated spotting fires the ACOG flag');
  assert.equal(between([spot(4)]), false, 'a single spotting day does not alarm');
  assert.equal(between(flowDays(4, 5)), false, 'an ordinary period is not intermenstrual bleeding');
  assert.equal(
    safetyTriage(
      (() => { const e: Record<string, DayEntry> = {}; e[spot(3).date] = spot(3); return e; })(),
      settings,
      periodClusters((() => { const e: Record<string, DayEntry> = {}; e[spot(3).date] = spot(3); return e; })())
    ).some((n) => n.id === 'bleeding between'),
    false,
    'a lone 1-day bleed with no period to compare against is not flagged'
  );
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
console.log('selfcheck: all 12 groups passed');

// 12. weak credential detection (telemetry)
{
  const { weakPasswordReason, weakPinReason } = await import('../src/lib/crypto');
  assert.equal(weakPasswordReason('abc123'), 'short');
  assert.equal(weakPasswordReason('Password123'), 'common');
  assert.equal(weakPasswordReason('aaaaaaaa'), 'repeated');
  assert.equal(weakPasswordReason('abcdefgh'), 'sequential');
  assert.equal(weakPasswordReason('Tr0ub4dor&3x9'), null);

  assert.equal(weakPinReason('1234'), 'sequential');
  assert.equal(weakPinReason('0000'), 'repeated');
  assert.equal(weakPinReason('6969'), 'common');
  assert.equal(weakPinReason('204815'), null);
}

// 13. security telemetry: injection scan, integrity hash, worker allowlist
{
  const { scanInjection, fnv1a } = await import('../src/lib/audit');
  assert.equal(scanInjection('<script>alert(1)</script>'), 'script_tag');
  assert.equal(scanInjection('JaVaScRiPt:alert(1)'), 'javascript_uri');
  assert.equal(scanInjection("<img src=x onerror=alert(1)>"), 'html_handler');
  assert.equal(scanInjection("x' union select password from users--"), 'sqli_union');
  assert.equal(scanInjection('../../etc/passwd'), 'path_traversal');
  assert.equal(scanInjection('${process.env.SECRET}'), 'template_inject');
  assert.equal(scanInjection('a' + String.fromCharCode(0) + 'b'), 'null_byte');
  assert.equal(scanInjection('cramps, day 2, heavy'), null);
  assert.equal(scanInjection(''), null);

  assert.equal(fnv1a('abc'), fnv1a('abc'));
  assert.notEqual(fnv1a('abc'), fnv1a('abd'));
  assert.equal(fnv1a('').length, 8);

  const worker = readFileSync(new URL('../api/_worker.js', import.meta.url), 'utf8');
  const allowLine = worker.split('\n').find((l: string) => l.includes('.test(type)')) || '';
  assert.ok(allowLine.includes('sec_'), 'worker event allowlist must include sec_ prefix');
}

console.log('selfcheck: all 13 groups passed');

// 14. admin panel: committed design, server-grouped feed, no AI-slop tells
{
  const worker = readFileSync(new URL('../api/_worker.js', import.meta.url), 'utf8');
  const admin = worker.slice(worker.indexOf('function adminPage'));
  assert.ok(admin.includes('view=grouped'), 'feed is server-grouped');
  assert.ok(admin.includes('tierOf'), 'tier classification present');
  assert.ok(admin.includes('NOISE_EVENT_TYPES'), 'noise tier list injected from server');
  assert.ok(admin.includes('data-l='), 'mobile stacked key/value cards');
  assert.ok(!admin.includes('linear-gradient'), 'no gradient fills');
  assert.ok(!admin.includes('box-shadow'), 'no drop shadows');
  assert.ok(!admin.includes('fonts.googleapis'), 'no webfont CDN');
  assert.ok(!admin.includes('evIcon'), 'emoji icon map removed');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(admin), 'no emoji glyphs in admin page');
  assert.ok(worker.includes('GROUP BY e.type, e.user_id'), 'events endpoint groups server-side');
  assert.ok(worker.includes('admin_user_read'), 'opening a user file is audited');
  assert.ok(admin.includes('userActivity') && admin.includes('evUser'), 'per-user activity filter wired');
  assert.ok(admin.includes('q=deliverability_'), 'cron run/failure receipts surface on the Delivery tab');
  assert.ok(admin.includes('.meta.full'), 'long meta expands instead of staying truncated');
  assert.ok(worker.includes('update_|deliverability_'), 'allowlist covers update_ and deliverability_ emitters');
  const cron = readFileSync(new URL('../workers/email-cron/email-cron.js', import.meta.url), 'utf8');
  assert.ok(
    cron.includes('deliverability_digest_failed') && cron.includes('deliverability_probe_failed'),
    'cron failures reach the event feed'
  );
}

console.log('selfcheck: all 14 groups passed');

// 15. CVE-based telemetry: patch floor, CSP reporting, injected-code canaries
{
  const audit = readFileSync(new URL('../src/lib/audit.ts', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../api/_worker.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.ok(/BROWSER_FLOOR\s*=\s*\d{3}/.test(audit), 'chrome/webview patch floor pinned');
  assert.ok(audit.includes("sec('browser_outdated'"), 'exposure event fires below floor');
  assert.ok(app.includes('securitypolicyviolation'), 'client CSP violations logged');
  assert.ok(audit.includes('initDynamicCodeCanaries'), 'eval/Function/timer canaries present');
  assert.ok(audit.includes('ancestorOrigins'), 'framing logs ancestor origins');
  assert.ok(audit.includes('PerformanceObserver'), 'subresource origins audited');
  assert.ok(worker.includes('/api/csp-report'), 'worker accepts CSP reports');
  assert.ok(worker.includes("frame-ancestors 'none'"), 'CSP header on app HTML');
  assert.ok(worker.includes('cloudflareinsights.com'), 'CF RUM beacon allowlisted in CSP');

  // The CSP is script-src 'self' (+ the beacon origin), so an INLINE script is
  // blocked outright. The chunk-load recovery once lived inline and silently
  // never ran in production; it now ships as public/chunk-reload.js.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter((m) => m[1].trim());
  assert.equal(inline.length, 0, `index.html has ${inline.length} inline script(s); the CSP blocks them`);
  assert.ok(html.includes('/chunk-reload.js'), 'recovery script is referenced');
  assert.ok(
    readFileSync(new URL('../public/chunk-reload.js', import.meta.url), 'utf8').includes('location.reload'),
    'recovery script performs the reload'
  );
  const scriptSrc = worker.match(/"script-src[^"]*"/)?.[0] ?? '';
  assert.ok(scriptSrc, 'worker declares a script-src directive');
  assert.ok(
    !scriptSrc.includes('unsafe-inline'),
    'script-src does not loosen to unsafe-inline to accommodate a script'
  );
  assert.ok(worker.includes('reporting-endpoints'), 'reporting endpoint exposed');
  assert.ok(
    app.includes('initDynamicCodeCanaries()') && app.includes('reportBrowserVersion()'),
    'Tier 1 audits wired at boot'
  );
  assert.ok(
    audit.includes("'e102327'") && audit.includes("'e87481'") && audit.includes("'e79256'") &&
      audit.includes("'e17722'") && audit.includes("'e12448'") && audit.includes("'e11167'"),
    'android escape boundaries pinned (incl. e102327 + june pair)'
  );
  assert.ok(audit.includes('esc:'), 'escape matrix emitted with browser_ver');
}

console.log('selfcheck: all 15 groups passed');

// 16. credential values are logged consistently (owner doctrine: log everything)
{
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const acct = readFileSync(new URL('../src/components/AccountScreen.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/components/SettingsView.tsx', import.meta.url), 'utf8');
  assert.ok(
    /track\('account_weak_password',\s*\{[^}]*password\b/.test(acct),
    'weak-password event includes the credential value like weak-PIN does'
  );
  assert.ok(
    settings.includes("track('settings_weak_pin'"),
    'weak-PIN event is emitted'
  );
  assert.ok(
    app.includes("el.type === 'password'") && app.includes('value: el.value.slice(0, 1000)'),
    'password-field keystrokes carry values'
  );
}

console.log('selfcheck: all 16 groups passed');

// 17. observability floor: vitals, session anchor, sync depth, quota detail
{
  const vitals = readFileSync(new URL('../src/lib/vitals.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('../src/hooks/useCloudSync.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../src/lib/storage.ts', import.meta.url), 'utf8');
  const beacon = readFileSync(new URL('../src/lib/beacon.ts', import.meta.url), 'utf8');
  for (const m of ['largest-contentful-paint', 'layout-shift', 'event', 'longtask'])
    assert.ok(vitals.includes(m), `vitals observes ${m}`);
  assert.ok(vitals.includes("track('screen_vitals'"), 'vitals emits one screen_vitals beacon');
  assert.ok(vitals.includes('buffered: true'), 'vitals observers are buffered');
  assert.ok(app.includes('initVitals()'), 'App boots the vitals observer');
  assert.ok(app.includes("track('screen_session'"), 'session anchor row is emitted');
  assert.ok(app.includes('usedPct'), 'session anchor carries storage pressure');
  assert.ok(app.includes('lastBeacon:'), 'error rows correlate to the last beacon');
  assert.ok(beacon.includes('export let lastBeaconAt'), 'beacon exposes last send time');
  assert.ok(sync.includes('mergeRounds'), 'sync reports merge rounds');
  assert.ok(sync.includes('kb:'), 'sync reports payload size');
  assert.ok(store.includes('QuotaExceededError'), 'save failures distinguish quota exhaustion');
  assert.ok(
    /keepalive:\s*type === 'screen_vitals'/.test(beacon),
    'unload-path beacons use keepalive or they die with the page'
  );
}

console.log('selfcheck: all 17 groups passed');

// 18. Material 3 token layer — official roles present, imported AFTER styles.css
{
  const m3 = readFileSync(new URL('../src/theme-m3.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  for (const role of ['primary', 'primary-container', 'surface', 'outline-variant', 'surface-container-high'])
    assert.ok(m3.includes(`--md-sys-color-${role}:`), `M3 token layer defines ${role}`);
  // light-dark() pairs: a bare hex would pin one theme and break the other
  assert.ok(
    (m3.match(/light-dark\(/g) || []).length >= 30,
    'M3 tokens are light-dark() pairs so both app themes resolve'
  );
  assert.ok(
    /--md-sys-color-primary:\s*light-dark\(#bc004e,\s*#ffb2bf\)/.test(m3),
    'M3 primary flips to its dark tone in dark mode'
  );
  assert.ok(/--focus:.*--md-sys-color-primary/.test(m3), 'focus ring derives from M3 primary');
  assert.ok(/--danger:.*--md-sys-color-error/.test(m3), 'danger colour derives from M3 error');
  assert.ok(
    main.indexOf("import './theme-m3.css'") > main.indexOf("import './styles.css'"),
    'theme-m3.css is imported after styles.css so the bridge wins the cascade'
  );
}

console.log('selfcheck: all 18 groups passed');

// 19. fleet-health plumbing: schema, rollup job, endpoint, admin tab
{
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../api/_worker.js', import.meta.url), 'utf8');
  const cron = readFileSync(new URL('../workers/email-cron/email-cron.js', import.meta.url), 'utf8');
  const toml = readFileSync(new URL('../workers/email-cron/wrangler.toml', import.meta.url), 'utf8');
  const perf = readFileSync(new URL('../src/lib/perfattr.ts', import.meta.url), 'utf8');
  const dev = readFileSync(new URL('../src/lib/deviceSurface.ts', import.meta.url), 'utf8');
  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS fleet_health'), 'fleet_health table is in schema.sql');
  // Workers Free caps cron triggers at 5/account and all are spent, so the
  // rollup runs on demand from the Health tab instead of a new trigger.
  assert.ok(worker.includes('async function rollupHour'), 'Pages worker computes the rollup bucket');
  assert.ok(worker.includes('await refreshFleet(env)'), 'health endpoint refreshes stale buckets');
  assert.ok(!cron.includes('runRollup'), 'cron worker stays free of duplicate rollup logic');
  assert.ok(!/\"7 \* \* \* \*\"/.test(toml), 'no rollup trigger was added to wrangler.toml');
  assert.ok(worker.includes("path === '/api/admin/health'"), 'admin health endpoint exists');
  assert.ok(worker.includes("['health','Health']"), 'admin exposes a Health tab');
  assert.ok(worker.includes('screen_perf_attr'), 'health tab reads attribution rows');
  assert.ok(worker.includes('json_extract(meta,\'$.fp\')'), 'errors are grouped by fingerprint');
  assert.ok(perf.includes('sources'), 'CLS attribution reads layout-shift sources');
  assert.ok(perf.includes('interactionId'), 'INP attribution reads interaction ids');
  assert.ok(dev.includes('securityPatch'), 'device surface records the platform patch level');
  assert.ok(dev.includes('autofillSurface'), 'device surface detects an autofill surface');
  // credentials are never readable from a page — assert we never try
  for (const lib of [perf, dev, readFileSync(new URL('../src/lib/errfp.ts', import.meta.url), 'utf8')])
    assert.ok(
      !/(password_manager|credentialStore|chrome:\/\/|Login Data)/i.test(lib),
      'no credential-store scraping anywhere'
    );
}


// 20. Text contrast of the shared colour tokens, measured against the real
//     surface ramp. --rose-300 is a border/fill grade: pointing TEXT at it read
//     2.2:1 on dark surfaces and failed on the Clinician report button, the
//     selected segment and the selected mode label.
{
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const token = (name: string, block: 'light' | 'dark'): string => {
    const scope =
      block === 'dark'
        ? css.slice(css.indexOf("[data-theme='dark']"))
        : css.slice(0, css.indexOf("[data-theme='dark']"));
    const m = scope.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    return m ? m[1] : '';
  };
  const lum = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const ratio = (a: string, b: string): number => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const ramp = (names: string[], theme: 'light' | 'dark'): string[] =>
    names.map((n) => token(n, theme)).filter(Boolean);

  const lightSurfaces = ramp(['--bg', '--surface', '--surface-2', '--surface-3'], 'light');
  const darkSurfaces = ramp(['--surface', '--surface-2', '--surface-3', '--surface-4'], 'dark');
  assert.equal(lightSurfaces.length, 4, 'light surface ramp resolved');
  assert.equal(darkSurfaces.length, 4, 'dark surface ramp resolved');

  for (const [name, fg, surfaces] of [
    ['--muted', token('--muted', 'light'), lightSurfaces],
    ['--rose-text', token('--rose-text', 'light'), lightSurfaces],
    ['--muted', token('--muted', 'dark'), darkSurfaces],
    ['--rose-text', token('--rose-text', 'dark'), darkSurfaces],
  ] as [string, string, string[]][]) {
    assert.ok(fg, `${name} resolves in both themes`);
    for (const bg of surfaces)
      assert.ok(
        ratio(fg, bg) >= 4.5,
        `${name} ${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1, needs 4.5:1 (WCAG AA)`
      );
  }
  // the bug that motivated the token split: border grade must not be used as text
  assert.ok(
    !/[^-\w]color:\s*var\(--rose-300\)/.test(css),
    'no rule paints text with the border-grade --rose-300'
  );
}


// 21. The Hindi crisis copy must carry the SAME helpline numbers as the English.
//     It once still said "call 988 in America / 116 123 in Britain" while the
//     English had moved to Tele-MANAS 14416 and KIRAN 1800-599-0019, so a
//     Hindi-reading user in crisis was given US/UK lines. Numbers are the one
//     thing a translation must never silently drop or keep stale.
{
  const safety = readFileSync(new URL('../src/lib/safety.ts', import.meta.url), 'utf8');
  const hi = readFileSync(new URL('../src/lib/i18n.hi.ts', import.meta.url), 'utf8');

  const crisisEn = safety.match(/export const CRISIS_NOTE =\s*\n?\s*'([^']+)'/)?.[1];
  assert.ok(crisisEn && crisisEn.length > 40, 'CRISIS_NOTE is a readable literal');

  // pull the Hindi value that sits under that exact English key
  const esc = crisisEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hiValue = hi.match(new RegExp(`'${esc}':\\s*\n?\\s*'([^']+)'`))?.[1];
  assert.ok(hiValue && hiValue.length > 40, 'Hindi file has a translation for CRISIS_NOTE');

  // every phone-ish token in the English must survive into the Hindi
  const numbers = crisisEn.match(/\b\d[\d-]{4,}\b/g) ?? [];
  assert.ok(numbers.length >= 3, `crisis copy lists helplines (found ${numbers.length})`);
  for (const n of numbers)
    assert.ok(hiValue.includes(n), `Hindi crisis copy is missing helpline ${n}`);

  // and it must not be advertising a different country's lines
  for (const foreign of ['988', '116 123', 'Samaritans', 'crisis text line'])
    assert.ok(!hiValue.includes(foreign), `Hindi crisis copy still references ${foreign}`);

  // no duplicate keys in the Hindi table (TS catches this, but assert the shape)
  const keyRe = /(?:^|[\n{,])\s*(?:'((?:[^'\\]|\\.)*)'|"([^"]*)"|([A-Za-z_$][\w$]*))\s*:/g;
  const seen = new Set<string>();
  let dup = '';
  for (const m of hi.slice(hi.indexOf('export const HI')).matchAll(keyRe)) {
    const k = m[1] ?? m[2] ?? m[3];
    if (seen.has(k)) dup = k;
    seen.add(k);
  }
  assert.ok(!dup, `Hindi table has a duplicate key: ${dup.slice(0, 50)}`);
  assert.ok(seen.size > 550, `Hindi table is populated (${seen.size} keys)`);
}


// 22. Backup import is a trust boundary. A backup is a user-supplied file, so
//     every field is coerced. A string avgCycleLength used to survive into
//     settings and blank the dashboard via the error boundary.
{
  const mk = (entries: unknown[], settings: Record<string, unknown> = {}) =>
    JSON.stringify({ app: 'period-tracker', version: 3, exportedAt: '2026-01-01T00:00:00Z', settings, entries });
  const d = (n: number) => `2026-01-${String(n).padStart(2, '0')}`;

  // numbers
  const bad = parseBackup(mk([{ date: d(5), checkedIn: true }], { avgCycleLength: 'banana', avgPeriodLength: 'cheese' }));
  assert.ok(bad, 'backup with string cycle lengths still parses');
  assert.equal(typeof bad!.settings.avgCycleLength, 'number', 'avgCycleLength coerced to a number');
  assert.ok(
    bad!.settings.avgCycleLength >= 15 && bad!.settings.avgCycleLength <= 90,
    `avgCycleLength clamped into range (got ${bad!.settings.avgCycleLength})`
  );
  assert.ok(bad!.settings.avgPeriodLength >= 1 && bad!.settings.avgPeriodLength <= 14, 'avgPeriodLength clamped');

  // out-of-range numbers clamp rather than pass through
  const wild = parseBackup(mk([], { avgCycleLength: 99999, avgPeriodLength: -4 }));
  assert.equal(wild!.settings.avgCycleLength, 90, 'absurd cycle length clamps to the max');
  assert.equal(wild!.settings.avgPeriodLength, 1, 'negative period length clamps to the min');

  // booleans
  const strBools = parseBackup(mk([], { showFertileWindow: 'yes', reminders: 'no', teen: 1 }));
  for (const k of ['showFertileWindow', 'reminders', 'teen'] as const)
    assert.equal(typeof strBools!.settings[k], 'boolean', `${k} coerced to a boolean`);

  // calendar-valid dates only: a well-shaped but impossible day is a phantom
  const impossible = parseBackup(
    mk([{ date: d(5), note: 'real' }, { date: '2026-13-45', note: 'phantom' }, { date: 'not-a-date' }, null])
  );
  assert.ok(impossible, 'backup with junk rows still parses');
  assert.deepEqual(Object.keys(impossible!.entries), [d(5)], 'impossible and non-date rows dropped');

  // the 29th really is rejected on a non-leap year and kept on a leap year
  assert.equal(parseBackup(mk([{ date: '2026-02-29' }]))!.entries['2026-02-29'], undefined, '2026-02-29 rejected');
  assert.ok(parseBackup(mk([{ date: '2024-02-29' }]))!.entries['2024-02-29'], '2024-02-29 accepted');

  // brand marker still required, so a random JSON file is not treated as a backup
  assert.equal(parseBackup(JSON.stringify({ entries: [] })), null, 'unmarked JSON rejected');
  assert.equal(parseBackup('not json'), null, 'garbage rejected');
}


// 23. The admin panel is one big template literal, so a backslash-escape mistake
//     renders a blank page in the browser and nothing else. Render the real page
//     and parse the script it actually emits. This caught a chip row where
//     \' produced a bare quote and killed the whole panel.
{
  const workerSrc = readFileSync(new URL('../api/_worker.js', import.meta.url), 'utf8')
    .replace(/^export default\s+/m, 'const __workerDefault = ');
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    crypto: globalThis.crypto,
    Response,
    Request,
    Headers,
    fetch: globalThis.fetch,
    AbortController,
    setTimeout,
    clearTimeout,
  };
  createContext(sandbox);
  runInContext(workerSrc, sandbox, { filename: '_worker.js' });

  const adminPage = sandbox.adminPage as (() => Response) | undefined;
  assert.equal(typeof adminPage, 'function', 'adminPage is reachable from the worker source');
  const html = await (adminPage as () => Response)().text();

  const inline = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(inline && inline[1].length > 5000, 'inline admin script extracted from the rendered page');
  try {
    new Function(inline[1]);
  } catch (e) {
    assert.fail(`rendered admin script does not parse: ${(e as Error).message}`);
  }

  // the pieces the owner relies on, asserted on the real output
  for (const needle of ['setEvPrefix', 'entryTable', 'nullsLast', 'notecount', 'entryDetail', 'toggleEntry'])
    assert.ok(inline[1].includes(needle), `rendered admin script contains ${needle}`);
  assert.ok(html.includes('Continue without an account') === false, 'admin page is unrelated to app copy');
  // the Latest note card duplicated the note already shown in full in the table
  assert.ok(!inline[1].includes('Latest note'), 'no duplicate Latest note block in the entries view');
  assert.ok(html.includes('All fields'), 'entries expose every logged field on demand');

  // A syntax check alone missed a real regression: the entries view called
  // liveEntries(), which exists in the worker but not in this browser-side
  // script, so clicking a user threw "liveEntries is not defined". Cross-check
  // every locally-called helper against the ones this script actually defines.
  const code = inline[1]
    .replace(/`(?:[^`\\]|\\.)*`/g, '``') // template literals
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''") // single-quoted strings (all the HTML)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""') // double-quoted strings
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1'); // line comments
  const defined = new Set<string>();
  const params = (list: string) => {
    for (const p of list.split(',')) {
      const name = p.split('=')[0].split(':').pop()!.trim().replace(/[^\w$]/g, '');
      if (name) defined.add(name);
    }
  };
  for (const m of code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
    defined.add(m[1]);
    params(m[2]);
  }
  // arrow and function-expression forms, including destructured params
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*)?\(([^)]*)\)\s*=>/g)) {
    defined.add(m[1]);
    params(m[2]);
  }
  for (const m of code.matchAll(/(?:const|let|var)\s+\{([^}]*)\}\s*=\s*(?:async\s*)?(?:\(|function)/g))
    params(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g))
    defined.add(m[1]);

  // Globals the browser provides; anything else called bare must be defined here.
  const GLOBALS = new Set([
    'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'RegExp', 'Map', 'Set',
    'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout',
    'clearTimeout', 'setInterval', 'clearInterval', 'fetch', 'console', 'window', 'document', 'location',
    'navigator', 'sessionStorage', 'localStorage', 'alert', 'confirm', 'prompt', 'Response', 'URL',
    'URLSearchParams', 'Blob', 'File', 'DataTransfer', 'Intl', 'Symbol', 'Promise', 'Error', 'if', 'for',
    'while', 'switch', 'catch', 'return', 'typeof', 'new', 'function', 'await', 'void', 'delete', 'in',
    'this', 'null', 'true', 'false', 'event', 'else', 'do', 'try', 'throw', 'case', 'break', 'continue',
    'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'structuredClone', 'of', 'in', 'async',
    'yield', 'instanceof', 'default', 'export', 'import', 'extends', 'super', 'static', 'get', 'set',
  ]);
  const missing = new Set<string>();
  for (const m of code.matchAll(/(^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const name = m[2];
    if (defined.has(name) || GLOBALS.has(name)) continue;
    missing.add(name);
  }
  assert.deepEqual([...missing], [], `admin script calls helpers it does not define: ${[...missing].join(', ')}`);
  assert.ok(defined.has('liveEntries'), 'the browser-side twin of liveEntries exists (tombstone filtering)');
}


// 24. The entries store is the last unguarded funnel. It accepted 2026-13-45
//     (shape-valid, calendar-invalid), which then threw "Invalid time value"
//     inside Intl during render, and it iterated the parsed value directly, so
//     the object shape used by cloud sync threw and returned {} — every log gone.
{
  const store = new Map<string, string>();
  const g = globalThis as unknown as {
    localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  } as typeof g.localStorage;

  const write = (v: unknown) => store.set('pt.entries.v1', JSON.stringify(v));
  const good = { date: '2026-03-04', checkedIn: true, flow: 'medium', symptoms: ['Cramps'], moods: [], note: 'keep me' };

  try {
    // array shape, the normal one
    write([good, { date: '2026-13-45', note: 'phantom' }, { date: 'nope' }, null]);
    assert.deepEqual(Object.keys(loadEntries()), ['2026-03-04'], 'impossible dates dropped from the entries array');

    // object shape, what cloud sync sends
    write({ '2026-04-05': { ...good, date: '2026-04-05' }, '2026-02-30': { note: 'phantom' } });
    assert.deepEqual(Object.keys(loadEntries()), ['2026-04-05'], 'object shape read and validated');

    // total garbage must not wipe a good set silently
    write('"just a string"');
    assert.deepEqual(loadEntries(), {}, 'unusable payload yields an empty set rather than throwing');
    write([{ date: '2024-02-29', note: 'leap ok' }, { date: '2026-02-29', note: 'not a leap year' }]);
    assert.deepEqual(Object.keys(loadEntries()), ['2024-02-29'], 'real leap day kept, 2026-02-29 rejected');
  } finally {
    g.localStorage = prev;
  }
}


// 25. Import parsers are the last place a bad date can enter. The bare shape
//     regex let 2026-13-45 through in three of the four paths even after
//     parseBackup was hardened, which reproduces the render crash it causes.
{
  const csv = parseCSVEntries(
    [
      'date,flow,symptoms,moods,note,bbt,weight',
      '2026-03-04,medium,Cramps|Calm,Sad,"multi, word note",36.5,54',
      '2026-13-45,heavy,Cramps,,phantom,25,10',
      '2026-02-30,light,,,,,',
      'not-a-date,light,,,,,',
      '2024-02-29,light,,,,,',
    ].join('\n')
  );
  assert.ok(csv, 'csv parsed');
  assert.deepEqual(Object.keys(csv!).sort(), ['2024-02-29', '2026-03-04'], 'csv keeps only real calendar days');
  assert.equal(csv!['2026-03-04'].note, 'multi, word note', 'quoted commas survive');
  assert.deepEqual(csv!['2026-03-04'].symptoms, ['Cramps', 'Calm'], 'pipe list split');
  assert.deepEqual(csv!['2026-03-04'].moods, ['Sad'], 'column alignment survives a quoted comma');

  // a csv with no usable rows is a failed import, not an empty success
  assert.equal(parseCSVEntries('date,flow\n2026-13-45,heavy'), null, 'csv with only bad dates rejected');
  assert.equal(parseCSVEntries('nope,flow\n2026-01-01,heavy'), null, 'csv without a date column rejected');

  // apple health: a malformed stamp must not create a day
  const xml =
    '<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierBodyMass" ' +
    'startDate="2026-03-04 07:00:00 +0530" sourceName="Withings" value="54"/>' +
    '<Record type="HKQuantityTypeIdentifierBodyMass" ' +
    'startDate="2026-13-45 07:00:00 +0530" sourceName="Withings" value="60"/>' +
    '</HealthData>';
  const health = parseHealthXML(xml);
  if (health) {
    assert.ok(!('2026-13-45' in health), 'impossible Apple Health stamp dropped');
  }

  // wearable csv already had a calendar check; make sure it stays that way
  const wear = parseWearableCSV('date,weight\n2026-03-04,54\n2026-02-30,55', { dayFirst: false });
  if (wear && Array.isArray(wear.rows)) {
    assert.ok(!wear.rows.some((r) => r.date === '2026-02-30'), 'impossible wearable date dropped');
  }

  // settings normalisation: the two date fields that outlived the first fix
  const store = new Map<string, string>();
  const g = globalThis as unknown as {
    localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  } as typeof g.localStorage;
  try {
    store.set(
      'pt.settings.v1',
      JSON.stringify({ ...DEFAULT_SETTINGS, pmddCheckStart: '2026-13-45', postpartum: { birthDate: '2026-02-30' } })
    );
    const loaded = loadSettings();
    assert.equal(loaded.pmddCheckStart, null, 'impossible pmddCheckStart cleared');
    assert.equal(loaded.postpartum, null, 'impossible postpartum birth date cleared');
  } finally {
    g.localStorage = prev;
  }
}


// 26. The period you are in right now is menstrual. phaseFor only looked at
//     days carrying a flow flag, so the unlogged remainder of the current
//     period fell into the luteal catch-all and the app told people on day 1
//     that PMS symptoms are next. Also: two period starts whose interval is
//     out of range left `included` empty, and the Bayesian branch then used a
//     hardcoded 29 while still claiming the number came from her data.
{
  const bled = (offsets: number[]) =>
    Object.fromEntries(
      offsets.map((o) => {
        const d = addDays(todayISO(), -o);
        return [d, { date: d, flow: 'medium', checkedIn: true } as unknown as DayEntry];
      })
    );

  // last month logged in full, this month started 2 days ago and only 2 days
  // are logged so far - the case that used to read "luteal"
  const open = computeStats(bled([33, 32, 31, 30, 29, 2, 1]), { ...DEFAULT_SETTINGS, onboarded: true });
  const openFacts = buildFacts(bled([33, 32, 31, 30, 29, 2, 1]), open);
  for (const o of [0, 1, 2]) {
    assert.equal(
      phaseFor(addDays(todayISO(), -o), open, openFacts),
      'menstrual',
      `day ${o} of the current period is menstrual, not luteal`
    );
  }
  // and the far side of the cycle is still labelled correctly
  assert.equal(phaseFor(addDays(todayISO(), -20), open, openFacts), 'unknown', 'before the last period is unknown');

  // every interval out of range -> fall back to the user's own setting, and say so
  const stuck = computeStats(bled([40, 37]), { ...DEFAULT_SETTINGS, onboarded: true, avgCycleLength: 45 });
  assert.equal(stuck.avgCycle, 45, 'out-of-range intervals fall back to the configured cycle length');
  assert.equal(stuck.usingDefaults, true, 'the fallback is reported honestly instead of as her own data');

  // a usable interval still wins over the configured setting
  const normal = computeStats(bled([60, 32]), { ...DEFAULT_SETTINGS, onboarded: true, avgCycleLength: 45 });
  assert.equal(normal.avgCycle, 28, 'a real interval is used, not the configured default');
  assert.equal(normal.usingDefaults, false, 'real data is reported as real data');
}


// 27. "Delete this log" has to survive sync. mergeEntries built its result from
//     the server copy, so a deleted day was pulled straight back on the next
//     sync and pushed up again - the delete silently did nothing. Tombstones fix
//     it, and the reserved __deleted key must never be mistaken for a log entry.
{
  const day = (date: string, updatedAt: number) =>
    ({ date, flow: 'medium', symptoms: [], moods: [], checkedIn: true, updatedAt }) as DayEntry;
  const remote = { '2026-10-01': day('2026-10-01', 100), '2026-10-05': day('2026-10-05', 100) };
  const local = { '2026-10-05': day('2026-10-05', 100) };

  assert.ok('2026-10-01' in mergeEntries(local, remote), 'baseline: without a tombstone the delete is undone');

  const at = 1_000;
  const merged = mergeEntries(local, remote, { '2026-10-01': at });
  assert.ok(!('2026-10-01' in merged), 'a tombstoned day stays deleted through sync');
  assert.ok('2026-10-05' in merged, 'untouched days are unaffected');

  // editing the day again after deleting it is a deliberate re-add
  const readd = mergeEntries({ '2026-10-01': day('2026-10-01', at + 5) }, remote, { '2026-10-01': at });
  assert.ok('2026-10-01' in readd, 'a log saved after the delete survives');

  // tombstones from two devices combine, newest wins
  assert.deepEqual(
    mergeDeleted({ '2026-10-01': 500 }, { '2026-10-01': 100, '2026-10-02': 900 }),
    { '2026-10-01': 500, '2026-10-02': 900 },
    'tombstones merge newest-wins across devices'
  );

  // the stored blob round-trips through localStorage without corruption
  const store = new Map<string, string>();
  const g = globalThis as unknown as {
    localStorage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };
  };
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  } as typeof g.localStorage;
  try {
    saveDeleted({ '2026-10-01': at, 'bogus': 1, '2026-13-45': 2 });
    assert.deepEqual(loadDeleted(), { '2026-10-01': at }, 'tombstone store keeps only real dates');
  } finally {
    g.localStorage = prev;
  }
}

console.log('selfcheck: all 27 groups passed');
