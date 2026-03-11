# Ear Ring — Agent Instructions

## UI Consistency Rule

**ALL platform versions of Ear Ring must have the same UI design.**

The canonical reference implementation is the **Android app** (`android/` directory).
When building or modifying any platform (iOS, desktop/Tauri, web, etc.) you must
replicate the Android UI exactly unless there is an explicit per-platform instruction
in this file overriding a specific element.

If you are given explicit instructions to make the UI different on a specific platform,
document that exception in the **Platform Exceptions** section at the bottom of this file.

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
MusicStaff            — 160dp tall, shows live detected note as ACTIVE (blue)
                        Empty staff (no note) when nothing detected

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
leftMargin  = 60px (space for treble clef)
noteRadius  = lineSpacing * 0.45
```

**5 horizontal staff lines** (colour #333333, 1.5px stroke):
```
line 0 = staffTop + 0*lineSpacing
line 1 = staffTop + 1*lineSpacing
...
line 4 = staffTop + 4*lineSpacing   ← bottom line
```

**Treble clef** Unicode U+1D11E (𝄞), 56sp, drawn at x=4, y=staffTop - lineSpacing*1.5.

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
noteStep      = noteAreaWidth / max(noteCount, 1)
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
