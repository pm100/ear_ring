import AVFoundation

class AudioCapture: @unchecked Sendable {
    private var engine: AVAudioEngine?
    private(set) var isRunning: Bool = false

    /// Start capturing microphone audio.
    /// Switches the shared session to .playAndRecord + .measurement for clean
    /// pitch detection (same as the Mic Setup screen). Keeps .playAndRecord
    /// throughout so playback can resume without a full category switch.
    func start(onAudio: @escaping (_ samples: [Float], _ sampleRate: UInt32) -> Void) async {
        guard !isRunning else { return }

        let granted = await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }

        guard granted else {
            print("[AudioCapture] Microphone permission denied")
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord,
                                    mode: .measurement,
                                    options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            print("[AudioCapture] AVAudioSession setup error: \(error)")
            return
        }

        let engine = AVAudioEngine()
        self.engine = engine

        let inputNode = engine.inputNode
        // Use the native hardware format to avoid format-mismatch errors.
        let nativeFormat = inputNode.inputFormat(forBus: 0)
        let actualSampleRate = UInt32(nativeFormat.sampleRate)

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: nativeFormat) { buffer, _ in
            guard let channelData = buffer.floatChannelData else { return }
            let frameCount = Int(buffer.frameLength)
            let samples = Array(UnsafeBufferPointer(start: channelData[0], count: frameCount))
            onAudio(samples, actualSampleRate)
        }

        do {
            try engine.start()
            isRunning = true
        } catch {
            print("[AudioCapture] AVAudioEngine start error: \(error)")
            inputNode.removeTap(onBus: 0)
            self.engine = nil
        }
    }

    /// Stop capturing. Keeps the audio session active in .playAndRecord so the
    /// next capture/playback cycle doesn't need to re-acquire hardware. The session
    /// stays in .measurement mode — AVAudioUnitTimePitch playback is unaffected by
    /// the input-processing mode, and avoiding the mode switch eliminates transient
    /// noise when capture restarts.
    func stop() {
        guard let engine = engine else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.engine = nil
        isRunning = false
        // Intentionally NOT deactivating the session or switching mode.
        // Deactivating releases audio hardware; re-acquiring it on the next cycle
        // is slow and produces transient noise that warmup frames may not absorb.
    }
}
