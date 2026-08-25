# Future Plans — Premium, Ads, and Detection R&D

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

### Voice as an instrument
Add singing voice as a selectable input alongside the existing instruments
(`InstrumentInfo` / `instrumentIndex`) — i.e. exercises can be completed by singing the
answer instead of playing it. Needs a voice-vs-instrument pitch detection distinction
(voice pitch tracking behaves differently — vibrato, breathy onset, wider cents wobble —
from a struck note), so likely a second tracker profile rather than reusing instrument
thresholds as-is. Per the Shared Logic Rule, the core tracking math should land in
`rust/src/tracker.rs` / `pitch_detection.rs`, with platform code only handling which mic
input mode is active. This is the foundational feature the next one depends on.

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
