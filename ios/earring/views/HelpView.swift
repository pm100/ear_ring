import SwiftUI

struct HelpView: View {
    private var sections: [(title: String, body: String)] = {
        parseHelpSections(EarRingCore.helpContent())
    }()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(sections, id: \.title) { section in
                    HelpSection(title: section.title) {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(section.body.components(separatedBy: "\n\n"), id: \.self) { para in
                                Text(para.trimmingCharacters(in: .whitespacesAndNewlines))
                            }
                        }
                        .font(.body)
                    }
                }
                Spacer(minLength: 24)
            }
            .padding(16)
        }
        .background(Color(.systemBackground))
        .hideNavigationBar()
    }
}

private func parseHelpSections(_ json: String) -> [(title: String, body: String)] {
    guard let data = json.data(using: .utf8),
          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else {
        return []
    }
    return arr.compactMap { obj in
        guard let title = obj["title"], let body = obj["body"] else { return nil }
        return (title: title, body: body)
    }
}

private struct HelpSection<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.erPrimary)
                .padding(.top, 16)
            content
                .foregroundColor(Color(.label))
            Divider().padding(.top, 16)
        }
    }
}
