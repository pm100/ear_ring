/// Stateful pitch detection pipeline.
///
/// Wraps YIN pitch detection with RMS silence gating, DC offset removal,
/// warmup frame discarding, MIDI stability tracking, and a configurable silence
/// grace period. Platforms call `process()` once per audio buffer and receive
/// back a `FrameResult` containing the live Hz, live MIDI, and — exactly once
/// per confirmed note — the confirmed MIDI number.
///
/// This is the single source of truth for all detection rules. Platform code
/// only needs to feed audio buffers and react to `FrameResult::confirmed_midi`.
use crate::music_theory::{freq_to_note, hz_to_midi_f32, INSTRUMENTS};
use crate::pitch_detection::{detect_pitch, DEFAULT_YIN_THRESHOLD};

pub struct PitchTracker {
    pub silence_threshold: f32,
    pub required_frames: u32,
    /// Consecutive silent/no-pitch frames required to reset stability (default 1 = same as before).
    /// Guitar sustain benefits from a higher value (e.g. 5) to absorb amplitude dips.
    pub grace_frames: u32,
    /// When true, a detection that is exactly ±12 semitones from the current stable note is
    /// absorbed rather than resetting stability. Prevents octave-harmonic glitches on guitar.
    pub octave_correction: bool,
    /// YIN algorithm confidence threshold. Defaults to `pitch_detection::DEFAULT_YIN_THRESHOLD`;
    /// overridden by Auto-Calibrate per instrument/device.
    pub yin_threshold: f32,
    /// Cents-of-drift tolerance for treating a frame as "the same note" as the
    /// currently-stable one, instead of requiring the rounded MIDI to match exactly.
    /// Values <= 50.0 (the default) are a no-op: `freq_to_note` never rounds a frame
    /// more than 50 cents from its nearest semitone, so the exact-match path below
    /// already covers everything a 50-cent-or-tighter tolerance could allow. Values
    /// above 50.0 open a hysteresis band around the stable note's exact frequency,
    /// letting pitch drift — natural vibrato on voice, a trombone slide, a fretless
    /// string's finger wobble — swing across a semitone boundary on some frames
    /// without resetting stability, since there's no mechanical stop pinning those
    /// instruments' pitch to an exact value the way a fretted/keyed instrument has.
    /// Set per-instrument by `apply_instrument()` from `InstrumentInfo::pitch_tolerance_cents`.
    pub pitch_tolerance_cents: f32,
    warmup_remaining: u32,
    stable_midi: i32,   // -1 = no stable note yet
    stable_count: u32,
    pitch_consumed: bool,
    silence_grace: u32,
}

/// Result from processing one audio buffer.
pub struct FrameResult {
    /// Detected frequency in Hz. 0.0 when silent or no confident pitch.
    pub live_hz: f32,
    /// Detected MIDI note. -1 when silent or no confident pitch.
    pub live_midi: i32,
    /// The confirmed MIDI note, emitted exactly once when stability is reached.
    /// -1 means no confirmation this frame.
    pub confirmed_midi: i32,
}

impl PitchTracker {
    pub fn new(silence_threshold: f32, required_frames: u32) -> Self {
        Self {
            silence_threshold,
            required_frames,
            grace_frames: 1,
            octave_correction: false,
            yin_threshold: DEFAULT_YIN_THRESHOLD,
            pitch_tolerance_cents: 50.0,
            warmup_remaining: 0,
            stable_midi: -1,
            stable_count: 0,
            pitch_consumed: false,
            silence_grace: 0,
        }
    }

    /// Reset all state. Call between attempts or when stopping.
    pub fn reset(&mut self) {
        self.warmup_remaining = 0;
        self.stable_midi = -1;
        self.stable_count = 0;
        self.pitch_consumed = false;
        self.silence_grace = 0;
    }

    /// Reset and discard the next `frames` buffers before processing begins.
    /// Use when the mic starts automatically to absorb settling transients.
    pub fn reset_with_warmup(&mut self, frames: u32) {
        self.reset();
        self.warmup_remaining = frames;
    }

    /// Update silence threshold and required frames without resetting state.
    pub fn set_params(&mut self, silence_threshold: f32, required_frames: u32) {
        self.silence_threshold = silence_threshold;
        self.required_frames = required_frames;
    }

    /// Apply instrument-specific detection parameters (grace frames and octave correction).
    /// Looks up the instrument by index from the built-in INSTRUMENTS table.
    /// Call once after creating the tracker whenever the instrument selection changes.
    pub fn apply_instrument(&mut self, instrument_index: usize) {
        if let Some(inst) = INSTRUMENTS.get(instrument_index) {
            self.grace_frames = inst.grace_frames;
            self.octave_correction = inst.octave_correction;
            self.pitch_tolerance_cents = inst.pitch_tolerance_cents;
        }
    }

    /// Process one audio buffer. Returns a `FrameResult` with live pitch info
    /// and a confirmed MIDI note the first time a note stabilises.
    pub fn process(&mut self, samples: &[f32], sample_rate: u32) -> FrameResult {
        if self.warmup_remaining > 0 {
            self.warmup_remaining -= 1;
            return FrameResult { live_hz: 0.0, live_midi: -1, confirmed_midi: -1 };
        }

        // RMS silence gate
        if samples.is_empty() {
            return self.handle_no_detection();
        }
        let rms: f32 = (samples.iter().map(|&s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        if rms < self.silence_threshold {
            return self.handle_no_detection();
        }

        // YIN pitch detection (includes DC offset removal internally)
        let Some(hz) = detect_pitch(samples, sample_rate, self.yin_threshold) else {
            return self.handle_no_detection();
        };

        let Some((note, _cents)) = freq_to_note(hz) else {
            return self.handle_no_detection();
        };

        let midi = note.midi() as i32;
        self.silence_grace = 0;

        // Octave correction: if a detection is exactly ±12 semitones from the current stable
        // note, absorb it as the stable note rather than resetting stability. This prevents
        // harmonic glitches (e.g. guitar's 2nd harmonic) from interrupting an in-progress note.
        let mut effective_midi = if self.octave_correction
            && self.stable_midi >= 0
            && (midi - self.stable_midi).abs() == 12
        {
            self.stable_midi
        } else {
            midi
        };

        // Cents-hysteresis band: for continuous-pitch instruments (pitch_tolerance_cents
        // > 50), absorb a frame that's still within tolerance of the *currently stable*
        // note's exact frequency as that same note, even if it happens to round to a
        // different nearest semitone than the raw `midi` above. See `pitch_tolerance_cents`'
        // doc comment. No-op for every instrument left at the default 50.0.
        if effective_midi != self.stable_midi && self.pitch_tolerance_cents > 50.0 && self.stable_midi >= 0 {
            if let Some(midi_f) = hz_to_midi_f32(hz) {
                let cents_from_stable = (midi_f - self.stable_midi as f32) * 100.0;
                if cents_from_stable.abs() <= self.pitch_tolerance_cents {
                    effective_midi = self.stable_midi;
                }
            }
        }

        let confirmed_midi = if effective_midi == self.stable_midi {
            self.stable_count += 1;
            if !self.pitch_consumed && self.stable_count >= self.required_frames {
                self.pitch_consumed = true;
                self.stable_midi
            } else {
                -1
            }
        } else {
            self.stable_midi = effective_midi;
            self.stable_count = 1;
            self.pitch_consumed = false;
            -1
        };

        FrameResult { live_hz: hz, live_midi: effective_midi, confirmed_midi }
    }

    fn handle_no_detection(&mut self) -> FrameResult {
        self.silence_grace += 1;
        if self.silence_grace > self.grace_frames {
            // Enough consecutive silent/no-pitch frames — full reset.
            // grace_frames=1 (default): resets after 2 frames. Guitar uses grace_frames=5.
            self.stable_midi = -1;
            self.stable_count = 0;
            self.pitch_consumed = false;
        }
        FrameResult { live_hz: 0.0, live_midi: -1, confirmed_midi: -1 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    fn sine_wave(freq: f32, sample_rate: u32, num_samples: usize) -> Vec<f32> {
        (0..num_samples)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate as f32).sin())
            .collect()
    }

    fn silent() -> Vec<f32> {
        vec![0.0f32; 4096]
    }

    /// Sine wave at `cents` deviation from `midi`'s exact 12-TET frequency — for
    /// simulating vibrato/pitch-wobble around a target note, the kind of input none
    /// of the other tests here exercise (they're all locked to an exact frequency).
    fn wobbled_wave(midi: i32, cents: f32, sample_rate: u32, num_samples: usize) -> Vec<f32> {
        let base_hz = 440.0 * 2.0_f32.powf((midi as f32 - 69.0) / 12.0);
        let hz = base_hz * 2.0_f32.powf(cents / 1200.0);
        sine_wave(hz, sample_rate, num_samples)
    }

    #[test]
    fn test_warmup_discards_frames() {
        let mut tracker = PitchTracker::new(0.003, 3);
        tracker.reset_with_warmup(2);
        let a4 = sine_wave(440.0, 44100, 4096);
        let r1 = tracker.process(&a4, 44100);
        assert_eq!(r1.confirmed_midi, -1);
        assert_eq!(r1.live_midi, -1);
        let r2 = tracker.process(&a4, 44100);
        assert_eq!(r2.confirmed_midi, -1);
        let r3 = tracker.process(&a4, 44100);
        assert_eq!(r3.confirmed_midi, -1);
        assert!(r3.live_hz > 0.0);
    }

    #[test]
    fn test_confirms_after_required_frames() {
        let mut tracker = PitchTracker::new(0.001, 3);
        let a4 = sine_wave(440.0, 44100, 4096);
        let r1 = tracker.process(&a4, 44100);
        assert_eq!(r1.confirmed_midi, -1);
        let r2 = tracker.process(&a4, 44100);
        assert_eq!(r2.confirmed_midi, -1);
        let r3 = tracker.process(&a4, 44100);
        assert_eq!(r3.confirmed_midi, 69); // A4 = MIDI 69
    }

    #[test]
    fn test_no_double_confirm() {
        let mut tracker = PitchTracker::new(0.001, 3);
        let a4 = sine_wave(440.0, 44100, 4096);
        for _ in 0..3 { tracker.process(&a4, 44100); }
        let r4 = tracker.process(&a4, 44100);
        assert_eq!(r4.confirmed_midi, -1);
    }

    #[test]
    fn test_silence_grace_period() {
        let mut tracker = PitchTracker::new(0.001, 3);
        let a4 = sine_wave(440.0, 44100, 4096);
        tracker.process(&a4, 44100);
        tracker.process(&a4, 44100);
        tracker.process(&silent(), 44100);
        let r = tracker.process(&a4, 44100);
        assert_eq!(r.confirmed_midi, 69);
    }

    #[test]
    fn test_two_silent_frames_reset() {
        let mut tracker = PitchTracker::new(0.001, 3);
        let a4 = sine_wave(440.0, 44100, 4096);
        tracker.process(&a4, 44100);
        tracker.process(&a4, 44100);
        tracker.process(&silent(), 44100);
        tracker.process(&silent(), 44100);
        tracker.process(&a4, 44100);
        tracker.process(&a4, 44100);
        let r = tracker.process(&a4, 44100);
        assert_eq!(r.confirmed_midi, 69);
    }

    #[test]
    fn test_different_note_resets_stability() {
        let mut tracker = PitchTracker::new(0.001, 3);
        let a4 = sine_wave(440.0, 44100, 4096);
        let c4 = sine_wave(261.63, 44100, 4096);
        tracker.process(&a4, 44100);
        tracker.process(&a4, 44100);
        tracker.process(&c4, 44100);
        tracker.process(&c4, 44100);
        let r = tracker.process(&c4, 44100);
        assert_eq!(r.confirmed_midi, 60); // C4 = MIDI 60
    }

    #[test]
    fn test_adjacent_notes_dont_merge() {
        let mut tracker = PitchTracker::new(0.001, 3);
        let e4 = sine_wave(329.63, 44100, 4096);
        let f4 = sine_wave(349.23, 44100, 4096);
        tracker.process(&e4, 44100);
        tracker.process(&e4, 44100);
        let r_e = tracker.process(&e4, 44100);
        assert_eq!(r_e.confirmed_midi, 64); // E4 confirmed
        tracker.process(&f4, 44100);
        tracker.process(&f4, 44100);
        let r_f = tracker.process(&f4, 44100);
        assert_eq!(r_f.confirmed_midi, 65); // F4 confirmed separately
    }

    #[test]
    fn test_octave_correction_absorbs_glitch() {
        let mut tracker = PitchTracker::new(0.001, 4);  // 4 frames needed so glitch is mid-sequence
        tracker.octave_correction = true;
        let a3 = sine_wave(220.0, 44100, 4096);  // A3 = MIDI 57
        let a4 = sine_wave(440.0, 44100, 4096);  // A4 = MIDI 69 (one octave up)
        // Two A3 frames build partial stability (count=2)
        tracker.process(&a3, 44100);
        tracker.process(&a3, 44100);
        // A4 glitch — absorbed as A3 (count → 3), does NOT reset stability
        tracker.process(&a4, 44100);
        // Fourth A3 frame — count reaches 4 and confirms as A3
        let r = tracker.process(&a3, 44100);
        assert_eq!(r.confirmed_midi, 57, "octave glitch should not reset stability");
    }

    #[test]
    fn test_extended_grace_frames_prevents_reset() {
        let mut tracker = PitchTracker::new(0.001, 3);
        tracker.grace_frames = 3;  // Guitar-style: need 4+ silent frames to reset
        let a4 = sine_wave(440.0, 44100, 4096);
        tracker.process(&a4, 44100);
        tracker.process(&a4, 44100);
        // Three silent frames — within grace period, should NOT reset
        tracker.process(&silent(), 44100);
        tracker.process(&silent(), 44100);
        tracker.process(&silent(), 44100);
        // Resume — stability count should still be at 2, one more frame confirms
        let r = tracker.process(&a4, 44100);
        assert_eq!(r.confirmed_midi, 69, "stability should survive grace period");
    }

    #[test]
    fn test_default_tolerance_resets_on_vibrato_crossing_semitone_boundary() {
        // Regression guard: with pitch_tolerance_cents left at its 50.0 default
        // (every mechanically-quantized instrument — piano, sax, etc.), a frame that
        // wobbles past the semitone midpoint must still reset stability exactly like
        // before this feature existed. C4 = MIDI 60.
        let mut tracker = PitchTracker::new(0.001, 3);
        tracker.process(&wobbled_wave(60, 0.0, 44100, 4096), 44100);
        tracker.process(&wobbled_wave(60, 0.0, 44100, 4096), 44100);
        // +60 cents rounds to the neighboring semitone (C#4) — outside the 50-cent
        // default tolerance, so this must NOT be absorbed as still-C4.
        let r = tracker.process(&wobbled_wave(60, 60.0, 44100, 4096), 44100);
        assert_eq!(r.confirmed_midi, -1, "wobble past the semitone boundary should reset stability by default");
    }

    #[test]
    fn test_wide_tolerance_absorbs_vibrato_crossing_semitone_boundary() {
        // Voice-style continuous-pitch instrument: pitch_tolerance_cents = 80 (see
        // INSTRUMENTS's "Alto Voice"/"Soprano Voice"/"Tenor Voice" entries). Natural
        // vibrato swinging ±60 cents around a
        // held C4 (MIDI 60) — including frames that round to the neighboring C#4 —
        // must NOT reset stability, since there's no mechanical stop keeping a sung
        // note's frequency exact from frame to frame.
        let mut tracker = PitchTracker::new(0.001, 3);
        tracker.pitch_tolerance_cents = 80.0;
        tracker.process(&wobbled_wave(60, 0.0, 44100, 4096), 44100);
        // Wobbles up into C#4's rounding basin, but within the 80-cent tolerance of C4.
        tracker.process(&wobbled_wave(60, 60.0, 44100, 4096), 44100);
        let r = tracker.process(&wobbled_wave(60, -10.0, 44100, 4096), 44100);
        assert_eq!(r.confirmed_midi, 60, "vibrato within tolerance should confirm the held note, not reset");
    }

    #[test]
    fn test_wide_tolerance_still_detects_a_genuinely_different_note() {
        // The hysteresis band must not swallow a real note change — only wobble
        // around the currently-stable note. A jump from C4 to D4 (200 cents, well
        // outside even an 80-cent tolerance) must start a fresh confirmation.
        let mut tracker = PitchTracker::new(0.001, 3);
        tracker.pitch_tolerance_cents = 80.0;
        tracker.process(&wobbled_wave(60, 0.0, 44100, 4096), 44100);
        tracker.process(&wobbled_wave(60, 0.0, 44100, 4096), 44100);
        let r_c4 = tracker.process(&wobbled_wave(60, 0.0, 44100, 4096), 44100);
        assert_eq!(r_c4.confirmed_midi, 60);
        tracker.process(&wobbled_wave(62, 0.0, 44100, 4096), 44100); // D4
        tracker.process(&wobbled_wave(62, 0.0, 44100, 4096), 44100);
        let r_d4 = tracker.process(&wobbled_wave(62, 0.0, 44100, 4096), 44100);
        assert_eq!(r_d4.confirmed_midi, 62, "a genuinely different note must still confirm separately");
    }

    #[test]
    fn test_apply_instrument_sets_voice_pitch_tolerance() {
        // All three voice types must be present, each with a wide tolerance; every
        // existing (non-voice) instrument must keep the legacy-equivalent 50.0 default.
        let voice_names = ["Soprano Voice", "Alto Voice", "Tenor Voice"];
        let mut tracker = PitchTracker::new(0.001, 3);
        for name in voice_names {
            let index = INSTRUMENTS.iter().position(|i| i.name == name)
                .unwrap_or_else(|| panic!("{name} must be a selectable instrument"));
            tracker.apply_instrument(index);
            assert!(tracker.pitch_tolerance_cents > 50.0, "{name} should widen the default tolerance");
        }

        let piano_index = INSTRUMENTS.iter().position(|i| i.name == "Piano").unwrap();
        tracker.apply_instrument(piano_index);
        assert_eq!(tracker.pitch_tolerance_cents, 50.0, "Piano must keep the strict default");
    }

    #[test]
    fn test_grace_exceeded_resets_stability() {
        let mut tracker = PitchTracker::new(0.001, 3);
        tracker.grace_frames = 3;
        let a4 = sine_wave(440.0, 44100, 4096);
        tracker.process(&a4, 44100);
        tracker.process(&a4, 44100);
        // Four silent frames — exceeds grace_frames=3, should reset
        for _ in 0..4 { tracker.process(&silent(), 44100); }
        // Now need 3 fresh frames to confirm
        tracker.process(&a4, 44100);
        tracker.process(&a4, 44100);
        let r = tracker.process(&a4, 44100);
        assert_eq!(r.confirmed_midi, 69);
    }
}
