import SwiftUI

struct SetupView: View {
    @EnvironmentObject var model: ExerciseModel
    @Environment(\.dismiss) private var dismiss

    @State private var displayedMidi: Int = -1
    @State private var noteHistory: [Int] = []

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
                notes: noteHistory.enumerated().map { index, midi in
                    StaffDisplayNote(
                        midi: midi,
                        state: index == noteHistory.count - 1 ? .active : .expected
                    )
                },
                fixedSpacing: 44,
                rootChroma: model.rootNote,
                keySignatureMode: model.keySignatureMode
            )
            .frame(height: 160)

            // ── Large note name + Hz ──────────────────────────────────────
            Spacer().frame(height: 8)
            HStack {
                Spacer()
                VStack(spacing: 2) {
                    Text(displayedMidi >= 0 ? MusicTheory.midiToLabel(displayedMidi) : "—")
                        .font(.system(size: 72, weight: .bold))
                        .foregroundColor(displayedMidi >= 0
                            ? Color(red: 0.247, green: 0.318, blue: 0.710)
                            : Color.secondary)
                    if let hz = model.liveMidi.map({ _ in model.liveCents }), displayedMidi >= 0 {
                        let _ = hz // suppress unused warning
                        if let liveHz = approximateHz(midi: displayedMidi) {
                            Text(String(format: "%.1f Hz", liveHz))
                                .font(.body)
                                .foregroundColor(.secondary)
                        }
                    }
                }
                Spacer()
            }

            // ── Pitch meter ───────────────────────────────────────────────
            Spacer().frame(height: 24)
            HStack {
                Spacer()
                PitchMeterView(midi: model.liveMidi, isActive: model.isCapturing)
                    .frame(width: 90, height: 90)
                Spacer()
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Color(.systemBackground))
        .onAppear {
            resetState()
            Task { await model.startLivePitchDetection() }
        }
        .onDisappear {
            model.stopLivePitchDetection()
            model.stopExerciseSession()
        }
        .onChange(of: model.confirmedNoteSeq) { _ in
            guard let midi = model.confirmedLiveMidi else { return }
            // Only display notes within the configured range on the Mic Setup staff.
            guard midi >= model.rangeStart && midi <= model.rangeEnd else { return }
            displayedMidi = midi
            var h = noteHistory + [midi]
            if h.count > 8 { h.removeFirst() }
            noteHistory = h
        }
        .onChange(of: model.liveMidi) { midi in
            if midi == nil { displayedMidi = -1 }
        }
    }

    private func resetState() {
        displayedMidi = -1
        noteHistory = []
    }

    /// Approximate Hz from MIDI for display purposes.
    private func approximateHz(midi: Int) -> Double? {
        guard midi >= 0 else { return nil }
        return 440.0 * pow(2.0, Double(midi - 69) / 12.0)
    }
}

