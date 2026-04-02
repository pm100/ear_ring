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
}
