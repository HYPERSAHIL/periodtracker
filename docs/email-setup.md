# Cycle-summary emails — setup (subdomain sending via Cloudflare)

Yes — emails send from a subdomain (`updates@mail.periodtracker.run`) with no
mail server of our own. Cloudflare Email Sending handles SPF/DKIM/DMARC.

## 1. Enable sending on the subdomain (once)

```bash
wrangler email sending enable mail.periodtracker.run
```

This provisions DNS automatically if Cloudflare manages the zone. Verify:

```bash
npx wrangler email sending list
```

## 2. Point wrangler at the real D1

In `wrangler.toml` AND `workers/email-cron/wrangler.toml`, replace
`REPLACE_WITH_D1_ID` with the output of `wrangler d1 list`.
Apply the schema (includes `email_subs` + `shares`):

```bash
wrangler d1 execute periodtracker --file=schema.sql
```

## 3. Deploy the site + the cron worker

```bash
bun run build && wrangler pages deploy dist --project-name periodtracker
cd workers/email-cron && wrangler deploy
```

Cron runs weekly Monday 07:00 UTC + monthly 1st. Manual test (optional
`CRON_KEY` secret first: `wrangler secret put CRON_KEY` in that dir):

```bash
curl 'https://periodtracker-email.<you>.workers.dev/?key=...&freq=weekly'
```

Without the `EMAIL` binding (not yet enabled) the worker logs and skips —
nothing crashes.

## 3b. Attach the EMAIL binding to the Pages project (for OTP + summaries)

The app worker (`api/_worker.js`) also needs the `send_email` binding —
it sends signup verification codes and (via the cron worker) digests.
In the Cloudflare dashboard → Pages → periodtracker → Settings → Bindings:

- Add **Email Sending** binding named `EMAIL` (same sending domain).
- Confirm the **D1** binding named `DB` points at the same database.

Then re-apply the schema (adds `email_verified` + `magic_codes`):

```bash
wrangler d1 execute periodtracker --file=schema.sql
```

Why Email Service and not marketing mail: Cloudflare Email Sending is
transactional-only (auth codes, digests, receipts). Bulk marketing/newsletters
are forbidden by its terms — that restriction is exactly why OTP and magic
links belong here and promo blasts do not.

## 4. Privacy design (do not weaken)

- Explicit opt-in per user; one row per user; one-click unsubscribe link in
  every mail (`List-Unsubscribe` + `List-Unsubscribe-Post` headers).
- Minimal level sends dates only. Full adds symptom counts, never notes.
- Transactional digests only — Email Sending forbids marketing bulk.
- Unsubscribing deletes the row; no backup of addresses anywhere else.
