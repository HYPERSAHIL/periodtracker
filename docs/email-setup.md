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

Cron runs weekly Monday 07:00 UTC + monthly 1st. Manual test:

```bash
curl 'https://periodtracker-email.<you>.workers.dev/?key=...&freq=weekly'
# (first: `wrangler secret put CRON_KEY` in workers/email-cron)
```

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
