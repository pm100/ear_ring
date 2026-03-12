# Ear Ring — Agent Instructions

## UI Consistency Rule

**ALL UI changes must be applied to ALL platforms (Android, iOS, Tauri/desktop) simultaneously.**

The canonical reference implementation is the **Android app** (`android/` directory).
When building or modifying any platform (iOS, desktop/Tauri, web, etc.) you must
replicate the Android UI exactly unless there is an explicit per-platform instruction
in this file overriding a specific element.

**When a UI change is requested with no platform specified, implement it on every platform
in the same commit. Never apply a change to only one platform and consider the task done.**

If you are given explicit instructions to make the UI different on a specific platform,
document that exception in the **Platform Exceptions** section at the bottom of this file.

**After any UI change — sizes, positions, colours, layout, or new elements — you MUST update
the relevant section of this file (AGENTS.md) to reflect the new values before considering
the task complete. This keeps the spec accurate for future agents.**

---

## Screen Inventory

Every platform must implement all 5 screens:

| Screen | Navigation trigger |
|--------|--------------------|
| Home | App launch / "New Exercise" from Results |
| Exercise | "Start Exercise" from Home |
| Mic Setup | "Mic Setup" from Home |
| Results | Exercise completion (all notes done or wrong note) |
| Progress | "Progress" from Home or Results |

Back navigation (system back gesture AND an on-screen "← Back" button) must work on
every screen except Home.

---

## Screen Designs

### Home Screen

Layout: vertically scrollable column, 16dp/px padding, centred.

```
[24dp space]
[Icon row: 48dp app icon (rounded 10dp corners) + "Ear Ring" 32sp bold primary — centred, 12dp gap]
"Ear Training"         — 16sp, muted/secondary colour

[28dp space]
Section label: "Root Note"
Chip grid (wrapping): C  C#  D  D#  E  F  F#  G  G#  A  A#  B
  — 12 chips, must WRAP across multiple rows (FlowRow / flexWrap)
  — Selected chip: filled with primary colour
  — Unselected: outlined

[16dp space]
Section label: "Octave"
Chip row: 3  4  5   (single row, equal width)

[16dp space]
Section label: "Scale"
Chip grid (wrapping): Major | Natural Minor | Harmonic Minor |
                      Pentatonic Major | Pentatonic Minor |
                      Dorian | Mixolydian | Blues
  — 8 chips, must wrap

[16dp space]
Section label: "Sequence Length"
Chip row: 2  3  4  5  6  7  8   (single row, equal width)

[32dp space]
[▶ Start Exercise]    — full-width filled primary button, 52dp tall, 18sp
[🎙 Mic Setup]        — full-width outlined button, 48dp tall, 16sp
[📊 Progress]         — full-width outlined button, 48dp tall, 16sp
[16dp space]
```

Section labels: small/label typography, muted colour, left-aligned, 6dp bottom margin.

---

### Exercise Screen

Layout: vertical column, 16dp padding, NOT scrollable.

```
[← Back]              [RootNoteOctave ScaleName]   (row: back left, title right)

[8dp space]
MusicStaff            — full width, 160dp tall (see Staff spec below)

[12dp space]
Status text           — bodyLarge, muted colour, centred
  IDLE:      "Press Play to hear the sequence"
  PLAYING:   "Listen carefully…"
  LISTENING: "Sing note N of M: NoteLabel"
  DONE:      "Calculating score…"

[16dp space]
PitchMeter            — 90dp circle (see Pitch Meter spec below)

[20dp space]
--- Buttons change based on status ---
IDLE:
  [▶ Play Sequence]   — full-width filled, 52dp, 17sp
  [🎙 Start Listening] — full-width outlined, 48dp, 16sp

PLAYING:
  [⏹ Stop Playback]  — full-width outlined, 48dp, 16sp

LISTENING:
  [⏹ Stop Listening] — full-width filled ERROR colour, 52dp, 17sp

DONE:
  [CircularProgressIndicator / spinner]

[20dp space]
Note tracker row (if sequence non-empty):
  Label: "Notes:"
  One column per note showing:
    symbol:  ○ (pending) | → (current, primary colour) | ✓ (correct, green) | ✗ (wrong, red)
    label:   note name below symbol, 10sp, muted
```

---

### Mic Setup Screen

Layout: vertical column, 16dp padding.

```
[← Back]              [Mic Setup]        (row: back left, title right)

[24dp space]
"Sing or play a note to test your microphone."   — bodyMedium, centred

[16dp space]
MusicStaff            — 160dp tall, shows rolling note history left to right
                        Notes are placed at fixed 44dp spacing from the LEFT end of the staff
                        Each newly stable note is appended on the right
                        When staff is full (8 notes), oldest scrolls off left, new note appears right
                        Only notes within the valid MIDI range are added:
                          midiMin = (octave + 1) * 12  (C at selected octave, e.g. C4 when octave=4)
                          midiMax = midiMin + 23        (two octaves, e.g. B5 when octave=4)
                        Max 8 notes visible; history capped at 8
                        Most recent note: ACTIVE colour (blue)
                        Previous notes: EXPECTED colour (hollow dark)
                        Empty staff when nothing detected yet

[8dp space]
Large note name       — 72sp bold, primary colour when detected, muted when "—"
Hz display            — bodyMedium, muted, shown only when pitch detected

[24dp space]
PitchMeter            — 90dp circle

[32dp space]
[🎙 Start Listening]  — full-width filled, 52dp, 17sp
  OR
[⏹ Stop]             — full-width filled ERROR colour, 52dp, 17sp

NO test note buttons.
```

Pitch display stability: require 3 consecutive audio frames of the same pitch class
before updating the displayed note. This prevents flickering.

The staff visual style (lines, treble clef, note colours, positioning math) is
**identical to the Exercise screen**. The only difference is that in Mic Setup the
notes accumulate from live detection rather than from a pre-generated sequence.

---

### Results Screen

Layout: vertically scrollable column, 16dp padding, centred.

```
[32dp space]
Score emoji           — 64sp   (🏆 100% | 🎉 ≥80% | 👍 ≥50% | 💪 <50%)
Score percentage      — 56sp bold, colour-coded
  ≥80% → green (#4CAF50)
  ≥50% → orange (#FF9800)
  <50%  → red (#F44336)
"Score"               — titleMedium, muted
[8dp space]
"RootNoteOctave  ScaleName"   — bodyLarge

[24dp space]
Divider

[16dp space]
"Note by Note"        — titleMedium, semibold

For each note (index, expectedLabel, detectedLabel, correct):
  Row:  "N."  |  "Expected: X"  |  "Sung: Y"  |  ✓/✗/—
  ✓ = green, ✗ = red, — = muted (not attempted)
  Divider between rows (muted colour)

[28dp space]
[🔄 Try Again]        — full-width filled, 52dp, 17sp
[🏠 New Exercise]     — full-width outlined, 48dp, 16sp
[📊 View Progress]    — full-width outlined, 48dp, 16sp
[16dp space]
```

Session is saved to persistent storage on first load of this screen.

---

### Progress Screen

Layout: vertically scrollable column, 16dp padding.

```
[← Back]              [Progress]         (row: back left, title right)

Streak card:
  🔥 N day streak     — prominent display

Session history:
  If empty: "No sessions yet. Complete an exercise to see your progress!"
  Otherwise: list of SessionRecord cards showing:
    Scale name + root note
    Score percentage
    Date
    Sequence length
```

---

## Music Staff Specification

Canvas/SVG element, full width, **160dp/px tall**.

```
lineSpacing = 12dp
staffTop    = height/2 - 2*lineSpacing    (centres the 5-line staff vertically)
leftMargin  = 60px (used for note placement only — NOT for staff line start)
noteRadius  = lineSpacing * 0.45
```

**5 horizontal staff lines** (colour #333333, 1.5px stroke):
```
start x = 5px   ← lines begin at the LEFT EDGE, passing through the clef
end   x = totalWidth - 16px (or svgWidth - 10 in Tauri)
line 0 = staffTop + 0*lineSpacing
line 1 = staffTop + 1*lineSpacing
...
line 4 = staffTop + 4*lineSpacing   ← bottom line
```
Staff lines must start at x=5 (not leftMargin) so they visually pass through the treble clef.

**Treble clef** — size and position (all platforms):
```
Android / iOS  : Unicode U+1D11E (𝄞), x = 4px from left edge
                 Android: font size = lineSpacing * 3.5
                          drawText baseline y = staffTop + lineSpacing * 3.0
                 iOS:     font size = lineSpacing * 7  (iOS system font fallback renders smaller)
                          topLeading anchor at CGPoint(x:4, y: staffTop - lineSpacing * 2.5)

Tauri/desktop  : Pre-rendered PNG (desktop/public/treble_clef.png, 149×307px, transparent bg)
                 Generated via Windows GDI+ — see UI Debugging Guide for regen instructions.
                 clefH = lineSpacing * 8       (spans 2 lineSpacings above and below staff)
                 clefW = clefH * (149 / 307)   (preserves PNG aspect ratio ≈ 0.485)
                 x = 2,  y = staffTop - lineSpacing * 2
```

**Note positioning** (uses `staff_position()` from Rust core):
```
staffCenter = staffTop + 2*lineSpacing   (third line ≈ B4)
noteY = staffCenter - staffPos * (lineSpacing / 2)
```
`staff_position()` returns: C4=0, D4=1, E4=2, F4=3, G4=4, A4=5, B4=6, C5=7,
B3=-1, A3=-2, … (diatonic steps from C4, sharps/flats share parent note's position).

**Note horizontal distribution**:
```
noteAreaStart = leftMargin + 20
noteAreaWidth = totalWidth - noteAreaStart - 20
noteStep      = noteAreaWidth / max(noteCount, 1)   [Exercise screen: distributed evenly]
noteStep      = 44dp (fixed)                         [Setup screen: fixed spacing, left-to-right]
noteX         = noteAreaStart + index*noteStep + noteStep/2
```

**Note head colours**:
| State    | Colour  | Style   |
|----------|---------|---------|
| EXPECTED | #333333 | hollow (filled then white inner circle, radius-2.5) |
| ACTIVE   | #3F51B5 | filled solid |
| CORRECT  | #4CAF50 | filled solid |
| INCORRECT| #F44336 | filled solid |

**Ledger lines** (colour #555555, 1.5px stroke, width = noteRadius*2.8 each side):
- Draw above staff: for each lineSpacing step above staffTop while noteY ≤ that line
- Draw below staff: for each lineSpacing step below line 4 while noteY ≥ that line

---

## Pitch Meter Specification

Circular widget, **90dp/px diameter**.

- Outer ring: 4px stroke
  - Grey (#BDBDBD) when no pitch detected
  - Green (#4CAF50) when pitch detected
- Centre text: note label (e.g. "A4", "C#4")
  - Bold, 20sp (16sp if label is 3+ chars)
  - Dark (#212121) when detected, grey (#BDBDBD) when not
- Shows "—" when no pitch detected

---

## Colours

| Token | Value | Usage |
|-------|-------|-------|
| Primary | #3F51B5 (indigo) | Buttons, selected chips, active notes, ACTIVE note state |
| Success / Correct | #4CAF50 (green) | Correct notes, pitch meter ring when active |
| Error / Incorrect | #F44336 (red) | Wrong notes, Stop Listening button |
| Warning | #FF9800 (orange) | Mid-range score on Results screen |
| Surface text | #333333 | Staff lines, expected note heads |
| Muted text | #BDBDBD / onSurfaceVariant | Labels, secondary text, pitch meter when idle |

---

## Audio

**Playback** — Salamander Grand Piano samples:
- Base URL: `https://tonejs.github.io/audio/salamander/`
- Available MIDI values: 21,24,27,30,33,36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96,99,102,105,108
- Note name map: 21→A0, 24→C1, 27→Ds1, 30→Fs1, 33→A1, 36→C2, 39→Ds2, 42→Fs2, 45→A2, 48→C3, 51→Ds3, 54→Fs3, 57→A3, 60→C4, 63→Ds4, 66→Fs4, 69→A4, 72→C5, 75→Ds5, 78→Fs5, 81→A5, 84→C6, 87→Ds6, 90→Fs6, 93→A6, 96→C7, 99→Ds7, 102→Fs7, 105→A7, 108→C8
- Pitch-shift: find nearest available sample, playbackRate = 2^(delta_semitones/12)
- Cache samples locally after first download
- Sequence playback: 600ms between notes

**Capture** — microphone for pitch detection:
- Sample rate: 44100 Hz
- Buffer size: 4096 samples
- Pass raw f32 PCM to Rust `detect_pitch()`
- Silence threshold: RMS < 0.003 → ignore frame

**Pitch stability** (before confirming a sung note):
- Require 2+ consecutive frames with same pitch class (midi % 12)
- AND the stable pitch must be held for ≥ 450ms
- Debounce: after confirming, ignore same pitch for 2× the hold duration
- On confirm: compare pitch class of detected note with pitch class of expected sequence note

---

## Data Persistence

Sessions stored as a list of records:
```
{ date: string, scale: string, root: string, score: float, length: int }
```
- Android: SharedPreferences (JSON)
- iOS: UserDefaults
- Desktop: localStorage or a local file

Streak = number of consecutive calendar days with at least one session.

---

## Platform Exceptions

### iOS — Home Screen title row
SwiftUI cannot directly reference the app icon from `Assets.xcassets/AppIcon` as a UI image.
**Exception:** Use `"Ear Ring 🎵"` as a plain bold Text title (32pt, primary colour) instead of
the icon+text row. All other screens and elements must match the spec.

---

## UI Debugging Guide

### Debugging the Android App (Emulator)

**ADB location:** `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`

**Launch the app:**
```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb shell am start -n com.earring/.MainActivity
```

**The debug build is slow to start** (~60–90 seconds for the splash to clear on first run due to JVM
verification). Wait for the logcat message `Displayed com.earring/.MainActivity` before tapping.

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
- "Mic Setup" button: (540, 1968)
- "Progress" button: (540, 2060)

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
// Change 'home' to 'setup', 'exercise', etc. — Vite hot-reloads instantly
const [screen, setScreen] = useState<Screen>('setup');
```
Revert to `'home'` after capturing. Hot-reload takes ~2–3 seconds.

**Treble clef PNG regeneration** (`desktop/public/treble_clef.png`):
WebView2/Chromium cannot reliably render U+1D11E (𝄞) via CSS fonts.
The PNG is pre-rendered using Windows GDI+ (System.Drawing) which has full access to
Segoe UI Symbol. To regenerate:
```powershell
cd C:\work\ear_ring\icon
node gen_desktop_clef.js
```
The script uses PowerShell GDI+ internally, then sharp for trimming. The output PNG has a
**transparent background** (RGBA, channels=4). Do NOT use sharp's SVG renderer for this —
libvips/rsvg does not have access to Windows system fonts and renders a fallback glyph.

