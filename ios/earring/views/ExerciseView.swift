import SwiftUI

struct ExerciseView: View {
    @EnvironmentObject var model: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel
    @Binding var path: NavigationPath

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {

                // Scale info
                VStack(spacing: 4) {
                    Text(MusicTheory.midiToLabel(model.rootMidi))
                        .font(.title2.bold())
                    Text(MusicTheory.SCALE_NAMES[model.scaleId])
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 8)

                // Music staff
                MusicStaffView(
                    expectedNotes: model.sequence,
                    detectedNotes: model.detectedNotes
                )
                .frame(height: 180)
                .cardStyle()

                // Status label
                statusText

                // Live pitch meter when listening
                if model.status == .listening {
                    PitchMeterView(midi: model.liveMidi, isActive: true)
                        .frame(width: 120, height: 120)
                }

                // Control buttons
                controlButtons
                    .padding(.bottom, 30)
            }
            .padding(.horizontal)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Exercise")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear {
            model.cleanup()
        }
    }

    // MARK: - Status text

    @ViewBuilder
    private var statusText: some View {
        Group {
            switch model.status {
            case .idle:
                Text("Press Play to hear the sequence")
            case .playing:
                Label("Playing sequence…", systemImage: "speaker.wave.2.fill")
                    .foregroundColor(.indigo)
            case .listening:
                Label("Sing or play the notes", systemImage: "mic.fill")
                    .foregroundColor(.green)
            case .done:
                let correct = model.detectedNotes.filter { $0.isCorrect }.count
                Text("Done — \(correct)/\(model.sequence.count) correct")
                    .foregroundColor(model.score == 100 ? .green : .orange)
            }
        }
        .font(.subheadline.weight(.medium))
    }

    // MARK: - Control buttons

    @ViewBuilder
    private var controlButtons: some View {
        switch model.status {
        case .idle:
            VStack(spacing: 12) {
                Button("Play Sequence") {
                    Task { await model.playSequence() }
                }
                .buttonStyle(PrimaryButtonStyle())

                Button("Start Listening") {
                    Task { await model.startListening() }
                }
                .buttonStyle(SecondaryButtonStyle())
            }

        case .playing:
            Button("Stop") {
                model.cancelPlayback()
            }
            .buttonStyle(SecondaryButtonStyle())

        case .listening:
            Button("Stop Listening") {
                model.stopListening()
            }
            .buttonStyle(SecondaryButtonStyle())

        case .done:
            if model.allCorrect {
                VStack(spacing: 12) {
                    Button("View Results") {
                        progressModel.addSession(
                            scaleName: MusicTheory.SCALE_NAMES[model.scaleId],
                            rootLabel: MusicTheory.midiToLabel(model.rootMidi),
                            score: model.score,
                            length: model.sequence.count
                        )
                        path.append(AppRoute.results)
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button("New Sequence") {
                        model.newRound()
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            } else {
                VStack(spacing: 12) {
                    Button("View Results") {
                        progressModel.addSession(
                            scaleName: MusicTheory.SCALE_NAMES[model.scaleId],
                            rootLabel: MusicTheory.midiToLabel(model.rootMidi),
                            score: model.score,
                            length: model.sequence.count
                        )
                        path.append(AppRoute.results)
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button("Replay Sequence") {
                        Task { await model.playSequence() }
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button("Try Again") {
                        Task { await model.retryExercise() }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
        }
    }
}
