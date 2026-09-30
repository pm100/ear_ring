import Foundation

struct AssistantItem {
    let key: String
    let label: String
    let from: String
    let to: String
    let action: [String: Any]
}

struct AssistantCard {
    let items: [AssistantItem]
    let rejected: [(key: String, reason: String)]
}

/// What the chat shows for one round trip: the Rust core's `resolve_outcome_json`, parsed.
struct AssistantView {
    let reply: String
    let card: AssistantCard?
    /// Kept so the proposal can be re-validated against current settings when Apply is tapped.
    let proposalJson: String?
    let feedbackSent: Bool
    let remaining: Int?
    let isError: Bool
}

/// The setup assistant's network round trip. The rules (request body, HTTP status handling, which
/// proposed changes are valid) live in the Rust core; this only moves strings between Rust and
/// the proxy.
enum AssistantClient {
    private static let installIdKey = "assistantInstallId"
    private static let fallbackError = "Something went wrong. Please try again."

    /// A random id, created on first use, that lets the proxy count questions per install.
    static func installId() -> String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: installIdKey) { return existing }
        let created = UUID().uuidString.lowercased()
        defaults.set(created, forKey: installIdKey)
        return created
    }

    /// Sends the conversation to the proxy and returns what to show. Never throws.
    static func ask(history: [(role: String, text: String)], settingsJson: String, isPremium: Bool) async -> AssistantView {
        var status = 0 // the core reads 0 as "couldn't reach the assistant"
        var body = ""
        let turns = history.map { ["role": $0.role, "text": $0.text] }
        let requestBody = EarRingCore.assistantRequest(
            history: jsonString(turns) ?? "[]", settings: settingsJson, isPremium: isPremium)
        if let url = URL(string: EarRingCore.assistantEndpoint()) {
            var request = URLRequest(url: url, timeoutInterval: 30)
            request.httpMethod = "POST"
            request.httpBody = Data(requestBody.utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(installId(), forHTTPHeaderField: "X-Install-Id")
            request.setValue("ios", forHTTPHeaderField: "X-Client")
            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                status = (response as? HTTPURLResponse)?.statusCode ?? 0
                body = String(data: data, encoding: .utf8) ?? ""
            } catch {
                status = 0
            }
        }
        return parseView(EarRingCore.assistantResolveOutcome(
            status: status, body: body, settings: settingsJson, isPremium: isPremium))
    }

    /// Re-validates `proposalJson` against the settings as they are now (they may have changed
    /// since it was proposed). Its items' actions are what to dispatch, in order.
    static func resolveProposal(_ proposalJson: String, settingsJson: String, isPremium: Bool) -> AssistantCard {
        parseCard(object(EarRingCore.assistantResolveProposal(proposalJson, settings: settingsJson, isPremium: isPremium)) ?? [:])
    }

    static func parseView(_ json: String) -> AssistantView {
        guard let o = object(json) else {
            return AssistantView(reply: fallbackError, card: nil, proposalJson: nil, feedbackSent: false, remaining: nil, isError: true)
        }
        return AssistantView(
            reply: o["reply"] as? String ?? fallbackError,
            card: (o["card"] as? [String: Any]).map(parseCard),
            proposalJson: (o["proposal"] as? [Any]).flatMap(jsonString),
            feedbackSent: o["feedbackSent"] as? Bool ?? false,
            remaining: (o["quota"] as? [String: Any])?["remaining"] as? Int,
            isError: o["isError"] as? Bool ?? false)
    }

    static func parseCard(_ o: [String: Any]) -> AssistantCard {
        let items: [AssistantItem] = (o["items"] as? [[String: Any]] ?? []).compactMap { item in
            guard let key = item["key"] as? String, let label = item["label"] as? String,
                  let from = item["from"] as? String, let to = item["to"] as? String,
                  let action = item["action"] as? [String: Any] else { return nil }
            return AssistantItem(key: key, label: label, from: from, to: to, action: action)
        }
        let rejected: [(key: String, reason: String)] = (o["rejected"] as? [[String: Any]] ?? []).compactMap { r in
            guard let key = r["key"] as? String, let reason = r["reason"] as? String else { return nil }
            return (key: key, reason: reason)
        }
        return AssistantCard(items: items, rejected: rejected)
    }

    private static func object(_ json: String) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any]
    }

    private static func jsonString(_ value: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
