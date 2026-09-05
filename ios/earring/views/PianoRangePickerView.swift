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
    var keyScale: CGFloat = 1.0

    private var whiteKeyW: CGFloat { 22 * keyScale }
    private var blackKeyW: CGFloat { 14 * keyScale }
    private var whiteKeyH: CGFloat { 80 * keyScale }
    private var blackKeyH: CGFloat { 52 * keyScale }
    private var handleR:   CGFloat {  9 * keyScale }
    private var handleArea: CGFloat { 22 * keyScale }

    var body: some View {
        let totalW = whiteKeyW * CGFloat(TOTAL_WHITE_KEYS)   // keyboard length, along the original x-axis
        let totalH = handleArea + whiteKeyH                   // keyboard thickness, along the original y-axis

        // Drawn and hit-tested in its normal (horizontal) layout below, then rotated 90deg
        // so the keyboard displays sideways (low notes at top): its long axis runs down the
        // popup instead of needing wide horizontal scrolling. The DragGesture is attached to
        // this *outer*, un-rotated container (sized to the swapped totalH x totalW box)
        // rather than to the rotated Canvas itself — SwiftUI's rotationEffect doesn't
        // reliably auto-transform gesture coordinates the way Compose's pointer input does,
        // so mapToOriginal() below does that mapping explicitly, and none of
        // drawPiano/xToMidi/keyX needs to change.
        Canvas { ctx, size in
            drawPiano(ctx: ctx, size: size)
        }
        .frame(width: totalW, height: totalH)
        .rotationEffect(.degrees(90))
        .frame(width: totalH, height: totalW)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 0, coordinateSpace: .local)
                .onChanged { value in handleGesture(at: mapToOriginal(value.location, totalH: totalH), isDrag: true) }
                .onEnded { value in handleGesture(at: mapToOriginal(value.location, totalH: totalH), isDrag: false) }
        )
    }

    /// Maps a point in the outer (un-rotated) totalH x totalW container back into the
    /// original pre-rotation totalW x totalH canvas space that drawPiano/keyX/xToMidi use.
    /// Inverse of the rotationEffect(90deg) forward mapping x'=totalH-y, y'=x.
    private func mapToOriginal(_ p: CGPoint, totalH: CGFloat) -> CGPoint {
        CGPoint(x: p.y, y: totalH - p.x)
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
            // Tap away from either handle: move whichever endpoint (start or end) is
            // nearer to the tapped key directly there, instead of requiring a precise
            // drag on a small handle — a single tap sets start or end.
            let yInKeys = point.y - handleArea
            let tapped = xToMidi(point.x, yInKeys: yInKeys)
            if abs(tapped - rangeStart) <= abs(tapped - rangeEnd) {
                onRangeChange(max(PIANO_MIDI_MIN, min(rangeEnd - 12, tapped)), rangeEnd)
            } else {
                onRangeChange(rangeStart, max(rangeStart + 12, min(PIANO_MIDI_MAX, tapped)))
            }
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
            let labelColor = inRange ? primary : Color(red: 0.33, green: 0.33, blue: 0.33)
            ctx.draw(
                Text("C\(oct)").font(.system(size: 14 * keyScale, weight: .bold)).foregroundColor(labelColor),
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

/// Keyboard length at keyScale=1 — the full unscaled span PianoRangePickerView draws before
/// any fit-to-available-space shrinking is applied. Exposed so callers can compute that scale.
let PIANO_RANGE_PICKER_NATURAL_LENGTH: CGFloat = 22 * CGFloat(TOTAL_WHITE_KEYS)

/// Full-screen presentation of [PianoRangePickerView] — deliberately not a small sheet: at
/// natural size the rotated keyboard is far taller than a sheet can offer without either
/// scrolling (which risks fighting the picker's own drag-a-handle gesture, the same class of
/// conflict hit and fixed on Android — see PianoRangePicker.kt's history) or shrinking it
/// down to an untappable size. Full-screen gives it enough room to render close to natural
/// size on most phones, computed here from the actual space left after the top bar via
/// GeometryReader.
struct PianoRangePickerFullScreen: View {
    let rangeStart: Int
    let rangeEnd: Int
    let onRangeChange: (Int, Int) -> Void
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Note Range").font(.title2)
                Spacer()
                Button("Done", action: onDone)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            GeometryReader { geo in
                let keyScale = min(1.0, geo.size.height / PIANO_RANGE_PICKER_NATURAL_LENGTH)
                PianoRangePickerView(
                    rangeStart: rangeStart,
                    rangeEnd: rangeEnd,
                    onRangeChange: onRangeChange,
                    keyScale: keyScale
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            }
        }
        .background(Color(.systemBackground))
    }
}
