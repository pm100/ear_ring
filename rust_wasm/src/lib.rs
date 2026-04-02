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
/// * `root_chroma` – pitch class of the root (0=C … 11=B)
/// * `scale_id`    – 0=Major … 4=Mixolydian
/// * `length`      – number of notes
/// * `range_start` – lowest accepted MIDI note
/// * `range_end`   – highest accepted MIDI note
/// * `seed`        – random seed
#[wasm_bindgen]
pub fn wasm_generate_sequence(root_chroma: u8, scale_id: u8, length: u8, range_start: u8, range_end: u8, seed: u64) -> Vec<u8> {
    let scale = match scale_id {
        0 => ScaleType::Major,
        1 => ScaleType::NaturalMinor,
        2 => ScaleType::Dorian,
        3 => ScaleType::Mixolydian,
        _ => ScaleType::Major,
    };
    generate_sequence(root_chroma, scale, range_start, range_end, length, seed)
        .iter()
        .map(|n| n.midi())
        .collect()
}

#[wasm_bindgen]
pub fn wasm_intro_chord(root_midi: u8, scale_id: u8) -> Vec<u8> {
    let scale = match scale_id {
        0 => ScaleType::Major,
        1 => ScaleType::NaturalMinor,
        2 => ScaleType::Dorian,
        3 => ScaleType::Mixolydian,
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
