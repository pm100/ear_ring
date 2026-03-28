#ifndef EAR_RING_CORE_H
#define EAR_RING_CORE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/// Detect the pitch in a buffer of audio samples.
/// Returns 1 on success, 0 or -1 on failure.
/// @param samples     Pointer to float32 PCM samples in [-1.0, 1.0]
/// @param num_samples Number of samples in the buffer
/// @param sample_rate Sample rate in Hz (e.g. 44100)
/// @param out_hz      Output: detected frequency in Hz
int32_t ear_ring_detect_pitch(const float *samples,
                               uint32_t num_samples,
                               uint32_t sample_rate,
                               float *out_hz);

/// Convert a frequency in Hz to the nearest MIDI note and cents deviation.
/// Returns 1 on success, 0 or -1 on failure.
/// @param hz        Input frequency in Hz
/// @param out_midi  Output: MIDI note number (0–127)
/// @param out_cents Output: cents deviation from nearest MIDI note (−50 to +50)
int32_t ear_ring_freq_to_note(float hz, uint8_t *out_midi, int32_t *out_cents);

/// Get the staff position for a MIDI note (diatonic steps above C4; C4 = 0).
/// @param midi MIDI note number
int32_t ear_ring_staff_position(uint8_t midi);

/// Generate a sequence of MIDI notes from a given scale.
/// Returns the count of notes written into out_buf on success, -1 on failure.
/// @param root_chroma  Pitch class of the root note (0=C … 11=B)
/// @param scale_id     Scale identifier (0–7)
/// @param length       Number of notes to generate
/// @param range_start  Lowest accepted MIDI note (inclusive)
/// @param range_end    Highest accepted MIDI note (inclusive)
/// @param seed         Random seed for reproducible generation
/// @param out_buf      Output buffer (must be at least `length` bytes)
int32_t ear_ring_generate_sequence(uint8_t root_chroma,
                                    uint8_t scale_id,
                                    uint8_t length,
                                    uint8_t range_start,
                                    uint8_t range_end,
                                    uint64_t seed,
                                    uint8_t *out_buf);

/// Build a 3-note intro chord as MIDI note numbers.
/// Returns the count of notes written into out_buf on success, -1 on failure.
/// @param root_midi  Root note MIDI number
/// @param scale_id   Scale identifier (0–7)
/// @param out_buf    Output buffer (must be at least 3 bytes)
int32_t ear_ring_intro_chord(uint8_t root_midi, uint8_t scale_id, uint8_t *out_buf);

/// Check whether a detected note is correct for the expected note.
/// Returns 1 if correct, 0 otherwise.
/// @param detected_midi  Detected MIDI note number
/// @param cents          Cents deviation from detected note
/// @param expected_midi  Expected MIDI note number
int32_t ear_ring_is_correct_note(uint8_t detected_midi, int32_t cents, uint8_t expected_midi);

/// Compute the score for an exercise attempt.
/// @param max_attempts    Total number of notes in the sequence
/// @param attempts_used   Number of notes attempted
/// @param passed          1 if the exercise was passed, 0 otherwise
int32_t ear_ring_test_score(uint8_t max_attempts, uint8_t attempts_used, int32_t passed);

/// Convert a MIDI note number to a label string like "C#4".
/// Writes a null-terminated string into out_buf (max buf_len bytes including null).
/// Returns bytes written (excluding null), or -1 on error.
int32_t ear_ring_midi_to_label(uint8_t midi, char *out_buf, uint32_t buf_len);

/// Display name for a pitch class (chroma 0–11), e.g. 0 → "C", 1 → "C#".
/// Writes a null-terminated string into out_buf.
/// Returns bytes written (excluding null), or -1 on error.
int32_t ear_ring_note_name(uint8_t chroma, char *out_buf, uint32_t buf_len);

/// Display name for a scale ID (0–4).
/// Writes a null-terminated string into out_buf.
/// Returns bytes written (excluding null), or -1 on error.
int32_t ear_ring_scale_name(uint8_t scale_id, char *out_buf, uint32_t buf_len);

/// Returns 1 if the major key for this root chroma uses sharps, 0 for flats.
int32_t ear_ring_is_sharp_key(uint8_t root_chroma);

/// Returns the count of accidentals in the key signature (positive=sharps, negative=flats).
int32_t ear_ring_key_accidental_count(uint8_t root_chroma);

/// Writes the key-context note label (without octave) for the given MIDI note.
/// Uses sharp spelling for sharp keys, flat spelling for flat keys.
int32_t ear_ring_preferred_note_label(uint8_t midi, uint8_t root_chroma, char *out_buf, uint32_t buf_len);

/// Writes the full key-context note label with octave (e.g. "C#4", "Bb3").
int32_t ear_ring_preferred_midi_label(uint8_t midi, uint8_t root_chroma, char *out_buf, uint32_t buf_len);

/// Returns the accidental to draw in key-signature mode:
/// 0=none, 1=sharp(♯), 2=flat(♭), 3=natural(♮).
int32_t ear_ring_accidental_in_key(uint8_t midi, uint8_t root_chroma);

/// Fills out_buf with staff positions for key signature symbols (up to 7).
/// Sets *out_is_sharp to 1 for a sharp key, 0 for flat.
/// Returns count of positions written, or -1 on error.
int32_t ear_ring_key_sig_positions(uint8_t root_chroma, int32_t *out_buf, uint32_t buf_len, int32_t *out_is_sharp);

/// Key-aware treble-clef staff position for a MIDI note.
/// Flat keys place flattened pitch classes at their upper diatonic neighbour
/// (e.g. Bb at B's position = 6). Sharp keys use the standard sharp-based mapping.
/// Returns diatonic steps above C4 (C4=0, D4=1, …, B4=6, C5=7).
int32_t ear_ring_staff_position_in_key(uint8_t midi, uint8_t root_chroma);

/// Returns a pointer to a static null-terminated UTF-8 JSON string containing
/// help sections: `[{"title":"...","body":"..."},...]`.
/// The pointer is valid for the lifetime of the process. Do not free it.
const char *ear_ring_help_content(void);

#ifdef __cplusplus
}
#endif

#endif /* EAR_RING_CORE_H */
