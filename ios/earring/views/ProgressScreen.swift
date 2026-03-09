import SwiftUI

/// Named ProgressScreen to avoid conflict with SwiftUI's built-in ProgressView.
struct ProgressScreen: View {
    @EnvironmentObject var progressModel: ProgressModel

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {

                // Streak card
                HStack(spacing: 12) {
                    Text("🔥")
                        .font(.system(size: 40))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(progressModel.streak)")
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                        Text("session streak (≥80%)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
                .cardStyle()

                // Best by scale
                if !progressModel.bestByScale.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Best by Scale")
                            .font(.headline)

                        ForEach(
                            progressModel.bestByScale.sorted(by: { $0.value > $1.value }),
                            id: \.key
                        ) { scaleName, best in
                            HStack {
                                Text(scaleName)
                                    .font(.subheadline)
                                Spacer()
                                Text("\(best)%")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(best >= 80 ? .green : best >= 50 ? .orange : .red)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .cardStyle()
                }

                // Session history
                if progressModel.history.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "chart.bar.xaxis")
                            .font(.system(size: 44))
                            .foregroundColor(.secondary)
                        Text("No sessions yet")
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Session History")
                            .font(.headline)

                        ForEach(progressModel.history) { record in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("\(record.rootLabel) \(record.scaleName)")
                                        .font(.subheadline.weight(.medium))
                                    Text(Self.dateFormatter.string(from: record.date))
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                    Text("\(record.length) notes")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Text("\(record.score)%")
                                    .font(.headline)
                                    .foregroundColor(
                                        record.score >= 80 ? .green
                                        : record.score >= 50 ? .orange
                                        : .red)
                            }
                            .padding(.vertical, 6)
                            Divider()
                        }
                    }
                    .cardStyle()
                }

                Spacer(minLength: 30)
            }
            .padding(.horizontal)
            .padding(.top, 12)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Progress")
        .navigationBarTitleDisplayMode(.inline)
    }
}
