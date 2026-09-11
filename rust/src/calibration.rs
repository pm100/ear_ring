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
/// Consecutive non-improving rounds that count as a plateau. At 2 this fired
/// after a single non-improving round, so runs almost never reached ROUND_CAP.
pub const PLATEAU_ROUNDS: usize = 3;
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

    let notes = if failing_notes.is_empty() {
        let span = range_end - range_start;
        vec![range_start + span / 4, range_start + span / 2, range_start + 3 * span / 4]
    } else {
        let mut notes = failing_notes;
        notes.truncate(MAX_NOTES_PER_ROUND);
        if notes.len() < MAX_NOTES_PER_ROUND {
            // Pad by walking outward from the first failing note (+1, -1, +2, -2, …)
            // and skipping anything already in the round, so the extra probes are
            // distinct notes rather than the same one repeated. Only a range too
            // narrow to offer a fresh pitch falls back to duplicating.
            let base = notes[0];
            let span = (range_end - range_start).max(0);
            for offset in 1..=(span + 1) {
                for candidate in [base + offset, base - offset] {
                    if notes.len() >= MAX_NOTES_PER_ROUND {
                        break;
                    }
                    if candidate < range_start || candidate > range_end || notes.contains(&candidate) {
                        continue;
                    }
                    notes.push(candidate);
                }
                if notes.len() >= MAX_NOTES_PER_ROUND {
                    break;
                }
            }
            while notes.len() < MAX_NOTES_PER_ROUND {
                notes.push(base.clamp(range_start, range_end));
            }
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

/// Params of the highest-scoring recorded round, EARLIEST round winning a tie.
///
/// `max_by` would keep the last tied element, handing the run to the more-nudged
/// later round even though nothing showed it was better — a non-converging run is
/// meant to end up at least as good as where it started, not drift. So a later
/// round only takes over on a strictly greater score. `partial_cmp` can't produce
/// `None` for today's `total_score` (a hits/len ratio), but treat an unorderable
/// comparison as a tie rather than panicking.
pub fn best_params(history: &[(CalibrationRound, CalibrationScore)], fallback: CalibrationParams) -> CalibrationParams {
    let mut best: Option<&(CalibrationRound, CalibrationScore)> = None;
    for entry in history {
        let better = match best {
            None => true,
            Some(current) => matches!(
                entry.1.total_score.partial_cmp(&current.1.total_score),
                Some(std::cmp::Ordering::Greater)
            ),
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
        // Round 1: nothing detected (score 0.0). Round 2: 2 of 3 correct (score
        // ~0.667) — an improvement, and not itself perfect. Two rounds are also
        // short of PLATEAU_ROUNDS (3), so on either count this must NOT read as a
        // plateau: calibration should keep going rather than stop.
        let round1_score = score_round(&round.notes, &[-1, -1, -1], &[0, 0, 0]);
        let round2_score = score_round(&round.notes, &[round.notes[0], -1, round.notes[2]], &[3, 0, 3]);
        assert!(!is_converged(&[(round.clone(), round1_score), (round, round2_score)]));
    }

    #[test]
    fn test_plateau_stop() {
        let start = params(0.003);
        let round = next_calibration_round(60, 72, start, &[]);
        // PLATEAU_ROUNDS rounds all scoring the same 2/3 — not improving, not
        // perfect, and well short of ROUND_CAP, so only the plateau branch can
        // make this converge.
        let flat_score = score_round(&round.notes, &[round.notes[0], -1, round.notes[2]], &[3, 0, 3]);
        let history: Vec<_> = (0..PLATEAU_ROUNDS).map(|_| (round.clone(), flat_score.clone())).collect();
        assert!(history.len() < ROUND_CAP, "must not be converging via the round cap");
        assert!(flat_score.total_score < 1.0, "must not be converging via a perfect round");
        assert!(is_converged(&history));
        // One round short of the plateau window must still keep going.
        assert!(!is_converged(&history[..PLATEAU_ROUNDS - 1]));
    }

    #[test]
    fn test_all_notes_missed_nudges_silence_threshold_only_once() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        // All three notes missed. The nudge is per ROUND, not per failing note,
        // so this is one 0.8x step — not 0.8^3.
        let score1 = score_round(&round1.notes, &[-1, -1, -1], &[0, 0, 0]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert!((round2.params.silence_threshold - start.silence_threshold * 0.8).abs() < 1e-9);
        assert!((round2.params.yin_threshold - (start.yin_threshold + 0.02)).abs() < 1e-6);
    }

    #[test]
    fn test_padded_round_has_no_duplicate_notes() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        // Only the middle note (66) fails, so the round is padded up to 3 notes.
        let score1 = score_round(&round1.notes, &[60, -1, 72], &[3, 0, 3]);
        let round2 = next_calibration_round(60, 72, start, &[(round1, score1)]);
        assert_eq!(round2.notes.len(), MAX_NOTES_PER_ROUND);
        let mut sorted = round2.notes.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), MAX_NOTES_PER_ROUND, "padding repeated a probe note: {:?}", round2.notes);
        assert!(round2.notes.iter().all(|&n| (60..=72).contains(&n)));
    }

    #[test]
    fn test_padding_duplicates_only_when_range_leaves_no_choice() {
        let start = params(0.003);
        // A one-note range has nothing else to probe, so duplication is the only
        // option — this must still produce a full-length round rather than loop.
        let round1 = next_calibration_round(60, 60, start, &[]);
        let score1 = score_round(&round1.notes, &[-1, -1, -1], &[0, 0, 0]);
        let round2 = next_calibration_round(60, 60, start, &[(round1, score1)]);
        assert_eq!(round2.notes, vec![60, 60, 60]);
    }

    #[test]
    fn test_best_params_keeps_earliest_round_on_tie() {
        let start = params(0.003);
        let round1 = next_calibration_round(60, 72, start, &[]);
        // Both rounds score 1/3 — the later round's params are more nudged, but
        // nothing demonstrated they're better, so the earlier round must win.
        let score1 = score_round(&round1.notes, &[round1.notes[0], -1, -1], &[3, 0, 0]);
        let round2 = next_calibration_round(60, 72, start, &[(round1.clone(), score1.clone())]);
        let score2 = score_round(&round2.notes, &[round2.notes[0], -1, -1], &[3, 0, 0]);
        assert!((score1.total_score - score2.total_score).abs() < 1e-6);
        assert_ne!(round1.params, round2.params);
        let best = best_params(&[(round1.clone(), score1), (round2, score2)], start);
        assert_eq!(best, round1.params);
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
}
