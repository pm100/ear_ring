import AVFoundation
import Foundation

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

    private var players: [AVAudioPlayer] = []
    private var isCancelled = false

    func cancelPlayback() {
        isCancelled = true
        players.forEach { $0.stop() }
        players.removeAll()
    }

    func resetCancellation() {
        isCancelled = false
    }

    // MARK: - Private helpers

    private func nearestSample(for midi: Int) -> (name: String, midi: Int) {
        return AudioPlayback.sampleMap.min(by: {
            abs($0.midi - midi) < abs($1.midi - midi)
        }) ?? ("A4", 69)
    }

    private func downloadIfNeeded(name: String) async throws -> URL {
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

    // MARK: - Public API

    func playNote(midi: Int) async {
        guard !isCancelled else { return }

        let sample = nearestSample(for: midi)
        let deltaSemitones = midi - sample.midi
        let rate = Float(pow(2.0, Double(deltaSemitones) / 12.0))

        do {
            let url = try await downloadIfNeeded(name: sample.name)
            guard !isCancelled else { return }

            let player = try AVAudioPlayer(contentsOf: url)
            // enableRate must be set before prepareToPlay
            player.enableRate = true
            player.prepareToPlay()
            player.rate = rate
            player.play()
            players.append(player)

            try await Task.sleep(nanoseconds: 600_000_000) // 600 ms gap

            players.removeAll { $0 === player }
        } catch {
            print("[AudioPlayback] Error playing MIDI \(midi): \(error)")
        }
    }

    func playSequence(notes: [Int], onNoteStart: @escaping (Int) -> Void) async {
        for midi in notes {
            guard !isCancelled else { return }
            onNoteStart(midi)
            await playNote(midi: midi)
        }
    }
}
