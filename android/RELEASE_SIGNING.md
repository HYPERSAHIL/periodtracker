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
