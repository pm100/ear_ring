import SwiftUI

struct SetupView: View {
    @EnvironmentObject var model: ExerciseModel
    @Environment(\.dismiss) private var dismiss

    // Pitch display stability: 3 consecutive frames with same pitch class
    @State private var displayedNote: String = "—"
    @State private var displayedHz: String? = nil
    @State private var displayedMidi: Int = -1
    @State private var noteHistory: [Int] = []
    @State private var stabilityPitchClass: Int = -1
    @State private var stabilityCount: Int = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Instruction text ──────────────────────────────────────────
            Spacer().frame(height: 24)
            Text("Sing or play a note to test your microphone.")
                .font(.body)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            // ── Music staff ───────────────────────────────────────────────
            Spacer().frame(height: 16)
            MusicStaffView(
                expectedNotes: noteHistory,
                detectedNotes: [],
                currentNoteIndex: noteHistory.count - 1
            )
            .frame(height: 160)

            // ── Large note display ────────────────────────────────────────
            Spacer().frame(height: 8)
            VStack(spacing: 4) {
                Text(displayedNote)
                    .font(.system(size: 72, weight: .bold))
                    .foregroundColor(displayedNote == "—" ? .erMuted : .erPrimary)
                    .frame(maxWidth: .infinity)

                if let hz = displayedHz {
                    Text(hz)
                        .font(.body)
                        .foregroundColor(.erMuted)
                }
            }

            // ── Pitch meter ───────────────────────────────────────────────
            Spacer().frame(height: 24)
            HStack {
                Spacer()
                PitchMeterView(midi: model.liveMidi, isActive: model.isCapturing)
                    .frame(width: 90, height: 90)
                Spacer()
            }

            // ── Start / Stop button ───────────────────────────────────────
            Spacer().frame(height: 32)
            if model.isCapturing {
                Button("⏹ Stop") {
                    model.stopLivePitchDetection()
                    resetStabilityState()
                }
                .buttonStyle(ErrorButtonStyle(height: 52, fontSize: 17))
            } else {
                Button("🎙 Start Listening") {
                    resetStabilityState()
                    Task { await model.startLivePitchDetection() }
                }
                .buttonStyle(PrimaryButtonStyle(height: 52, fontSize: 17))
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Color(.systemBackground))
        .navigationBarBackButtonHidden(true)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("← Back") {
                    model.stopLivePitchDetection()
                    dismiss()
                }
                .foregroundColor(.erPrimary)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Text("Mic Setup")
                    .font(.subheadline.weight(.semibold))
            }
        }
        .onDisappear {
            model.stopLivePitchDetection()
            model.cancelPlayback()
        }
        .onChange(of: model.liveFrameCount) { _ in
            updateStability()
        }
    }

    private func updateStability() {
        guard let midi = model.liveMidi else {
            resetStabilityState()
            return
        }
        let pc = midi % 12
        if pc == stabilityPitchClass {
            stabilityCount += 1
            if stabilityCount >= 3 {
                let isNewNote = midi != displayedMidi
                displayedNote = MusicTheory.midiToLabel(midi)
                let hz = 440.0 * pow(2.0, Double(midi - 69) / 12.0)
                displayedHz = String(format: "%.1f Hz", hz)
                displayedMidi = midi
                // Add to rolling history when note changes
                if isNewNote {
                    var h = noteHistory + [midi]
                    if h.count > 8 { h.removeFirst() }
                    noteHistory = h
                }
            }
        } else {
            stabilityPitchClass = pc
            stabilityCount = 1
        }
    }

    private func resetStabilityState() {
        stabilityPitchClass = -1
        stabilityCount = 0
        displayedNote = "—"
        displayedHz = nil
        displayedMidi = -1
        noteHistory = []
    }
}
