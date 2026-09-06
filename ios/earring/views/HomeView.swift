import SwiftUI
import UIKit

// MARK: - Brand colours

extension Color {
    static let erPrimary = Color(red: 0.247, green: 0.318, blue: 0.710)  // #3F51B5
    static let erSuccess = Color(red: 0.298, green: 0.686, blue: 0.314)  // #4CAF50
    static let erError   = Color(red: 0.957, green: 0.263, blue: 0.212)  // #F44336
    static let erWarning = Color(red: 1.000, green: 0.596, blue: 0.000)  // #FF9800
    static let erMuted   = Color(red: 0.741, green: 0.741, blue: 0.741)  // #BDBDBD
    static let erDark    = Color(red: 0.129, green: 0.129, blue: 0.129)  // #212121
}

// MARK: - Chip style (selected = filled primary, unselected = outlined primary)

struct ChipButtonStyle: ButtonStyle {
    var selected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .padding(.vertical, 6)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(selected ? Color.erPrimary : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color.erPrimary, lineWidth: 1.5)
                    .opacity(selected ? 0 : 1)
            )
            .foregroundColor(selected ? .white : .erPrimary)
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Primary filled button

struct PrimaryButtonStyle: ButtonStyle {
    var height: CGFloat = 52
    var fontSize: CGFloat = 17

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: fontSize, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: height)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.erPrimary))
            .foregroundColor(.white)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Outlined button

struct OutlinedButtonStyle: ButtonStyle {
    var height: CGFloat = 48
    var fontSize: CGFloat = 16

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: fontSize, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: height)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.erPrimary, lineWidth: 1.5)
            )
            .foregroundColor(.erPrimary)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Error (red filled) button

struct ErrorButtonStyle: ButtonStyle {
    var height: CGFloat = 52
    var fontSize: CGFloat = 17

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: fontSize, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: height)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color.erError))
            .foregroundColor(.white)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// Legacy alias so existing call-sites compile unchanged
typealias SecondaryButtonStyle = OutlinedButtonStyle

// MARK: - Card modifier (kept for any callers that need it)

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 2)
            )
    }
}

extension View {
    func cardStyle() -> some View { modifier(CardModifier()) }
}

// MARK: - HomeView

struct HomeView: View {
    @EnvironmentObject var model: ExerciseModel
    @Binding var path: NavigationPath
    @Environment(\.horizontalSizeClass) var hsc

    @State private var instrKeyTranspose: Int = 0
    @State private var showRangePicker: Bool = false

    private var isIPad: Bool { hsc == .regular }
    private var keyScale: CGFloat { isIPad ? 1.35 : 1.0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {

                // ── Title ──────────────────────────────────────────────────
                VStack(spacing: 6) {
                    Text("Ear Ring 🎵")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(.erPrimary)
                    Text("Ear Training")
                        .font(.system(size: 16))
                        .foregroundColor(.erMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 24)

                // ── Test Type ─────────────────────────────────────────────
                sectionLabel("Test Type").padding(.top, 28)
                Picker("Test Type", selection: Binding(
                    get: { model.testType },
                    set: { newType in
                        model.testType = newType
                        // Auto-clamp seqLen for diatonic mode
                        if newType == 2 && model.sequenceLength != 3 && model.sequenceLength != 4 {
                            model.sequenceLength = 3
                        }
                    }
                )) {
                    Text("Random Notes").tag(0)
                    Text("Diatonic Arpeggios").tag(2)
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)

                // ── Key + Scale (side by side) ────────────────────────────
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        sectionLabel("Key").padding(.top, 28)
                        Picker("Key", selection: Binding(
                            get: { model.rootNote },
                            set: { model.rootNote = $0; model.updateRangeForKey() }
                        )) {
                            // Options in written-chroma order; value is concert chroma.
                            ForEach(0..<12, id: \.self) { wc in
                                let concertChroma = (wc - instrKeyTranspose + 12) % 12
                                let writtenName = MusicTheory.NOTE_NAMES[wc]
                                let label = instrKeyTranspose != 0
                                    ? "\(writtenName) (concert \(MusicTheory.NOTE_NAMES[concertChroma]))"
                                    : writtenName
                                Text(label).tag(concertChroma)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 0) {
                        sectionLabel("Scale").padding(.top, 28)
                        Picker("Scale", selection: Binding(
                            get: { model.scaleId },
                            set: { model.scaleId = $0 }
                        )) {
                            ForEach(MusicTheory.SELECTABLE_SCALE_IDS, id: \.self) { i in
                                Text(EarRingCore.writtenScaleLabel(concertRootChroma: model.rootNote, scaleId: i, instrumentIndex: model.instrumentIndex)).tag(i)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .disabled(model.testType == 1)
                        .opacity(model.testType == 1 ? 0.38 : 1.0)
                    }
                    .frame(maxWidth: .infinity)
                }

                // ── Range: typed start/end fields, plus a button opening the piano
                // keyboard full-screen (it needs all the room it can get to stay tappable —
                // see PianoRangePickerFullScreen below for why this isn't a small sheet). ──
                sectionLabel("Range").padding(.top, 16)
                HStack(spacing: 10) {
                    RangeTextInputs(
                        rangeStart: model.rangeStart,
                        rangeEnd: model.rangeEnd,
                        enabled: model.testType != 1,
                        onRangeChange: model.testType == 1 ? { _, _ in } : { s, e in model.rangeStart = s; model.rangeEnd = e }
                    )
                    Button {
                        // Force any in-progress edit in the range fields to resign first
                        // responder (their commit only fires on real focus loss) before the
                        // full-screen picker opens over them — otherwise a value just typed
                        // and not yet blurred could be silently lost. Mirrors the equivalent
                        // fix on Android (LocalFocusManager.clearFocus()).
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                        showRangePicker = true
                    } label: {
                        Text("🎹")
                            .font(.system(size: 20))
                            .padding(.vertical, 8)
                            .padding(.horizontal, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(Color.erMuted, lineWidth: 1)
                            )
                    }
                }

                // ── Sequence Length ───────────────────────────────────────
                sectionLabel("Sequence Length").padding(.top, 16)
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible()), count: 8),
                    spacing: 6
                ) {
                    ForEach(1...8, id: \.self) { len in
                        let chipEnabled: Bool = {
                            if model.testType == 1 { return false }
                            if model.testType == 2 { return len == 3 || len == 4 }
                            return true
                        }()
                        Button("\(len)") {
                            if chipEnabled { model.sequenceLength = len }
                        }
                        .buttonStyle(ChipButtonStyle(selected: model.sequenceLength == len && chipEnabled))
                        .disabled(!chipEnabled)
                        .opacity(chipEnabled ? 1.0 : 0.38)
                    }
                }

                // ── Action buttons ────────────────────────────────────────
                VStack(spacing: 10) {
                    Button("▶ Start Exercise") {
                        model.startExerciseSession()
                        path.append(AppRoute.exercise)
                    }
                    .buttonStyle(PrimaryButtonStyle(height: 52, fontSize: 18))
                }
                .padding(.top, 32)
                .padding(.bottom, 16)
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: isIPad ? 680 : .infinity)
            .frame(maxWidth: .infinity)  // centre on iPad
        }
        .background(Color(.systemBackground))
        .hideNavigationBar()
        .onAppear { loadInstrTranspose() }
        .onChange(of: model.instrumentIndex) { _ in loadInstrTranspose() }
        .fullScreenCover(isPresented: $showRangePicker) {
            PianoRangePickerFullScreen(
                rangeStart: model.rangeStart,
                rangeEnd: model.rangeEnd,
                onRangeChange: model.testType == 1 ? { _, _ in } : { s, e in model.rangeStart = s; model.rangeEnd = e },
                onDone: { showRangePicker = false }
            )
        }
    }

    @ViewBuilder
    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundColor(.erMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 6)
    }

    private func loadInstrTranspose() {
        guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
              let arr = json as? [[String: Any]],
              arr.indices.contains(model.instrumentIndex) else {
            instrKeyTranspose = 0
            return
        }
        let sem = (arr[model.instrumentIndex]["semitones"] as? Int) ?? 0
        instrKeyTranspose = ((sem % 12) + 12) % 12
    }
}

/// Typed start/end note entry ("C4", "D5"), alongside the piano keyboard picker.
private struct RangeTextInputs: View {
    let rangeStart: Int
    let rangeEnd: Int
    let enabled: Bool
    let onRangeChange: (Int, Int) -> Void

    @State private var startText: String = ""
    @State private var endText: String = ""
    @FocusState private var startFocused: Bool
    @FocusState private var endFocused: Bool

    var body: some View {
        HStack(spacing: 10) {
            TextField("", text: $startText)
                .textFieldStyle(.roundedBorder)
                .frame(width: 70)
                .multilineTextAlignment(.center)
                .disabled(!enabled)
                .focused($startFocused)
                .onSubmit { commitStart() }
                .onChange(of: startFocused) { focused in if !focused { commitStart() } }
            Text("to")
            TextField("", text: $endText)
                .textFieldStyle(.roundedBorder)
                .frame(width: 70)
                .multilineTextAlignment(.center)
                .disabled(!enabled)
                .focused($endFocused)
                .onSubmit { commitEnd() }
                .onChange(of: endFocused) { focused in if !focused { commitEnd() } }
        }
        .onAppear {
            startText = MusicTheory.midiToLabel(rangeStart)
            endText = MusicTheory.midiToLabel(rangeEnd)
        }
        .onChange(of: rangeStart) { startText = MusicTheory.midiToLabel($0) }
        .onChange(of: rangeEnd) { endText = MusicTheory.midiToLabel($0) }
    }

    private func commitStart() {
        if let midi = EarRingCore.labelToMidi(startText), rangeEnd - midi >= 12 {
            onRangeChange(midi, rangeEnd)
        } else {
            startText = MusicTheory.midiToLabel(rangeStart) // invalid — revert to last valid value
        }
    }

    private func commitEnd() {
        if let midi = EarRingCore.labelToMidi(endText), midi - rangeStart >= 12 {
            onRangeChange(rangeStart, midi)
        } else {
            endText = MusicTheory.midiToLabel(rangeEnd) // invalid — revert to last valid value
        }
    }
}
