<!-- Release signing (documented shape — secrets live OUTSIDE the repo).

Keystore: ~/keystores/periodtracker-release.jks
Generated: keytool -genkeypair -v -keystore ~/keystores/periodtracker-release.jks \
  -alias periodtracker -keyalg RSA -keysize 2048 -validity 10950
Store the passwords in ~/.gradle/gradle.properties as:
  PT_RELEASE_STORE=/home/mint/keystores/periodtracker-release.jks
  PT_RELEASE_STORE_PASSWORD=...
  PT_RELEASE_KEY_ALIAS=periodtracker
  PT_RELEASE_KEY_PASSWORD=...

android/app/build.gradle reads these via the PT_RELEASE_* properties; when
they are absent the release build falls back to the debug sign pass (so CI
stays green without secrets). -->

## Current signing identity (recorded Oct 2026)
- Keystore: /home/mint/keystores/periodtracker-release.jks (alias: periodtracker)
- Cert SHA-256: a143b4d129010636fc35b0a96cb12bd515281eb8559903fbb18e8f8c5cdc7fd8
- First signed artifact: periodtracker 3.0.1 (versionCode 1)
- NOTE: PKCS12 keystores use the store password for the key too —
  PT_RELEASE_KEY_PASSWORD must equal PT_RELEASE_STORE_PASSWORD.
- Back this file up: losing it means the app identity can never be updated
  on existing installs (Android rejects differently-signed updates).
