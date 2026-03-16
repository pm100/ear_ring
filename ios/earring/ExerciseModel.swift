import Foundation
import UIKit

struct DetectedNote {
    var midi: Int
    var cents: Int
    var isCorrect: Bool
}

enum ExerciseStatus {
    case playing
    case listening
    case retryDelay
    case stopped
}

@MainActor
class ExerciseModel: ObservableObject {
    @Published var rootNote: Int = 0        // pitch class 0-11 (C=0)
    @Published var rangeStart: Int = 60     // MIDI low bound (default C4)
    @Published var rangeEnd: Int = 71       // MIDI high bound (default B4)
    @Published var scaleId: Int = 0
    @Published var sequenceLength: Int = 4
    @Published var tempoBpm: Int = 100
    @Published var showTestNotes: Bool = false
    @Published var sequence: [Int] = []
    @Published var detectedNotes: [DetectedNote] = []
    @Published var status: ExerciseStatus = .stopped
    @Published var currentNoteIndex: Int = 0
    @Published var score: Int = 0
    @Published var liveMidi: Int? = nil
    @Published var liveCents: Int = 0
    @Published var liveFrameCount: Int = 0
    @Published var currentAttempt: Int = 1
    @Published var maxAttempts: Int = 5
    @Published var testsCompleted: Int = 0

    /// MIDI of the root note at or just below rangeStart (used for intro chord).
    var rootMidi: Int { rangeStart - ((rangeStart - rootNote + 12) % 12) }

    var rangeLabel: String { "\(MusicTheory.midiToLabel(rangeStart))–\(MusicTheory.midiToLabel(rangeEnd))" }

    /// Set rootNote and reset the range to one octave closest to middle C.
    func updateRangeForKey() {
        let (s, e) = ExerciseModel.defaultRange(rootNote: rootNote)
        rangeStart = s
        rangeEnd = e
    }

    static func defaultRange(rootNote: Int) -> (Int, Int) {
        let best = (2...6).map { oct in (oct + 1) * 12 + rootNote }
            .min(by: { abs($0 - 60) < abs($1 - 60) }) ?? 60
        return (best, best + 11)
    }

    let audioCapture = AudioCapture()
    private let audioPlayback = AudioPlayback()

    private var cumulativeScore: Int = 0
    private var stabilityPitchClass: Int = -1
    private var stabilityCount: Int = 0
    private var pitchConsumed: Bool = false
    private var sessionPersisted = false
    private let silenceRMSThreshold: Float = 0.003
    private let retryDelayNanoseconds: UInt64 = 3_000_000_000
    private let introGapNanoseconds: UInt64 = 800_000_000

    var isCapturing: Bool { audioCapture.isRunning }
    var isSessionRunning: Bool { status != .stopped }

    func startExerciseSession() {
        cleanup()
        sessionPersisted = false
        cumulativeScore = 0
        testsCompleted = 0
        score = 0
        currentAttempt = 1
        maxAttempts = 5
        Task { await startFreshTest() }
    }

    func stopExerciseSession() {
        cleanup()
        saveSessionIfNeeded()
        detectedNotes = []
        currentNoteIndex = 0
        status = .stopped
    }

    func cleanup() {
        audioCapture.stop()
        audioPlayback.cancelPlayback()
        liveMidi = nil
        liveCents = 0
        resetStability()
    }

    func resetToIdle() {
        stopExerciseSession()
    }

    func newRound() {
        startExerciseSession()
    }

    func playTestNote(midi: Int) async {
        audioPlayback.resetCancellation()
        await audioPlayback.playNote(midi: midi)
    }

    func startLivePitchDetection() async {
        liveMidi = nil
        liveCents = 0
        resetStability()

        let capture = audioCapture
        await Task.detached(priority: .userInitiated) {
            await capture.start { [weak self] samples, sampleRate in
                Task { @MainActor [weak self] in
                    self?.processAudioLive(samples: samples, sampleRate: sampleRate)
                }
            }
        }.value
    }

    func stopLivePitchDetection() {
        audioCapture.stop()
        liveMidi = nil
        liveCents = 0
    }

    private func startFreshTest() async {
        let seed = UInt64(Date().timeIntervalSince1970 * 1000)
        sequence = EarRingCore.generateSequence(
            rootChroma: rootNote,
            scaleId: scaleId,
            length: sequenceLength,
            rangeStart: rangeStart,
            rangeEnd: rangeEnd,
            seed: seed
        )
        detectedNotes = []
        currentNoteIndex = 0
        currentAttempt = 1
        status = .playing
        await playPrompt()
    }

    private func retryCurrentTest(attempt: Int) async {
        detectedNotes = []
        currentNoteIndex = 0
        currentAttempt = attempt
        status = .playing
        await playPrompt()
    }

    private func playPrompt() async {
        guard !sequence.isEmpty else { return }
        status = .playing
        audioPlayback.resetCancellation()
        await audioPlayback.playChord(notes: EarRingCore.introChord(rootMidi: rootMidi, scaleId: scaleId))
        guard status == .playing else { return }
        try? await Task.sleep(nanoseconds: introGapNanoseconds)
        guard status == .playing else { return }
        await audioPlayback.playSequence(notes: sequence, bpm: tempoBpm) { _ in }
        if status == .playing {
            await startListening()
        }
    }

    private func startListening() async {
        detectedNotes = []
        currentNoteIndex = 0
        resetStability()
        status = .listening
        liveMidi = nil
        liveCents = 0

        let capture = audioCapture
        await Task.detached(priority: .userInitiated) {
            await capture.start { [weak self] samples, sampleRate in
                Task { @MainActor [weak self] in
                    self?.processAudio(samples: samples, sampleRate: sampleRate)
                }
            }
        }.value
    }

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
        let pitchClass = midi % 12

        if pitchClass == stabilityPitchClass {
            stabilityCount += 1
            if !pitchConsumed && stabilityCount >= 3 {
                pitchConsumed = true
                commitNote(midi: midi, cents: cents)
            }
        } else {
            stabilityPitchClass = pitchClass
            stabilityCount = 1
            pitchConsumed = false
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
        let correct = EarRingCore.isCorrectNote(detectedMidi: midi, cents: cents, expectedMidi: expectedMidi)
        let note = DetectedNote(midi: midi, cents: cents, isCorrect: correct)
        detectedNotes.append(note)
        currentNoteIndex += 1

        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(correct ? .success : .error)
        resetStability()

        if correct {
            if currentNoteIndex >= sequence.count {
                audioCapture.stop()
                completeTest(passed: true, attemptsUsed: currentAttempt, attemptNotes: detectedNotes)
            }
        } else {
            audioCapture.stop()
            status = .retryDelay
            if currentAttempt >= maxAttempts {
                completeTest(passed: false, attemptsUsed: currentAttempt, attemptNotes: detectedNotes)
            } else {
                Task {
                    try? await Task.sleep(nanoseconds: retryDelayNanoseconds)
                    guard self.isSessionRunning else { return }
                    await self.retryCurrentTest(attempt: self.currentAttempt + 1)
                }
            }
        }
    }

    private func completeTest(passed: Bool, attemptsUsed: Int, attemptNotes: [DetectedNote]) {
        let testScore = EarRingCore.testScore(maxAttempts: maxAttempts, attemptsUsed: attemptsUsed, passed: passed)
        cumulativeScore += testScore
        testsCompleted += 1
        score = testsCompleted == 0 ? 0 : cumulativeScore / testsCompleted
        status = .retryDelay
        persistTestRecord(score: testScore, attemptsUsed: attemptsUsed, passed: passed, attemptNotes: attemptNotes)

        Task {
            try? await Task.sleep(nanoseconds: retryDelayNanoseconds)
            guard self.isSessionRunning else { return }
            await self.startFreshTest()
        }
    }

    private func persistTestRecord(score: Int, attemptsUsed: Int, passed: Bool, attemptNotes: [DetectedNote]) {
        ProgressStore.appendTest(
            TestRecord(
                id: UUID(),
                date: Date(),
                scaleName: MusicTheory.SCALE_NAMES[scaleId],
                rootLabel: rangeLabel,
                score: score,
                attemptsUsed: attemptsUsed,
                maxAttempts: maxAttempts,
                passed: passed,
                length: sequenceLength,
                expectedNotes: sequence.map(MusicTheory.midiToLabel),
                detectedNotes: attemptNotes.map { MusicTheory.midiToLabel($0.midi) }
            )
        )
    }

    private func saveSessionIfNeeded() {
        guard !sessionPersisted, testsCompleted > 0 else { return }
        ProgressStore.appendSession(
            SessionRecord(
                id: UUID(),
                date: Date(),
                scaleName: MusicTheory.SCALE_NAMES[scaleId],
                rootLabel: rangeLabel,
                score: score,
                length: sequenceLength,
                testsCompleted: testsCompleted
            )
        )
        sessionPersisted = true
    }

    private func resetStability() {
        stabilityPitchClass = -1
        stabilityCount = 0
        pitchConsumed = false
    }

    private func computeRMS(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        let sumOfSquares = samples.reduce(0.0) { $0 + $1 * $1 }
        return sqrt(sumOfSquares / Float(samples.count))
    }
}
