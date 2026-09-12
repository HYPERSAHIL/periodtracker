# Apple Watch path (honest version)

No Mac/Xcode here, and watchOS has no escape hatch: shipping a Watch app
requires Xcode on a Mac + an Apple Developer account ($99/yr). What already
works without any of that, and what is staged:

## Works today, no build needed

- **Rich notifications appear on the Watch** automatically when paired:
  period/fertile/check-in/med/renewal reminders all flow through the iPhone.
  Discreet mode keeps lock screens (and wrists) content-free.

## Staged for the native build (needs Mac)

- `health-bridge/HealthBridgePlugin.swift` writes cycle data to HealthKit —
  the same store Apple Health Cycle Tracking and any Watch complication read.
- `src/lib/widgetSnapshot.ts` pushes `{cycleDay, nextStart}` — a Watch
  complication reuses this exact payload via WidgetKit/App Intents.
- Siri logging ("log my period started") needs an App Intent target — same
  Xcode project as the complication.

## If/when building

1. `cap add ios` on a Mac, open in Xcode, add a Watch App + WidgetKit target.
2. Add HealthKit capability + `NSHealthShareUsageDescription`.
3. Complication reads the shared snapshot (App Groups) or HealthKit directly.
4. TestFlight via the paid developer account; review needs the privacy
   nutrition labels filled from the app's actual behavior (no trackers).
