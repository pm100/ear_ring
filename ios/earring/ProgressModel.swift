import Foundation

struct SessionRecord: Codable, Identifiable {
    var id: UUID
    var date: Date
    var scaleName: String
    var rootLabel: String
    var score: Int
    var length: Int
    var testsCompleted: Int
    /// Correlates to TestRecord.sessionId — links this session to its individual tests.
    /// Optional so older, already-persisted records (from before this field existed)
    /// decode fine and just show no drill-down detail.
    var sessionId: UUID? = nil
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
    /// Correlates to SessionRecord.sessionId — which session this test belongs to.
    var sessionId: UUID? = nil
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

    /// Upsert by sessionId: written after every test so an interrupted session is kept (issue #55).
    static func appendSession(_ record: SessionRecord) {
        var history = loadSessions()
        var record = record
        if let sid = record.sessionId, let i = history.firstIndex(where: { $0.sessionId == sid }) {
            record.date = history[i].date
            history.remove(at: i)
        }
        history.insert(record, at: 0)
        if let data = try? JSONEncoder().encode(Array(history.prefix(200))) {
            UserDefaults.standard.set(data, forKey: historyKey)
        }
    }

    /// Rebuilds a session record for any test whose session was never saved (the app was killed
    /// mid-session before issue #55's per-test save), so those tests show up in history (issue #55).
    static func reconcileSessions() {
        let sessions = loadSessions()
        let known = Set(sessions.compactMap(\.sessionId))
        let orphans = Dictionary(grouping: loadTests().filter { $0.sessionId != nil && !known.contains($0.sessionId!) },
                                 by: { $0.sessionId! })
        for (sid, group) in orphans {
            let first = group.min { $0.date < $1.date }!
            appendSession(SessionRecord(
                id: UUID(), date: first.date, scaleName: first.scaleName, rootLabel: first.rootLabel,
                score: group.map(\.score).reduce(0, +) / group.count, length: first.length,
                testsCompleted: group.count, sessionId: sid))
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

    /// Consecutive calendar days (in the device's local timezone) with one or more
    /// recorded sessions, independent of score — matching desktop's reference
    /// implementation. Multiple sessions on one day count once; a gap of even one
    /// day breaks the streak; today must have a session for the streak to be > 0.
    var streak: Int {
        let calendar = Calendar.current
        let days = Set(history.map { calendar.startOfDay(for: $0.date) }).sorted(by: >)
        var count = 0
        var expected = calendar.startOfDay(for: Date())
        for day in days {
            if day == expected {
                count += 1
                expected = calendar.date(byAdding: .day, value: -1, to: expected)!
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
        ProgressStore.reconcileSessions()
        history = ProgressStore.loadSessions()
        tests = ProgressStore.loadTests()
    }
}
