import SwiftUI

struct ResultsView: View {
    @EnvironmentObject var model: ExerciseModel
    @Binding var path: NavigationPath

    private var scorePercent: Int { model.score }

    private var scoreEmoji: String {
        if scorePercent == 100 { return "🏆" }
        if scorePercent >= 80  { return "🎉" }
        if scorePercent >= 50  { return "👍" }
        return "💪"
    }

    private var scoreColor: Color {
        if scorePercent >= 80 { return .erSuccess }
        if scorePercent >= 50 { return .erWarning }
        return .erError
    }

    private var exerciseLabel: String {
        "\(MusicTheory.midiToLabel(model.rootMidi)) \(MusicTheory.SCALE_NAMES[model.scaleId])"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {

                // ── Score header ──────────────────────────────────────────
                Spacer().frame(height: 32)
                VStack(spacing: 4) {
                    Text(scoreEmoji)
                        .font(.system(size: 64))
                    Text("\(scorePercent)%")
                        .font(.system(size: 56, weight: .bold))
                        .foregroundColor(scoreColor)
                    Text("Score")
                        .font(.title3)
                        .foregroundColor(.erMuted)
                    Spacer().frame(height: 8)
                    Text(exerciseLabel)
                        .font(.body)
                }
                .frame(maxWidth: .infinity)

                // ── Note by Note ──────────────────────────────────────────
                Spacer().frame(height: 24)
                Divider()
                Spacer().frame(height: 16)

                Text("Note by Note")
                    .font(.title3.weight(.semibold))

                Spacer().frame(height: 8)

                ForEach(Array(model.sequence.enumerated()), id: \.offset) { index, expectedMidi in
                    VStack(spacing: 0) {
                        HStack(spacing: 8) {
                            Text("\(index + 1).")
                                .font(.body)
                                .foregroundColor(.erMuted)
                                .frame(width: 24, alignment: .leading)

                            Text("Expected: \(MusicTheory.midiToLabel(expectedMidi))")
                                .font(.body)

                            Spacer()

                            if index < model.detectedNotes.count {
                                let d = model.detectedNotes[index]
                                Text("Played: \(MusicTheory.midiToLabel(d.midi))")
                                    .font(.body)
                                Text(d.isCorrect ? "✓" : "✗")
                                    .font(.body.weight(.bold))
                                    .foregroundColor(d.isCorrect ? .erSuccess : .erError)
                            } else {
                                Text("Played: —")
                                    .font(.body)
                                    .foregroundColor(.erMuted)
                                Text("—")
                                    .font(.body)
                                    .foregroundColor(.erMuted)
                            }
                        }
                        .padding(.vertical, 10)

                        Divider()
                            .foregroundColor(.erMuted.opacity(0.5))
                    }
                }

                // ── Action buttons ────────────────────────────────────────
                Spacer().frame(height: 28)
                VStack(spacing: 10) {
                    Button("🔄 Try Again") {
                        model.resetToIdle()
                        path.removeLast()
                    }
                    .buttonStyle(PrimaryButtonStyle(height: 52, fontSize: 17))

                    Button("🏠 New Exercise") {
                        model.newRound()
                        path = NavigationPath()
                    }
                    .buttonStyle(OutlinedButtonStyle(height: 48, fontSize: 16))
                }
                .padding(.bottom, 16)
            }
            .padding(.horizontal, 16)
        }
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Text("Results")
                    .font(.subheadline.weight(.semibold))
            }
        }
    }
}
