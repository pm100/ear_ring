import SwiftUI

private struct ChatEntry: Identifiable {
    enum CardState { case pending, applied, dismissed }

    let id: Int
    let role: String
    let text: String
    var card: AssistantCard? = nil
    var proposalJson: String? = nil
    var cardState: CardState? = nil
    var appliedCount = 0
    var feedbackSent = false
    var isError = false
}

/// "Ask about setup" chat at the top of Help. The transcript lives only in this view, so it is
/// discarded when the user leaves the screen. Nothing changes until Apply is tapped.
struct AssistantChatView: View {
    @EnvironmentObject var model: ExerciseModel
    @State private var entries: [ChatEntry] = []
    @State private var input = ""
    @State private var busy = false
    @State private var remaining: Int? = nil
    @State private var nextId = 1
    @State private var session = 0

    private let maxInputChars = 500

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ask about setup")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.erPrimary)
                .padding(.top, 16)
            Text("Describe what you want, e.g. \u{201C}I want a chance to correct a wrong note\u{201D}. Your question and current settings are sent to a server to get an answer.")
                .font(.footnote)
                .foregroundColor(.secondary)

            ForEach(entries) { entry in
                bubble(entry)
            }

            if entries.last?.isError == true && !busy {
                Button("Try again") { ask(entries.filter { !$0.isError }) }
                    .buttonStyle(.bordered)
            }
            if busy {
                Text("Thinking\u{2026}").font(.footnote).foregroundColor(.secondary)
            }

            HStack(spacing: 8) {
                TextField("Ask how to set something up", text: $input)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .onChange(of: input) { newValue in
                        if newValue.count > maxInputChars { input = String(newValue.prefix(maxInputChars)) }
                    }
                Button("Send", action: send)
                    .buttonStyle(.borderedProminent)
                    .disabled(busy || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if let remaining {
                Text("\(remaining) question\(remaining == 1 ? "" : "s") left today")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .onDisappear(perform: reset)
    }

    // MARK: Actions

    /// A TabView keeps this view alive across tab switches, so clear the conversation explicitly
    /// when the user leaves; bumping `session` makes a reply still in flight get dropped.
    private func reset() {
        entries = []
        input = ""
        remaining = nil
        busy = false
        session += 1
    }

    private func takeId() -> Int {
        defer { nextId += 1 }
        return nextId
    }

    private func send() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        input = ""
        ask(entries + [ChatEntry(id: takeId(), role: "user", text: text)])
    }

    private func ask(_ transcript: [ChatEntry]) {
        busy = true
        let history = transcript.filter { !$0.isError }.map { (role: $0.role, text: $0.text) }
        let settings = model.assistantSettingsJson
        let premium = model.isPremium
        let startedIn = session
        Task { @MainActor in
            let view = await AssistantClient.ask(history: history, settingsJson: settings, isPremium: premium)
            guard startedIn == session else { return }
            if let left = view.remaining { remaining = left }
            entries = transcript + [ChatEntry(
                id: takeId(), role: "assistant", text: view.reply, card: view.card,
                proposalJson: view.proposalJson, cardState: view.card == nil ? nil : .pending,
                feedbackSent: view.feedbackSent, isError: view.isError)]
            busy = false
        }
    }

    private func apply(_ entry: ChatEntry) {
        guard let proposal = entry.proposalJson else { return }
        let card = AssistantClient.resolveProposal(proposal, settingsJson: model.assistantSettingsJson, isPremium: model.isPremium)
        model.applyAssistantActions(card.items.map { $0.action })
        if let i = entries.firstIndex(where: { $0.id == entry.id }) {
            entries[i].cardState = .applied
            entries[i].appliedCount = card.items.count
        }
    }

    private func dismiss(_ entry: ChatEntry) {
        if let i = entries.firstIndex(where: { $0.id == entry.id }) { entries[i].cardState = .dismissed }
    }

    // MARK: Views

    private func bubble(_ entry: ChatEntry) -> some View {
        let fromUser = entry.role == "user"
        return HStack {
            if fromUser { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.text)
                if let card = entry.card, entry.cardState == .pending {
                    cardView(entry, card)
                }
                if entry.cardState == .applied {
                    Text(entry.appliedCount > 0 ? "Applied. You can review it in Settings." : "Already up to date.")
                        .font(.footnote)
                } else if entry.cardState == .dismissed {
                    Text("No changes made.").font(.footnote)
                }
                if entry.feedbackSent {
                    Text("Sent as feedback, thanks.").font(.footnote)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(fromUser ? Color.erPrimary : (entry.isError ? Color.red.opacity(0.15) : Color(.secondarySystemBackground)))
            .foregroundColor(fromUser ? .white : Color(.label))
            .cornerRadius(12)
            if !fromUser { Spacer(minLength: 40) }
        }
    }

    private func cardView(_ entry: ChatEntry, _ card: AssistantCard) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(card.items.indices, id: \.self) { i in
                Text("\(card.items[i].label): \(card.items[i].from) \u{2192} \(card.items[i].to)")
            }
            ForEach(card.rejected.indices, id: \.self) { i in
                Text("Skipped \(card.rejected[i].key): \(card.rejected[i].reason)")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            HStack(spacing: 8) {
                Button("Apply") { apply(entry) }.buttonStyle(.borderedProminent)
                Button("Not now") { dismiss(entry) }.buttonStyle(.bordered)
            }
        }
        .padding(8)
        .background(Color(.systemBackground))
        .foregroundColor(Color(.label))
        .cornerRadius(8)
    }
}
