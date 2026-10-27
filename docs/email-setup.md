# Cycle emails that work on the free plan (Resend first, Cloudflare optional)

Bad news first, verified today in the docs: **Cloudflare Email Sending to
arbitrary recipients needs the Workers Paid plan ($5/mo minimum)** — the free
plan can only send to your own verified destination addresses. Your OAuth
token also lacks the scope to onboard a sending domain (`Unauthorized 2036`),
so that path is closed for now on two fronts.

The fix: **Resend free tier** — 3,000 emails/month, 100/day, no Cloudflare
paid plan, no domain onboarding on Cloudflare's side. Both the app worker
(signup OTP) and the cron worker (digests) now try the `EMAIL` binding first
and fall back to Resend via a `RESEND_API_KEY` secret.

## 1. Get a free Resend key (5 minutes, you do this once)

1. Sign up at https://resend.com (free tier, no card).
2. Add + verify `mail.periodtracker.run` (or the apex) in Resend → Domains,
   and add the SPF/DKIM records it shows to the `periodtracker.run` DNS zone.
3. Create an API key (Sending access) and keep it somewhere safe.

## 2. Store the key as a secret (I do this on your machine)

```bash
cd /media/mint/WDC_WD10EZRX_932G/Sahil/periodtracker
printf '%s' 're_xxx' | bunx -y wrangler@latest pages secret put RESEND_API_KEY --project-name periodtracker
cd workers/email-cron
printf '%s' 're_xxx' | bunx -y wrangler@latest secret put RESEND_API_KEY
```

Also paste the real D1 id into both `wrangler.toml` files (app root one is
already `b9344d01-…`; the cron one still says `REPLACE_WITH_D1_ID`), then:

```bash
wrangler d1 execute periodtracker --file=schema.sql
```

## 3. Deploy (I do this)

```bash
bun run build && bunx -y wrangler@latest pages deploy dist --project-name periodtracker
cd workers/email-cron && bunx -y wrangler@latest deploy
```

Crons: weekly probe Mon 06:30 UTC → digests Mon 07:00 + monthly 1st.
The probe sends one OTP-shaped mail to the `PROBE_TARGET` seed inbox
(a Resend test address or a spare inbox you own — never a user) and logs
`sent/failed` into `probe_log`, visible in Admin → **Delivery** tab.
Set it with `wrangler secret put PROBE_TARGET` in `workers/email-cron`.
Manual: `?key=...&run=probe` runs the probe on demand.

## 4. Optional paid upgrade later

Onboard `mail.periodtracker.run` to Cloudflare Email Sending (dashboard →
Compute → Email Service → Onboard Domain, or `wrangler email sending
enable`), add the `[[send_email]]` binding, redeploy. Code prefers the
binding automatically; nothing else changes.

## 5. Privacy design (do not weaken)

- Explicit opt-in per user; one row per user; one-click unsubscribe link in
  every mail (`List-Unsubscribe` + `List-Unsubscribe-Post` headers).
- Minimal level sends dates only. Full adds symptom counts, never notes.
- Transactional only (auth codes, digests) — Resend's free tier is fine with
  this volume; marketing bulk is forbidden by policy and by our design.
- Unsubscribing deletes the row; no backup of addresses anywhere else.

## 4. Privacy design (do not weaken)

- Explicit opt-in per user; one row per user; one-click unsubscribe link in
  every mail (`List-Unsubscribe` + `List-Unsubscribe-Post` headers).
- Minimal level sends dates only. Full adds symptom counts, never notes.
- Transactional digests only — Email Sending forbids marketing bulk.
- Unsubscribing deletes the row; no backup of addresses anywhere else.

## Templates (one brand shell, three mails)

All outbound mail shares one branded document — table layout, inline styles,
no tracking pixel, light scheme locked. Defined inline in `api/_worker.js`
(advanced-mode Pages functions must stay a single file):

- `otpEmail(code)` — 44px tracked code card, 15-minute expiry, "if this wasn't
  you" note. Used by `/api/magic/request` and `/api/admin/otp/resend`.
- `weeklyReportEmail(stats)` — KPI cards (accounts, installs, sync pushes) +
  top-event table, numbers computed live from D1.
- `deliverabilityEmail(stats)` — send-success hero stat, delivery KPIs,
  verification rate, computed from `magic_*` events.

`sendMail(env, mail)` is the only sender: it tries the Cloudflare `EMAIL`
binding first (see `[[send_email]]` in `wrangler.toml`) and falls back to the
Resend REST API. Note: on the free plan Pages ignores the binding for
arbitrary recipients (Workers Paid required), so production currently reports
`via: resend` — the preference order is already correct if the plan changes.

## Ops mail test (dormant by default)

`POST /api/dev/mailtest` with header `x-dev-mail-token: <secret>` and body
`{ "kind": "otp" | "weekly" | "deliverability", "to": "<address>" }` sends one
template with live report numbers and logs `mailtest_sent`. The route returns
404 unless the `DEV_MAIL_TOKEN` secret exists:

```bash
openssl rand -hex 32 | bunx -y wrangler@latest pages secret put DEV_MAIL_TOKEN --project-name periodtracker
npm run deploy
# turn it back off:
bunx -y wrangler@latest pages secret delete DEV_MAIL_TOKEN --project-name periodtracker && npm run deploy
```
