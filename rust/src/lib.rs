pub mod music_theory;
pub mod pitch_detection;

pub use music_theory::{
    accidental_in_key, freq_to_note, generate_sequence, intro_chord, is_correct_note,
    is_sharp_key, key_accidental_count, key_sig_staff_positions, key_signature_pitch_classes,
    midi_to_freq, midi_to_label, note_name, preferred_midi_label, preferred_note_label,
    scale_name, scale_notes, staff_position, staff_position_in_key, test_score, Note, NoteName,
    ScaleType, FLAT_ORDER, FLAT_STAFF_POSITIONS, SHARP_ORDER, SHARP_STAFF_POSITIONS,
};
pub use pitch_detection::detect_pitch;

// ── C-compatible FFI surface ──────────────────────────────────────────────────
// These thin wrappers are called from the React Native Turbo Native Module
// (Swift / Kotlin) without requiring uniffi code-gen at this stage.

use std::os::raw::{c_float, c_int, c_uchar, c_uint};

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
/// * `scale_id`    – 0=Major, 1=NaturalMinor, 2=HarmonicMinor, 3=Dorian, 4=Mixolydian
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
        2 => ScaleType::HarmonicMinor,
        3 => ScaleType::Dorian,
        4 => ScaleType::Mixolydian,
        _ => return -1,
    };
    let notes = generate_sequence(root_chroma, scale, range_start, range_end, length, seed);
    let out = unsafe { std::slice::from_raw_parts_mut(out_buf, length as usize) };
    for (i, note) in notes.iter().enumerate() {
        out[i] = note.midi();
    }
    notes.len() as c_int
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
        2 => ScaleType::HarmonicMinor,
        3 => ScaleType::Dorian,
        4 => ScaleType::Mixolydian,
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

/// Display name for a scale ID (0–4).
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

// ── Android JNI exports ───────────────────────────────────────────────────────
// Exported with the exact symbol names the Kotlin EarRingCoreModule expects.
#[cfg(target_os = "android")]
mod android_jni {
    use jni::objects::{JClass, JFloatArray, JIntArray};
    use jni::sys::{jfloat, jfloatArray, jint, jintArray, jlong, jstring};
    use jni::JNIEnv;

    use super::{
        accidental_in_key, detect_pitch, freq_to_note, generate_sequence, intro_chord,
        is_correct_note, is_sharp_key, key_accidental_count, key_sig_staff_positions,
        midi_to_label, note_name, preferred_midi_label, preferred_note_label, scale_name,
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
            2 => ScaleType::HarmonicMinor,
            3 => ScaleType::Dorian,
            4 => ScaleType::Mixolydian,
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
            2 => ScaleType::HarmonicMinor,
            3 => ScaleType::Dorian,
            4 => ScaleType::Mixolydian,
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
}
