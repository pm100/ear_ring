import SwiftUI

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
    private let bpmOptions = [60, 80, 100, 120, 140]
    private let noteDisplayOptions = [false, true]

    private var rootNoteIndex: Int { model.rootMidi % 12 }
    private var rootOctave: Int    { model.rootMidi / 12 - 1 }

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

                // ── Root Note ─────────────────────────────────────────────
                sectionLabel("Root Note").padding(.top, 28)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 50))], spacing: 6) {
                    ForEach(0..<12, id: \.self) { i in
                        Button(MusicTheory.NOTE_NAMES[i]) {
                            model.rootMidi = (rootOctave + 1) * 12 + i
                        }
                        .buttonStyle(ChipButtonStyle(selected: rootNoteIndex == i))
                    }
                }

                // ── Octave ────────────────────────────────────────────────
                sectionLabel("Octave").padding(.top, 16)
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible()), count: 3),
                    spacing: 6
                ) {
                    ForEach([3, 4, 5], id: \.self) { oct in
                        Button("\(oct)") {
                            model.rootMidi = (oct + 1) * 12 + rootNoteIndex
                        }
                        .buttonStyle(ChipButtonStyle(selected: rootOctave == oct))
                    }
                }

                // ── Scale ─────────────────────────────────────────────────
                sectionLabel("Scale").padding(.top, 16)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 6) {
                    ForEach(0..<MusicTheory.SCALE_NAMES.count, id: \.self) { i in
                        Button(MusicTheory.SCALE_NAMES[i]) {
                            model.scaleId = i
                        }
                        .buttonStyle(ChipButtonStyle(selected: model.scaleId == i))
                    }
                }

                // ── Sequence Length ───────────────────────────────────────
                sectionLabel("Sequence Length").padding(.top, 16)
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible()), count: 7),
                    spacing: 6
                ) {
                    ForEach(2...8, id: \.self) { len in
                        Button("\(len)") {
                            model.sequenceLength = len
                        }
                        .buttonStyle(ChipButtonStyle(selected: model.sequenceLength == len))
                    }
                }

                sectionLabel("Tempo (BPM)").padding(.top, 16)
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible()), count: bpmOptions.count),
                    spacing: 6
                ) {
                    ForEach(bpmOptions, id: \.self) { bpm in
                        Button("\(bpm)") {
                            model.tempoBpm = bpm
                        }
                        .buttonStyle(ChipButtonStyle(selected: model.tempoBpm == bpm))
                    }
                }

                sectionLabel("Display Test Notes").padding(.top, 16)
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible()), count: noteDisplayOptions.count),
                    spacing: 6
                ) {
                    ForEach(noteDisplayOptions, id: \.self) { show in
                        Button(show ? "Show" : "Hide") {
                            model.showTestNotes = show
                        }
                        .buttonStyle(ChipButtonStyle(selected: model.showTestNotes == show))
                    }
                }

                // ── Action buttons ────────────────────────────────────────
                VStack(spacing: 10) {
                    Button("▶ Start Exercise") {
                        model.startExerciseSession()
                        path.append(AppRoute.exercise)
                    }
                    .buttonStyle(PrimaryButtonStyle(height: 52, fontSize: 18))

                    Button("🎙 Mic Setup") {
                        path.append(AppRoute.setup)
                    }
                    .buttonStyle(OutlinedButtonStyle(height: 48, fontSize: 16))

                    Button("📊 Progress") {
                        path.append(AppRoute.progress)
                    }
                    .buttonStyle(OutlinedButtonStyle(height: 48, fontSize: 16))
                }
                .padding(.top, 32)
                .padding(.bottom, 16)
            }
            .padding(.horizontal, 16)
        }
        .background(Color(.systemBackground))
        .hideNavigationBar()
    }

    @ViewBuilder
    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundColor(.erMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 6)
    }
}
