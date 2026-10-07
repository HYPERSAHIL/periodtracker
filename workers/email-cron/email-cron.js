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

// feed receipt — best-effort, never blocks the cron run
async function postEvent(env, type, meta) {
  if (!env.APP_URL || !env.APP_KEY) return;
  try {
    await fetch(`${env.APP_URL.replace(/\/$/, '')}/api/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': env.APP_KEY },
      body: JSON.stringify({ type, meta }),
    });
  } catch { /* feed receipt is best-effort */ }
}

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
  const failed = [];
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
      const msg = String(e).slice(0, 120);
      console.log('email summary failed for a subscriber:', msg);
      failed.push({ email: r.email, error: msg });
    }
  }
  // digest-run receipt into the feed the same way as the probe (email first,
  // address only — no names, no health fields); failures post their own event
  await postEvent(env, 'deliverability_digest_run', { freq, sent, failed: failed.length });
  if (failed.length) {
    await postEvent(env, 'deliverability_digest_failed', {
      freq, sent, failed: failed.length, error: failed[0].error,
    });
  }
  return { sent, failed: failed.length };
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
    await postEvent(env, 'deliverability_probe_failed', { status, score, detail: 'probe_log insert failed: ' + String(e).slice(0, 120) });
  }
  // cron-run receipt into the owner's feed (no import: env.APP_KEY = PT_ADMIN_KEY)
  await postEvent(env, 'deliverability_probe_run', { kind: 'cron', status, score });
  if (!sendOk) {
    await postEvent(env, 'deliverability_probe_failed', { status, score, detail: (sendDetail || '').slice(0, 200) });
  }
  return { status, score };
}

// --- fleet health rollup -------------------------------------------------
// One row per hour (trigger: 7 * * * *) so "is it getting slower / are more
// devices exposed" is a
// single SELECT. Reads the raw event rows for the closed hour and stores
// percentiles — no raw scan at query time.
function pctl(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[i] * 100) / 100;
}

function nums(rows, key) {
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.meta || '{}')[key];
      } catch {
        return null;
      }
    })
    .filter((n) => typeof n === 'number' && isFinite(n))
    .sort((a, b) => a - b);
}

async function runRollup(env, hourIso) {
  const hour = hourIso || new Date(Date.now() - 3600000).toISOString().slice(0, 13);
  const from = `${hour}:00.000Z`;
  const to = `${hour}:59.999Z`;

  const [sessions, vitals, sync, errors, esc] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='screen_session' AND created_at >= ? AND created_at <= ?").bind(from, to).first(),
    env.DB.prepare("SELECT meta FROM events WHERE type='screen_vitals' AND created_at >= ? AND created_at <= ?").bind(from, to).all(),
    env.DB.prepare("SELECT meta FROM events WHERE type='data_sync_status' AND created_at >= ? AND created_at <= ?").bind(from, to).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='screen_error' AND created_at >= ? AND created_at <= ?").bind(from, to).first(),
    env.DB.prepare("SELECT meta FROM events WHERE type='sec_browser_ver' AND created_at >= ? AND created_at <= ?").bind(from, to).all(),
  ]);

  const vrows = vitals.results || [];
  const lcps = nums(vrows, 'lcpMs').sort((a, b) => a - b);
  const inps = nums(vrows, 'inpMs').sort((a, b) => a - b);
  const clss = nums(vrows, 'cls').sort((a, b) => a - b);

  let syncOk = 0;
  let syncFail = 0;
  for (const r of sync.results || []) {
    let st = '';
    try {
      st = JSON.parse(r.meta || '{}').status || '';
    } catch {
      /* unparsable */
    }
    if (st === 'synced') syncOk++;
    else if (st === 'error') syncFail++;
  }

  // visitors exposed to at least one unpatched escape + bucket histogram
  let android = 0;
  const byBucket = {};
  const ids = new Set();
  for (const r of esc.results || []) {
    let m = {};
    try {
      m = JSON.parse(r.meta || '{}');
    } catch {
      continue;
    }
    if (m.platform === 'android') android++;
    if (!m.esc) continue;
    ids.add(String(r.id));
    for (const b of String(m.esc).split('|')) byBucket[b] = (byBucket[b] || 0) + 1;
  }

  const pct = (n) => (syncOk + syncFail ? Math.round((n / (syncOk + syncFail)) * 1000) / 10 : null);
  const detail = JSON.stringify({
    lcp: { p50: pctl(lcps, 50), p75: pctl(lcps, 75), p95: pctl(lcps, 95), max: lcps.length ? lcps[lcps.length - 1] : null, n: lcps.length },
    inp: { p50: pctl(inps, 50), p75: pctl(inps, 75), p95: pctl(inps, 95), max: inps.length ? inps[inps.length - 1] : null, n: inps.length },
    cls: { p50: pctl(clss, 50), p75: pctl(clss, 75), p95: pctl(clss, 95), max: clss.length ? clss[clss.length - 1] : null, n: clss.length },
  });

  await env.DB.prepare(
    `INSERT INTO fleet_health (bucket, sessions, vitals, p75_lcp_ms, p75_inp_ms, p75_cls,
       sync_ok, sync_fail, sync_fail_pct, errors, esc_visitors, esc_by_bucket, android_visitors, detail, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(bucket) DO UPDATE SET
       sessions=excluded.sessions, vitals=excluded.vitals, p75_lcp_ms=excluded.p75_lcp_ms,
       p75_inp_ms=excluded.p75_inp_ms, p75_cls=excluded.p75_cls, sync_ok=excluded.sync_ok,
       sync_fail=excluded.sync_fail, sync_fail_pct=excluded.sync_fail_pct, errors=excluded.errors,
       esc_visitors=excluded.esc_visitors, esc_by_bucket=excluded.esc_by_bucket,
       android_visitors=excluded.android_visitors, detail=excluded.detail`
  )
    .bind(
      hour, sessions?.n || 0, vrows.length,
      pctl(lcps, 75), pctl(inps, 75), pctl(clss, 75),
      syncOk, syncFail, pct(syncFail), errors?.n || 0,
      ids.size, JSON.stringify(byBucket), android, detail, new Date().toISOString()
    )
    .run();

  return { hour, sessions: sessions?.n || 0, vitals: vrows.length, esc: ids.size, syncFail };
}

export default {
  async scheduled(event, env, ctx) {
    // crons: weekly probe (Mon 06:30), digests (Mon 07:00, monthly 1st)
    // NOTE: probe needs a PROBE_TARGET secret (a seed inbox address) — without
    // it the probe is skipped, never sent to users by mistake.
    if (event.cron === '7 * * * *') {
      // hourly fleet rollup (previous hour); re-running a bucket upserts it
      ctx.waitUntil(runRollup(env).catch(e => postEvent(env, 'fleet_rollup_failed', { error: String(e).slice(0, 120) })));
      return;
    }
    if (event.cron === '30 6 * * 1') {
      ctx.waitUntil(runProbe(env).catch(e => postEvent(env, 'deliverability_probe_failed', { error: String(e).slice(0, 120) })));
      return;
    }
    const freq = event.cron === '0 7 1 * *' ? 'monthly' : 'weekly';
    ctx.waitUntil(sendDue(env, freq).catch(e => postEvent(env, 'deliverability_digest_failed', { freq, error: String(e).slice(0, 120) })));
  },
  // manual trigger (authed via ?key=CRON_KEY, optional): GET /?key=...
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.CRON_KEY && url.searchParams.get('key') === env.CRON_KEY) {
      if (url.searchParams.get('run') === 'probe') return Response.json(await runProbe(env));
      if (url.searchParams.get('run') === 'rollup') return Response.json(await runRollup(env, url.searchParams.get('hour')));
      const freq = url.searchParams.get('freq') === 'monthly' ? 'monthly' : 'weekly';
      return Response.json(await sendDue(env, freq));
    }
    return new Response('periodtracker-email worker', { status: 200 });
  },
};
