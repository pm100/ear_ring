# CD Workflow — Required GitHub Secrets

Add these secrets at **Settings → Secrets and variables → Actions → New repository secret**.

## iOS / TestFlight

| Secret | How to get it |
|--------|--------------|
| `IOS_CERTIFICATE_P12_BASE64` | Export your **Apple Distribution** certificate from Keychain Access as a `.p12` file, then: `base64 -i YourCert.p12 \| tr -d '\n'` |
| `IOS_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | Download the **App Store** provisioning profile from developer.apple.com, then: `base64 -i YourProfile.mobileprovision \| tr -d '\n'` |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect → Users & Access → Integrations → App Store Connect API → Key ID (e.g. `ABCDEF1234`) |
| `APP_STORE_CONNECT_ISSUER_ID` | Same page, Issuer ID (UUID format) |
| `APP_STORE_CONNECT_KEY_P8_BASE64` | Download the `.p8` key file from the same page (only downloadable once), then: `base64 -i AuthKey_XXXX.p8 \| tr -d '\n'` |

## Android / Google Play

| Secret | How to get it |
|--------|--------------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i android/app/earring-upload.jks \| tr -d '\n'` |
| `KEYSTORE_PASSWORD` | The keystore/key password (same value used locally) |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Full JSON content of the service account key file (Play Console → Setup → API access → Service accounts → download JSON key). Paste the entire JSON as the secret value. |

## macOS Desktop (Tauri — signing + notarization)

| Secret | How to get it |
|--------|--------------|
| `APPLE_CERTIFICATE` | Export your **Developer ID Application** certificate from Keychain Access as a `.p12`, then: `base64 -i DeveloperID.p12 \| tr -d '\n'` |
| `APPLE_CERTIFICATE_PASSWORD` | Password set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | The common name of the cert, e.g. `Developer ID Application: Your Name (9A4PVL859F)` |
| `APPLE_ID` | The Apple ID email address used for notarization |
| `APPLE_PASSWORD` | An **app-specific password** for that Apple ID (appleid.apple.com → Security → App-Specific Passwords) |

> `APPLE_TEAM_ID` is hardcoded to `9A4PVL859F` in the workflow — no secret needed.

## Notes

- **macOS cert vs iOS cert**: `APPLE_CERTIFICATE` (macOS notarization) must be a **Developer ID Application** certificate. `IOS_CERTIFICATE_P12_BASE64` must be an **Apple Distribution** certificate. These are different certs.
- **Windows**: No signing secrets needed. The Windows build is currently unsigned.
- **GITHUB_TOKEN**: Provided automatically — no setup needed.
