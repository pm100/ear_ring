set shell := ["powershell", "-Command"]

adb := env('LOCALAPPDATA') + '/Android/Sdk/platform-tools/adb.exe'

# Build and install the Android debug APK, then launch the app
android:
    Push-Location android; .\gradlew installDebug; Pop-Location
    & "{{adb}}" shell am start -n com.earring/.MainActivity

# Compile-check Kotlin only (fast, no install)
android-check:
    Push-Location android; .\gradlew :app:compileDebugKotlin; Pop-Location

# Build a signed release AAB for Google Play upload.
# Prompts for KEYSTORE_PASSWORD if not already set in the environment.
# Output: android/app/build/outputs/bundle/release/app-release.aab
android-release:
    @if (-not $env:KEYSTORE_PASSWORD) { $env:KEYSTORE_PASSWORD = Read-Host "Keystore password" }; \
     Push-Location android; .\gradlew bundleRelease; Pop-Location

# Take a screenshot from the emulator
screenshot:
    & "{{adb}}" shell screencap -p /sdcard/screen.png
    & "{{adb}}" pull /sdcard/screen.png screen.png

# Build the Tauri desktop frontend
desktop:
    Push-Location desktop; npm run build; Pop-Location

# Run cargo tests (shared Rust core)
test:
    cargo test
