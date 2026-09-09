import SwiftUI

/// Named ProgressScreen to avoid conflict with SwiftUI's built-in ProgressView.
struct ProgressScreen: View {
    @EnvironmentObject var progressModel: ProgressModel
    @Environment(\.dismiss) private var dismiss
    @State private var showClearConfirm = false
    // Drill-down: tapping a session shows just that session's individual test records
    // instead of a separate always-visible "Recent Tests" list.
    @State private var selectedSession: SessionRecord? = nil

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        Group {
            if let session = selectedSession {
                sessionDetail(session)
            } else {
                sessionList
            }
        }
        .background(Color(.systemBackground))
        .onAppear { progressModel.reload() }
    }

    private var sessionList: some View {
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
                            .foregroundColor(.erCaption)
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
                            .foregroundColor(.erCaption)
                    }
                    Spacer()
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.secondarySystemBackground))
                )

                // ── Session history — tap a session to see its individual test details ──
                Spacer().frame(height: 24)

                if progressModel.history.isEmpty {
                    Text("No sessions yet. Complete an exercise to see your progress!")
                        .font(.body)
                        .foregroundColor(.erCaption)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                        .multilineTextAlignment(.center)
                } else {
                    Text("Session History")
                        .font(.title3.weight(.semibold))
                    Spacer().frame(height: 12)

                    ForEach(progressModel.history) { record in
                        Button(action: { selectedSession = record }) {
                            VStack(spacing: 0) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("\(record.rootLabel) \(record.scaleName)")
                                            .font(.body.weight(.medium))
                                        Text("\(Self.dateFormatter.string(from: record.date))  •  \(record.testsCompleted) tests  •  \(record.length) notes")
                                            .font(.caption)
                                            .foregroundColor(.erCaption)
                                    }
                                    Spacer()
                                    Text("\(record.score)%")
                                        .font(.headline)
                                        .foregroundColor(
                                            record.score >= 80 ? .erSuccess
                                            : record.score >= 50 ? .erWarning
                                            : .erError)
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(.erMuted)
                                }
                                .padding(.vertical, 10)
                                Divider()
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .foregroundColor(.primary)
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
    }

    private func sessionDetail(_ session: SessionRecord) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 16)
                HStack(alignment: .center, spacing: 8) {
                    Button(action: { selectedSession = nil }) {
                        Image(systemName: "chevron.left")
                            .font(.body.weight(.semibold))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(session.rootLabel) \(session.scaleName)")
                            .font(.title3.weight(.bold))
                        Text(Self.dateFormatter.string(from: session.date))
                            .font(.caption)
                            .foregroundColor(.erCaption)
                    }
                    Spacer()
                }

                Spacer().frame(height: 16)

                let sessionTests = progressModel.tests.filter { $0.sessionId != nil && $0.sessionId == session.sessionId }
                if sessionTests.isEmpty {
                    Text("No individual test details recorded for this session.")
                        .font(.body)
                        .foregroundColor(.erCaption)
                } else {
                    ForEach(sessionTests) { record in
                        VStack(spacing: 0) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(record.rootLabel) \(record.scaleName)")
                                        .font(.body.weight(.medium))
                                    Text(Self.dateFormatter.string(from: record.date))
                                        .font(.caption)
                                        .foregroundColor(.erCaption)
                                    Text(record.passed ? "Passed in \(record.attemptsUsed)/\(record.maxAttempts) tries" : "Failed after \(record.maxAttempts) tries")
                                        .font(.caption)
                                        .foregroundColor(.erCaption)
                                    Text("Expected: \(record.expectedNotes.joined(separator: ", "))")
                                        .font(.caption)
                                    Text("Detected: \(record.detectedNotes.joined(separator: ", "))")
                                        .font(.caption)
                                        .foregroundColor(.erCaption)
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

                Spacer().frame(height: 16)
            }
            .padding(.horizontal, 16)
        }
    }
}
