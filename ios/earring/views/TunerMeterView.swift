import SwiftUI

/// Guitar-tuner-style meter for Mic Setup: a semicircular arc with a needle that sweeps
/// continuously with the live pitch, replacing PitchMeterView's plain circle+label.
/// Unlike PitchMeterView (and the exercise pipeline generally), [midi]/[cents] are
/// ExerciseModel's live values (see its `liveMidi`/`liveCents`, updated every frame) —
/// not gated behind note-stability confirmation, matching how a real tuner responds
/// instantly rather than waiting for a "confirmed" note. Mic Setup only; the Exercise
/// screen keeps PitchMeterView.
struct TunerMeterView: View {
    var midi: Int?             // nil = silent / not detected, concert MIDI
    var cents: Int = 0
    var instrumentIndex: Int = 0
    var rootChroma: Int = 0    // concert-pitch key chroma, for spelling the concert half
    var width: CGFloat = 200
    var height: CGFloat = 110

    // Cents bands, matching a typical clip-on chromatic tuner: tight green "in tune"
    // zone, amber transition, red beyond that. freq_to_note (which liveCents is derived
    // from) never returns more than ±50 cents, which is also the arc's full sweep.
    private static let greenBand = 5
    private static let amberBand = 20
    private static let maxCents: Double = 50

    private var isDetecting: Bool { midi != nil }

    private var label: String {
        guard let midi = midi else { return "♪" }
        return EarRingCore.dualNoteLabel(concertMidi: midi, instrumentIndex: instrumentIndex, rootChroma: rootChroma)
    }

    private var zoneColor: Color {
        guard isDetecting else { return .erMuted }
        let c = abs(cents)
        if c <= Self.greenBand { return .erSuccess }
        if c <= Self.amberBand { return .erWarning }
        return .erError
    }

    // angleForCents(-50) = 180° (left end) … angleForCents(0) = 270° (top, straight up)
    // … angleForCents(+50) = 360° (right end). CoreGraphics' y axis grows downward, same
    // as this convention (0° = 3 o'clock, clockwise), so no sign-flipping is needed.
    private func angleForCents(_ c: Double) -> Double { 180 + (c + Self.maxCents) * 1.8 }

    private func pointOnArc(cx: CGFloat, cy: CGFloat, r: CGFloat, angleDeg: Double) -> CGPoint {
        let rad = angleDeg * .pi / 180
        return CGPoint(x: cx + r * CGFloat(cos(rad)), y: cy + r * CGFloat(sin(rad)))
    }

    private func arcPath(cx: CGFloat, cy: CGFloat, r: CGFloat, from: Double, to: Double) -> Path {
        var path = Path()
        let startAngle = angleForCents(from)
        let endAngle = angleForCents(to)
        let segments = 24
        for i in 0...segments {
            let t = Double(i) / Double(segments)
            let pt = pointOnArc(cx: cx, cy: cy, r: r, angleDeg: startAngle + (endAngle - startAngle) * t)
            if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
        }
        return path
    }

    var body: some View {
        VStack(spacing: 2) {
            Canvas { ctx, size in
                let strokeWidth: CGFloat = 10
                let cx = size.width / 2
                let cy = size.height - strokeWidth / 2
                let radius = (size.width - strokeWidth) / 2

                if isDetecting {
                    let bands: [(Double, Double, Color)] = [
                        (-Self.maxCents, -Double(Self.amberBand), .erError),
                        (-Double(Self.amberBand), -Double(Self.greenBand), .erWarning),
                        (-Double(Self.greenBand), Double(Self.greenBand), .erSuccess),
                        (Double(Self.greenBand), Double(Self.amberBand), .erWarning),
                        (Double(Self.amberBand), Self.maxCents, .erError)
                    ]
                    for (from, to, color) in bands {
                        ctx.stroke(arcPath(cx: cx, cy: cy, r: radius, from: from, to: to), with: .color(color), lineWidth: strokeWidth)
                    }
                    let needleCents = Double(min(50, max(-50, cents)))
                    let tip = pointOnArc(cx: cx, cy: cy, r: radius - strokeWidth, angleDeg: angleForCents(needleCents))
                    var needle = Path()
                    needle.move(to: CGPoint(x: cx, y: cy))
                    needle.addLine(to: tip)
                    ctx.stroke(needle, with: .color(zoneColor), lineWidth: 4)
                } else {
                    ctx.stroke(arcPath(cx: cx, cy: cy, r: radius, from: -Self.maxCents, to: Self.maxCents), with: .color(.erMuted), lineWidth: strokeWidth)
                    let tip = pointOnArc(cx: cx, cy: cy, r: radius - strokeWidth, angleDeg: angleForCents(0))
                    var needle = Path()
                    needle.move(to: CGPoint(x: cx, y: cy))
                    needle.addLine(to: tip)
                    ctx.stroke(needle, with: .color(.erMuted), lineWidth: 4)
                }

                let pivot = Path(ellipseIn: CGRect(x: cx - 5, y: cy - 5, width: 10, height: 10))
                ctx.fill(pivot, with: .color(zoneColor))
            }
            .frame(width: width, height: height)
            .animation(.easeInOut(duration: 0.1), value: cents)

            Text(label)
                .font(.system(size: label.count > 5 ? 15 : 20, weight: .bold))
                .foregroundColor(isDetecting ? .erDark : .erMuted)
                .animation(.easeInOut(duration: 0.15), value: label)

            if isDetecting {
                Text(abs(cents) <= Self.greenBand ? "in tune" : String(format: "%+d¢", cents))
                    .font(.caption)
                    .foregroundColor(zoneColor)
            }
        }
    }
}
