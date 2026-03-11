import SwiftUI

/// Named ProgressScreen to avoid conflict with SwiftUI's built-in ProgressView.
struct ProgressScreen: View {
    @EnvironmentObject var progressModel: ProgressModel
    @Environment(\.dismiss) private var dismiss

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

                Spacer().frame(height: 16)
            }
            .padding(.horizontal, 16)
        }
        .background(Color(.systemBackground))
        .navigationBarBackButtonHidden(true)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("← Back") { dismiss() }
                    .foregroundColor(.erPrimary)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Text("Progress")
                    .font(.subheadline.weight(.semibold))
            }
        }
    }
}
