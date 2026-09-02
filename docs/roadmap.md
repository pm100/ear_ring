# Future Plans — Premium, Ads, UI/UX, and Detection R&D

## Status (2026-08-22)

Nothing in this document is built yet. It's a holding area for ideas captured during
planning, so they don't get lost before implementation. Context: the app launches free,
with ads and a premium subscription added later — `isPremium` is already scaffolded on
Android (`ExerciseViewModel.kt`) and iOS (`ExerciseModel.swift`) as a persisted
entitlement flag, currently always `false` with nothing to flip it yet.

---

## Dev/Test Infrastructure

### Dev switch for `isPremium`
A developer-only toggle (Settings screen, hidden behind a long-press or debug-build
flag) to flip `isPremium` on/off locally, so premium UI/UX can be built and tested
before real billing exists. Should call the existing `setPremium()` on Android /
`isPremium` setter on iOS directly — no new plumbing needed there, just a UI affordance
and a guard so it can't ship visible in a release build.

### Ads — UI and plumbing
AdMob on Android + iOS (desktop stays ad-free). See prior discussion for the shape of
this: banner on Home/Results screens only, never during the Exercise screen (audio
session conflict risk), test ad unit IDs during dev, ATT prompt on iOS if personalized
ads are wanted, and the Play Console "Advertising ID" data-safety declaration needs
revisiting once a real SDK lands. Gate ad display behind `!isPremium` once both exist.

---

## Premium Feature Candidates

### Melody snippets test mode (re-enable)
Already fully implemented on all three platforms (see `docs/melody-library-plan.md`)
but currently hidden from the UI — `testType == 1` is force-reset to `0` on load
("Reset melody mode (no longer in UI)" in both `ExerciseViewModel.kt` and
`ExerciseModel.swift`). Re-exposing it as a premium-only Test Type option is close to
free: remove the reset-to-0 guard, gate the option's visibility on `isPremium`.

### Voice as an instrument (and other continuous-pitch instruments)
Add singing voice as a selectable input alongside the existing instruments
(`InstrumentInfo` / `instrumentIndex`) — i.e. exercises can be completed by singing the
answer instead of playing it. This is the foundational feature the next one depends on.

**The tracker's stability check doesn't tolerate pitch wobble today, and that's not a
voice-specific gap.** In `tracker.rs`, `PitchTracker::process()` only advances
`stable_count` when the *rounded MIDI note* is bit-identical to the previous frame's
(`effective_midi == self.stable_midi`) — any frame that rounds to a different semitone
resets the count to 1. Natural vibrato (~±30–100 cents of swing) will routinely cross a
semitone boundary frame-to-frame, so a wobbly note can reset its own stability
indefinitely and never confirm. This affects every instrument that lacks a mechanical
stop pinning the pitch to a fixed value, not just voice:
- **Trombone** — slide has no fixed positions; landing/holding a pitch is a live
  muscular judgment, same as singing.
- **Fretless strings** (violin, cello, fretless bass/guitar) — finger position, not a
  mechanical stop, defines pitch; vibrato is core idiomatic technique here.
- **Voice**, plus the usual breathy/glide onset that's slower and messier than a
  struck or blown attack.

Sax/trumpet/clarinet are mechanically quantized (fingering picks a fixed pitch) so
they're lower risk, but a player leaning into embouchure vibrato could still trip the
same bug — it's just narrower and less likely than on a fully continuous instrument.
And this is an *ear-training* app: the person producing the target pitch is often the
one with the least reliable pitch control, so expect more hunting-for-pitch wobble in
practice than a clean-tone assumption would suggest.

**Recommended shape:** don't build this as a one-off "Voice profile." Add a generic
capability instead — e.g. a `pitch_tolerance_cents` (or `continuous_pitch: bool`) field
on `InstrumentInfo`, with one shared hysteresis-band implementation in `tracker.rs`: a
note stays "stable" while cents drift stays within a band around a running center,
rather than requiring the rounded MIDI to be bit-identical every frame. Trombone,
fretless strings, and voice would all set that flag/threshold; piano/fretted
guitar/winds keep today's strict behavior. Per the Shared Logic Rule, this belongs in
`rust/src/tracker.rs` / `pitch_detection.rs`, with platform code only handling which mic
input mode is active (and, for voice specifically, that's the only new platform-side
work — the tracker fix is instrument-agnostic core logic).

Also worth noting before trusting any of this: the existing 47 Rust tracker/pitch tests
all use synthesized pure sine waves (`sine_wave()` in `tracker.rs`'s test module) — none
simulate vibrato, breathiness, or glide onset, so passing tests today give zero evidence
about real sung or slid/fretless-played audio. Validate against real recordings before
shipping any continuous-pitch instrument.

### "Sing then play" test mode
New exercise mode: the user sings the prompted note/interval first, then confirms by
playing the same thing on their instrument. **Depends on "Voice as an instrument"
above** — needs voice pitch detection to exist before the sing step can be graded at
all.

### Cycle of fifths mode
Instead of a fixed key for the whole session, cycle the root through the circle of
fifths (or fourths) each round/test — C → G → D → A ... — so a session drills key
recognition across all 12 keys rather than repeated drilling in one key. Root-note
generation is exercise-prompt logic, so belongs in the Rust core alongside the existing
`generate_sequence()` / `generate_diatonic_chord()` functions.

### AI analysis of progress + exercise suggestions
Analyze `SessionRecord`/`TestRecord` history (already persisted via `ProgressStorage.kt`
/ `ProgressModel.swift`) to surface patterns — which scales/keys/intervals are weakest,
whether accuracy is trending up or down, what to practice next — and suggest a next
exercise config. This is the one item here that's a genuine service call (some LLM or
rules-based analysis over the stored history) rather than pure on-device logic; needs a
decision on where that call happens (device-side vs a backend) before scoping further.

### "Show notes" toggle as a premium control
Gate the ability to toggle `showTestNotes` behind premium — free tier fixed one way
(no visual note names during the exercise, forcing ear-only training), premium unlocks
turning it on for a gentler practice mode. Inverts today's default where it's a free
setting for everyone.

### Other premium ideas (not requested, added for consideration)
- **Extended progress history & stats** — free tier caps visible history (e.g. last 30
  days or last N sessions in `ProgressStorage`/`ProgressModel`, which already `takeLast`
  their lists); premium unlocks full history plus breakdowns by scale/key/interval.
- **Additional instrument sound packs** — beyond the current Salamander piano sample set
  (`InstrumentInfo` / `instrumentIndex`), unlock more sampled instruments.
- **Custom/user-defined scales** — beyond the built-in scale list, let premium users
  define their own scale degree sets.
- **Cross-device progress sync** — today's `Data Persistence` (per AGENTS.md) is local
  SharedPreferences/UserDefaults only, no account or cloud sync; premium could add
  account-based sync so progress follows the user across phone/tablet.
- **Session/progress export** — CSV or shareable summary of practice history.
- **Adaptive difficulty auto-tuning** — session-to-session automatic adjustment of
  sequence length / retry count / tempo based on recent accuracy, lighter-weight than
  the full "AI analysis" idea above but same underlying data.

---

## Home / Progress Screen UI (not premium-specific)

Requested 2026-09-01.

### Range picker: move off the Home screen into a popup
Home screen currently always shows the full interactive piano keyboard
(`PianoRangePicker`) inline for range selection — desktop: a local component defined
inside `HomeScreen.tsx` (not a separate file); Android: `ui/PianoRangePicker.kt`; iOS:
`views/PianoRangePickerView.swift`. Replace the always-visible keyboard with a compact
text label showing the current range (e.g. "C4–D5", reusing the existing
`midiLabel`/`MusicTheory.midiToLabel` helpers already used to render range labels
elsewhere), tappable/clickable to open the *same* picker in a popup instead — a modal
on Desktop, an `AlertDialog`/bottom-sheet-wrapped composable on Android, a `.sheet`
on iOS. No new range-picking logic needed: this is relocating the existing widget
behind a trigger, not rebuilding it. Should also visibly shorten the Home screen,
which is already a fairly tall scrolling form (Test Type, Key, Scale, Range, Sequence
Length, two checkboxes, Start button).

### Progress screen: graph of score over days
Add a chart to `ProgressScreen`/`ProgressScreen.kt`/`ProgressScreen.swift` plotting
score over time across days. The data already exists — `SessionRecord`'s `date` +
`score` fields, already loaded into each Progress screen's state (desktop reads it
straight from `localStorage.getItem('ear_ring_sessions')`; Android/iOS via
`ProgressStorage.kt` / `ProgressModel.swift`) — so this is a new UI element consuming
already-persisted history, not new data-model work. No charting library is shared
across all three platforms today, so the approach differs per platform:
- **iOS**: the native `Charts` framework (`import Charts`) needs no new dependency —
  the project's `IPHONEOS_DEPLOYMENT_TARGET = 16.0` already meets its iOS 16 minimum.
- **Android**: Compose has no built-in charting; either a hand-drawn `Canvas` line
  chart or a small charting library (e.g. Vico) would be needed.
- **Desktop**: no charting library in `desktop/package.json` currently — either add a
  lightweight one or hand-draw an SVG line chart (data volume is small enough — a
  handful of points per day — that a custom SVG is realistic without a dependency).

Design question to settle before building: what counts as "a day" when someone
completes multiple sessions in one day — average that day's scores into one point,
plot every session as its own point, or both (per-session dots plus a daily trend
line)?

---

## Melody Library Storage Format (not premium-specific)

Requested 2026-09-01.

### Convert `melodies.txt` to standard ABC notation
`rust/src/melodies.txt` currently stores each melody in a bespoke project-specific
format — a title line, then `semitone:duration,semitone:duration,...` — parsed by
`parse_melodies`/`parse_notes_line` in `rust/src/music_theory.rs`. Replace it with
standard ABC notation as the on-disk format instead.

This is better-scoped than it sounds because most of the hard part already exists —
just facing the wrong direction. `melody-manager` (the standalone curation tool, see
`docs/melody-manager.md`) already works in ABC internally
(`melody-manager/src/utils/abc.ts`, via the `abcjs` library): `parseAbcToNotes()` and
`rawNotesToAbc()` give full bidirectional ABC ↔ note conversion already, and its
Import/Search/Paste-ABC/inline-ABC-editor flows are all ABC-native. The *only* place it
currently leaves ABC is its final "Export to melodies.txt" step, which down-converts
back to the bespoke semitone:duration format purely because that's what the Rust core
expects today. Flipping the storage format removes that down-conversion entirely —
export would just write ABC text straight into `melodies.txt`, in the exact dialect
`rawNotesToAbc` already emits: `X:1`/`T:`/`M:4/4`/`L:1/4`/`K:C` header block, `^` for
sharps (no flats emitted), note-letter case for octave, `,`/`'` octave marks, and ABC
duration suffixes for beat lengths.

What's actually new work: `rust/src/music_theory.rs` needs an ABC *parser* to replace
`parse_notes_line`, since there's no Rust equivalent of `abcjs` to reach for. It doesn't
need to handle general ABC 2.1 — only the narrow dialect melody-manager's export already
produces (single voice, no key signature/accidentals beyond inline `^` — plus maybe `_`
flat and `=` natural for resilience against hand-edited files, no ties/slurs/repeats/
chords/lyrics) — closer in scope to today's trivial `parse_notes_line` than to a general
ABC implementation. `parseAbcToNotes()` in `abc.ts` is a solid reference for exactly
which constructs need handling. The existing ~50 tunes in `melodies.txt` would need a
one-time batch conversion — reusing `rawNotesToAbc` against their already-parsed
semitone/duration data to generate the new file is more reliable than hand-converting
each one.

---

## Detection & Exercise-Mode R&D (not premium-specific)

### Mic setup auto-calibration
On the Setup/mic-permission screen, prompt the user to play a simple known arpeggio
(e.g. a triad up and down) instead of just confirming mic access. Compare what was
actually detected against the expected sequence and use the deltas to adapt
`silenceThreshold`, `framesToConfirm`, `warmupFrames` (and instrument-specific defaults)
per-device instead of relying on fixed global defaults. This is squarely pitch-detection
tuning logic, so the calibration math belongs in the Rust core (`tracker.rs` /
`pitch_detection.rs`) with platform code only driving the prompt UI and mic capture.

### Dyad/triad test mode (chord recognition, not just single notes)
A new Test Type where the prompt and expected answer are a dyad (2 notes) or triad
(3 notes) played/sung together, rather than one note at a time. This is a bigger lift
than melody/diatonic modes: today's pitch tracker (`tracker.rs`) is built around
single-note detection per frame; polyphonic detection (resolving 2-3 simultaneous
pitches from one mic signal) is a different algorithm, not a mode flag on top of the
existing one. Worth spiking on the Rust side before committing to a UI design — the
detection approach determines what's actually gradeable.
