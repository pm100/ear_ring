set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set dotenv-load

adb := if os() == "windows" { env_var_or_default('LOCALAPPDATA', 'C:/Users/Default/AppData/Local') + '/Android/Sdk/platform-tools/adb.exe' } else { "adb" }

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

# Build the iOS app (debug) for a connected device
ios:
    #!/bin/sh
    set -eu
    cd "{{justfile_directory()}}/ios"
    xcodebuild build \
      -project earring.xcodeproj \
      -scheme earring \
      -configuration Debug \
      -destination 'generic/platform=iOS' \
      -allowProvisioningUpdates

# Archive the iOS app and export a Release IPA.
# Output: /tmp/earring_export/earring.ipa
ios-archive:
    #!/bin/sh
    set -eu
    cd "{{justfile_directory()}}/ios"
    xcodebuild archive \
      -project earring.xcodeproj \
      -scheme earring \
      -configuration Release \
      -archivePath /tmp/earring.xcarchive \
      -allowProvisioningUpdates
    xcodebuild -exportArchive \
      -archivePath /tmp/earring.xcarchive \
      -exportOptionsPlist ExportOptions.plist \
      -exportPath /tmp/earring_export \
      -allowProvisioningUpdates
    echo "IPA ready: /tmp/earring_export/earring.ipa"

# Archive, export, and upload to TestFlight.
# Requires APP_STORE_KEY_ID and APP_STORE_ISSUER_ID env vars,
# and ~/.private_keys/AuthKey_<KeyID>.p8 (download from
# App Store Connect → Users & Access → Integrations → App Store Connect API).
# Example:
#   APP_STORE_KEY_ID=ABCDEF1234 APP_STORE_ISSUER_ID=xxxx-xxxx just ios-testflight
ios-testflight:
    #!/bin/sh
    set -eu
    cd "{{justfile_directory()}}/ios"
    xcodebuild archive \
      -project earring.xcodeproj \
      -scheme earring \
      -configuration Release \
      -archivePath /tmp/earring.xcarchive \
      -allowProvisioningUpdates
    xcodebuild -exportArchive \
      -archivePath /tmp/earring.xcarchive \
      -exportOptionsPlist ExportOptions.plist \
      -exportPath /tmp/earring_export \
      -allowProvisioningUpdates
    if [ -z "${APP_STORE_KEY_ID:-}" ]; then
      printf "App Store Connect Key ID: "; read -r APP_STORE_KEY_ID
    fi
    if [ -z "${APP_STORE_ISSUER_ID:-}" ]; then
      printf "App Store Connect Issuer ID: "; read -r APP_STORE_ISSUER_ID
    fi
    xcrun altool --upload-app \
      -f /tmp/earring_export/earring.ipa \
      -t ios \
      --apiKey "$APP_STORE_KEY_ID" \
      --apiIssuer "$APP_STORE_ISSUER_ID" \
      --output-format xml
    echo "Upload to TestFlight complete."
