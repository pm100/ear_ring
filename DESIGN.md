# Ear Ring — Design & Product Spec

This file is the canonical **product spec**: screen layouts, navigation, the music
staff and pitch-meter rendering rules, colours, audio behaviour, persisted data
shapes, and the instrument/transposition tables. It's the "what the product looks
like and does," kept accurate as the app evolves.

For engineering **process rules** — commit/push, keeping logic in the shared Rust
core, applying UI changes to all three platforms simultaneously — see **AGENTS.md**,
which you should read first every session. That file's UI Consistency Rule requires
this file to be kept accurate:

**After any UI change — sizes, positions, colours, layout, or new elements — update
the relevant section here before considering the task complete.** This keeps the
spec accurate for future agents.

Per-platform exceptions (e.g. iOS's Home screen title row workaround) are documented
inline within the relevant section below, not in one consolidated list.

---

## Settings Architecture (Rust Core)

`rust/src/settings.rs` is AGENTS.md's Shared Logic Rule applied to the ~24 exercise
settings (root note, range, scale, tempo, retries, detection tuning, instrument, test
type, ...). Three stateless functions, string JSON in and out:
- `defaults_json(platform)` — the default settings. Per-platform overrides are the
  exception, not the rule — currently just iOS's `framesToConfirm` (2 vs. 3 elsewhere),
  tuned together with its mic gain boost.
- `normalize_json(input, platform)` — tolerant load: fills missing/invalid fields with
  defaults, clamps numbers, drops unknown fields, migrates legacy `testType` values.
  Never fails, so it's also how each platform upgrades whatever it already had stored.
- `apply_json(current, action, platform)` — applies one action (`set`, `setRootNote`,
  `setRange`, `setInstrument`, `setTestType`, `reset`) and returns the new settings.
  This is where instrument-snapping, range-snapping and the diatonic sequence-length
  rule live now — not duplicated per platform.

Exposed via C FFI (`ear_ring_settings_defaults/normalize/apply` + `ear_ring_free_string`)
and Android JNI, and as three Tauri commands on desktop.

**All three platforms are switched over** (one JSON blob persisted per platform; screens
dispatch actions instead of computing the next settings themselves). iOS's
`ExerciseModel.swift` exposes the old 24 property names as computed proxies over a single
`@Published private var settingsJson: String` — reads decode it, writes dispatch a JSON
action through `EarRingCore.settingsApply`. Two call sites in `SettingsView.swift`
(the Instrument and Intro Sound pickers) use SwiftUI's `$model.x` binding sugar, which
needs a real `@Published` property; since those two are now computed, they use a manual
`Binding(get:set:)` instead — the only view-level change the port required.

---

## Navigation — Primary Navigation

All platforms provide the same five persistent primary destinations. There are two
navigation paradigms, chosen by device class, not live orientation:
- **Phone (Android, iPhone)**: portrait-first UI, bottom tab bar.
- **Wide (iPad, desktop/Tauri)**: landscape-style UI, left sidebar with the same five
  destinations. iPad keeps this sidebar in every physical orientation it supports
  (see "iPad Native Layout" below) — it's a fixed design choice for the device class,
  not something that flips based on how the device is currently held.

The primary navigation is visible on every screen except Exercise.

| Tab index | Label | Icon |
|-----------|-------|------|
| 0 | Home | 🏠 (Home / house) |
| 1 | Mic | 🎙 (Microphone) |
| 2 | Progress | 📊 (Bar chart) |
| 3 | Settings | ⚙️ (Gear / settings) |
| 4 | Help | ❓ (Help / question mark) |

All five icons render at the same solid/filled weight — e.g. Android uses
`Icons.Filled.BarChart` for Progress, not `Icons.AutoMirrored.Filled.ShowChart`,
whose thin zigzag-line glyph reads as hairline next to the other four tabs' solid
shapes despite nominally being from the same "Filled" icon family (fixed during
the UI review, issue #30 — check this each time a tab icon changes).

- The bottom bar/sidebar is **hidden** during Exercise (Exercise is a push route on the Home stack, not a tab).
- Tapping a tab/sidebar item always navigates to that destination's root screen (not a sub-page of it).
- The previously separate "Mic Setup" and "Progress" buttons on the Home screen are removed; they are accessed via tabs.

---

## Screen Inventory

Every platform must implement all 6 screens:

| Screen | Navigation trigger |
|--------|--------------------|
| Home | App launch / leaving Exercise via Back or Stop; Home tab/sidebar item |
| Exercise | "Start Exercise" button on Home — push route (no primary navigation) |
| Mic Setup | Mic tab/sidebar item |
| Progress | Progress tab/sidebar item |
| Settings | Settings tab/sidebar item |
| Help | Help tab/sidebar item |

(A separate "Results" screen — a post-test score summary with Try Again/New
Exercise/View Progress buttons — existed on all 3 platforms but was pure dead
code: nothing ever navigated to it, on any platform, since Exercise became a
continuous hands-free loop that only exits via Stop/Back. Deleted during the
UI review, issue #30, rather than continuing to carry unreachable code.)

Back navigation must work on Exercise:
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
Dropdown (outlined, full width): Random Notes | Diatonic Arpeggios
  — testType IDs: 0=Random Notes, 2=Diatonic Arpeggios. Legacy stored values 1 (removed
    Melody Snippets mode) and 3 (removed separate descending-arpeggio mode) are still
    accepted on load and silently remapped — 1→0, 3→2 (`normalize_json` in
    `rust/src/settings.rs`) — but neither is selectable in the UI any more.
  — In Diatonic Arpeggios mode: ascending vs. descending is randomized per test, not a
    user choice (issue #16) — each triad's direction is picked fresh every attempt.
  — In Diatonic Arpeggios mode: Sequence Length is fully locked — the Rust core forces
    it to 3 (`DIATONIC_SEQUENCE_LENGTH`) and every chip is disabled (opacity 0.38),
    including the "3" chip itself, since there is no user choice to make.
  — In Diatonic Arpeggios mode: the Scale dropdown stays enabled — it still determines
    the triad's quality (major/minor/diminished follows the scale).
  — In Diatonic Arpeggios mode: the Range picker stays fully interactive (range controls
    chord placement).
  — In Diatonic Arpeggios mode: a chord label (root note + quality — root position only,
    no inversions yet, see `docs/roadmap.md`) is shown on the Exercise screen's title
    area only when "Display Test Notes" is checked.

[12dp space]
Row (equal width, 8dp gap):
  Left half — Section label: "Key"
              Dropdown (outlined, full width of column): C  Db  D  Eb  E  F  Gb  G  Ab  A  Bb  B
                — Selecting a new key auto-resets the range to one octave from the new key closest to middle C
  Right half — Section label: "Scale"
               Dropdown (outlined, full width of column): Major | Natural Minor | Dorian | Mixolydian
                 — Scale IDs: 0=Major, 1=Natural Minor, 2=Dorian, 3=Mixolydian (Harmonic Minor removed).
                   Locrian (id 4) is still fully implemented in the Rust core (intervals, sequence
                   generation, key-sig math) but is deliberately not offered in this dropdown for now.
                 — Every scale is built **directly on the selected root** (a "parallel" mode, not
                   relative) — e.g. key=C + Natural Minor tests C Natural Minor (C D Eb F G Ab Bb), not
                   the relative A Natural Minor. This applies to test-note generation, the opening triad,
                   and diatonic arpeggios alike.
                 — Non-major scales show their **implied major key** in parentheses — the major key that
                   shares the scale's exact pitch classes — e.g. "Natural Minor (of Eb)" when key=C (C Natural
                   Minor's notes are exactly Eb major's notes), "Dorian (of Bb)", "Mixolydian (of F)". This
                   implied key also drives the staff key signature and note spelling. The label updates
                   dynamically as the Key dropdown changes.
                 — Stays enabled in every Test Type, including Diatonic Arpeggios (it still selects
                   the triad's quality there — see above).

[16dp space]
Section label: "Range" (plain — does not embed the current range values; those live
                        in the row below)
Row (full width, left-aligned like every other Home block — this was previously the
     one row centred as a floating cluster instead, fixed during the UI review, issue
     #30): two typed text fields ("Start"/"End", labeled — Android's floating
     OutlinedTextField label, iOS's small caption above each field, desktop's caption
     above each `<input>` — since a plain bordered box with no label reads as static
     display, not editable text entry) showing note labels like "C4"/"C5", editable
     directly by typing a note name; plus a small outlined 🎹 button matching the
     fields' own corner radius (6dp/6pt small-rounded-rect — NOT Material3's default
     stadium/pill button shape, an outlier previously left unfixed on Android) that
     opens a full-screen piano keyboard picker (below) for dragging the range visually
     instead of typing it.
  — Typed value must be a valid note name and keep the range at least 12 semitones
    wide, or the edit reverts to the last valid value on commit (Enter/blur)

[16dp space]
PianoRangePicker (full-screen, opened via the 🎹 button above)
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
Chip row: 1  2  3  4  5  6  7  8   (single row, equal width)
  — "1" plays/tests a single random note (no repeat-rejection applies, since there's only one note)
  — **Fully locked (opacity 0.38, all 8 chips disabled)** when Test Type = Diatonic Arpeggios —
    sequence length is forced to 3 (a triad) with no user choice; the chip still shows "3"
    highlighted so the locked value is visible, just not tappable

[32dp space]
[▶ Start Exercise]    — full-width filled primary button, 52dp tall, 18sp
[16dp space]
```

**Removed from Home (now in Settings tab, "Display" section):** Tempo (BPM),
Mic Setup button, Progress button, the "Display Test Notes" checkbox, and the
"Use Key Signature" checkbox. All three platforms implement both checkboxes
under Settings → Display, not Home — see the Settings Screen section below.
(Filed as issue #26 against this stale doc; closed as not-a-bug — see that
issue for the resolution.)

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

[20dp space]
Current attempt row (if one or more notes were detected this attempt):
  Label: "Current attempt"
  Render played note labels only
  Correct labels: green
  Wrong labels: red
  - Sits ABOVE the button row (not below it) — feedback on what was just played
    reads before the controls, not after (fixed during the UI review, issue #30)

[24dp space]
[↻ Repeat] [■ Stop Testing]   — button row, 52dp tall, 17sp, equal width — **all platforms**
  - Repeat: TONAL fill (light tint of primary, e.g. Indigo 50 #E8EAF6 / Android
    primaryContainer), primary-coloured text/icon, no border. Enabled only while
    LISTENING. Replays the current test without counting against attempts.
  - Stop Testing: full-width filled PRIMARY colour (same as Start Exercise)
  - Repeat is tonal rather than a bare outline specifically because it sits next
    to Stop Testing's solid fill — a plain outline next to a solid button reads as
    the "colorless"/lesser one rather than a deliberate secondary action (fixed
    during the UI review, issue #30)
  - "■" (Geometric Shapes, same block as "▶" on Home's Start Exercise), not "⏹"
    (Miscellaneous Technical) — the latter renders as a colour emoji by default on
    most platforms, an outlier next to "▶" and Repeat's "↻" (Arrows), both plain
    monochrome glyphs with no emoji presentation (fixed during the UI review,
    issue #30)
  - Stop Testing is filled with the app's primary colour (matching Start
    Exercise), NOT the danger red used for Settings' Reset to Defaults or
    Progress' Clear All Progress — stopping a test is a normal, reversible action
    (it saves the session), not a destructive one, and red here also failed for
    red/green colour-blind users, who couldn't distinguish it from a normal action
    by colour alone (fixed during the UI review, issue #30 — an earlier pass had
    mistakenly given it error styling)
  - On Android & iOS, the system back gesture/button also ends the session (same
    exit path as the on-screen Stop Testing button) — but the on-screen button is
    shown too, since it's not obvious from the UI that back-navigation exits an
    active test
  - Stop Testing ends the continuous testing session immediately, returns the
    user to Home, and saves the session summary if at least one test was completed
```

Exercise dynamics:
- Entering Exercise automatically starts the test loop. There is **no** Play button and **no** Start Listening button.
- For each test:
  1. Staff clears to empty
  2. App plays a piano triad derived from the selected root/scale **as a chord** (simultaneous notes), not as an arpeggio
     — triad quality follows the scale: major triad for Major/Mixolydian, minor triad for Natural Minor/Dorian,
       diminished triad for Locrian
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
- Display staff notes as proper note symbols: noteheads with stems (duration-aware in melody mode — see Music Staff Specification), plus a sharp/flat accidental before the notehead when needed.
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
   - Play the tonic triad as a single chord (major/minor/diminished quality follows the selected scale — see above).
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

---

### Mic Setup Screen

Layout: vertical column, 16dp padding, **fits entirely without scrolling** — every
element on this screen was sized/chosen deliberately to fit in the viewport at once
(no `ScrollView`/`verticalScroll` on any platform), since the Pitch Detection controls
below need to stay visible alongside the staff/meter while the user is actively testing.

```
                        [Mic Setup]        (tab — no back button on iOS/Android;
                                            Mic tab on all platforms)

[16dp space]
"Play a note to test your microphone."   — bodyMedium, centred

[12dp space]
👂 Listening…           — ear emoji (28sp) + "Listening…" label (subheadline semibold, primary colour)
                          always visible while on screen (listening is always active)

[12dp space]
MusicStaff            — 130dp tall on phones (160dp on iPad/desktop — trimmed from
                        the original 160dp on phones to help this screen fit
                        without scrolling once Pitch Detection controls were added
                        below), shows rolling note history left to right
                        Notes are placed at fixed 44dp spacing from the LEFT end of the staff
                        Each newly stable note is appended on the right
                        When staff is full (8 notes), oldest scrolls off left, new note appears right
                        Only notes within the selected range are added — read as "where am I
                        in my configured range", not "what can the mic hear"
                        Max 8 notes visible; history capped at 8
                        Most recent note: ACTIVE colour (blue)
                        Previous notes: EXPECTED colour (filled dark)
                        Empty staff when nothing detected yet, or after tapping Clear
                        Same note repeated after silence is always appended again

Right below the staff, right-aligned: a plain-text `Clear` button — clears only the
staff history above (not the live meter, which keeps tracking whatever the mic hears
next). Associated with the staff by position, not placed in the title row.

[10dp space]
TunerMeter             — semicircular guitar-tuner-style dial (replaced the old
                        PitchMeter circle here — PitchMeter is still what the
                        Exercise screen uses; see the Pitch Meter Specification
                        section below for both). A needle sweeps continuously with
                        the live pitch: green/amber/red bands at ±5¢/±20¢/±50¢ from
                        dead-on, note name + optional written/concert dual label
                        below the dial, and a cents readout ("in tune" or "+n¢"/"-n¢")
                        below that. Unlike the rest of the detection pipeline it
                        reads every frame's raw Hz directly — not gated behind the
                        note-stability confirmation used everywhere else — so it
                        responds instantly like a real clip-on tuner. There is no
                        user-facing toggle between this and PitchMeter; which
                        widget appears is fixed per screen.

[12dp space]
Mic Sensitivity — the only detection control always visible (no chevron, no
                        section heading — just its own label), since it's the one
                        control most people ever need to touch. Slider, 1–10
                        integer steps, default 8; internally maps to silence
                        threshold via threshold = 0.011 − sensitivity × 0.001.

`Advanced` button/disclosure — Android via a modal bottom sheet, iOS via a sheet,
                        Desktop via a collapsible section below Mic Sensitivity.
                        Everything else detection-related lives here, not always-on:
                        Chip row "Note Stability (frames to confirm)": 2 3 4 5, default 3.
                        Chip row "Mic Warmup Frames": 0 1 2 3 4 5 6, default 4.
                        Chip row "Grace Frames": 0–6, default from the instrument table (Piano=3).
                        Toggle "Octave Correction": default from the instrument table (Piano=false).
                        Slider "YIN Threshold": 0.05–0.30, default 0.15.
                        Slider "Pitch Tolerance (cents)": 50–150, default from the instrument
                          table — **only shown for the currently-selected instrument if it's
                          premium** (currently just the three Voice instruments; see
                          Instrument Transposition below). Hidden entirely for every
                          non-premium instrument, since a fixed pitch tolerance is meaningless
                          for them.
                        On Android/iOS the base Mic Setup screen must remain non-scrolling,
                        with Mic Sensitivity and the Advanced trigger staying above the
                        bottom navigation.

Mic Setup **starts listening automatically on entry** — there is NO Start Listening button
and NO Stop button. The user exits by tapping another tab.

NO test note buttons.
```

The staff visual style, horizontal spacing, and note-detection pipeline are
**shared with the Exercise screen** — both screens use identical detection and display
dynamics. The only differences are what happens after a note is confirmed:
- **Mic Setup**: append the confirmed note to the rolling staff history and drive the pitch meter; no judgement or comparison
- **Exercise**: compare the confirmed note against the expected sequence (see Exercise screen spec)

**Pitch Detection lives here, not in Settings** — this is the one screen that gives live
feedback on what the mic actually hears, so sensitivity/stability/warmup can be tuned by ear
against that feedback instead of adjusted blind in a static settings list (moved from
Settings during the UI review, issue #30). Changes here persist immediately, the same as
everywhere else these values are edited — Android reads/writes them through the shared
`ExerciseViewModel` (already in scope at this screen's nav-host call site, same pattern as
`SettingsScreen`); iOS reads/writes `ExerciseModel`'s `@Published` properties directly (this
screen already holds an `@EnvironmentObject` reference to it); desktop takes a new
`onUpdateSettings` callback prop, matching `SettingsScreen`'s.

---

### Progress Screen

Layout: vertically scrollable column, 16dp padding.

```
                        [Progress]         (tab — no back button)

Streak card:
  🔥 N day streak     — same plain card treatment as the recorded-tests card below
                        it (an earlier iteration tinted this one with the primary
                        colour while the other stayed a plain surface, which made
                        the plain one read as "disabled" by comparison — fixed
                        during the UI review, issue #30)

Recorded tests summary:
  Show total recorded test count and average test score

Session history:
  If empty:
    "No sessions yet. Complete an exercise to see history!"
    [▶ Start your first exercise]  — full-width filled PRIMARY button below the
                                     message, routes to Home (fixed during the UI
                                     review, issue #30 — previously there was no
                                     way to get to Home from an empty Progress
                                     screen except the tab bar)
  Otherwise: list of tappable SessionRecord cards showing:
    Scale name + root note
    Score percentage
    Date, test count, sequence length (one line)

  Tapping a session drills into a detail view listing that session's individual
  TestRecords (matched via SessionRecord.sessionId == TestRecord.sessionId), each
  showing scale name + root note, date/time, pass/fail summary with attempts used,
  expected/detected notes, and score percentage. A back affordance returns to the
  session list. There is no separate always-visible "Recent Tests" list — test
  detail only appears inside a session's drill-down. Sessions persisted before
  sessionId existed have no matching tests; their detail view shows "No individual
  test details recorded for this session."

Clear All Progress:
  Hidden entirely when there are no sessions yet — there's nothing to clear, and
  it was previously the most visually prominent control a brand-new user saw
  (fixed during the UI review, issue #30). Appears (danger red — see Exercise
  Screen's Stop Testing note on error vs errorContainer) once at least one
  session exists.
```

---

### Settings Screen

Layout: vertically scrollable column, 16dp padding, centered bold title ("Settings")
at the top — no back button, since it's a bottom-tab/sidebar destination, not a
pushed screen (Android: matches `ProgressScreen.kt`'s title treatment; iOS: same
centered-bold style since the native nav bar is hidden on every screen; desktop:
shows the title via its standard `screen-header` bar, which also has a back button
there since desktop's Settings is reached by navigating away from Home rather than
via a persistent tab).

A flat list of three collapsible sections, all starting collapsed — no group
headers above them (an earlier iteration grouped sections under "User"/"Advanced"
headings, but with the section count this small the grouping added a layer of
structure without adding clarity, so it was dropped; see the UI review, issue
#30). Tapping a section's header row toggles it — the header shows only the
section title, with no value summary (an earlier iteration also tried a
"Title · current value" summary on each collapsed header, but it didn't scale
once a section held more than one or two settings, so that was dropped too).
Expanded content is indented with a thin left rule, and every section (collapsed
or expanded) is separated from the next by a divider.

Each section groups several related settings under one heading — deliberately
fewer, larger sections rather than one section per setting, so the accordion
doesn't fragment into a dozen near-empty entries:

- **Instrument & Playback** — outlined dropdown, full width: Piano | Guitar |
  Transposed Guitar | Soprano Sax | Alto Sax | Tenor Sax | Trumpet | Clarinet
  (default: Piano, index 0), plus Soprano Voice | Alto Voice | Tenor Voice
  **only for a premium user** — the three Voice instruments are filtered out of
  the dropdown entirely otherwise (see Premium below), not just disabled.
  Selecting a transposing instrument causes Mic Setup and Exercise screens to
  display written pitch instead of concert pitch (display only — detection stays
  in concert pitch). Selecting a new instrument snaps rangeStart/rangeEnd, Grace
  Frames, Octave Correction, and Pitch Tolerance to that instrument's row in the
  Rust `INSTRUMENTS` table (`setInstrument` action in `rust/src/settings.rs`) —
  NOT the key-based one-octave-from-root formula (that only applies when the Key
  itself changes on Home). Below the dropdown, a chip row for Tempo
  (BPM): 60 80 100 120 140, default 100.
- **Sound & Display** — checkbox "Play Pass/Fail Sounds" (a chime when a test is
  passed, a different tone when it fails); an "Intro Sound" dropdown: Root Note |
  Chord | Arpeggio | Scale | None (what plays before each test; default: Chord);
  then two checkboxes, "Display Test Notes" (default unchecked/hidden) and "Use Key
  Signature" (`keySignatureMode`; default unchecked = Inline Accidentals mode = 0;
  checked = conventional key signature after the clef with only out-of-key notes
  getting an accidental — moved here from Home, see issue #26).
- **Exercise & Timing** — chip row "Max Retries" (attempts per test before moving
  on): 1 2 3 5 8 10, default 5. Chip row "Retry Same Note" (tries allowed on a wrong
  note before the whole test restarts — each retry costs a few points; 0 = off):
  0 1 2 3 4 5, default 2. Slider "Pause Before Playing" (gap between chord and test
  sequence): 400ms–2000ms, step 100ms, default 800ms. Chip row "Wrong Note Pause"
  (how long to display a wrong note before replaying): 1s 2s 3s 5s, default 3s.

Pitch Detection (Mic Sensitivity, Note Stability, Mic Warmup Frames) lives on the
Mic Setup screen, not here — see the Mic Setup Screen section above for why.

**Premium** — a `premium` flag on each `InstrumentInfo` row gates two things: the three
Voice instruments (filtered out of the Instrument dropdown entirely for a non-premium
user) and the Pitch Tolerance advanced control on Mic Setup (hidden unless the
*currently selected* instrument is premium). There is no real entitlement/billing system
yet — `isPremium` is a plain boolean held in app state, and the only way to set it true
today is a dev-build-only "Debug: Premium" checkbox at the bottom of this screen on
every platform (desktop: `import.meta.env.DEV`; Android/iOS: their own debug-build
checks) — excluded from production builds. Wire this up for real (purchase/subscription
flow) before shipping the premium tier.

Below the sections: "Reset to Defaults" button (confirmation dialog before it takes
effect; resets settings only, progress history is unaffected), then
"Build {gitHash}" (short 7-char git commit hash, muted, centered — sourced from the
shared Rust core's `GIT_HASH` const, embedded by `rust/build.rs` from
`git rev-parse --short=7 HEAD` at compile time; "unknown" if git wasn't available;
exposed via `EarRingCore.gitHash()` on Android/iOS, `cmd_git_hash` on desktop).

All settings persist across app restarts: Android via SharedPreferences, iOS via
UserDefaults, desktop via localStorage.

---

### Help Screen

Layout: vertically scrollable column, 16dp padding. A centered bold "Help" title
(same treatment as Settings) sits above the first section on Android and iOS;
desktop shows it via its standard `screen-header` bar.

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

#### Setup Assistant (top of the Help screen)

A chat above the help sections, identical on all three platforms (Android `ui/AssistantChat.kt`,
iOS `views/AssistantChatView.swift`, desktop `components/AssistantChat.tsx`).

```
Ask about setup                           (16 sp bold, primary colour)
Describe what you want, e.g. “I want a chance to correct a wrong note”. Your question and
current settings are sent to a server to get an answer.        (footnote, secondary colour)
                          [ I want a chance to correct a wrong note ]   user bubble, right, primary
[ Give yourself more tries.                        ]   assistant bubble, left, light neutral
[ ┌ Retry Same Note: 2 → 5      ┐                  ]   confirm card (only while pending)
[ └ [Apply]  [Not now]          ┘                  ]
[ Ask how to set something up                 ] [Send]   input (max 500 characters) + Send
3 questions left today                            (caption)
```

- Nothing changes until **Apply**. Apply re-validates the proposal against the *current*
  settings in the Rust core and dispatches each returned action through the normal settings
  path, so a setting changed by hand in the meantime is not overwritten; if nothing is left to
  change the bubble says `Already up to date.`
- After Apply: `Applied. You can review it in Settings.`; after Not now: `No changes made.`;
  when the reply passed feedback on: `Sent as feedback, thanks.`
- Errors (offline, daily limit reached, server problem) appear as a light-red bubble with the
  core's wording and a `Try again` button; the conversation is kept.
- The transcript is in memory only and is discarded when the user leaves the Help screen.
- Premium comes from the existing per-platform `isPremium` flag; the assistant tells free users
  that premium-only options (the Voice instruments) are premium features instead of proposing them.
- Everything except rendering lives in `rust/src/assistant.rs`: the request body, what an HTTP
  status means, which proposed changes are valid, and the error wording. The proxy address is
  `assistant::PROXY_URL`. Design: `docs/superpowers/specs/2026-09-30-setup-assistant-design.md`.

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
  - ios/.../Images.xcassets/treble_clef.imageset (iOS — Canvas Image asset)

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
- Use an oval notehead rotated slightly clockwise (-20°)
- Stem direction:
  - notes below the B4 centre line (`staffPos < 6`) use an upward stem on the right side
  - notes on/above the B4 centre line use a downward stem on the left side

**Duration-based rendering** (all platforms — desktop `MusicStaff.tsx`, Android `MusicStaff.kt`,
iOS `MusicStaffView.swift`). Each staff note carries an optional `duration` in beats
(1.0 = quarter). `duration` absent/null → render as a quarter note (random mode unchanged).
Melody mode passes the snippet's per-note durations for expected and correct notes;
incorrect notes render as plain quarters.

| Duration (beats) | Symbol         | Notehead | Stem | Flags | Dot |
|------------------|----------------|----------|------|-------|-----|
| ≥ 3.5            | whole          | open     | no   | 0     | no  |
| ≥ 2.5            | dotted half    | open     | yes  | 0     | yes |
| ≥ 1.75           | half           | open     | yes  | 0     | no  |
| ≥ 1.25           | dotted quarter | filled   | yes  | 0     | yes |
| ≥ 0.875          | quarter        | filled   | yes  | 0     | no  |
| ≥ 0.625          | dotted eighth  | filled   | yes  | 1     | yes |
| ≥ 0.375          | eighth         | filled   | yes  | 1     | no  |
| < 0.375          | sixteenth      | filled   | yes  | 2     | no  |

- **Open notehead**: white fill + 1.5px stroke in the note colour
- **Augmentation dot**: filled circle, radius `noteRadius*0.3`, centred at `noteX + noteHeadRx*1.6`
- **Flag**: cubic Bézier from the stem end, 1.5px stroke, round cap; second flag offset
  `lineSpacing*0.75` back along the stem. Stem-up flags curve right/down; stem-down mirror.
- Accidental display depends on `keySignatureMode`:
  - **Mode 0 (Inline Accidentals)**: use `preferredMidiLabel(midi, rootChroma)` for key-correct spelling;
    draw `♯` or `♭` before the notehead when the label contains `#` or `b`
  - **Mode 1 (Key Signature)**: after the clef draw the conventional key sig symbols (♯ or ♭) at the
    standard treble-clef staff positions; for each note call
    `accidentalInKey(midi, rootChroma)` → 0=none, 1=♯, 2=♭, 3=♮ and draw that symbol if non-zero

**Accidental symbols — pre-rendered PNG approach (all platforms):**

Sharp (♯), flat (♭), and natural (♮) symbols are rendered as PNG images, **not Unicode
text**, so they look identical on all platforms. The PNG files are generated by
`icon/gen_accidental_symbols.js` (GDI+/Segoe UI Symbol) and distributed to all platforms.
The natural symbol only ever appears in key-signature mode (`accidentalInKey` case 3 —
an out-of-key note cancelling the signature's implied sharp/flat); inline-accidental mode
(mode 0) never needs it, since there's no signature to cancel.

Colour variants (suffix in filename):
```
flat.png / sharp.png / natural.png       → #333333  EXPECTED state + key signature
flat_correct.png / sharp_... / natural_... → #4CAF50  CORRECT state
flat_wrong.png   / sharp_... / natural_... → #F44336  INCORRECT state
flat_active.png  / sharp_... / natural_... → #3F51B5  ACTIVE state
```

PNG dimensions (pixels, fixed at generation time — regenerate and update these if the
generator's font/size ever changes):
```
flat.png:    141 × 435   (anchor = belly centre = exactly 50% of height)
sharp.png:   179 × 305   (anchor = bar centre  = exactly 50% of height)
natural.png: 117 × 305   (anchor = bar centre  = exactly 50% of height)
```

Positioning formula — **identical on every platform**:
```
displayH (♭) = lineSpacing * 3.0
displayH (♯) = lineSpacing * 2.0
displayH (♮) = lineSpacing * 2.0
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
Files are written to `desktop/public/`, `android/.../res/drawable/`, and `ios/.../Images.xcassets/`
(NOT `Assets.xcassets` — that catalog exists but was never wired into the Xcode project's
Resources build phase, so anything placed there silently never renders on iOS; see issue #33).
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

Two different live-pitch widgets exist; which one appears is fixed per screen, not a
user choice.

### PitchMeter (Exercise screen)

Circular widget, **90dp/px diameter**. Only updates on a confirmed (stability-gated) note.

- Outer ring: 4px stroke
  - Grey (#BDBDBD) when no pitch detected
  - Green (#4CAF50) when pitch detected
- Centre text: note label (e.g. "A4", "Db4")
  - Bold, 20sp (16sp if label is 3+ chars)
  - Dark (#212121) when detected, grey (#BDBDBD) when not
- Shows "♪" (plain monochrome glyph, no emoji presentation — same family as
  the app's "▶"/"■"/"↻" button glyphs) when no pitch detected, not a bare
  "—" — a bare dash read as a misplaced divider rather than "no note
  detected yet" (fixed during the UI review, issue #30)

### TunerMeter (Mic Setup screen)

Semicircular dial, ~200×110 (desktop SVG units; Android/iOS scale equivalently),
implemented identically on all three platforms (`TunerMeter.tsx` / `.kt` / `.swift`).
Reads every frame's raw Hz directly — **not** gated behind note-stability confirmation
— so the needle sweeps continuously like a real clip-on tuner, rather than jumping only
when a note is confirmed.

- A 180°→360° arc split into five colour bands by cents-off-pitch: red beyond ±20¢,
  amber ±5–20¢, green within ±5¢ either side of dead-on (`GREEN_BAND`/`AMBER_BAND` =
  5/20 cents; sweep clamped to ±50¢, `MAX_CENTS`)
- A needle (line + dot) sweeps to the current cents offset, coloured by its zone
- Below the dial: the note label (written pitch; shows a dual "written (concert)" label
  for a transposing instrument), then a cents caption — "in tune" inside the green band,
  otherwise "+n¢"/"-n¢"
- Grey/muted (`#BDBDBD`) throughout, and "♪" for the label, when nothing is detected
- Both the label row and the cents-caption row are always rendered (never conditionally
  hidden) so their reserved height doesn't shift the rest of the screen when detection
  starts/stops

---

## Colours

| Token | Value | Usage |
|-------|-------|-------|
| Primary | #3F51B5 (indigo) | Buttons, selected chips, active notes, ACTIVE note state |
| Success / Correct | #4CAF50 (green) | Correct notes, pitch meter ring when active |
| Error / Incorrect | #F44336 (red) | Wrong notes, destructive actions (Clear All Progress, Reset to Defaults) — NOT Stop Testing, which is neutral primary (see Exercise Screen) |
| Warning | #FF9800 (orange) | Mid-range score badges on Progress screen |
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
- Silence threshold: RMS < silenceThreshold (default 0.003, configurable on the Mic Setup screen as "Mic Sensitivity") → ignore frame
- Require N consecutive frames with the same pitch class (midi % 12) before confirming a note (default N=3, configurable on the Mic Setup screen as "Note Stability")
- After confirming a pitch, do not confirm it again until the pitch class changes or silence resets stability
- The detection and display dynamics (stability rules, note rendering, staff updates) must use the same code path on each platform; only the post-confirmation action differs per screen

**On confirm — Mic Setup**: append the detected note to the rolling staff history and drive the pitch meter; no judgement or comparison.

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
- Continuous testing mode has no post-test summary screen; users inspect outcomes from Home -> Progress.
- The setup assistant keeps one random install id (a UUID, created on first use) so the proxy
  can count questions per install. Android: `SharedPreferences` file `ear_ring_assistant`, key
  `install_id`. iOS: `UserDefaults` key `assistantInstallId`. Desktop: `localStorage` key
  `ear_ring_install_id`. Chat transcripts are never stored.

Streak = number of consecutive calendar days with at least one session.

---

## Instrument Transposition

The app supports transposing instruments. The canonical instrument list is defined in Rust
(`music_theory.rs` — `INSTRUMENTS` array) and exposed via FFI to all platforms.

**Transposition is display-only.** Concert pitch is used for all pitch detection, comparison,
key/range settings, and audio playback. Transposition is applied at the last moment before
rendering staff notes in Mic Setup and Exercise screens (Mic Setup no longer shows a large
note-name/Hz readout, only the staff and pitch meter — see its own section above).

**Written = Concert + Semitones**

| Instrument         | Semitones | Notes |
|--------------------|-----------|-------|
| Piano              | 0         | Non-transposing |
| Guitar             | 0         | Sounds as written (concert) |
| Transposed Guitar  | +12       | Octave-transposing; written C4 = concert C3 |
| Soprano Sax        | +2        | Bb instrument |
| Alto Sax           | +9        | Eb instrument |
| Tenor Sax          | +14       | Bb instrument, octave-displaced; written a major 9th above concert, not just a major 2nd, since tenor sits a physical octave below soprano/trumpet/clarinet |
| Trumpet            | +2        | Bb instrument |
| Clarinet           | +2        | Bb instrument |
| Soprano Voice      | 0         | Sounding pitch — the note shown is the note sung |
| Alto Voice         | 0         | Sounding pitch — the note shown is the note sung |
| Tenor Voice        | +12       | Octave-transposing; real tenor vocal parts are conventionally written an octave above sounding pitch (treble clef with implied 8vb) to avoid ledger lines below the staff |

The instrument index (0 = Piano) is persisted across restarts on all platforms.

Each instrument has a `range_start`/`range_end` (concert MIDI, always a 12-semitone/
one-octave span), plus its own `grace_frames`/`octave_correction`/`pitch_tolerance_cents`
detection defaults, in the Rust `InstrumentInfo` struct (`INSTRUMENTS` array in
`music_theory.rs`). Selecting a new instrument (`setInstrument` action in
`rust/src/settings.rs`) snaps **all** of these onto the new settings from that table —
range included. This is different from changing the Key on Home, which instead
re-derives the range as one octave from the new root note closest to middle C
(`setRootNote` action) — the two actions use different rules, they just happen to both
produce a 12-semitone span.

| Instrument         | range_start (MIDI) | range_end (MIDI) | Premium |
|--------------------|---------------------|--------------------|---------|
| Piano              | 60 (C4)             | 72 (C5)            |         |
| Guitar             | 52 (E3)             | 64 (E4)            |         |
| Transposed Guitar  | 52 (E3)             | 64 (E4)            |         |
| Soprano Sax        | 58 (Bb3)            | 70 (Bb4)           |         |
| Alto Sax           | 51 (Eb3)            | 63 (Eb4)           |         |
| Tenor Sax          | 46 (Bb2)            | 58 (Bb3)           |         |
| Trumpet            | 55 (G3)             | 67 (G4)            |         |
| Clarinet           | 55 (G3)             | 67 (G4)            |         |
| Soprano Voice      | 60 (C4)             | 72 (C5)            | ✓       |
| Alto Voice         | 55 (G3)             | 67 (G4)            | ✓       |
| Tenor Voice        | 48 (C3)             | 60 (C4)            | ✓       |

The three Voice instruments also default to a wider Pitch Tolerance (80 cents vs. 50 for
every other instrument) — real voices drift with natural vibrato, unlike an instrument
with a mechanical pitch stop. This is what the `use_tuner_meter`/`useTunerMeter` field
(any instrument's tolerance above `FIXED_PITCH_TOLERANCE_CENTS` = 50 flips it on) was
originally for, though nothing currently reads that flag now that Mic Setup always shows
TunerMeter regardless of instrument (see Pitch Meter Specification). See **Premium**
under the Settings Screen section above for the entitlement gate itself.

---

## First Launch Behaviour

On the very first launch of the app (detected via a persistent flag), the app navigates
to the **Help** screen instead of Home. After that, it always starts on Home. This flag
is app state, not a setting — it lives outside the settings model (see above) on every
platform, specifically so a settings reset never touches it (issue: on Android, clearing
it on reset used to send the next-tapped tab to Help instead, since Android's first-launch
check runs on every navigation, not just at startup).

| Platform | Flag key | Storage |
|----------|----------|---------|
| Android  | `"hasLaunched"` | SharedPreferences (`PREFS_NAME`); settings themselves are the separate `"settings"` key, one JSON blob |
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
- **Desktop/Tauri**: left sidebar with the same five destinations and content area, matching the iPad landscape navigation model

### iPad detection
```swift
@Environment(\.horizontalSizeClass) var hsc
private var isIPad: Bool { hsc == .regular }
```
iPad (all orientations) has `.regular` horizontal size class. iPhone always has `.compact`.

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

### ExerciseView — iPad layout (single column, no split)
As designed (see closed issue #23) — ExerciseView does **not** get a bespoke
two-pane landscape layout. It always renders the same single centred column as
iPhone, just scaled up via the "Adaptive sizing values" above and capped at
680pt wide on iPad — the same centering/max-width treatment HomeView and
SetupView already use, in both iPad orientations. A two-pane split (staff/text
left, note circle + Stop Testing right) was tried and dropped (commit
`336c0e1`): confirmed on a real iPad that it read as broken/misaligned rather
than an intentional dashboard, and no other iPad-aware screen in the app uses
a split layout — so ExerciseView was brought back in line with the rest.

### iOS — Home Screen title row
SwiftUI cannot directly reference the app icon from `Images.xcassets/AppIcon.appiconset`
as a UI image (that asset-catalog entry type is special-cased for the OS's own use). The
icon artwork is instead duplicated into a normal image set, `Images.xcassets/AppLogo`
(same PNG as the Android launcher icon), which has no such restriction — so the title
row matches Android's icon-left-of-text layout exactly: a 48pt `Image("AppLogo")`
(10pt corner radius) to the left of "Ear Ring" (32pt bold, primary colour). No
exception needed here anymore; this screen matches the spec like every other.

---

## Melody Manager (Developer Tool)

The Melody Manager is a **standalone Tauri app** at `melody-manager/` used to vet,
edit, and import melodies into the shared `rust/src/melodies.txt` library.
It is **not** part of the shipping app — it is a developer-only tool.

**The "Melody Snippets" test type this library was built for is not currently reachable
in the shipped app.** It's not offered in Home's Test Type dropdown, and any stored
`testType: 1` is silently remapped to Random Notes on load (see the Home Screen section
above). The Rust melody FFI (`melody_count`, `melody_to_midi_by_index`, etc.),
`melodies.txt`, and the melody-handling branches still in each platform's Exercise
screen are all still there and exercised by `cargo test` — this was a UI-level removal,
not a deletion — but nothing in the shipped UI can currently trigger them. Keep this
tool and library maintained only if Melody Snippets is coming back; otherwise treat it
like `rust_wasm/` (see AGENTS.md's Shared Logic Rule) — don't extend it without asking first.

**Full documentation:** `docs/melody-manager.md`

Key facts:
- Run with: `cd melody-manager && cargo tauri dev`
- Exports directly to `rust/src/melodies.txt` (relative path from `melody-manager/`)
- After export, run `cargo test` to verify the library compiles correctly
- Decisions (keep/discard/later) and octave shifts persist in `localStorage` between sessions
- The `✏ Edit ABC` button allows editing any tune's notes via inline ABC notation
- The `🎤 Record` import tab transcribes melodies played into the microphone using the shared Rust YIN pitch detector
