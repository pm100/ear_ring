import Foundation

struct SessionRecord: Codable, Identifiable {
    var id: UUID
    var date: Date
    var scaleName: String
    var rootLabel: String
    var score: Int
    var length: Int
    var testsCompleted: Int
}

struct TestRecord: Codable, Identifiable {
    var id: UUID
    var date: Date
    var scaleName: String
    var rootLabel: String
    var score: Int
    var attemptsUsed: Int
    var maxAttempts: Int
    var passed: Bool
    var length: Int
    var expectedNotes: [String]
    var detectedNotes: [String]
}

enum ProgressStore {
    private static let historyKey = "earring_session_history"
    private static let testsKey = "earring_test_history"

    static func loadSessions() -> [SessionRecord] {
        guard let data = UserDefaults.standard.data(forKey: historyKey) else { return [] }
        return (try? JSONDecoder().decode([SessionRecord].self, from: data)) ?? []
    }

    static func loadTests() -> [TestRecord] {
        guard let data = UserDefaults.standard.data(forKey: testsKey) else { return [] }
        return (try? JSONDecoder().decode([TestRecord].self, from: data)) ?? []
    }

    static func appendSession(_ record: SessionRecord) {
        var history = loadSessions()
        history.insert(record, at: 0)
        if let data = try? JSONEncoder().encode(Array(history.prefix(200))) {
            UserDefaults.standard.set(data, forKey: historyKey)
        }
    }

    static func appendTest(_ record: TestRecord) {
        var tests = loadTests()
        tests.insert(record, at: 0)
        if let data = try? JSONEncoder().encode(Array(tests.prefix(500))) {
            UserDefaults.standard.set(data, forKey: testsKey)
        }
    }
    static func clearAll() {
        UserDefaults.standard.removeObject(forKey: historyKey)
        UserDefaults.standard.removeObject(forKey: testsKey)
    }
}

@MainActor
class ProgressModel: ObservableObject {
    @Published var history: [SessionRecord] = []
    @Published var tests: [TestRecord] = []

    init() {
        load()
    }

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

    var bestByScale: [String: Int] {
        var result: [String: Int] = [:]
        for record in history {
            result[record.scaleName] = max(result[record.scaleName, default: 0], record.score)
        }
        return result
    }

    var averageTestScore: Int {
        guard !tests.isEmpty else { return 0 }
        return Int(Double(tests.map(\.score).reduce(0, +)) / Double(tests.count))
    }

    func reload() {
        load()
    }

    func clearAllProgress() {
        ProgressStore.clearAll()
        load()
    }

    private func load() {
        history = ProgressStore.loadSessions()
        tests = ProgressStore.loadTests()
    }
}
