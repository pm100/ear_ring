#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ear_ring_core::{
    accidental_in_key, detect_pitch, freq_to_note, generate_sequence, help_sections_json,
    intro_chord, is_correct_note, is_sharp_key, key_accidental_count, key_sig_staff_positions,
    preferred_midi_label, staff_position, test_score, Note, ScaleType,
};

#[tauri::command]
fn cmd_detect_pitch(samples: Vec<f32>, sample_rate: u32, silence_threshold: f32) -> f32 {
    let rms: f32 = (samples.iter().map(|&s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
    if rms < silence_threshold {
        return -1.0;
    }
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
        2 => ScaleType::Dorian,
        3 => ScaleType::Mixolydian,
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
        2 => ScaleType::Dorian,
        3 => ScaleType::Mixolydian,
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

#[tauri::command]
fn cmd_is_sharp_key(root_chroma: u8) -> bool {
    is_sharp_key(root_chroma)
}

#[tauri::command]
fn cmd_key_accidental_count(root_chroma: u8) -> i32 {
    key_accidental_count(root_chroma) as i32
}

#[tauri::command]
fn cmd_preferred_midi_label(midi: u8, root_chroma: u8) -> String {
    preferred_midi_label(midi, root_chroma).to_string()
}

#[tauri::command]
fn cmd_accidental_in_key(midi: u8, root_chroma: u8) -> i32 {
    match accidental_in_key(midi, root_chroma) {
        None => 0,
        Some("♯") => 1,
        Some("♭") => 2,
        Some("♮") => 3,
        _ => 0,
    }
}

#[tauri::command]
fn cmd_key_sig_positions(root_chroma: u8) -> (Vec<i32>, bool) {
    let (positions, is_sharp) = key_sig_staff_positions(root_chroma);
    (positions.to_vec(), is_sharp)
}

#[tauri::command]
fn cmd_help_content() -> String {
    help_sections_json()
}

#[tauri::command]
fn cmd_instrument_list() -> String {
    ear_ring_core::instrument_list_json()
}

#[tauri::command]
fn cmd_transpose_display_midi(concert_midi: i32, instrument_index: i32) -> i32 {
    ear_ring_core::transpose_display_midi(concert_midi, instrument_index.max(0) as usize)
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
            cmd_is_sharp_key,
            cmd_key_accidental_count,
            cmd_preferred_midi_label,
            cmd_accidental_in_key,
            cmd_key_sig_positions,
            cmd_help_content,
            cmd_instrument_list,
            cmd_transpose_display_midi,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
