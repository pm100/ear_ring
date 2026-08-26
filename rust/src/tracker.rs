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
use crate::music_theory::{freq_to_note, INSTRUMENTS};
use crate::pitch_detection::detect_pitch;

pub struct PitchTracker {
    pub silence_threshold: f32,
    pub required_frames: u32,
    /// Consecutive silent/no-pitch frames required to reset stability (default 1 = same as before).
    /// Guitar sustain benefits from a higher value (e.g. 5) to absorb amplitude dips.
    pub grace_frames: u32,
    /// When true, a detection that is exactly ±12 semitones from the current stable note is
    /// absorbed rather than resetting stability. Prevents octave-harmonic glitches on guitar.
    pub octave_correction: bool,
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
        let Some(hz) = detect_pitch(samples, sample_rate) else {
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
        let effective_midi = if self.octave_correction
            && self.stable_midi >= 0
            && (midi - self.stable_midi).abs() == 12
        {
            self.stable_midi
        } else {
            midi
        };

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
