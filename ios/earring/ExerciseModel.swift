import Foundation
import UIKit

// MARK: - Data types

struct DetectedNote {
    var midi: Int
    var cents: Int
    var isCorrect: Bool
}

enum ExerciseStatus {
    case idle, playing, listening, done
}

// MARK: - ExerciseModel

@MainActor
class ExerciseModel: ObservableObject {

    // MARK: Published state

    @Published var rootMidi: Int = 60       // C4
    @Published var scaleId: Int = 0         // Major
    @Published var sequenceLength: Int = 4
    @Published var sequence: [Int] = []
    @Published var detectedNotes: [DetectedNote] = []
    @Published var status: ExerciseStatus = .idle
    @Published var currentNoteIndex: Int = 0
    @Published var score: Int = 0
    @Published var liveMidi: Int? = nil
    @Published var liveCents: Int = 0
    @Published var liveFrameCount: Int = 0

    // MARK: Audio subsystems

    let audioCapture = AudioCapture()
    private let audioPlayback = AudioPlayback()

    // MARK: Stability tracking

    private var stabilityPitchClass: Int = -1
    private var stabilityStartTime: Date = .distantPast
    private var stabilityFired: Bool = false

    let stabilityDuration: TimeInterval = 0.45
    let silenceRMSThreshold: Float = 0.003

    // MARK: Computed helpers

    var isCapturing: Bool { audioCapture.isRunning }

    var allCorrect: Bool {
        guard detectedNotes.count == sequence.count, !sequence.isEmpty else { return false }
        return detectedNotes.allSatisfy { $0.isCorrect }
    }

    // MARK: - Public API

    func generateSequence() {
        let seed = UInt64(Date().timeIntervalSince1970 * 1000)
        sequence = EarRingCore.generateSequence(
            rootMidi: rootMidi,
            scaleId: scaleId,
            length: sequenceLength,
            seed: seed
        )
        detectedNotes = []
        currentNoteIndex = 0
        score = 0
        status = .idle
        liveMidi = nil
        liveCents = 0
    }

    func playSequence() async {
        guard !sequence.isEmpty else { return }
        status = .playing
        audioPlayback.resetCancellation()

        await audioPlayback.playSequence(notes: sequence) { _ in
            // Could highlight the current note in the UI if needed
        }

        if status == .playing {
            status = .idle
        }
    }

    func startListening() async {
        detectedNotes = []
        currentNoteIndex = 0
        resetStability()
        status = .listening

        await audioCapture.start { [weak self] samples, sampleRate in
            // Dispatch to main actor for all state mutations
            Task { @MainActor [weak self] in
                self?.processAudio(samples: samples, sampleRate: sampleRate)
            }
        }
    }

    func stopListening() {
        audioCapture.stop()
        computeScore()
        status = .done
    }

    func cancelPlayback() {
        audioPlayback.cancelPlayback()
        if status == .playing {
            status = .idle
        }
    }

    func cleanup() {
        audioCapture.stop()
        audioPlayback.cancelPlayback()
        status = .idle
    }

    func resetToIdle() {
        audioCapture.stop()
        audioPlayback.cancelPlayback()
        detectedNotes = []
        currentNoteIndex = 0
        score = 0
        liveMidi = nil
        liveCents = 0
        liveFrameCount = 0
        status = .idle
    }

    func newRound() {
        cleanup()
        generateSequence()
    }

    func retryExercise() async {
        audioCapture.stop()
        detectedNotes = []
        currentNoteIndex = 0
        score = 0
        liveMidi = nil
        liveCents = 0
        status = .idle
        resetStability()
        await startListening()
    }

    func playTestNote(midi: Int) async {
        audioPlayback.resetCancellation()
        await audioPlayback.playNote(midi: midi)
    }

    // MARK: - Live pitch detection (no scoring)

    func startLivePitchDetection() async {
        liveMidi = nil
        liveCents = 0
        resetStability()

        await audioCapture.start { [weak self] samples, sampleRate in
            Task { @MainActor [weak self] in
                self?.processAudioLive(samples: samples, sampleRate: sampleRate)
            }
        }
    }

    func stopLivePitchDetection() {
        audioCapture.stop()
        liveMidi = nil
        liveCents = 0
    }

    // MARK: - Private audio processing

    private func processAudio(samples: [Float], sampleRate: UInt32) {
        guard status == .listening else { return }

        let rms = computeRMS(samples)

        if rms < silenceRMSThreshold {
            resetStability()
            liveMidi = nil
            liveCents = 0
            return
        }

        guard let hz = EarRingCore.detectPitch(samples: samples, sampleRate: sampleRate),
              let (midi, cents) = EarRingCore.freqToNote(hz: hz) else {
            return
        }

        liveMidi = midi
        liveCents = cents

        let pc = MusicTheory.pitchClass(midi)
        let now = Date()

        if pc == stabilityPitchClass {
            if !stabilityFired &&
               now.timeIntervalSince(stabilityStartTime) >= stabilityDuration {
                stabilityFired = true
                commitNote(midi: midi, cents: cents)
            }
        } else {
            stabilityPitchClass = pc
            stabilityStartTime = now
            stabilityFired = false
        }
    }

    private func processAudioLive(samples: [Float], sampleRate: UInt32) {
        let rms = computeRMS(samples)

        if rms < silenceRMSThreshold {
            liveMidi = nil
            liveCents = 0
            liveFrameCount &+= 1
            return
        }

        guard let hz = EarRingCore.detectPitch(samples: samples, sampleRate: sampleRate),
              let (midi, cents) = EarRingCore.freqToNote(hz: hz) else {
            return
        }

        liveMidi = midi
        liveCents = cents
        liveFrameCount &+= 1
    }

    private func commitNote(midi: Int, cents: Int) {
        guard currentNoteIndex < sequence.count else { return }

        let expectedMidi = sequence[currentNoteIndex]
        let correct = MusicTheory.isCorrect(
            detectedMidi: midi, cents: cents, expectedMidi: expectedMidi)

        detectedNotes.append(DetectedNote(midi: midi, cents: cents, isCorrect: correct))
        currentNoteIndex += 1

        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(correct ? .success : .error)

        resetStability()

        if currentNoteIndex >= sequence.count {
            stopListening()
        }
    }

    private func computeScore() {
        let total = sequence.count
        guard total > 0 else { score = 0; return }
        let correct = detectedNotes.filter { $0.isCorrect }.count
        score = Int(Double(correct) / Double(total) * 100)
    }

    private func resetStability() {
        stabilityPitchClass = -1
        stabilityStartTime = .distantPast
        stabilityFired = false
    }

    private func computeRMS(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        let sumOfSquares = samples.reduce(0.0) { $0 + $1 * $1 }
        return sqrt(sumOfSquares / Float(samples.count))
    }
}
