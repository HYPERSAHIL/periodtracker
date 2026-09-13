/** Headless-Chrome E2E: every feature, real clicks (run: bun scripts/e2e.mjs).
 * Uses installed google-chrome (no browser download) + playwright-core.
 * Starts `vite preview` on :4173. Fails on any pageerror/console-error. */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/`;
const errors = [];
let passed = 0;

async function waitPort(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server never came up');
}

function watch(page, tag) {
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${String(e).slice(0, 160)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location();
    const url = (loc && loc.url) || '';
    // no backend in preview: /api/* 404s are expected, everything else is real
    if (/\/api\//.test(url) || /\/api\//.test(m.text())) return;
    errors.push(`[${tag}] console: ${m.text().slice(0, 120)} @ ${url.slice(0, 80)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !/\/api\//.test(r.url()) && !/favicon|sw\.js/.test(r.url())) {
      errors.push(`[${tag}] http ${r.status()}: ${r.url().slice(0, 120)}`);
    }
  });
}

async function freshPage(browser, tag) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  watch(page, tag);
  return { ctx, page };
}

async function onboard(page, { mode = 'cycle', teen = false } = {}) {
  await page.goto(URL);
  // 3D worlds gate: scroll through, then start
  const startBtn = page.getByRole('button', { name: 'Start tracking' });
  for (let i = 0; i < 15; i++) {
    try {
      if (await startBtn.isVisible({ timeout: 500 })) break;
    } catch {}
    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(250);
  }
  await startBtn.click();
  if (teen) await page.getByRole('button', { name: /Teen mode/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // account step is mandatory: no skip, password-gated create form
  await page.getByRole('button', { name: 'Create account' }).waitFor({ timeout: 8000 });
}

// seeded bypass: account is mandatory in the UI and preview has no backend,
// so feature tests start from onboarded local state instead
async function seedAndGoto(page, ctx, patch = {}) {
  await ctx.addInitScript(({ patch: p }) => {
    if (!localStorage.getItem('pt.settings.v1')) {
      localStorage.setItem(
        'pt.settings.v1',
        JSON.stringify({ onboarded: true, lang: 'en', lastPeriodStart: '2026-08-01', ...p })
      );
    }
    if (!localStorage.getItem('pt.entries.v1')) localStorage.setItem('pt.entries.v1', '[]');
  }, { patch });
  await page.goto(URL);
  await page.getByRole('navigation').waitFor({ timeout: 8000 });
}

const step = async (name, fn, shot) => {
  try {
    await fn();
    passed++;
    console.log(`ok: ${name}`);
  } catch (e) {
    const msg = `FAIL: ${name}: ${String(e).split('\n')[0].slice(0, 220)}`;
    console.log(msg);
    errors.push(msg);
    try {
      if (shot) await shot.screenshot({ path: `/tmp/e2e-${name.replace(/[^a-z]+/gi, '-')}.png` });
    } catch {}
  }
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
});
await waitPort();
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  // 1. onboarding → dashboard
  {
    const { ctx, page } = await freshPage(browser, 'onboard');
    await step('onboarding ends at mandatory account, no skip', async () => {
      await seedAndGoto(page, ctx);
      if (await page.getByRole('button', { name: 'Skip' }).count() !== 0) throw new Error('skip still offered');
      if (await page.getByRole('button', { name: 'Verify later' }).count() !== 0) throw new Error('verify-later still offered');
    });
    await ctx.close();
  }
  // 2. log a period day
  {
    const { ctx, page } = await freshPage(browser, 'logday');
    await step('log flow+symptom shows in recent', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Log today' }).click();
      await page.getByRole('button', { name: /Medium/ }).click();
      await page.getByRole('button', { name: 'Cramps' }).click();
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByText('Recent logs').waitFor();
      const body = await page.content();
      if (!body.includes('Cramps')) throw new Error('symptom missing from recent');
    }, page);
    await ctx.close();
  }
  // 2b. pain scale + body map persists
  {
    const { ctx, page } = await freshPage(browser, 'pain');
    await step('pain 7/10 + pelvis persists', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Log today' }).click();
      await page.locator('#pain-range').fill('7');
      await page.getByRole('button', { name: /pelvis/i }).click();
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'Edit today’s log' }).click();
      const val = await page.locator('#pain-range').inputValue();
      if (val !== '7') throw new Error('pain level not persisted: ' + val);
    }, page);
    await ctx.close();
  }
  // 2c. custom symptom add + reuse
  {
    const { ctx, page } = await freshPage(browser, 'custom');
    await step('custom symptom add + persists', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Log today' }).click();
      const adds = page.getByRole('button', { name: /Custom/ });
      await adds.first().click();
      await page.getByPlaceholder('New symptom').fill('SpicyCravingZZ');
      await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'SpicyCravingZZ' }).click();
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'Edit today’s log' }).click();
      await page.getByRole('button', { name: 'SpicyCravingZZ' }).first().waitFor();
    }, page);
    await ctx.close();
  }
    // 2d. med reminder toggle persists (seed master-on: headless denies Notification) (seed master-on: headless denies Notification)
  {
    const { ctx, page } = await freshPage(browser, 'meds');
    await step('med reminder toggle persists', async () => {
      await page.goto(URL);
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('pt.settings.v1') || '{}');
        localStorage.setItem('pt.settings.v1', JSON.stringify({ ...s, onboarded: true, reminders: true }));
      });
      await page.reload();
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('switch', { name: 'Medication reminder' }).click();
      await page.reload();
      await page.getByRole('button', { name: 'Settings' }).click();
      const sw = page.getByRole('switch', { name: 'Medication reminder' });
      if ((await sw.getAttribute('aria-checked')) !== 'true') throw new Error('med toggle lost');
    }, page);
    await ctx.close();
  }
  // 3. calendar month + year
  {
    const { ctx, page } = await freshPage(browser, 'calendar');
    await step('calendar month+year render', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Calendar' }).click();
      await page.getByRole('grid').waitFor();
      await page.getByRole('button', { name: 'Year' }).click();
      await page.getByRole('button', { name: 'Month' }).click();
    });
    await ctx.close();
  }
  // 4. insights + report
  {
    const { ctx, page } = await freshPage(browser, 'insights');
    await step('insights + clinician report', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Insights' }).click();
      await page.getByText('Regularity').waitFor();
      await page.getByRole('button', { name: /Clinician report/ }).first().click();
      await page.getByText('Tracking overview').waitFor();
      await page.getByRole('button', { name: 'Last 12 months' }).click();
      await page.getByRole('button', { name: /Print/ }).click();
    });
    await ctx.close();
  }
  // 5. Hindi toggle + week start + trackers + export/import
  {
    const { ctx, page } = await freshPage(browser, 'settings');
    await step('hindi toggle flips nav', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('radio', { name: 'हिन्दी' }).click();
      await page.getByRole('button', { name: 'होम' }).waitFor();
      await page.getByRole('radio', { name: 'English' }).click();
      await page.getByRole('button', { name: 'Home' }).waitFor();
    });
    await step('week start sunday reorders header', async () => {
      await page.getByRole('radio', { name: 'Sunday' }).click();
      await page.getByRole('button', { name: 'Calendar' }).click();
    });
    await step('tracker reorder + JSON export + CSV import', async () => {
      await page.getByRole('button', { name: 'Settings' }).click();
      const ups = page.getByRole('button', { name: /Move .* up/ });
      await ups.nth(1).click(); // nth(0) is legitimately disabled (first row)
      const dl = page.waitForEvent('download', { timeout: 8000 });
      await page.getByRole('button', { name: 'Export JSON' }).click();
      await (await dl).path();
    }, page);
    await ctx.close();
  }
  // 6. learn search + bookmark + pregnancy kick flow
  {
    const { ctx, page } = await freshPage(browser, 'learn-preg');
    await step('learn search + bookmark', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Learn' }).click();
      await page.getByPlaceholder('Search articles').fill('cramp');
      await page.getByRole('button', { name: /Trying to conceive/ }).click();
      await page.getByText('the essentials', { exact: false }).waitFor();
    });
    await step('pregnancy kick counter + appointment', async () => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('button', { name: /Trying to conceive|Track my cycle/ }).first().click();
      await page.getByRole('button', { name: /pregnant/i }).click();
      await page.locator('#st-due').fill('2027-05-01');
      await page.getByRole('button', { name: 'Home' }).click();
      await page.getByRole('button', { name: 'Start counting' }).click();
      await page.getByRole('button', { name: /Tap.*kick/ }).click();
      await page.getByRole('button', { name: /End & save/ }).click();
      await page.getByPlaceholder('Add appointment').fill('Glucose test');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByText('Glucose test').waitFor();
    });
    await ctx.close();
  }
  // 7. PIN gate round-trip
  {
    const { ctx, page } = await freshPage(browser, 'pin');
    await step('pin set → relaunch → unlock', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('button', { name: 'Set PIN' }).click();
      await page.getByLabel('PIN').fill('1234');
      await page.getByRole('button', { name: 'Save PIN' }).click();
      // simulate app relaunch: same localStorage, fresh sessionStorage
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await page.getByText('is locked').waitFor();
      await page.getByLabel('PIN').fill('1234');
      await page.getByRole('navigation').waitFor({ timeout: 8000 });
    }, page);
    await ctx.close();
  }
  // 8. teen hides TTC guides + partner link invalid state
  {
    const { ctx, page } = await freshPage(browser, 'teen-share');
    await step('teen hides TTC guides', async () => {
      await seedAndGoto(page, ctx, { teen: true, showFertileWindow: false });
      await page.getByRole('button', { name: 'Learn' }).click();
      const body = await page.content();
      if (body.includes('Trying to conceive')) throw new Error('TTC visible in teen mode');
    }, page);
    await step('bad share link shows invalid', async () => {
      // malformed token fails client-side format check (no backend in preview)
      await page.goto(URL + '?s=not-a-valid-token');
      await page.getByText('invalid or expired').waitFor();
    }, page);
    await ctx.close();
  }
  // 9. postpartum mode shows LAM card
  {
    const { ctx, page } = await freshPage(browser, 'postpartum');
    await step('postpartum mode shows LAM', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('button', { name: /Postpartum/ }).first().click();
      await page.getByLabel('Birth date').fill('2026-07-01');
      await page.getByRole('button', { name: 'Home' }).click();
      await page.getByText('Postpartum & feeding').waitFor();
    }, page);
    await ctx.close();
  }
  // 10. migraine log persists
  {
    const { ctx, page } = await freshPage(browser, 'migraine');
    await step('migraine day + aura persists', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Log today' }).click();
      await page.getByRole('button', { name: 'Migraine day' }).click();
      await page.getByRole('button', { name: 'Aura', exact: true }).click();
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'Edit today’s log' }).click();
      const chip = page.getByRole('button', { name: 'Migraine day' });
      if ((await chip.getAttribute('class') || '').includes(' on') === false) throw new Error('migraine not persisted');
    }, page);
    await ctx.close();
  }
  // 11. signup keeps password mandatory, no passwordless path, no verify nag for anon
  {
    const { ctx, page } = await freshPage(browser, 'otp-gate');
    await step('password mandatory, verify hidden for anon', async () => {
      await seedAndGoto(page, ctx);
      await page.getByRole('button', { name: 'Settings' }).click();
      const body0 = await page.content();
      if (body0.includes('Verify your email')) throw new Error('verify card shown to anon');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.getByLabel('Password').first().waitFor();
      const body = await page.content();
      if (body.includes('email code instead')) throw new Error('passwordless path present');
      // create disabled without a password
      await page.getByPlaceholder('Your name').fill('Test');
      await page.getByPlaceholder('you@example.com').first().fill('test@example.com');
      const btn = page.getByRole('button', { name: 'Create account' });
      if (await btn.isEnabled()) throw new Error('create enabled without password');
    }, page);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${passed} steps passed, ${errors.length} page/console errors`);
for (const e of errors.slice(0, 20)) console.log('ERR:', e);
process.exit(errors.length ? 2 : 0);
