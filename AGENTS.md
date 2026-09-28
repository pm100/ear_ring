# Ear Ring — Agent Instructions

## ⚠️ Read This First — Every Session

**Before doing any work on this repository, read this entire file.**
It contains the process rules every agent must follow in this repo — git discipline,
where logic must live, and cross-platform consistency. Do not rely on memory alone —
this file is the source of truth and is kept up to date as the project evolves.

**The full product/UI spec — screen layouts, navigation, the music staff and pitch
meter rendering rules, colours, audio behaviour, persisted data shapes, and the
instrument tables — lives in `DESIGN.md`, not here.** Read that before touching UI,
staff/audio/colour code, instrument data, or persisted data shapes.

**Before making any changes, check for unsynced remote commits:**
```
git fetch origin
git status
```
If the remote is ahead of local, **stop and warn the user** before proceeding.
Do not pull or rebase automatically — let the user decide.

Key things you will find here:
- Git commit/push discipline
- The Shared Logic Rule — where cross-platform logic belongs
- The UI Consistency Rule — how UI changes must be applied across platforms
- Build, run, and debug commands for each platform (**UI Debugging Guide**, at the bottom)

---

## ⛔ Git Commit / Push Rules

**Never commit or push unless the user explicitly tells you to.**

- Do not run `git commit` or `git push` on your own initiative, even after completing a task.
- Do not ask "should I commit this?" — wait for the user to say so.
- Approval for a *task* ("implement X", "fix X") is not approval to *commit or push*
  it — those are separate acts. Ask again at the moment of committing, even if the
  work leading up to it was explicitly requested, and even if an earlier round in the
  same session already got a yes — that approval does not carry over to the next
  commit or push.
- This applies to every session, regardless of how complete or correct the changes are.

---

## Code Comment Style

Keep in-code comments short. Put the detailed bug narrative in the commit message and the
tracking issue — that's the append-only history a reader can follow. A code comment should
either point to the issue number (e.g. `// issue #17`) or explain something non-obvious about
the code itself, not re-tell the whole bug story.

---

## Shared Logic Rule

**Keep cross-platform app logic in the shared Rust core whenever practical.**

Platform-specific code in Android, iOS, and desktop/Tauri should primarily handle:
- UI rendering and navigation
- audio input / microphone plumbing
- audio output / playback plumbing
- local platform persistence APIs

Business rules and exercise behavior that must stay consistent across platforms should
prefer Rust implementations first, including things like:
- music-theory derivations
- note correctness / scoring rules
- exercise prompt generation
- other deterministic exercise/session logic

If logic must temporarily live in platform code, treat that as an exception and prefer
moving it back into Rust in the next related change.

**`rust_wasm/` is currently dead code.** It's a workspace member (so `cargo build`/
`cargo test` compile it, which is why it stays in sync with the core API — e.g. it
picked up `avoid_first_midi`), but nothing packages or loads it: no `justfile` recipe
runs `wasm-pack`, no platform (desktop/Tauri included, which talks to the Rust core
directly via native Tauri commands) imports it. Left in place for now for a possible
future web target — don't wire it up or delete it without asking first.

This rule is already applied to the ~24 exercise settings via `rust/src/settings.rs`
(defaults, tolerant load/normalize, and every action that changes a setting) — see
DESIGN.md's "Settings Architecture (Rust Core)" section for how that's structured and
exposed to each platform.

---

## UI Consistency Rule

**ALL UI changes must be applied to ALL platforms (Android, iOS, Tauri/desktop) simultaneously.**

The canonical reference implementation is the **Android app** (`android/` directory).
When building or modifying any platform (iOS, desktop/Tauri, web, etc.) you must
replicate the Android UI exactly unless there is an explicit per-platform exception
documented in DESIGN.md.

**When a UI change is requested with no platform specified, implement it on every platform
in the same commit. Never apply a change to only one platform and consider the task done.**

If you are given explicit instructions to make the UI different on a specific platform,
document that exception inline in the relevant DESIGN.md section (e.g. "iOS — Home
Screen title row").

**After any UI change — sizes, positions, colours, layout, or new elements — you MUST update
the relevant section of DESIGN.md to reflect the new values before considering
the task complete. This keeps the spec accurate for future agents.**

---

## UI Debugging Guide

### Debugging the Android App (Emulator)

**ADB location:** `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`

**Launch the app:**
```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb shell am start -n com.jollygoodsw.earring/.MainActivity
```

**The debug build is slow to start** (~60–90 seconds for the splash to clear on first run due to JVM
verification). Wait for the logcat message `Displayed com.jollygoodsw.earring/.MainActivity` before tapping.

**Take a screenshot:**
```powershell
& $adb shell screencap -p /sdcard/screen.png
& $adb pull /sdcard/screen.png C:\work\ear_ring\screen.png
```

**Tap at screen coordinates** (screen is 1080×2400 physical pixels; adb uses physical coords):
```powershell
& $adb shell input tap <x> <y>
```
Known approximate tap targets on the Home screen (1080×2400):
- "Start Exercise" button: (540, 1810)

Bottom nav tab bar tap targets (approx, bottom of 1080×2400 screen) — verified
2026-09-09 via `adb shell uiautomator dump`; if a tap ever misses, re-derive
from a fresh dump rather than trusting these numbers or eyeballing a
screenshot (both have gone stale/wrong before):
- Home tab:     (108, 2274)
- Mic tab:      (320, 2274)
- Progress tab: (540, 2274)
- Settings tab: (756, 2274)
- Help tab:     (972, 2274)

**Back navigation:**
```powershell
& $adb shell input keyevent 4
```

**View logcat for errors:**
```powershell
& $adb logcat -d 2>&1 | Select-String -Pattern "earring|EarRing|FATAL|AndroidRuntime" -CaseSensitive:$false | Select-Object -Last 30
```

**Build and install:**
```powershell
cd C:\work\ear_ring\android
.\gradlew installDebug 2>&1 | Select-String -Pattern "BUILD|error:|FAILED|Installing"
```

**Build and install on a physical device** (skips emulators; needs USB debugging enabled):
```powershell
just android-device      # Android — installs + launches on first USB device
just ios-device          # iOS — macOS only; builds Debug, installs + launches via devicectl
                         # (override device with IOS_DEVICE_ID=<uuid>)
```

**Build and install on the iOS Simulator** (no device/USB needed, no code signing):
```powershell
just ios-sim              # iOS — macOS only; builds Debug, boots "iPhone 17" sim, installs + launches
                          # (override with IOS_SIMULATOR_NAME=<name> or IOS_SIMULATOR_UDID=<udid>)
```

**Publish to Play Store closed testing (alpha)** — the track our real named testers
and the production-graduation clock are on (`PLAY_TRACK=internal` overrides to the
no-review internal-only track instead):
```powershell
# One step: build signed AAB + upload
just android-play

# Or separately — build first, then upload
just android-release
just android-play-upload
```
Requires `KEYSTORE_PASSWORD` and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` env vars.
Service account JSON: Play Console → Setup → API access → Service accounts → download key.

---

### Remote iOS Builds over SSH (from the Windows machine)

The iOS `just` recipes run on Paul's MacBook Air, reachable via the `mac` SSH alias
(`~/.ssh/config` on Windows → `pauls-macbook-air.local`, user `pm100`, key auth).
The repo lives at `~/work/ear_ring` on the Mac; keep it synced via git (never edit
files directly on the Mac).

```powershell
# Typical flow: push from Windows, pull + build on the Mac
ssh mac "cd ~/work/ear_ring && git pull --ff-only && just ios"
```

`just ios-archive`/`just ios-testflight` pick the iOS build number (`CFBundleVersion`)
automatically via `scripts/release_ios.js` — see that file's header comment for how it
guesses and self-corrects. Override with `IOS_BUILD_NUMBER=<n>` to force a specific value.

**Code signing headlessly:** plain SSH sessions cannot use the login keychain
(`errSecInternalComponent` — no GUI SecurityAgent), so signing uses a dedicated
`earring-build` keychain whose password is stored in
`~/.config/earring/build-keychain-pass` (chmod 600) on the Mac. All `ios*` recipes
unlock it automatically via the `_ios-keychain-unlock` helper recipe before building.

One-time setup (and again whenever the Apple certificate is renewed):
1. On the Mac GUI: Keychain Access → login → My Certificates → select the
   `Apple Development` (and any `Apple Distribution`) identity → File → Export
   Items… → save `earring-ids.p12` to Desktop with an export password.
2. Copy `scripts/setup_ios_build_keychain.sh` to the Mac and run it with a TTY:
   `ssh -t mac ./setup_ios_build_keychain.sh` — it creates the build keychain,
   imports the identities, registers the keychain on the search list, and deletes
   the `.p12`.

If signed builds start failing with `errSecInternalComponent` again, the likely
causes are: certificate renewed (redo setup), or the build keychain fell off the
user keychain search list (`security list-keychains -d user` should list
`earring-build.keychain-db` first, then `login.keychain-db`).

---

### Debugging the Tauri Desktop App

**Start the dev server** (hot-reloads on file save — Vite reloads TSX, Rust changes require full rebuild):
```powershell
cd C:\work\ear_ring\desktop
Start-Process powershell -ArgumentList "-NoProfile -Command `"cd C:\work\ear_ring\desktop; cargo tauri dev`"" -WindowStyle Normal
```

The window takes ~90 seconds to appear. Wait for `Ear Ring` to appear in `Get-Process | Where-Object { $_.MainWindowTitle -eq "Ear Ring" }`.

**Take a screenshot of the Tauri window:**
```powershell
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class TauriCap {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
$hwnd = (Get-Process | Where-Object { $_.MainWindowTitle -eq "Ear Ring" } | Select-Object -First 1).MainWindowHandle
[TauriCap]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 800
$rect = New-Object TauriCap+RECT
[TauriCap]::GetWindowRect($hwnd, [ref]$rect)
$bmp = New-Object System.Drawing.Bitmap(($rect.R-$rect.L), ($rect.B-$rect.T))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.L, $rect.T, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save("C:\work\ear_ring\tauri_cap.png")
```

**IMPORTANT — window capture gotchas:**
- The Copilot CLI terminal window may cover the Tauri app when taking screenshots.
  Move the Tauri window clear of it first:
  ```powershell
  Add-Type @"
  using System; using System.Runtime.InteropServices;
  public class WM { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr i, int x, int y, int cx, int cy, uint f); }
  "@
  [WM]::SetWindowPos($hwnd, [IntPtr](-1), 900, 50, 500, 860, 0x0040) | Out-Null  # HWND_TOPMOST
  ```
  Remember to clear HWND_TOPMOST after (`[IntPtr](-2)` = HWND_NOTOPMOST).

- `CopyFromScreen` captures the LIVE screen pixels at the window's position — other windows
  in front will appear in the capture. Ensure the Tauri window is topmost before capturing.

**Navigate to a specific screen without clicking** (most reliable):
Temporarily change the initial `useState` in `desktop/src/App.tsx`:
```tsx
// Change 'home' to 'setup', 'exercise', 'settings', 'help', etc. — Vite hot-reloads instantly
const [screen, setScreen] = useState<Screen>('settings');
```
Revert to `'home'` after capturing. Hot-reload takes ~2–3 seconds.

**Treble clef + accidental PNG regeneration:**
All three platforms use pre-rendered PNGs for the treble clef, sharps, and flats.
Regenerate and redistribute all of them with:
```powershell
cd C:\work\ear_ring\icon
node gen_desktop_clef.js          # treble_clef.png → desktop/public, android/drawable, ios/xcassets
node gen_accidental_symbols.js    # flat/sharp variants → all platforms
```
gen_desktop_clef.js uses PowerShell GDI+ (System.Drawing, NotoMusic-Regular.ttf private font) internally.
gen_accidental_symbols.js uses PowerShell GDI+ (System.Drawing, Segoe UI Symbol font) internally.
Output PNGs have transparent backgrounds (RGBA). Do NOT use sharp's SVG renderer —
libvips/rsvg cannot access Windows system fonts and renders a fallback glyph.

---

### Reading Android ADB Screenshots — Common Pitfalls

The emulator screen is **1080×2400 physical pixels** but ADB screenshots are rendered
at compressed display sizes when viewed in this tool, making precise vertical position
hard to judge visually.

**How to count staff lines correctly in a screenshot:**

The music staff has **5 horizontal lines**. From top to bottom:
```
Line 1 (top)    = F5
Line 2          = D5
Line 3 (middle) = B4  ← ♭ belly for Bb MUST sit on this line (F major key sig)
Line 4          = G4
Line 5 (bottom) = E4
```
Spaces between lines (top to bottom): G5, E5, C5, A4.

**CRITICAL pitfall:** At compressed display scales it is very easy to miscount which line
a symbol sits on and wrongly conclude it needs moving. **Before declaring a symbol
misplaced, carefully count lines from the TOP of the staff in the screenshot.**

Rules:
- **Trust the user's report over your own screenshot reading if they conflict.**
  The user can see the actual screen; you are reading a compressed image.
- If genuinely uncertain, add a temporary debug dot at the exact `targetY` pixel
  and compare its position to the symbol — remove the dot before the next release build.
- Do NOT iterate the offset blindly; each build/test cycle is slow. Reason from the
  measured glyph bounds first.

**Key reference values (lineSpacing=31.5px at ~420dpi emulator):**
- `staffTop = 147px`, `staffCenter (B4) = 210px`, `staffBottom (E4) = 273px`
- Canvas height = 420px, lineSpacing = 31.5px
