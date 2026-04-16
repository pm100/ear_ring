pub mod music_theory;
pub mod pitch_detection;
pub mod tracker;

pub use music_theory::{
    accidental_in_key, effective_key_chroma, freq_to_note, generate_sequence, intro_chord,
    is_correct_note, is_sharp_key, key_accidental_count, key_sig_staff_positions,
    key_signature_pitch_classes, melody_count, melody_range_midi, melody_raw_notes, melody_title,
    melody_to_midi_by_index, midi_to_freq, midi_to_label, note_name, note_timing,
    preferred_midi_label, preferred_note_label, scale_label, scale_name, scale_notes,
    shuffle_melody_indices, staff_position, staff_position_in_key, test_score,
    transpose_display_midi, MelodyNote, MelodySnippet, Note, NoteName, ScaleType, FLAT_ORDER,
    FLAT_STAFF_POSITIONS, SHARP_ORDER, SHARP_STAFF_POSITIONS,
};
pub use pitch_detection::detect_pitch;
pub use tracker::{FrameResult, PitchTracker};

// ── Help content ──────────────────────────────────────────────────────────────

const HELP_MD: &str = include_str!("help.md");

/// Parse the embedded help.md into a JSON array:
/// `[{"title":"...","body":"..."},...]`
/// Each section starts with a `## Title` line; body is everything until the next section.
pub fn help_sections_json() -> String {
    let mut sections: Vec<(String, String)> = Vec::new();
    let mut current_title: Option<String> = None;
    let mut current_body: Vec<&str> = Vec::new();

    for line in HELP_MD.lines() {
        if let Some(title) = line.strip_prefix("## ") {
            if let Some(t) = current_title.take() {
                sections.push((t, current_body.join("\n").trim().to_string()));
                current_body.clear();
            }
            current_title = Some(title.trim().to_string());
        } else if current_title.is_some() {
            current_body.push(line);
        }
    }
    if let Some(t) = current_title {
        sections.push((t, current_body.join("\n").trim().to_string()));
    }

    let mut json = String::from("[");
    for (i, (title, body)) in sections.iter().enumerate() {
        if i > 0 { json.push(','); }
        json.push_str(&format!(
            "{{\"title\":{},\"body\":{}}}",
            json_string(title),
            json_string(body)
        ));
    }
    json.push(']');
    json
}

fn json_string(s: &str) -> String {
    let mut out = String::from('"');
    for c in s.chars() {
        match c {
            '"'  => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => {},
            c    => out.push(c),
        }
    }
    out.push('"');
    out
}

// ── Instrument list ──────────────────────────────────────────────────────────

pub fn instrument_list_json() -> String {
    use music_theory::INSTRUMENTS;
    let mut json = String::from("[");
    for (i, inst) in INSTRUMENTS.iter().enumerate() {
        if i > 0 { json.push(','); }
        json.push_str(&format!(
            "{{\"id\":{},\"name\":{},\"semitones\":{},\"rangeStart\":{},\"rangeEnd\":{},\"graceFrames\":{},\"octaveCorrection\":{}}}",
            i,
            json_string(inst.name),
            inst.semitones,
            inst.range_start,
            inst.range_end,
            inst.grace_frames,
            inst.octave_correction
        ));
    }
    json.push(']');
    json
}

// ── C-compatible FFI surface ──────────────────────────────────────────────────
// These thin wrappers are called from the React Native Turbo Native Module
// (Swift / Kotlin) without requiring uniffi code-gen at this stage.

use std::os::raw::{c_float, c_int, c_uchar, c_uint};

/// Returns a pointer to a null-terminated UTF-8 JSON string containing the
/// help sections: `[{"title":"...","body":"..."},...]`.
/// The pointer is valid for the lifetime of the process (static storage).
#[no_mangle]
pub extern "C" fn ear_ring_help_content() -> *const std::os::raw::c_char {
    use std::ffi::CString;
    use std::sync::OnceLock;
    static CACHE: OnceLock<CString> = OnceLock::new();
    CACHE.get_or_init(|| {
        CString::new(help_sections_json()).unwrap_or_else(|_| CString::new("[]").unwrap())
    }).as_ptr()
}

/// Returns a JSON array of available instruments:
/// `[{"id":0,"name":"Piano","semitones":0},...]`
/// The pointer is valid for the lifetime of the process (static storage).
#[no_mangle]
pub extern "C" fn ear_ring_instrument_list() -> *const std::os::raw::c_char {
    use std::ffi::CString;
    use std::sync::OnceLock;
    static CACHE: OnceLock<CString> = OnceLock::new();
    CACHE.get_or_init(|| {
        CString::new(instrument_list_json()).unwrap_or_else(|_| CString::new("[]").unwrap())
    }).as_ptr()
}

/// Convert concert MIDI to written/display MIDI for the given instrument index.
/// Clamps to 0–127. Returns the unchanged MIDI if the index is out of range.
#[no_mangle]
pub extern "C" fn ear_ring_transpose_display_midi(
    concert_midi: c_int,
    instrument_index: c_int,
) -> c_int {
    transpose_display_midi(concert_midi, instrument_index.max(0) as usize) as c_int
}

/// Detect pitch from a raw f32 PCM buffer.
///
/// * `samples`       – pointer to f32 samples
/// * `num_samples`   – number of samples
/// * `sample_rate`   – sample rate in Hz
/// * `out_hz`        – out-parameter: detected frequency, 0.0 if not detected
///
/// Returns 1 if a pitch was detected, 0 otherwise.
#[no_mangle]
pub extern "C" fn ear_ring_detect_pitch(
    samples: *const c_float,
    num_samples: c_uint,
    sample_rate: c_uint,
    out_hz: *mut c_float,
) -> c_int {
    if samples.is_null() || out_hz.is_null() {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(samples, num_samples as usize) };
    match detect_pitch(slice, sample_rate) {
        Some(hz) => {
            unsafe { *out_hz = hz };
            1
        }
        None => {
            unsafe { *out_hz = 0.0 };
            0
        }
    }
}

/// Convert a frequency to MIDI note number and cents deviation.
///
/// * `hz`        – frequency in Hz
/// * `out_midi`  – out-parameter: MIDI note number (0–127)
/// * `out_cents` – out-parameter: deviation in cents (-50 to +50)
///
/// Returns 1 on success, 0 if frequency is out of range.
#[no_mangle]
pub extern "C" fn ear_ring_freq_to_note(
    hz: c_float,
    out_midi: *mut c_uchar,
    out_cents: *mut c_int,
) -> c_int {
    if out_midi.is_null() || out_cents.is_null() {
        return 0;
    }
    match freq_to_note(hz) {
        Some((note, cents)) => {
            unsafe {
                *out_midi = note.midi();
                *out_cents = cents;
            }
            1
        }
        None => 0,
    }
}

/// Get the staff position for a MIDI note number.
///
/// Returns diatonic steps above middle C (C4 = 0, D4 = 1, C5 = 7, B3 = -1, …).
#[no_mangle]
pub extern "C" fn ear_ring_staff_position(midi: c_uchar) -> c_int {
    staff_position(Note::from_midi(midi))
}

/// Generate a sequence of MIDI note numbers.
///
/// * `root_chroma` – pitch class of the root note (0 = C, 1 = C#, …, 11 = B)
/// * `scale_id`    – 0=Major, 1=NaturalMinor, 2=Dorian, 3=Mixolydian
/// * `length`      – number of notes to generate
/// * `range_start` – lowest accepted MIDI note (inclusive)
/// * `range_end`   – highest accepted MIDI note (inclusive)
/// * `seed`        – random seed for reproducibility
/// * `out_buf`     – caller-allocated buffer of at least `length` bytes
///
/// Returns the number of notes written, or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_generate_sequence(
    root_chroma: c_uchar,
    scale_id: c_uchar,
    length: c_uchar,
    range_start: c_uchar,
    range_end: c_uchar,
    seed: u64,
    out_buf: *mut c_uchar,
) -> c_int {
    if out_buf.is_null() {
        return -1;
    }
    let scale = match scale_id {
        0 => ScaleType::Major,
        1 => ScaleType::NaturalMinor,
        2 => ScaleType::Dorian,
        3 => ScaleType::Mixolydian,
        _ => return -1,
    };
    let notes = generate_sequence(root_chroma, scale, range_start, range_end, length, seed);
    let out = unsafe { std::slice::from_raw_parts_mut(out_buf, length as usize) };
    for (i, note) in notes.iter().enumerate() {
        out[i] = note.midi();
    }
    notes.len() as c_int
}

/// Returns the number of melody snippets in the library.
#[no_mangle]
pub extern "C" fn ear_ring_melody_count() -> c_uint {
    melody_count() as c_uint
}

/// Fisher-Yates shuffle of [0..melody_count()). Writes indices into out_buf.
/// out_buf must be at least melody_count() bytes. Returns count written, or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_shuffle_melody_indices(seed: u64, out_buf: *mut c_uchar) -> c_int {
    if out_buf.is_null() { return -1; }
    let indices = shuffle_melody_indices(seed);
    let out = unsafe { std::slice::from_raw_parts_mut(out_buf, indices.len()) };
    for (i, &idx) in indices.iter().enumerate() { out[i] = idx; }
    indices.len() as c_int
}

/// Convert melody snippet at `index` to MIDI notes + durations for `root_chroma`.
/// out_midi and out_dur must each be at least melody_max_notes bytes / floats.
/// Returns note count written, or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_pick_melody_by_index(
    index: c_uchar,
    root_chroma: c_uchar,
    out_midi: *mut c_uchar,
    out_dur: *mut c_float,
) -> c_int {
    if out_midi.is_null() || out_dur.is_null() { return -1; }
    match melody_to_midi_by_index(index, root_chroma) {
        None => -1,
        Some((midi_notes, durations)) => {
            let n = midi_notes.len();
            let midi_out = unsafe { std::slice::from_raw_parts_mut(out_midi, n) };
            let dur_out = unsafe { std::slice::from_raw_parts_mut(out_dur, n) };
            for i in 0..n {
                midi_out[i] = midi_notes[i];
                dur_out[i] = durations[i];
            }
            n as c_int
        }
    }
}

/// Build a 3-note intro chord as MIDI note numbers.
#[no_mangle]
pub extern "C" fn ear_ring_intro_chord(
    root_midi: c_uchar,
    scale_id: c_uchar,
    out_buf: *mut c_uchar,
) -> c_int {
    if out_buf.is_null() {
        return -1;
    }
    let scale = match scale_id {
        0 => ScaleType::Major,
        1 => ScaleType::NaturalMinor,
        2 => ScaleType::Dorian,
        3 => ScaleType::Mixolydian,
        _ => return -1,
    };
    let root = Note::from_midi(root_midi);
    let notes = intro_chord(root, scale);
    let out = unsafe { std::slice::from_raw_parts_mut(out_buf, notes.len()) };
    for (i, note) in notes.iter().enumerate() {
        out[i] = note.midi();
    }
    notes.len() as c_int
}

#[no_mangle]
pub extern "C" fn ear_ring_is_correct_note(
    detected_midi: c_uchar,
    cents: c_int,
    expected_midi: c_uchar,
) -> c_int {
    if is_correct_note(detected_midi, cents, expected_midi) {
        1
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn ear_ring_test_score(
    max_attempts: c_uchar,
    attempts_used: c_uchar,
    passed: c_int,
) -> c_int {
    test_score(max_attempts, attempts_used, passed != 0) as c_int
}

/// Convert a MIDI number to a note label string (e.g. "C#4").
/// Writes a null-terminated UTF-8 string into `out_buf`.
/// Returns the number of bytes written (excluding null), or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_midi_to_label(
    midi: c_uchar,
    out_buf: *mut std::os::raw::c_char,
    buf_len: c_uint,
) -> c_int {
    if out_buf.is_null() || buf_len == 0 {
        return -1;
    }
    let label = midi_to_label(midi);
    let bytes = label.as_bytes();
    let copy_len = (bytes.len()).min(buf_len as usize - 1);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const std::os::raw::c_char, out_buf, copy_len);
        *out_buf.add(copy_len) = 0;
    }
    copy_len as c_int
}

/// Display name for a pitch class (chroma 0–11).
/// Writes a null-terminated UTF-8 string into `out_buf`.
/// Returns the number of bytes written (excluding null), or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_note_name(
    chroma: c_uchar,
    out_buf: *mut std::os::raw::c_char,
    buf_len: c_uint,
) -> c_int {
    if out_buf.is_null() || buf_len == 0 {
        return -1;
    }
    let name = note_name(chroma);
    let bytes = name.as_bytes();
    let copy_len = (bytes.len()).min(buf_len as usize - 1);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const std::os::raw::c_char, out_buf, copy_len);
        *out_buf.add(copy_len) = 0;
    }
    copy_len as c_int
}

/// Display name for a scale ID (0–3).
/// Writes a null-terminated UTF-8 string into `out_buf`.
/// Returns the number of bytes written (excluding null), or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_scale_name(
    scale_id: c_uchar,
    out_buf: *mut std::os::raw::c_char,
    buf_len: c_uint,
) -> c_int {
    if out_buf.is_null() || buf_len == 0 {
        return -1;
    }
    let name = scale_name(scale_id);
    let bytes = name.as_bytes();
    let copy_len = (bytes.len()).min(buf_len as usize - 1);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const std::os::raw::c_char, out_buf, copy_len);
        *out_buf.add(copy_len) = 0;
    }
    copy_len as c_int
}

/// Display label for a scale given the current root key, e.g. "Natural Minor (Eb)".
/// For Major the label is just "Major" with no parenthetical.
/// Writes a null-terminated UTF-8 string into `out_buf`.
/// Returns the number of bytes written (excluding null), or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_scale_label(
    root_chroma: c_uchar,
    scale_id: c_uchar,
    out_buf: *mut std::os::raw::c_char,
    buf_len: c_uint,
) -> c_int {
    if out_buf.is_null() || buf_len == 0 {
        return -1;
    }
    let label = scale_label(root_chroma, scale_id);
    let bytes = label.as_bytes();
    let copy_len = bytes.len().min(buf_len as usize - 1);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const std::os::raw::c_char, out_buf, copy_len);
        *out_buf.add(copy_len) = 0;
    }
    copy_len as c_int
}

/// Returns the effective major key chroma for display purposes.
/// For Major this equals root_chroma; for modal/minor scales returns the implied major key chroma.
/// e.g. root_chroma=0 (C), scale_id=1 (Natural Minor) → 3 (Eb major).
#[no_mangle]
pub extern "C" fn ear_ring_effective_key_chroma(root_chroma: c_uchar, scale_id: c_uchar) -> c_uchar {
    effective_key_chroma(root_chroma, scale_id)
}

/// Returns 1 if the major key with this root chroma uses sharps, 0 for flats.
#[no_mangle]
pub extern "C" fn ear_ring_is_sharp_key(root_chroma: c_uchar) -> c_int {
    if is_sharp_key(root_chroma) { 1 } else { 0 }
}

/// Returns the number of accidentals in the key signature:
/// positive = sharps, negative = flats.
#[no_mangle]
pub extern "C" fn ear_ring_key_accidental_count(root_chroma: c_uchar) -> c_int {
    key_accidental_count(root_chroma) as c_int
}

/// Writes the key-preferred note label (without octave) into out_buf.
/// e.g. midi=61, root_chroma=7 (G major) → "C#"; root_chroma=5 (F major) → "Db"
#[no_mangle]
pub extern "C" fn ear_ring_preferred_note_label(
    midi: c_uchar,
    root_chroma: c_uchar,
    out_buf: *mut std::os::raw::c_char,
    buf_len: c_uint,
) -> c_int {
    if out_buf.is_null() || buf_len == 0 { return -1; }
    let label = preferred_note_label(midi, root_chroma);
    let bytes = label.as_bytes();
    let copy_len = bytes.len().min(buf_len as usize - 1);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const std::os::raw::c_char, out_buf, copy_len);
        *out_buf.add(copy_len) = 0;
    }
    copy_len as c_int
}

/// Writes the full MIDI label with octave in key context, e.g. "C#4" or "Bb3".
#[no_mangle]
pub extern "C" fn ear_ring_preferred_midi_label(
    midi: c_uchar,
    root_chroma: c_uchar,
    out_buf: *mut std::os::raw::c_char,
    buf_len: c_uint,
) -> c_int {
    if out_buf.is_null() || buf_len == 0 { return -1; }
    let label = preferred_midi_label(midi, root_chroma);
    let bytes = label.as_bytes();
    let copy_len = bytes.len().min(buf_len as usize - 1);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const std::os::raw::c_char, out_buf, copy_len);
        *out_buf.add(copy_len) = 0;
    }
    copy_len as c_int
}

/// For key-signature display mode: returns what accidental to draw on a note.
/// Returns 0=none, 1=sharp(♯), 2=flat(♭), 3=natural(♮).
#[no_mangle]
pub extern "C" fn ear_ring_accidental_in_key(
    midi: c_uchar,
    root_chroma: c_uchar,
) -> c_int {
    match accidental_in_key(midi, root_chroma) {
        None => 0,
        Some("♯") => 1,
        Some("♭") => 2,
        Some("♮") => 3,
        _ => 0,
    }
}

/// Writes key signature staff positions into out_buf (array of int32).
/// Returns the count of positions written, and sets *out_is_sharp to 1 for sharps, 0 for flats.
#[no_mangle]
pub extern "C" fn ear_ring_key_sig_positions(
    root_chroma: c_uchar,
    out_buf: *mut c_int,
    buf_len: c_uint,
    out_is_sharp: *mut c_int,
) -> c_int {
    if out_buf.is_null() { return -1; }
    let (positions, is_sharp) = key_sig_staff_positions(root_chroma);
    if !out_is_sharp.is_null() {
        unsafe { *out_is_sharp = if is_sharp { 1 } else { 0 }; }
    }
    let count = positions.len().min(buf_len as usize);
    let out = unsafe { std::slice::from_raw_parts_mut(out_buf, count) };
    for (i, &pos) in positions.iter().take(count).enumerate() {
        out[i] = pos;
    }
    count as c_int
}

/// Key-aware staff position for a MIDI note.
/// Flat keys place flattened pitch classes at their upper diatonic neighbour
/// (e.g. Bb at B's position). Sharp keys use the standard sharp-based mapping.
/// Returns diatonic steps above C4 (C4=0, D4=1, …, B4=6).
#[no_mangle]
pub extern "C" fn ear_ring_staff_position_in_key(
    midi: c_uchar,
    root_chroma: c_uchar,
) -> c_int {
    staff_position_in_key(midi, root_chroma) as c_int
}

// ── PitchTracker C FFI ────────────────────────────────────────────────────────
// Opaque-pointer API used by iOS (and any other C-FFI consumer).
// Android uses the JNI variants below.

/// Create a new `PitchTracker` on the heap. Must be freed with `ear_ring_tracker_free`.
#[no_mangle]
pub extern "C" fn ear_ring_tracker_new(silence_threshold: c_float, required_frames: c_uint) -> *mut PitchTracker {
    Box::into_raw(Box::new(PitchTracker::new(silence_threshold, required_frames)))
}

/// Free a `PitchTracker` created by `ear_ring_tracker_new`. Null-safe.
#[no_mangle]
pub extern "C" fn ear_ring_tracker_free(tracker: *mut PitchTracker) {
    if !tracker.is_null() {
        unsafe { drop(Box::from_raw(tracker)); }
    }
}

/// Reset all stability state. Call between attempts or when stopping.
#[no_mangle]
pub extern "C" fn ear_ring_tracker_reset(tracker: *mut PitchTracker) {
    if !tracker.is_null() {
        unsafe { (*tracker).reset(); }
    }
}

/// Reset and discard the next `warmup_frames` buffers before processing.
#[no_mangle]
pub extern "C" fn ear_ring_tracker_reset_with_warmup(tracker: *mut PitchTracker, warmup_frames: c_uint) {
    if !tracker.is_null() {
        unsafe { (*tracker).reset_with_warmup(warmup_frames); }
    }
}

/// Update silence threshold and required frames without resetting state.
#[no_mangle]
pub extern "C" fn ear_ring_tracker_set_params(tracker: *mut PitchTracker, silence_threshold: c_float, required_frames: c_uint) {
    if !tracker.is_null() {
        unsafe { (*tracker).set_params(silence_threshold, required_frames); }
    }
}

/// Apply per-instrument detection parameters (grace frames and octave correction) from the
/// built-in INSTRUMENTS table. Call whenever the instrument selection changes.
#[no_mangle]
pub extern "C" fn ear_ring_tracker_apply_instrument(tracker: *mut PitchTracker, instrument_index: c_int) {
    if !tracker.is_null() {
        unsafe { (*tracker).apply_instrument(instrument_index.max(0) as usize); }
    }
}

/// Process one audio buffer.
///
/// * `out_live_hz`  – set to the detected frequency (0.0 if silent/undetected)
/// * `out_live_midi` – set to the detected MIDI note (-1 if silent/undetected)
///
/// Returns the confirmed MIDI note the first time a note stabilises, or -1.
#[no_mangle]
pub extern "C" fn ear_ring_tracker_process(
    tracker: *mut PitchTracker,
    samples: *const c_float,
    num_samples: c_uint,
    sample_rate: c_uint,
    out_live_hz: *mut c_float,
    out_live_midi: *mut c_int,
) -> c_int {
    if tracker.is_null() || samples.is_null() {
        return -1;
    }
    let slice = unsafe { std::slice::from_raw_parts(samples, num_samples as usize) };
    let result = unsafe { (*tracker).process(slice, sample_rate) };
    if !out_live_hz.is_null() {
        unsafe { *out_live_hz = result.live_hz; }
    }
    if !out_live_midi.is_null() {
        unsafe { *out_live_midi = result.live_midi; }
    }
    result.confirmed_midi
}

// ── Android JNI exports ───────────────────────────────────────────────────────
#[cfg(target_os = "android")]
mod android_jni {
    use jni::objects::{JClass, JFloatArray, JIntArray};
    use jni::sys::{jfloat, jfloatArray, jint, jintArray, jlong, jstring};
    use jni::JNIEnv;

    use super::{
        accidental_in_key, detect_pitch, effective_key_chroma, freq_to_note, generate_sequence,
        intro_chord, is_correct_note, is_sharp_key, key_accidental_count, key_sig_staff_positions,
        melody_count, melody_range_midi, melody_to_midi_by_index, midi_to_label, note_name,
        preferred_midi_label, preferred_note_label, scale_label, scale_name, shuffle_melody_indices,
        staff_position, staff_position_in_key, test_score, Note, ScaleType,
    };

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeDetectPitch(
        env: JNIEnv,
        _class: JClass,
        samples: jfloatArray,
        sample_rate: jint,
    ) -> jfloat {
        let arr = unsafe { JFloatArray::from_raw(samples) };
        let len = match env.get_array_length(&arr) {
            Ok(l) => l as usize,
            Err(_) => return -1.0,
        };
        let mut buf = vec![0f32; len];
        if env.get_float_array_region(&arr, 0, &mut buf).is_err() {
            return -1.0;
        }
        match detect_pitch(&buf, sample_rate as u32) {
            Some(hz) => hz,
            None => -1.0,
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeFreqToMidi(
        _env: JNIEnv,
        _class: JClass,
        hz: jfloat,
    ) -> jint {
        match freq_to_note(hz) {
            Some((note, _)) => note.midi() as jint,
            None => -1,
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeFreqToCents(
        _env: JNIEnv,
        _class: JClass,
        hz: jfloat,
    ) -> jint {
        match freq_to_note(hz) {
            Some((_, cents)) => cents as jint,
            None => 0,
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeStaffPosition(
        _env: JNIEnv,
        _class: JClass,
        midi: jint,
    ) -> jint {
        staff_position(Note::from_midi(midi as u8)) as jint
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeGenerateSequence(
        env: JNIEnv,
        _class: JClass,
        root_chroma: jint,
        scale_id: jint,
        length: jint,
        range_start: jint,
        range_end: jint,
        seed: jlong,
    ) -> jintArray {
        let scale = match scale_id {
            0 => ScaleType::Major,
            1 => ScaleType::NaturalMinor,
            2 => ScaleType::Dorian,
            3 => ScaleType::Mixolydian,
            _ => ScaleType::Major,
        };
        let notes = generate_sequence(
            root_chroma as u8,
            scale,
            range_start as u8,
            range_end as u8,
            length as u8,
            seed as u64,
        );
        let midi_vals: Vec<jint> = notes.iter().map(|n| n.midi() as jint).collect();

        let arr: JIntArray = match env.new_int_array(midi_vals.len() as i32) {
            Ok(a) => a,
            Err(_) => return std::ptr::null_mut(),
        };
        let _ = env.set_int_array_region(&arr, 0, &midi_vals);
        arr.into_raw()
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeIntroChord(
        env: JNIEnv,
        _class: JClass,
        root_midi: jint,
        scale_id: jint,
    ) -> jintArray {
        let scale = match scale_id {
            0 => ScaleType::Major,
            1 => ScaleType::NaturalMinor,
            2 => ScaleType::Dorian,
            3 => ScaleType::Mixolydian,
            _ => ScaleType::Major,
        };
        let root = Note::from_midi(root_midi as u8);
        let notes = intro_chord(root, scale);
        let midi_vals: Vec<jint> = notes.iter().map(|n| n.midi() as jint).collect();

        let arr: JIntArray = match env.new_int_array(midi_vals.len() as i32) {
            Ok(a) => a,
            Err(_) => return std::ptr::null_mut(),
        };
        let _ = env.set_int_array_region(&arr, 0, &midi_vals);
        arr.into_raw()
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeIsCorrectNote(
        _env: JNIEnv,
        _class: JClass,
        detected_midi: jint,
        cents: jint,
        expected_midi: jint,
    ) -> jint {
        if is_correct_note(detected_midi as u8, cents, expected_midi as u8) {
            1
        } else {
            0
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTestScore(
        _env: JNIEnv,
        _class: JClass,
        max_attempts: jint,
        attempts_used: jint,
        passed: jint,
    ) -> jint {
        test_score(max_attempts as u8, attempts_used as u8, passed != 0) as jint
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeMidiToLabel(
        env: JNIEnv,
        _class: JClass,
        midi: jint,
    ) -> jstring {
        let label = midi_to_label(midi as u8);
        env.new_string(label)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeNoteName(
        env: JNIEnv,
        _class: JClass,
        chroma: jint,
    ) -> jstring {
        let name = note_name(chroma as u8);
        env.new_string(name)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeScaleName(
        env: JNIEnv,
        _class: JClass,
        scale_id: jint,
    ) -> jstring {
        let name = scale_name(scale_id as u8);
        env.new_string(name)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeScaleLabel(
        env: JNIEnv,
        _class: JClass,
        root_chroma: jint,
        scale_id: jint,
    ) -> jstring {
        let label = scale_label(root_chroma as u8, scale_id as u8);
        env.new_string(label)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeEffectiveKeyChroma(
        _env: JNIEnv,
        _class: JClass,
        root_chroma: jint,
        scale_id: jint,
    ) -> jint {
        effective_key_chroma(root_chroma as u8, scale_id as u8) as jint
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeIsSharpKey(
        _env: JNIEnv,
        _class: JClass,
        root_chroma: jint,
    ) -> jint {
        if is_sharp_key(root_chroma as u8) { 1 } else { 0 }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeKeyAccidentalCount(
        _env: JNIEnv,
        _class: JClass,
        root_chroma: jint,
    ) -> jint {
        key_accidental_count(root_chroma as u8) as jint
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativePreferredMidiLabel(
        env: JNIEnv,
        _class: JClass,
        midi: jint,
        root_chroma: jint,
    ) -> jstring {
        let label = preferred_midi_label(midi as u8, root_chroma as u8);
        env.new_string(label)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativePreferredNoteLabel(
        env: JNIEnv,
        _class: JClass,
        midi: jint,
        root_chroma: jint,
    ) -> jstring {
        let label = preferred_note_label(midi as u8, root_chroma as u8);
        env.new_string(label)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeAccidentalInKey(
        _env: JNIEnv,
        _class: JClass,
        midi: jint,
        root_chroma: jint,
    ) -> jint {
        match accidental_in_key(midi as u8, root_chroma as u8) {
            None => 0,
            Some("♯") => 1,
            Some("♭") => 2,
            Some("♮") => 3,
            _ => 0,
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeKeySigPositions(
        env: JNIEnv,
        _class: JClass,
        root_chroma: jint,
    ) -> jintArray {
        let (positions, _is_sharp) = key_sig_staff_positions(root_chroma as u8);
        let vals: Vec<jint> = positions.iter().map(|&p| p as jint).collect();
        let arr = match env.new_int_array(vals.len() as i32) {
            Ok(a) => a,
            Err(_) => return std::ptr::null_mut(),
        };
        let _ = env.set_int_array_region(&arr, 0, &vals);
        arr.into_raw()
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeStaffPositionInKey(
        _env: JNIEnv,
        _class: JClass,
        midi: jint,
        root_chroma: jint,
    ) -> jint {
        staff_position_in_key(midi as u8, root_chroma as u8) as jint
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeHelpContent(
        env: JNIEnv,
        _class: JClass,
    ) -> jstring {
        let json = super::help_sections_json();
        env.new_string(json)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeInstrumentList(
        env: JNIEnv,
        _class: JClass,
    ) -> jstring {
        let json = super::instrument_list_json();
        env.new_string(json)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut())
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTransposeDisplayMidi(
        _env: JNIEnv,
        _class: JClass,
        concert_midi: jint,
        instrument_index: jint,
    ) -> jint {
        super::transpose_display_midi(concert_midi, instrument_index.max(0) as usize) as jint
    }

    // ── PitchTracker JNI wrappers ────────────────────────────────────────────────
    // The tracker is heap-allocated and the handle (raw pointer as i64) is stored
    // in Kotlin. Each call passes the handle back so Rust can recover the reference.

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTrackerNew(
        _env: JNIEnv,
        _class: JClass,
        silence_threshold: jfloat,
        required_frames: jint,
    ) -> jlong {
        let tracker = Box::new(super::PitchTracker::new(silence_threshold, required_frames as u32));
        Box::into_raw(tracker) as jlong
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTrackerFree(
        _env: JNIEnv,
        _class: JClass,
        handle: jlong,
    ) {
        if handle != 0 {
            unsafe { drop(Box::from_raw(handle as *mut super::PitchTracker)); }
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTrackerReset(
        _env: JNIEnv,
        _class: JClass,
        handle: jlong,
    ) {
        if handle != 0 {
            unsafe { (*(handle as *mut super::PitchTracker)).reset(); }
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTrackerResetWithWarmup(
        _env: JNIEnv,
        _class: JClass,
        handle: jlong,
        warmup_frames: jint,
    ) {
        if handle != 0 {
            unsafe { (*(handle as *mut super::PitchTracker)).reset_with_warmup(warmup_frames as u32); }
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTrackerSetParams(
        _env: JNIEnv,
        _class: JClass,
        handle: jlong,
        silence_threshold: jfloat,
        required_frames: jint,
    ) {
        if handle != 0 {
            unsafe { (*(handle as *mut super::PitchTracker)).set_params(silence_threshold, required_frames as u32); }
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTrackerApplyInstrument(
        _env: JNIEnv,
        _class: JClass,
        handle: jlong,
        instrument_index: jint,
    ) {
        if handle != 0 {
            unsafe { (*(handle as *mut super::PitchTracker)).apply_instrument(instrument_index.max(0) as usize); }
        }
    }

    /// Process one audio buffer via the Rust tracker.
    /// Returns a float array [live_hz, live_midi_f32, confirmed_midi_f32].
    /// live_midi and confirmed_midi are -1.0 when absent.
    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeTrackerProcess(
        env: JNIEnv,
        _class: JClass,
        handle: jlong,
        samples: jfloatArray,
        sample_rate: jint,
    ) -> jfloatArray {
        let make_empty = || -> jfloatArray {
            let a = env.new_float_array(3).unwrap();
            let _ = env.set_float_array_region(&a, 0, &[0.0f32, -1.0f32, -1.0f32]);
            a.into_raw()
        };

        if handle == 0 { return make_empty(); }

        let arr = unsafe { JFloatArray::from_raw(samples) };
        let len = match env.get_array_length(&arr) {
            Ok(l) => l as usize,
            Err(_) => return make_empty(),
        };
        let mut buf = vec![0f32; len];
        if env.get_float_array_region(&arr, 0, &mut buf).is_err() {
            return make_empty();
        }

        let result = unsafe { (*(handle as *mut super::PitchTracker)).process(&buf, sample_rate as u32) };
        let out_vals = [result.live_hz, result.live_midi as f32, result.confirmed_midi as f32];

        let out = match env.new_float_array(3) {
            Ok(a) => a,
            Err(_) => return make_empty(),
        };
        let _ = env.set_float_array_region(&out, 0, &out_vals);
        out.into_raw()
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeMelodyCount(
        _env: JNIEnv, _class: JClass,
    ) -> jint {
        melody_count() as jint
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeShuffleMelodyIndices(
        mut env: JNIEnv, _class: JClass,
        seed: jlong,
    ) -> jintArray {
        let indices = shuffle_melody_indices(seed as u64);
        let arr = env.new_int_array(indices.len() as i32).unwrap();
        let ints: Vec<jint> = indices.iter().map(|&x| x as jint).collect();
        env.set_int_array_region(&arr, 0, &ints).unwrap();
        arr.into_raw()
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativePickMelodyByIndex(
        mut env: JNIEnv, _class: JClass,
        index: jint, root_chroma: jint,
    ) -> jfloatArray {
        match melody_to_midi_by_index(index as u8, root_chroma as u8) {
            None => {
                let arr = env.new_float_array(1).unwrap();
                let data = [0f32];
                env.set_float_array_region(&arr, 0, &data).unwrap();
                arr.into_raw()
            }
            Some((midi_notes, durations)) => {
                let n = midi_notes.len();
                let total = 1 + n + n;
                let arr = env.new_float_array(total as i32).unwrap();
                let mut data = Vec::with_capacity(total);
                data.push(n as f32);
                for &m in &midi_notes { data.push(m as f32); }
                for &d in &durations { data.push(d); }
                env.set_float_array_region(&arr, 0, &data).unwrap();
                arr.into_raw()
            }
        }
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCore_nativeMelodyRangeMidi(
        mut env: JNIEnv, _class: JClass,
        index: jint, root_chroma: jint,
    ) -> jintArray {
        let arr = env.new_int_array(2).unwrap();
        if let Some((min, max)) = melody_range_midi(index as u8, root_chroma as u8) {
            env.set_int_array_region(&arr, 0, &[min as jint, max as jint]).unwrap();
        }
        arr.into_raw()
    }
}
