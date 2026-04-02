import Foundation

struct MusicTheory {

    static var NOTE_NAMES: [String] { (0..<12).map { EarRingCore.noteName(chroma: $0) } }

    static var SCALE_NAMES: [String] { (0..<4).map { EarRingCore.scaleName(scaleId: $0) } }

    static func scaleLabel(rootChroma: Int, scaleId: Int) -> String {
        return EarRingCore.scaleLabel(rootChroma: rootChroma, scaleId: scaleId)
    }

    /// Returns a human-readable label like "C#4" or "A3".
    static func midiToLabel(_ midi: Int) -> String {
        return EarRingCore.midiToLabel(midi)
    }

    /// Returns the pitch class (0–11) for a MIDI note.
    static func pitchClass(_ midi: Int) -> Int {
        return midi % 12
    }

    /// A detected note is correct if same pitch class AND within ±50 cents.
    static func isCorrect(detectedMidi: Int, cents: Int, expectedMidi: Int) -> Bool {
        return EarRingCore.isCorrectNote(detectedMidi: detectedMidi, cents: cents, expectedMidi: expectedMidi)
    }

    /// Diatonic staff position (delegates to EarRingCore Rust FFI).
    static func staffPosition(_ midi: Int) -> Int {
        return EarRingCore.staffPosition(midi: midi)
    }
}
