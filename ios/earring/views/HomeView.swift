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
    // Matches Android's Material3 onSurfaceVariant default (#49454F) exactly, for
    // labels/captions/status text that must stay legible — erMuted (#BDBDBD) is a
    // light gray meant for borders/icons/idle-state visuals, not text meant to be
    // read; SwiftUI's semantic .secondary renders noticeably lighter than Android's
    // onSurfaceVariant on this app's background, so a literal color match is used
    // here instead of relying on it.
    static let erCaption = Color(red: 0.286, green: 0.271, blue: 0.310)  // #49454F
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

// Legacy alias so existing call-sites compile unchanged
typealias SecondaryButtonStyle = OutlinedButtonStyle

// MARK: - Tonal button
// A light-filled secondary style, for pairing next to a PrimaryButtonStyle
// sibling (e.g. Exercise's Repeat next to Stop Testing) where a bare outline
// reads as the "colorless"/lesser one instead of a deliberate secondary
// action. Same fill as Android's primaryContainer (Indigo 50, #E8EAF6).
struct TonalButtonStyle: ButtonStyle {
    var height: CGFloat = 52
    var fontSize: CGFloat = 17

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: fontSize, weight: .semibold))
            .frame(maxWidth: .infinity, minHeight: height)
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(red: 0.910, green: 0.918, blue: 0.965)))
            .foregroundColor(.erPrimary)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

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

// MARK: - Outlined dropdown (matches Android's ExposedDropdownMenuBox styling)

struct DropdownOption<Value: Hashable>: Hashable {
    let value: Value
    let label: String
}

/// A full-width outlined box showing the current selection with a trailing chevron,
/// opening a native menu of options on tap — visually matches Android's
/// `ExposedDropdownMenuBox` + `OutlinedTextField(readOnly = true)` pattern (see
/// `android/.../ui/HomeScreen.kt`), which SwiftUI's bare `Picker(.menu)` style does
/// not (it renders as small unboxed text with no border — see issue #30).
struct OutlinedDropdown<Value: Hashable>: View {
    let selectedLabel: String
    let options: [DropdownOption<Value>]
    let enabled: Bool
    let onSelect: (Value) -> Void

    var body: some View {
        Menu {
            ForEach(options, id: \.self) { option in
                Button(option.label) { onSelect(option.value) }
            }
        } label: {
            HStack(spacing: 6) {
                Text(selectedLabel)
                    .font(.system(size: 16))
                    .foregroundColor(enabled ? .primary : .erMuted)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer()
                Image(systemName: "chevron.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.erMuted)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(Color.erMuted, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .disabled(!enabled)
    }
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
                    HStack(spacing: 12) {
                        Image("AppLogo")
                            .resizable()
                            .frame(width: 48, height: 48)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        Text("Ear Ring")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.erPrimary)
                    }
                    Text("Ear Training")
                        .font(.system(size: 16))
                        .foregroundColor(.erCaption)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 24)

                // ── Test Type ─────────────────────────────────────────────
                sectionLabel("Test Type").padding(.top, 28)
                OutlinedDropdown(
                    selectedLabel: model.testType == 2 ? "Diatonic Arpeggios" : "Random Notes",
                    options: [DropdownOption(value: 0, label: "Random Notes"), DropdownOption(value: 2, label: "Diatonic Arpeggios")],
                    enabled: true,
                    onSelect: { newType in
                        model.testType = newType
                        // Auto-clamp seqLen for diatonic mode
                        if newType == 2 && model.sequenceLength != 3 && model.sequenceLength != 4 {
                            model.sequenceLength = 3
                        }
                    }
                )

                // ── Key + Scale (side by side) ────────────────────────────
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        sectionLabel("Key").padding(.top, 28)
                        OutlinedDropdown(
                            selectedLabel: {
                                let writtenRoot = (model.rootNote + instrKeyTranspose) % 12
                                return instrKeyTranspose != 0
                                    ? "\(MusicTheory.NOTE_NAMES[writtenRoot]) (concert \(MusicTheory.NOTE_NAMES[model.rootNote]))"
                                    : MusicTheory.NOTE_NAMES[model.rootNote]
                            }(),
                            options: (0..<12).map { wc -> DropdownOption<Int> in
                                let concertChroma = (wc - instrKeyTranspose + 12) % 12
                                let writtenName = MusicTheory.NOTE_NAMES[wc]
                                let label = instrKeyTranspose != 0
                                    ? "\(writtenName) (concert \(MusicTheory.NOTE_NAMES[concertChroma]))"
                                    : writtenName
                                return DropdownOption(value: concertChroma, label: label)
                            },
                            enabled: true,
                            onSelect: { model.rootNote = $0; model.updateRangeForKey() }
                        )
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 0) {
                        sectionLabel("Scale").padding(.top, 28)
                        OutlinedDropdown(
                            selectedLabel: EarRingCore.writtenScaleLabel(concertRootChroma: model.rootNote, scaleId: model.scaleId, instrumentIndex: model.instrumentIndex),
                            options: MusicTheory.SELECTABLE_SCALE_IDS.map { i in
                                DropdownOption(value: i, label: EarRingCore.writtenScaleLabel(concertRootChroma: model.rootNote, scaleId: i, instrumentIndex: model.instrumentIndex))
                            },
                            enabled: model.testType != 1,
                            onSelect: { model.scaleId = $0 }
                        )
                        .opacity(model.testType == 1 ? 0.38 : 1.0)
                    }
                    .frame(maxWidth: .infinity)
                }

                // ── Range: typed start/end fields, plus a button opening the piano
                // keyboard full-screen (it needs all the room it can get to stay tappable —
                // see PianoRangePickerFullScreen below for why this isn't a small sheet). ──
                sectionLabel("Range").padding(.top, 16)
                // .bottom, not the default .center — RangeTextInputs now has a small
                // caption above each field (see below), so the piano button needs to
                // align with the actual text-entry row, not the row's overall top.
                HStack(alignment: .bottom, spacing: 10) {
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
                                // cornerRadius 6, not 8 — matches OutlinedDropdown's border
                                // radius elsewhere on this screen instead of being a
                                // slightly-off outlier next to it.
                                RoundedRectangle(cornerRadius: 6)
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
            .foregroundColor(.erCaption)
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
        // A small caption above each field is the only visible cue that these are
        // editable text entry (not a static display) — SwiftUI's plain roundedBorder
        // TextField has no built-in floating label like Android's OutlinedTextField,
        // and the field's own text is never empty, so a placeholder would never show.
        HStack(alignment: .bottom, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Start")
                    .font(.caption2)
                    .foregroundColor(.erCaption)
                TextField("", text: $startText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 70)
                    .multilineTextAlignment(.center)
                    .disabled(!enabled)
                    .focused($startFocused)
                    .onSubmit { commitStart() }
                    .onChange(of: startFocused) { focused in if !focused { commitStart() } }
            }
            Text("to")
                .fixedSize()
                .padding(.bottom, 6)
            VStack(alignment: .leading, spacing: 2) {
                Text("End")
                    .font(.caption2)
                    .foregroundColor(.erCaption)
                TextField("", text: $endText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 70)
                    .multilineTextAlignment(.center)
                    .disabled(!enabled)
                    .focused($endFocused)
                    .onSubmit { commitEnd() }
                    .onChange(of: endFocused) { focused in if !focused { commitEnd() } }
            }
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
