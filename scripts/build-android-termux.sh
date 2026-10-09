#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Install them in Termux (or its Debian proot environment) first." >&2
  exit 1
fi

if ! command -v java >/dev/null 2>&1; then
  echo "Java/JDK is required by the Android Gradle build. Install a compatible JDK first." >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  echo "Android SDK not detected. Set ANDROID_HOME or ANDROID_SDK_ROOT to your installed Android SDK." >&2
  echo "A Linux userspace (for example Debian via proot-distro) may be needed for Android SDK tools in Termux." >&2
  exit 1
fi

"$ROOT_DIR/node_modules/.bin/vite" --version >/dev/null 2>&1 || {
  echo "Project dependencies are missing. Run npm install first." >&2
  exit 1
}

npm run build:mobile

if [[ ! -d android ]]; then
  echo "Adding Capacitor Android platform..."
  npx cap add android
fi

npx cap sync android
cd android
./gradlew assembleDebug

APK_PATH="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK_PATH" ]]; then
  echo "APK ready: $APK_PATH"
else
  echo "Gradle completed, but the expected APK was not found at $APK_PATH" >&2
  exit 1
fi
