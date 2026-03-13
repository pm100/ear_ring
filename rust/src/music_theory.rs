use std::fmt;

// ── Note ──────────────────────────────────────────────────────────────────────

/// Chromatic note names (12 pitch classes, using sharps).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NoteName {
    C,
    Cs, // C#
    D,
    Ds, // D#
    E,
    F,
    Fs, // F#
    G,
    Gs, // G#
    A,
    As, // A#
    B,
}

impl NoteName {
    /// All 12 pitch classes in chromatic order.
    pub const ALL: [NoteName; 12] = [
        NoteName::C,
        NoteName::Cs,
        NoteName::D,
        NoteName::Ds,
        NoteName::E,
        NoteName::F,
        NoteName::Fs,
        NoteName::G,
        NoteName::Gs,
        NoteName::A,
        NoteName::As,
        NoteName::B,
    ];

    /// Chromatic index 0–11 (C = 0, C# = 1, …, B = 11).
    pub fn chroma(self) -> u8 {
        self as u8
    }

    /// Display name suitable for UI labels.
    pub fn display_name(self) -> &'static str {
        match self {
            NoteName::C => "C",
            NoteName::Cs => "C#",
            NoteName::D => "D",
            NoteName::Ds => "D#",
            NoteName::E => "E",
            NoteName::F => "F",
            NoteName::Fs => "F#",
            NoteName::G => "G",
            NoteName::Gs => "G#",
            NoteName::A => "A",
            NoteName::As => "A#",
            NoteName::B => "B",
        }
    }

    /// From chromatic index 0–11.
    pub fn from_chroma(c: u8) -> Self {
        NoteName::ALL[(c % 12) as usize]
    }
}

impl fmt::Display for NoteName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

// ── Note (name + octave) ──────────────────────────────────────────────────────

/// A specific note: pitch class + octave (C4 = middle C, MIDI 60).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Note {
    pub name: NoteName,
    pub octave: i8,
}

impl Note {
    pub fn new(name: NoteName, octave: i8) -> Self {
        Self { name, octave }
    }

    /// MIDI number: C4 = 60, A4 = 69, etc.
    pub fn midi(self) -> u8 {
        let semitone = (self.octave as i16 + 1) * 12 + self.name.chroma() as i16;
        semitone.clamp(0, 127) as u8
    }

    /// Frequency in Hz: A4 = 440 Hz.
    pub fn frequency(self) -> f32 {
        midi_to_freq(self.midi())
    }

    /// Build from MIDI number.
    pub fn from_midi(midi: u8) -> Self {
        let chroma = midi % 12;
        let octave = (midi as i8 / 12) - 1;
        Note {
            name: NoteName::from_chroma(chroma),
            octave,
        }
    }
}

impl fmt::Display for Note {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}{}", self.name, self.octave)
    }
}

// ── Frequency ↔ MIDI conversions ──────────────────────────────────────────────

/// Convert MIDI note number to frequency in Hz (A4 = 440 Hz, MIDI 69).
pub fn midi_to_freq(midi: u8) -> f32 {
    440.0 * 2.0_f32.powf((midi as f32 - 69.0) / 12.0)
}

/// Convert frequency to the nearest note and the deviation in cents.
/// Returns `None` if the frequency is outside the audible/MIDI range.
pub fn freq_to_note(hz: f32) -> Option<(Note, i32)> {
    if hz <= 0.0 {
        return None;
    }
    // MIDI float
    let midi_f = 69.0 + 12.0 * (hz / 440.0).log2();
    if !(0.0..=127.0).contains(&midi_f) {
        return None;
    }
    let midi = midi_f.round() as u8;
    let cents = ((midi_f - midi as f32) * 100.0).round() as i32;
    Some((Note::from_midi(midi), cents))
}

// ── Scale ─────────────────────────────────────────────────────────────────────

/// Available scale types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ScaleType {
    Major,
    NaturalMinor,
    HarmonicMinor,
    PentatonicMajor,
    PentatonicMinor,
    Dorian,
    Mixolydian,
    Blues,
}

impl ScaleType {
    /// Interval pattern in semitones (relative to root, not including octave).
    pub fn intervals(self) -> &'static [u8] {
        match self {
            ScaleType::Major => &[0, 2, 4, 5, 7, 9, 11],
            ScaleType::NaturalMinor => &[0, 2, 3, 5, 7, 8, 10],
            ScaleType::HarmonicMinor => &[0, 2, 3, 5, 7, 8, 11],
            ScaleType::PentatonicMajor => &[0, 2, 4, 7, 9],
            ScaleType::PentatonicMinor => &[0, 3, 5, 7, 10],
            ScaleType::Dorian => &[0, 2, 3, 5, 7, 9, 10],
            ScaleType::Mixolydian => &[0, 2, 4, 5, 7, 9, 10],
            ScaleType::Blues => &[0, 3, 5, 6, 7, 10],
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            ScaleType::Major => "Major",
            ScaleType::NaturalMinor => "Natural Minor",
            ScaleType::HarmonicMinor => "Harmonic Minor",
            ScaleType::PentatonicMajor => "Pentatonic Major",
            ScaleType::PentatonicMinor => "Pentatonic Minor",
            ScaleType::Dorian => "Dorian",
            ScaleType::Mixolydian => "Mixolydian",
            ScaleType::Blues => "Blues",
        }
    }
}

// ── Scale generation ──────────────────────────────────────────────────────────

/// Generate scale notes starting from `root` (e.g. C4) for one octave.
/// Returns the notes in ascending order (root included, octave excluded).
pub fn scale_notes(root: Note, scale: ScaleType) -> Vec<Note> {
    let root_midi = root.midi();
    scale
        .intervals()
        .iter()
        .map(|&interval| Note::from_midi(root_midi + interval))
        .collect()
}

/// Generate a random sequence of `length` notes drawn from the given scale.
/// Uses a simple LCG seeded by the provided `seed` for reproducibility.
pub fn generate_sequence(root: Note, scale: ScaleType, length: u8, seed: u64) -> Vec<Note> {
    let notes = scale_notes(root, scale);
    let n = notes.len() as u64;
    let mut rng = seed;
    (0..length)
        .map(|_| {
            // LCG parameters (Knuth)
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let idx = ((rng >> 33) % n) as usize;
            notes[idx]
        })
        .collect()
}

/// Build a tonic triad-style intro chord from the selected scale.
/// Uses scale degrees 1, 3, and 5 when available, falling back to the last
/// available degree for shorter scales.
pub fn intro_chord(root: Note, scale: ScaleType) -> Vec<Note> {
    let notes = scale_notes(root, scale);
    if notes.is_empty() {
        return vec![root];
    }
    let third_idx = usize::min(2, notes.len() - 1);
    let fifth_idx = usize::min(4, notes.len() - 1);
    vec![notes[0], notes[third_idx], notes[fifth_idx]]
}

/// Whether a detected note matches the expected note class and is within the
/// allowed cents tolerance.
pub fn is_correct_note(detected_midi: u8, cents: i32, expected_midi: u8) -> bool {
    detected_midi % 12 == expected_midi % 12 && cents.abs() <= 50
}

/// Score a test attempt as a percentage.
/// First-try success yields 100, later successes scale down by attempt count,
/// and total failure yields 0.
pub fn test_score(max_attempts: u8, attempts_used: u8, passed: bool) -> u8 {
    if !passed || max_attempts == 0 {
        return 0;
    }
    let weighted = max_attempts.saturating_sub(attempts_used).saturating_add(1);
    (((weighted as f32) * 100.0) / (max_attempts as f32)).floor() as u8
}

// ── Staff position ────────────────────────────────────────────────────────────

/// Treble-clef staff position for a note.
/// Returns the number of staff steps above middle C (C4).
/// Each step = one line or one space. Positive = higher, negative = lower.
/// Used by the UI to place note heads on the staff.
pub fn staff_position(note: Note) -> i32 {
    // Diatonic step offset within an octave for each pitch class (C=0, D=1, E=2, …)
    let diatonic = match note.name {
        NoteName::C => 0,
        NoteName::Cs => 0,
        NoteName::D => 1,
        NoteName::Ds => 1,
        NoteName::E => 2,
        NoteName::F => 3,
        NoteName::Fs => 3,
        NoteName::G => 4,
        NoteName::Gs => 4,
        NoteName::A => 5,
        NoteName::As => 5,
        NoteName::B => 6,
    };
    // Middle C (C4) is at staff position 0
    let octave_offset = (note.octave as i32 - 4) * 7;
    octave_offset + diatonic
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_midi_freq_round_trip() {
        let a4 = Note::new(NoteName::A, 4);
        assert_eq!(a4.midi(), 69);
        let freq = a4.frequency();
        assert!((freq - 440.0).abs() < 0.01, "A4 should be ~440Hz, got {freq}");
    }

    #[test]
    fn test_freq_to_note() {
        let (note, cents) = freq_to_note(440.0).unwrap();
        assert_eq!(note.name, NoteName::A);
        assert_eq!(note.octave, 4);
        assert_eq!(cents, 0);
    }

    #[test]
    fn test_middle_c() {
        let c4 = Note::new(NoteName::C, 4);
        assert_eq!(c4.midi(), 60);
        assert!((c4.frequency() - 261.63).abs() < 0.1);
    }

    #[test]
    fn test_major_scale_c4() {
        let root = Note::new(NoteName::C, 4);
        let notes = scale_notes(root, ScaleType::Major);
        let names: Vec<_> = notes.iter().map(|n| n.name).collect();
        assert_eq!(
            names,
            vec![
                NoteName::C,
                NoteName::D,
                NoteName::E,
                NoteName::F,
                NoteName::G,
                NoteName::A,
                NoteName::B,
            ]
        );
    }

    #[test]
    fn test_generate_sequence_length() {
        let root = Note::new(NoteName::C, 4);
        let seq = generate_sequence(root, ScaleType::Major, 5, 42);
        assert_eq!(seq.len(), 5);
    }

    #[test]
    fn test_staff_position() {
        assert_eq!(staff_position(Note::new(NoteName::C, 4)), 0); // middle C
        assert_eq!(staff_position(Note::new(NoteName::D, 4)), 1);
        assert_eq!(staff_position(Note::new(NoteName::C, 5)), 7);
        assert_eq!(staff_position(Note::new(NoteName::B, 3)), -1);
    }

    #[test]
    fn test_intro_chord_uses_scale_degrees() {
        let root = Note::new(NoteName::C, 4);
        let chord = intro_chord(root, ScaleType::Major);
        let midis: Vec<_> = chord.into_iter().map(|n| n.midi()).collect();
        assert_eq!(midis, vec![60, 64, 67]);
    }

    #[test]
    fn test_is_correct_note() {
        assert!(is_correct_note(60, 0, 72));
        assert!(!is_correct_note(61, 0, 72));
        assert!(!is_correct_note(60, 80, 72));
    }

    #[test]
    fn test_test_score() {
        assert_eq!(test_score(5, 1, true), 100);
        assert_eq!(test_score(5, 3, true), 60);
        assert_eq!(test_score(5, 5, false), 0);
    }
}
