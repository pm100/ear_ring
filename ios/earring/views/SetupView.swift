import SwiftUI

struct SetupView: View {
    @EnvironmentObject var model: ExerciseModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) var hsc

    @State private var concertMidi: Int = -1
    @State private var concertHistory: [Int] = []
    @State private var transpSemitones: Int = 0

    // Pitch Detection lives here rather than in Settings — this screen already
    // gives live feedback on what the mic hears, so sensitivity/stability
    // adjustments can be tuned by ear against that feedback instead of blind.
    // Always visible (no heading, no collapse) since this is the screen's
    // primary purpose.
    private let stabilityOptions = [2, 3, 4, 5]
    private let warmupOptions = [0, 1, 2, 3, 4, 5, 6]

    private var isIPad: Bool { hsc == .regular }
    private var staffHeight: CGFloat { isIPad ? 220 : 130 }
    private var meterSize: CGFloat { isIPad ? 130 : 80 }

    private var displayHistory: [Int] {
        concertHistory.map { min(127, max(0, $0 + transpSemitones)) }
    }

    private var sensitivity: Int {
        min(10, max(1, Int(((0.011 - Double(model.silenceThreshold)) / 0.001).rounded())))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Instruction text ──────────────────────────────────────────
            Spacer().frame(height: 12)
            Text("Play a note to test your microphone.")
                .font(.body)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

            // ── Listening indicator ───────────────────────────────────────
            Spacer().frame(height: 8)
            HStack(spacing: 8) {
                Spacer()
                Text("👂")
                    .font(.system(size: 28))
                Text("Listening…")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(red: 0.247, green: 0.318, blue: 0.710))
                Spacer()
            }

            // ── Music staff ───────────────────────────────────────────────
            Spacer().frame(height: 10)
            MusicStaffView(
                notes: displayHistory.enumerated().map { index, midi in
                    StaffDisplayNote(
                        midi: midi,
                        state: index == displayHistory.count - 1 ? .active : .expected
                    )
                },
                fixedSpacing: 44,
                rootChroma: (EarRingCore.effectiveKeyChroma(rootChroma: model.rootNote, scaleId: model.scaleId) + ((transpSemitones % 12) + 12) % 12) % 12,
                keySignatureMode: model.keySignatureMode
            )
            .frame(height: staffHeight)

            // ── Pitch meter ───────────────────────────────────────────────
            // The only detected-note readout below the staff — the large
            // note-name/Hz text that used to sit here was removed to make room
            // for the always-visible Pitch Detection controls, without this
            // screen needing to scroll.
            Spacer().frame(height: 10)
            HStack {
                Spacer()
                PitchMeterView(midi: model.liveMidi, isActive: model.isCapturing)
                    .frame(width: meterSize, height: meterSize)
                Spacer()
            }

            // ── Pitch Detection settings ────────────────────────────────
            Spacer().frame(height: 12)
            sectionLabel("Mic Sensitivity")
            Text("\(sensitivity) / 10")
                .font(.caption).foregroundColor(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 4)
            Slider(value: Binding(
                get: { Double(sensitivity) },
                set: { model.silenceThreshold = Float(max(0.001, min(0.010, 0.011 - $0 * 0.001))) }
            ), in: 1...10, step: 1)

            Spacer().frame(height: 6)
            sectionLabel("Note Stability (frames to confirm)")
            chipGrid(options: stabilityOptions.map { "\($0)" },
                     selected: stabilityOptions.firstIndex(of: model.framesToConfirm) ?? 0,
                     count: stabilityOptions.count) { idx in
                model.framesToConfirm = stabilityOptions[idx]
            }

            Spacer().frame(height: 6)
            sectionLabel("Mic Warmup Frames")
            chipGrid(options: warmupOptions.map { "\($0)" },
                     selected: warmupOptions.firstIndex(of: model.warmupFrames) ?? 4,
                     count: warmupOptions.count) { idx in
                model.warmupFrames = warmupOptions[idx]
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Color(.systemBackground))
        .onAppear {
            resetState()
            loadTransposition()
            Task { await model.startLivePitchDetection(warmup: 0) }
        }
        .onDisappear {
            model.stopLivePitchDetection()
            model.stopExerciseSession()
        }
        .onChange(of: model.confirmedNoteSeq) { _ in
            guard let midi = model.confirmedLiveMidi else { return }
            concertMidi = midi
            guard midi >= model.rangeStart && midi <= model.rangeEnd else { return }
            var h = concertHistory + [midi]
            if h.count > 8 { h.removeFirst() }
            concertHistory = h
        }
        .onChange(of: model.liveMidi) { midi in
            if midi == nil { concertMidi = -1 }
        }
        .onChange(of: model.instrumentIndex) { _ in
            loadTransposition()
        }
    }

    private func resetState() {
        concertMidi = -1
        concertHistory = []
    }

    private func loadTransposition() {
        guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
              let arr = json as? [[String: Any]],
              arr.indices.contains(model.instrumentIndex) else {
            transpSemitones = 0
            return
        }
        transpSemitones = (arr[model.instrumentIndex]["semitones"] as? Int) ?? 0
    }

    @ViewBuilder
    private func sectionLabel(_ text: String) -> some View {
        // .secondary, not .erMuted — erMuted (#BDBDBD) is too pale for prompt text
        // that's meant to be read, not just glanced at; matches Android's
        // onSurfaceVariant, which is a dark, legible gray, not a light one.
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 6)
    }

    private func chipGrid(options: [String], selected: Int, count: Int, onSelect: @escaping (Int) -> Void) -> some View {
        LazyVGrid(
            columns: Array(repeating: GridItem(.flexible()), count: min(count, 6)),
            spacing: 6
        ) {
            ForEach(options.indices, id: \.self) { idx in
                Button(options[idx]) { onSelect(idx) }
                    .buttonStyle(ChipButtonStyle(selected: idx == selected))
            }
        }
    }
}
