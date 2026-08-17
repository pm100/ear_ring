set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set dotenv-load

adb      := if os() == "windows" { env_var_or_default('LOCALAPPDATA', 'C:/Users/Default/AppData/Local') + '/Android/Sdk/platform-tools/adb.exe' } else { "adb" }
emulator := if os() == "windows" { env_var_or_default('LOCALAPPDATA', 'C:/Users/Default/AppData/Local') + '/Android/Sdk/emulator/emulator.exe' } else { "emulator" }
avd      := env_var_or_default('ANDROID_AVD', 'Medium_Phone_API_36.1')

# Build and install the Android debug APK, then launch the app.
# Starts the emulator automatically if no device/emulator is connected.
[doc("Build + install debug APK and launch (auto-starts emulator if needed)")]
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
    & "{{adb}}" shell am start -n com.jollygoodsw.earring/.MainActivity

# Build the Android debug APK and install + launch it on a connected USB device.
# Ignores emulators — requires a physical device with USB debugging enabled.
# If a Play Store (release-signed) build is on the device, it is uninstalled
# automatically so the debug build can be installed (on-device app data is lost).
[doc("Build + install debug APK on a connected USB device and launch")]
android-device:
    @$phys = (& "{{adb}}" devices | Select-String -Pattern '^(?!emulator-)(\S+)\s+device$'); \
     if (-not $phys) { \
       Write-Host "No physical Android device found. Check:" -ForegroundColor Red; \
       Write-Host "  - phone is plugged in and USB debugging is enabled (Settings > Developer options)"; \
       Write-Host "  - the 'Allow USB debugging?' prompt on the phone was accepted"; \
       Write-Host "  - 'adb devices' lists it as 'device' (not 'unauthorized' or 'offline')"; \
       exit 1; \
     }; \
     $serial = $phys[0].Matches[0].Groups[1].Value; \
     Push-Location android; .\gradlew assembleDebug; Pop-Location; \
     if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; \
     $apk = "android/app/build/outputs/apk/debug/app-debug.apk"; \
     Write-Host "Installing on device $serial..."; \
     $out = & "{{adb}}" -s $serial install -r $apk 2>&1 | Out-String; \
     if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') { \
       Write-Host "Play Store build detected (signature mismatch) - uninstalling it first..."; \
       & "{{adb}}" -s $serial uninstall com.jollygoodsw.earring | Out-Null; \
       & "{{adb}}" -s $serial install $apk; \
     } else { Write-Host $out.Trim() }; \
     if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; \
     & "{{adb}}" -s $serial shell am start -n com.jollygoodsw.earring/.MainActivity

# Compile-check Kotlin only (fast, no install)
[doc("Compile-check Kotlin only (fast, no install)")]
android-check:
    Push-Location android; .\gradlew :app:compileDebugKotlin; Pop-Location

# Build a signed release AAB for Google Play upload.
# Prompts for KEYSTORE_PASSWORD if not already set in the environment.
# Output: android/app/build/outputs/bundle/release/app-release.aab
[doc("Build signed release AAB for Google Play upload")]
android-release:
    @if (-not $env:KEYSTORE_PASSWORD) { $env:KEYSTORE_PASSWORD = Read-Host "Keystore password" }; \
     Push-Location android; .\gradlew bundleRelease; Pop-Location

# Take a screenshot from the emulator
[doc("Take a screenshot from the emulator")]
screenshot:
    & "{{adb}}" shell screencap -p /sdcard/screen.png
    & "{{adb}}" pull /sdcard/screen.png screen.png

# Build the Tauri desktop frontend
[doc("Build the Tauri desktop frontend")]
desktop:
    Push-Location desktop; npm run build; Pop-Location

# Run cargo tests (shared Rust core)
[doc("Run cargo tests (shared Rust core)")]
test:
    cargo test


# Unlock the dedicated code-signing keychain so codesign works in headless
# (SSH) sessions. No-op if the keychain hasn't been set up — see
# scripts/setup_ios_build_keychain.sh. Not listed in `just --list`.
[private]
_ios-keychain-unlock:
    #!/bin/sh
    KCPASS=$HOME/.config/earring/build-keychain-pass
    KC=$HOME/Library/Keychains/earring-build.keychain-db
    if [ -f "$KCPASS" ] && [ -f "$KC" ]; then
      security unlock-keychain -p "$(cat "$KCPASS")" "$KC"
    fi

# Build the iOS app (debug) for a connected device
[doc("Build the iOS app (Debug) — macOS only")]
ios: _ios-keychain-unlock
    #!/bin/sh
    set -eu
    cd "{{justfile_directory()}}/ios"
    xcodebuild build \
      -project earring.xcodeproj \
      -scheme earring \
      -configuration Debug \
      -destination 'generic/platform=iOS' \
      -allowProvisioningUpdates

# Build the iOS app (Debug) and install + launch it on a connected iPhone/iPad.
# Requires macOS + Xcode 15+. Uses the first device devicectl lists unless
# IOS_DEVICE_ID is set (find identifiers with: xcrun devicectl list devices).
[doc("Build + install on a connected iPhone/iPad and launch — macOS only")]
ios-device: _ios-keychain-unlock
    #!/bin/sh
    set -eu
    cd "{{justfile_directory()}}/ios"
    xcodebuild build \
      -project earring.xcodeproj \
      -scheme earring \
      -configuration Debug \
      -destination 'generic/platform=iOS' \
      -derivedDataPath build/DerivedData \
      -allowProvisioningUpdates
    APP="build/DerivedData/Build/Products/Debug-iphoneos/earring.app"
    if [ -z "${IOS_DEVICE_ID:-}" ]; then
      IOS_DEVICE_ID=$(xcrun devicectl list devices | grep -iEo '[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}' | head -n 1)
    fi
    if [ -z "$IOS_DEVICE_ID" ]; then
      echo "No iOS device found. Connect it via USB/Wi-Fi, trust this Mac, then retry." >&2
      exit 1
    fi
    xcrun devicectl device install app --device "$IOS_DEVICE_ID" "$APP"
    xcrun devicectl device process launch --device "$IOS_DEVICE_ID" com.jollygoodsw.earring

# Archive the iOS app and export a Release IPA.
# Output: /tmp/earring_export/earring.ipa
[doc("Archive the iOS app and export a Release IPA — macOS only")]
ios-archive: _ios-keychain-unlock
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
[doc("Archive, export, and upload to TestFlight — macOS only")]
ios-testflight: _ios-keychain-unlock
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
[doc("Build signed AAB + upload to Play Store internal testing")]
android-play:
    @if (-not $env:KEYSTORE_PASSWORD) { $env:KEYSTORE_PASSWORD = Read-Host "Keystore password" }; \
     Push-Location android; .\gradlew bundleRelease; Pop-Location
    Push-Location scripts; node publish_android.js; Pop-Location

# Upload a previously built AAB to Play Store without rebuilding.
# Useful if you already ran android-release and just want to re-upload.
[doc("Upload existing AAB to Play Store without rebuilding")]
android-play-upload:
    Push-Location scripts; node publish_android.js; Pop-Location

# Count lines of code
[doc("Count lines of code")]
wc:
    tokei
