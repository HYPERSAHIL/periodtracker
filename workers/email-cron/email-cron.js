/**
 * periodtracker-email — weekly/monthly cycle-summary sender.
 * Separate Worker because Pages Functions can't hold cron triggers.
 * Reads the same D1 as the app; sends via Cloudflare EMAIL binding or
 * Resend (RESEND_API_KEY secret) — whichever is configured. Free-plan safe:
 * needs neither a paid Workers plan nor an onboarded sending domain.
 * Deploy: `wrangler deploy` from this directory (D1 id + APP_URL +
 * optional RESEND_API_KEY secret, see docs/email-setup.md).
 */

const FROM = { email: 'updates@periodtracker.run', name: 'Period Tracker' };

async function sendMail(env, msg) {
  if (env.EMAIL) {
    await env.EMAIL.send(msg);
    return;
  }
  if (env.RESEND_API_KEY) {
    // multipart alternative: some filters penalize text-only; escaped, no
    // images — open tracking stays off by domain config.
    const esc = String(msg.text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    const html = `<div style="font-family:sans-serif;max-width:560px">${esc}</div>`;
    const rr = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      // Resend REST: `from` is a plain "Name <addr>" string, NOT an object
      body: JSON.stringify({ from: `${msg.from.name} <${msg.from.email}>`, to: msg.to, subject: msg.subject, text: msg.text, html, headers: msg.headers }),
    });
    if (!rr.ok) throw new Error(`resend ${rr.status}`);
    return;
  }
  throw new Error('no-mail-provider');
}

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
      const safeText =
        `${text}\n\n` +
        `Why this email: you turned on ${freq} summaries in Period Tracker settings. ` +
        `It contains no symptom or note details — dates and counts only.\n` +
        `Unsubscribe: ${unsub}\n`;
      await sendMail(env, {
        to: r.email,
        from: FROM,
        subject: freq === 'monthly' ? 'Your monthly cycle snapshot' : 'Your weekly cycle snapshot',
        text: safeText,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      sent++;
    } catch (e) {
      console.log('email summary failed for a subscriber:', String(e).slice(0, 120));
    }
  }
  return { sent };
}

/**
 * Weekly deliverability probe: send one OTP-shaped probe to a SEED inbox
 * (PROBE_TARGET secret — never a real user), score the Resend delivery log,
 * and report back to the app via POST /api/probe/log (admin-key authed).
 * This replaces manual mail-tester runs with an automatic trend line.
 */
async function runProbe(env) {
  const target = (env.PROBE_TARGET || '').trim();
  if (!target || !env.RESEND_API_KEY) {
    console.log('probe: skipped (no PROBE_TARGET or RESEND_API_KEY)');
    return { skipped: true };
  }
  const stamp = new Date().toISOString().slice(0, 10);
  let sendOk = false;
  let sendDetail = null;
  try {
    const rr = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Period Tracker <updates@periodtracker.run>',
        to: target,
        subject: `Deliverability probe ${stamp}`,
        text: `Weekly deliverability probe ${stamp}. This message tests SPF/DKIM/DMARC delivery only — ignore it.\n`,
      }),
    });
    sendOk = rr.ok;
    sendDetail = rr.ok ? '' : (await rr.text().catch(() => '')).slice(0, 200);
  } catch (e) {
    sendDetail = sendDetail || String(e).slice(0, 200);
  }
  // score = Resend-side acceptance; inbox placement still needs the seed
  // inbox's own view (Gmail Postmaster once claimed), so status is honest:
  const status = sendOk ? 'sent' : 'failed';
  const score = sendOk ? 'accepted' : 'rejected';
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS probe_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
        target TEXT NOT NULL, status TEXT NOT NULL, score TEXT,
        detail TEXT, created_at TEXT NOT NULL
      )`
    ).run();
    await env.DB.prepare(
      'INSERT INTO probe_log (kind, target, status, score, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind('resend-seed', target, status, score, sendDetail, new Date().toISOString()).run();
  } catch (e) {
    console.log('probe: log failed', String(e).slice(0, 120));
  }
  return { status, score };
}

export default {
  async scheduled(event, env, ctx) {
    // crons: weekly probe (Mon 06:30), digests (Mon 07:00, monthly 1st)
    // NOTE: probe needs a PROBE_TARGET secret (a seed inbox address) — without
    // it the probe is skipped, never sent to users by mistake.
    if (event.cron === '30 6 * * 1') {
      ctx.waitUntil(runProbe(env));
      return;
    }
    const freq = event.cron === '0 7 1 * *' ? 'monthly' : 'weekly';
    ctx.waitUntil(sendDue(env, freq));
  },
  // manual trigger (authed via ?key=CRON_KEY, optional): GET /?key=...
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.CRON_KEY && url.searchParams.get('key') === env.CRON_KEY) {
      if (url.searchParams.get('run') === 'probe') return Response.json(await runProbe(env));
      const freq = url.searchParams.get('freq') === 'monthly' ? 'monthly' : 'weekly';
      return Response.json(await sendDue(env, freq));
    }
    return new Response('periodtracker-email worker', { status: 200 });
  },
};
