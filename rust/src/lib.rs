pub mod music_theory;
pub mod pitch_detection;

pub use music_theory::{
    freq_to_note, generate_sequence, midi_to_freq, scale_notes, staff_position, Note, NoteName,
    ScaleType,
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
/// * `root_midi`   – MIDI number of the root note
/// * `scale_id`    – 0=Major, 1=NaturalMinor, 2=HarmonicMinor, 3=PentatonicMajor,
///                   4=PentatonicMinor, 5=Dorian, 6=Mixolydian, 7=Blues
/// * `length`      – number of notes to generate
/// * `seed`        – random seed for reproducibility
/// * `out_buf`     – caller-allocated buffer of at least `length` bytes
///
/// Returns the number of notes written, or -1 on error.
#[no_mangle]
pub extern "C" fn ear_ring_generate_sequence(
    root_midi: c_uchar,
    scale_id: c_uchar,
    length: c_uchar,
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
        3 => ScaleType::PentatonicMajor,
        4 => ScaleType::PentatonicMinor,
        5 => ScaleType::Dorian,
        6 => ScaleType::Mixolydian,
        7 => ScaleType::Blues,
        _ => return -1,
    };
    let root = Note::from_midi(root_midi);
    let notes = generate_sequence(root, scale, length, seed);
    let out = unsafe { std::slice::from_raw_parts_mut(out_buf, length as usize) };
    for (i, note) in notes.iter().enumerate() {
        out[i] = note.midi();
    }
    notes.len() as c_int
}

// ── Android JNI exports ───────────────────────────────────────────────────────
// Exported with the exact symbol names the Kotlin EarRingCoreModule expects.
#[cfg(target_os = "android")]
mod android_jni {
    use jni::objects::{JClass, JFloatArray, JIntArray};
    use jni::sys::{jfloat, jfloatArray, jint, jintArray, jlong};
    use jni::JNIEnv;

    use super::{detect_pitch, freq_to_note, generate_sequence, staff_position, Note, ScaleType};

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCoreModule_nativeDetectPitch(
        mut env: JNIEnv,
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
    pub extern "system" fn Java_com_earring_EarRingCoreModule_nativeFreqToMidi(
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
    pub extern "system" fn Java_com_earring_EarRingCoreModule_nativeFreqToCents(
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
    pub extern "system" fn Java_com_earring_EarRingCoreModule_nativeStaffPosition(
        _env: JNIEnv,
        _class: JClass,
        midi: jint,
    ) -> jint {
        staff_position(Note::from_midi(midi as u8)) as jint
    }

    #[no_mangle]
    pub extern "system" fn Java_com_earring_EarRingCoreModule_nativeGenerateSequence(
        mut env: JNIEnv,
        _class: JClass,
        root_midi: jint,
        scale_id: jint,
        length: jint,
        seed: jlong,
    ) -> jintArray {
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
        let root = Note::from_midi(root_midi as u8);
        let notes = generate_sequence(root, scale, length as u8, seed as u64);
        let midi_vals: Vec<jint> = notes.iter().map(|n| n.midi() as jint).collect();

        let arr: JIntArray = match env.new_int_array(midi_vals.len() as i32) {
            Ok(a) => a,
            Err(_) => return std::ptr::null_mut(),
        };
        let _ = env.set_int_array_region(&arr, 0, &midi_vals);
        arr.into_raw()
    }
}
