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
    Dorian,
    Mixolydian,
}

impl ScaleType {
    /// Interval pattern in semitones (relative to root, not including octave).
    pub fn intervals(self) -> &'static [u8] {
        match self {
            ScaleType::Major => &[0, 2, 4, 5, 7, 9, 11],
            ScaleType::NaturalMinor => &[0, 2, 3, 5, 7, 8, 10],
            ScaleType::HarmonicMinor => &[0, 2, 3, 5, 7, 8, 11],
            ScaleType::Dorian => &[0, 2, 3, 5, 7, 9, 10],
            ScaleType::Mixolydian => &[0, 2, 4, 5, 7, 9, 10],
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            ScaleType::Major => "Major",
            ScaleType::NaturalMinor => "Natural Minor",
            ScaleType::HarmonicMinor => "Harmonic Minor",
            ScaleType::Dorian => "Dorian",
            ScaleType::Mixolydian => "Mixolydian",
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

/// Generate a random sequence of `length` notes drawn from the given scale,
/// restricted to MIDI notes within [range_start, range_end].
/// Uses a simple LCG seeded by the provided `seed` for reproducibility.
pub fn generate_sequence(
    root_chroma: u8,
    scale: ScaleType,
    range_start: u8,
    range_end: u8,
    length: u8,
    seed: u64,
) -> Vec<Note> {
    use std::collections::HashSet;
    let intervals: HashSet<u8> = scale.intervals().iter().copied().collect();
    let notes: Vec<Note> = (range_start..=range_end)
        .filter(|&m| {
            let interval = (m + 12 - root_chroma % 12) % 12;
            intervals.contains(&interval)
        })
        .map(Note::from_midi)
        .collect();
    if notes.is_empty() {
        return Vec::new();
    }
    let n = notes.len() as u64;
    let mut rng = seed;
    (0..length)
        .map(|_| {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            notes[((rng >> 33) % n) as usize]
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
/// NOTE: Uses sharp-based diatonic (A#=A's position). For key-aware placement
/// use `staff_position_in_key` instead.
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

/// Key-aware treble-clef staff position for a MIDI note number.
/// In flat keys, flattened pitch classes are placed at their *upper* diatonic neighbour:
///   Bb (chroma 10) → B's position (6), Ab (8) → A's (5), Eb (3) → E's (2), etc.
/// In sharp keys (or C major), uses the standard sharp-based diatonic mapping.
pub fn staff_position_in_key(midi: u8, root_chroma: u8) -> i32 {
    let chroma = (midi % 12) as usize;
    let octave = (midi as i32 / 12) - 1;
    let diatonic: i32 = if is_sharp_key(root_chroma) {
        [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][chroma]
    } else {
        // Flat spelling: black keys placed at their upper diatonic neighbour
        [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][chroma]
    };
    (octave - 4) * 7 + diatonic
}

// ── Public naming helpers ─────────────────────────────────────────────────────

/// Convert a MIDI number to a human-readable label (e.g. "C#4", "A3").
pub fn midi_to_label(midi: u8) -> String {
    Note::from_midi(midi).to_string()
}

/// Display name for a pitch class (chroma 0–11), e.g. 0 → "C", 1 → "C#".
pub fn note_name(chroma: u8) -> &'static str {
    NoteName::from_chroma(chroma).display_name()
}

/// Display name for a scale ID (0–4).
pub fn scale_name(scale_id: u8) -> &'static str {
    match scale_id {
        0 => "Major",
        1 => "Natural Minor",
        2 => "Harmonic Minor",
        3 => "Dorian",
        4 => "Mixolydian",
        _ => "?",
    }
}

// ── Key signature ─────────────────────────────────────────────────────────────

/// Order of sharps by pitch class (circle of fifths): F# C# G# D# A# E# B#
pub const SHARP_ORDER: [u8; 7] = [6, 1, 8, 3, 10, 5, 11];
/// Order of flats by pitch class (circle of fifths): Bb Eb Ab Db Gb Cb Fb
pub const FLAT_ORDER: [u8; 7] = [10, 3, 8, 1, 6, 11, 5];

/// Treble-clef staff positions for sharp symbols, in order of sharps (F# C# G# D# A# E# B#).
/// Staff position = diatonic steps from C4 (C4=0, D4=1, B4=6, C5=7, ...).
pub const SHARP_STAFF_POSITIONS: [i32; 7] = [10, 7, 11, 8, 5, 9, 6];
/// Treble-clef staff positions for flat symbols, in order of flats (Bb Eb Ab Db Gb Cb Fb).
pub const FLAT_STAFF_POSITIONS: [i32; 7] = [6, 9, 5, 8, 4, 7, 3];

/// Number of sharps (positive) or flats (negative) in the major key with this root chroma.
/// Ties (enharmonic keys) are resolved to the simpler key: chroma 1 → C# (7#), chroma 6 → F# (6#).
pub fn key_accidental_count(root_chroma: u8) -> i8 {
    match root_chroma % 12 {
        0 => 0,   // C  – no accidentals
        7 => 1,   // G  – 1 sharp
        2 => 2,   // D  – 2 sharps
        9 => 3,   // A  – 3 sharps
        4 => 4,   // E  – 4 sharps
        11 => 5,  // B  – 5 sharps
        6 => 6,   // F# – 6 sharps
        1 => 7,   // C# – 7 sharps
        5 => -1,  // F  – 1 flat
        10 => -2, // Bb – 2 flats
        3 => -3,  // Eb – 3 flats
        8 => -4,  // Ab – 4 flats
        _ => 0,
    }
}

/// Returns true if the major key with this root chroma uses sharps (or is C major).
pub fn is_sharp_key(root_chroma: u8) -> bool {
    key_accidental_count(root_chroma) >= 0
}

/// Returns the set of pitch classes that are part of the key signature
/// (the accidentalled notes) for the major key with this root chroma.
pub fn key_signature_pitch_classes(root_chroma: u8) -> &'static [u8] {
    let count = key_accidental_count(root_chroma);
    if count > 0 {
        &SHARP_ORDER[..count as usize]
    } else if count < 0 {
        &FLAT_ORDER[..(-count) as usize]
    } else {
        &[]
    }
}

/// Returns the treble-clef staff positions where key signature symbols are drawn,
/// along with whether they are sharps (`true`) or flats (`false`).
pub fn key_sig_staff_positions(root_chroma: u8) -> (&'static [i32], bool) {
    let count = key_accidental_count(root_chroma);
    if count > 0 {
        (&SHARP_STAFF_POSITIONS[..count as usize], true)
    } else if count < 0 {
        (&FLAT_STAFF_POSITIONS[..(-count) as usize], false)
    } else {
        (&[], true)
    }
}

/// Returns the preferred note name (without octave) for a MIDI note in the context
/// of a major key. Sharp keys use sharp spellings; flat keys use flat spellings.
pub fn preferred_note_label(midi: u8, root_chroma: u8) -> &'static str {
    let chroma = midi % 12;
    if is_sharp_key(root_chroma) {
        match chroma {
            0 => "C", 1 => "C#", 2 => "D", 3 => "D#", 4 => "E",
            5 => "F", 6 => "F#", 7 => "G", 8 => "G#", 9 => "A",
            10 => "A#", 11 => "B", _ => "?",
        }
    } else {
        match chroma {
            0 => "C", 1 => "Db", 2 => "D", 3 => "Eb", 4 => "E",
            5 => "F", 6 => "Gb", 7 => "G", 8 => "Ab", 9 => "A",
            10 => "Bb", 11 => "B", _ => "?",
        }
    }
}

/// Full label including octave, e.g. "C#4" or "Bb3", using the key's preferred spelling.
pub fn preferred_midi_label(midi: u8, root_chroma: u8) -> String {
    let octave = (midi as i32 / 12) - 1;
    format!("{}{}", preferred_note_label(midi, root_chroma), octave)
}

/// For key-signature display mode: returns the accidental symbol to draw on a note
/// given the current major key. Returns:
///   `None`       → note is diatonic in the key, no accidental needed
///   `Some("♯")`  → draw a sharp
///   `Some("♭")`  → draw a flat
///   `Some("♮")`  → draw a natural (note is chromatically altered away from key)
pub fn accidental_in_key(midi: u8, root_chroma: u8) -> Option<&'static str> {
    let chroma = midi % 12;
    let ks_chromas = key_signature_pitch_classes(root_chroma);
    let count = key_accidental_count(root_chroma);

    if count >= 0 {
        // Sharp key: ks_chromas are the sharpened pitch classes (e.g. F# in G major)
        if ks_chromas.contains(&chroma) {
            return None;
        }
        // If chroma+1 is a key-sig sharp, this note is the natural of that sharp → ♮
        if ks_chromas.contains(&((chroma + 1) % 12)) {
            return Some("♮");
        }
        // Remaining black keys not in the key sig need a sharp accidental
        if matches!(chroma, 1 | 3 | 6 | 8 | 10) {
            return Some("♯");
        }
        None
    } else {
        // Flat key: ks_chromas are the flattened pitch classes (e.g. Bb in F major)
        if ks_chromas.contains(&chroma) {
            return None;
        }
        // If chroma-1 is a key-sig flat, this note is the natural of that flat → ♮
        if ks_chromas.contains(&(chroma.wrapping_sub(1) % 12)) {
            return Some("♮");
        }
        // Remaining black keys not in the key sig need a flat accidental
        if matches!(chroma, 1 | 3 | 6 | 8 | 10) {
            return Some("♭");
        }
        None
    }
}

// ── Instrument transposition ──────────────────────────────────────────────────

pub struct InstrumentInfo {
    pub name: &'static str,
    /// Semitones to add to concert MIDI to get written/display MIDI.
    /// written = concert + semitones
    pub semitones: i32,
}

pub const INSTRUMENTS: &[InstrumentInfo] = &[
    InstrumentInfo { name: "Piano",             semitones:  0 },
    InstrumentInfo { name: "Guitar",            semitones:  0 },
    InstrumentInfo { name: "Transposed Guitar", semitones: 12 },
    InstrumentInfo { name: "Soprano Sax",       semitones:  2 },
    InstrumentInfo { name: "Alto Sax",          semitones:  9 },
    InstrumentInfo { name: "Tenor Sax",         semitones:  2 },
    InstrumentInfo { name: "Trumpet",           semitones:  2 },
    InstrumentInfo { name: "Clarinet",          semitones:  2 },
];

/// Convert a concert MIDI number to the written/display MIDI for a given instrument.
/// The result is clamped to the valid MIDI range 0–127.
pub fn transpose_display_midi(concert_midi: i32, instrument_index: usize) -> i32 {
    let semitones = INSTRUMENTS
        .get(instrument_index)
        .map(|i| i.semitones)
        .unwrap_or(0);
    (concert_midi + semitones).clamp(0, 127)
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
        // C major, one octave C4-B4 (MIDI 60-71)
        let seq = generate_sequence(0, ScaleType::Major, 60, 71, 5, 42);
        assert_eq!(seq.len(), 5);
    }

    #[test]
    fn test_generate_sequence_in_scale() {
        // All generated notes must be in C major (intervals 0,2,4,5,7,9,11)
        let seq = generate_sequence(0, ScaleType::Major, 60, 84, 20, 99);
        let major_intervals: std::collections::HashSet<u8> = [0,2,4,5,7,9,11].iter().copied().collect();
        for note in &seq {
            assert!(major_intervals.contains(&(note.midi() % 12)), "Note {:?} not in C major", note);
            assert!(note.midi() >= 60 && note.midi() <= 84, "Note {:?} out of range", note);
        }
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
