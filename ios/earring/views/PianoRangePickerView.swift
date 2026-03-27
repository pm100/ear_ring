import SwiftUI

private let PIANO_MIDI_MIN = 36  // C2
private let PIANO_MIDI_MAX = 84  // C6
private let WHITE_KEY_CLASSES: Set<Int> = [0, 2, 4, 5, 7, 9, 11]
private let DIATONIC_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
private let TOTAL_WHITE_KEYS = (PIANO_MIDI_MIN...PIANO_MIDI_MAX).filter { WHITE_KEY_CLASSES.contains($0 % 12) }.count

private func isWhiteKey(_ midi: Int) -> Bool { WHITE_KEY_CLASSES.contains(midi % 12) }

private func whiteIndex(of midi: Int) -> Int {
    let octaveOffset = (midi - PIANO_MIDI_MIN) / 12
    return octaveOffset * 7 + DIATONIC_STEP[midi % 12]
}

struct PianoRangePickerView: View {
    let rangeStart: Int
    let rangeEnd: Int
    let onRangeChange: (Int, Int) -> Void

    private let whiteKeyW: CGFloat = 22
    private let blackKeyW: CGFloat = 14
    private let whiteKeyH: CGFloat = 80
    private let blackKeyH: CGFloat = 52
    private let handleR: CGFloat   = 9
    private let handleArea: CGFloat = 22

    var body: some View {
        let totalW = whiteKeyW * CGFloat(TOTAL_WHITE_KEYS)
        let centerX = (keyX(rangeStart) + keyX(rangeEnd)) / 2
        let midY = (handleArea + whiteKeyH) / 2
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                ZStack(alignment: .topLeading) {
                    Canvas { ctx, size in
                        drawPiano(ctx: ctx, size: size)
                    }
                    .frame(width: totalW, height: handleArea + whiteKeyH)
                    .gesture(
                        DragGesture(minimumDistance: 0, coordinateSpace: .local)
                            .onChanged { value in handleGesture(at: value.location, isDrag: true) }
                            .onEnded { value in handleGesture(at: value.location, isDrag: false) }
                    )
                    // Invisible anchor used by ScrollViewReader to center the range.
                    Color.clear
                        .frame(width: 1, height: 1)
                        .id("range-center")
                        .position(x: centerX, y: midY)
                }
                .frame(width: totalW, height: handleArea + whiteKeyH)
            }
            .onAppear {
                proxy.scrollTo("range-center", anchor: .center)
            }
        }
    }

    private func keyX(_ midi: Int) -> CGFloat {
        if isWhiteKey(midi) {
            return CGFloat(whiteIndex(of: midi)) * whiteKeyW + whiteKeyW / 2
        } else {
            return CGFloat(whiteIndex(of: midi - 1)) * whiteKeyW + whiteKeyW - blackKeyW / 2
        }
    }

    private func xToMidi(_ x: CGFloat, yInKeys: CGFloat) -> Int {
        // Check black keys first
        if yInKeys >= 0 && yInKeys < blackKeyH {
            for m in PIANO_MIDI_MIN...PIANO_MIDI_MAX {
                if !isWhiteKey(m) {
                    let cx = CGFloat(whiteIndex(of: m - 1)) * whiteKeyW + whiteKeyW - blackKeyW / 2
                    if x >= cx - blackKeyW / 2 && x < cx + blackKeyW / 2 { return m }
                }
            }
        }
        let idx = max(0, min(TOTAL_WHITE_KEYS - 1, Int(x / whiteKeyW)))
        for m in PIANO_MIDI_MIN...PIANO_MIDI_MAX {
            if isWhiteKey(m) && whiteIndex(of: m) == idx { return m }
        }
        return rangeStart
    }

    @State private var dragging: Int? = nil  // 0 = start, 1 = end

    private func handleGesture(at point: CGPoint, isDrag: Bool) {
        let hy = handleArea / 2
        let sx = keyX(rangeStart)
        let ex = keyX(rangeEnd)

        if dragging == nil && !isDrag {
            // Tap
            let yInKeys = point.y - handleArea
            let tapped = xToMidi(point.x, yInKeys: yInKeys)
            let span = rangeEnd - rangeStart
            let newStart = max(PIANO_MIDI_MIN, min(PIANO_MIDI_MAX - span, tapped))
            onRangeChange(newStart, newStart + span)
            return
        }

        if dragging == nil {
            // Decide which handle
            let dStart = hypot(point.x - sx, point.y - hy)
            let dEnd   = hypot(point.x - ex, point.y - hy)
            if dStart < handleR * 2.5 || (dStart < dEnd && dStart < handleR * 4) {
                dragging = 0
            } else if dEnd < handleR * 2.5 {
                dragging = 1
            }
        }

        if let which = dragging {
            let m = xToMidi(point.x, yInKeys: blackKeyH / 2)
            if which == 0 {
                let ns = max(PIANO_MIDI_MIN, min(rangeEnd - 12, m))
                onRangeChange(ns, rangeEnd)
            } else {
                let ne = max(rangeStart + 12, min(PIANO_MIDI_MAX, m))
                onRangeChange(rangeStart, ne)
            }
        }

        if !isDrag { dragging = nil }
    }

    private func drawPiano(ctx: GraphicsContext, size: CGSize) {
        let primary = Color(red: 0.247, green: 0.318, blue: 0.710) // #3F51B5
        let keyTop = handleArea

        // White keys
        for midi in PIANO_MIDI_MIN...PIANO_MIDI_MAX {
            guard isWhiteKey(midi) else { continue }
            let left = CGFloat(whiteIndex(of: midi)) * whiteKeyW
            let rect = CGRect(x: left, y: keyTop, width: whiteKeyW - 1, height: whiteKeyH)
            let inRange = midi >= rangeStart && midi <= rangeEnd
            // Solid light-indigo (#C5CAE9) for in-range, white otherwise
            let wFill = inRange ? Color(red: 0.773, green: 0.792, blue: 0.918) : Color.white
            let wStroke = inRange ? Color(red: 0.475, green: 0.525, blue: 0.796) : Color.gray.opacity(0.6)
            ctx.fill(Path(rect), with: .color(wFill))
            ctx.stroke(Path(rect), with: .color(wStroke), lineWidth: 1)
        }

        // Black keys
        for midi in PIANO_MIDI_MIN...PIANO_MIDI_MAX {
            guard !isWhiteKey(midi) else { continue }
            let cx = CGFloat(whiteIndex(of: midi - 1)) * whiteKeyW + whiteKeyW - blackKeyW / 2
            let rect = CGRect(x: cx - blackKeyW / 2, y: keyTop, width: blackKeyW, height: blackKeyH)
            let inRange = midi >= rangeStart && midi <= rangeEnd
            // Full primary colour for in-range black keys
            ctx.fill(Path(rect), with: .color(inRange ? primary : Color(red: 0.13, green: 0.13, blue: 0.13)))
        }

        // C key labels
        let labelOffset = CGFloat(8)
        for midi in stride(from: PIANO_MIDI_MIN, through: PIANO_MIDI_MAX, by: 12) {
            let oct = midi / 12 - 1
            let left = CGFloat(whiteIndex(of: midi)) * whiteKeyW
            let cx = left + whiteKeyW / 2
            let inRange = midi >= rangeStart && midi <= rangeEnd
            let labelColor = inRange ? primary : Color(red: 0.467, green: 0.467, blue: 0.467)
            ctx.draw(
                Text("C\(oct)").font(.system(size: 9)).foregroundColor(labelColor),
                at: CGPoint(x: cx, y: keyTop + whiteKeyH - labelOffset),
                anchor: .bottom
            )
        }

        // Handles
        let hy = handleArea / 2
        let sx = keyX(rangeStart)
        let ex = keyX(rangeEnd)
        var linePath = Path()
        linePath.move(to: CGPoint(x: sx, y: hy))
        linePath.addLine(to: CGPoint(x: ex, y: hy))
        ctx.stroke(linePath, with: .color(primary), lineWidth: 3)
        ctx.fill(Path(ellipseIn: CGRect(x: sx - handleR, y: hy - handleR, width: handleR * 2, height: handleR * 2)), with: .color(primary))
        ctx.fill(Path(ellipseIn: CGRect(x: ex - handleR, y: hy - handleR, width: handleR * 2, height: handleR * 2)), with: .color(primary))
    }
}
