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
    /// - Parameter avoidFirstMidi: MIDI note the first generated note must not equal —
    ///   typically the previous test's first note, so back-to-back tests don't open on
    ///   the same note. Pass nil for no constraint (e.g. the first test of a session).
    /// - Returns: Array of MIDI note integers, empty on failure.
    static func generateSequence(rootChroma: Int, scaleId: Int, length: Int, rangeStart: Int, rangeEnd: Int, seed: UInt64, avoidFirstMidi: Int? = nil) -> [Int] {
        var buf = [UInt8](repeating: 0, count: length)
        let count = ear_ring_generate_sequence(
            UInt8(rootChroma), UInt8(scaleId), UInt8(length),
            UInt8(rangeStart), UInt8(rangeEnd), seed, Int32(avoidFirstMidi ?? -1), &buf)
        guard count > 0 else { return [] }
        return buf.prefix(Int(count)).map { Int($0) }
    }

    static func introChord(rootMidi: Int, scaleId: Int) -> [Int] {
        var buf = [UInt8](repeating: 0, count: 3)
        let count = ear_ring_intro_chord(UInt8(rootMidi), UInt8(scaleId), &buf)
        guard count > 0 else { return [] }
        return buf.prefix(Int(count)).map { Int($0) }
    }

    /// The 7 notes of a scale ascending from rootMidi. Used for the "Scale" intro-sound
    /// option (issue #8).
    static func scaleNotes(rootMidi: Int, scaleId: Int) -> [Int] {
        var buf = [UInt8](repeating: 0, count: 7)
        let count = ear_ring_scale_notes(UInt8(rootMidi), UInt8(scaleId), &buf)
        guard count > 0 else { return [] }
        return buf.prefix(Int(count)).map { Int($0) }
    }

    static func isCorrectNote(detectedMidi: Int, cents: Int, expectedMidi: Int) -> Bool {
        ear_ring_is_correct_note(UInt8(detectedMidi), Int32(cents), UInt8(expectedMidi)) == 1
    }

    static func testScore(maxAttempts: Int, attemptsUsed: Int, passed: Bool) -> Int {
        Int(ear_ring_test_score(UInt8(maxAttempts), UInt8(attemptsUsed), passed ? 1 : 0))
    }

    /// Issue #9 "note correction": what to do after a wrong note.
    enum WrongNoteOutcome: Int {
        case retrySameNote = 0
        case restartSequence = 1
        case fail = 2
    }

    static func wrongNoteOutcome(currentAttempt: Int, maxAttempts: Int, noteRetryCount: Int, noteRetriesAllowed: Int) -> WrongNoteOutcome {
        let raw = Int(ear_ring_wrong_note_outcome(
            UInt8(currentAttempt), UInt8(maxAttempts), UInt8(noteRetryCount), UInt8(noteRetriesAllowed)
        ))
        return WrongNoteOutcome(rawValue: raw) ?? .restartSequence
    }

    /// Issue #9 "note correction": points to deduct from testScore's result for
    /// note-level retries used along the way.
    static func noteRetryPenalty(noteRetriesUsed: Int, noteRetriesAllowed: Int, maxAttempts: Int) -> Int {
        Int(ear_ring_note_retry_penalty(UInt8(noteRetriesUsed), UInt8(noteRetriesAllowed), UInt8(maxAttempts)))
    }

    /// Convert a MIDI number to a note label (e.g. "C#4").
    static func midiToLabel(_ midi: Int) -> String {
        var buf = [CChar](repeating: 0, count: 16)
        ear_ring_midi_to_label(UInt8(midi), &buf, 16)
        return String(cString: buf)
    }

    /// Parse a typed note label (e.g. "C4", "C#4", "Db4") into a MIDI number, or nil if invalid.
    static func labelToMidi(_ label: String) -> Int? {
        let midi = label.withCString { ear_ring_label_to_midi($0) }
        return midi >= 0 ? Int(midi) : nil
    }

    /// Display name for a pitch class (chroma 0–11), e.g. 0 → "C", 1 → "C#".
    static func noteName(chroma: Int) -> String {
        var buf = [CChar](repeating: 0, count: 8)
        ear_ring_note_name(UInt8(chroma), &buf, 8)
        return String(cString: buf)
    }

    /// Written note name for a concert chroma with instrument transposition applied.
    static func writtenNoteName(concertChroma: Int, instrumentIndex: Int) -> String {
        var buf = [CChar](repeating: 0, count: 8)
        ear_ring_written_note_name(UInt8(concertChroma), UInt32(instrumentIndex), &buf, 8)
        return String(cString: buf)
    }

    /// Written MIDI label for a concert MIDI with instrument transposition applied.
    static func writtenMidiLabel(concertMidi: Int, instrumentIndex: Int) -> String {
        var buf = [CChar](repeating: 0, count: 16)
        ear_ring_written_midi_label(UInt8(concertMidi), UInt32(instrumentIndex), &buf, 16)
        return String(cString: buf)
    }

    /// Display name for a scale ID (0–4).
    static func scaleName(scaleId: Int) -> String {
        var buf = [CChar](repeating: 0, count: 32)
        ear_ring_scale_name(UInt8(scaleId), &buf, 32)
        return String(cString: buf)
    }

    /// Display label for a scale with the implied major key, e.g. "Natural Minor (of Eb)".
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

    /// Returns a JSON string: `[{"key":"...","text":"..."},...]` (issue #11).
    static func tooltipContent() -> String {
        guard let ptr = ear_ring_tooltip_content() else { return "[]" }
        return String(cString: ptr)
    }

    /// Returns a JSON string: `[{"id":0,"name":"Piano","semitones":0},...]`
    static func instrumentList() -> String {
        guard let ptr = ear_ring_instrument_list() else { return "[]" }
        return String(cString: ptr)
    }

    /// Returns the short git commit hash the binary was built from.
    static func gitHash() -> String {
        guard let ptr = ear_ring_git_hash() else { return "unknown" }
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
        // Passed through to Rust as the actual buffer capacity (issue #24) — the FFI
        // now refuses to write past it instead of trusting midi_notes.len() blindly,
        // so a melody longer than maxNotes fails cleanly (count <= 0) rather than
        // corrupting memory past midiBuf/durBuf.
        let maxNotes = 32
        var midiBuf = [UInt8](repeating: 0, count: maxNotes)
        var durBuf = [Float](repeating: 0, count: maxNotes)
        let count = ear_ring_pick_melody_by_index(UInt8(index), UInt8(rootChroma), &midiBuf, &durBuf, Int32(maxNotes))
        guard count > 0 else { return nil }
        let n = Int(count)
        return (midiBuf.prefix(n).map { Int($0) }, Array(durBuf.prefix(n)))
    }

    static func melodyRangeMidi(index: Int, rootChroma: Int) -> (min: Int, max: Int)? {
        guard let (midi, _) = pickMelodyByIndex(index: index, rootChroma: rootChroma),
              let minM = midi.min(), let maxM = midi.max() else { return nil }
        return (minM, maxM)
    }

    static func generateDiatonicChord(rootChroma: Int, scaleId: Int, noteCount: Int, rangeStart: Int, rangeEnd: Int, seed: UInt64) -> [Int] {
        var buf = [UInt8](repeating: 0, count: noteCount)
        let written = ear_ring_generate_diatonic_chord(UInt8(rootChroma), UInt8(scaleId), UInt8(noteCount), UInt8(rangeStart), UInt8(rangeEnd), seed, &buf)
        guard written > 0 else { return [] }
        return buf.prefix(Int(written)).map { Int($0) }
    }

    static func diatonicChordLabel(rootChroma: Int, scaleId: Int, noteCount: Int, rangeStart: Int, rangeEnd: Int, centerMidi: Int, seed: UInt64) -> String {
        var buf = [CChar](repeating: 0, count: 64)
        let written = ear_ring_diatonic_chord_label(UInt8(rootChroma), UInt8(scaleId), UInt8(noteCount), UInt8(rangeStart), UInt8(rangeEnd), UInt8(centerMidi), seed, &buf, 64)
        guard written > 0 else { return "" }
        return String(cString: buf)
    }

    static func writtenDiatonicChordLabel(concertRootChroma: Int, scaleId: Int, noteCount: Int, rangeStart: Int, rangeEnd: Int, centerMidi: Int, seed: UInt64, instrumentIndex: Int) -> String {
        var buf = [CChar](repeating: 0, count: 64)
        let written = ear_ring_written_diatonic_chord_label(UInt8(concertRootChroma), UInt8(scaleId), UInt8(noteCount), UInt8(rangeStart), UInt8(rangeEnd), UInt8(centerMidi), seed, UInt32(instrumentIndex), &buf, 64)
        guard written > 0 else { return "" }
        return String(cString: buf)
    }

    static func writtenScaleLabel(concertRootChroma: Int, scaleId: Int, instrumentIndex: Int) -> String {
        var buf = [CChar](repeating: 0, count: 64)
        let written = ear_ring_written_scale_label(UInt8(concertRootChroma), UInt8(scaleId), UInt32(instrumentIndex), &buf, 64)
        guard written > 0 else { return "" }
        return String(cString: buf)
    }

    static func effectiveIntroRootMidi(rootNote: Int, scaleId: Int, rangeStart: Int) -> Int {
        Int(ear_ring_effective_intro_root_midi(UInt8(rootNote), UInt8(scaleId), UInt8(rangeStart)))
    }

    /// Clamp a user-edited exercise range to at least one octave.
    static func enforceMinRangeSpan(newStart: Int, newEnd: Int, oldStart: Int, oldEnd: Int) -> (start: Int, end: Int) {
        var outStart: UInt8 = 0
        var outEnd: UInt8 = 0
        ear_ring_enforce_min_range_span(UInt8(newStart), UInt8(newEnd), UInt8(oldStart), UInt8(oldEnd), &outStart, &outEnd)
        return (Int(outStart), Int(outEnd))
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
