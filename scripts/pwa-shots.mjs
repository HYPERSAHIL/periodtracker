/**
 * Capture manifest screenshots for the richer install UI (Chrome Android 94+ /
 * desktop 105+). Runs the built app in a seeded state and saves:
 *   icons/screen-home.png · screen-calendar.png · screen-insights.png (narrow)
 *   icons/wide-home.png · wide-insights.png (wide)
 * Constraints honored: ≥320px, ≤3840px, long side ≤2.3× short side, identical
 * aspect ratio per form_factor, PNG only.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const PORT = 4178;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3500));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });

// minimal /api stub so the footer shows a healthy synced state instead of
// "sync failed" (preview serves no real backend)
const apiStub = async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const hex64 = 'a'.repeat(64);
  if (path === '/api/anon') {
    return json({ token: hex64, user: { id: 'f'.repeat(32), email: null, name: null, age: null, username: null, anonymous: true, emailVerified: false, syncKey: 'ABCDEFGHIJKLMNOP', createdAt: '2026-10-01T00:00:00Z' } }, 201);
  }
  if (path === '/api/data') {
    if (req.method() === 'GET') return json({ rev: 7, settings: null, entries: null, updatedAt: '2026-10-20T00:00:00Z' });
    return json({ rev: 8 });
  }
  if (path === '/api/event') return route.fulfill({ status: 204 });
  return json({ error: 'not_found' }, 404);
};

// one realistic cycle of entries so charts and the calendar have real shape
const days = [];
const mk = (d, extra = {}) => ({ date: d, updatedAt: Date.now(), checkedIn: true, ...extra });
['medium', 'heavy', 'medium', 'light'].forEach((flow, i) =>
  days.push(mk(`2026-09-2${2 + i}`, { flow, symptoms: i % 2 ? ['Cramps'] : ['Cramps', 'Headache'], moods: ['Calm'] }))
);
days.push(mk('2026-09-30', { mucus: 'sticky', moods: ['Energetic'], bbt: 36.5 }));
days.push(mk('2026-10-04', { mucus: 'eggwhite', moods: ['Calm'], bbt: 36.4 }));
days.push(mk('2026-10-08', { bbt: 36.8, moods: ['Calm'] }));
days.push(mk('2026-10-14', { mucus: 'dry', symptoms: ['Cramps'], moods: ['Sensitive'], bbt: 36.6, weight: 58.4 }));
days.push(mk('2026-10-18', { sleepHours: 7.5, sleepQuality: 'good', water: 6, moods: ['Calm'] }));

const seed = ({ narrow }) => async (page) => {
  const ctx = page.context();
  await ctx.addInitScript((entries) => {
    localStorage.setItem(
      'pt.settings.v1',
      JSON.stringify({ onboarded: true, lang: 'en', lastPeriodStart: '2026-09-22' })
    );
    localStorage.setItem('pt.entries.v1', JSON.stringify(entries));
    // keep the install card out of the video/manifest shots
    localStorage.setItem('pt.install.hideUntil', String(Date.now() + 8640000000));
  }, days);
  await page.goto(BASE);
  await page.getByRole('navigation').waitFor({ timeout: 8000 });
  await page.waitForTimeout(1500);
};

// narrow: 540x1170 @2x → 1080x2340 (ratio 2.17 ≤ 2.3)
const nctx = await browser.newContext({ viewport: { width: 540, height: 1170 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const npage = await nctx.newPage();
await npage.route('**/api/**', apiStub);
await seed({ narrow: true })(npage);
await npage.screenshot({ path: 'public/icons/screen-home.png' });
await npage.getByRole('button', { name: 'Calendar' }).click();
await npage.waitForTimeout(900);
await npage.screenshot({ path: 'public/icons/screen-calendar.png' });
await npage.getByRole('button', { name: 'Insights' }).click();
await npage.waitForTimeout(900);
await npage.screenshot({ path: 'public/icons/screen-insights.png' });
await npage.getByRole('button', { name: 'Learn' }).click();
await npage.waitForTimeout(900);
await npage.screenshot({ path: 'public/icons/screen-learn.png' });
await npage.getByRole('button', { name: 'Home' }).click();
await npage.waitForTimeout(700);
await npage.getByText(/Log today/).click();
await npage.waitForTimeout(1200);
await npage.screenshot({ path: 'public/icons/screen-daysheet.png' });
await nctx.close();

// wide: 1280x800 @2x → 2560x1600 (ratio 1.6)
const wctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const wpage = await wctx.newPage();
await wpage.route('**/api/**', apiStub);
await seed({ narrow: false })(wpage);
await wpage.screenshot({ path: 'public/icons/wide-home.png' });
await wpage.getByRole('button', { name: 'Insights' }).click();
await wpage.waitForTimeout(900);
await wpage.screenshot({ path: 'public/icons/wide-insights.png' });
await wctx.close();

await browser.close();
server.kill();
console.log('screenshots saved');
