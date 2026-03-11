import SwiftUI

struct PitchMeterView: View {
    var midi: Int?       // nil = silent / not detected
    var isActive: Bool

    private var noteLabel: String {
        guard let midi = midi else { return "—" }
        return MusicTheory.midiToLabel(midi)
    }

    private var isDetected: Bool { midi != nil }

    private var ringColor: Color {
        isDetected ? .erSuccess : .erMuted
    }

    private var textColor: Color {
        isDetected ? .erDark : .erMuted
    }

    private var fontSize: CGFloat {
        noteLabel.count >= 3 ? 16 : 20
    }

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(ringColor, lineWidth: 4)
                .animation(.easeInOut(duration: 0.15), value: isDetected)

            Text(noteLabel)
                .font(.system(size: fontSize, weight: .bold))
                .foregroundColor(textColor)
                .animation(.easeInOut(duration: 0.15), value: noteLabel)
        }
        .frame(width: 90, height: 90)
    }
}
