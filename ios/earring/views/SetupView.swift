import SwiftUI

struct SetupView: View {
    @EnvironmentObject var model: ExerciseModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {

                // Instructions
                VStack(spacing: 8) {
                    Image(systemName: "mic.circle.fill")
                        .font(.system(size: 50))
                        .foregroundColor(.indigo)
                    Text("Microphone Test")
                        .font(.title2.bold())
                    Text("Sing or play a note to see it detected on the staff.")
                        .multilineTextAlignment(.center)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 16)

                // Live pitch meter
                PitchMeterView(midi: model.liveMidi, isActive: model.isCapturing)
                    .frame(width: 140, height: 140)

                // Live staff showing detected note
                MusicStaffView(
                    expectedNotes: model.liveMidi.map { [$0] } ?? [],
                    detectedNotes: []
                )
                .frame(height: 160)
                .cardStyle()

                // Start / stop toggle
                Button(model.isCapturing ? "Stop Listening" : "Start Listening") {
                    if model.isCapturing {
                        model.stopLivePitchDetection()
                    } else {
                        Task { await model.startLivePitchDetection() }
                    }
                }
                .buttonStyle(model.isCapturing ? SecondaryButtonStyle() : PrimaryButtonStyle())

                // Test notes
                VStack(alignment: .leading, spacing: 12) {
                    Text("Test Notes")
                        .font(.headline)
                    HStack(spacing: 10) {
                        ForEach([(60, "C4"), (64, "E4"), (67, "G4"), (69, "A4"), (72, "C5")],
                                id: \.0) { midi, label in
                            Button(label) {
                                Task { await model.playTestNote(midi: midi) }
                            }
                            .buttonStyle(ChipButtonStyle(selected: false))
                        }
                    }
                }
                .cardStyle()
            }
            .padding(.horizontal)
            .padding(.bottom, 30)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Mic Setup")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task { await model.startLivePitchDetection() }
        }
        .onDisappear {
            model.stopLivePitchDetection()
            model.cancelPlayback()
        }
    }
}
