# Mic Setup Auto-Calibration — Design

Status: approved by Paul, ready for implementation planning.
Related roadmap item: `docs/roadmap.md` § "Detection & Exercise-Mode R&D" → "Mic setup auto-calibration".

## Problem

Today's Mic Setup screen (`AGENTS.md` § Mic Setup Screen) is manual-only: the user
drags three sliders/chip-rows — **Mic Sensitivity** (1–10, maps to
`silence_threshold = 0.011 - n*0.001`), **Note Stability** (`required_frames`,
2/3/4/5), **Mic Warmup Frames** (0–6) — while watching the live staff/pitch-meter
for feedback. Getting good detection on a given device/mic/room/instrument is
trial and error, and several detection parameters aren't exposed at all:

- `grace_frames` / `octave_correction` — fixed per-instrument constants in
  `rust/src/music_theory.rs`'s `INSTRUMENTS` table (e.g. Guitar gets
  `grace_frames: 5, octave_correction: true` to survive string sustain and
  2nd-harmonic glitches). Never user-adjustable.
- `YIN_THRESHOLD` — a single hardcoded `const` in `rust/src/pitch_detection.rs`
  (`0.15`), the YIN algorithm's own confidence threshold. Same for every
  platform/instrument, not exposed anywhere.

## Goal

Add a second Mic Setup mode, **Auto-Calibrate**, alongside today's Manual mode:
the app prompts the user to play short, known note sequences, compares what
was actually detected against what was asked for, and iteratively adjusts
**all** detection parameters (not just the 3 sliders) toward the best-scoring
combination for that instrument on that device. All of those parameters —
including the previously-hidden ones — also become visible/editable in Manual
mode, under an "Advanced" disclosure.

## Non-goals (deferred)

- **"Check at the end" Exercise dynamic** (play a full test sequence with no
  gaps between notes, grade once N notes are confirmed, rather than checking
  each note in real time) was discussed in the same brainstorming session as
  a second, related idea. It is **out of scope for this spec** — captured
  below in "Deferred: legato Exercise dynamic" and in `docs/roadmap.md` for a
  future design pass of its own.
- No changes to the Exercise screen's existing retry/scoring mechanics
  (`wrong_note_outcome`, `note_retry_penalty`, `test_score`).
- No changes to how `INSTRUMENTS`' `range_start`/`range_end`/`semitones` are
  chosen — only the detection-tuning fields.

## Architecture

Same shared-core split the rest of the app already follows
(`AGENTS.md`'s Shared Logic Rule): calibration *math* lives in Rust; platform
code drives UI, audio playback/capture timing, and persistence.

```
Platform (desktop/Android/iOS)
  Mic Setup screen: Manual | Auto-Calibrate tabs
      Auto-Calibrate tab:
        loop:
          1. call Rust: next_calibration_round(instrument, history) -> CalibrationRound
          2. show round.notes as TEXT ("Play: C4 → E4 → G4") AND on the staff
          3. play them back once as audio reference
          4. apply round.params to the live PitchTracker; listen for round.notes.len() confirmed notes
          5. call Rust: score_round(round.notes, detected) -> CalibrationScore
          6. append (round, score) to history; call Rust: is_converged(history)
          7. if converged or round cap hit -> stop, keep best-scoring round's params
             else -> loop
      persist best CalibrationParams keyed by instrument index (existing
      per-platform settings store, new per-instrument map alongside today's
      flat fields)
                                   |
                                   |  FFI (C ABI + JNI, same convention as
                                   |  tracker.rs / lib.rs today)
                                   v
Rust core (rust/src/calibration.rs — new module)
  CalibrationParams { silence_threshold, required_frames, warmup_frames,
                       grace_frames, octave_correction, yin_threshold }
  CalibrationRound  { notes: Vec<i32>, params: CalibrationParams }
  CalibrationScore  { per_note_hit: Vec<bool>, false_triggers: u32,
                       avg_frames_to_confirm: f32, total_score: f32 }
  next_calibration_round(instrument_index, history) -> CalibrationRound
  score_round(expected: &[i32], detected: &[i32]) -> CalibrationScore
  is_converged(history: &[(CalibrationRound, CalibrationScore)]) -> bool
  ROUND_CAP: usize   // backstop, e.g. 8
```

### Refactors needed in existing Rust code

- `pitch_detection.rs`: `YIN_THRESHOLD` becomes a parameter of `detect_pitch`
  (`pub fn detect_pitch(samples: &[f32], sample_rate: u32, yin_threshold: f32) -> Option<f32>`)
  instead of a module `const`. `tracker.rs`'s `PitchTracker` gains a
  `yin_threshold: f32` field (defaulting to today's `0.15`) and passes it
  through in `process()`. This is the only signature change to existing FFI
  surface; all current call sites pass the existing default so behavior is
  unchanged for anyone not yet calibrating.
- `tracker.rs`'s `PitchTracker`: `grace_frames` and `octave_correction` are
  already public fields (currently only ever set via `apply_instrument()`
  from the static `INSTRUMENTS` table) — no change needed there beyond adding
  direct setters if convenient; calibration will set them directly.

## Calibration algorithm

**Strategy: directional nudge.** Each round after the first looks at *how*
the previous round failed and nudges the relevant parameter(s) rather than
grid-searching or bisecting:

| Failure observed in `CalibrationScore` | Nudge |
|---|---|
| Expected note never detected at all (likely too quiet / threshold too high) | Lower `silence_threshold` |
| False triggers / extra notes detected between real notes | Raise `silence_threshold` |
| Correct pitch detected but takes many frames / times out | Lower `required_frames` |
| Note recognized before user actually started it (early consumption of prior tail) | Raise `warmup_frames` slightly |
| Adjacent-note bleed / brief dropout mid-note breaks stability (sustain-heavy instrument) | Raise `grace_frames` |
| Detected pitch is exactly ±12 semitones from expected (octave/harmonic glitch) | Enable `octave_correction` |
| Weak/noisy signal generally, low confidence detections | Loosen `yin_threshold` slightly |

**Round content, max 3 notes per round:**
- **Round 1**: fixed low/mid/high spread across the current instrument's
  configured range, using that instrument's current (manual or default)
  params as the starting point.
- **Later rounds**: still capped at 3 notes, but chosen adaptively from what
  round `n-1` got wrong — e.g. two notes near the missed amplitude/range plus
  one control note if sensitivity-related; two adjacent semitones if
  stability-related; a note held/repeated if grace/octave-related.

**Termination** (`is_converged` + `ROUND_CAP`):
- Stop immediately if a round scores all-notes-correct with no false triggers.
- Stop if score has plateaued (no improvement) for a configurable number of
  rounds.
- Hard cap at `ROUND_CAP` rounds (e.g. 8) regardless, as a backstop.
- In every case, keep the **best-scoring round's params seen so far**, not
  necessarily the last round's — a run that never converges still improves on
  the starting point rather than ending on a possibly-worse final guess.

## UI

**Mic Setup screen** gets a Manual / Auto-Calibrate segmented-control at the
top (replacing the current single-mode layout). AGENTS.md's existing
no-scroll constraint for this screen still applies to both tabs.

**Manual tab** (today's 3 controls, unchanged, plus new Advanced section):
- Mic Sensitivity, Note Stability, Mic Warmup Frames — same sliders/chips as
  today, always visible, no change.
- **Advanced** (collapsed by default, one chevron/disclosure toggle, no
  further nesting): Grace Frames (numeric stepper or chip row), Octave
  Correction (switch/toggle), YIN Threshold (slider with sane bounds, e.g.
  0.05–0.30). Collapsed state keeps the no-scroll layout intact for users who
  never touch these; expanded state may require the screen to scroll only
  while expanded — acceptable since it's opt-in.

**Auto-Calibrate tab:**
- Current round indicator ("Round 2 of 8").
- Current round's target notes shown **both as text** (e.g. "Play: C4 → E4 →
  G4", left-to-right, matching the notes' order) **and on the staff**
  (expected-sequence preview, same visual language as Exercise's "Display
  Test Notes" mode) — so staff-reading isn't required to use this mode.
  One-time audio playback of the reference notes before listening starts.
  👂 "Listening…" indicator while capturing, matching Manual/Exercise
  conventions.
  Best-score-so-far readout, updated after each round.
  **Stop** button — ends the run early, keeping the best params found so far
  (does not discard progress).
- On completion (converged or round cap): summary of final params (including
  what changed in Advanced), confirmation that they've been saved for this
  instrument, and a way to switch back to Manual to see/hand-tune the result.

## Persistence

Each platform's existing settings store (desktop `App.tsx` state /
localStorage, Android `ExerciseViewModel` + SharedPreferences, iOS
`ExerciseModel`'s `@Published` properties) gains a **per-instrument
calibrated-params map**: `calibration_params[instrument_index] ->
CalibrationParams`, stored alongside (not replacing) today's flat
`silenceThreshold`/`framesToConfirm`/`warmupFrames` fields.

- On instrument switch (Settings), load that instrument's saved
  `CalibrationParams` if present; otherwise fall back to the static
  `INSTRUMENTS` table defaults (today's behavior) for the newly-hidden fields,
  and today's existing flat-field defaults for the 3 sliders.
- Manual edits to any control (basic or Advanced) update that instrument's
  saved params directly — there's one params record per instrument, not a
  separate "calibrated" vs "manual" copy.
- A calibration run applies to **only the currently-selected instrument**.
  Switching instruments does not prompt to recalibrate; the user re-opens
  Auto-Calibrate manually if they want to tune a different instrument.

## Error handling

- **No signal detected for an entire round** (mic permission denied, no
  input): stop the run rather than iterating blindly on zero data; surface
  "No sound detected — check mic permissions/input."
- **User navigates away / backs out mid-run**: treat like Stop — keep
  whatever was the best-scoring round so far; never leave a half-applied
  round's params active as the saved value.
- **Never converges** (hits `ROUND_CAP` without a perfect round): save the
  best-scoring round's params and say so plainly (e.g. "Best result: 2/3
  notes reliably detected") rather than implying full success.
- **Instrument changes mid-run** (if reachable via the UI on a given
  platform): abort the run rather than score further rounds against a
  now-mismatched instrument's range/defaults.

## Testing

- **Rust unit tests** (`rust/src/calibration.rs`, same style as
  `tracker.rs`/`pitch_detection.rs`'s existing `#[cfg(test)]` modules):
  - `score_round`: correct hit/miss/false-trigger counting on known
    expected/detected sequences.
  - `next_calibration_round`: each failure-mode nudge in the table above,
    given a synthetic history.
  - `is_converged`: perfect-round stop, plateau stop, round-cap stop.
  - `detect_pitch`'s new `yin_threshold` parameter: existing tests
    (`test_detect_a4`, etc.) continue to pass unchanged when the current
    default (`0.15`) is passed explicitly.
- **Manual/exploratory, one pass per platform**: a full calibration run on
  real hardware (desktop mic, an Android phone, an iOS phone) — the actual
  point of this feature is adapting to real device/room acoustics that unit
  tests can't reproduce. Confirm Advanced-section values it lands on are
  sane and persist correctly per instrument across app restart.
- No new integration-test framework — this follows the existing pattern of
  Rust-side unit tests plus manual device verification per `AGENTS.md`.

## Deferred: legato Exercise dynamic

Discussed in the same brainstorming session, explicitly deferred to its own
future spec. Decisions already made, so a future pass doesn't start from
zero (see `docs/roadmap.md` for the roadmap-facing version of this note):

- Applies as an **orthogonal setting** ("check as you go" vs "check at the
  end"), not a new Test Type — works within Random Notes, Diatonic
  Arpeggios, etc., not a separate mode.
- **Retry semantics stay whole-sequence**, same as today's
  `wrong_note_outcome` restart path — no new partial/per-note retry
  mechanic to design.
- **End-of-sequence detection**: capture simply stops once the expected
  number of notes (N, known in advance from the generated sequence) have
  been confirmed, however close together they were played — no silence
  timeout or manual "Done" button needed.
- The tracker already supports gapless transitions today —
  `tracker.rs`'s `test_adjacent_notes_dont_merge` proves a pitch change
  alone (no silence required) already resets stability and confirms the new
  note separately. The main remaining work is deferring *when* attempt
  resolution runs (per-note today; after N-notes-confirmed for this mode),
  not building new segmentation logic.
