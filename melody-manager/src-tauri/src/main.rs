#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use ear_ring_core::{
    melody_count, melody_raw_notes, melody_to_midi_by_index, melody_title, note_timing,
    staff_position, preferred_midi_label, accidental_in_key, key_sig_staff_positions,
    key_accidental_count, is_sharp_key, Note, detect_pitch,
};
use serde::Serialize;

// ── Melody commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn cmd_melody_count() -> u32 {
    melody_count() as u32
}

#[derive(Serialize)]
struct RawNote {
    semitones: i8,
    duration: f32,
}

#[derive(Serialize)]
struct RawMelodyResult {
    title: String,
    notes: Vec<RawNote>,
}

/// Returns the raw semitone offsets and durations for a melody, without MIDI conversion.
/// Used by the Melody Manager to display and edit melodies before exporting.
#[tauri::command]
fn cmd_melody_raw(index: u32) -> Option<RawMelodyResult> {
    let (title, semitones, durations) = melody_raw_notes(index as u8)?;
    let notes = semitones
        .into_iter()
        .zip(durations.into_iter())
        .map(|(s, d)| RawNote { semitones: s, duration: d })
        .collect();
    Some(RawMelodyResult { title, notes })
}

/// Returns midi_notes + durations for a melody transposed to root_chroma.
#[derive(Serialize)]
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

/// Returns `[[hold_ms, step_ms], ...]` for each note.
#[tauri::command]
fn cmd_sequence_timings(bpm: f32, durations: Vec<f32>) -> Vec<(u32, u32)> {
    durations.iter().map(|&d| note_timing(bpm, d)).collect()
}

// ── Music theory helpers (for MusicStaff rendering) ──────────────────────────

#[tauri::command]
fn cmd_staff_position(midi: u8) -> i32 {
    staff_position(Note::from_midi(midi))
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
fn cmd_key_accidental_count(root_chroma: u8) -> i32 {
    key_accidental_count(root_chroma) as i32
}

#[tauri::command]
fn cmd_is_sharp_key(root_chroma: u8) -> bool {
    is_sharp_key(root_chroma)
}

/// Returns all melody titles as an array (for populating the list immediately on startup).
#[tauri::command]
fn cmd_melody_titles() -> Vec<String> {
    let count = melody_count();
    (0..count).map(|i| melody_title(i as u8).unwrap_or_default().to_string()).collect()
}



/// Write `content` to `path`. Returns the absolute path written.
/// Used by the Melody Manager export feature to save a new melodies.txt.
#[tauri::command]
fn cmd_save_file(content: String, path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, content).map_err(|e| e.to_string())?;
    let abs = p.canonicalize().map(|a| a.to_string_lossy().to_string()).unwrap_or(path);
    Ok(abs)
}

/// Detect the fundamental frequency of a mono PCM buffer.
/// Returns the frequency in Hz, or null if not detected.
#[tauri::command]
fn cmd_detect_pitch(samples: Vec<f32>, sample_rate: u32) -> Option<f32> {
    detect_pitch(&samples, sample_rate)
}

/// Fetch the raw text content of any URL (for ABC file import by URL).
#[tauri::command]
async fn cmd_fetch_url_text(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

// ── Internet tune search ──────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct SearchResult {
    id: u32,
    name: String,
    tune_type: String,
    /// "session" = TheSession.org, "abcnotation" = abcnotation.com (abc field is inline)
    source: String,
    /// For abcnotation results the ABC is returned directly in the search response
    abc: Option<String>,
}

/// Search TheSession.org and abcnotation.com in parallel, merge up to 30 results.
#[tauri::command]
async fn cmd_search_tunes(query: String) -> Result<Vec<SearchResult>, String> {
    let q = urlencoding::encode(&query).to_string();

    let session_url = format!(
        "https://thesession.org/tunes/search?q={}&format=json&perpage=15",
        q
    );
    let abc_url = format!(
        "https://abcnotation.com/api/v1/search?q={}&start=0",
        q
    );

    let client = reqwest::Client::new();

    let (session_res, abc_res) = tokio::join!(
        client.get(&session_url).send(),
        client.get(&abc_url).send(),
    );

    let mut results: Vec<SearchResult> = Vec::new();

    // TheSession results
    if let Ok(resp) = session_res {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(tunes) = json["tunes"].as_array() {
                for t in tunes {
                    if let (Some(id), Some(name)) = (t["id"].as_u64(), t["name"].as_str()) {
                        results.push(SearchResult {
                            id: id as u32,
                            name: name.to_string(),
                            tune_type: t["type"].as_str().unwrap_or("").to_string(),
                            source: "session".to_string(),
                            abc: None,
                        });
                    }
                }
            }
        }
    }

    // abcnotation.com results
    if let Ok(resp) = abc_res {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(tunes) = json["tunes"].as_array() {
                for (i, t) in tunes.iter().enumerate() {
                    let title = t["name"].as_str()
                        .or_else(|| t["T"].as_str())
                        .unwrap_or("Unknown")
                        .to_string();
                    let abc = t["abc"].as_str().map(|s| s.to_string());
                    results.push(SearchResult {
                        id: (10000 + i) as u32, // synthetic ID; ABC is inline
                        name: title,
                        tune_type: t["rhythm"].as_str().unwrap_or("").to_string(),
                        source: "abcnotation".to_string(),
                        abc,
                    });
                }
            }
        }
    }

    Ok(results)
}

#[derive(Serialize)]
struct TuneAbc {
    title: String,
    abc: String,
}

/// Fetch the ABC notation for a tune. For TheSession results uses the API;
/// for abcnotation results the ABC was already returned inline in the search.
#[tauri::command]
async fn cmd_fetch_tune_abc(id: u32, source: String, abc: Option<String>, name: String) -> Result<TuneAbc, String> {
    if source == "abcnotation" {
        return Ok(TuneAbc {
            title: name,
            abc: abc.ok_or("no ABC data for this result")?,
        });
    }
    // TheSession.org
    let url = format!("https://thesession.org/tunes/{}?format=json", id);
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    let title = json["name"].as_str().unwrap_or("Unknown").to_string();
    let settings = json["settings"].as_array().ok_or("no settings found")?;
    let abc = settings
        .first()
        .and_then(|s| s["abc"].as_str())
        .ok_or("no ABC notation found")?
        .to_string();

    Ok(TuneAbc { title, abc })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            cmd_melody_titles,
            cmd_melody_count,
            cmd_melody_raw,
            cmd_pick_melody_by_index,
            cmd_sequence_timings,
            cmd_staff_position,
            cmd_preferred_midi_label,
            cmd_accidental_in_key,
            cmd_key_sig_positions,
            cmd_key_accidental_count,
            cmd_is_sharp_key,
            cmd_save_file,
            cmd_detect_pitch,
            cmd_fetch_url_text,
            cmd_search_tunes,
            cmd_fetch_tune_abc,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
