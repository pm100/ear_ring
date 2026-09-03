set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set dotenv-load

adb      := if os() == "windows" { env_var_or_default('LOCALAPPDATA', 'C:/Users/Default/AppData/Local') + '/Android/Sdk/platform-tools/adb.exe' } else { "adb" }
emulator := if os() == "windows" { env_var_or_default('LOCALAPPDATA', 'C:/Users/Default/AppData/Local') + '/Android/Sdk/emulator/emulator.exe' } else { "emulator" }
avd      := env_var_or_default('ANDROID_AVD', 'Medium_Phone_API_36.1')

# App Store Connect API key used for headless iOS signing/upload (see
# scripts/setup_ios_build_keychain.sh notes in AGENTS.md). The Key ID and
# Issuer ID aren't secret — only the .p8 private key file is, and it stays
# on the Mac at ~/.private_keys/AuthKey_<KeyID>.p8, never in git. Override
# either via env var if the key is ever rotated.
apple_key_id    := env_var_or_default('APP_STORE_KEY_ID', 'W4T73HJBF4')
apple_issuer_id := env_var_or_default('APP_STORE_ISSUER_ID', '30e7952a-07ae-4893-95c0-3a8cf2db56c4')

# Print the Android versionName (from build.gradle) and current git commit hash
# before building. Not listed in `just --list`.
[private]
_android-version:
    @$vn = (Select-String -Path android/app/build.gradle -Pattern 'versionName\s+"([^"]+)"').Matches[0].Groups[1].Value; $gh = git rev-parse --short=7 HEAD; Write-Host "Android version $vn — git $gh" -ForegroundColor Cyan

# Build and install the Android debug APK, then launch the app.
# Starts the emulator automatically if no device/emulator is connected.
[doc("Build + install debug APK and launch (auto-starts emulator if needed)")]
android: _android-version
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
# Uses `adb install -d` (allow version-code downgrade): debug builds are local,
# throwaway installs, so their versionCode (VERSION_CODE env var, or the
# build.gradle fallback) has no business gating installation just because
# something with a higher versionCode — a Play Store build, or a leftover
# VERSION_CODE left exported in this shell from a prior `android-release` run
# — is already on the device. See earring-versioncode-automation memory /
# AGENTS.md for the Play-upload versionCode flow this is deliberately not part of.
# Some OEM Android builds ignore -d outright even when passed correctly, so a
# version-downgrade rejection also falls back to uninstall+reinstall (same as
# the signature-mismatch case) — that always works since there's nothing left
# on the device to downgrade from.
[doc("Build + install debug APK on a connected USB device and launch")]
android-device: _android-version
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
     $out = & "{{adb}}" -s $serial install -r -d $apk 2>&1 | Out-String; \
     if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE') { \
       Write-Host "Play Store build detected (signature mismatch) - uninstalling it first..."; \
       & "{{adb}}" -s $serial uninstall com.jollygoodsw.earring | Out-Null; \
       & "{{adb}}" -s $serial install -d $apk; \
     } elseif ($out -match 'INSTALL_FAILED_VERSION_DOWNGRADE') { \
       Write-Host "Device rejected -d downgrade install - uninstalling and reinstalling instead..."; \
       & "{{adb}}" -s $serial uninstall com.jollygoodsw.earring | Out-Null; \
       & "{{adb}}" -s $serial install -d $apk; \
     } else { Write-Host $out.Trim() }; \
     if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; \
     & "{{adb}}" -s $serial shell am start -n com.jollygoodsw.earring/.MainActivity

# Compile-check Kotlin only (fast, no install)
[doc("Compile-check Kotlin only (fast, no install)")]
android-check: _android-version
    Push-Location android; .\gradlew :app:compileDebugKotlin; Pop-Location

# Build a signed release AAB for Google Play upload.
# Prompts for KEYSTORE_PASSWORD if not already set in the environment.
# versionCode is fetched automatically from Play Console (best-effort guess;
# see scripts/release_android.js) unless VERSION_CODE is already set.
# Output: android/app/build/outputs/bundle/release/app-release.aab
[doc("Build signed release AAB for Google Play upload")]
android-release: _android-version
    @if (-not $env:KEYSTORE_PASSWORD) { $env:KEYSTORE_PASSWORD = Read-Host "Keystore password" }; \
     Push-Location scripts; node release_android.js; Pop-Location

# Take a screenshot from the emulator
[doc("Take a screenshot from the emulator")]
screenshot:
    & "{{adb}}" shell screencap -p /sdcard/screen.png
    & "{{adb}}" pull /sdcard/screen.png screen.png

# Print the desktop package.json version and current git commit hash before
# building. Not listed in `just --list`.
[private]
_desktop-version:
    @$v = (Get-Content desktop/package.json | ConvertFrom-Json).version; $gh = git rev-parse --short=7 HEAD; Write-Host "Desktop version $v — git $gh" -ForegroundColor Cyan

# Build the Tauri desktop frontend
[doc("Build the Tauri desktop frontend")]
desktop: _desktop-version
    Push-Location desktop; npm run build; Pop-Location

# Run cargo tests (shared Rust core)
[doc("Run cargo tests (shared Rust core)")]
test:
    cargo test

# Run Android's instrumented UI tests (app/src/androidTest) on a real
# emulator/device — boots the app and drives the actual Compose UI, unlike
# `test` above which only covers the Rust core's pure logic.
# Starts the emulator automatically if no device/emulator is connected.
[doc("Run Android functional/UI tests on an emulator (auto-starts one if needed)")]
android-test: _android-version
    @$devices = (& "{{adb}}" devices | Select-String -Pattern '\tdevice$'); \
     if (-not $devices) { \
       Write-Host "No device found — starting emulator '{{avd}}'..."; \
       Start-Process -FilePath "{{emulator}}" -ArgumentList "-avd {{avd}} -no-snapshot-save" -WindowStyle Normal; \
       Write-Host "Waiting for emulator to boot (this takes ~60 s)..."; \
       & "{{adb}}" wait-for-device | Out-Null; \
       do { Start-Sleep 3; $booted = & "{{adb}}" shell getprop sys.boot_completed 2>$null } while ($booted.Trim() -ne '1'); \
       Write-Host "Emulator ready."; \
     }
    Push-Location android; .\gradlew connectedDebugAndroidTest; Pop-Location


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

# Print the iOS MARKETING_VERSION/CURRENT_PROJECT_VERSION (from the Xcode
# project) and current git commit hash before building. Not listed in
# `just --list`.
[private]
_ios-version:
    #!/bin/sh
    cd "{{justfile_directory()}}/ios"
    mv=$(grep -m1 'MARKETING_VERSION' earring.xcodeproj/project.pbxproj | sed -E 's/.*= ([^;]+);/\1/')
    cv=$(grep -m1 'CURRENT_PROJECT_VERSION' earring.xcodeproj/project.pbxproj | sed -E 's/.*= ([^;]+);/\1/')
    gh=$(git -C "{{justfile_directory()}}" rev-parse --short=7 HEAD)
    echo "iOS version $mv ($cv) — git $gh"

# Build the iOS app (debug) for a connected device
[doc("Build the iOS app (Debug) — macOS only")]
ios: _ios-version _ios-keychain-unlock
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
ios-device: _ios-version _ios-keychain-unlock
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
ios-archive: _ios-version _ios-keychain-unlock
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
      -allowProvisioningUpdates \
      -authenticationKeyPath "$HOME/.private_keys/AuthKey_{{apple_key_id}}.p8" \
      -authenticationKeyID {{apple_key_id}} \
      -authenticationKeyIssuerID {{apple_issuer_id}}
    echo "IPA ready: /tmp/earring_export/earring.ipa"

# Archive, export, and upload to TestFlight.
# Requires ~/.private_keys/AuthKey_<KeyID>.p8 on the Mac (download once from
# App Store Connect → Users & Access → Integrations → App Store Connect API).
# Key ID/Issuer ID default to the team key above; override via env vars if
# the key is ever rotated: APP_STORE_KEY_ID=... APP_STORE_ISSUER_ID=... just ios-testflight
[doc("Archive, export, and upload to TestFlight — macOS only")]
ios-testflight: _ios-version _ios-keychain-unlock
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
      -allowProvisioningUpdates \
      -authenticationKeyPath "$HOME/.private_keys/AuthKey_{{apple_key_id}}.p8" \
      -authenticationKeyID {{apple_key_id}} \
      -authenticationKeyIssuerID {{apple_issuer_id}}
    xcrun altool --upload-app \
      -f /tmp/earring_export/earring.ipa \
      -t ios \
      --apiKey {{apple_key_id}} \
      --apiIssuer {{apple_issuer_id}} \
      --output-format xml
    echo "Upload to TestFlight complete."

# Build signed release AAB and upload to Play Store closed testing (alpha) —
# the track our real named testers and the 12-tester/14-day production-
# graduation clock are on. Requires:
#   KEYSTORE_PASSWORD                  — keystore password (prompted if not set)
#   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   — path to service account key JSON file
#     (Play Console → Setup → API access → Service accounts → download JSON key)
# Optional:
#   KEY_PASSWORD   — if different from KEYSTORE_PASSWORD
#   PLAY_TRACK     — override track (default: alpha); use "internal" for a
#     quick no-review internal-only test build
# versionCode is fetched automatically and self-corrects: if Play rejects it
# as already used (can happen for uploads our guess can't see, e.g. a closed
# testing track), release_android.js rebuilds with the corrected code and
# retries — no manual bumping needed.
[doc("Build signed AAB + upload to Play Store closed testing (alpha)")]
android-play: _android-version
    @if (-not $env:KEYSTORE_PASSWORD) { $env:KEYSTORE_PASSWORD = Read-Host "Keystore password" }; \
     Push-Location scripts; node release_android.js --upload; Pop-Location

# Upload a previously built AAB to Play Store without rebuilding.
# Useful if you already ran android-release and just want to re-upload.
[doc("Upload existing AAB to Play Store without rebuilding")]
android-play-upload:
    Push-Location scripts; node publish_android.js; Pop-Location

# Count lines of code
[doc("Count lines of code")]
wc:
    tokei
