# Android APK build from Termux

This project keeps the existing chess app code intact and adds an **opt-in Capacitor Android wrapper**. Its normal web build remains unchanged; only `npm run build:mobile` enables the static app shell needed by the Android WebView.

## Requirements

- Termux (prefer the current F-Droid or GitHub release), with Node.js/npm and a compatible JDK.
- The Android SDK command-line tools, Android platform/build-tools, and Gradle access. Capacitor's Android project uses the standard Android SDK toolchain. Plain Termux does not always run those Linux SDK tools directly; if your device setup cannot, use a Debian/Ubuntu Linux userspace through `proot-distro` and install/configure the SDK there.
- Set `ANDROID_HOME` or `ANDROID_SDK_ROOT` to the SDK directory in the same shell where you build. Make sure the SDK platform and build-tools required by Gradle are installed and licenses accepted.

## Build

From the project directory in Termux:

```sh
npm install --legacy-peer-deps
npm run android:apk
```

The project archive already contains the generated native `android/` scaffold. `android:apk` runs the Android-only static web build, copies it into Capacitor, and runs `gradlew assembleDebug`. If the scaffold is ever removed, run `npm run android:init` once to recreate it. The debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

To rebuild after changing app code, run `npm run android:apk` again. Do not edit the generated `android/` project unless you specifically need native Android changes; the app's original source remains under `src/`.

## Notes

- The chess UI, analysis logic, and Stockfish assets are not rewritten by this wrapper.
- The mobile build is static/offline-friendly. Features that require a web server would need a backend separately; the current app has no app-level server-function calls in `src/`.
- The application ID is currently `com.chessgame.analyzer` in `capacitor.config.ts`. Choose your final unique ID before publishing an APK to an app store.
