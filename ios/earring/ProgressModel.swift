import Foundation

struct SessionRecord: Codable, Identifiable {
    var id: UUID
    var date: Date
    var scaleName: String
    var rootLabel: String
    var score: Int
    var length: Int
}

@MainActor
class ProgressModel: ObservableObject {
    @Published var history: [SessionRecord] = []

    private let historyKey = "earring_session_history"

    init() {
        load()
    }

    /// Number of consecutive most-recent sessions with score ≥ 80.
    var streak: Int {
        var count = 0
        for record in history.sorted(by: { $0.date > $1.date }) {
            if record.score >= 80 {
                count += 1
            } else {
                break
            }
        }
        return count
    }

    /// Best (highest) score per scale name.
    var bestByScale: [String: Int] {
        var result: [String: Int] = [:]
        for record in history {
            result[record.scaleName] = max(result[record.scaleName, default: 0], record.score)
        }
        return result
    }

    func addSession(scaleName: String, rootLabel: String, score: Int, length: Int) {
        let record = SessionRecord(
            id: UUID(),
            date: Date(),
            scaleName: scaleName,
            rootLabel: rootLabel,
            score: score,
            length: length
        )
        history.insert(record, at: 0)
        save()
    }

    private func save() {
        do {
            let data = try JSONEncoder().encode(history)
            UserDefaults.standard.set(data, forKey: historyKey)
        } catch {
            print("[ProgressModel] Save error: \(error)")
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: historyKey) else { return }
        do {
            history = try JSONDecoder().decode([SessionRecord].self, from: data)
        } catch {
            print("[ProgressModel] Load error: \(error)")
            history = []
        }
    }
}
