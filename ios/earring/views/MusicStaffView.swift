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

// Accidental PNG dimensions (matching gen_accidental_symbols.js output).
// Anchor (belly for ♭, bar-centre for ♯) is at exactly 50% of the image height.
// Position formula: top = targetY - displayH / 2  (same on all platforms).
private let FLAT_PNG_W:  CGFloat = 141
private let FLAT_PNG_H:  CGFloat = 435
private let SHARP_PNG_W: CGFloat = 179
private let SHARP_PNG_H: CGFloat = 305
private let FLAT_H_MULT:  CGFloat = 3.0
private let SHARP_H_MULT: CGFloat = 2.0

// Map note state → colour-variant suffix used in image asset names.
private func accSuffix(_ state: StaffNoteState) -> String {
    switch state {
    case .correct:   return "_correct"
    case .incorrect: return "_wrong"
    case .active:    return "_active"
    default:         return ""
    }
}

struct MusicStaffView: View {
    var notes: [StaffDisplayNote]
    var fixedSpacing: CGFloat? = nil
    var rootChroma: Int = 0
    var keySignatureMode: Int = 0

    // Preloaded UIImage cache so Canvas GraphicsContext can draw them reliably.
    private static let accImages: [String: UIImage] = {
        var d: [String: UIImage] = [:]
        for name in ["flat", "flat_correct", "flat_wrong", "flat_active",
                     "sharp", "sharp_correct", "sharp_wrong", "sharp_active"] {
            if let img = UIImage(named: name) { d[name] = img }
        }
        return d
    }()

    var body: some View {
        Canvas { ctx, size in
            // lineSpacing scales with the view height so the staff fills
            // the frame correctly on both iPhone (160pt) and iPad (220pt).
            let lineSpacing: CGFloat = size.height * 0.075
            let staffTop: CGFloat = size.height / 2 - 2 * lineSpacing
            let noteRadius: CGFloat = lineSpacing * 0.45
            let staffBottomY: CGFloat = staffTop + 4 * lineSpacing
            let staffCenter: CGFloat = staffTop + 2 * lineSpacing
            let noteHeadWidth: CGFloat = noteRadius * 2.3
            let noteHeadHeight: CGFloat = noteRadius * 1.7
            let stemLength: CGFloat = lineSpacing * 3.2

            let flatDisplayH:  CGFloat = lineSpacing * FLAT_H_MULT
            let sharpDisplayH: CGFloat = lineSpacing * SHARP_H_MULT
            let flatDisplayW:  CGFloat = flatDisplayH  * (FLAT_PNG_W  / FLAT_PNG_H)
            let sharpDisplayW: CGFloat = sharpDisplayH * (SHARP_PNG_W / SHARP_PNG_H)

            func noteY(_ staffPos: Int) -> CGFloat {
                staffCenter - CGFloat(staffPos - 6) * (lineSpacing / 2)
            }

            // Draw an accidental PNG centred vertically on targetY (anchor@50%).
            func drawAcc(_ name: String, leftX: CGFloat, targetY: CGFloat, displayH: CGFloat, displayW: CGFloat) {
                guard let ui = MusicStaffView.accImages[name] else { return }
                let r = CGRect(x: leftX, y: targetY - displayH / 2, width: displayW, height: displayH)
                ctx.draw(Image(uiImage: ui), in: r)
            }

            // ── Staff lines ──────────────────────────────────────────────────
            for i in 0..<5 {
                let y = staffTop + CGFloat(i) * lineSpacing
                var p = Path()
                p.move(to: CGPoint(x: 5, y: y))
                p.addLine(to: CGPoint(x: size.width - 16, y: y))
                ctx.stroke(p, with: .color(Color(white: 0.2)), lineWidth: 1.5)
            }

            // ── Treble clef (text — reliable on iOS) ────────────────────────
            ctx.draw(
                Text("𝄞").font(.system(size: lineSpacing * 7)),
                at: CGPoint(x: 4, y: staffTop - lineSpacing * 2.5),
                anchor: .topLeading
            )

            let clefFont = UIFont.systemFont(ofSize: lineSpacing * 7)
            let clefWidth = NSAttributedString(string: "𝄞", attributes: [.font: clefFont]).size().width
            let keySigStartX: CGFloat = 4 + clefWidth + 6

            // ── Key signature (PNG images) ───────────────────────────────────
            let keySigIsSharp = EarRingCore.isSharpKey(rootChroma: rootChroma)
            let keySigDisplayH = keySigIsSharp ? sharpDisplayH : flatDisplayH
            let keySigDisplayW = keySigIsSharp ? sharpDisplayW : flatDisplayW
            let keySigBase = keySigIsSharp ? "sharp" : "flat"

            if keySignatureMode == 1 {
                let keySig = EarRingCore.keySigPositions(rootChroma: rootChroma)
                for (i, staffPos) in keySig.positions.enumerated() {
                    let targetY = noteY(staffPos)
                    let leftX = keySigStartX + CGFloat(i) * keySigDisplayW
                    drawAcc(keySigBase, leftX: leftX, targetY: targetY,
                            displayH: keySigDisplayH, displayW: keySigDisplayW)
                }
            }

            guard !notes.isEmpty else { return }

            // ── Note area start ──────────────────────────────────────────────
            let keySigCount = keySignatureMode == 1 ? abs(EarRingCore.keyAccidentalCount(rootChroma: rootChroma)) : 0
            let keySigEndX = keySigStartX + CGFloat(keySigCount) * keySigDisplayW + 8
            let noteAreaStart = max(keySigStartX + 20, keySigEndX)
            let noteAreaWidth: CGFloat = size.width - noteAreaStart - 20
            let noteStep = fixedSpacing ?? noteAreaWidth / CGFloat(max(notes.count, 1))

            // ── Notes ────────────────────────────────────────────────────────
            for (index, displayNote) in notes.enumerated() {
                let staffPos = EarRingCore.staffPositionInKey(midi: displayNote.midi, rootChroma: rootChroma)
                let x = noteAreaStart + CGFloat(index) * noteStep + noteStep / 2
                let y = noteY(staffPos)
                let noteColor: Color = {
                    switch displayNote.state {
                    case .expected:  return Color(white: 0.2)
                    case .correct:   return .erSuccess
                    case .incorrect: return .erError
                    case .active:    return .erPrimary
                    }
                }()

                // Determine accidental (true=sharp, false=flat, nil=none)
                let accIsSharp: Bool? = {
                    if keySignatureMode == 1 {
                        let acc = EarRingCore.accidentalInKey(midi: displayNote.midi, rootChroma: rootChroma)
                        switch acc {
                        case 1: return true
                        case 2: return false
                        default: return nil
                        }
                    } else {
                        let label = EarRingCore.preferredNoteLabel(midi: displayNote.midi, rootChroma: rootChroma)
                        if label.contains("#") { return true }
                        if label.contains("b") { return false }
                        return nil
                    }
                }()

                let stemUp = staffPos < 6
                let stemX = stemUp ? x + noteHeadWidth * 0.35 : x - noteHeadWidth * 0.35
                let stemEndY = stemUp ? y - stemLength : y + stemLength

                // Ledger lines
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

                // Stem
                var stemPath = Path()
                stemPath.move(to: CGPoint(x: stemX, y: y))
                stemPath.addLine(to: CGPoint(x: stemX, y: stemEndY))
                ctx.stroke(stemPath, with: .color(noteColor), lineWidth: 1.7)

                // Note head
                let noteRect = CGRect(x: x - noteHeadWidth / 2, y: y - noteHeadHeight / 2,
                                     width: noteHeadWidth, height: noteHeadHeight)
                let rotation = CGAffineTransform(translationX: x, y: y)
                    .rotated(by: -.pi / 9)
                    .translatedBy(x: -x, y: -y)
                let noteHead = Path(ellipseIn: noteRect).applying(rotation)
                ctx.fill(noteHead, with: .color(noteColor))

                // Per-note accidental PNG
                if let isSharp = accIsSharp {
                    let suffix = accSuffix(displayNote.state)
                    let imgName = (isSharp ? "sharp" : "flat") + suffix
                    let dh = isSharp ? sharpDisplayH : flatDisplayH
                    let dw = isSharp ? sharpDisplayW : flatDisplayW
                    // Centre the accidental just left of the notehead
                    let leftX = x - noteHeadWidth * 1.25 - dw / 2
                    drawAcc(imgName, leftX: leftX, targetY: y, displayH: dh, displayW: dw)
                }
            }
        }
    }
}
