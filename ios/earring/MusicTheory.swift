import Foundation

struct MusicTheory {

    static let NOTE_NAMES: [String] = [
        "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
    ]

    static let SCALE_NAMES: [String] = [
        "Major",
        "Natural Minor",
        "Harmonic Minor",
        "Pentatonic Major",
        "Pentatonic Minor",
        "Dorian",
        "Mixolydian",
        "Blues"
    ]

    static let SCALE_INTERVALS: [[Int]] = [
        [0, 2, 4, 5, 7, 9, 11],    // Major
        [0, 2, 3, 5, 7, 8, 10],    // Natural Minor
        [0, 2, 3, 5, 7, 8, 11],    // Harmonic Minor
        [0, 2, 4, 7, 9],           // Pentatonic Major
        [0, 3, 5, 7, 10],          // Pentatonic Minor
        [0, 2, 3, 5, 7, 9, 10],    // Dorian
        [0, 2, 4, 5, 7, 9, 10],    // Mixolydian
        [0, 3, 5, 6, 7, 10]        // Blues
    ]

    /// Returns a human-readable label like "C4" or "A#3".
    static func midiToLabel(_ midi: Int) -> String {
        let octave = (midi / 12) - 1
        let noteIndex = midi % 12
        return "\(NOTE_NAMES[noteIndex])\(octave)"
    }

    /// Returns the pitch class (0–11) for a MIDI note.
    static func pitchClass(_ midi: Int) -> Int {
        return midi % 12
    }

    /// A detected note is correct if same pitch class AND within ±50 cents.
    static func isCorrect(detectedMidi: Int, cents: Int, expectedMidi: Int) -> Bool {
        return pitchClass(detectedMidi) == pitchClass(expectedMidi) && abs(cents) <= 50
    }

    /// Diatonic staff position (delegates to EarRingCore Rust FFI).
    static func staffPosition(_ midi: Int) -> Int {
        return EarRingCore.staffPosition(midi: midi)
    }
}
