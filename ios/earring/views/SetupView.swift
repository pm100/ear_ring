import SwiftUI

struct SetupView: View {
    @EnvironmentObject var model: ExerciseModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) var hsc

    @State private var concertMidi: Int = -1
    @State private var concertHistory: [Int] = []
    @State private var transpSemitones: Int = 0

    private var isIPad: Bool { hsc == .regular }
    private var staffHeight: CGFloat { isIPad ? 220 : 160 }
    private var meterSize: CGFloat { isIPad ? 130 : 90 }

    private var displayMidi: Int {
        concertMidi >= 0 ? min(127, max(0, concertMidi + transpSemitones)) : -1
    }
    private var displayHistory: [Int] {
        concertHistory.map { min(127, max(0, $0 + transpSemitones)) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Instruction text ──────────────────────────────────────────
            Spacer().frame(height: 24)
            Text("Play a note to test your microphone.")
                .font(.body)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            // ── Listening indicator ───────────────────────────────────────
            Spacer().frame(height: 16)
            HStack(spacing: 8) {
                Spacer()
                Text("👂")
                    .font(.system(size: 28))
                Text("Listening…")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(red: 0.247, green: 0.318, blue: 0.710))
                Spacer()
            }

            // ── Music staff ───────────────────────────────────────────────
            Spacer().frame(height: 16)
            MusicStaffView(
                notes: displayHistory.enumerated().map { index, midi in
                    StaffDisplayNote(
                        midi: midi,
                        state: index == displayHistory.count - 1 ? .active : .expected
                    )
                },
                fixedSpacing: 44,
                rootChroma: EarRingCore.effectiveKeyChroma(rootChroma: model.rootNote, scaleId: model.scaleId),
                keySignatureMode: model.keySignatureMode
            )
            .frame(height: staffHeight)

            // ── Large note name + Hz ──────────────────────────────────────
            Spacer().frame(height: 8)
            HStack {
                Spacer()
                VStack(spacing: 2) {
                    let label = displayMidi >= 0 ? MusicTheory.midiToLabel(displayMidi) : "—"
                    Text(label)
                        .font(.system(size: label.count >= 3 ? 56 : 72, weight: .bold))
                        .foregroundColor(displayMidi >= 0
                            ? Color(red: 0.247, green: 0.318, blue: 0.710)
                            : Color.secondary)
                    if displayMidi >= 0, let liveHz = approximateHz(midi: concertMidi) {
                        Text(String(format: "%.1f Hz", liveHz))
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                }
                Spacer()
            }

            // ── Pitch meter ───────────────────────────────────────────────
            Spacer().frame(height: 24)
            HStack {
                Spacer()
                PitchMeterView(midi: model.liveMidi, isActive: model.isCapturing)
                    .frame(width: meterSize, height: meterSize)
                Spacer()
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Color(.systemBackground))
        .onAppear {
            resetState()
            loadTransposition()
            Task { await model.startLivePitchDetection(warmup: 0) }
        }
        .onDisappear {
            model.stopLivePitchDetection()
            model.stopExerciseSession()
        }
        .onChange(of: model.confirmedNoteSeq) { _ in
            guard let midi = model.confirmedLiveMidi else { return }
            // Only display notes within the configured range on the Mic Setup staff.
            guard midi >= model.rangeStart && midi <= model.rangeEnd else { return }
            concertMidi = midi
            var h = concertHistory + [midi]
            if h.count > 8 { h.removeFirst() }
            concertHistory = h
        }
        .onChange(of: model.liveMidi) { midi in
            if midi == nil { concertMidi = -1 }
        }
        .onChange(of: model.instrumentIndex) { _ in
            loadTransposition()
        }
    }

    private func resetState() {
        concertMidi = -1
        concertHistory = []
    }

    private func loadTransposition() {
        guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
              let arr = json as? [[String: Any]],
              arr.indices.contains(model.instrumentIndex) else {
            transpSemitones = 0
            return
        }
        transpSemitones = (arr[model.instrumentIndex]["semitones"] as? Int) ?? 0
    }

    /// Approximate Hz from concert MIDI for display purposes.
    private func approximateHz(midi: Int) -> Double? {
        guard midi >= 0 else { return nil }
        return 440.0 * pow(2.0, Double(midi - 69) / 12.0)
    }
}

