import SwiftUI

/// Named ProgressScreen to avoid conflict with SwiftUI's built-in ProgressView.
struct ProgressScreen: View {
    @EnvironmentObject var progressModel: ProgressModel
    @Environment(\.dismiss) private var dismiss
    @State private var showClearConfirm = false

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {

                // ── Streak card ───────────────────────────────────────────
                Spacer().frame(height: 16)
                HStack(spacing: 16) {
                    Text("🔥")
                        .font(.system(size: 48))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(progressModel.streak) day streak")
                            .font(.system(size: 28, weight: .bold))
                        Text("consecutive days with a session")
                            .font(.caption)
                            .foregroundColor(.erMuted)
                    }
                    Spacer()
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.secondarySystemBackground))
                )

                Spacer().frame(height: 12)
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(progressModel.tests.count) recorded tests")
                            .font(.system(size: 22, weight: .bold))
                        Text("Average test score \(progressModel.averageTestScore)%")
                            .font(.caption)
                            .foregroundColor(.erMuted)
                    }
                    Spacer()
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.secondarySystemBackground))
                )

                // ── Session history ───────────────────────────────────────
                Spacer().frame(height: 24)

                if progressModel.history.isEmpty {
                    Text("No sessions yet. Complete an exercise to see your progress!")
                        .font(.body)
                        .foregroundColor(.erMuted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                        .multilineTextAlignment(.center)
                } else {
                    Text("Session History")
                        .font(.title3.weight(.semibold))
                    Spacer().frame(height: 12)

                    ForEach(progressModel.history) { record in
                        VStack(spacing: 0) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(record.rootLabel) \(record.scaleName)")
                                        .font(.body.weight(.medium))
                                    Text(Self.dateFormatter.string(from: record.date))
                                        .font(.caption)
                                        .foregroundColor(.erMuted)
                                    Text("\(record.length) notes")
                                        .font(.caption)
                                        .foregroundColor(.erMuted)
                                }
                                Spacer()
                                Text("\(record.score)%")
                                    .font(.headline)
                                    .foregroundColor(
                                        record.score >= 80 ? .erSuccess
                                        : record.score >= 50 ? .erWarning
                                        : .erError)
                            }
                            .padding(.vertical, 10)
                            Divider()
                        }
                    }
                }

                Spacer().frame(height: 24)
                Text("Recent Tests")
                    .font(.title3.weight(.semibold))
                Spacer().frame(height: 12)

                if progressModel.tests.isEmpty {
                    Text("No tests recorded yet.")
                        .font(.body)
                        .foregroundColor(.erMuted)
                } else {
                    ForEach(progressModel.tests.prefix(10)) { record in
                        VStack(spacing: 0) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(record.rootLabel) \(record.scaleName)")
                                        .font(.body.weight(.medium))
                                    Text(Self.dateFormatter.string(from: record.date))
                                        .font(.caption)
                                        .foregroundColor(.erMuted)
                                    Text(record.passed ? "Passed in \(record.attemptsUsed)/\(record.maxAttempts) tries" : "Failed after \(record.maxAttempts) tries")
                                        .font(.caption)
                                        .foregroundColor(.erMuted)
                                }
                                Spacer()
                                Text("\(record.score)%")
                                    .font(.headline)
                                    .foregroundColor(
                                        record.score >= 80 ? .erSuccess
                                        : record.score >= 50 ? .erWarning
                                        : .erError)
                            }
                            .padding(.vertical, 10)
                            Divider()
                        }
                    }
                }

                Spacer().frame(height: 24)

                Button(action: { showClearConfirm = true }) {
                    Text("Clear All Progress")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .alert("Clear All Progress?", isPresented: $showClearConfirm) {
                    Button("Clear", role: .destructive) { progressModel.clearAllProgress() }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("This will permanently delete all session history and test records. This cannot be undone.")
                }

                Spacer().frame(height: 16)
            }
            .padding(.horizontal, 16)
        }
        .background(Color(.systemBackground))
        .onAppear { progressModel.reload() }
    }
}
