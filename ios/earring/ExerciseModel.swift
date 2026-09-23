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

/// The persisted settings — schema, defaults, and every rule that changes them are owned by
/// `rust/src/settings.rs` (see `EarRingCore.settingsDefaults/Normalize/Apply`). This struct only
/// decodes the JSON that crosses the FFI boundary; field names must match its camelCase JSON
/// keys exactly so Codable's default synthesis works with no explicit CodingKeys.
private struct Settings: Codable {
    var rootNote: Int
    var rangeStart: Int
    var rangeEnd: Int
    var scaleId: Int
    var sequenceLength: Int
    var tempoBpm: Int
    var showTestNotes: Bool
    var playPassFailSounds: Bool
    var keySignatureMode: Int
    var introSoundMode: Int
    var maxRetries: Int
    var noteRetries: Int
    var silenceThreshold: Float
    var framesToConfirm: Int
    var warmupFrames: Int
    var graceFrames: Int
    var octaveCorrection: Bool
    var yinThreshold: Float
    var pitchToleranceCents: Float
    var useTunerMeter: Bool
    var postChordGapMs: Int
    var wrongNotePauseMs: Int
    var instrumentIndex: Int
    var testType: Int
}

@MainActor
class ExerciseModel: ObservableObject {
    private static let ud = UserDefaults.standard
    private static let settingsKey = "settings"

    /// The persisted settings, as ONE JSON string owned by `rust/src/settings.rs` — it owns the
    /// schema, every default, and every rule that changes them (instrument-snapping,
    /// range-snapping, the diatonic sequence-length rule, ...). This class only persists the
    /// string Rust returns and republishes it. Every property below named after an
    /// individually-stored setting (rootNote, tempoBpm, ...) is a computed proxy decoding or
    /// dispatching against this one blob, so existing views don't need to change — with 2
    /// exceptions: SettingsView's Instrument/Intro Sound pickers use `$model.x`, which needs a
    /// real `@Published` property (not a computed one), so those two call sites were switched
    /// to a manual `Binding(get:set:)` instead.
    @Published private var settingsJson: String = {
        let json = EarRingCore.settingsNormalize(ud.string(forKey: settingsKey))
        ud.set(json, forKey: settingsKey)
        return json
    }()

    /// Decoded view of `settingsJson`. Rust guarantees valid JSON for every string it returns
    /// (`rust/src/settings.rs`'s 3 functions are documented as "never fail"), so this trusts it
    /// the same way Android's `JSONObject(json)` does.
    private var settings: Settings {
        try! JSONDecoder().decode(Settings.self, from: Data(settingsJson.utf8))
    }

    /// Sends one action to the Rust settings model, persists the result, and republishes it.
    private func dispatch(_ action: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: action),
              let actionJson = String(data: data, encoding: .utf8) else { return }
        settingsJson = EarRingCore.settingsApply(settingsJson, actionJson)
        Self.ud.set(settingsJson, forKey: Self.settingsKey)
    }

    /// A plain-field change: Rust merges it and clamps it to valid bounds.
    private func set(_ field: String, _ value: Any) {
        dispatch(["type": "set", "values": [field: value]])
    }

    /// Re-derives the default range for the key (Rust does this as part of `setRootNote`).
    var rootNote: Int {
        get { settings.rootNote }
        set { dispatch(["type": "setRootNote", "value": newValue]) }
    }
    var rangeStart: Int { settings.rangeStart }
    var rangeEnd: Int { settings.rangeEnd }
    var scaleId: Int {
        get { settings.scaleId }
        set { set("scaleId", newValue) }
    }
    var sequenceLength: Int {
        get { settings.sequenceLength }
        set { set("sequenceLength", newValue) }
    }
    var tempoBpm: Int {
        get { settings.tempoBpm }
        set { set("tempoBpm", newValue) }
    }
    var showTestNotes: Bool {
        get { settings.showTestNotes }
        set { set("showTestNotes", newValue) }
    }
    var keySignatureMode: Int {
        get { settings.keySignatureMode }
        set { set("keySignatureMode", newValue) }
    }
    /// What plays before each test: 0=root note, 1=chord (default), 2=arpeggiated chord, 3=scale, 4=none.
    var introSoundMode: Int {
        get { settings.introSoundMode }
        set { set("introSoundMode", newValue) }
    }
    var maxRetries: Int {
        get { settings.maxRetries }
        set { set("maxRetries", newValue) }
    }
    /// Issue #9 "note correction": consecutive wrong tries allowed at the same note
    /// position before the whole test restarts. 0 = always restart (old behavior).
    var noteRetries: Int {
        get { settings.noteRetries }
        set { set("noteRetries", newValue) }
    }
    var silenceThreshold: Float {
        get { settings.silenceThreshold }
        set { set("silenceThreshold", newValue) }
    }
    var framesToConfirm: Int {
        get { settings.framesToConfirm }
        set { set("framesToConfirm", newValue) }
    }
    var warmupFrames: Int {
        get { settings.warmupFrames }
        set { set("warmupFrames", newValue) }
    }
    /// Previously hidden per-instrument constant (grace_frames in the Rust INSTRUMENTS
    /// table). Live-pushed to the tracker on every edit (see pushAdvancedParams) rather than
    /// only at the next startLivePitchDetection() call — mirrors Android/desktop's Advanced
    /// controls, where a manual slider change takes effect immediately.
    var graceFrames: Int {
        get { settings.graceFrames }
        set { set("graceFrames", newValue); pushAdvancedParams() }
    }
    /// Previously hidden per-instrument constant (octave_correction in the Rust
    /// INSTRUMENTS table).
    var octaveCorrection: Bool {
        get { settings.octaveCorrection }
        set { set("octaveCorrection", newValue); pushAdvancedParams() }
    }
    /// Previously hidden global constant (DEFAULT_YIN_THRESHOLD in pitch_detection.rs).
    var yinThreshold: Float {
        get { settings.yinThreshold }
        set { set("yinThreshold", newValue); pushAdvancedParams() }
    }
    /// Previously hidden per-instrument constant (pitch_tolerance_cents in the Rust
    /// INSTRUMENTS table).
    var pitchToleranceCents: Float {
        get { settings.pitchToleranceCents }
        set { set("pitchToleranceCents", newValue); pushAdvancedParams() }
    }
    /// Mic Setup meter style: true = tuner-style needle meter, false = classic note-name
    /// circle. Defaults per-instrument (Rust `setInstrument`) but user-overridable — not
    /// pushed to the tracker, purely a display preference.
    var useTunerMeter: Bool {
        get { settings.useTunerMeter }
        set { set("useTunerMeter", newValue) }
    }
    var postChordGapNanoseconds: UInt64 {
        get { UInt64(settings.postChordGapMs) * 1_000_000 }
        set { set("postChordGapMs", Int(newValue / 1_000_000)) }
    }
    var wrongNotePauseNanoseconds: UInt64 {
        get { UInt64(settings.wrongNotePauseMs) * 1_000_000 }
        set { set("wrongNotePauseMs", Int(newValue / 1_000_000)) }
    }
    /// Rust snaps range, grace/octave/tolerance and the tuner-meter default to the instrument's table.
    var instrumentIndex: Int {
        get { settings.instrumentIndex }
        set { dispatch(["type": "setInstrument", "value": newValue]) }
    }
    /// Rust enforces the diatonic rule (always a 3-note arpeggio).
    var testType: Int {
        get { settings.testType }
        set { dispatch(["type": "setTestType", "value": newValue]) }
    }
    /// Chime on test pass/fail.
    var playPassFailSounds: Bool {
        get { settings.playPassFailSounds }
        set { set("playPassFailSounds", newValue) }
    }
    /// Ad-free / paid entitlement. Not a user "setting" — deliberately kept outside the
    /// settings blob (and outside resetSettings()'s reach), same as Android's separate
    /// PREF_IS_PREMIUM. Until real billing lands, nothing sets this true.
    @Published var isPremium: Bool = ud.object(forKey: "isPremium") != nil ? ud.bool(forKey: "isPremium") : false {
        didSet { UserDefaults.standard.set(isPremium, forKey: "isPremium") }
    }
    @Published var sequence: [Int] = []
    @Published var detectedNotes: [DetectedNote] = []
    @Published var status: ExerciseStatus = .stopped
    @Published var currentNoteIndex: Int = 0
    @Published var score: Int = 0
    @Published var liveMidi: Int? = nil
    @Published var liveCents: Int = 0
    /// Actual measured Hz at the moment a note was confirmed — captured alongside
    /// confirmedLiveMidi so callers can show the real detection instead of a value
    /// recomputed from the (possibly wrong) confirmed MIDI.
    @Published var confirmedHz: Float = 0
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
    /// Consecutive wrong tries at the current note position — not persisted; reset on a
    /// correct note or whenever the sequence restarts (see EarRingCore.wrongNoteOutcome).
    var noteRetryCount: Int = 0
    /// Total same-note retries used across the WHOLE current test, including any spent
    /// during an earlier attempt that then got restarted — feeds EarRingCore.noteRetryPenalty
    /// at completion. Reset only when a fresh test starts (unlike noteRetryCount).
    private var totalNoteRetries: Int = 0
    @Published var testsCompleted: Int = 0
    @Published var chordLabel: String = ""  // Set for diatonic mode; empty otherwise

    /// MIDI of the root note at or just below rangeStart (used for intro chord).
    var rootMidi: Int { rangeStart - ((rangeStart - rootNote + 12) % 12) }

    var rangeLabel: String { "\(MusicTheory.midiToLabel(rangeStart))–\(MusicTheory.midiToLabel(rangeEnd))" }

    /// No longer needed: `rootNote`'s setter already re-derives the range via Rust's
    /// `setRootNote` action. Kept as a no-op so HomeView's existing call site (paired with
    /// `model.rootNote = $0`) doesn't need to change.
    func updateRangeForKey() {}

    /// Apply a user-edited range; Rust clamps it to at least one octave.
    func setRange(start: Int, end: Int) {
        dispatch(["type": "setRange", "start": start, "end": end])
    }

    let audioCapture = AudioCapture()
    private let audioPlayback = AudioPlayback()

    private var cumulativeScore: Int = 0
    private var sessionPersisted = false
    /// Set once per startExerciseSession() call — correlates persisted TestRecords to their SessionRecord.
    private var sessionId = UUID()
    private var diagFrameCount: Int = 0

    private var melodyDeck: [Int] = []
    private var melodyDeckCursor: Int = 0
    private(set) var melodyDurations: [Float] = []

    // Rust-backed pitch tracker — owns stability, silence gating, warmup, and grace period.
    private var pitchTracker: EarRingCore.PitchTracker = EarRingCore.PitchTracker(silenceThreshold: 0.003, requiredFrames: 3)

    // Gap between the last note of the sequence ending and mic start.
    // Piano sustain continues after playSequence returns; this silence lets it fade so
    // the mic doesn't immediately pick up speaker resonance as a "played" note.
    private let postSequenceGapNanoseconds: UInt64 = 700_000_000

    var isCapturing: Bool { audioCapture.isRunning }
    var isSessionRunning: Bool { status != .stopped }

    /// Issue #9 "note correction": true while `.listening` after a same-note retry (the
    /// wrong note isn't drawn, so this is the only visible sign it happened) — views show
    /// "Wrong note. Try again…" instead of the normal prompt. Cleared by the next correct
    /// note or whenever the sequence restarts.
    var isRetryingSameNote: Bool { noteRetryCount > 0 }

    func startExerciseSession() {
        cleanup()
        sessionPersisted = false
        sessionId = UUID()
        cumulativeScore = 0
        testsCompleted = 0
        score = 0
        currentAttempt = 1
        maxAttempts = maxRetries
        if testType == 1 {
            melodyDeck = EarRingCore.shuffleMelodyIndices(seed: UInt64(Date().timeIntervalSince1970 * 1000))
            melodyDeckCursor = 0
        }
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
        await audioPlayback.playNote(midi: midi)
    }

    func startLivePitchDetection(warmup: Int? = nil) async {
        liveMidi = nil
        liveCents = 0
        confirmedLiveMidi = nil
        pitchTracker.setParams(silenceThreshold: silenceThreshold, requiredFrames: framesToConfirm)
        pitchTracker.applyInstrument(index: instrumentIndex)
        pushAdvancedParams()
        // Mic Setup passes warmup=0 (user-triggered, no settling needed).
        // Exercise passes nil to use the configured warmupFrames setting.
        let frames = warmup ?? warmupFrames
        if frames > 0 {
            pitchTracker.resetWithWarmup(frames: frames)
        } else {
            pitchTracker.reset()
        }
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

    /// Push the current grace/octave/YIN/pitch-tolerance overrides to the shared
    /// pitchTracker. Called on every live edit of the 4 properties (so a Mic Setup
    /// Advanced-sheet change takes effect immediately) and once more at
    /// startLivePitchDetection() so a fresh session always starts with the current values.
    private func pushAdvancedParams() {
        pitchTracker.setAdvancedParams(graceFrames: graceFrames, octaveCorrection: octaveCorrection, yinThreshold: yinThreshold, pitchToleranceCents: pitchToleranceCents)
    }

    private func startFreshTest() async {
        audioPlayback.prepareForPlayback()

        if testType == 1 {
            // Melody mode — no longer reachable from the UI (Rust's settings model remaps
            // any stored testType 1 back to 0), kept only as vestigial dead code, same as
            // Android's ExerciseViewModel.
            if melodyDeckCursor >= melodyDeck.count {
                melodyDeck = EarRingCore.shuffleMelodyIndices(seed: UInt64(Date().timeIntervalSince1970 * 1000))
                melodyDeckCursor = 0
            }
            let melodyIndex = melodyDeck[melodyDeckCursor]
            melodyDeckCursor += 1
            guard let (midiNotes, durations) = EarRingCore.pickMelodyByIndex(index: melodyIndex, rootChroma: rootNote) else {
                await startFreshTest(); return
            }
            melodyDurations = durations
            // Auto-set range ±6 semitones. Goes through setRange (not a raw property
            // assignment) since rangeStart/rangeEnd are read-only proxies now — Rust owns
            // every write path to the persisted range.
            let minMidi = (midiNotes.min() ?? 60) - 6
            let maxMidi = (midiNotes.max() ?? 72) + 6
            setRange(start: max(21, minMidi), end: min(108, maxMidi))
            sequence = midiNotes
        } else if testType == 2 {
            // Diatonic arpeggio mode — direction (ascending/descending) is randomized
            // per test rather than a user choice (issue #5), and consecutive tests
            // must not open on the same note, mirroring the guard in random-note mode
            // below. Each retry draws a fresh seed so the chord label (recomputed
            // separately from the same seed) stays in sync with what's actually played.
            // Also retry if the voicing came up short: root position is used throughout
            // (no inversions yet — see roadmap.md), and Rust rejects (returns empty)
            // rather than clamp a note to the range boundary, which could substitute a
            // wrong pitch that isn't a real chord tone. A different scale degree usually
            // fits the range cleanly.
            melodyDurations = []
            let centerMidi = (rangeStart + rangeEnd) / 2
            let avoidFirstMidi = sequence.first
            var notes: [Int] = []
            var seed: UInt64 = 0
            for attempt in 0..<8 {
                seed = UInt64(Date().timeIntervalSince1970 * 1000) &+ UInt64(attempt)
                let generated = EarRingCore.generateDiatonicChord(
                    rootChroma: rootNote,
                    scaleId: scaleId,
                    noteCount: sequenceLength,
                    rangeStart: rangeStart,
                    rangeEnd: rangeEnd,
                    seed: seed
                )
                notes = Bool.random() ? generated.reversed() : generated
                if notes.count == sequenceLength && notes.first != avoidFirstMidi { break }
            }
            sequence = notes
            chordLabel = EarRingCore.writtenDiatonicChordLabel(
                concertRootChroma: rootNote,
                scaleId: scaleId,
                noteCount: sequenceLength,
                rangeStart: rangeStart,
                rangeEnd: rangeEnd,
                centerMidi: centerMidi,
                seed: seed,
                instrumentIndex: instrumentIndex
            )
        } else {
            melodyDurations = []
            chordLabel = ""
            let seed = UInt64(Date().timeIntervalSince1970 * 1000)
            // Avoid repeating the previous test's opening note, whatever mode it came from.
            sequence = EarRingCore.generateSequence(
                rootChroma: rootNote,
                scaleId: scaleId,
                length: sequenceLength,
                rangeStart: rangeStart,
                rangeEnd: rangeEnd,
                seed: seed,
                avoidFirstMidi: sequence.first
            )
        }

        let chord = EarRingCore.introChord(rootMidi: EarRingCore.effectiveIntroRootMidi(rootNote: rootNote, scaleId: scaleId, rangeStart: rangeStart), scaleId: scaleId)
        detectedNotes = []
        currentNoteIndex = 0
        currentAttempt = 1
        noteRetryCount = 0
        totalNoteRetries = 0
        status = .playing
        await playPrompt()
    }

    private func retryCurrentTest(attempt: Int) async {
        detectedNotes = []
        currentNoteIndex = 0
        currentAttempt = attempt
        noteRetryCount = 0
        status = .playing
        await playPrompt()
    }

    /// Replays the current test on demand (issue #7's Repeat button). Unlike the
    /// automatic wrong-note retry, this keeps the same attempt number so it never
    /// consumes one of the user's allowed attempts.
    func repeatCurrentTest() {
        guard status == .listening else { return }
        audioCapture.stop()
        let attempt = currentAttempt
        Task { await self.retryCurrentTest(attempt: attempt) }
    }

    private func playPrompt() async {
        // A previous session's delayed continuation can still be mid-flight when a new
        // session starts. Capture the session identity now and re-check it at every
        // resume point below so a stale call can never play audio or flip state for the
        // new session (AudioPlayback has its own equivalent guard for issue #17).
        let mySession = sessionId
        guard !sequence.isEmpty else { return }
        status = .playing
        // Issue #8: what plays before the test sequence is configurable — a single root
        // note, a block chord (default, unchanged), the chord arpeggiated, the full scale
        // ascending, or nothing at all. All but "chord" reuse playSequence (one note after
        // another) instead of playChord (simultaneous).
        let introRootMidi = EarRingCore.effectiveIntroRootMidi(rootNote: rootNote, scaleId: scaleId, rangeStart: rangeStart)
        switch introSoundMode {
        case 0:
            await audioPlayback.playSequence(notes: [introRootMidi], bpm: tempoBpm, durations: nil) { _ in }
        case 2:
            let chord = EarRingCore.introChord(rootMidi: introRootMidi, scaleId: scaleId)
            await audioPlayback.playSequence(notes: chord, bpm: tempoBpm, durations: nil) { _ in }
        case 3:
            // scaleNotes returns the 7 scale degrees; append the octave root so the
            // scale intro plays a full 8-note run ending on the octave, not the 7th.
            let scale = EarRingCore.scaleNotes(rootMidi: introRootMidi, scaleId: scaleId) + [introRootMidi + 12]
            await audioPlayback.playSequence(notes: scale, bpm: tempoBpm, durations: nil) { _ in }
        case 4:
            break  // No intro sound — skip straight to the post-intro gap/sequence.
        default:
            let chord = EarRingCore.introChord(rootMidi: introRootMidi, scaleId: scaleId)
            await audioPlayback.playChord(notes: chord)
        }
        // Fade chord sustain concurrently with the post-chord gap so notes
        // are silent before the sequence begins. Cap at 75% of the gap so
        // the fade always finishes before the sequence starts.
        let chordFadeDuration = min(0.3, Double(postChordGapNanoseconds) / 1_000_000_000.0 * 0.75)
        Task { await self.audioPlayback.fadeOutActive(duration: chordFadeDuration) }
        guard status == .playing, sessionId == mySession else { return }
        try? await Task.sleep(nanoseconds: self.postChordGapNanoseconds)
        guard status == .playing, sessionId == mySession else { return }
        await audioPlayback.playSequence(notes: sequence, bpm: tempoBpm, durations: melodyDurations.isEmpty ? nil : melodyDurations) { _ in }
        guard status == .playing, sessionId == mySession else { return }
        // Fade sequence sustain; then stop the engine before capture starts.
        await audioPlayback.fadeOutActive(duration: 0.4)
        let remainingGapNs = postSequenceGapNanoseconds > 400_000_000
            ? postSequenceGapNanoseconds - 400_000_000
            : 0
        if remainingGapNs > 0 {
            try? await Task.sleep(nanoseconds: remainingGapNs)
        }
        audioPlayback.stopEngine()
        print("[EAR] playback engine stopped, starting capture")
        if status == .playing, sessionId == mySession {
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
        if diagFrameCount <= 50 {
            let rms = sqrt(samples.reduce(0.0) { $0 + $1 * $1 } / Float(samples.count))
            print("[EAR] frame \(diagFrameCount) samples=\(samples.count) rms=\(String(format: "%.5f", rms)) sampleRate=\(sampleRate)")
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
            print("[EAR] confirmed midi=\(frame.confirmedMidi) (\(MusicTheory.midiToLabel(frame.confirmedMidi))) hz=\(frame.liveHz) status=\(status)")
            confirmedHz = frame.liveHz
            confirmedNoteSeq += 1
            confirmedLiveMidi = frame.confirmedMidi
        }
    }

    private func commitNote(midi: Int, cents: Int) {
        guard midi >= max(0, rangeStart - 6) && midi <= min(127, rangeEnd + 6) else { return }
        guard currentNoteIndex < sequence.count else { return }

        let expectedMidi = sequence[currentNoteIndex]
        let correct = EarRingCore.isCorrectNote(detectedMidi: midi, cents: cents, expectedMidi: expectedMidi)

        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(correct ? .success : .error)

        if correct {
            noteRetryCount = 0
            detectedNotes.append(DetectedNote(midi: midi, cents: cents, isCorrect: true))
            currentNoteIndex += 1
            if currentNoteIndex >= sequence.count {
                audioCapture.stop()
                completeTest(passed: true, attemptsUsed: currentAttempt, attemptNotes: detectedNotes)
            }
        } else {
            // Issue #9 "note correction": noteRetryCount and currentAttempt are independent
            // counters. Within the configured noteRetries budget, a wrong note just keeps
            // listening for another try at the SAME note — no capture stop/restart, no
            // staff mark for the wrong note, no prompt replay, and NO change to
            // currentAttempt (it doesn't hit the score). Only once that budget is exhausted
            // does today's original behavior kick in: currentAttempt advances and the whole
            // test restarts (or fails, if maxAttempts is already used up). Views show
            // "Wrong note. Try again…" while status stays .listening and noteRetryCount > 0.
            noteRetryCount += 1
            let outcome = EarRingCore.wrongNoteOutcome(
                currentAttempt: currentAttempt, maxAttempts: maxAttempts,
                noteRetryCount: noteRetryCount, noteRetriesAllowed: noteRetries
            )
            switch outcome {
            case .retrySameNote:
                totalNoteRetries += 1
            case .fail:
                detectedNotes.append(DetectedNote(midi: midi, cents: cents, isCorrect: false))
                audioCapture.stop()
                status = .retryDelay
                completeTest(passed: false, attemptsUsed: currentAttempt, attemptNotes: detectedNotes)
            case .restartSequence:
                detectedNotes.append(DetectedNote(midi: midi, cents: cents, isCorrect: false))
                audioCapture.stop()
                status = .retryDelay
                let mySession = sessionId
                Task {
                    try? await Task.sleep(nanoseconds: self.wrongNotePauseNanoseconds)
                    guard self.isSessionRunning, self.sessionId == mySession else { return }
                    await self.retryCurrentTest(attempt: self.currentAttempt + 1)
                }
            }
        }
    }

    private func completeTest(passed: Bool, attemptsUsed: Int, attemptNotes: [DetectedNote]) {
        if playPassFailSounds {
            if passed { audioPlayback.playPassSound() } else { audioPlayback.playFailSound() }
        }
        // Issue #9 "note correction": note-level retries don't consume a test attempt,
        // but they still cost points — deduct a penalty scaled so burning the whole
        // per-note budget on one note costs about as much as one full attempt would.
        let penalty = EarRingCore.noteRetryPenalty(noteRetriesUsed: totalNoteRetries, noteRetriesAllowed: noteRetries, maxAttempts: maxAttempts)
        let testScore = max(0, EarRingCore.testScore(maxAttempts: maxAttempts, attemptsUsed: attemptsUsed, passed: passed) - penalty)
        cumulativeScore += testScore
        testsCompleted += 1
        score = testsCompleted == 0 ? 0 : cumulativeScore / testsCompleted
        status = .retryDelay
        persistTestRecord(score: testScore, attemptsUsed: attemptsUsed, passed: passed, attemptNotes: attemptNotes)

        let mySession = sessionId
        Task {
            try? await Task.sleep(nanoseconds: self.wrongNotePauseNanoseconds)
            guard self.isSessionRunning, self.sessionId == mySession else { return }
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
                detectedNotes: attemptNotes.map { MusicTheory.midiToLabel($0.midi) },
                sessionId: sessionId
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
                testsCompleted: testsCompleted,
                sessionId: sessionId
            )
        )
        sessionPersisted = true
    }

    /** Resets all settings to their defaults. Does NOT affect progress history, the
     *  isPremium entitlement (that's a purchase, not a preference — left untouched), or
     *  the first-launch flag (app state, not a setting; it isn't part of the settings blob
     *  at all, so it's untouched automatically — kept in step with Android, where clearing
     *  it used to send the next-tapped tab to Help). */
    func resetSettings() {
        dispatch(["type": "reset"])
    }
}
