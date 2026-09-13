# iPhone without the App Store (no $99 needed)

TestFlight and the App Store require a paid Apple Developer account. None of
the paths below do.

## Path 1 — PWA on Safari (recommended, zero cost)

1. Open `https://periodtracker.run` in Safari on the iPhone.
2. Tap **Share → Add to Home Screen**.
3. It opens fullscreen, standalone, with its own icon — offline via the
   service worker, safe-area insets, locale dates, share-target intake.

What works: everything except OS-level background push and native HealthKit
write-back. The replacement reminder path on iOS is **Settings → Email
summaries** (weekly/monthly digest, dates-only level available).

What Safari cannot do: Web Push to installed PWAs is Apple-limited and needs
a push backend we deliberately don't run; background sync; badge counts.
In-app banners + email digests cover the same jobs without a server that
watches users.

## Path 2 — Sideload the Capacitor IPA (Windows PC, free Apple ID)

For the full native shell (local notifications, widget bridge, HealthKit)
without the store:

1. On any pushed tag, the Android workflow proves the web bundle; for iOS,
   run `npx cap add ios && npx cap sync ios` on a Mac-less CI is not enough
   for signing — use **Sideloadly** (Windows/macOS) or **AltStore** with a
   free Apple ID: build the unsigned `.ipa` once (macOS runner), sideload
   per device.
2. Free Apple IDs sign for **7 days** — refresh weekly over USB/Wi-Fi.
   Paid account ($99/yr) removes this; until then this is the honest limit.

You already dual-boot Windows, so AltServer/Sideloadly can run there —
no Mac purchase needed for personal/family devices.

## What stays manual until enrollment

- TestFlight, App Store listing, Watch app distribution, Siri intents.
- The staged Swift plugin (`health-bridge/`) and widget payload compile-check
  on every push via `ios-compile.yml`.
