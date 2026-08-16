# Period Tracker

**Free, private, local-first period & cycle tracking.** An installable PWA that tracks your
cycle, predicts your next period and fertile window, and keeps every byte of data on your
own device — no account, no cloud, no tracking.

🌐 **Live:** <https://periodtracker.run>

## Features

- **Four modes** — cycle tracking, trying to conceive, pregnancy, and perimenopause, switchable anytime, with age gate + local-storage consent
- **80+ loggable signals** — flow + clots, 32 symptoms with per-day severity and routine impact, 14 moods, discharge quality, BBT, weight, LH/OPK and pregnancy tests (incl. faint-line), intimacy + drive, sleep hours/quality, exercise/steps/water, alcohol/caffeine/smoking, contraception + supplements, notes — plus explicit **daily check-ins** that separate "no symptoms" from "forgot to log"
- **Personalizable tracker** — reorder and hide any logging section
- **Transparent forecasts** — median-based prediction with uncertainty windows derived from your own variation, a "why this estimate" explainer, late-period and stale-history states, and a policy layer: hormonal contraception suppresses fertility estimates, pregnancy pauses cycle forecasts
- **Contraception regimen** — method, start date, patch/ring change intervals, injection/implant/IUD renewal dates surfaced on the dashboard
- **Safety notices** — deterministic, source-attributed banners (ACOG/CDC guidance) for heavy bleeding, bleeding between periods or after long gaps, pregnancy pain/bleeding combinations, and unusual discharge — observations, never diagnoses; crisis-line resources in Settings
- **Pregnancy mode** — week + day tracking, trimester info, progress bar, due date from clinician or LMP
- **Insights** — 6/12-cycle windows (median/mean/range/trend), tracking completeness, symptoms by cycle phase (check-in aware), deterministic pattern cards, BBT/weight charts, positive-LH history
- **Learn hub** — 8 original sourced articles with search + bookmarks, TTC essentials, perimenopause relief guides by symptom domain, pregnancy checklists & FAQs
- **Clinician report** — printable summary with opt-in sensitive sections
- **Reminders** — optional "period is coming" notifications
- **Your data, yours** — plain or **AES-GCM passphrase-encrypted** JSON export/import, optional app PIN, one-tap erase, and *nothing* ever leaves the device
- **PWA** — install to your home screen, works fully offline, light/dark/system theme, °C/°F and kg/lb units

Predictions use the calendar method (ovulation ≈ 14 days before the next period) with median-based
robust statistics; temperature and discharge signs add fertility-awareness clues. Everything is
estimation support — not medical advice, diagnosis, or contraception guidance.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 18 + TypeScript + Vite | fast, standard, trivially portable |
| App delivery | PWA (vite-plugin-pwa / Workbox) | installable, offline-capable, no store gatekeeping |
| Data | `localStorage` on-device | privacy-first, zero backend, zero cost |
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

Period Tracker collects nothing, sends nothing, and has no analytics. All logs and settings
live in your browser's local storage on your device. Clearing browser data or uninstalling
erases them — use **Settings → Export JSON** to keep a backup. This is the entire privacy
policy.

## License

[MIT](LICENSE)
