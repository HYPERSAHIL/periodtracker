# Health write-back bridge

Two-way sync without a server: the app already *imports* from Apple Health
XML and wearable CSVs; this stages the *export* direction to the OS health
stores.

- **Android: COMPILED AND SHIPPING.** The canonical source is now
  `android/app/src/main/java/run/periodtracker/app/HealthBridgePlugin.kt`
  (Kotlin — Health Connect's client library is suspend-based). Gradle deps +
  manifest permissions live in the android/ tree. Idempotent per day via
  `clientRecordId`. Needs device testing to verify grants & writes.
- `HealthBridgePlugin.swift` — iOS Capacitor plugin (HealthKit), still staged
  until a Mac/Xcode build.

## Files

- `HealthBridgePlugin.swift` — iOS Capacitor plugin (HealthKit: menstrual
  flow, BBT, body mass). Needs: HealthKit capability + `NSHealthShareUsageDescription`
  / `NSHealthUpdateUsageDescription` in Info.plist + authorization request.
- `HealthBridgePlugin.java` — Android Capacitor plugin stub (Health Connect:
  Menstruation/BodyTemperature/Weight records). Needs:
  `androidx.health.connect:connect-client` + `androidx.health.connect.client.permission`
  + runtime permission flow + `<queries>` entry for `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`.

## Web side (wired)

`src/lib/healthSync.ts` pushes the last 90 days of flow/BBT/weight through
the `HealthBridge` plugin whenever stats change. No-op on web and on shells
without the plugin. Day-granular JSON, idempotent by date.

## Install into the shells

1. iOS: add the Swift file to the Capacitor target, enable HealthKit,
   add the Info.plist keys, request authorization on first push.
2. Android: add the Java file, add the Health Connect dependency, declare
   `android.permission.health.WRITE_MENSTRUATION` (+ temperature/weight),
   register the plugin in MainActivity, run the permission contract.
3. Build both shells; the web app detects the plugin automatically.
