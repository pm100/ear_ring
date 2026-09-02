import AVFoundation
import Foundation

/// Handles piano sample playback with accurate pitch shifting via AVAudioEngine.
/// Uses AVAudioUnitTimePitch (shifts pitch in cents) instead of AVAudioPlayer.rate,
/// which is unreliable on iOS and silently ignored in many session configurations.
@MainActor
class AudioPlayback {

    private static let sampleMap: [(name: String, midi: Int)] = [
        ("A0",  21), ("C1",  24), ("Ds1", 27), ("Fs1", 30),
        ("A1",  33), ("C2",  36), ("Ds2", 39), ("Fs2", 42),
        ("A2",  45), ("C3",  48), ("Ds3", 51), ("Fs3", 54),
        ("A3",  57), ("C4",  60), ("Ds4", 63), ("Fs4", 66),
        ("A4",  69), ("C5",  72), ("Ds5", 75), ("Fs5", 78),
        ("A5",  81), ("C6",  84), ("Ds6", 87), ("Fs6", 90),
        ("A6",  93), ("C7",  96), ("Ds7", 99), ("Fs7", 102),
        ("A7", 105), ("C8", 108)
    ]

    private let engine = AVAudioEngine()
    // (playerNode, timePitchUnit) pairs for all currently sounding notes.
    private var activeNodes: [(AVAudioPlayerNode, AVAudioUnitTimePitch)] = []
    private var isCancelled = false

    // MARK: - Lifecycle

    /// Pre-configure the audio session so playback can start instantly.
    /// Only sets up the session — does not start the engine (which needs nodes attached first).
    /// Preserves the current mode to avoid disrupting .measurement if AudioCapture set it.
    func prepareForPlayback() {
        let session = AVAudioSession.sharedInstance()
        if session.category != .playAndRecord {
            try? session.setCategory(.playAndRecord, mode: .default,
                                     options: [.defaultToSpeaker, .allowBluetooth])
        }
        try? session.setActive(true)
    }

    func cancelPlayback() {
        isCancelled = true
        stopAllPlayers()
    }

    /// Stop all sounding notes without cancelling future playback.
    func stopAllPlayers() {
        let toStop = activeNodes
        activeNodes.removeAll()
        for (player, pitch) in toStop {
            player.stop()
            engine.detach(player)   // also disconnects
            engine.detach(pitch)
        }
    }

    /// Gradually fade all active notes to silence over [duration] seconds, then stop them.
    /// Call this as soon as a playback phase ends so sustain doesn't bleed into mic capture.
    func fadeOutActive(duration: Double = 0.4) async {
        guard !activeNodes.isEmpty else { return }
        let steps = 20
        let stepDuration = duration / Double(steps)
        for step in 1...steps {
            let vol = Float(1.0 - Double(step) / Double(steps))
            for (player, _) in activeNodes { player.volume = vol }
            try? await Task.sleep(nanoseconds: UInt64(stepDuration * 1_000_000_000))
        }
        stopAllPlayers()
    }

    /// Fully stop the playback engine so it doesn't compete with AudioCapture's
    /// engine for the shared AVAudioSession hardware routes.
    func stopEngine() {
        stopAllPlayers()
        if engine.isRunning {
            engine.stop()
        }
    }

    func resetCancellation() {
        isCancelled = false
    }

    // MARK: - Private helpers

    nonisolated private func nearestSample(for midi: Int) -> (name: String, midi: Int) {
        return AudioPlayback.sampleMap.min(by: {
            abs($0.midi - midi) < abs($1.midi - midi)
        }) ?? ("A4", 69)
    }

    nonisolated private func downloadIfNeeded(name: String) async throws -> URL {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let fileName = "\(name).mp3"
        let cachedURL = cacheDir.appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: cachedURL.path) {
            return cachedURL
        }
        guard let remoteURL = URL(string: "https://tonejs.github.io/audio/salamander/\(fileName)") else {
            throw URLError(.badURL)
        }
        let (data, _) = try await URLSession.shared.data(from: remoteURL)
        try data.write(to: cachedURL)
        return cachedURL
    }

    /// Ensure the audio session and engine are in a state ready for playback.
    /// Keeps the existing session mode (.measurement or .default) — switching to
    /// .default is unnecessary because AVAudioUnitTimePitch works in any mode.
    private func ensureEngineRunning() throws {
        let session = AVAudioSession.sharedInstance()
        // Only configure if the category isn't already .playAndRecord.
        if session.category != .playAndRecord {
            try session.setCategory(.playAndRecord, mode: .default,
                                    options: [.defaultToSpeaker, .allowBluetooth])
        }
        if !session.isOtherAudioPlaying {
            try? session.setActive(true)
        }
        if !engine.isRunning {
            try engine.start()
        }
    }

    /// Attach a player + time-pitch pair to the engine and start playback immediately.
    /// pitchCents: shift in cents (100 = +1 semitone, -100 = -1 semitone, 0 = no shift).
    /// The completion handler detaches the nodes automatically when the sample finishes
    /// playing naturally, so callers don't need to tear down for normal note decay.
    private func startNode(url: URL, pitchCents: Float) throws -> (AVAudioPlayerNode, AVAudioUnitTimePitch) {
        let audioFile = try AVAudioFile(forReading: url)
        let playerNode = AVAudioPlayerNode()
        let timePitch = AVAudioUnitTimePitch()
        timePitch.pitch = pitchCents   // pure pitch shift; rate stays 1.0 (no time stretch)

        engine.attach(playerNode)
        engine.attach(timePitch)
        engine.connect(playerNode, to: timePitch, format: audioFile.processingFormat)
        engine.connect(timePitch, to: engine.mainMixerNode, format: nil)

        try ensureEngineRunning()

        // When the sample plays to its natural end, clean up the nodes.
        playerNode.scheduleFile(audioFile, at: nil) { [weak self, weak playerNode, weak timePitch] in
            guard let self, let playerNode, let timePitch else { return }
            Task { @MainActor [weak self, weak playerNode, weak timePitch] in
                guard let self, let playerNode, let timePitch else { return }
                // Only detach if not already stopped by stopAllPlayers/tearDown.
                guard self.activeNodes.contains(where: { $0.0 === playerNode }) else { return }
                self.engine.detach(playerNode)
                self.engine.detach(timePitch)
                self.activeNodes.removeAll { $0.0 === playerNode }
            }
        }
        playerNode.play()
        activeNodes.append((playerNode, timePitch))
        return (playerNode, timePitch)
    }

    private func tearDown(_ playerNode: AVAudioPlayerNode, _ timePitch: AVAudioUnitTimePitch) {
        playerNode.stop()
        engine.detach(playerNode)
        engine.detach(timePitch)
        activeNodes.removeAll { $0.0 === playerNode }
    }

    // MARK: - Public API

    func playNote(midi: Int, holdNanoseconds: UInt64 = 600_000_000) async {
        guard !isCancelled else { return }
        let sample = nearestSample(for: midi)
        let pitchCents = Float((midi - sample.midi) * 100)
        do {
            let url = try await downloadIfNeeded(name: sample.name)
            guard !isCancelled else { return }
            _ = try startNode(url: url, pitchCents: pitchCents)
            // Wait for the step duration (for sequencing pacing) but don't stop the note —
            // let it ring with natural piano decay. stopAllPlayers() silences everything
            // when the phase ends (before mic opens or on cancel).
            try await Task.sleep(nanoseconds: holdNanoseconds)
        } catch {
            print("[AudioPlayback] Error playing MIDI \(midi): \(error)")
        }
    }

    func playSequence(notes: [Int], bpm: Int = 100, durations: [Float]? = nil, onNoteStart: @escaping (Int) -> Void) async {
        for (i, midi) in notes.enumerated() {
            guard !isCancelled else { return }
            onNoteStart(midi)
            let beatDuration = durations?.indices.contains(i) == true ? durations![i] : 1.0
            let stepNanoseconds = UInt64(max(150.0, 60_000.0 / Double(max(1, bpm)) * Double(beatDuration))) * 1_000_000
            await playNote(midi: midi, holdNanoseconds: stepNanoseconds)
        }
    }

    /// Play multiple notes simultaneously.
    /// Downloads all samples first (usually cached), then fires all player nodes
    /// in a tight synchronous loop for near-simultaneous onset.
    func playChord(notes: [Int], holdMs: UInt64 = 600) async {
        guard !isCancelled else { return }
        // Download all samples in parallel so chord onset isn't delayed by sequential fetches.
        var results: [Int: (URL, Float)] = [:]
        await withTaskGroup(of: (Int, URL, Float)?.self) { group in
            for (i, midi) in notes.enumerated() {
                let sample = nearestSample(for: midi)
                let pitchCents = Float((midi - sample.midi) * 100)
                group.addTask { [weak self] in
                    guard let self else { return nil }
                    guard let url = try? await self.downloadIfNeeded(name: sample.name) else { return nil }
                    return (i, url, pitchCents)
                }
            }
            for await result in group {
                if let (i, url, cents) = result { results[i] = (url, cents) }
            }
        }
        guard !isCancelled else { return }
        // Start all notes with no awaits between them → simultaneous onset.
        for i in notes.indices {
            guard let (url, pitchCents) = results[i] else { continue }
            do {
                _ = try startNode(url: url, pitchCents: pitchCents)
            } catch {
                print("[AudioPlayback] Chord note error: \(error)")
            }
        }
        try? await Task.sleep(nanoseconds: holdMs * 1_000_000)
    }

    // MARK: - Pass/fail feedback tones

    // Plain synthesized sine tones (not the sampled piano) so they play instantly with
    // no network/sample-load dependency. notes: (midi, startMs, durationMs) triples.
    private let chimeSampleRate = 44100.0

    private func makeChimeBuffer(notes: [(midi: Int, startMs: Double, durationMs: Double)]) -> AVAudioPCMBuffer? {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: chimeSampleRate, channels: 1) else { return nil }
        let totalMs = (notes.map { $0.startMs + $0.durationMs }.max() ?? 0) + 20
        let totalSamples = AVAudioFrameCount(chimeSampleRate * totalMs / 1000.0)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalSamples),
              let data = buffer.floatChannelData?[0] else { return nil }
        buffer.frameLength = totalSamples
        for note in notes {
            let freq = 440.0 * pow(2.0, Double(note.midi - 69) / 12.0)
            let startSample = Int(chimeSampleRate * note.startMs / 1000.0)
            let numSamples = Int(chimeSampleRate * note.durationMs / 1000.0)
            let fadeSamples = min(numSamples / 3, Int(chimeSampleRate * 0.015))
            for i in 0..<numSamples {
                let idx = startSample + i
                guard idx < Int(totalSamples) else { break }
                // Quick linear fade in/out avoids the click a hard on/off edge would cause.
                let envelope: Float
                if i < fadeSamples { envelope = Float(i) / Float(fadeSamples) }
                else if i > numSamples - fadeSamples { envelope = Float(numSamples - i) / Float(fadeSamples) }
                else { envelope = 1.0 }
                let sample = Float(sin(2.0 * Double.pi * freq * Double(i) / chimeSampleRate)) * envelope * 0.3
                data[idx] += sample
            }
        }
        return buffer
    }

    private func playChime(notes: [(midi: Int, startMs: Double, durationMs: Double)]) {
        guard let buffer = makeChimeBuffer(notes: notes) else { return }
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: buffer.format)
        guard (try? ensureEngineRunning()) != nil else {
            engine.detach(player)
            return
        }
        player.scheduleBuffer(buffer, at: nil) { [weak self, weak player] in
            guard let self, let player else { return }
            Task { @MainActor [weak self, weak player] in
                guard let self, let player else { return }
                self.engine.detach(player)
            }
        }
        player.play()
    }

    /// Bright ascending major arpeggio (C6 E6 G6) — a test passed.
    func playPassSound() {
        playChime(notes: [(84, 0, 110), (88, 90, 110), (91, 180, 160)])
    }

    /// Soft descending major third (A4 F4) — a test failed. Lower register and a falling
    /// contour make it easy to tell apart from the pass chime by ear alone.
    func playFailSound() {
        playChime(notes: [(69, 0, 140), (65, 120, 220)])
    }
}

