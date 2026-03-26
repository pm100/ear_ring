# Ear Ring — Agent Instructions

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

---

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
| Home | App launch / leaving Exercise via Back or Stop |
| Exercise | "Start Exercise" from Home |
| Mic Setup | "Mic Setup" from Home |
| Results | Reserved legacy screen; **not shown during continuous testing mode** |
| Progress | "Progress" from Home |

Back navigation must work on every screen except Home.
- **Android & iOS**: system back gesture only — no on-screen "← Back" button.
- **Desktop/Tauri**: on-screen "← Back" button (no system back gesture available).

---

## Screen Designs

### Home Screen

Layout: vertically scrollable column, 16dp/px padding, centred.

```
[24dp space]
[Icon row: 48dp app icon (rounded 10dp corners) + "Ear Ring" 32sp bold primary — centred, 12dp gap]
"Ear Training"         — 16sp, muted/secondary colour

[28dp space]
Section label: "Key"
Chip grid (wrapping): C  C#  D  D#  E  F  F#  G  G#  A  A#  B
  — 12 chips, must WRAP across multiple rows (FlowRow / flexWrap)
  — Selected chip: filled with primary colour
  — Unselected: outlined
  — Selecting a new key auto-resets the range to one octave from the new key closest to middle C

[16dp space]
Section label: "Range  (RangeLow – RangeHigh)"   — label updates dynamically with current range
PianoRangePicker
  — Interactive piano keyboard, MIDI 36 (C2) to MIDI 84 (C6), 4 octaves, 29 white keys
  — Horizontally scrollable; white keys 22dp wide × 80dp tall; black keys 14dp wide × 52dp tall
  — Primary-colour handle circles (9dp radius) above each endpoint (rangeStart, rangeEnd)
  — Connected by a primary-colour line; primary highlight on keys within the selected range
  — Handle area: 22dp tall above the keyboard
  — Drag a handle to resize range (minimum span = 12 semitones); tap elsewhere to shift range
  — Default: one octave (12 semitones) from rootNote, using the octave closest to middle C
    e.g. root=C → (C4, B4) = MIDI 60–71; root=G → (G3, F#4) = MIDI 55–65

[16dp space]
Section label: "Scale"
Chip grid (wrapping): Major | Natural Minor | Harmonic Minor |
                      Dorian | Mixolydian
  — 5 chips, must wrap

[16dp space]
Section label: "Sequence Length"
Chip row: 2  3  4  5  6  7  8   (single row, equal width)

[16dp space]
Section label: "Tempo (BPM)"
Chip row: 60  80  100  120  140   (single row, equal width)
  — Default selection: 100 BPM

[16dp space]
Checkbox: "Display Test Notes"
  — Default: unchecked (hidden)

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
                        [Key RangeLow–RangeHigh ScaleName]   (centred title; system back gesture)

[8dp space]
MusicStaff            — full width, 160dp tall (see Staff spec below)
                        MUST start EMPTY for each attempt when "Display Test Notes" = Hide
                        If "Display Test Notes" = Show:
                          - draw the target sequence in EXPECTED black before listening starts
                          - each correctly sung note turns its target note green
                          - a wrong note replaces the current target slot with the detected note in red
                        If "Display Test Notes" = Hide:
                          - only detected/sung notes are shown on the staff
                        Use the same left-to-right fixed 44dp note spacing as Mic Setup
                        Correct notes: green
                        Wrong notes: red

[12dp space]
Status text           — bodyLarge, muted colour, centred
  PLAYING:     "Listen carefully…"
  LISTENING:   "Sing note N of M"
  RETRY_DELAY: "Wrong note. Replaying the same test…" OR
               "Starting the next test…"
  STOPPED:     "Testing stopped"

[8dp space]
Meta line             — bodyMedium, muted colour, centred
  "Attempt A of R  •  Tests T  •  Score P%"
  - `R` default = 5 and must be a configurable retry cap in code
  - `P` is the running average percentage over all completed tests this session

[16dp space]
PitchMeter            — 90dp circle (see Pitch Meter spec below)

[24dp space]
[⏹ Stop Testing]      — full-width filled ERROR colour, 52dp, 17sp
  - Ends the continuous testing session immediately
  - Returns the user to Home
  - Saves the session summary if at least one test was completed

[20dp space]
Current attempt row (if one or more notes were detected this attempt):
  Label: "Current attempt"
  Render sung note labels only
  Correct labels: green
  Wrong labels: red
```

Exercise dynamics:
- Entering Exercise automatically starts the test loop. There is **no** Play button and **no** Start Listening button.
- For each test:
  1. Staff clears to empty
  2. App plays a piano triad derived from the selected root/scale **as a chord** (simultaneous notes), not as an arpeggio
  3. Wait an 800ms gap after the chord before the prompt starts
  4. App plays the hidden test sequence
  5. App automatically switches to listening mode
- If the user sings a wrong note:
  - show that wrong note on the staff in red
  - keep the detected note visible on the staff for a few seconds
  - pause 3 seconds
  - replay the **same** test sequence
- If "Display Test Notes" is enabled, expected notes are shown in black and the current slot updates to green/red as notes are judged.
- Correct detected notes must be shown on the staff in green immediately.
- Correct detected notes must remain visible on the staff until the next attempt or next test begins.
- Display staff notes as proper note symbols: filled noteheads with stems, plus a sharp/flat accidental before the notehead when needed.
- Retry the same test up to the retry cap (default 5 attempts total).
- If the user gets the test right, or exhausts retries, immediately generate a **fresh** test and continue hands-free.
- The user should be able to keep playing indefinitely without touching the app until they choose Stop/Back.
- The hidden test sequence playback speed is controlled by the selected Home-screen tempo setting.
- Per-test score:
  - first-try success = 100%
  - later successes scale down by attempt number
  - exhausting all retries = 0%
- Session score shown on the Exercise screen is the running average percentage across completed tests in the current session.

Exercise control flow (canonical state machine):
1. **Home -> Exercise**
   - Tapping `Start Exercise` immediately navigates to Exercise and starts a continuous autonomous session.
   - A new test is generated from the selected root, octave, scale, sequence length, tempo, and display-notes mode.
2. **Attempt start**
   - Increment / display the current attempt count for the active test.
   - Reset per-attempt detected-note history.
   - If `Display Test Notes = Hide`, the staff is blank at the start of the attempt.
   - If `Display Test Notes = Show`, draw the target test notes in black before any audio plays.
3. **Prompt playback**
   - Play the tonic triad as a single chord.
   - Wait the post-chord gap.
   - Play the hidden test sequence at the selected BPM.
4. **Auto listening**
   - Transition to listening automatically with no user action.
   - Evaluate live pitch using the same stability / spacing rules as Mic Setup.
   - As each sung note is confirmed:
     - correct note -> render it green on the staff
     - wrong note -> render the detected note red in the current slot / current attempt history
5. **Attempt resolution**
   - If all notes are correct:
     - compute the per-test percentage from the attempt number
     - append a completed test-history record with timestamp, settings, attempt count, success, and score
     - update the running session percentage
     - after the short success delay, generate a fresh test and begin again at Attempt start
   - If any note is wrong:
     - keep the red wrong note visible for the configured delay
     - if retries remain, replay the same test from Attempt start
     - if retries are exhausted, record the failed test with `0%`, update the running session percentage, generate a fresh test, and begin again at Attempt start
6. **Stopping**
   - `Stop Testing`, on-screen Back, or system Back ends the continuous session immediately.
   - If one or more tests were completed, persist the session summary plus per-test history to local storage before returning Home.
   - Do **not** navigate to Results as part of this flow.

---

### Mic Setup Screen

Layout: vertical column, 16dp padding.

```
                        [Mic Setup]        (centred title; system back gesture on iOS/Android;
                                            ← Back button on Desktop)

[24dp space]
"Sing or play a note to test your microphone."   — bodyMedium, centred

[16dp space]
👂 Listening…           — ear emoji (28sp) + "Listening…" label (subheadline semibold, primary colour)
                          always visible while on screen (listening is always active)

[16dp space]
MusicStaff            — 160dp tall, shows rolling note history left to right
                        Notes are placed at fixed 44dp spacing from the LEFT end of the staff
                        Each newly stable note is appended on the right
                        When staff is full (8 notes), oldest scrolls off left, new note appears right
                        Only notes within the selected range are added
                        Max 8 notes visible; history capped at 8
                        Most recent note: ACTIVE colour (blue)
                        Previous notes: EXPECTED colour (filled dark)
                        Empty staff when nothing detected yet
                        Same note repeated after silence is always appended again

[8dp space]
Large note name       — 72sp bold, primary colour when detected, muted "—" when silent
                        (use 56sp if label is 3+ chars, e.g. "C#4")
Hz display            — bodyMedium, muted, shown only when pitch detected

[24dp space]
PitchMeter            — 90dp circle

Mic Setup **starts listening automatically on entry** — there is NO Start Listening button
and NO Stop button. The user exits via system back gesture (iOS/Android) or ← Back (Desktop).

NO test note buttons.
```

The staff visual style, horizontal spacing, and note-detection pipeline are
**shared with the Exercise screen** — both screens use identical detection and display
dynamics. The only differences are what happens after a note is confirmed:
- **Mic Setup**: append the confirmed note to the rolling staff history (no judgement)
- **Exercise**: compare the confirmed note against the expected sequence (see Exercise screen spec)

---

### Results Screen

This screen remains in the codebase for compatibility, but it is **not** used by the continuous testing flow above.

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

Do not rely on this screen for persistence in continuous testing mode.

---

### Progress Screen

Layout: vertically scrollable column, 16dp padding.

```
                        [Progress]         (centred title; system back gesture)

Streak card:
  🔥 N day streak     — prominent display

Session history:
  If empty: "No sessions yet. Complete an exercise to see your progress!"
  Otherwise: list of SessionRecord cards showing:
    Scale name + root note
    Score percentage
    Date
    Sequence length

Recorded tests summary:
  Show total recorded test count and average test score

Recent tests:
  Show recent TestRecord rows/cards with:
    Scale name + root note
    Date/time
    Pass/fail summary with attempts used
    Score percentage
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
staffCenter = staffTop + 2*lineSpacing   (third line = B4, staffPos 6)
noteY = staffCenter - (staffPos - 6) * (lineSpacing / 2)
```
`staff_position()` returns: C4=0, D4=1, E4=2, F4=3, G4=4, A4=5, B4=6, C5=7,
B3=-1, A3=-2, … (diatonic steps from C4, sharps/flats share parent note's position).

**Note horizontal distribution**:
```
noteAreaStart = leftMargin + 20
noteAreaWidth = totalWidth - noteAreaStart - 20
noteStep      = 44dp (fixed)                         [Exercise and Setup screens, left-to-right]
noteX         = noteAreaStart + index*noteStep + noteStep/2
```

**Note symbol rendering**:
- Use a filled oval notehead rotated slightly clockwise (quarter-note appearance)
- Draw a stem for every note:
  - notes below the B4 centre line (`staffPos < 6`) use an upward stem on the right side
  - notes on/above the B4 centre line use a downward stem on the left side
- If the pitch label contains a sharp or flat, draw `♯` or `♭` immediately before the notehead
- Do not draw note-name text beneath the staff notes

**Note colours**:
| State    | Colour  |
|----------|---------|
| EXPECTED | #333333 |
| ACTIVE   | #3F51B5 |
| CORRECT  | #4CAF50 |
| INCORRECT| #F44336 |

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
- Sequence playback interval: `60000 / bpm` milliseconds, where BPM is selected on the Home screen
- Default test tempo: 100 BPM

**Shared pitch detection pipeline** — used identically by both Mic Setup and Exercise screens:
- Sample rate: 44100 Hz
- Buffer size: 4096 samples
- Pass raw f32 PCM to Rust `detect_pitch()`
- Silence threshold: RMS < 0.003 → ignore frame
- Require 3 consecutive frames with the same pitch class (midi % 12) before confirming a note
- After confirming a pitch, do not confirm it again until the pitch class changes or silence resets stability
- The detection and display dynamics (stability rules, note rendering, staff updates) must use the same code path on each platform; only the post-confirmation action differs per screen

**On confirm — Mic Setup**: append the detected note to the rolling staff history; no judgement or comparison.

**On confirm — Exercise**: compare the pitch class of the detected note against the pitch class of the current expected sequence note; render correct (green) or incorrect (red) accordingly.

---

## Data Persistence

Sessions stored as a list of records:
```
{ date: string, scale: string, root: string, score: float, length: int, testsCompleted?: int }
```
- Android: SharedPreferences (JSON)
- iOS: UserDefaults
- Desktop: localStorage or a local file

Every individual completed test must also be stored locally as history for future scoring/progress tuning. Store enough basic result data to reconstruct performance later, including:
```
{
  date: string,
  scale: string,
  root: string,
  score: int,
  length: int,
  attemptsUsed: int,
  maxAttempts: int,
  passed: bool,
  expectedNotes: string[],
  detectedNotes: string[]
}
```

Persistence rules:
- Save a `TestRecord` every time a test ends, whether passed or failed.
- Save the session summary when the user stops/leaves Exercise after completing at least one test.
- Continuous testing mode does **not** show Results before persistence; users later inspect outcomes from Home -> Progress.

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

