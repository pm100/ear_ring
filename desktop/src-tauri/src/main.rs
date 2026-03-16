#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ear_ring_core::{
    detect_pitch, freq_to_note, generate_sequence, intro_chord, is_correct_note, staff_position,
    test_score, Note, ScaleType,
};

#[tauri::command]
fn cmd_detect_pitch(samples: Vec<f32>, sample_rate: u32) -> f32 {
    match detect_pitch(&samples, sample_rate) {
        Some(hz) => hz,
        None => -1.0,
    }
}

#[tauri::command]
fn cmd_freq_to_midi(hz: f32) -> i32 {
    match freq_to_note(hz) {
        Some((note, _)) => note.midi() as i32,
        None => -1,
    }
}

#[tauri::command]
fn cmd_freq_to_cents(hz: f32) -> i32 {
    match freq_to_note(hz) {
        Some((_, cents)) => cents,
        None => 0,
    }
}

#[tauri::command]
fn cmd_staff_position(midi: u8) -> i32 {
    staff_position(Note::from_midi(midi))
}

#[tauri::command]
fn cmd_generate_sequence(root_chroma: u8, scale_id: u8, length: u8, range_start: u8, range_end: u8, seed: u64) -> Vec<u8> {
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
    generate_sequence(root_chroma, scale, range_start, range_end, length, seed)
        .iter()
        .map(|n| n.midi())
        .collect()
}

#[tauri::command]
fn cmd_intro_chord(root_midi: u8, scale_id: u8) -> Vec<u8> {
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

#[tauri::command]
fn cmd_is_correct_note(detected_midi: u8, cents: i32, expected_midi: u8) -> bool {
    is_correct_note(detected_midi, cents, expected_midi)
}

#[tauri::command]
fn cmd_test_score(max_attempts: u8, attempts_used: u8, passed: bool) -> u8 {
    test_score(max_attempts, attempts_used, passed)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            cmd_detect_pitch,
            cmd_freq_to_midi,
            cmd_freq_to_cents,
            cmd_staff_position,
            cmd_generate_sequence,
            cmd_intro_chord,
            cmd_is_correct_note,
            cmd_test_score,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
