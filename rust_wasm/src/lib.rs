use ear_ring_core::{
    detect_pitch, freq_to_note, generate_sequence, intro_chord, is_correct_note, staff_position,
    test_score, Note, ScaleType,
};
use wasm_bindgen::prelude::*;

/// Detect pitch from a Float32Array of PCM samples.
/// Returns the detected frequency in Hz, or -1.0 if not detected.
#[wasm_bindgen]
pub fn wasm_detect_pitch(samples: &[f32], sample_rate: u32) -> f32 {
    detect_pitch(samples, sample_rate).unwrap_or(-1.0)
}

/// Convert frequency (Hz) to MIDI note number.
/// Returns -1 if the frequency is out of range.
#[wasm_bindgen]
pub fn wasm_freq_to_midi(hz: f32) -> i32 {
    freq_to_note(hz).map(|(n, _)| n.midi() as i32).unwrap_or(-1)
}

/// Get cents deviation for a given frequency from the nearest semitone.
/// Returns 0 if out of range.
#[wasm_bindgen]
pub fn wasm_freq_to_cents(hz: f32) -> i32 {
    freq_to_note(hz).map(|(_, c)| c).unwrap_or(0)
}

/// Get staff position (diatonic steps above C4) for a MIDI note number.
#[wasm_bindgen]
pub fn wasm_staff_position(midi: u8) -> i32 {
    staff_position(Note::from_midi(midi))
}

/// Generate a note sequence; returns a Uint8Array of MIDI note numbers.
///
/// * `root_midi` – root note MIDI number
/// * `scale_id`  – 0=Major, 1=NatMinor, 2=HarmMinor, 3=PentMaj, 4=PentMin,
///                 5=Dorian, 6=Mixolydian, 7=Blues
/// * `length`    – number of notes
/// * `seed`      – random seed
#[wasm_bindgen]
pub fn wasm_generate_sequence(root_midi: u8, scale_id: u8, length: u8, seed: u64) -> Vec<u8> {
    let scale = match scale_id {
        0 => ScaleType::Major,
        1 => ScaleType::NaturalMinor,
        2 => ScaleType::HarmonicMinor,
        3 => ScaleType::PentatonicMajor,
        4 => ScaleType::PentatonicMinor,
        5 => ScaleType::Dorian,
        6 => ScaleType::Mixolydian,
        7 => ScaleType::Blues,
        _ => ScaleType::Major,
    };
    let root = Note::from_midi(root_midi);
    generate_sequence(root, scale, length, seed)
        .iter()
        .map(|n| n.midi())
        .collect()
}

#[wasm_bindgen]
pub fn wasm_intro_chord(root_midi: u8, scale_id: u8) -> Vec<u8> {
    let scale = match scale_id {
        0 => ScaleType::Major,
        1 => ScaleType::NaturalMinor,
        2 => ScaleType::HarmonicMinor,
        3 => ScaleType::PentatonicMajor,
        4 => ScaleType::PentatonicMinor,
        5 => ScaleType::Dorian,
        6 => ScaleType::Mixolydian,
        7 => ScaleType::Blues,
        _ => ScaleType::Major,
    };
    intro_chord(Note::from_midi(root_midi), scale)
        .iter()
        .map(|n| n.midi())
        .collect()
}

#[wasm_bindgen]
pub fn wasm_is_correct_note(detected_midi: u8, cents: i32, expected_midi: u8) -> bool {
    is_correct_note(detected_midi, cents, expected_midi)
}

#[wasm_bindgen]
pub fn wasm_test_score(max_attempts: u8, attempts_used: u8, passed: bool) -> u8 {
    test_score(max_attempts, attempts_used, passed)
}
