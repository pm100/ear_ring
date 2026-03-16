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

#ifdef __cplusplus
}
#endif

#endif /* EAR_RING_CORE_H */
