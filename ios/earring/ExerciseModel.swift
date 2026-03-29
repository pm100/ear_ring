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
    private static let ud = UserDefaults.standard

    @Published var rootNote: Int = ud.object(forKey: "rootNote") != nil ? ud.integer(forKey: "rootNote") : 0 {
        didSet { UserDefaults.standard.set(rootNote, forKey: "rootNote") }
    }
    @Published var rangeStart: Int = ud.object(forKey: "rangeStart") != nil ? ud.integer(forKey: "rangeStart") : 60 {
        didSet { UserDefaults.standard.set(rangeStart, forKey: "rangeStart") }
    }
    @Published var rangeEnd: Int = ud.object(forKey: "rangeEnd") != nil ? ud.integer(forKey: "rangeEnd") : 71 {
        didSet { UserDefaults.standard.set(rangeEnd, forKey: "rangeEnd") }
    }
    @Published var scaleId: Int = ud.object(forKey: "scaleId") != nil ? ud.integer(forKey: "scaleId") : 0 {
        didSet { UserDefaults.standard.set(scaleId, forKey: "scaleId") }
    }
    @Published var sequenceLength: Int = ud.object(forKey: "sequenceLength") != nil ? ud.integer(forKey: "sequenceLength") : 4 {
        didSet { UserDefaults.standard.set(sequenceLength, forKey: "sequenceLength") }
    }
    @Published var tempoBpm: Int = ud.object(forKey: "tempoBpm") != nil ? ud.integer(forKey: "tempoBpm") : 100 {
        didSet { UserDefaults.standard.set(tempoBpm, forKey: "tempoBpm") }
    }
    @Published var showTestNotes: Bool = ud.object(forKey: "showTestNotes") != nil ? ud.bool(forKey: "showTestNotes") : false {
        didSet { UserDefaults.standard.set(showTestNotes, forKey: "showTestNotes") }
    }
    @Published var keySignatureMode: Int = ud.object(forKey: "keySignatureMode") != nil ? ud.integer(forKey: "keySignatureMode") : 0 {
        didSet { UserDefaults.standard.set(keySignatureMode, forKey: "keySignatureMode") }
    }
    @Published var maxRetries: Int = ud.object(forKey: "maxRetries") != nil ? ud.integer(forKey: "maxRetries") : 5 {
        didSet { UserDefaults.standard.set(maxRetries, forKey: "maxRetries") }
    }
    @Published var silenceThreshold: Float = ud.object(forKey: "silenceThreshold") != nil ? Float(ud.double(forKey: "silenceThreshold")) : 0.003 {
        didSet { UserDefaults.standard.set(Double(silenceThreshold), forKey: "silenceThreshold") }
    }
    @Published var framesToConfirm: Int = ud.object(forKey: "framesToConfirm") != nil ? ud.integer(forKey: "framesToConfirm") : 3 {
        didSet { UserDefaults.standard.set(framesToConfirm, forKey: "framesToConfirm") }
    }
    @Published var postChordGapNanoseconds: UInt64 = ud.object(forKey: "postChordGapNs") != nil ? UInt64(ud.integer(forKey: "postChordGapNs")) : 800_000_000 {
        didSet { UserDefaults.standard.set(Int(postChordGapNanoseconds), forKey: "postChordGapNs") }
    }
    @Published var wrongNotePauseNanoseconds: UInt64 = ud.object(forKey: "wrongNotePauseNs") != nil ? UInt64(ud.integer(forKey: "wrongNotePauseNs")) : 3_000_000_000 {
        didSet { UserDefaults.standard.set(Int(wrongNotePauseNanoseconds), forKey: "wrongNotePauseNs") }
    }
    @Published var instrumentIndex: Int = ud.object(forKey: "instrumentIndex") != nil ? ud.integer(forKey: "instrumentIndex") : 0 {
        didSet {
            UserDefaults.standard.set(instrumentIndex, forKey: "instrumentIndex")
            applyInstrumentRange()
        }
    }
    @Published var sequence: [Int] = []
    @Published var detectedNotes: [DetectedNote] = []
    @Published var status: ExerciseStatus = .stopped
    @Published var currentNoteIndex: Int = 0
    @Published var score: Int = 0
    @Published var liveMidi: Int? = nil
    @Published var liveCents: Int = 0
    /// Set each time a new stable note is confirmed by the shared detection pipeline.
    /// SetupView observes confirmedNoteSeq (which always increments) so it fires even
    /// when the same MIDI value is confirmed twice in a row.
    @Published var confirmedLiveMidi: Int? = nil {
        didSet {
            guard status == .listening, let midi = confirmedLiveMidi else { return }
            commitNote(midi: midi, cents: liveCents)
        }
    }
    /// Monotonically increasing counter — incremented every time a note is confirmed.
    /// Use this (not confirmedLiveMidi) in onChange() handlers so same-note re-fires
    /// are always detected by SwiftUI.
    @Published private(set) var confirmedNoteSeq: Int = 0
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

    func applyInstrumentRange() {
        guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
              let arr = json as? [[String: Any]],
              arr.indices.contains(instrumentIndex) else { return }
        let obj = arr[instrumentIndex]
        if let s = obj["rangeStart"] as? Int, let e = obj["rangeEnd"] as? Int {
            rangeStart = s
            rangeEnd = e
        }
    }

    static func defaultRange(rootNote: Int) -> (Int, Int) {
        let candidates = (2...6).map { oct -> Int in (oct + 1) * 12 + rootNote }
        let best = candidates.min(by: { abs($0 - 60) < abs($1 - 60) }) ?? 60
        return (best, best + 11)
    }

    let audioCapture = AudioCapture()
    private let audioPlayback = AudioPlayback()

    private var cumulativeScore: Int = 0
    private var stabilityPitchClass: Int = -1
    private var stabilityCount: Int = 0
    private var pitchConsumed: Bool = false
    private var warmupFramesRemaining: Int = 0
    private var sessionPersisted = false

    // Gap between the last note of the sequence ending and mic start.
    // Piano sustain continues after playSequence returns; this silence lets it fade so
    // the mic doesn't immediately pick up speaker resonance as a "played" note.
    private let postSequenceGapNanoseconds: UInt64 = 700_000_000
    // Frames to discard when the mic first opens to absorb mic-settling transients.
    // 4 frames × ~93ms = ~370ms — enough to swallow hardware noise, not long enough
    // to be noticeable. Mic Setup uses the same value via startLivePitchDetection.
    private let micWarmupFrames: Int = 4

    var isCapturing: Bool { audioCapture.isRunning }
    var isSessionRunning: Bool { status != .stopped }

    func startExerciseSession() {
        cleanup()
        sessionPersisted = false
        cumulativeScore = 0
        testsCompleted = 0
        score = 0
        currentAttempt = 1
        maxAttempts = maxRetries
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
        warmupFramesRemaining = 0
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
        confirmedLiveMidi = nil
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
        confirmedLiveMidi = nil
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
        let chord = EarRingCore.introChord(rootMidi: rootMidi, scaleId: scaleId)
        print("[EAR] rootNote=\(rootNote) scaleId=\(scaleId) rangeStart=\(rangeStart) rangeEnd=\(rangeEnd) rootMidi=\(rootMidi)")
        print("[EAR] sequence=\(sequence.map { MusicTheory.midiToLabel($0) })")
        print("[EAR] introChord=\(chord.map { MusicTheory.midiToLabel($0) })")
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
        let chord = EarRingCore.introChord(rootMidi: rootMidi, scaleId: scaleId)
        await audioPlayback.playChord(notes: chord)
        // Let the chord ring freely through the intro gap and into the sequence —
        // stopping it early creates an unnatural cutoff.
        guard status == .playing else { return }
        try? await Task.sleep(nanoseconds: self.postChordGapNanoseconds)
        guard status == .playing else { return }
        await audioPlayback.playSequence(notes: sequence, bpm: tempoBpm) { _ in }
        guard status == .playing else { return }
        // Let all notes ring through the settling gap, then stop just before the mic
        // opens so the pitch detector doesn't pick up residual piano sound.
        try? await Task.sleep(nanoseconds: postSequenceGapNanoseconds)
        audioPlayback.stopAllPlayers()
        if status == .playing {
            await startListening()
        }
    }

    private func startListening() async {
        detectedNotes = []
        currentNoteIndex = 0
        resetStability()
        warmupFramesRemaining = micWarmupFrames
        status = .listening
        // Use the same detection path as Mic Setup — confirmed notes arrive via
        // confirmedLiveMidi.didSet which calls commitNote when status == .listening.
        await startLivePitchDetection()
    }

    // MARK: - Shared audio detection pipeline (used by both Exercise and Mic Setup)

    /// Runs RMS threshold check, Rust pitch detection, and MIDI conversion.
    /// Updates liveMidi/liveCents. Resets stability on silence.
    /// Returns (midi, cents) when a valid pitch is detected, nil otherwise.
    private func detectRawNote(samples: [Float], sampleRate: UInt32) -> (midi: Int, cents: Int)? {
        let rms = computeRMS(samples)
        guard rms >= silenceThreshold else {
            liveMidi = nil
            liveCents = 0
            resetStability()
            return nil
        }
        guard let hz = EarRingCore.detectPitch(samples: samples, sampleRate: sampleRate),
              let (midi, cents) = EarRingCore.freqToNote(hz: hz) else {
            return nil
        }
        liveMidi = midi
        liveCents = cents
        return (midi, cents)
    }

    /// 3-frame stability check shared by both Exercise and Mic Setup.
    private func checkStability(pitchClass: Int) -> Bool {
        if pitchClass == stabilityPitchClass {
            stabilityCount += 1
            if !pitchConsumed && stabilityCount >= framesToConfirm {
                pitchConsumed = true
                return true
            }
        } else {
            stabilityPitchClass = pitchClass
            stabilityCount = 1
            pitchConsumed = false
        }
        return false
    }

    /// Single audio callback used by BOTH Exercise and Mic Setup.
    /// Warmup frames are consumed first (set to micWarmupFrames at exercise listen
    /// start, and to 5 after each committed note). Confirmed notes are published
    /// via confirmedLiveMidi; the didSet handles exercise commit when appropriate.
    private func processAudioLive(samples: [Float], sampleRate: UInt32) {
        if warmupFramesRemaining > 0 {
            warmupFramesRemaining -= 1
            return
        }
        guard let (midi, _) = detectRawNote(samples: samples, sampleRate: sampleRate) else { return }
        guard checkStability(pitchClass: midi % 12) else { return }
        print("[EAR] confirmed midi=\(midi) (\(MusicTheory.midiToLabel(midi))) status=\(status)")
        confirmedNoteSeq += 1
        confirmedLiveMidi = midi
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
        // Reset stability for the next note, with a post-commit debounce so a
        // sustained note can't immediately re-confirm.
        // (5 frames ≈ 465ms at 44100Hz / 4096 samples)
        resetStability()
        warmupFramesRemaining = 5

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
                    try? await Task.sleep(nanoseconds: self.wrongNotePauseNanoseconds)
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
            try? await Task.sleep(nanoseconds: self.wrongNotePauseNanoseconds)
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

    /** Resets all settings to their defaults. Does NOT affect progress history.
     *  Also clears the first-launch flag so Help screen shows on next launch. */
    func resetSettings() {
        let ud = UserDefaults.standard
        let keys = ["rootNote","rangeStart","rangeEnd","scaleId","sequenceLength","tempoBpm",
                    "showTestNotes","keySignatureMode","maxRetries","silenceThreshold",
                    "framesToConfirm","postChordGapNs","wrongNotePauseNs","instrumentIndex",
                    "hasLaunched"]
        keys.forEach { ud.removeObject(forKey: $0) }
        rootNote = 0
        rangeStart = 60
        rangeEnd = 71
        scaleId = 0
        sequenceLength = 4
        tempoBpm = 100
        showTestNotes = false
        keySignatureMode = 0
        maxRetries = 5
        silenceThreshold = 0.003
        framesToConfirm = 3
        postChordGapNanoseconds = 800_000_000
        wrongNotePauseNanoseconds = 3_000_000_000
        instrumentIndex = 0
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
