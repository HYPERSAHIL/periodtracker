# Period Tracker

**Free, private, local-first period & cycle tracking.** An installable PWA that tracks your
cycle, predicts your next period and fertile window, and keeps every byte of data on your
own device — no account, no cloud, no tracking.

🌐 **Live:** <https://periodtracker.run>

## Features

- **Four modes** — cycle tracking, trying to conceive, pregnancy, and perimenopause, switchable anytime
- **80+ loggable signals** — flow + clots, 32 symptoms with per-day severity and routine impact, 14 moods, discharge quality, BBT, weight, LH/OPK and pregnancy tests (incl. faint-line), intimacy + drive, sleep hours/quality, exercise/steps/water, alcohol/caffeine/smoking, contraception + supplements, notes — plus explicit **daily check-ins** that separate "no symptoms" from "forgot to log"
- **Personalizable tracker** — reorder and hide any logging section
- **Transparent forecasts** — median-based prediction with uncertainty windows derived from your own variation, a "why this estimate" explainer, late-period and stale-history states, and a policy layer: hormonal contraception suppresses fertility estimates, pregnancy pauses cycle forecasts
- **Contraception regimen** — method, start date, patch/ring change intervals, injection/implant/IUD renewal dates surfaced on the dashboard
- **Safety notices** — deterministic, source-attributed banners (ACOG/CDC guidance) for heavy bleeding, bleeding between periods or after long gaps, pregnancy pain/bleeding combinations, and unusual discharge — observations, never diagnoses; crisis-line resources in Settings
- **Pregnancy mode** — week + day tracking, trimester info, progress bar, due date from clinician or LMP
- **Insights** — 6/12-cycle windows (median/mean/range/trend), tracking completeness, symptoms by cycle phase (check-in aware), deterministic pattern cards, BBT/weight charts, positive-LH history
- **Learn hub** — 8 original sourced articles with search + bookmarks, TTC essentials, perimenopause relief guides by symptom domain, pregnancy checklists & FAQs
- **Clinician report** — printable summary with opt-in sensitive sections
- **Cloud sync** — every log and setting is backed up automatically, no account needed: each device gets a backup code, and creating an account (name, age, email only) lets you sign in anywhere. Last-write-wins merging, offline queueing, conflict-safe
- **Reminders** — optional "period is coming" notifications
- **Your data, yours** — JSON export/import, optional app PIN, one-tap erase, and *nothing* ever leaves the device
- **PWA** — install to your home screen, works fully offline, light/dark/system theme, °C/°F and kg/lb units

Predictions use the calendar method (ovulation ≈ 14 days before the next period) with median-based
robust statistics; temperature and discharge signs add fertility-awareness clues. Everything is
estimation support — not medical advice, diagnosis, or contraception guidance.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 18 + TypeScript + Vite | fast, standard, trivially portable |
| App delivery | PWA (vite-plugin-pwa / Workbox) + Capacitor-ready | installable today; same `dist/` builds into native iOS/Android shells |
| Data | `localStorage` on-device + optional cloud sync (Cloudflare D1) | local-first with automatic backup and cross-device sync |
| Sync API | Cloudflare Pages Function (`_worker.js`) + D1 SQLite | same domain, no servers to manage, free tier |
| Hosting | Cloudflare Pages | free, global CDN, scales to any traffic on the free tier |

No servers, no databases — the static bundle scales infinitely and costs nothing.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build locally
```

Regenerate app icons (requires Python + Pillow): `python3 scripts/make_icons.py`

## Native apps (iOS + Android)

The app is Capacitor-ready: `capacitor.config.ts`, platform packages, and `native:*` scripts are
already wired, and the code avoids browser-only APIs without guards (notifications are
capability-checked, storage is isolated behind `src/lib/storage.ts` for a future SQLite migration).

First run — Android (any OS with Android Studio):

```sh
npm install && npm run native:add:android && npm run native:android
```

First run — iOS (requires a Mac with Xcode):

```sh
npm install && npm run native:add:ios && npm run native:ios
```

After any code change: `npm run native:sync`. Publishing needs developer accounts
(Google Play: $25 once; Apple: $99/yr).

## Deploy

Deploys are direct uploads from the repo root:

```sh
npm run deploy     # builds and runs: wrangler pages deploy dist --project-name periodtracker
```

Requires a one-time `wrangler login`. The production domain `periodtracker.run` is attached
to the Cloudflare Pages project (`periodtracker`).

### Optional: CI deploys from GitHub Actions

A ready-made workflow lives at [`docs/deploy-workflow.yml`](docs/deploy-workflow.yml). To
enable it: copy that file to `.github/workflows/deploy.yml`, add repository secrets
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (a token with **Cloudflare Pages — Edit**
permission), and set a repository variable `CF_DEPLOY=true`. Pushes to `main` will then
deploy automatically.

## Privacy

Local logs live in your browser on your device and are backed up automatically to the app's
cloud database, tied to your account or your device's backup code. For accounts we store your
name, age, email, and password; we also record standard request metadata (country derived from
IP, device type from the user agent) for security and abuse prevention. We never ask for or
track precise location, run no analytics or ads, and never sell data. Clearing browser data
removes the local copy — use **Settings → Export JSON** for a file backup you control.

## Admin panel

The owner's dashboard at **/admin** (key-gated, key stored as the `PT_ADMIN_KEY` Pages
secret; local copy at `~/.periodtracker-admin-key.txt`) has two tabs:

- **Users** — every user with profile, country, IP, device/OS, screen size, timezone,
  language, install type (browser / installed PWA / native APK), app version, backup code,
  decryptable password, logged-day count, last-seen, and full synced data + delete controls
- **Activity** — a request-level event log: every signup, sign-in (and failed attempt),
  restore, sync push/pull, sign-out, and admin access with IP, country, endpoint, and
  timestamp (auto-pruned after 90 days)

Every API request is logged server-side with IP + country + user-agent; the client also
reports device details (screen, timezone, platform, install type, app version) at account
creation. Passwords are stored encrypted-at-rest with a key held only by the server
(`PT_ENC_KEY`) so the admin can view them while a raw database export alone stays useless
to an attacker.

## License

[MIT](LICENSE)
