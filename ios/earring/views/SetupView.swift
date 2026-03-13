import SwiftUI

struct SetupView: View {
    @EnvironmentObject var model: ExerciseModel
    @Environment(\.dismiss) private var dismiss

    // Pitch display stability: 3 consecutive frames with same pitch class
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
                notes: noteHistory.enumerated().map { index, midi in
                    StaffDisplayNote(
                        midi: midi,
                        state: index == noteHistory.count - 1 ? .active : .expected
                    )
                },
                fixedSpacing: 44
            )
            .frame(height: 160)

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
            // Silence: reset stability counters but keep note history visible
            stabilityPitchClass = -1
            stabilityCount = 0
            return
        }
        let pc = midi % 12
        if pc == stabilityPitchClass {
            stabilityCount += 1
            if stabilityCount >= 3 {
                let octave = model.rootMidi / 12 - 1
                let midiMin = (octave + 1) * 12
                let midiMax = midiMin + 23
                guard midi >= midiMin && midi <= midiMax else { return }
                let isNewNote = midi != displayedMidi
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
        displayedMidi = -1
        noteHistory = []
    }
}
