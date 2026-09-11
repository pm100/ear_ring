#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ear_ring_core::{
    accidental_in_key, detect_pitch, DEFAULT_YIN_THRESHOLD, diatonic_chord_label, effective_intro_root_midi, enforce_min_range_span, freq_to_note, generate_diatonic_chord, generate_sequence, help_sections_json, tooltips_json,
    intro_chord, is_correct_note, is_sharp_key, key_accidental_count, key_sig_staff_positions, label_to_midi,
    melody_count, melody_range_midi, melody_title, melody_to_midi_by_index, note_timing, preferred_midi_label,
    scale_notes, scale_type_from_id, shuffle_melody_indices, staff_position, test_score, note_retry_penalty, wrong_note_outcome, written_diatonic_chord_label, written_note_name, written_midi_label, written_scale_label,
    Note, PitchTracker, ScaleType,
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
    match detect_pitch(&samples, sample_rate, DEFAULT_YIN_THRESHOLD) {
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
fn cmd_generate_sequence(root_chroma: u8, scale_id: u8, length: u8, range_start: u8, range_end: u8, seed: u64, avoid_first_midi: Option<u8>) -> Vec<u8> {
    let scale = scale_type_from_id(scale_id).unwrap_or(ScaleType::Major);
    generate_sequence(root_chroma, scale, range_start, range_end, length, seed, avoid_first_midi)
        .iter()
        .map(|n| n.midi())
        .collect()
}

#[tauri::command]
fn cmd_generate_diatonic_chord(root_chroma: u8, scale_id: u8, note_count: u8, range_start: u8, range_end: u8, seed: u64) -> Vec<u8> {
    let scale = scale_type_from_id(scale_id).unwrap_or(ScaleType::Major);
    generate_diatonic_chord(root_chroma, scale, note_count, range_start, range_end, seed)
        .iter()
        .map(|n| n.midi())
        .collect()
}

#[tauri::command]
fn cmd_diatonic_chord_label(root_chroma: u8, scale_id: u8, note_count: u8, range_start: u8, range_end: u8, center_midi: u8, seed: u64) -> String {
    let scale = scale_type_from_id(scale_id).unwrap_or(ScaleType::Major);
    diatonic_chord_label(root_chroma, scale, note_count, range_start, range_end, center_midi, seed)
}

#[tauri::command]
fn cmd_written_diatonic_chord_label(concert_root_chroma: u8, scale_id: u8, note_count: u8, range_start: u8, range_end: u8, center_midi: u8, seed: u64, instrument_index: u32) -> String {
    let scale = scale_type_from_id(scale_id).unwrap_or(ScaleType::Major);
    written_diatonic_chord_label(concert_root_chroma, scale, note_count, range_start, range_end, center_midi, seed, instrument_index as usize)
}

#[tauri::command]
fn cmd_enforce_min_range_span(new_start: u8, new_end: u8, old_start: u8, old_end: u8) -> (u8, u8) {
    enforce_min_range_span(new_start, new_end, old_start, old_end)
}

#[tauri::command]
fn cmd_intro_chord(root_midi: u8, scale_id: u8) -> Vec<u8> {
    let scale = scale_type_from_id(scale_id).unwrap_or(ScaleType::Major);
    intro_chord(Note::from_midi(root_midi), scale)
        .iter()
        .map(|n| n.midi())
        .collect()
}

/// The 7 notes of a scale ascending from root_midi. Used for the "Scale" intro-sound
/// option (issue #8).
#[tauri::command]
fn cmd_scale_notes(root_midi: u8, scale_id: u8) -> Vec<u8> {
    let scale = scale_type_from_id(scale_id).unwrap_or(ScaleType::Major);
    scale_notes(Note::from_midi(root_midi), scale)
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

/// Issue #9 "note correction": what to do after a wrong note. Returns 0 = retry
/// the same note, 1 = restart the whole sequence, 2 = fail the test.
#[tauri::command]
fn cmd_wrong_note_outcome(
    current_attempt: u8,
    max_attempts: u8,
    note_retry_count: u8,
    note_retries_allowed: u8,
) -> u8 {
    wrong_note_outcome(current_attempt, max_attempts, note_retry_count, note_retries_allowed)
}

/// Issue #9 "note correction": points to deduct from cmd_test_score's result for
/// note-level retries used along the way.
#[tauri::command]
fn cmd_note_retry_penalty(note_retries_used: u8, note_retries_allowed: u8, max_attempts: u8) -> u8 {
    note_retry_penalty(note_retries_used, note_retries_allowed, max_attempts)
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

/// Parse a typed note label (e.g. "C4", "C#4", "Db4") into a MIDI number.
/// Returns None if it doesn't parse or falls outside 0..=127.
#[tauri::command]
fn cmd_label_to_midi(label: String) -> Option<u8> {
    label_to_midi(&label)
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
fn cmd_tooltip_content() -> String {
    tooltips_json()
}

#[tauri::command]
fn cmd_instrument_list() -> String {
    ear_ring_core::instrument_list_json()
}

#[tauri::command]
fn cmd_git_hash() -> String {
    ear_ring_core::GIT_HASH.to_string()
}

#[tauri::command]
fn cmd_transpose_display_midi(concert_midi: i32, instrument_index: i32) -> i32 {
    ear_ring_core::transpose_display_midi(concert_midi, instrument_index.max(0) as usize)
}

#[tauri::command]
fn cmd_written_note_name(concert_chroma: u8, instrument_index: u32) -> String {
    written_note_name(concert_chroma, instrument_index as usize).to_string()
}

#[tauri::command]
fn cmd_written_midi_label(concert_midi: u8, instrument_index: u32) -> String {
    written_midi_label(concert_midi, instrument_index as usize)
}

#[tauri::command]
fn cmd_written_scale_label(concert_root_chroma: u8, scale_id: u8, instrument_index: u32) -> String {
    written_scale_label(concert_root_chroma, scale_id, instrument_index as usize)
}

#[tauri::command]
fn cmd_effective_intro_root_midi(root_chroma: u8, scale_id: u8, range_start: u8) -> u8 {
    effective_intro_root_midi(root_chroma, scale_id, range_start)
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
            cmd_generate_diatonic_chord,
            cmd_diatonic_chord_label,
            cmd_written_diatonic_chord_label,
            cmd_enforce_min_range_span,
            cmd_intro_chord,
            cmd_scale_notes,
            cmd_is_correct_note,
            cmd_test_score,
            cmd_wrong_note_outcome,
            cmd_note_retry_penalty,
            cmd_is_sharp_key,
            cmd_key_accidental_count,
            cmd_preferred_midi_label,
            cmd_accidental_in_key,
            cmd_key_sig_positions,
            cmd_help_content,
            cmd_tooltip_content,
            cmd_instrument_list,
            cmd_git_hash,
            cmd_transpose_display_midi,
            cmd_written_note_name,
            cmd_written_midi_label,
            cmd_label_to_midi,
            cmd_written_scale_label,
            cmd_effective_intro_root_midi,
            cmd_melody_count,
            cmd_shuffle_melody_indices,
            cmd_pick_melody_by_index,
            cmd_melody_range_midi,
            cmd_sequence_timings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
