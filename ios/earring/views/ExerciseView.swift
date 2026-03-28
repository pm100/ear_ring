import SwiftUI
import UIKit

struct ExerciseView: View {
    @EnvironmentObject var model: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel
    @Binding var path: NavigationPath

    private var staffNotes: [StaffDisplayNote] {
        if model.showTestNotes {
            return model.sequence.enumerated().map { index, expectedMidi in
                if index < model.detectedNotes.count {
                    let detected = model.detectedNotes[index]
                    return StaffDisplayNote(
                        midi: detected.isCorrect ? expectedMidi : detected.midi,
                        state: detected.isCorrect ? .correct : .incorrect
                    )
                }
                return StaffDisplayNote(midi: expectedMidi, state: .expected)
            }
        }
        return model.detectedNotes.map {
            StaffDisplayNote(midi: $0.midi, state: $0.isCorrect ? .correct : .incorrect)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 8)
            MusicStaffView(
                notes: staffNotes,
                fixedSpacing: 44,
                rootChroma: model.rootNote,
                keySignatureMode: model.keySignatureMode
            )
            .frame(height: 160)

            Spacer().frame(height: 12)
            Text(statusMessage)
                .font(.body)
                .foregroundColor(.erMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            Spacer().frame(height: 8)
            Text("Attempt \(model.currentAttempt) of \(model.maxAttempts)  •  Tests \(model.testsCompleted)  •  Score \(model.score)%")
                .font(.subheadline)
                .foregroundColor(.erMuted)
                .frame(maxWidth: .infinity)

            Spacer().frame(height: 16)
            HStack {
                Spacer()
                PitchMeterView(midi: model.liveMidi, isActive: model.status == .listening)
                    .frame(width: 90, height: 90)
                Spacer()
            }

            Spacer().frame(height: 24)
            Button("⏹ Stop Testing") {
                model.stopExerciseSession()
                progressModel.reload()
                path = NavigationPath()
            }
            .buttonStyle(ErrorButtonStyle(height: 52, fontSize: 17))

            if !model.detectedNotes.isEmpty {
                Spacer().frame(height: 20)
                Text("Current attempt")
                    .font(.caption)
                    .foregroundColor(.erMuted)
                Spacer().frame(height: 4)
                HStack(spacing: 10) {
                    ForEach(Array(model.detectedNotes.enumerated()), id: \.offset) { _, note in
                        Text(MusicTheory.midiToLabel(note.midi))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(note.isCorrect ? .erSuccess : .erError)
                    }
                }
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Text("\(model.rangeLabel) \(MusicTheory.SCALE_NAMES[model.scaleId])")
                    .font(.subheadline.weight(.semibold))
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            if model.isSessionRunning {
                model.stopExerciseSession()
                progressModel.reload()
            }
        }
    }

    private var statusMessage: String {
        switch model.status {
        case .playing:
            return "Listen carefully…"
        case .listening:
            return "Play note \(model.currentNoteIndex + 1) of \(model.sequence.count)"
        case .retryDelay:
            if model.detectedNotes.last?.isCorrect == false && model.currentAttempt < model.maxAttempts {
                return "Wrong note. Replaying the same test…"
            }
            return "Starting the next test…"
        case .stopped:
            return "Testing stopped"
        }
    }
}
