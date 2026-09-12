# Android home-screen widget (staging)

Drop-in widget for the Capacitor Android shell. Staged here because this
machine has no Android SDK to compile-verify it — the code follows the same
pattern as the in-repo `plugins/apk-installer` native plugin.

## What it shows

Cycle day (`Day 12`) + next predicted period date. Numbers/dates only, so no
translation table is needed natively.

## Install into the Android shell

1. `bun run native:add:android` (creates `android/`)
2. Copy:
   - `CycleWidget.java` + `WidgetSnapshotPlugin.java` → `android/app/src/main/java/run/periodtracker/app/`
   - `widget_cycle.xml` → `android/app/src/main/res/layout/`
   - `cycle_widget_info.xml` → `android/app/src/main/res/xml/`
3. `res/values/strings.xml`: add `<string name="widget_desc">Period Tracker cycle widget</string>`
4. `AndroidManifest.xml`, inside `<application>`:
   ```xml
   <receiver android:name=".CycleWidget" android:exported="false">
     <intent-filter>
       <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
     </intent-filter>
     <meta-data android:name="android.appwidget.provider"
       android:resource="@xml/cycle_widget_info" />
   </receiver>
   ```
5. `MainActivity.java`: `registerPlugin(WidgetSnapshotPlugin.class);` (Capacitor 6:
   `add(WidgetSnapshotPlugin.class)` in `onCreate` before `super` — see the
   Capacitor custom-plugin docs for your exact version)
6. Build in Android Studio; long-press home → Widgets → Period Tracker.

## Web side (already wired)

`src/lib/widgetSnapshot.ts` pushes `{cycleDay, nextStart}` through the
`WidgetSnapshot` plugin whenever stats change (called from the updater effect
in `App.tsx`). No-op on web and on shells without the plugin.
