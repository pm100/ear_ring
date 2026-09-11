# Mic Auto-Calibration (Phase 1: Rust core + Desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Auto-Calibrate mode to the desktop Mic Setup screen that plays short (max 3-note) known sequences, compares detected vs. expected, and directionally nudges all detection parameters — including the previously-hidden `grace_frames`/`octave_correction`/YIN threshold — toward the best-scoring combination per instrument, with all parameters also exposed for manual editing.

**Architecture:** Pure decision math (`CalibrationParams`/`CalibrationRound`/`CalibrationScore`, scoring, next-round selection, convergence) lives in a new `rust/src/calibration.rs` module, mirroring the existing `tracker.rs`/`music_theory.rs` shared-core pattern. A stateful `CalibrationSession` wrapper (same style as `PitchTracker`) drives the round-by-round loop. Desktop (Tauri) consumes this directly via `ear_ring_core` (no FFI marshaling needed — Tauri already depends on `serde` and can serialize plain Rust tuples/Vecs over its own IPC bridge); the calibration module itself stays dependency-free like the rest of `ear_ring_core`, matching its existing "hand-built primitives, no serde" convention (see `instrument_list_json`).

**Tech Stack:** Rust (`ear_ring_core` crate, `cargo test`), Tauri commands (`desktop/src-tauri/src/main.rs`), React/TypeScript (`desktop/src/components/SetupScreen.tsx`, existing `useAudioCapture`/`useAudioPlayback` hooks).

**Spec:** `docs/superpowers/specs/2026-09-10-mic-auto-calibration-design.md`

## Global Constraints

- Max 3 notes per calibration round (spec: "Test content").
- Auto-Calibrate prompts are shown as text (note names) AND on the staff — never staff-only.
- Calibration tunes ALL detection params: `silence_threshold`, `required_frames`, `warmup_frames`, `grace_frames`, `octave_correction`, `yin_threshold` — and all of these become user-editable, with the 3 previously-hidden ones behind a collapsed "Advanced" disclosure (spec + brainstorm).
- Search strategy is directional-nudge (not grid search / bisection).
- Round content: round 1 is a fixed low/mid/high spread across the active range; later rounds retest whatever failed, padded with adjacent probes.
- Termination: perfect round, or score-plateau, or a hard round cap (`ROUND_CAP`) — whichever comes first. Always keep the best-scoring round's params, never just the last round's.
- Calibration applies to the currently-selected instrument only; no auto-prompt on instrument switch (explicit re-run only).
- **Phase 1 scope is Rust core + Desktop only.** Android/iOS UI + FFI/JNI wiring is an explicitly separate follow-on plan (this plan produces a complete, testable, shippable desktop feature on its own — see writing-plans' Scope Check).
- No changes to Exercise screen retry/scoring mechanics, and no changes to `INSTRUMENTS`' `range_start`/`range_end`/`semitones`.

---

### Task 1: Parameterize `yin_threshold` through `detect_pitch` and `PitchTracker`

**Files:**
- Modify: `rust/src/pitch_detection.rs:9-17` (and its `#[cfg(test)]` module)
- Modify: `rust/src/tracker.rs:14-90` (and its `#[cfg(test)]` module)
- Modify: `rust/src/lib.rs:220-241` (`ear_ring_detect_pitch` FFI wrapper — must keep passing the old fixed value so existing iOS/Android callers see no behavior change in Phase 1)
- Modify: `rust_wasm/src/lib.rs:10-12` (`wasm_detect_pitch` — same reason)

**Interfaces:**
- Produces: `pub const DEFAULT_YIN_THRESHOLD: f32 = 0.15;` in `pitch_detection.rs`; `pub fn detect_pitch(samples: &[f32], sample_rate: u32, yin_threshold: f32) -> Option<f32>`; `PitchTracker` gains `pub yin_threshold: f32` (defaults to `DEFAULT_YIN_THRESHOLD` in `new()`).

- [ ] **Step 1: Write the failing test** — add to `rust/src/pitch_detection.rs`'s test module:

```rust
    #[test]
    fn test_custom_yin_threshold_still_detects_clean_tone() {
        let a4 = sine_wave(440.0, 44100, 4096);
        // A stricter (lower) threshold on a clean, noise-free tone must still detect it.
        let hz = detect_pitch(&a4, 44100, 0.05).unwrap();
        assert!((hz - 440.0).abs() < 1.0);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --package ear_ring_core test_custom_yin_threshold_still_detects_clean_tone`
Expected: FAIL with a compile error — `detect_pitch` takes 2 arguments, 3 supplied (this also proves every other existing call site needs updating, which the later steps do).

- [ ] **Step 3: Implement the parameterization**

In `rust/src/pitch_detection.rs`, replace:
```rust
const YIN_THRESHOLD: f32 = 0.15;
```
with:
```rust
/// Default YIN confidence threshold, used wherever no calibrated value exists yet.
pub const DEFAULT_YIN_THRESHOLD: f32 = 0.15;
```
Change the signature:
```rust
pub fn detect_pitch(samples: &[f32], sample_rate: u32, yin_threshold: f32) -> Option<f32> {
```
and replace every internal use of `YIN_THRESHOLD` in the function body with `yin_threshold`.

Update every existing test in `pitch_detection.rs`'s `#[cfg(test)]` module (`test_detect_a4`, `test_detect_c4`, `test_detect_c5`, `test_detect_e4`, `test_detect_g4`, `test_detect_high_c6`, `test_detect_low_c3`, `test_near_silence_noise`, `test_quiet_sine_still_detected`) to pass `DEFAULT_YIN_THRESHOLD` as the third argument, e.g. `detect_pitch(&samples, 44100, DEFAULT_YIN_THRESHOLD)`.

In `rust/src/tracker.rs`, add the field and thread it through:
```rust
pub struct PitchTracker {
    pub silence_threshold: f32,
    pub required_frames: u32,
    pub grace_frames: u32,
    pub octave_correction: bool,
    /// YIN algorithm confidence threshold. Defaults to `pitch_detection::DEFAULT_YIN_THRESHOLD`;
    /// overridden by Auto-Calibrate per instrument/device.
    pub yin_threshold: f32,
    warmup_remaining: u32,
    stable_midi: i32,
    stable_count: u32,
    pitch_consumed: bool,
    silence_grace: u32,
}
```
Update `use crate::pitch_detection::detect_pitch;` to also import the default:
```rust
use crate::pitch_detection::{detect_pitch, DEFAULT_YIN_THRESHOLD};
```
In `PitchTracker::new()`, initialize `yin_threshold: DEFAULT_YIN_THRESHOLD,`.
In `process()`, change:
```rust
let Some(hz) = detect_pitch(samples, sample_rate) else {
```
to:
```rust
let Some(hz) = detect_pitch(samples, sample_rate, self.yin_threshold) else {
```

In `rust/src/lib.rs`, in `ear_ring_detect_pitch` (line ~231), change:
```rust
    match detect_pitch(slice, sample_rate) {
```
to:
```rust
    match detect_pitch(slice, sample_rate, pitch_detection::DEFAULT_YIN_THRESHOLD) {
```
and add `DEFAULT_YIN_THRESHOLD` to the `pub use pitch_detection::detect_pitch;` line (line 17), changing it to:
```rust
pub use pitch_detection::{detect_pitch, DEFAULT_YIN_THRESHOLD};
```

In `rust_wasm/src/lib.rs`, change:
```rust
pub fn wasm_detect_pitch(samples: &[f32], sample_rate: u32) -> f32 {
    detect_pitch(samples, sample_rate).unwrap_or(-1.0)
}
```
to:
```rust
pub fn wasm_detect_pitch(samples: &[f32], sample_rate: u32) -> f32 {
    detect_pitch(samples, sample_rate, ear_ring_core::DEFAULT_YIN_THRESHOLD).unwrap_or(-1.0)
}
```
(check its `use ear_ring_core::{...}` import line and add `DEFAULT_YIN_THRESHOLD` to it.)

- [ ] **Step 4: Run test to verify it passes, and that nothing else broke**

Run: `cargo test` (from repo root — exercises the whole workspace: `rust` + `rust_wasm`)
Expected: PASS, all tests including the new one and every pre-existing `tracker.rs`/`pitch_detection.rs` test.

- [ ] **Step 5: Commit**

```bash
git add rust/src/pitch_detection.rs rust/src/tracker.rs rust/src/lib.rs rust_wasm/src/lib.rs
git commit -m "Rust: parameterize YIN threshold on detect_pitch and PitchTracker"
```

---

### Task 2: `calibration.rs` — pure scoring and next-round decision logic

**Files:**
- Create: `rust/src/calibration.rs`
- Modify: `rust/src/lib.rs:1-3` (add `pub mod calibration;`)

**Interfaces:**
- Consumes: nothing from other tasks (pure module; doesn't touch `PitchTracker`).
- Produces (all `pub`, used by Task 3 and by desktop in Task 5):
  - `struct CalibrationParams { silence_threshold: f32, required_frames: u32, warmup_frames: u32, grace_frames: u32, octave_correction: bool, yin_threshold: f32 }` (`#[derive(Clone, Copy, Debug, PartialEq)]`)
  - `struct CalibrationRound { notes: Vec<i32>, params: CalibrationParams }` (`#[derive(Clone, Debug, PartialEq)]`)
  - `struct CalibrationScore { detected: Vec<i32>, frames_to_confirm: Vec<u32>, total_score: f32 }` (`#[derive(Clone, Debug, PartialEq)]`)
  - `const MAX_NOTES_PER_ROUND: usize = 3;`
  - `const ROUND_CAP: usize = 8;`
  - `const PLATEAU_ROUNDS: usize = 2;`
  - `const PER_NOTE_TIMEOUT_FRAMES: u32 = 55;` (~5s at one ~93ms buffer/frame — how long a platform should wait for a single note before recording it as missed)
  - `fn score_round(expected: &[i32], detected: &[i32], frames_to_confirm: &[u32]) -> CalibrationScore`
  - `fn next_calibration_round(range_start: i32, range_end: i32, starting_params: CalibrationParams, history: &[(CalibrationRound, CalibrationScore)]) -> CalibrationRound`
  - `fn is_converged(history: &[(CalibrationRound, CalibrationScore)]) -> bool`
  - `fn best_params(history: &[(CalibrationRound, CalibrationScore)], fallback: CalibrationParams) -> CalibrationParams`

- [ ] **Step 1: Write the failing tests** — create `rust/src/calibration.rs` with just the types/consts (no logic yet) plus this test module:

```rust
/// Auto-calibration for mic detection parameters (Mic Setup Auto-Calibrate mode).
///
/// Pure decision logic only — no audio I/O. Platform code captures one note at a
/// time per round (up to MAX_NOTES_PER_ROUND), applying a per-note timeout
/// (PER_NOTE_TIMEOUT_FRAMES), and passes the results here to be scored and to
/// decide the next round.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CalibrationParams {
    pub silence_threshold: f32,
    pub required_frames: u32,
    pub warmup_frames: u32,
    pub grace_frames: u32,
    pub octave_correction: bool,
    pub yin_threshold: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CalibrationRound {
    pub notes: Vec<i32>,
    pub params: CalibrationParams,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CalibrationScore {
    pub detected: Vec<i32>,
    pub frames_to_confirm: Vec<u32>,
    pub total_score: f32,
}

pub const MAX_NOTES_PER_ROUND: usize = 3;
pub const ROUND_CAP: usize = 8;
pub const PLATEAU_ROUNDS: usize = 2;
pub const PER_NOTE_TIMEOUT_FRAMES: u32 = 55;

#[cfg(test)]
mod tests {
    use super::*;

    fn params(silence_threshold: f32) -> CalibrationParams {
        CalibrationParams {
            silence_threshold,
            required_frames: 3,
            warmup_frames: 4,
            grace_frames: 3,
            octave_correction: false,
            yin_threshold: 0.15,
        }
    }

    #[test]
    fn test_score_round_all_correct() {
        let score = score_round(&[60, 64, 67], &[60, 64, 67], &[3, 3, 3]);
        assert_eq!(score.total_score, 1.0);
        assert_eq!(score.detected, vec![60, 64, 67]);
    }

    #[test]
    fn test_score_round_partial() {
        let score = score_round(&[60, 64, 67], &[60, 65, 67], &[3, 3, 3]);
        assert!((score.total_score - (2.0 / 3.0)).abs() < 1e-6);
    }

    #[test]
    fn test_score_round_missed_note_is_minus_one() {
        let score = score_round(&[60, 64, 67], &[60, -1, 67], &[3, 0, 3]);
        assert!((score.total_score - (2.0 / 3.0)).abs() < 1e-6);
    }

    #[test]
    fn test_first_round_is_low_mid_high_spread_with_starting_params() {
        let start = params(0.003);
        let round = next_calibration_round(60, 72, start, &[]);
        assert_eq!(round.notes, vec![60, 66, 72]);
        assert_eq!(round.params, start);
    }

    #[test]
    fn test_missed_note_lowers_silence_threshold() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        let score1 = score_round(&round1.notes, &[60, -1, 72], &[3, 0, 3]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert!(round2.params.silence_threshold < start.silence_threshold);
    }

    #[test]
    fn test_octave_mismatch_enables_octave_correction() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        // Middle note (66) detected an octave low (54).
        let score1 = score_round(&round1.notes, &[60, 54, 72], &[3, 3, 3]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert!(round2.params.octave_correction);
    }

    #[test]
    fn test_non_octave_mismatch_tightens_yin_threshold() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        // Middle note (66) detected as a neighboring wrong pitch, not an octave —
        // read as "something was accepted too readily" (noise/false-trigger-shaped),
        // so tighten rather than loosen. See the note below `next_calibration_round`.
        let score1 = score_round(&round1.notes, &[60, 65, 72], &[3, 3, 3]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert!(round2.params.yin_threshold < start.yin_threshold);
    }

    #[test]
    fn test_missed_note_also_loosens_yin_threshold() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        let score1 = score_round(&round1.notes, &[60, -1, 72], &[3, 0, 3]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        // A miss pushes both gates toward "accept more": lower silence_threshold
        // (already covered above) and higher yin_threshold.
        assert!(round2.params.yin_threshold > start.yin_threshold);
    }

    #[test]
    fn test_severe_slow_confirm_raises_grace_frames_not_required_frames() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        // All 3 notes eventually confirmed correctly, but took >4x required_frames —
        // read as dropout-driven restarts, not plain slow onset.
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &[13, 13, 13]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert!(round2.params.grace_frames > start.grace_frames);
        assert_eq!(round2.params.required_frames, start.required_frames);
    }

    #[test]
    fn test_mild_slow_confirm_lowers_required_frames_not_grace_frames() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        // Confirmed correctly but a bit slow (>2x, <=4x required_frames) — plain
        // slow onset, not a dropout pattern.
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &[7, 7, 7]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert!(round2.params.required_frames < start.required_frames);
        assert_eq!(round2.params.grace_frames, start.grace_frames);
    }

    #[test]
    fn test_failing_notes_are_retested_next_round() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        let score1 = score_round(&round1.notes, &[60, -1, 72], &[3, 0, 3]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert_eq!(round2.notes[0], 66); // the missed note (index 1 of round 1) is retested
        assert_eq!(round2.notes.len(), MAX_NOTES_PER_ROUND);
    }

    #[test]
    fn test_all_correct_probes_a_fresh_spread() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &[3, 3, 3]);
        let round2 = next_calibration_round(60, 72, start, &[(round1.clone(), score1)]);
        assert_ne!(round2.notes, round1.notes);
        assert_eq!(round2.params, round1.params); // no failure => no param change
    }

    #[test]
    fn test_converges_on_perfect_round() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &[3, 3, 3]);
        assert!(is_converged(&[(round1, score1)]));
    }

    #[test]
    fn test_converges_at_round_cap() {
        let start = params(0.003);
        let round = next_calibration_round(60, 72, start, &[]);
        let bad_score = score_round(&round.notes, &[-1, -1, -1], &[0, 0, 0]);
        let history: Vec<_> = (0..ROUND_CAP).map(|_| (round.clone(), bad_score.clone())).collect();
        assert!(is_converged(&history));
    }

    #[test]
    fn test_does_not_converge_while_improving() {
        let start = params(0.003);
        let round = next_calibration_round(60, 72, start, &[]);
        let worse = score_round(&round.notes, &[-1, -1, -1], &[0, 0, 0]);
        let better = score_round(&round.notes, &round.notes.clone(), &[3, 3, 3]);
        // Only 2 rounds so far and score improved from worse to (not-perfect-but-not-worse) —
        // use a partial-improvement pair that isn't itself perfect to exercise the plateau path.
        let mid = score_round(&round.notes, &[round.notes[0], -1, round.notes[2]], &[3, 0, 3]);
        assert!(!is_converged(&[(round.clone(), worse), (round, mid.clone())]));
        let _ = better; // silence unused warning if not referenced further
    }

    #[test]
    fn test_best_params_picks_highest_scoring_round() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        let score1 = score_round(&round1.notes, &[-1, -1, -1], &[0, 0, 0]); // score 0.0
        let round2 = next_calibration_round(60, 72, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &[3, 3, 3]); // score 1.0
        let best = best_params(&[(round1, score1), (round2.clone(), score2)], start);
        assert_eq!(best, round2.params);
    }

    #[test]
    fn test_best_params_falls_back_when_history_empty() {
        let start = params(0.003);
        assert_eq!(best_params(&[], start), start);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --package ear_ring_core calibration::`
Expected: FAIL with compile errors — `score_round`, `next_calibration_round`, `is_converged`, `best_params` don't exist yet.

- [ ] **Step 3: Implement the logic** — append above the test module in `rust/src/calibration.rs`:

```rust
pub fn score_round(expected: &[i32], detected: &[i32], frames_to_confirm: &[u32]) -> CalibrationScore {
    let hits = expected.iter().zip(detected.iter()).filter(|(&e, &d)| e == d).count();
    let total_score = if expected.is_empty() { 0.0 } else { hits as f32 / expected.len() as f32 };
    CalibrationScore {
        detected: detected.to_vec(),
        frames_to_confirm: frames_to_confirm.to_vec(),
        total_score,
    }
}

/// Directional-nudge mapping from what went wrong in the last round to which
/// param(s) to adjust. This is intentionally approximate (see the spec's
/// "directional nudge" strategy) — two of the spec's originally-sketched failure
/// modes are NOT separately nudged here, by deliberate simplification rather
/// than oversight:
///   - "False triggers" (noise mistaken for a note) and "wrong pitch, non-octave"
///     collapse into one signal from this design: both look like "something was
///     accepted with too much confidence when it shouldn't have been", so both
///     tighten (lower) `yin_threshold`. They can't be told apart from a plain
///     expected-vs-detected comparison without richer per-frame telemetry this
///     design doesn't collect.
///   - "Early consumption" (a note recognized before the user actually started
///     it) is NOT auto-nudged: `warmup_frames` buffers are already discarded via
///     `reset_with_warmup` before each round's listening window begins, so the
///     capture the frontend reports has no way to distinguish "started too late"
///     from "user just played immediately" without its own timing telemetry.
///     `warmup_frames` stays at the session's starting value; a future revision
///     could add this once the capture path reports onset timing.
pub fn next_calibration_round(
    range_start: i32,
    range_end: i32,
    starting_params: CalibrationParams,
    history: &[(CalibrationRound, CalibrationScore)],
) -> CalibrationRound {
    if history.is_empty() {
        let span = range_end - range_start;
        return CalibrationRound {
            notes: vec![range_start, range_start + span / 2, range_end],
            params: starting_params,
        };
    }

    let (last_round, last_score) = history.last().unwrap();
    let mut new_params = last_round.params;
    let mut failing_notes: Vec<i32> = Vec::new();

    for (i, &expected) in last_round.notes.iter().enumerate() {
        let detected = last_score.detected.get(i).copied().unwrap_or(-1);
        if detected == -1 {
            // Nothing accepted at all: push both gates toward "accept more".
            new_params.silence_threshold = (new_params.silence_threshold * 0.8).max(0.0005);
            new_params.yin_threshold = (new_params.yin_threshold + 0.02).min(0.30);
            failing_notes.push(expected);
        } else if detected != expected {
            if (detected - expected).abs() == 12 {
                new_params.octave_correction = true;
            } else {
                // Something WAS confidently accepted, just the wrong thing —
                // tighten rather than loosen (see doc comment above).
                new_params.yin_threshold = (new_params.yin_threshold - 0.02).max(0.05);
            }
            failing_notes.push(expected);
        }
    }

    let confirmed_frames: Vec<u32> = last_score.frames_to_confirm.iter().copied().filter(|&f| f > 0).collect();
    if !confirmed_frames.is_empty() {
        let avg_frames = confirmed_frames.iter().sum::<u32>() as f32 / confirmed_frames.len() as f32;
        if avg_frames > (new_params.required_frames as f32) * 4.0 {
            // Severe slowness reads as dropout-driven stability resets, not plain
            // slow onset — absorb dropouts instead of asking for less stability.
            new_params.grace_frames = (new_params.grace_frames + 1).min(6);
        } else if avg_frames > (new_params.required_frames as f32) * 2.0 {
            new_params.required_frames = new_params.required_frames.saturating_sub(1).max(2);
        }
    }

    let notes = if failing_notes.is_empty() {
        let span = range_end - range_start;
        vec![range_start + span / 4, range_start + span / 2, range_start + 3 * span / 4]
    } else {
        let mut notes = failing_notes;
        notes.truncate(MAX_NOTES_PER_ROUND);
        while notes.len() < MAX_NOTES_PER_ROUND {
            let extra = (notes[0] + 1).clamp(range_start, range_end);
            notes.push(extra);
        }
        notes
    };

    CalibrationRound { notes, params: new_params }
}

pub fn is_converged(history: &[(CalibrationRound, CalibrationScore)]) -> bool {
    if history.len() >= ROUND_CAP {
        return true;
    }
    if let Some((_, score)) = history.last() {
        if score.total_score >= 1.0 {
            return true;
        }
    }
    if history.len() >= PLATEAU_ROUNDS {
        let recent: Vec<f32> = history[history.len() - PLATEAU_ROUNDS..]
            .iter()
            .map(|(_, s)| s.total_score)
            .collect();
        if recent.windows(2).all(|w| w[1] <= w[0]) {
            return true;
        }
    }
    false
}

pub fn best_params(history: &[(CalibrationRound, CalibrationScore)], fallback: CalibrationParams) -> CalibrationParams {
    history
        .iter()
        .max_by(|a, b| a.1.total_score.partial_cmp(&b.1.total_score).unwrap())
        .map(|(round, _)| round.params)
        .unwrap_or(fallback)
}
```

In `rust/src/lib.rs`, add the module declaration after the existing `pub mod` lines:
```rust
pub mod calibration;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --package ear_ring_core calibration::`
Expected: PASS (all tests in the new module).

Then run the full suite to confirm nothing else regressed: `cargo test`.

- [ ] **Step 5: Commit**

```bash
git add rust/src/calibration.rs rust/src/lib.rs
git commit -m "Rust: add calibration.rs — scoring and directional-nudge round selection"
```

---

### Task 3: `CalibrationSession` stateful wrapper

**Files:**
- Modify: `rust/src/calibration.rs` (append)

**Interfaces:**
- Consumes: everything from Task 2 (`CalibrationParams`, `CalibrationRound`, `score_round`, `next_calibration_round`, `is_converged`, `best_params`).
- Produces: `struct CalibrationSession` with `new(range_start: i32, range_end: i32, starting_params: CalibrationParams) -> Self`, `current_round(&self) -> &CalibrationRound`, `record_round(&mut self, detected: &[i32], frames_to_confirm: &[u32]) -> bool` (returns `true` once converged), `best_params(&self) -> CalibrationParams`, `best_score(&self) -> f32`, `last_round_had_no_signal(&self) -> bool`, `round_count(&self) -> usize`. Used directly by Task 5 (desktop Tauri commands).

- [ ] **Step 1: Write the failing test** — append to the `#[cfg(test)]` module in `rust/src/calibration.rs`:

```rust
    #[test]
    fn test_session_drives_rounds_to_convergence() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, start);
        assert_eq!(session.round_count(), 0);
        let first_notes = session.current_round().notes.clone();
        assert_eq!(first_notes, vec![60, 66, 72]);

        // First attempt misses the middle note.
        let converged = session.record_round(&[60, -1, 72], &[3, 0, 3]);
        assert!(!converged);
        assert_eq!(session.round_count(), 1);
        assert!(session.current_round().params.silence_threshold < start.silence_threshold);

        // Second attempt: everything confirmed correctly.
        let next_notes = session.current_round().notes.clone();
        let converged = session.record_round(&next_notes, &vec![3; next_notes.len()]);
        assert!(converged);
        assert_eq!(session.best_params(), session.current_round().params);
        assert_eq!(session.best_score(), 1.0);
    }

    #[test]
    fn test_last_round_had_no_signal() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, start);
        let notes = session.current_round().notes.clone();
        assert!(!session.last_round_had_no_signal()); // no rounds recorded yet
        session.record_round(&vec![-1; notes.len()], &vec![0; notes.len()]);
        assert!(session.last_round_had_no_signal());
    }

    #[test]
    fn test_last_round_had_signal_when_at_least_one_note_detected() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, start);
        let notes = session.current_round().notes.clone();
        session.record_round(&[notes[0], -1, -1], &[3, 0, 0]);
        assert!(!session.last_round_had_no_signal());
    }

    #[test]
    fn test_session_best_params_survives_a_worse_final_round() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, start);
        let r1_notes = session.current_round().notes.clone();
        session.record_round(&r1_notes.clone(), &vec![3; r1_notes.len()]); // perfect round 1
        // best_params must reflect round 1's (perfect) params even though session
        // logically would have already converged — verifies best_params doesn't
        // require convergence to have happened.
        assert_eq!(session.best_params().silence_threshold, start.silence_threshold);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --package ear_ring_core calibration::tests::test_session`
Expected: FAIL — `CalibrationSession` doesn't exist yet.

- [ ] **Step 3: Implement** — append to `rust/src/calibration.rs` (above the test module):

```rust
/// Drives one calibration run: owns round history and hands out the next round
/// to present until convergence. Platform code owns audio I/O; this owns the
/// decision of what to test next and when to stop.
pub struct CalibrationSession {
    range_start: i32,
    range_end: i32,
    starting_params: CalibrationParams,
    history: Vec<(CalibrationRound, CalibrationScore)>,
    pending_round: CalibrationRound,
}

impl CalibrationSession {
    pub fn new(range_start: i32, range_end: i32, starting_params: CalibrationParams) -> Self {
        let pending_round = next_calibration_round(range_start, range_end, starting_params, &[]);
        Self {
            range_start,
            range_end,
            starting_params,
            history: Vec::new(),
            pending_round,
        }
    }

    pub fn current_round(&self) -> &CalibrationRound {
        &self.pending_round
    }

    /// Record the outcome of the current round. Returns `true` once calibration
    /// has converged (caller should stop and read `best_params()`); otherwise
    /// `current_round()` now returns the next round to present.
    pub fn record_round(&mut self, detected: &[i32], frames_to_confirm: &[u32]) -> bool {
        let score = score_round(&self.pending_round.notes, detected, frames_to_confirm);
        self.history.push((self.pending_round.clone(), score));
        if is_converged(&self.history) {
            return true;
        }
        self.pending_round = next_calibration_round(self.range_start, self.range_end, self.starting_params, &self.history);
        false
    }

    pub fn best_params(&self) -> CalibrationParams {
        best_params(&self.history, self.starting_params)
    }

    /// Highest `total_score` seen across all recorded rounds (0.0 if none yet).
    pub fn best_score(&self) -> f32 {
        self.history.iter().map(|(_, s)| s.total_score).fold(0.0, f32::max)
    }

    /// True when the most recently recorded round detected nothing at all (every
    /// slot missed) — a mic-permission/hardware problem, not a tuning problem.
    /// Platform code should stop and surface an error rather than let the
    /// directional-nudge loop keep iterating on zero data (spec: Error handling).
    pub fn last_round_had_no_signal(&self) -> bool {
        self.history
            .last()
            .map(|(_, score)| score.detected.iter().all(|&d| d == -1))
            .unwrap_or(false)
    }

    pub fn round_count(&self) -> usize {
        self.history.len()
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --package ear_ring_core calibration::`
Expected: PASS. Then `cargo test` for the full workspace.

- [ ] **Step 5: Commit**

```bash
git add rust/src/calibration.rs
git commit -m "Rust: add CalibrationSession — stateful round-loop wrapper"
```

---

### Task 4: Export calibration types from `lib.rs`

**Files:**
- Modify: `rust/src/lib.rs:5-18`

**Interfaces:**
- Consumes: `calibration::{CalibrationParams, CalibrationRound, CalibrationScore, CalibrationSession, MAX_NOTES_PER_ROUND, ROUND_CAP, PER_NOTE_TIMEOUT_FRAMES}` (Task 2/3).
- Produces: these names available as `ear_ring_core::*` for desktop's `use ear_ring_core::{...}` (Task 5).

- [ ] **Step 1: Add the re-export**

In `rust/src/lib.rs`, after the existing `pub use tracker::{FrameResult, PitchTracker};` line, add:
```rust
pub use calibration::{
    CalibrationParams, CalibrationRound, CalibrationScore, CalibrationSession,
    MAX_NOTES_PER_ROUND, ROUND_CAP, PER_NOTE_TIMEOUT_FRAMES,
};
```

- [ ] **Step 2: Verify the workspace still builds clean**

Run: `cargo build` (from repo root)
Expected: builds with no errors (this step has no new test of its own — Task 5's desktop build is the real consumer check — but confirm no naming collisions were introduced).

- [ ] **Step 3: Commit**

```bash
git add rust/src/lib.rs
git commit -m "Rust: re-export calibration types from lib.rs"
```

---

### Task 5: Desktop Tauri commands for tracker advanced params and calibration

**Files:**
- Modify: `desktop/src-tauri/src/main.rs`

**Interfaces:**
- Consumes: `ear_ring_core::{PitchTracker, CalibrationSession, CalibrationParams}` (Tasks 1-4).
- Produces (new `#[tauri::command]` functions, registered in the existing `invoke_handler`): `cmd_tracker_set_advanced_params(grace_frames: u32, octave_correction: bool, yin_threshold: f32)`, `cmd_calibration_start(range_start: i32, range_end: i32, silence_threshold: f32, required_frames: u32, warmup_frames: u32, grace_frames: u32, octave_correction: bool, yin_threshold: f32) -> Vec<i32>` (returns round 1's notes), `cmd_calibration_current_params() -> (f32, u32, u32, u32, bool, f32)`, `cmd_calibration_record_round(detected: Vec<i32>, frames_to_confirm: Vec<u32>) -> (bool, Vec<i32>)` (returns `(converged, next_round_notes)`, `next_round_notes` empty when `converged`), `cmd_calibration_best_params() -> (f32, u32, u32, u32, bool, f32)`, `cmd_calibration_best_score() -> f32`, `cmd_calibration_last_round_no_signal() -> bool`, `cmd_calibration_round_count() -> usize`.

- [ ] **Step 1: Add `CalibrationState` and register it**

Near the top of `desktop/src-tauri/src/main.rs`, alongside `struct TrackerState(Mutex<PitchTracker>);`, add:
```rust
struct CalibrationState(Mutex<Option<CalibrationSession>>);
```
Update the `use ear_ring_core::{...}` import block to add `CalibrationSession, CalibrationParams` to the list.

Find where `TrackerState` is registered with `.manage(...)` in the `tauri::Builder` setup and add a sibling line registering `CalibrationState(Mutex::new(None))`.

- [ ] **Step 2: Add `cmd_tracker_set_advanced_params`**

Directly below the existing `cmd_tracker_apply_instrument` command, add:
```rust
/// Directly set the previously-hidden per-instrument/global detection params
/// (grace frames, octave correction, YIN threshold) — used by both manual
/// Advanced-section edits and Auto-Calibrate applying a round's params.
#[tauri::command]
fn cmd_tracker_set_advanced_params(state: State<TrackerState>, grace_frames: u32, octave_correction: bool, yin_threshold: f32) {
    let mut tracker = state.0.lock().unwrap();
    tracker.grace_frames = grace_frames;
    tracker.octave_correction = octave_correction;
    tracker.yin_threshold = yin_threshold;
}
```

- [ ] **Step 3: Add the calibration commands**

In the "Other commands" section, add:
```rust
// ── Calibration commands ─────────────────────────────────────────────────────

#[tauri::command]
fn cmd_calibration_start(
    state: State<CalibrationState>,
    range_start: i32,
    range_end: i32,
    silence_threshold: f32,
    required_frames: u32,
    warmup_frames: u32,
    grace_frames: u32,
    octave_correction: bool,
    yin_threshold: f32,
) -> Vec<i32> {
    let starting = CalibrationParams {
        silence_threshold,
        required_frames,
        warmup_frames,
        grace_frames,
        octave_correction,
        yin_threshold,
    };
    let session = CalibrationSession::new(range_start, range_end, starting);
    let notes = session.current_round().notes.clone();
    *state.0.lock().unwrap() = Some(session);
    notes
}

fn params_tuple(p: ear_ring_core::CalibrationParams) -> (f32, u32, u32, u32, bool, f32) {
    (p.silence_threshold, p.required_frames, p.warmup_frames, p.grace_frames, p.octave_correction, p.yin_threshold)
}

#[tauri::command]
fn cmd_calibration_current_params(state: State<CalibrationState>) -> (f32, u32, u32, u32, bool, f32) {
    let guard = state.0.lock().unwrap();
    params_tuple(guard.as_ref().expect("calibration not started").current_round().params)
}

#[tauri::command]
fn cmd_calibration_record_round(state: State<CalibrationState>, detected: Vec<i32>, frames_to_confirm: Vec<u32>) -> (bool, Vec<i32>) {
    let mut guard = state.0.lock().unwrap();
    let session = guard.as_mut().expect("calibration not started");
    let converged = session.record_round(&detected, &frames_to_confirm);
    let next_notes = if converged { Vec::new() } else { session.current_round().notes.clone() };
    (converged, next_notes)
}

#[tauri::command]
fn cmd_calibration_best_params(state: State<CalibrationState>) -> (f32, u32, u32, u32, bool, f32) {
    let guard = state.0.lock().unwrap();
    params_tuple(guard.as_ref().expect("calibration not started").best_params())
}

#[tauri::command]
fn cmd_calibration_best_score(state: State<CalibrationState>) -> f32 {
    let guard = state.0.lock().unwrap();
    guard.as_ref().map(|s| s.best_score()).unwrap_or(0.0)
}

#[tauri::command]
fn cmd_calibration_last_round_no_signal(state: State<CalibrationState>) -> bool {
    let guard = state.0.lock().unwrap();
    guard.as_ref().map(|s| s.last_round_had_no_signal()).unwrap_or(false)
}

#[tauri::command]
fn cmd_calibration_round_count(state: State<CalibrationState>) -> usize {
    let guard = state.0.lock().unwrap();
    guard.as_ref().map(|s| s.round_count()).unwrap_or(0)
}
```

- [ ] **Step 4: Register the new commands**

In the `tauri::generate_handler![...]` list (same list containing `cmd_tracker_process`, `cmd_detect_pitch`, etc.), add: `cmd_tracker_set_advanced_params, cmd_calibration_start, cmd_calibration_current_params, cmd_calibration_record_round, cmd_calibration_best_params, cmd_calibration_best_score, cmd_calibration_last_round_no_signal, cmd_calibration_round_count,`.

- [ ] **Step 5: Build to verify**

Run: `cd desktop/src-tauri && cargo build`
Expected: builds with no errors. (Tauri commands aren't unit-testable in isolation without a running app in this codebase's existing pattern — none of the other `cmd_*` functions have dedicated Rust tests either; correctness here rides on Task 2/3's Rust unit tests plus Task 8's manual verification.)

- [ ] **Step 6: Commit**

```bash
git add desktop/src-tauri/src/main.rs
git commit -m "Desktop: add Tauri commands for advanced tracker params and calibration"
```

---

### Task 6: `ExerciseSettings` fields for the newly-exposed params and per-instrument calibration storage

**Files:**
- Modify: `desktop/src/types.ts:17-40` (`ExerciseSettings` interface)
- Modify: `desktop/src/App.tsx` (`defaultSettings`)

**Interfaces:**
- Produces: `ExerciseSettings` gains `graceFrames: number`, `octaveCorrection: boolean`, `yinThreshold: number`, `calibrationParamsByInstrument: Record<number, { silenceThreshold: number; framesToConfirm: number; warmupFrames: number; graceFrames: number; octaveCorrection: boolean; yinThreshold: number }>`. Consumed by Task 7/8.

- [ ] **Step 1: Extend the type**

In `desktop/src/types.ts`, add to `ExerciseSettings` (after the existing `warmupFrames: number;` line):
```ts
  graceFrames: number;        // default 3 (Piano) — previously hidden per-instrument constant
  octaveCorrection: boolean;  // default false (Piano) — previously hidden per-instrument constant
  yinThreshold: number;       // default 0.15 — previously hidden global constant
  /** Saved Auto-Calibrate results per instrument index. Falls back to the
   *  INSTRUMENTS table's defaults (grace/octave) and the flat fields above
   *  (sliders) when an instrument has never been calibrated. */
  calibrationParamsByInstrument: Record<number, {
    silenceThreshold: number;
    framesToConfirm: number;
    warmupFrames: number;
    graceFrames: number;
    octaveCorrection: boolean;
    yinThreshold: number;
  }>;
```

- [ ] **Step 2: Extend `defaultSettings`**

In `desktop/src/App.tsx`, inside the `defaultSettings` object literal (near the existing `silenceThreshold: 0.003, framesToConfirm: 3, warmupFrames: 4,` lines), add:
```ts
    graceFrames: 3,
    octaveCorrection: false,
    yinThreshold: 0.15,
    calibrationParamsByInstrument: {},
```

- [ ] **Step 3: Verify the app still builds and existing settings still round-trip**

Run: `just desktop` (runs `npm run build`, i.e. `tsc && vite build`, inside `desktop/`)
Expected: no type errors. The existing `{ ...defaultSettings, ...JSON.parse(raw) }` merge in `App.tsx`'s settings loader means old localStorage blobs (missing the new fields) still load fine, picking up these defaults — no migration code needed.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/types.ts desktop/src/App.tsx
git commit -m "Desktop: add settings fields for advanced detection params and per-instrument calibration"
```

---

### Task 7: `SetupScreen.tsx` — Manual/Auto-Calibrate tabs and the Advanced disclosure

**Files:**
- Modify: `desktop/src/components/SetupScreen.tsx`

**Interfaces:**
- Consumes: `ExerciseSettings.graceFrames/octaveCorrection/yinThreshold` (Task 6), `cmd_tracker_set_advanced_params` (Task 5).
- Produces: `mode` state (`'manual' | 'auto'`) and the manual-tab Advanced disclosure, which Task 8 builds the Auto-Calibrate tab's content alongside.

- [ ] **Step 1: Add tab state and the segmented control**

In `SetupScreen.tsx`, add new props for the 3 previously-hidden values (mirroring how `silenceThreshold`/`framesToConfirm`/`warmupFrames` are already passed in) to the `Props` interface and function signature:
```ts
  graceFrames?: number;
  octaveCorrection?: boolean;
  yinThreshold?: number;
```
```ts
export default function SetupScreen({ onBack, onUpdateSettings, rangeStart, rangeEnd, rootChroma = 0, scaleId = 0, keySignatureMode = 0, silenceThreshold = 0.003, framesToConfirm = 3, warmupFrames = 4, instrumentIndex = 0, graceFrames = 3, octaveCorrection = false, yinThreshold = 0.15 }: Props) {
```

Add mode state right after the existing `const [hz, setHz] = useState(0);` line:
```ts
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [advancedOpen, setAdvancedOpen] = useState(false);
```

In the render, directly below the `screen-header` div and above `<p className="setup-instruction">`, add the segmented control:
```tsx
      <div className="segmented-control" role="tablist">
        <button role="tab" aria-selected={mode === 'manual'}
          className={`segment ${mode === 'manual' ? 'segment-selected' : ''}`}
          onClick={() => setMode('manual')}>Manual</button>
        <button role="tab" aria-selected={mode === 'auto'}
          className={`segment ${mode === 'auto' ? 'segment-selected' : ''}`}
          onClick={() => setMode('auto')}>Auto-Calibrate</button>
      </div>
```

- [ ] **Step 2: Wrap the existing manual controls in a mode check, and add the Advanced disclosure**

Wrap the whole `<div style={{ marginTop: 16 }}>...</div>` block (the 3 existing sliders/chip-rows) in `{mode === 'manual' && (...)}`, and add the Advanced section as its last child, before that div's closing tag:
```tsx
        <button type="button" className="advanced-toggle" onClick={() => setAdvancedOpen(o => !o)}>
          {advancedOpen ? '▾' : '▸'} Advanced
        </button>
        {advancedOpen && (
          <div className="advanced-section">
            <span className="section-label">Grace Frames<TooltipIcon tooltipKey="grace_frames" /></span>
            <div className="chip-row">
              {[0, 1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} type="button"
                  className={`chip ${graceFrames === n ? 'chip-selected' : ''}`}
                  onClick={() => { set('graceFrames', n); void invoke('cmd_tracker_set_advanced_params', { graceFrames: n, octaveCorrection, yinThreshold }); }}>{n}</button>
              ))}
            </div>

            <span className="section-label">Octave Correction<TooltipIcon tooltipKey="octave_correction" /></span>
            <label className="switch-row">
              <input type="checkbox" checked={octaveCorrection}
                onChange={e => { set('octaveCorrection', e.target.checked); void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection: e.target.checked, yinThreshold }); }} />
            </label>

            <span className="section-label">YIN Threshold<TooltipIcon tooltipKey="yin_threshold" /></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={0.05} max={0.30} step={0.01}
                value={yinThreshold}
                onChange={e => { const v = parseFloat(e.target.value); set('yinThreshold', v); void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection, yinThreshold: v }); }}
                style={{ flex: 1 }} />
              <span style={{ minWidth: 40, fontSize: 13, color: '#212121' }}>{yinThreshold.toFixed(2)}</span>
            </div>
          </div>
        )}
```

Add two entries to `rust/src/tooltips.md` (the file `ear_ring_tooltip_content()` parses — check its existing `## key` / body format from an existing entry like `mic_sensitivity` and match it exactly) for `grace_frames`, `octave_correction`, and `yin_threshold`, one short sentence each explaining what the control does, matching this repo's existing tooltip copy style (per `AGENTS.md`'s Code Comment Style / copy conventions).

- [ ] **Step 2b: Apply the advanced params on screen entry, same as the existing 3**

In the existing `useEffect` that calls `cmd_tracker_set_params`/`cmd_tracker_reset_with_warmup` on mount, add a call to the new command right after `cmd_tracker_set_params`:
```ts
    void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection, yinThreshold });
```
(Leave the effect's dependency array as-is, matching the existing pattern where `silenceThreshold`/`framesToConfirm`/`warmupFrames` aren't in the deps either — this mirrors the screen's existing "configure once on entry" comment.)

- [ ] **Step 3: Manual verification** (no automated test — this is a pure UI change to an existing manually-tested screen, consistent with how the other Mic Setup controls are verified)

Run: `just desktop-launch` (runs `cargo tauri dev`, hot-reload) and confirm: Manual/Auto-Calibrate tabs render and switch; the 3 original sliders still work exactly as before; the Advanced disclosure expands/collapses and its 3 controls change live detection behavior (e.g. toggling Octave Correction on a held note).

- [ ] **Step 4: Commit**

```bash
git add desktop/src/components/SetupScreen.tsx rust/src/tooltips.md
git commit -m "Desktop: add Manual/Auto-Calibrate tabs and Advanced params disclosure to Mic Setup"
```

---

### Task 8: `SetupScreen.tsx` — Auto-Calibrate round loop

**Files:**
- Modify: `desktop/src/components/SetupScreen.tsx`

**Interfaces:**
- Consumes: `cmd_calibration_start/current_params/record_round/best_params/best_score/round_count` (Task 5), `useAudioPlayback().playSequence` (existing hook, `desktop/src/hooks/useAudioPlayback.ts:196-246`), `useAudioCapture` (existing hook, already in this file), `MAX_NOTES_PER_ROUND` isn't imported here (frontend just reflects whatever `notes.length` the backend returns — no hardcoded "3" on the frontend).
- Produces: the Auto-Calibrate tab's full UI + capture/scoring loop; on completion, writes the result into `calibrationParamsByInstrument[instrumentIndex]` via `onUpdateSettings`.

- [ ] **Step 1: Add calibration run state and the note-by-note capture logic**

Add the playback hook alongside the existing `useAudioCapture` import:
```ts
import { useAudioPlayback } from '../hooks/useAudioPlayback';
```
```ts
  const { playSequence } = useAudioPlayback();
```

Add state for the running calibration (near the existing `mode`/`advancedOpen` state):
```ts
  const [roundNotes, setRoundNotes] = useState<number[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);      // which note within the round we're listening for
  const [roundNumber, setRoundNumber] = useState(0);
  const [calibrating, setCalibrating] = useState(false);
  const [bestScoreSoFar, setBestScoreSoFar] = useState<number | null>(null);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [calibrationDone, setCalibrationDone] = useState<null | { silenceThreshold: number; framesToConfirm: number; warmupFrames: number; graceFrames: number; octaveCorrection: boolean; yinThreshold: number }>(null);
  const [roundNoteLabels, setRoundNoteLabels] = useState<string[]>([]);
  const roundDetectedRef = useRef<number[]>([]);
  const roundFramesRef = useRef<number[]>([]);
  const noteFrameCountRef = useRef(0);
  const capturingRef = useRef(false); // guards against the manual-mode handleFrame firing during auto mode
```

- [ ] **Step 2: Write the per-note capture callback**

Add a new callback, separate from the existing `handleFrame` (which stays exactly as-is for Manual mode):
```ts
  const beginRound = useCallback(async (notes: number[]) => {
    const params = await invoke<[number, number, number, number, boolean, number]>('cmd_calibration_current_params');
    const [st, rf, wf, gf, oc, yt] = params;
    await invoke('cmd_tracker_set_params', { silenceThreshold: st, requiredFrames: rf });
    await invoke('cmd_tracker_set_advanced_params', { graceFrames: gf, octaveCorrection: oc, yinThreshold: yt });
    roundDetectedRef.current = [];
    roundFramesRef.current = [];
    setRoundIndex(0);
    setCalibrating(true);
    await playSequence(notes, () => {}, () => {}, 100);
    await invoke('cmd_tracker_reset_with_warmup', { warmupFrames: wf });
    noteFrameCountRef.current = 0;
  }, [playSequence]);

  const startCalibrationRun = useCallback(async () => {
    setCalibrationDone(null);
    setCalibrationError(null);
    setBestScoreSoFar(null);
    setRoundNumber(1);
    capturingRef.current = true;
    const notes = await invoke<number[]>('cmd_calibration_start', {
      rangeStart, rangeEnd,
      silenceThreshold, requiredFrames: framesToConfirm, warmupFrames,
      graceFrames, octaveCorrection, yinThreshold,
    });
    setRoundNotes(notes);
    await beginRound(notes);
  }, [rangeStart, rangeEnd, silenceThreshold, framesToConfirm, warmupFrames, graceFrames, octaveCorrection, yinThreshold, beginRound]);

  // Resolve each round's MIDI notes to display labels (e.g. "C4") for the text
  // prompt, the same written/transposed label the rest of the app uses.
  useEffect(() => {
    if (roundNotes.length === 0) { setRoundNoteLabels([]); return; }
    let cancelled = false;
    Promise.all(roundNotes.map(m => invoke<string>('cmd_written_midi_label', { concertMidi: m, instrumentIndex })))
      .then(labels => { if (!cancelled) setRoundNoteLabels(labels); });
    return () => { cancelled = true; };
  }, [roundNotes, instrumentIndex]);

  // Shared by every path that ends a calibration run early or normally (perfect
  // round, plateau/round-cap convergence, no-signal abort, or the user's Stop
  // button): read whatever the session's best-scoring round was, apply it live,
  // and persist it for this instrument. `errorMessage` is non-null only for the
  // no-signal abort path — every other caller passes null (spec: Error handling
  // — "keep whatever was the best-scoring round so far" applies uniformly).
  const finishCalibration = useCallback(async (errorMessage: string | null) => {
    capturingRef.current = false;
    setCalibrating(false);
    const best = await invoke<[number, number, number, number, boolean, number]>('cmd_calibration_best_params');
    const [st, rf, wf, gf, oc, yt] = best;
    const result = { silenceThreshold: st, framesToConfirm: rf, warmupFrames: wf, graceFrames: gf, octaveCorrection: oc, yinThreshold: yt };
    onUpdateSettings(prev => ({
      ...prev,
      silenceThreshold: st, framesToConfirm: rf, warmupFrames: wf,
      graceFrames: gf, octaveCorrection: oc, yinThreshold: yt,
      calibrationParamsByInstrument: { ...prev.calibrationParamsByInstrument, [instrumentIndex]: result },
    }));
    await invoke('cmd_tracker_set_params', { silenceThreshold: st, requiredFrames: rf });
    await invoke('cmd_tracker_set_advanced_params', { graceFrames: gf, octaveCorrection: oc, yinThreshold: yt });
    setCalibrationDone(result);
    setCalibrationError(errorMessage);
  }, [instrumentIndex, onUpdateSettings]);

  const handleCalibrationFrame = useCallback(async (frame: TrackerFrame) => {
    if (!capturingRef.current) return;
    noteFrameCountRef.current += 1;
    let detected = -1;
    let frames = 0;
    if (frame.confirmedMidi >= 0) {
      detected = frame.confirmedMidi;
      frames = noteFrameCountRef.current;
    } else if (noteFrameCountRef.current >= 55 /* PER_NOTE_TIMEOUT_FRAMES */) {
      detected = -1;
      frames = 0;
    } else {
      return; // still listening for this note
    }

    roundDetectedRef.current = [...roundDetectedRef.current, detected];
    roundFramesRef.current = [...roundFramesRef.current, frames];
    await invoke('cmd_tracker_reset');
    noteFrameCountRef.current = 0;

    if (roundDetectedRef.current.length < roundNotes.length) {
      setRoundIndex(i => i + 1);
      return;
    }

    // Round complete — score it and either move on, finish, or abort on silence.
    const [converged, nextNotes] = await invoke<[boolean, number[]]>('cmd_calibration_record_round', {
      detected: roundDetectedRef.current,
      framesToConfirm: roundFramesRef.current,
    });
    const score = await invoke<number>('cmd_calibration_best_score');
    setBestScoreSoFar(score);

    const noSignal = await invoke<boolean>('cmd_calibration_last_round_no_signal');
    if (noSignal) {
      await finishCalibration('No sound detected — check mic permissions/input.');
      return;
    }
    if (converged) {
      await finishCalibration(null);
    } else {
      setRoundNumber(n => n + 1);
      setRoundNotes(nextNotes);
      beginRound(nextNotes);
    }
  }, [roundNotes, beginRound, finishCalibration]);

  const stopCalibration = useCallback(async () => {
    await finishCalibration(null);
  }, [finishCalibration]);
```

- [ ] **Step 3: Wire `handleCalibrationFrame` into capture when in Auto mode**

Replace the existing single `useEffect` that calls `start(handleFrame)` with one that picks the active callback based on `mode`:
```ts
  useEffect(() => {
    void invoke('cmd_tracker_set_params', { silenceThreshold, requiredFrames: framesToConfirm });
    void invoke('cmd_tracker_set_advanced_params', { graceFrames, octaveCorrection, yinThreshold });
    void invoke('cmd_tracker_reset_with_warmup', { warmupFrames });
    start(mode === 'auto' ? handleCalibrationFrame : handleFrame);
    return () => {
      // Spec (Error handling): navigating away or switching back to Manual
      // mid-run must not silently discard progress — keep whatever was the
      // best-scoring round so far, same as an explicit Stop. Fire-and-forget:
      // this cleanup can't be async, and the component may already be
      // unmounting, but the invoke calls and onUpdateSettings still complete.
      if (capturingRef.current) {
        void finishCalibration(null);
      }
      stop();
      void invoke('cmd_tracker_reset');
      destroy();
    };
  }, [start, stop, destroy, handleFrame, handleCalibrationFrame, finishCalibration, mode]);
```
(Note: switching `mode` re-runs this effect, which tears down and restarts capture with the right callback — matching the existing cleanup-on-unmount pattern, just re-triggered on mode change too.)

- [ ] **Step 4: Add the Auto-Calibrate tab's UI**

Add this block to the render, guarded by `{mode === 'auto' && (...)}`, placed where the Manual tab's controls are (siblings, mutually exclusive with the `{mode === 'manual' && (...)}` block from Task 7):
```tsx
      {mode === 'auto' && (
        <div style={{ marginTop: 16 }}>
          {!calibrating && !calibrationDone && (
            <button type="button" className="btn-primary" onClick={() => void startCalibrationRun()}>
              Start Auto-Calibrate
            </button>
          )}
          {calibrating && (
            <>
              <p className="setup-instruction">Round {roundNumber} — Play: {roundNoteLabels.length === roundNotes.length ? roundNoteLabels.join(' → ') : '…'}</p>
              <p className="setup-instruction" style={{ fontSize: 13, opacity: 0.7 }}>Note {roundIndex + 1} of {roundNotes.length}</p>
              {bestScoreSoFar !== null && (
                <p className="setup-instruction" style={{ fontSize: 13, opacity: 0.7 }}>Best so far: {Math.round(bestScoreSoFar * 100)}%</p>
              )}
              <button type="button" className="btn-secondary" onClick={() => void stopCalibration()}>Stop</button>
            </>
          )}
          {calibrationDone && (
            <div>
              {calibrationError ? (
                <p className="setup-instruction" style={{ color: '#b00020' }}>{calibrationError}</p>
              ) : (
                <p className="setup-instruction">Calibration complete for this instrument.</p>
              )}
              <p style={{ fontSize: 13 }}>
                {calibrationError ? 'Best result kept: ' : ''}Sensitivity threshold {calibrationDone.silenceThreshold.toFixed(4)}, stability {calibrationDone.framesToConfirm}, warmup {calibrationDone.warmupFrames}, grace {calibrationDone.graceFrames}, octave correction {calibrationDone.octaveCorrection ? 'on' : 'off'}, YIN {calibrationDone.yinThreshold.toFixed(2)}.
              </p>
              <button type="button" className="btn-secondary" onClick={() => setMode('manual')}>View in Manual</button>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Manual verification** (full end-to-end — this is exactly the kind of device/acoustic behavior unit tests can't cover, per the spec's Testing section)

Run: `just desktop-launch`, go to Mic Setup, switch to Auto-Calibrate, run a full session on the real desktop mic. Confirm: round prompts show as text and on the staff; playback plays the reference notes; each note is captured and the round completes; the "Best so far" percentage updates after each round; params visibly change round-to-round when detection is deliberately made to fail (e.g. mute the mic briefly to force a miss); a perfect round converges and stops; muting the mic for an ENTIRE round shows the "No sound detected" message rather than continuing to iterate; Stop mid-run keeps the best params found; switching to Manual mid-run (without hitting Stop) also keeps the best params found (the navigate-away path); switching to Manual afterward shows the calibrated values, including the previously-hidden Advanced ones.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/components/SetupScreen.tsx
git commit -m "Desktop: implement Auto-Calibrate round loop on Mic Setup"
```

---

### Task 9: Full-suite regression check and branch wrap-up

**Files:** none (verification only)

- [ ] **Step 1: Run the full Rust suite**

Run: `cargo test` (repo root)
Expected: PASS — every test from Tasks 1-4 plus all pre-existing `tracker.rs`/`pitch_detection.rs`/`music_theory.rs` tests.

- [ ] **Step 2: Run the desktop build**

Run: `cd desktop/src-tauri && cargo build` and `just desktop` (frontend typecheck + build)
Expected: both succeed with no errors or new warnings.

- [ ] **Step 3: Manual end-to-end pass** (per spec's Testing section — this is the one part of the feature that fundamentally needs a real mic/room, not unit tests)

Run a full Auto-Calibrate session on the actual desktop hardware for at least two different instruments (e.g. Piano and Guitar), confirming saved params differ sensibly per instrument and persist across an app restart (`calibrationParamsByInstrument` surviving in `localStorage`).

- [ ] **Step 4: Final commit / PR readiness check**

Confirm `git status` is clean on `auto_calibrate` aside from expected changes, and that the branch is ready to open a PR (or continue toward Android/iOS in a follow-on plan) — no code step here, just confirm state before handing off.
