set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set dotenv-load

adb      := if os() == "windows" { env_var_or_default('LOCALAPPDATA', 'C:/Users/Default/AppData/Local') + '/Android/Sdk/platform-tools/adb.exe' } else { "adb" }
emulator := if os() == "windows" { env_var_or_default('LOCALAPPDATA', 'C:/Users/Default/AppData/Local') + '/Android/Sdk/emulator/emulator.exe' } else { "emulator" }
avd      := env_var_or_default('ANDROID_AVD', 'Medium_Phone_API_36.1')

# Build and install the Android debug APK, then launch the app.
# Starts the emulator automatically if no device/emulator is connected.
android:
    @$devices = (& "{{adb}}" devices | Select-String -Pattern '\tdevice$'); \
     if (-not $devices) { \
       Write-Host "No device found — starting emulator '{{avd}}'..."; \
       Start-Process -FilePath "{{emulator}}" -ArgumentList "-avd {{avd}} -no-snapshot-save" -WindowStyle Normal; \
       Write-Host "Waiting for emulator to boot (this takes ~60 s)..."; \
       & "{{adb}}" wait-for-device | Out-Null; \
       do { Start-Sleep 3; $booted = & "{{adb}}" shell getprop sys.boot_completed 2>$null } while ($booted.Trim() -ne '1'); \
       Write-Host "Emulator ready."; \
     }
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

# Build signed release AAB and upload to Play Store internal testing.
# Requires:
#   KEYSTORE_PASSWORD                  — keystore password (prompted if not set)
#   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   — path to service account key JSON file
#     (Play Console → Setup → API access → Service accounts → download JSON key)
# Optional:
#   KEY_PASSWORD   — if different from KEYSTORE_PASSWORD
#   PLAY_TRACK     — override track (default: internal)
android-play:
    @if (-not $env:KEYSTORE_PASSWORD) { $env:KEYSTORE_PASSWORD = Read-Host "Keystore password" }; \
     Push-Location android; .\gradlew bundleRelease; Pop-Location
    Push-Location scripts; node publish_android.js; Pop-Location

# Upload a previously built AAB to Play Store without rebuilding.
# Useful if you already ran android-release and just want to re-upload.
android-play-upload:
    Push-Location scripts; node publish_android.js; Pop-Location

# Count lines of code
wc:
    tokei
