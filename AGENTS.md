# Ear Ring — Agent Instructions

## ⚠️ Read This First — Every Session

**Before doing any work on this repository, read this entire file.**
It contains the canonical UI spec, platform rules, build commands, and debugging
procedures. Do not rely on memory alone — this file is the source of truth and is
kept up to date as the project evolves.

**Before making any changes, check for unsynced remote commits:**
```
git fetch origin
git status
```
If the remote is ahead of local, **stop and warn the user** before proceeding.
Do not pull or rebase automatically — let the user decide.

Key things you will find here:
- All UI changes must be applied to **all three platforms** (Android, iOS, Tauri) simultaneously
- Build and run commands for each platform (see **UI Debugging Guide** at the bottom)
- Platform exceptions (e.g. iOS Home screen differs slightly)
- Music staff, pitch meter, colour, and audio specs

---

## ⛔ Git Commit / Push Rules

**Never commit or push unless the user explicitly tells you to.**

- Do not run `git commit` or `git push` on your own initiative, even after completing a task.
- Do not ask "should I commit this?" — wait for the user to say so.
- This applies to every session, regardless of how complete or correct the changes are.

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

## Navigation — Bottom Tab Bar

All platforms use a **persistent 5-tab bottom navigation bar** visible on every screen except Exercise.

| Tab index | Label | Icon |
|-----------|-------|------|
| 0 | Home | 🏠 (Home / house) |
| 1 | Mic | 🎙 (Microphone) |
| 2 | Progress | 📊 (Bar chart) |
| 3 | Settings | ⚙️ (Gear / settings) |
| 4 | Help | ❓ (Help / question mark) |

- The bottom bar is **hidden** during Exercise (Exercise is a push route on the Home stack, not a tab).
- Tapping a tab always navigates to that tab's root screen (not a sub-page of it).
- The previously separate "Mic Setup" and "Progress" buttons on the Home screen are removed; they are accessed via tabs.

---

## Screen Inventory

Every platform must implement all 7 screens:

| Screen | Navigation trigger |
|--------|--------------------|
| Home | App launch / leaving Exercise via Back or Stop; Home tab |
| Exercise | "Start Exercise" button on Home — push route (no tab bar) |
| Mic Setup | Mic tab |
| Results | Reserved legacy screen; **not shown during continuous testing mode** |
| Progress | Progress tab |
| Settings | Settings tab |
| Help | Help tab |

Back navigation must work on Exercise (and Results if reached):
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

[16dp space]
Section label: "Test Type"
Dropdown (outlined, full width): Random Notes | Diatonic Arpeggios (ascend) | Diatonic Arpeggios (desc)
  — testType IDs: 0=Random Notes, 2=Diatonic Arpeggios (ascend), 3=Diatonic Arpeggios (desc)
  — testType 1 (Melody Snippets) code is preserved but not shown in the dropdown
  — In Diatonic Arpeggios mode: Scale dropdown and Sequence Length chips (2, 5–8) are disabled (opacity 0.38); only 3 and 4 are enabled (triad vs seventh chord)
  — In Diatonic Arpeggios mode: Piano range picker is fully interactive (range controls chord placement)
  — In Diatonic Arpeggios mode: chord label (root note + quality + inversion) is shown on the Exercise screen only when "Display Test Notes" is checked
  — In Melody Snippets mode: Scale dropdown and Sequence Length chips are disabled (opacity 0.38)
  — In Melody Snippets mode: Piano range picker is read-only (taps/drags are no-ops)
  — In Melody Snippets mode: range is auto-set by ExerciseScreen to snippet MIDI ± 6 semitones

[12dp space]
Row (equal width, 8dp gap):
  Left half — Section label: "Key"
              Dropdown (outlined, full width of column): C  C#  D  D#  E  F  F#  G  G#  A  A#  B
                — Selecting a new key auto-resets the range to one octave from the new key closest to middle C
  Right half — Section label: "Scale"
               Dropdown (outlined, full width of column): Major | Natural Minor | Dorian | Mixolydian
                 — Scale IDs: 0=Major, 1=Natural Minor, 2=Dorian, 3=Mixolydian (Harmonic Minor removed)
                 — Non-major scales show the implied major key in parentheses, e.g. "Natural Minor (Eb)"
                   when key=C. The label updates dynamically as the Key dropdown changes.
                 — **Disabled (opacity 0.38)** when Test Type = Melody Snippets or Diatonic Arpeggios

[16dp space]
Section label: "Range  (RangeLow – RangeHigh)"   — label updates dynamically with current range
PianoRangePicker
  — Interactive piano keyboard, MIDI 36 (C2) to MIDI 84 (C6), 4 octaves, 29 white keys
  — Horizontally scrollable; white keys 22dp wide × 80dp tall; black keys 14dp wide × 52dp tall
  — Primary-colour handle circles (9dp radius) above each endpoint (rangeStart, rangeEnd)
  — Connected by a primary-colour line; primary highlight on keys within the selected range
  — Handle area: 22dp tall above the keyboard
  — Drag a handle to resize range (minimum span = 12 semitones); tap elsewhere to shift range
  — Default: one octave (12 semitones, inclusive) from rootNote, using the octave closest to middle C
    e.g. root=C → (C4, C5) = MIDI 60–72; root=G → (G3, G4) = MIDI 55–67
  — On first display, scroll position centers the selected range in the viewport

[16dp space]
Section label: "Sequence Length"
Chip row: 2  3  4  5  6  7  8   (single row, equal width)
  — **Disabled (opacity 0.38)** when Test Type = Melody Snippets
  — In Diatonic Arpeggios mode: only chips 3 and 4 are enabled (3=triad, 4=seventh chord); 2, 5–8 are disabled

[16dp space]
Row (same line): ☐ Display Test Notes    ☐ Use Key Signature
  — Both checkboxes on one row with a gap between them
  — "Display Test Notes" default: unchecked (hidden)
  — "Use Key Signature" (keySignatureMode): default unchecked (= Inline Accidentals mode = 0)
  — Checked: conventional key sig after clef; only out-of-key notes get an accidental
  — Unchecked: no key signature drawn; every accidental shown on the note

[32dp space]
[▶ Start Exercise]    — full-width filled primary button, 52dp tall, 18sp
[16dp space]
```

**Removed from Home (now in Settings tab):** Tempo (BPM), Mic Setup button, Progress button.

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
                          - each correctly played note turns its target note green
                          - a wrong note replaces the current target slot with the detected note in red
                        If "Display Test Notes" = Hide:
                          - only detected/played notes are shown on the staff
                        Use the same left-to-right fixed 44dp note spacing as Mic Setup
                        Correct notes: green
                        Wrong notes: red

[8dp space]
👂 Listening…           — ear emoji (28sp) + "Listening…" label (subheadline semibold, primary colour)
                          ALWAYS occupies space in the layout (never causes reflow).
                          Visible only when status = LISTENING; invisible (opacity 0 / visibility:hidden)
                          at all other times. Do NOT use conditional rendering (if/else) — use
                          alpha/visibility so the reserved height stays constant.

[4dp space]
Status text           — bodyLarge, muted colour, centred
  PLAYING:     "Listen carefully…"
  LISTENING:   "Play note N of M"
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
[⏹ Stop Testing]      — full-width filled ERROR colour, 52dp, 17sp — **desktop only**
  - On Android & iOS: use the system back gesture instead (no on-screen Stop button)
  - On desktop: on-screen button required (no system back gesture)
  - Ends the continuous testing session immediately
  - Returns the user to Home
  - Saves the session summary if at least one test was completed

[20dp space]
Current attempt row (if one or more notes were detected this attempt):
  Label: "Current attempt"
  Render played note labels only
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
- If the user plays a wrong note:
  - show that wrong note on the staff in red
  - keep the detected note visible on the staff for a few seconds
  - pause 3 seconds (default, configurable as Wrong-Note Pause in Settings)
  - replay the **same** test sequence
- If "Display Test Notes" is enabled, expected notes are shown in black and the current slot updates to green/red as notes are judged.
- Correct detected notes must be shown on the staff in green immediately.
- Correct detected notes must remain visible on the staff until the next attempt or next test begins.
- Display staff notes as proper note symbols: filled noteheads with stems, plus a sharp/flat accidental before the notehead when needed.
- Retry the same test up to the retry cap (default 5 attempts total, configurable in Settings).
- If the user gets the test right, or exhausts retries, immediately generate a **fresh** test and continue hands-free.
- The user should be able to keep playing indefinitely without touching the app until they choose Stop/Back.
- The hidden test sequence playback speed is controlled by the BPM setting (configured in Settings tab).
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
   - Wait the post-chord gap (default 800ms, configurable in Settings).
   - Play the hidden test sequence at the selected BPM.
4. **Auto listening**
   - Transition to listening automatically with no user action.
   - Evaluate live pitch using the same stability / spacing rules as Mic Setup.
   - As each played note is confirmed:
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
                        [Mic Setup]        (tab — no back button on iOS/Android;
                                            Mic tab on all platforms)

[24dp space]
"Play a note to test your microphone."   — bodyMedium, centred

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
and NO Stop button. The user exits by tapping another tab.

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
  Row:  "N."  |  "Expected: X"  |  "Played: Y"  |  ✓/✗/—
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
                        [Progress]         (tab — no back button)

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

### Settings Screen

Layout: vertically scrollable column, 16dp padding.

```
                        [Settings]         (tab — no back button)

[16dp space]
Section label: "Instrument"
Dropdown (outlined, full width): Piano | Guitar | Transposed Guitar | Soprano Sax | Alto Sax |
                                  Tenor Sax | Trumpet | Clarinet
  — Default: Piano (index 0)
  — Selecting a transposing instrument causes Mic Setup and Exercise screens to display
    written pitch instead of concert pitch (display only — detection stays in concert pitch)
  — Selecting a new instrument resets rangeStart/rangeEnd to one octave from the current root note
    closest to middle C (same rule as changing the Key on the Home screen)

[16dp space]
Section label: "Tempo (BPM)"
Chip row: 60  80  100  120  140   (single row, equal width)
  — Default selection: 100 BPM

[16dp space]
Section label: "Max Retries"
Chip row: 1  2  3  4  5  6  7   (single row, equal width)
  — Default: 5

[16dp space]
Section label: "Mic Sensitivity"
Slider: 1 – 10 (integer steps), default 8
  — Right = more sensitive (picks up quieter sound)
  — Internally maps to silence threshold: threshold = (0.011 − sensitivity × 0.001)
    e.g. sensitivity 8 → threshold 0.003 (default), sensitivity 10 → threshold 0.001 (most sensitive)
  — Current value shown as label (e.g. "8 / 10")

[16dp space]
Section label: "Note Stability (Frames to Confirm)"
Chip row: 1  2  3  4  5  6  7   (single row, equal width)
  — Default: 3

[16dp space]
Section label: "Post-Chord Gap"
Slider: 200ms – 2000ms, step 100ms, default 800ms
  — Gap between chord and test sequence playback
  — Current value shown as label (e.g. "800 ms")

[16dp space]
Section label: "Wrong-Note Pause"
Slider: 500ms – 5000ms, step 500ms, default 3000ms
  — Pause before replaying sequence after a wrong note
  — Current value shown as label (e.g. "3000 ms")
```

All settings persist across app restarts.
- Android: SharedPreferences
- iOS: UserDefaults
- Desktop: localStorage

---

### Help Screen

Layout: vertically scrollable column, 16dp padding.

```
                        [Help]             (tab — no back button)

Sections loaded from the shared Rust core (rust/src/help.md, embedded at compile time).
Each platform calls EarRingCore.helpContent() / cmd_help_content() which returns JSON:
  [{"title":"...","body":"..."},...]
Body text uses \n\n to separate paragraphs. Platforms split on \n\n and render each as a paragraph.
```

**help.md is the single source of truth for help text.** Edit `rust/src/help.md` to change
any help content — it propagates to all three platforms automatically at next build.
Sections start with `## Section Title`; paragraphs are separated by blank lines.

---

## Music Staff Specification

Canvas/SVG element, full width, **160dp/px tall**.

```
lineSpacing = 12dp
staffTop    = height/2 - 2*lineSpacing    (centres the 5-line staff vertically)
noteRadius  = lineSpacing * 0.45
noteAreaStart = max(keySigStartX + 20, keySigEndX)   (dynamic: shifts right when key sig present)
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
All platforms use the same pre-rendered PNG (desktop/public/treble_clef.png, 384×1056px,
transparent background). Generated via Windows GDI+ (StringFormat.GenericTypographic,
600px NotoMusic-Regular.ttf font) — NotoMusic is the font Android's Skia uses to render
U+1D11E, so the glyph shape matches the original Android unicode rendering exactly.
The NotoMusic-Regular.ttf file lives in icon/ (do not delete it; the generator needs it).

Distributed to:
  - desktop/public/treble_clef.png              (Tauri — SVG <image href>)
  - android/.../res/drawable/treble_clef.png    (Android — BitmapFactory.decodeResource)
  - ios/.../Assets.xcassets/treble_clef.imageset (iOS — Canvas Image asset)

Regenerate all three with: cd icon && node gen_desktop_clef.js
(script renders, trims, and copies to all platforms automatically)

Positioning formula — identical on all platforms:
  clefH = lineSpacing * 8       (spans 2 lineSpacings above and below the staff)
  clefW = clefH * (pngW/pngH)   (derived from actual PNG aspect ratio ≈ 0.469)
  x = 2,  y = staffTop - lineSpacing * 2
  keySigStartX = 2 + clefW + 6
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
- Accidental display depends on `keySignatureMode`:
  - **Mode 0 (Inline Accidentals)**: use `preferredMidiLabel(midi, rootChroma)` for key-correct spelling;
    draw `♯` or `♭` before the notehead when the label contains `#` or `b`
  - **Mode 1 (Key Signature)**: after the clef draw the conventional key sig symbols (♯ or ♭) at the
    standard treble-clef staff positions; for each note call
    `accidentalInKey(midi, rootChroma)` → 0=none, 1=♯, 2=♭, 3=♮ and draw that symbol if non-zero

**Accidental symbols — pre-rendered PNG approach (all platforms):**

Sharp (♯) and flat (♭) symbols are rendered as PNG images, **not Unicode text**, so they look
identical on all platforms.  The PNG files are generated by `icon/gen_accidental_symbols.js`
(GDI+/Segoe UI Symbol) and distributed to all platforms.

Colour variants (suffix in filename):
```
flat.png / sharp.png           → #333333  EXPECTED state + key signature
flat_correct.png / sharp_...   → #4CAF50  CORRECT state
flat_wrong.png   / sharp_...   → #F44336  INCORRECT state
flat_active.png  / sharp_...   → #3F51B5  ACTIVE state
```

PNG dimensions (pixels, fixed at generation time):
```
flat.png:  141 × 378   (anchor = belly centre = exactly 50% of height)
sharp.png: 179 × 305   (anchor = bar centre  = exactly 50% of height)
```

Positioning formula — **identical on every platform**:
```
displayH (♭) = lineSpacing * 3.0
displayH (♯) = lineSpacing * 2.0
displayW     = displayH * (pngWidth / pngHeight)   (preserves aspect ratio)

keySigStartX = clefRightEdge + 6
keySigStep   = displayW   (pack symbols left-to-right, no overlap)
keySigEndX   = keySigStartX + keySigCount * keySigStep + 8

imageX (left edge) = keySigStartX + index * keySigStep
imageY (top edge)  = targetStaffLineY - displayH / 2   ← anchor at 50%

For inline note accidentals:
  imageX = noteX - noteHeadWidth*1.25 - displayW/2   (centre just left of notehead)
  imageY = noteY - displayH / 2
```

Regenerate PNGs after any font/size change:
```
cd icon && node gen_accidental_symbols.js
```
Files are written to `desktop/public/`, `android/.../res/drawable/`, and `ios/.../Assets.xcassets/`.
- Do not draw note-name text beneath the staff notes

**Note colours**:
| State    | Colour  |
|----------|---------|
| EXPECTED | #333333 |
| ACTIVE   | #3F51B5 |
| CORRECT  | #4CAF50 |
| INCORRECT| #F44336 |

**Ledger lines** (colour #555555, 1.5px stroke, width = noteRadius*1.65 each side):
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
- Sequence playback interval: `60000 / bpm` milliseconds, where BPM is selected in the Settings tab
- Default test tempo: 100 BPM
- Post-chord gap before test sequence: 800ms (default, configurable in Settings)
- Wrong-note pause before replaying: 3000ms (default, configurable in Settings)

**Shared pitch detection pipeline** — used identically by both Mic Setup and Exercise screens:
- Sample rate: 44100 Hz
- Buffer size: 4096 samples
- Pass raw f32 PCM to Rust `detect_pitch()`
- Silence threshold: RMS < silenceThreshold (default 0.003, configurable in Settings) → ignore frame
- Require N consecutive frames with the same pitch class (midi % 12) before confirming a note (default N=3, configurable in Settings as "Note Stability")
- After confirming a pitch, do not confirm it again until the pitch class changes or silence resets stability
- The detection and display dynamics (stability rules, note rendering, staff updates) must use the same code path on each platform; only the post-confirmation action differs per screen

**On confirm — Mic Setup**: append the detected note to the rolling staff history; no judgement or comparison.

**On confirm — Exercise**: compare the pitch class of the detected note against the pitch class of the current expected sequence note; render correct (green) or incorrect (red) accordingly.

---

## Audio Session Architecture — Platform Rules

These rules exist because of a diagnosed bug where Exercise pitch detection was
unreliable on iOS and desktop while Mic Setup worked perfectly. The root causes were:
1. **Competing engines** — playback engine left running while capture engine started
2. **Session deactivation between cycles** — releasing audio hardware on every retry
3. **Mode flip-flopping** — switching between audio session modes each cycle

**Do not change these patterns without understanding the rules below.**

### iOS (`AVAudioSession`)

- The audio session **must stay active** throughout the Exercise screen (from first note
  played until the user leaves). Do **not** call `setActive(false)` between test attempts.
- `AudioCapture.stop()` only stops the tap and AVAudioEngine. It does NOT deactivate
  the session. Only `AudioCapture.destroy()` (on screen exit) deactivates the session.
- The session runs in `.measurement` category mode throughout — both playback and capture.
  Do **not** switch to `.default` mode for playback. `AVAudioUnitTimePitch` (used for
  pitch-shifting piano samples) works correctly in `.measurement` mode. The old comment
  that `.default` was required was incorrect; it applied to `AVAudioPlayer.rate`, not
  `AVAudioUnitTimePitch`.
- Before starting `AudioCapture`, always call `audioPlayback.stopEngine()` to fully stop
  the playback `AVAudioEngine`. Two concurrently running `AVAudioEngine` instances compete
  for the same hardware routes and degrade microphone input quality.
- `AudioPlayback.stopEngine()` stops and invalidates the engine; `ensureEngineRunning()`
  recreates and restarts it lazily on next playback request.

### Desktop / Tauri (Web Audio API)

- The `AudioContext` and `MediaStream` (microphone handle) **must stay alive** for the
  entire Exercise session. Do **not** call `getUserMedia()` or create a new `AudioContext`
  on each retry — doing so triggers hardware release/reacquire, causing a silent gap that
  the 3-frame stability check cannot distinguish from silence.
- `useAudioCapture.stop()` — pauses detection only (`activeRef = false`). Hardware kept.
- `useAudioCapture.destroy()` — full teardown (close AudioContext, stop MediaStream
  tracks). Call this **only** on component unmount or when the user leaves Exercise.
- `ensureAudioPipeline()` — lazily creates AudioContext + ScriptProcessorNode once and
  reuses across all start/stop cycles within a session.
- `ExerciseScreen` calls `stopCapture()` between retries and `destroyCapture()` on unmount.
- `SetupScreen` calls `destroy()` on unmount only.

### Android

- Android is **architecturally clean** — no fixes needed. `MediaPlayer` handles playback
  (one instance per note, auto-released on completion) and `AudioRecord` handles capture.
  There is no shared audio session concept; the two cannot compete. Changing this
  architecture is not necessary and would likely introduce bugs.

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

## Instrument Transposition

The app supports transposing instruments. The canonical instrument list is defined in Rust
(`music_theory.rs` — `INSTRUMENTS` array) and exposed via FFI to all platforms.

**Transposition is display-only.** Concert pitch is used for all pitch detection, comparison,
key/range settings, and audio playback. Transposition is applied at the last moment before
rendering note labels and staff notes in Mic Setup and Exercise screens.

**Written = Concert + Semitones**

| Instrument         | Semitones | Notes |
|--------------------|-----------|-------|
| Piano              | 0         | Non-transposing |
| Guitar             | 0         | Sounds as written (concert) |
| Transposed Guitar  | +12       | Octave-transposing; written C4 = concert C3 |
| Soprano Sax        | +2        | Bb instrument |
| Alto Sax           | +9        | Eb instrument |
| Tenor Sax          | +2        | Detect A4/440Hz → display B4 |
| Trumpet            | +2        | Bb instrument |
| Clarinet           | +2        | Bb instrument |

The instrument index (0 = Piano) is persisted across restarts on all platforms.

Each instrument has a `range_start` and `range_end` (concert MIDI) in the Rust `InstrumentInfo`
struct, used as a reference. When the user selects a new instrument, all platforms reset
`rangeStart`/`rangeEnd` to **one octave from the current root note closest to middle C**
(same rule as changing the Key on the Home screen — NOT the instrument's hardcoded range).
The JSON from `instrument_list_json()` includes `rangeStart`/`rangeEnd` fields for other purposes
(e.g. initial defaults on first launch), but instrument changes use the key-based formula.

| Instrument         | range_start (MIDI) | range_end (MIDI) |
|--------------------|--------------------|-----------------|
| Piano              | 60 (C4)            | 71 (B4)         |
| Guitar             | 52 (E3)            | 63 (D#4)        |
| Transposed Guitar  | 52 (E3)            | 63 (D#4)        |
| Soprano Sax        | 58 (A#3)           | 69 (A4)         |
| Alto Sax           | 51 (D#3)           | 62 (D4)         |
| Tenor Sax          | 46 (A#2)           | 57 (A3)         |
| Trumpet            | 55 (G3)            | 66 (F#4)        |
| Clarinet           | 55 (G3)            | 66 (F#4)        |

## First Launch Behaviour

On the very first launch of the app (detected via a persistent flag), the app navigates
to the **Help** screen instead of Home. After that, it always starts on Home.

| Platform | Flag key | Storage |
|----------|----------|---------|
| Android  | `"hasLaunched"` | SharedPreferences (`PREFS_NAME`) |
| iOS      | `"hasLaunched"` | UserDefaults |
| Desktop  | `"ear_ring_has_launched"` | localStorage |

---

## Key / Note Name Convention

All chromatic note names use the **circle-of-fifths flat convention**:
`C  Db  D  Eb  E  F  Gb  G  Ab  A  Bb  B`

This is defined in `NoteName::display_name()` in `rust/src/music_theory.rs`.
Android and iOS call `EarRingCore.noteName()` → Rust JNI. Desktop/Tauri has its own
`NOTE_NAMES` array that must also use flats.

Do **not** use sharps (C#/D#/F#/G#/A#) anywhere in note-name display.

---

## iPad Native Layout (iOS)

The iOS app targets **Universal** (`TARGETED_DEVICE_FAMILY = "1,2"`) — both iPhone and iPad.

### Navigation
- **iPhone**: `TabView` with 5 tabs (bottom tab bar)
- **iPad**: `NavigationSplitView` — sidebar with tab buttons on the left, content in the detail column
  - Sidebar uses `Button`-based rows (not `List(selection:)` — that binding initializer is unavailable on iOS)
  - Pushing Exercise from Home via `NavigationStack` collapses the sidebar automatically
  - All 4 orientations enabled (`UISupportedInterfaceOrientations~ipad` in Info.plist)

### iPad detection
```swift
@Environment(\.horizontalSizeClass) var hsc
private var isIPad: Bool { hsc == .regular }
```
iPad (all orientations) has `.regular` horizontal size class. iPhone always has `.compact`.

### Landscape detection (use GeometryReader — NOT verticalSizeClass)
`verticalSizeClass == .compact` only fires on iPhone landscape; on iPad both orientations are `.regular`/`.regular`.
Use `GeometryReader` to compare actual dimensions:
```swift
GeometryReader { geo in
    if isIPad && geo.size.width > geo.size.height {
        iPadLandscapeLayout
    } else {
        portraitLayout
    }
}
```

### Adaptive sizing values
| Property | iPhone | iPad |
|----------|--------|------|
| Staff height | 160 pt | 220 pt |
| Pitch meter size | 90 pt | 130 pt |
| Piano `keyScale` | 1.0 | 1.35 |
| Home content `maxWidth` | unlimited | 680 pt (centred) |

### MusicStaffView
`lineSpacing` is adaptive: `size.height * 0.075`
- At 160 pt: lineSpacing = 12 pt (iPhone)
- At 220 pt: lineSpacing = 16.5 pt (iPad)
All downstream values (staffTop, noteRadius, stems, accidentals) derive from lineSpacing.

### PitchMeterView
Uses `GeometryReader` internally — fills whatever `.frame()` the caller sets.
Font size = `min(w,h) * 0.22` (or `0.18` for 3+ char labels).

### PianoRangePickerView
`keyScale: CGFloat = 1.0` parameter scales all key dimensions:
- `whiteKeyW = 22 * keyScale`, `blackKeyW = 14 * keyScale`, `whiteKeyH = 80 * keyScale`, etc.
- C-label font size = `8 * keyScale`
- At `keyScale=1.35` total piano width ≈ 1452 pt — horizontal scroll always needed.

### ExerciseView — iPad landscape layout
Two-column `HStack`: staff+status+attempt on left (flexible), pitch meter+stop on right (fixed width = `meterSize + 48`).
Portrait layout unchanged; shown on iPad portrait and all iPhone orientations.

---



### iOS — Home Screen title row
SwiftUI cannot directly reference the app icon from `Assets.xcassets/AppIcon` as a UI image.
**Exception:** Use `"Ear Ring 🎵"` as a plain bold Text title (32pt, primary colour) instead of
the icon+text row. All other screens and elements must match the spec.

---

## Melody Manager (Developer Tool)

The Melody Manager is a **standalone Tauri app** at `melody-manager/` used to vet,
edit, and import melodies into the shared `rust/src/melodies.txt` library.
It is **not** part of the shipping app — it is a developer-only tool.

**Full documentation:** `docs/melody-manager.md`

Key facts:
- Run with: `cd melody-manager && cargo tauri dev`
- Exports directly to `rust/src/melodies.txt` (relative path from `melody-manager/`)
- After export, run `cargo test` to verify the library compiles correctly
- Decisions (keep/discard/later) and octave shifts persist in `localStorage` between sessions
- The `✏ Edit ABC` button allows editing any tune's notes via inline ABC notation
- The `🎤 Record` import tab transcribes melodies played into the microphone using the shared Rust YIN pitch detector

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

Bottom nav tab bar tap targets (approx, bottom of 1080×2400 screen):
- Home tab:     (108, 2340)
- Mic tab:      (324, 2340)
- Progress tab: (540, 2340)
- Settings tab: (756, 2340)
- Help tab:     (972, 2340)

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

**Publish to Play Store internal testing:**
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

