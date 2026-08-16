# Period Tracker

**Free, private, local-first period & cycle tracking.** An installable PWA that tracks your
cycle, predicts your next period and fertile window, and keeps every byte of data on your
own device — no account, no cloud, no tracking.

🌐 **Live:** <https://periodtracker.run>

## Features

- **Four modes** — cycle tracking, trying to conceive, pregnancy, and perimenopause, switchable anytime
- **Cycle logging** — flow intensity (spotting → heavy), 18 symptoms, 10 moods, and freeform notes for any day
- **Fertility signs** — cervical mucus/discharge quality, basal body temperature, weight, LH ovulation tests, and pregnancy tests
- **Predictions** — next period, fertile window, and ovulation estimates based on your own logged cycles (rolling average of your last 6)
- **Pregnancy mode** — week + day tracking, trimester info, progress bar, and due date from a clinician or computed from your last period
- **Calendar** — month view with logged periods, predicted days, fertile window, ovulation and positive-LH markers
- **Insights** — cycle length chart, regularity read, BBT and weight line charts, positive-LH history, and your most-logged symptoms & moods
- **Life events** — intercourse and contraception logging
- **Reminders** — optional "period is coming" notifications
- **Your data, yours** — JSON export/import, one-tap erase, and *nothing* ever leaves the device
- **PWA** — install to your home screen, works fully offline, light/dark/system theme, °C/°F and kg/lb units

Predictions use the calendar method (ovulation ≈ 14 days before the next period), with temperature
and discharge signs as supporting fertility clues. They are estimates, not medical advice or
contraception guidance.

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
