/**
 * periodtracker-email — weekly/monthly cycle-summary sender.
 * Separate Worker because Pages Functions can't hold cron triggers.
 * Reads the same D1 as the app; sends via the EMAIL (send_email) binding.
 * Deploy: `wrangler deploy` from this directory (after `wrangler email
 * sending enable mail.periodtracker.run` + D1 id + APP_URL, see docs/email-setup.md).
 */

const FROM = { email: 'updates@mail.periodtracker.run', name: 'Period Tracker' };

function diffDays(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const ms = Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2]);
  return Math.round(ms / 86400000);
}

function addDays(iso, n) {
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Minimal deterministic forecast from flow days (approximate; app shows live numbers). */
function forecast(entries) {
  const dates = Object.values(entries || {})
    .filter((e) => e && e.flow)
    .map((e) => e.date)
    .sort();
  if (!dates.length) return null;
  const starts = [];
  let run = [dates[0]];
  for (let i = 1; i < dates.length; i++) {
    if (diffDays(run[run.length - 1], dates[i]) <= 1) run.push(dates[i]);
    else {
      starts.push(run[0]);
      run = [dates[i]];
    }
  }
  starts.push(run[0]);
  const lens = [];
  for (let i = 1; i < starts.length; i++) {
    const len = diffDays(starts[i - 1], starts[i]);
    if (len >= 15 && len <= 90) lens.push(len);
  }
  const avg = lens.length ? Math.round(median(lens)) : 28;
  const last = starts[starts.length - 1];
  return { lastStart: last, nextStart: addDays(last, avg), avgCycle: avg, logged: starts.length };
}

function compose(sub, fc) {
  const lines = [`Hi — your ${sub.freq} cycle snapshot from Period Tracker.`];
  if (fc && fc.logged >= 1) {
    lines.push(`Next period around ${fc.nextStart} (based on a ~${fc.avgCycle}-day average).`);
  } else {
    lines.push('Log two periods and estimates appear here.');
  }
  if (sub.level === 'full' && fc && fc.logged >= 2) {
    lines.push('Open the app for symptoms, insights, and your clinician report.');
  }
  lines.push('', '—', 'Estimates only, not medical advice. Unsubscribe anytime:');
  return lines.join('\n');
}

async function sendDue(env, freq) {
  if (!env.EMAIL) {
    console.log('email summary: no EMAIL binding, skipping');
    return { sent: 0, skipped: 'no-binding' };
  }
  const appUrl = (env.APP_URL || 'https://periodtracker.run').replace(/\/$/, '');
  const rows = await env.DB.prepare(
    'SELECT s.email, s.level, s.unsub_token, d.entries FROM email_subs s LEFT JOIN data d ON d.user_id = s.user_id WHERE s.freq = ?'
  )
    .bind(freq)
    .all();
  let sent = 0;
  for (const r of rows.results || []) {
    try {
      let entries = null;
      try {
        entries = r.entries ? JSON.parse(r.entries) : null;
      } catch {
        entries = null;
      }
      const fc = forecast(entries);
      const text = compose({ freq, level: r.level }, fc);
      const unsub = `${appUrl}/api/email/unsub?token=${r.unsub_token}`;
      await env.EMAIL.send({
        to: r.email,
        from: FROM,
        subject: freq === 'monthly' ? 'Your monthly cycle snapshot' : 'Your weekly cycle snapshot',
        text: `${text}\n${unsub}\n`,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      sent++;
    } catch (e) {
      console.log('email summary failed for a subscriber:', String(e).slice(0, 120));
    }
  }
  return { sent };
}

export default {
  async scheduled(event, env, ctx) {
    // crons: "0 7 * * 1" (weekly Mon) and "0 7 1 * *" (monthly 1st)
    const freq = event.cron === '0 7 1 * *' ? 'monthly' : 'weekly';
    ctx.waitUntil(sendDue(env, freq));
  },
  // manual trigger (authed via ?key=CRON_KEY, optional): GET /?key=...
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.CRON_KEY && url.searchParams.get('key') === env.CRON_KEY) {
      const freq = url.searchParams.get('freq') === 'monthly' ? 'monthly' : 'weekly';
      return Response.json(await sendDue(env, freq));
    }
    return new Response('periodtracker-email worker', { status: 200 });
  },
};
