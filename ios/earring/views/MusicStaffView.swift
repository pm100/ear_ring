import SwiftUI

enum StaffNoteState {
    case expected
    case correct
    case incorrect
    case active
}

struct StaffDisplayNote: Identifiable {
    let id = UUID()
    let midi: Int
    let state: StaffNoteState
}

struct MusicStaffView: View {
    var notes: [StaffDisplayNote]
    var fixedSpacing: CGFloat? = nil

    var body: some View {
        Canvas { ctx, size in
            let lineSpacing: CGFloat = 12
            let staffTop: CGFloat = size.height / 2 - 2 * lineSpacing
            let leftMargin: CGFloat = 22
            let noteRadius: CGFloat = lineSpacing * 0.45
            let staffBottomY: CGFloat = staffTop + 4 * lineSpacing
            let staffCenter: CGFloat = staffTop + 2 * lineSpacing
            let noteHeadWidth: CGFloat = noteRadius * 2.3
            let noteHeadHeight: CGFloat = noteRadius * 1.7
            let stemLength: CGFloat = lineSpacing * 3.2

            func noteY(_ staffPos: Int) -> CGFloat {
                staffCenter - CGFloat(staffPos - 6) * (lineSpacing / 2)
            }

            for i in 0..<5 {
                let y = staffTop + CGFloat(i) * lineSpacing
                var p = Path()
                p.move(to: CGPoint(x: 5, y: y))
                p.addLine(to: CGPoint(x: size.width - 16, y: y))
                ctx.stroke(p, with: .color(Color(white: 0.2)), lineWidth: 1.5)
            }

            ctx.draw(
                Text("𝄞").font(.system(size: lineSpacing * 7)),
                at: CGPoint(x: 4, y: staffTop - lineSpacing * 2.5),
                anchor: .topLeading
            )

            guard !notes.isEmpty else { return }

            let noteAreaStart: CGFloat = leftMargin + 20
            let noteAreaWidth: CGFloat = size.width - noteAreaStart - 20
            let noteStep = fixedSpacing ?? noteAreaWidth / CGFloat(max(notes.count, 1))

            for (index, displayNote) in notes.enumerated() {
                let staffPos = EarRingCore.staffPosition(midi: displayNote.midi)
                let x = noteAreaStart + CGFloat(index) * noteStep + noteStep / 2
                let y = noteY(staffPos)
                let noteColor: Color = {
                    switch displayNote.state {
                    case .expected: return Color(white: 0.2)
                    case .correct: return .erSuccess
                    case .incorrect: return .erError
                    case .active: return .erPrimary
                    }
                }()
                let noteLabel = MusicTheory.midiToLabel(displayNote.midi)
                let accidental: String? = {
                    if noteLabel.contains("#") { return "♯" }
                    if noteLabel.contains("b") || noteLabel.contains("♭") { return "♭" }
                    return nil
                }()
                let stemUp = staffPos < 6
                let stemX = stemUp ? x + noteHeadWidth * 0.35 : x - noteHeadWidth * 0.35
                let stemEndY = stemUp ? y - stemLength : y + stemLength

                var ledgerBelow = staffBottomY + lineSpacing
                while y >= ledgerBelow - 0.5 {
                    let hw = noteHeadWidth / 2 + noteRadius * 0.5
                    var lp = Path()
                    lp.move(to: CGPoint(x: x - hw, y: ledgerBelow))
                    lp.addLine(to: CGPoint(x: x + hw, y: ledgerBelow))
                    ctx.stroke(lp, with: .color(Color(red: 0.333, green: 0.333, blue: 0.333)), lineWidth: 1.5)
                    ledgerBelow += lineSpacing
                }

                var ledgerAbove = staffTop - lineSpacing
                while y <= ledgerAbove + 0.5 {
                    let hw = noteHeadWidth / 2 + noteRadius * 0.5
                    var lp = Path()
                    lp.move(to: CGPoint(x: x - hw, y: ledgerAbove))
                    lp.addLine(to: CGPoint(x: x + hw, y: ledgerAbove))
                    ctx.stroke(lp, with: .color(Color(red: 0.333, green: 0.333, blue: 0.333)), lineWidth: 1.5)
                    ledgerAbove -= lineSpacing
                }

                var stemPath = Path()
                stemPath.move(to: CGPoint(x: stemX, y: y))
                stemPath.addLine(to: CGPoint(x: stemX, y: stemEndY))
                ctx.stroke(stemPath, with: .color(noteColor), lineWidth: 1.7)

                let noteRect = CGRect(
                    x: x - noteHeadWidth / 2,
                    y: y - noteHeadHeight / 2,
                    width: noteHeadWidth,
                    height: noteHeadHeight
                )
                let rotation = CGAffineTransform(translationX: x, y: y)
                    .rotated(by: -.pi / 9)
                    .translatedBy(x: -x, y: -y)
                let noteHead = Path(ellipseIn: noteRect).applying(rotation)
                ctx.fill(noteHead, with: .color(noteColor))

                if let accidental {
                    ctx.draw(
                        Text(accidental)
                            .font(.system(size: lineSpacing * 1.8))
                            .foregroundColor(noteColor),
                        at: CGPoint(x: x - noteHeadWidth * 1.25, y: y),
                        anchor: .center
                    )
                }
            }
        }
    }
}
