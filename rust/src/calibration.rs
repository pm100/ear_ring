/// Auto-calibration for mic detection parameters (Mic Setup Auto-Calibrate mode).
///
/// Round generation and scoring decision logic only — no audio I/O. Platform code
/// captures one note at a time per round (up to MAX_NOTES_PER_ROUND), applying a
/// per-note timeout (PER_NOTE_TIMEOUT_FRAMES), and passes the results here to be
/// scored and to decide the next round.
///
/// Depends on `music_theory::ScaleType` (and its `intervals()`) so calibration
/// notes are constrained to the user's selected scale/key — the same in-scale
/// filtering `music_theory::generate_sequence` already applies for real exercises.
/// This is a deliberate exception to this module's earlier "pure, zero-other-
/// module-dependency" design; `tracker.rs` already depends on `music_theory` the
/// same way for other things.
use crate::music_theory::ScaleType;

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

/// Cap on how many notes a single round can grow to. Rounds start at 1 note and
/// ramp up by one on each perfect round (see `next_calibration_round`).
pub const MAX_NOTES_PER_ROUND: usize = 3;
pub const ROUND_CAP: usize = 8;
pub const PER_NOTE_TIMEOUT_FRAMES: u32 = 55;

pub fn score_round(expected: &[i32], detected: &[i32], frames_to_confirm: &[u32]) -> CalibrationScore {
    let hits = expected.iter().zip(detected.iter()).filter(|(&e, &d)| e == d).count();
    let total_score = if expected.is_empty() { 0.0 } else { hits as f32 / expected.len() as f32 };
    CalibrationScore {
        detected: detected.to_vec(),
        frames_to_confirm: frames_to_confirm.to_vec(),
        total_score,
    }
}

/// In-scale MIDI notes within `[range_start, range_end]` for the given root/scale —
/// the pool all calibration round content is drawn from. Mirrors
/// `music_theory::generate_sequence`'s in-scale filtering, adapted to `i32` (this
/// module uses `i32` MIDI values with `-1` as a "missed" sentinel, so it uses
/// `.rem_euclid(12)` instead of the `+ 12 % 12` trick `generate_sequence` needs for
/// its unsigned `u8` values).
fn scale_pool(range_start: i32, range_end: i32, root_chroma: u8, scale: ScaleType) -> Vec<i32> {
    use std::collections::HashSet;
    let intervals: HashSet<u8> = scale.intervals().iter().copied().collect();
    let root_chroma = (root_chroma % 12) as i32;
    (range_start..=range_end)
        .filter(|&m| {
            let interval = (m - root_chroma).rem_euclid(12) as u8;
            intervals.contains(&interval)
        })
        .collect()
}

/// Pick `n` notes from `pool` as an evenly-spaced spread across it — generalizes
/// the old fixed low/mid/high 3-way spread to any round size. `n == 1` picks the
/// pool's middle element (a sensible single starting note in the spirit of the old
/// "start broad" idea, just for one note). `n` is capped at `pool.len()`: a pool
/// smaller than the requested round size just returns every note the pool has.
fn spread_notes(pool: &[i32], n: usize) -> Vec<i32> {
    if pool.is_empty() || n == 0 {
        return Vec::new();
    }
    let n = n.min(pool.len());
    if n == 1 {
        return vec![pool[pool.len() / 2]];
    }
    (0..n).map(|i| pool[i * (pool.len() - 1) / (n - 1)]).collect()
}

/// Extend `notes` up to `target_len` by walking outward from `notes[0]`'s position
/// in `pool` (+1, -1, +2, -2, …), skipping pool notes already present so the extra
/// probes are distinct notes rather than the same one repeated — same duplicate-
/// avoiding spirit as the old range-offset walk, just walking the (already scale-
/// constrained) pool's indices instead of raw MIDI offsets. Only a pool too small
/// to offer a fresh note falls back to duplicating `notes[0]`.
fn pad_with_nearby_pool_notes(notes: &mut Vec<i32>, target_len: usize, pool: &[i32]) {
    if notes.is_empty() {
        match pool.get(pool.len() / 2) {
            Some(&mid) => notes.push(mid),
            None => return, // empty pool: nothing to pad with
        }
    }
    let base = notes[0];
    let base_idx = pool.iter().position(|&x| x == base).unwrap_or(0) as i32;
    let pool_len = pool.len() as i32;
    for offset in 1..=pool_len {
        for candidate_idx in [base_idx + offset, base_idx - offset] {
            if notes.len() >= target_len {
                break;
            }
            if candidate_idx < 0 || candidate_idx >= pool_len {
                continue;
            }
            let candidate = pool[candidate_idx as usize];
            if notes.contains(&candidate) {
                continue;
            }
            notes.push(candidate);
        }
        if notes.len() >= target_len {
            break;
        }
    }
    while notes.len() < target_len {
        notes.push(base);
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
///
/// Round CONTENT and SIZE: notes are always drawn from the in-scale pool for
/// `root_chroma`/`scale` (see `scale_pool`). Round size ramps rather than being
/// fixed: round 1 is a single note; each later round's size is derived from the
/// PREVIOUS round's outcome — perfect (`total_score >= 1.0`) ramps the size up by
/// one (capped at `MAX_NOTES_PER_ROUND`) and probes a fresh spread across the pool;
/// anything less than perfect drops the size back by one (never below 1) and
/// retests the specific failing note(s), trimmed/padded to the new size.
pub fn next_calibration_round(
    range_start: i32,
    range_end: i32,
    root_chroma: u8,
    scale: ScaleType,
    starting_params: CalibrationParams,
    history: &[(CalibrationRound, CalibrationScore)],
) -> CalibrationRound {
    let pool = scale_pool(range_start, range_end, root_chroma, scale);

    if history.is_empty() {
        return CalibrationRound {
            notes: spread_notes(&pool, 1),
            params: starting_params,
        };
    }

    let (last_round, last_score) = history.last().unwrap();
    let mut new_params = last_round.params;
    let mut failing_notes: Vec<i32> = Vec::new();

    // Classify every note first, then apply each nudge AT MOST ONCE for the
    // round. Nudging inside the loop compounded per failing note (3 misses
    // meant silence_threshold * 0.8^3 in one step), far past the "directional
    // nudge" magnitude this design intends.
    let mut any_missed = false;
    let mut any_octave_error = false;
    let mut any_wrong_pitch = false;

    for (i, &expected) in last_round.notes.iter().enumerate() {
        let detected = last_score.detected.get(i).copied().unwrap_or(-1);
        if detected == -1 {
            any_missed = true;
            failing_notes.push(expected);
        } else if detected != expected {
            if (detected - expected).abs() == 12 {
                any_octave_error = true;
            } else {
                any_wrong_pitch = true;
            }
            failing_notes.push(expected);
        }
    }

    if any_missed {
        // Nothing accepted at all: push both gates toward "accept more".
        new_params.silence_threshold = (new_params.silence_threshold * 0.8).max(0.0005);
        new_params.yin_threshold = (new_params.yin_threshold + 0.02).min(0.30);
    }
    if any_octave_error {
        // Sticky-on by design: once an octave error has been seen, correction
        // stays enabled for the rest of the run rather than flipping back off
        // on a later clean round — it's a cheap safety net, and letting it
        // flip-flop would make consecutive rounds non-comparable.
        new_params.octave_correction = true;
    }
    if any_wrong_pitch {
        // Something WAS confidently accepted, just the wrong thing —
        // tighten rather than loosen (see doc comment above).
        new_params.yin_threshold = (new_params.yin_threshold - 0.02).max(0.05);
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

    let perfect = failing_notes.is_empty();
    let target_len = if perfect {
        (last_round.notes.len() + 1).min(MAX_NOTES_PER_ROUND)
    } else {
        (last_round.notes.len() as i32 - 1).max(1) as usize
    };

    let notes = if perfect {
        spread_notes(&pool, target_len)
    } else {
        let mut notes = failing_notes;
        notes.truncate(target_len);
        if notes.len() < target_len {
            // Pad by walking outward through the pool from the first failing
            // note, so the extra probes are distinct in-scale notes rather than
            // the same one repeated. Only a pool too narrow to offer a fresh
            // pitch falls back to duplicating.
            pad_with_nearby_pool_notes(&mut notes, target_len, &pool);
        }
        notes
    };

    CalibrationRound { notes, params: new_params }
}

/// Converged when EITHER the round-count safety backstop is reached, OR the most
/// recent round scored perfectly (`total_score >= 1.0`) AND its size was already
/// at `MAX_NOTES_PER_ROUND` — i.e. the ramp made it all the way up and nailed it
/// there. A perfect round below `MAX_NOTES_PER_ROUND` is not "done": it should
/// ramp up further, not stop calibration early.
///
/// The old plateau early-stop (treating several consecutive non-improving raw
/// `total_score`s as "done") is gone: comparing scores across rounds stopped being
/// meaningful once round size varies — a 1-note 100% round and a 3-note 67% round
/// aren't comparable, so "scores aren't improving" can no longer be read off
/// consecutive totals alone.
pub fn is_converged(history: &[(CalibrationRound, CalibrationScore)]) -> bool {
    if history.len() >= ROUND_CAP {
        return true;
    }
    if let Some((round, score)) = history.last() {
        if score.total_score >= 1.0 && round.notes.len() >= MAX_NOTES_PER_ROUND {
            return true;
        }
    }
    false
}

/// Params of the best recorded round: highest `total_score` wins; a tie on score
/// prefers the round that tested MORE notes (`round.notes.len()`) — with variable
/// round sizes, a round that tested more notes is stronger evidence than a smaller
/// round hitting the same percentage; a full tie (same score AND same note count)
/// keeps the EARLIEST round.
///
/// `max_by` would keep the last tied element, handing the run to the more-nudged
/// later round even though nothing showed it was better — a non-converging run is
/// meant to end up at least as good as where it started, not drift. So a later
/// round only takes over on a strictly greater score, or an equal score with
/// strictly more notes tested. `partial_cmp` can't produce `None` for today's
/// `total_score` (a hits/len ratio), but treat an unorderable comparison as a tie
/// rather than panicking.
pub fn best_params(history: &[(CalibrationRound, CalibrationScore)], fallback: CalibrationParams) -> CalibrationParams {
    let mut best: Option<&(CalibrationRound, CalibrationScore)> = None;
    for entry in history {
        let better = match best {
            None => true,
            Some(current) => match entry.1.total_score.partial_cmp(&current.1.total_score) {
                Some(std::cmp::Ordering::Greater) => true,
                Some(std::cmp::Ordering::Equal) => entry.0.notes.len() > current.0.notes.len(),
                _ => false,
            },
        };
        if better {
            best = Some(entry);
        }
    }
    best.map(|(round, _)| round.params).unwrap_or(fallback)
}

/// Drives one calibration run: owns round history and hands out the next round
/// to present until convergence. Platform code owns audio I/O; this owns the
/// decision of what to test next and when to stop.
pub struct CalibrationSession {
    range_start: i32,
    range_end: i32,
    root_chroma: u8,
    scale: ScaleType,
    starting_params: CalibrationParams,
    history: Vec<(CalibrationRound, CalibrationScore)>,
    pending_round: CalibrationRound,
}

impl CalibrationSession {
    pub fn new(
        range_start: i32,
        range_end: i32,
        root_chroma: u8,
        scale: ScaleType,
        starting_params: CalibrationParams,
    ) -> Self {
        let pending_round = next_calibration_round(range_start, range_end, root_chroma, scale, starting_params, &[]);
        Self {
            range_start,
            range_end,
            root_chroma,
            scale,
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
        self.pending_round = next_calibration_round(
            self.range_start,
            self.range_end,
            self.root_chroma,
            self.scale,
            self.starting_params,
            &self.history,
        );
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

    // ── Scale pool ────────────────────────────────────────────────────────────

    #[test]
    fn test_scale_pool_excludes_out_of_scale_notes() {
        // C major within 60..=72: 61,63,66,68,70 are chromatic, not in C major.
        let pool = scale_pool(60, 72, 0, ScaleType::Major);
        assert_eq!(pool, vec![60, 62, 64, 65, 67, 69, 71, 72]);
    }

    #[test]
    fn test_scale_pool_non_major_non_zero_root() {
        // D Dorian (root chroma 2): intervals 0,2,3,5,7,9,10 relative to D →
        // pitch classes {2,4,5,7,9,11,0} (D E F G A B C).
        let scale = ScaleType::Dorian;
        let intervals: std::collections::HashSet<u8> = scale.intervals().iter().copied().collect();
        let pool = scale_pool(50, 74, 2, scale);
        assert!(!pool.is_empty());
        for &m in &pool {
            let interval = (m - 2).rem_euclid(12) as u8;
            assert!(intervals.contains(&interval), "note {m} not in D Dorian");
        }
    }

    // ── Round 1 ───────────────────────────────────────────────────────────────

    #[test]
    fn test_first_round_is_single_note_from_scale_pool() {
        let start = params(0.003);
        let round = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        assert_eq!(round.notes, vec![67]); // pool's middle element (index 4 of 8)
        assert_eq!(round.params, start);
        let intervals = ScaleType::Major.intervals();
        assert!(intervals.contains(&((round.notes[0] as u8) % 12)));
    }

    // ── Directional nudges (unchanged logic, now against a 1-note round 1) ────

    #[test]
    fn test_missed_note_lowers_silence_threshold() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &[-1], &[0]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1, score1)]);
        assert!(round2.params.silence_threshold < start.silence_threshold);
    }

    #[test]
    fn test_octave_mismatch_enables_octave_correction() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        // The single note (67) detected an octave low (55).
        let score1 = score_round(&round1.notes, &[55], &[3]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1, score1)]);
        assert!(round2.params.octave_correction);
    }

    #[test]
    fn test_non_octave_mismatch_tightens_yin_threshold() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        // Detected as a neighboring wrong pitch, not an octave — read as
        // "something was accepted too readily" (noise/false-trigger-shaped), so
        // tighten rather than loosen. See the note above `next_calibration_round`.
        let score1 = score_round(&round1.notes, &[68], &[3]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1, score1)]);
        assert!(round2.params.yin_threshold < start.yin_threshold);
    }

    #[test]
    fn test_missed_note_also_loosens_yin_threshold() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &[-1], &[0]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1, score1)]);
        // A miss pushes both gates toward "accept more": lower silence_threshold
        // (already covered above) and higher yin_threshold.
        assert!(round2.params.yin_threshold > start.yin_threshold);
    }

    #[test]
    fn test_severe_slow_confirm_raises_grace_frames_not_required_frames() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        // Confirmed correctly, but took >4x required_frames — read as
        // dropout-driven restarts, not plain slow onset.
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &[13]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1, score1)]);
        assert!(round2.params.grace_frames > start.grace_frames);
        assert_eq!(round2.params.required_frames, start.required_frames);
    }

    #[test]
    fn test_mild_slow_confirm_lowers_required_frames_not_grace_frames() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        // Confirmed correctly but a bit slow (>2x, <=4x required_frames) — plain
        // slow onset, not a dropout pattern.
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &[7]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1, score1)]);
        assert!(round2.params.required_frames < start.required_frames);
        assert_eq!(round2.params.grace_frames, start.grace_frames);
    }

    #[test]
    fn test_all_notes_missed_nudges_silence_threshold_only_once() {
        let start = params(0.003);
        // Ramp up to a 3-note round so a single round can have multiple failing
        // notes at once.
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &vec![3; round1.notes.len()]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &vec![3; round2.notes.len()]);
        let round3 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1.clone(), score1.clone()), (round2.clone(), score2.clone())],
        );
        assert_eq!(round3.notes.len(), MAX_NOTES_PER_ROUND);

        // All three notes missed. The nudge is per ROUND, not per failing note,
        // so this is one 0.8x step — not 0.8^3.
        let score3 = score_round(&round3.notes, &vec![-1; round3.notes.len()], &vec![0; round3.notes.len()]);
        let round4 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1, score1), (round2, score2), (round3, score3)],
        );
        assert!((round4.params.silence_threshold - start.silence_threshold * 0.8).abs() < 1e-9);
        assert!((round4.params.yin_threshold - (start.yin_threshold + 0.02)).abs() < 1e-6);
    }

    // ── Ramp ──────────────────────────────────────────────────────────────────

    #[test]
    fn test_success_ramps_round_size_up_capped_at_max() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        assert_eq!(round1.notes.len(), 1);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &vec![3; round1.notes.len()]);

        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        assert_eq!(round2.notes.len(), 2);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &vec![3; round2.notes.len()]);

        let round3 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1.clone(), score1.clone()), (round2.clone(), score2.clone())],
        );
        assert_eq!(round3.notes.len(), MAX_NOTES_PER_ROUND);
        let score3 = score_round(&round3.notes, &round3.notes.clone(), &vec![3; round3.notes.len()]);

        // Already at the cap — one more perfect round must not exceed it.
        let round4 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1, score1), (round2, score2), (round3, score3)],
        );
        assert_eq!(round4.notes.len(), MAX_NOTES_PER_ROUND);
    }

    #[test]
    fn test_failure_never_drops_round_size_below_one() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        assert_eq!(round1.notes.len(), 1);
        let score1 = score_round(&round1.notes, &[-1], &[0]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1, score1)]);
        assert_eq!(round2.notes.len(), 1);
    }

    #[test]
    fn test_all_correct_probes_a_fresh_spread() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &[3]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1)]);
        assert_ne!(round2.notes, round1.notes);
        assert_eq!(round2.notes.len(), 2); // ramped up
        assert_eq!(round2.params, round1.params); // no failure => no param change
    }

    #[test]
    fn test_failing_notes_are_retested_next_round() {
        let start = params(0.003);
        // Ramp to a 3-note round.
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &vec![3; round1.notes.len()]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &vec![3; round2.notes.len()]);
        let round3 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1.clone(), score1.clone()), (round2.clone(), score2.clone())],
        );
        assert_eq!(round3.notes.len(), MAX_NOTES_PER_ROUND);

        // Only the middle note of round3 is missed.
        let mut detected = round3.notes.clone();
        detected[1] = -1;
        let mut frames = vec![3; round3.notes.len()];
        frames[1] = 0;
        let score3 = score_round(&round3.notes, &detected, &frames);
        let round4 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1, score1), (round2, score2), (round3.clone(), score3)],
        );
        assert_eq!(round4.notes[0], round3.notes[1], "the missed note is retested first");
        assert_eq!(round4.notes.len(), 2); // dropped back by one (3 - 1)
    }

    #[test]
    fn test_more_failing_notes_than_new_size_are_trimmed() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &vec![3; round1.notes.len()]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &vec![3; round2.notes.len()]);
        let round3 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1.clone(), score1.clone()), (round2.clone(), score2.clone())],
        );
        assert_eq!(round3.notes.len(), MAX_NOTES_PER_ROUND);

        // All three notes missed this time — target size drops to 2, but there
        // are 3 failing notes: excess must be trimmed, not overflow the round.
        let score3 = score_round(&round3.notes, &vec![-1; round3.notes.len()], &vec![0; round3.notes.len()]);
        let round4 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1, score1), (round2, score2), (round3.clone(), score3)],
        );
        assert_eq!(round4.notes.len(), 2, "round size should drop by one, not stay at 3");
        assert_eq!(round4.notes, &round3.notes[..2], "excess failing notes are trimmed, earliest first");
    }

    #[test]
    fn test_padded_round_has_no_duplicate_notes() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &vec![3; round1.notes.len()]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &vec![3; round2.notes.len()]);
        let round3 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1.clone(), score1.clone()), (round2.clone(), score2.clone())],
        );
        assert_eq!(round3.notes.len(), MAX_NOTES_PER_ROUND);

        // Only the middle note fails, so round4 (2 notes: 3-1) is padded by one.
        let mut detected = round3.notes.clone();
        detected[1] = -1;
        let mut frames = vec![3; round3.notes.len()];
        frames[1] = 0;
        let score3 = score_round(&round3.notes, &detected, &frames);
        let round4 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1, score1), (round2, score2), (round3.clone(), score3)],
        );

        assert_eq!(round4.notes.len(), 2);
        assert_eq!(round4.notes[0], round3.notes[1], "the missed note is retested");
        let mut sorted = round4.notes.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 2, "padding repeated a probe note: {:?}", round4.notes);
        assert!(round4.notes.iter().all(|&n| (60..=72).contains(&n)));
    }

    #[test]
    fn test_padding_duplicates_only_when_range_leaves_no_choice() {
        let start = params(0.003);
        // A one-note pool (range 60..=60, C major) has nothing else to probe.
        // Hand-build a 3-note "last round" (as if produced before the pool
        // shrank) where only one of the three notes is wrong, forcing padding
        // from 1 up to 2 notes to duplicate the sole in-range note rather than
        // loop forever.
        let last_round = CalibrationRound { notes: vec![60, 60, 60], params: start };
        let last_score = score_round(&last_round.notes, &[60, 60, -1], &[3, 3, 0]);
        let round = next_calibration_round(60, 60, 0, ScaleType::Major, start, &[(last_round, last_score)]);
        assert_eq!(round.notes, vec![60, 60]);
    }

    // ── Scale constraint (round content) ───────────────────────────────────────

    #[test]
    fn test_rounds_are_scale_constrained_through_ramp_and_failure() {
        let start = params(0.003);
        let root_chroma: u8 = 2; // D
        let scale = ScaleType::Dorian;
        let intervals: std::collections::HashSet<u8> = scale.intervals().iter().copied().collect();
        let assert_in_scale = |notes: &[i32]| {
            for &n in notes {
                let interval = (n - root_chroma as i32).rem_euclid(12) as u8;
                assert!(intervals.contains(&interval), "note {n} not in D Dorian");
            }
        };

        let mut session = CalibrationSession::new(50, 74, root_chroma, scale, start);
        assert_in_scale(&session.current_round().notes);

        // Round 1: perfect → ramps up.
        let r1 = session.current_round().notes.clone();
        session.record_round(&r1, &vec![3; r1.len()]);
        assert_in_scale(&session.current_round().notes);

        // Round 2: total failure → drops back, still scale-constrained.
        let r2 = session.current_round().notes.clone();
        session.record_round(&vec![-1; r2.len()], &vec![0; r2.len()]);
        assert_in_scale(&session.current_round().notes);
    }

    // ── Convergence ───────────────────────────────────────────────────────────

    #[test]
    fn test_perfect_round_below_max_notes_does_not_converge() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        assert_eq!(round1.notes.len(), 1);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &vec![3; round1.notes.len()]);
        assert!(!is_converged(&[(round1, score1)]));
    }

    #[test]
    fn test_perfect_round_at_max_notes_converges() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &round1.notes.clone(), &vec![3; round1.notes.len()]);
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &vec![3; round2.notes.len()]);
        let round3 = next_calibration_round(
            60,
            72,
            0,
            ScaleType::Major,
            start,
            &[(round1.clone(), score1.clone()), (round2.clone(), score2.clone())],
        );
        assert_eq!(round3.notes.len(), MAX_NOTES_PER_ROUND);
        let score3 = score_round(&round3.notes, &round3.notes.clone(), &vec![3; round3.notes.len()]);
        assert!(is_converged(&[(round1, score1), (round2, score2), (round3, score3)]));
    }

    #[test]
    fn test_converges_at_round_cap() {
        let start = params(0.003);
        let round = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let bad_score = score_round(&round.notes, &vec![-1; round.notes.len()], &vec![0; round.notes.len()]);
        let history: Vec<_> = (0..ROUND_CAP).map(|_| (round.clone(), bad_score.clone())).collect();
        assert!(is_converged(&history));
    }

    #[test]
    fn test_flat_imperfect_scores_do_not_converge_now_that_plateau_is_gone() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]); // 1 note
        let flat_score = score_round(&round1.notes, &[-1], &[0]); // 0.0, repeated
        let history: Vec<_> = (0..3).map(|_| (round1.clone(), flat_score.clone())).collect();
        assert!(history.len() < ROUND_CAP);
        assert!(
            !is_converged(&history),
            "flat non-perfect scores must not trigger the removed plateau rule"
        );
    }

    // ── best_params ───────────────────────────────────────────────────────────

    #[test]
    fn test_best_params_keeps_earliest_round_on_full_tie() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]); // 1 note
        let score1 = score_round(&round1.notes, &[-1], &[0]); // 0.0, 1 note
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        assert_eq!(round2.notes.len(), round1.notes.len()); // still 1 note (floor)
        let score2 = score_round(&round2.notes, &[-1], &[0]); // 0.0, 1 note — full tie with round1
        assert!((score1.total_score - score2.total_score).abs() < 1e-6);
        assert_ne!(round1.params, round2.params);
        let best = best_params(&[(round1.clone(), score1), (round2, score2)], start);
        assert_eq!(best, round1.params);
    }

    #[test]
    fn test_best_params_prefers_more_notes_on_score_tie() {
        let start = params(0.003);
        // Round A: 1-note round, perfect (score 1.0).
        let round_a = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score_a = score_round(&round_a.notes, &round_a.notes.clone(), &[3]);
        // Round B: hand-built 2-note round, also perfect (score 1.0) — a tie on
        // total_score, but round B tested more notes and should win.
        let mut params_b = start;
        params_b.silence_threshold = 0.001; // distinguishable from round_a's params
        let round_b = CalibrationRound { notes: vec![60, 64], params: params_b };
        let score_b = score_round(&round_b.notes, &round_b.notes.clone(), &[3, 3]);
        assert!((score_a.total_score - score_b.total_score).abs() < 1e-6);
        let best = best_params(&[(round_a, score_a), (round_b.clone(), score_b)], start);
        assert_eq!(best, round_b.params);
    }

    #[test]
    fn test_best_params_picks_highest_scoring_round() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[]);
        let score1 = score_round(&round1.notes, &vec![-1; round1.notes.len()], &vec![0; round1.notes.len()]); // 0.0
        let round2 = next_calibration_round(60, 72, 0, ScaleType::Major, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &round2.notes.clone(), &vec![3; round2.notes.len()]); // 1.0
        let best = best_params(&[(round1, score1), (round2.clone(), score2)], start);
        assert_eq!(best, round2.params);
    }

    #[test]
    fn test_best_params_falls_back_when_history_empty() {
        let start = params(0.003);
        assert_eq!(best_params(&[], start), start);
    }

    // ── CalibrationSession ────────────────────────────────────────────────────

    #[test]
    fn test_session_drives_rounds_to_convergence_via_ramp() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, 0, ScaleType::Major, start);
        assert_eq!(session.round_count(), 0);
        assert_eq!(session.current_round().notes.len(), 1);

        // Round 1: perfect (1 note) → ramps to 2 notes.
        let r1 = session.current_round().notes.clone();
        let converged = session.record_round(&r1, &vec![3; r1.len()]);
        assert!(!converged);
        assert_eq!(session.current_round().notes.len(), 2);

        // Round 2: perfect (2 notes) → ramps to 3 notes.
        let r2 = session.current_round().notes.clone();
        let converged = session.record_round(&r2, &vec![3; r2.len()]);
        assert!(!converged);
        assert_eq!(session.current_round().notes.len(), MAX_NOTES_PER_ROUND);

        // Round 3: perfect at MAX_NOTES_PER_ROUND → converged.
        let r3 = session.current_round().notes.clone();
        let converged = session.record_round(&r3, &vec![3; r3.len()]);
        assert!(converged);
        assert_eq!(session.best_score(), 1.0);
        assert_eq!(session.best_params(), session.current_round().params);
    }

    #[test]
    fn test_last_round_had_no_signal() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, 0, ScaleType::Major, start);
        let notes = session.current_round().notes.clone();
        assert!(!session.last_round_had_no_signal()); // no rounds recorded yet
        session.record_round(&vec![-1; notes.len()], &vec![0; notes.len()]);
        assert!(session.last_round_had_no_signal());
    }

    #[test]
    fn test_last_round_had_signal_when_at_least_one_note_detected() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, 0, ScaleType::Major, start);
        let notes = session.current_round().notes.clone();
        // Wrong pitch, not a miss — still counts as "had signal".
        session.record_round(&[notes[0] + 1], &[3]);
        assert!(!session.last_round_had_no_signal());
    }

    #[test]
    fn test_session_best_params_survives_a_worse_final_round() {
        let start = params(0.003);
        let mut session = CalibrationSession::new(60, 72, 0, ScaleType::Major, start);
        let r1_notes = session.current_round().notes.clone();
        let converged = session.record_round(&r1_notes.clone(), &vec![3; r1_notes.len()]); // perfect round 1 (1 note)
        // A 1-note perfect round does not converge under the new rule — verifies
        // best_params doesn't require convergence to have happened.
        assert!(!converged);
        assert_eq!(session.best_params().silence_threshold, start.silence_threshold);
    }
}
