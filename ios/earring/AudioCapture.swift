import AVFoundation

class AudioCapture: @unchecked Sendable {
    private var engine: AVAudioEngine?
    private(set) var isRunning: Bool = false

    /// Start capturing microphone audio.
    /// The `onAudio` closure is called on the AVAudioEngine's internal thread with each buffer of samples.
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

    /// Stop capturing and release all audio resources.
    func stop() {
        guard let engine = engine else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.engine = nil
        isRunning = false

        do {
            try AVAudioSession.sharedInstance().setActive(false,
                                                          options: .notifyOthersOnDeactivation)
        } catch {
            print("[AudioCapture] Session deactivation error: \(error)")
        }
    }
}
