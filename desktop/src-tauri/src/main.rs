#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ear_ring_core::{
    accidental_in_key, detect_pitch, freq_to_note, generate_sequence, help_sections_json,
    intro_chord, is_correct_note, is_sharp_key, key_accidental_count, key_sig_staff_positions,
    melody_count, melody_range_midi, melody_title, melody_to_midi_by_index, note_timing, preferred_midi_label,
    shuffle_melody_indices, staff_position, test_score, Note, PitchTracker, ScaleType,
};
use std::sync::Mutex;
use tauri::State;

struct TrackerState(Mutex<PitchTracker>);

// ── PitchTracker commands ────────────────────────────────────────────────────

/// Reset the tracker. Call between attempts or when stopping.
#[tauri::command]
fn cmd_tracker_reset(state: State<TrackerState>) {
    state.0.lock().unwrap().reset();
}

/// Reset the tracker and discard the next `warmup_frames` buffers.
#[tauri::command]
fn cmd_tracker_reset_with_warmup(state: State<TrackerState>, warmup_frames: u32) {
    state.0.lock().unwrap().reset_with_warmup(warmup_frames);
}

/// Update silence threshold and required frames without resetting state.
#[tauri::command]
fn cmd_tracker_set_params(state: State<TrackerState>, silence_threshold: f32, required_frames: u32) {
    state.0.lock().unwrap().set_params(silence_threshold, required_frames);
}

/// Apply per-instrument detection parameters (grace frames, octave correction).
/// Call whenever the instrument selection changes.
#[tauri::command]
fn cmd_tracker_apply_instrument(state: State<TrackerState>, instrument_index: usize) {
    state.0.lock().unwrap().apply_instrument(instrument_index);
}

/// Process one audio buffer.
/// Returns `[live_hz, live_midi, confirmed_midi]` as floats; -1.0 means absent.
#[tauri::command]
fn cmd_tracker_process(state: State<TrackerState>, samples: Vec<f32>, sample_rate: u32) -> (f32, i32, i32) {
    let result = state.0.lock().unwrap().process(&samples, sample_rate);
    (result.live_hz, result.live_midi, result.confirmed_midi)
}

// ── Other commands ───────────────────────────────────────────────────────────

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

#[tauri::command]
fn cmd_melody_count() -> u32 {
    melody_count() as u32
}

#[tauri::command]
fn cmd_shuffle_melody_indices(seed: u64) -> Vec<u8> {
    shuffle_melody_indices(seed)
}

#[derive(serde::Serialize)]
struct MelodyResult {
    midi_notes: Vec<u8>,
    durations: Vec<f32>,
    title: String,
}

#[tauri::command]
fn cmd_pick_melody_by_index(index: u8, root_chroma: u8) -> Option<MelodyResult> {
    let (midi_notes, durations) = melody_to_midi_by_index(index, root_chroma)?;
    let title = melody_title(index).unwrap_or_default();
    Some(MelodyResult { midi_notes, durations, title })
}

#[tauri::command]
fn cmd_melody_range_midi(index: u8, root_chroma: u8) -> Option<(u8, u8)> {
    melody_range_midi(index, root_chroma)
}

/// Returns `[[hold_ms, step_ms], ...]` for each note in a sequence.
/// One IPC call per sequence — call before starting playback.
#[tauri::command]
fn cmd_sequence_timings(bpm: f32, durations: Vec<f32>) -> Vec<(u32, u32)> {
    durations.iter().map(|&d| note_timing(bpm, d)).collect()
}

fn main() {
    tauri::Builder::default()
        .manage(TrackerState(Mutex::new(PitchTracker::new(0.003, 3))))
        .invoke_handler(tauri::generate_handler![
            cmd_tracker_reset,
            cmd_tracker_reset_with_warmup,
            cmd_tracker_set_params,
            cmd_tracker_apply_instrument,
            cmd_tracker_process,
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
            cmd_melody_count,
            cmd_shuffle_melody_indices,
            cmd_pick_melody_by_index,
            cmd_melody_range_midi,
            cmd_sequence_timings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
