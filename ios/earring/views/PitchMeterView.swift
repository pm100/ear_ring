import SwiftUI

struct PitchMeterView: View {
    var midi: Int?       // nil = silent / not detected
    var isActive: Bool

    // "♪" (plain monochrome glyph, no emoji presentation — same family as the
    // app's ▶/■/↻ button glyphs), not a bare "—", so the idle state reads as
    // "no note detected yet" rather than a misplaced divider (fixed during the
    // UI review, issue #30).
    private var noteLabel: String {
        guard let midi = midi else { return "♪" }
        return MusicTheory.midiToLabel(midi)
    }

    private var isDetected: Bool { midi != nil }

    private var ringColor: Color {
        isDetected ? .erSuccess : .erMuted
    }

    private var textColor: Color {
        isDetected ? .erDark : .erMuted
    }

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let fontSize: CGFloat = noteLabel.count >= 3 ? size * 0.18 : size * 0.22
            ZStack {
                Circle()
                    .strokeBorder(ringColor, lineWidth: size * 0.044)
                    .animation(.easeInOut(duration: 0.15), value: isDetected)
                Text(noteLabel)
                    .font(.system(size: fontSize, weight: .bold))
                    .foregroundColor(textColor)
                    .animation(.easeInOut(duration: 0.15), value: noteLabel)
            }
            .frame(width: size, height: size)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
    }
}
