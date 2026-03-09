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
    static func generateSequence(rootMidi: Int, scaleId: Int, length: Int, seed: UInt64) -> [Int] {
        var buf = [UInt8](repeating: 0, count: length)
        let count = ear_ring_generate_sequence(
            UInt8(rootMidi), UInt8(scaleId), UInt8(length), seed, &buf)
        guard count > 0 else { return [] }
        return buf.prefix(Int(count)).map { Int($0) }
    }
}
