import Foundation

/// Pure Swift wrappers around the Rust C FFI exposed via the bridging header.
struct EarRingCore {

    /// Detect the fundamental pitch in a buffer of float PCM samples.
    /// - Returns: Frequency in Hz, or nil if no pitch was detected.
    static func detectPitch(samples: [Float], sampleRate: UInt32) -> Float? {
        var floats = samples
        var outHz: Float = 0
        let result = ear_ring_detect_pitch(&floats, UInt32(floats.count), sampleRate, &outHz)
        return result == 1 ? outHz : nil
    }

    /// Convert a frequency in Hz to the nearest MIDI note number and cents deviation.
    /// - Returns: A tuple (midi, cents), or nil if the frequency is out of range.
    static func freqToNote(hz: Float) -> (midi: Int, cents: Int)? {
        var outMidi: UInt8 = 0
        var outCents: Int32 = 0
        let result = ear_ring_freq_to_note(hz, &outMidi, &outCents)
        return result == 1 ? (Int(outMidi), Int(outCents)) : nil
    }

    /// Return the diatonic staff position for a MIDI note (C4 = 0, D4 = 1, …).
    static func staffPosition(midi: Int) -> Int {
        return Int(ear_ring_staff_position(UInt8(midi)))
    }

    /// Generate a sequence of MIDI notes from the given scale.
    /// - Returns: Array of MIDI note integers, empty on failure.
    static func generateSequence(rootChroma: Int, scaleId: Int, length: Int, rangeStart: Int, rangeEnd: Int, seed: UInt64) -> [Int] {
        var buf = [UInt8](repeating: 0, count: length)
        let count = ear_ring_generate_sequence(
            UInt8(rootChroma), UInt8(scaleId), UInt8(length),
            UInt8(rangeStart), UInt8(rangeEnd), seed, &buf)
        guard count > 0 else { return [] }
        return buf.prefix(Int(count)).map { Int($0) }
    }

    static func introChord(rootMidi: Int, scaleId: Int) -> [Int] {
        var buf = [UInt8](repeating: 0, count: 3)
        let count = ear_ring_intro_chord(UInt8(rootMidi), UInt8(scaleId), &buf)
        guard count > 0 else { return [] }
        return buf.prefix(Int(count)).map { Int($0) }
    }

    static func isCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int) -> Bool {
        ear_ring_is_correct_note(UInt8(detectedMidi), Int32(cents), UInt8(expectedMidi)) == 1
    }

    static func testScore(maxAttempts: Int, attemptsUsed: Int, passed: Bool) -> Int {
        Int(ear_ring_test_score(UInt8(maxAttempts), UInt8(attemptsUsed), passed ? 1 : 0))
    }

    /// Convert a MIDI number to a note label (e.g. "C#4").
    static func midiToLabel(_ midi: Int) -> String {
        var buf = [CChar](repeating: 0, count: 16)
        ear_ring_midi_to_label(UInt8(midi), &buf, 16)
        return String(cString: buf)
    }

    /// Display name for a pitch class (chroma 0–11), e.g. 0 → "C", 1 → "C#".
    static func noteName(chroma: Int) -> String {
        var buf = [CChar](repeating: 0, count: 8)
        ear_ring_note_name(UInt8(chroma), &buf, 8)
        return String(cString: buf)
    }

    /// Display name for a scale ID (0–3).
    static func scaleName(scaleId: Int) -> String {
        var buf = [CChar](repeating: 0, count: 32)
        ear_ring_scale_name(UInt8(scaleId), &buf, 32)
        return String(cString: buf)
    }

    /// Display label for a scale with the implied major key, e.g. "Natural Minor (Eb)".
    static func scaleLabel(rootChroma: Int, scaleId: Int) -> String {
        var buf = [CChar](repeating: 0, count: 48)
        ear_ring_scale_label(UInt8(rootChroma), UInt8(scaleId), &buf, 48)
        return String(cString: buf)
    }

    /// Returns the effective major key chroma for key-signature display.
    /// For Major returns rootChroma; for modal/minor scales returns the implied major key chroma.
    static func effectiveKeyChroma(rootChroma: Int, scaleId: Int) -> Int {
        Int(ear_ring_effective_key_chroma(UInt8(rootChroma), UInt8(scaleId)))
    }

    static func isSharpKey(rootChroma: Int) -> Bool {
        ear_ring_is_sharp_key(UInt8(rootChroma)) == 1
    }

    static func keyAccidentalCount(rootChroma: Int) -> Int {
        Int(ear_ring_key_accidental_count(UInt8(rootChroma)))
    }

    static func preferredNoteLabel(midi: Int, rootChroma: Int) -> String {
        var buf = [CChar](repeating: 0, count: 8)
        ear_ring_preferred_note_label(UInt8(midi), UInt8(rootChroma), &buf, 8)
        return String(cString: buf)
    }

    static func preferredMidiLabel(midi: Int, rootChroma: Int) -> String {
        var buf = [CChar](repeating: 0, count: 16)
        ear_ring_preferred_midi_label(UInt8(midi), UInt8(rootChroma), &buf, 16)
        return String(cString: buf)
    }

    /// Returns: 0=none, 1=sharp(♯), 2=flat(♭), 3=natural(♮)
    static func accidentalInKey(midi: Int, rootChroma: Int) -> Int {
        Int(ear_ring_accidental_in_key(UInt8(midi), UInt8(rootChroma)))
    }

    static func keySigPositions(rootChroma: Int) -> (positions: [Int], isSharp: Bool) {
        var buf = [Int32](repeating: 0, count: 7)
        var isSharpOut: Int32 = 1
        let count = ear_ring_key_sig_positions(UInt8(rootChroma), &buf, 7, &isSharpOut)
        guard count > 0 else { return ([], isSharpOut == 1) }
        return (buf.prefix(Int(count)).map { Int($0) }, isSharpOut == 1)
    }

    static func staffPositionInKey(midi: Int, rootChroma: Int) -> Int {
        Int(ear_ring_staff_position_in_key(UInt8(midi), UInt8(rootChroma)))
    }

    /// Returns a JSON string: `[{"title":"...","body":"..."},...]`
    static func helpContent() -> String {
        guard let ptr = ear_ring_help_content() else { return "[]" }
        return String(cString: ptr)
    }

    /// Returns a JSON string: `[{"id":0,"name":"Piano","semitones":0},...]`
    static func instrumentList() -> String {
        guard let ptr = ear_ring_instrument_list() else { return "[]" }
        return String(cString: ptr)
    }

    /// Convert concert MIDI to written/display MIDI for the given instrument index.
    static func transposeDisplayMidi(_ concertMidi: Int, instrumentIndex: Int) -> Int {
        Int(ear_ring_transpose_display_midi(Int32(concertMidi), Int32(instrumentIndex)))
    }

    // MARK: - Melody Library

    static func melodyCount() -> Int {
        Int(ear_ring_melody_count())
    }

    static func shuffleMelodyIndices(seed: UInt64) -> [Int] {
        let count = Int(ear_ring_melody_count())
        guard count > 0 else { return [] }
        var buf = [UInt8](repeating: 0, count: count)
        let written = ear_ring_shuffle_melody_indices(seed, &buf)
        guard written > 0 else { return [] }
        return buf.prefix(Int(written)).map { Int($0) }
    }

    static func pickMelodyByIndex(index: Int, rootChroma: Int) -> (midi: [Int], durations: [Float])? {
        let maxNotes = 32
        var midiBuf = [UInt8](repeating: 0, count: maxNotes)
        var durBuf = [Float](repeating: 0, count: maxNotes)
        let count = ear_ring_pick_melody_by_index(UInt8(index), UInt8(rootChroma), &midiBuf, &durBuf)
        guard count > 0 else { return nil }
        let n = Int(count)
        return (midiBuf.prefix(n).map { Int($0) }, Array(durBuf.prefix(n)))
    }

    static func melodyRangeMidi(index: Int, rootChroma: Int) -> (min: Int, max: Int)? {
        guard let (midi, _) = pickMelodyByIndex(index: index, rootChroma: rootChroma),
              let minM = midi.min(), let maxM = midi.max() else { return nil }
        return (minM, maxM)
    }

    static func generateDiatonicChord(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: UInt64) -> [Int] {
        var buf = [UInt8](repeating: 0, count: noteCount)
        let written = ear_ring_generate_diatonic_chord(UInt8(rootChroma), UInt8(scaleId), UInt8(noteCount), UInt8(centerMidi), seed, &buf)
        guard written > 0 else { return [] }
        return buf.prefix(Int(written)).map { Int($0) }
    }

    static func diatonicChordLabel(rootChroma: Int, scaleId: Int, noteCount: Int, centerMidi: Int, seed: UInt64) -> String {
        var buf = [CChar](repeating: 0, count: 64)
        let written = ear_ring_diatonic_chord_label(UInt8(rootChroma), UInt8(scaleId), UInt8(noteCount), UInt8(centerMidi), seed, &buf, 64)
        guard written > 0 else { return "" }
        return String(cString: buf)
    }



    /// Result from processing one audio buffer through the Rust pitch tracker.
    struct TrackerFrame {
        /// Detected frequency in Hz. 0 when silent or no confident pitch.
        var liveHz: Float
        /// Detected MIDI note. -1 when silent or no confident pitch.
        var liveMidi: Int
        /// The confirmed MIDI note, emitted exactly once when stability is reached. -1 means absent.
        var confirmedMidi: Int
    }

    /// Rust-backed pitch detector with built-in stability tracking, silence gating,
    /// warmup frame discard, and a 1-frame silence grace period.
    ///
    /// Create once when audio capture starts; call `process()` per buffer from a
    /// single thread; `reset()` between attempts; `deinit` frees the Rust allocation.
    final class PitchTracker {
        private let handle: OpaquePointer

        init(silenceThreshold: Float, requiredFrames: Int) {
            handle = ear_ring_tracker_new(silenceThreshold, UInt32(requiredFrames))
        }

        deinit { ear_ring_tracker_free(handle) }

        func reset() { ear_ring_tracker_reset(handle) }

        func resetWithWarmup(frames: Int) { ear_ring_tracker_reset_with_warmup(handle, UInt32(frames)) }

        func setParams(silenceThreshold: Float, requiredFrames: Int) {
            ear_ring_tracker_set_params(handle, silenceThreshold, UInt32(requiredFrames))
        }

        /// Apply per-instrument detection parameters (grace frames, octave correction).
        /// Call whenever the instrument selection changes.
        func applyInstrument(index: Int) {
            ear_ring_tracker_apply_instrument(handle, Int32(index))
        }

        func process(samples: [Float], sampleRate: UInt32) -> TrackerFrame {
            var floats = samples
            var outHz: Float = 0
            var outMidi: Int32 = -1
            let confirmed = Int(ear_ring_tracker_process(handle, &floats, UInt32(floats.count), sampleRate, &outHz, &outMidi))
            return TrackerFrame(liveHz: outHz, liveMidi: Int(outMidi), confirmedMidi: confirmed)
        }
    }
}
