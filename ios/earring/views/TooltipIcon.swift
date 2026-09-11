import SwiftUI

/// Lazily-parsed key->text map from the shared Rust tooltip content (issue #11).
private let tooltipText: [String: String] = {
    guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.tooltipContent().utf8)),
          let arr = json as? [[String: Any]] else { return [:] }
    var map: [String: String] = [:]
    for obj in arr {
        if let key = obj["key"] as? String, let text = obj["text"] as? String {
            map[key] = text
        }
    }
    return map
}()

/// A small "?" icon that shows explanatory text on tap, as a small bottom sheet. Place
/// next to a control's label; `key` must match a `## key` entry in tooltips.md — renders
/// nothing if it doesn't, so a typo here fails soft instead of crashing the screen.
///
/// A .popover (anchored bubble) was tried first but proved unreliable in this SwiftUI
/// version when forced onto iPhone via presentationCompactAdaptation(.popover) — text
/// truncated, then clipped at whichever edge it flipped to, and its translucent chrome
/// hurt readability. A sheet is opaque, its height is a real system-respected value
/// (no content-measurement guessing), and is iPhone's native presentation for .popover
/// anyway — presentationCompactAdaptation was fighting that default, not adding to it.
struct TooltipIcon: View {
    let key: String
    @State private var showing = false

    var body: some View {
        if let text = tooltipText[key] {
            Button(action: { showing = true }) {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 14))
                    .foregroundColor(.erCaption)
            }
            .sheet(isPresented: $showing) {
                tooltipSheetContent(text)
            }
        }
    }

    // Deployment target here is iOS 16.0, but .presentationBackground needs 16.4 —
    // apply it only when available; older iOS falls back to the sheet's default
    // background rather than failing to compile.
    @ViewBuilder
    private func tooltipSheetContent(_ text: String) -> some View {
        let content = Text(text)
            .font(.subheadline)
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            // One fixed height for every tooltip — comfortably fits the longest
            // entry (~5 wrapped lines at full sheet width) with only a little
            // spare room for shorter ones, rather than guessing per-text.
            .presentationDetents([.height(180)])
            .presentationDragIndicator(.visible)
        if #available(iOS 16.4, *) {
            // Explicit solid background — recent iOS defaults sheets to a
            // translucent material, which is exactly the readability problem
            // this replaced .popover for in the first place.
            content.presentationBackground(Color(.systemBackground))
        } else {
            content
        }
    }
}
