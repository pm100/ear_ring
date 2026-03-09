import SwiftUI

struct PitchMeterView: View {
    var midi: Int?      // nil = silent / not detected
    var isActive: Bool

    private var noteLabel: String {
        guard let midi = midi else { return "—" }
        return MusicTheory.midiToLabel(midi)
    }

    private var ringColor: Color {
        guard isActive, midi != nil else { return .gray.opacity(0.3) }
        return .green
    }

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            ZStack {
                Circle()
                    .strokeBorder(ringColor, lineWidth: size * 0.06)
                    .animation(.easeInOut(duration: 0.2), value: ringColor)

                Text(noteLabel)
                    .font(.system(size: size * 0.32, weight: .bold, design: .rounded))
                    .foregroundColor(isActive && midi != nil ? .primary : .secondary)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .padding(size * 0.1)
            }
            .frame(width: size, height: size)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
    }
}
