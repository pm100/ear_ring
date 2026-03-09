import SwiftUI

struct ResultsView: View {
    @EnvironmentObject var model: ExerciseModel
    @Binding var path: NavigationPath

    private var scoreColor: Color {
        if model.score >= 80 { return .green }
        if model.score >= 50 { return .orange }
        return .red
    }

    private var correctCount: Int {
        model.detectedNotes.filter { $0.isCorrect }.count
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {

                // Score circle
                ZStack {
                    Circle()
                        .strokeBorder(scoreColor.opacity(0.2), lineWidth: 12)
                    Circle()
                        .trim(from: 0, to: CGFloat(model.score) / 100)
                        .stroke(scoreColor, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 4) {
                        Text("\(model.score)%")
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .foregroundColor(scoreColor)
                        Text("Score")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(width: 160, height: 160)
                .padding(.top, 20)

                Text("Correct: \(correctCount)/\(model.sequence.count) notes")
                    .font(.headline)
                    .foregroundColor(.secondary)

                // Note-by-note breakdown
                VStack(alignment: .leading, spacing: 0) {
                    Text("Note Breakdown")
                        .font(.headline)
                        .padding(.bottom, 8)

                    ForEach(Array(model.sequence.enumerated()), id: \.offset) { index, expectedMidi in
                        HStack {
                            Text("#\(index + 1)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .frame(width: 28, alignment: .leading)

                            Text(MusicTheory.midiToLabel(expectedMidi))
                                .font(.body.weight(.medium))

                            Spacer()

                            if index < model.detectedNotes.count {
                                let detected = model.detectedNotes[index]
                                Text(MusicTheory.midiToLabel(detected.midi))
                                    .font(.body)
                                    .foregroundColor(detected.isCorrect ? .green : .red)
                                Image(systemName: detected.isCorrect
                                      ? "checkmark.circle.fill"
                                      : "xmark.circle.fill")
                                    .foregroundColor(detected.isCorrect ? .green : .red)
                            } else {
                                Text("—")
                                    .foregroundColor(.secondary)
                                Image(systemName: "circle")
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 10)

                        if index < model.sequence.count - 1 {
                            Divider()
                        }
                    }
                }
                .cardStyle()

                // Action buttons
                VStack(spacing: 12) {
                    Button("New Exercise") {
                        model.newRound()
                        path = NavigationPath()
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button("View Progress") {
                        path.append(AppRoute.progress)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                .padding(.bottom, 30)
            }
            .padding(.horizontal)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Results")
        .navigationBarTitleDisplayMode(.inline)
    }
}
