import SwiftUI

struct MusicStaffView: View {
    var expectedNotes: [Int]          // MIDI note numbers
    var detectedNotes: [DetectedNote] // matched by index
    var currentNoteIndex: Int = -1    // -1 = none active
    var fixedSpacing: CGFloat? = nil

    var body: some View {
        // Capture for Canvas closure
        let _detectedNotes  = detectedNotes
        let _currentNoteIdx = currentNoteIndex
        let _expectedNotes  = expectedNotes

        return Canvas { ctx, size in
            let lineSpacing: CGFloat  = 12
            let staffTop: CGFloat     = size.height / 2 - 2 * lineSpacing
            let leftMargin: CGFloat   = 60
            let noteRadius: CGFloat   = lineSpacing * 0.45
            let staffCenter: CGFloat  = staffTop + 2 * lineSpacing
            let staffBottomY: CGFloat = staffTop + 4 * lineSpacing
            let staffTopY: CGFloat    = staffTop

            // staffPos → y  (B4 = staffPos 6 sits on staffCenter)
            func noteY(_ staffPos: Int) -> CGFloat {
                staffCenter - CGFloat(staffPos - 6) * (lineSpacing / 2)
            }

            let staffLineShading = GraphicsContext.Shading.color(Color(white: 0.2))
            let ledgerShading    = GraphicsContext.Shading.color(
                Color(red: 0.333, green: 0.333, blue: 0.333))

            // ── 5 staff lines ──────────────────────────────────────────────
            for i in 0..<5 {
                let y = staffTop + CGFloat(i) * lineSpacing
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y))
                p.addLine(to: CGPoint(x: size.width, y: y))
                ctx.stroke(p, with: staffLineShading, lineWidth: 1.5)
            }

            // ── Treble clef ────────────────────────────────────────────────
            ctx.draw(
                Text("𝄞").font(.system(size: 56)),
                at: CGPoint(x: 4, y: staffTop - lineSpacing * 1.5),
                anchor: .leading
            )

            guard !_expectedNotes.isEmpty else { return }

            // ── Note horizontal distribution ───────────────────────────────
            let noteAreaStart: CGFloat = leftMargin + 20
            let noteAreaWidth: CGFloat = size.width - noteAreaStart - 20
            let noteCount = _expectedNotes.count
            let noteStep: CGFloat
            if let fs = fixedSpacing {
                noteStep = fs
            } else {
                noteStep = noteAreaWidth / CGFloat(max(noteCount, 1))
            }
            let calcNoteX = { (i: Int) -> CGFloat in noteAreaStart + CGFloat(i) * noteStep + noteStep / 2 }

            for i in 0..<noteCount {
                let midi     = _expectedNotes[i]
                let staffPos = EarRingCore.staffPosition(midi: midi)
                let x: CGFloat = calcNoteX(i)
                let y = noteY(staffPos)

                // ── Ledger lines below staff ───────────────────────────────
                var ledgerBelow = staffBottomY + lineSpacing
                while y >= ledgerBelow - 0.5 {
                    var lp = Path()
                    lp.move(to: CGPoint(x: x - noteRadius * 2.8, y: ledgerBelow))
                    lp.addLine(to: CGPoint(x: x + noteRadius * 2.8, y: ledgerBelow))
                    ctx.stroke(lp, with: ledgerShading, lineWidth: 1.5)
                    ledgerBelow += lineSpacing
                }

                // ── Ledger lines above staff ───────────────────────────────
                var ledgerAbove = staffTopY - lineSpacing
                while y <= ledgerAbove + 0.5 {
                    var lp = Path()
                    lp.move(to: CGPoint(x: x - noteRadius * 2.8, y: ledgerAbove))
                    lp.addLine(to: CGPoint(x: x + noteRadius * 2.8, y: ledgerAbove))
                    ctx.stroke(lp, with: ledgerShading, lineWidth: 1.5)
                    ledgerAbove -= lineSpacing
                }

                // ── Note head ──────────────────────────────────────────────
                let rect   = CGRect(x: x - noteRadius, y: y - noteRadius,
                                    width: noteRadius * 2, height: noteRadius * 2)
                let circle = Path(ellipseIn: rect)

                // Determine colour / style
                if i < _detectedNotes.count {
                    let color: Color = _detectedNotes[i].isCorrect ? .erSuccess : .erError
                    ctx.fill(circle, with: .color(color))
                } else if i == _currentNoteIdx {
                    ctx.fill(circle, with: .color(Color.erPrimary))
                } else {
                    // Expected: hollow — filled dark then white inner
                    ctx.fill(circle, with: .color(Color(white: 0.2)))
                    let innerR    = max(noteRadius - 2.5, 0.5)
                    let innerRect = CGRect(x: x - innerR, y: y - innerR,
                                          width: innerR * 2, height: innerR * 2)
                    ctx.fill(Path(ellipseIn: innerRect), with: .color(.white))
                }
            }
        }
    }
}
