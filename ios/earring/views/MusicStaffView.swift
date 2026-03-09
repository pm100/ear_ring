import SwiftUI

struct MusicStaffView: View {
    var expectedNotes: [Int]     // MIDI note numbers
    var detectedNotes: [DetectedNote]   // matched by index

    var body: some View {
        Canvas { ctx, size in
            // Layout constants
            let clefWidth: CGFloat = 50
            let leftPad: CGFloat = 10
            let rightPad: CGFloat = 10
            let staffAreaTop: CGFloat = 15
            let staffAreaBottom: CGFloat = size.height - 15
            let lineSpacing: CGFloat = (staffAreaBottom - staffAreaTop) / 4.0
            let halfStep: CGFloat = lineSpacing / 2.0
            let bottomLineY: CGFloat = staffAreaBottom   // E4, staff position 2

            // Maps diatonic staff position → y coordinate
            func noteY(_ pos: Int) -> CGFloat {
                return bottomLineY - CGFloat(pos - 2) * halfStep
            }

            let lineColor = GraphicsContext.Shading.color(.primary)

            // Draw 5 staff lines (at staff positions 2, 4, 6, 8, 10)
            for linePos in [2, 4, 6, 8, 10] {
                let y = noteY(linePos)
                var linePath = Path()
                linePath.move(to: CGPoint(x: leftPad, y: y))
                linePath.addLine(to: CGPoint(x: size.width - rightPad, y: y))
                ctx.stroke(linePath, with: lineColor, lineWidth: 1)
            }

            // Draw treble clef
            ctx.draw(
                Text("𝄞").font(.system(size: lineSpacing * 4.5)),
                at: CGPoint(x: clefWidth / 2, y: bottomLineY - lineSpacing * 1.5)
            )

            guard !expectedNotes.isEmpty else { return }

            let noteRadius: CGFloat = lineSpacing * 0.38
            let noteAreaStart: CGFloat = clefWidth + leftPad
            let noteAreaEnd: CGFloat = size.width - rightPad
            let noteCount = expectedNotes.count

            // Compute x positions – evenly spaced with margins
            let xSpacing: CGFloat = noteCount > 1
                ? (noteAreaEnd - noteAreaStart) / CGFloat(noteCount + 1)
                : (noteAreaEnd - noteAreaStart) / 2

            for i in 0..<noteCount {
                let midi = expectedNotes[i]
                let staffPos = EarRingCore.staffPosition(midi: midi)
                let x: CGFloat = noteAreaStart + xSpacing * CGFloat(i + 1)
                let y = noteY(staffPos)

                // Ledger lines below the staff (even positions ≤ 0)
                if staffPos <= 0 {
                    var lp = 0
                    while lp >= staffPos {
                        let ly = noteY(lp)
                        var lPath = Path()
                        lPath.move(to: CGPoint(x: x - noteRadius * 1.25, y: ly))
                        lPath.addLine(to: CGPoint(x: x + noteRadius * 1.25, y: ly))
                        ctx.stroke(lPath, with: lineColor, lineWidth: 1)
                        lp -= 2
                    }
                }

                // Ledger lines above the staff (even positions ≥ 12)
                if staffPos >= 12 {
                    var lp = 12
                    while lp <= staffPos {
                        let ly = noteY(lp)
                        var lPath = Path()
                        lPath.move(to: CGPoint(x: x - noteRadius * 1.25, y: ly))
                        lPath.addLine(to: CGPoint(x: x + noteRadius * 1.25, y: ly))
                        ctx.stroke(lPath, with: lineColor, lineWidth: 1)
                        lp += 2
                    }
                }

                // Note head
                let noteRect = CGRect(
                    x: x - noteRadius,
                    y: y - noteRadius,
                    width: noteRadius * 2,
                    height: noteRadius * 2
                )
                let noteCircle = Path(ellipseIn: noteRect)

                if i < detectedNotes.count {
                    let color: Color = detectedNotes[i].isCorrect ? .green : .red
                    ctx.fill(noteCircle, with: .color(color))
                } else {
                    ctx.stroke(noteCircle, with: .color(.primary), lineWidth: 1.5)
                }
            }
        }
        .drawingGroup()   // rasterise for performance
    }
}
