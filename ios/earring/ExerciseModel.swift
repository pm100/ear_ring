import Foundation
import UIKit
import AVFoundation

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
    @Published var warmupFrames: Int = ud.object(forKey: "warmupFrames") != nil ? ud.integer(forKey: "warmupFrames") : 4 {
        didSet { UserDefaults.standard.set(warmupFrames, forKey: "warmupFrames") }
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
            let (s, e) = ExerciseModel.defaultRange(rootNote: rootNote)
            rangeStart = s
            rangeEnd = e
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

    static func defaultRange(rootNote: Int) -> (Int, Int) {
        let candidates = (2...6).map { oct -> Int in (oct + 1) * 12 + rootNote }
        let best = candidates.min(by: { abs($0 - 60) < abs($1 - 60) }) ?? 60
        return (best, best + 12)
    }

    let audioCapture = AudioCapture()
    private let audioPlayback = AudioPlayback()

    private var cumulativeScore: Int = 0
    private var sessionPersisted = false
    private var diagFrameCount: Int = 0

    // Rust-backed pitch tracker — owns stability, silence gating, warmup, and grace period.
    private var pitchTracker: EarRingCore.PitchTracker = EarRingCore.PitchTracker(silenceThreshold: 0.003, requiredFrames: 3)

    // Gap between the last note of the sequence ending and mic start.
    // Piano sustain continues after playSequence returns; this silence lets it fade so
    // the mic doesn't immediately pick up speaker resonance as a "played" note.
    private let postSequenceGapNanoseconds: UInt64 = 700_000_000

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
        audioPlayback.stopEngine()
        liveMidi = nil
        liveCents = 0
        pitchTracker.reset()
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
        pitchTracker.setParams(silenceThreshold: silenceThreshold, requiredFrames: framesToConfirm)
        pitchTracker.applyInstrument(index: instrumentIndex)
        pitchTracker.resetWithWarmup(frames: warmupFrames)
        diagFrameCount = 0

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
        audioPlayback.prepareForPlayback()
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
        // Let all notes ring through the settling gap, then stop the playback engine
        // entirely so it doesn't compete with the capture engine for audio routes.
        try? await Task.sleep(nanoseconds: postSequenceGapNanoseconds)
        audioPlayback.stopEngine()
        print("[EAR] playback engine stopped, starting capture")
        if status == .playing {
            await startListening()
        }
    }

    private func startListening() async {
        detectedNotes = []
        currentNoteIndex = 0
        pitchTracker.reset()
        status = .listening
        let session = AVAudioSession.sharedInstance()
        print("[EAR] startListening — session category=\(session.category.rawValue) mode=\(session.mode.rawValue) active=\(session.isOtherAudioPlaying)")
        // Use the same detection path as Mic Setup — confirmed notes arrive via
        // confirmedLiveMidi.didSet which calls commitNote when status == .listening.
        // warmupFramesRemaining is set inside startLivePitchDetection() so both
        // Exercise and Setup get the same warmup value.
        await startLivePitchDetection()
    }

    // MARK: - Shared audio detection pipeline (used by both Exercise and Mic Setup)

    /// Single audio callback used by BOTH Exercise and Mic Setup.
    /// All detection rules (silence gating, warmup, stability, grace period) are handled
    /// inside the Rust PitchTracker. Confirmed notes are published via confirmedLiveMidi;
    /// the didSet handles exercise commit when appropriate.
    private func processAudioLive(samples: [Float], sampleRate: UInt32) {
        diagFrameCount += 1
        if diagFrameCount <= 10 {
            var floats = samples
            let rms = sqrt(floats.reduce(0.0) { $0 + $1 * $1 } / Float(floats.count))
            print("[EAR] frame \(diagFrameCount) rms=\(String(format: "%.5f", rms)) sampleRate=\(sampleRate)")
        }
        let frame = pitchTracker.process(samples: samples, sampleRate: sampleRate)
        if frame.liveMidi >= 0 {
            liveMidi = frame.liveMidi
            // Cents not returned by tracker; re-derive from liveHz for the pitch meter.
            if let (_, cents) = EarRingCore.freqToNote(hz: frame.liveHz) {
                liveCents = cents
            }
        } else {
            liveMidi = nil
            liveCents = 0
        }
        if frame.confirmedMidi >= 0 {
            print("[EAR] confirmed midi=\(frame.confirmedMidi) (\(MusicTheory.midiToLabel(frame.confirmedMidi))) status=\(status)")
            confirmedNoteSeq += 1
            confirmedLiveMidi = frame.confirmedMidi
        }
    }

    private func commitNote(midi: Int, cents: Int) {
        guard midi >= max(0, rangeStart - 6) && midi <= min(127, rangeEnd + 6) else { return }
        guard currentNoteIndex < sequence.count else { return }

        let expectedMidi = sequence[currentNoteIndex]
        let correct = EarRingCore.isCorrectNote(detectedMidi: midi, cents: cents, expectedMidi: expectedMidi)
        let note = DetectedNote(midi: midi, cents: cents, isCorrect: correct)
        detectedNotes.append(note)
        currentNoteIndex += 1

        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(correct ? .success : .error)

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
                    "framesToConfirm","warmupFrames","postChordGapNs","wrongNotePauseNs","instrumentIndex",
                    "hasLaunched"]
        keys.forEach { ud.removeObject(forKey: $0) }
        rootNote = 0
        rangeStart = 60
        rangeEnd = 72
        scaleId = 0
        sequenceLength = 4
        tempoBpm = 100
        showTestNotes = false
        keySignatureMode = 0
        maxRetries = 5
        silenceThreshold = 0.003
        framesToConfirm = 3
        warmupFrames = 4
        postChordGapNanoseconds = 800_000_000
        wrongNotePauseNanoseconds = 3_000_000_000
        instrumentIndex = 0
    }
}
