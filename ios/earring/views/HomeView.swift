import SwiftUI

// MARK: - Shared button / card styles

struct ChipButtonStyle: ButtonStyle {
    var selected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.callout.weight(.medium))
            .padding(.vertical, 6)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(selected ? Color.indigo : Color(.systemGray5))
            )
            .foregroundColor(selected ? .white : .primary)
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.indigo)
            )
            .foregroundColor(.white)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color.indigo, lineWidth: 1.5)
            )
            .foregroundColor(.indigo)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

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
    func cardStyle() -> some View {
        modifier(CardModifier())
    }
}

// MARK: - HomeView

struct HomeView: View {
    @EnvironmentObject var model: ExerciseModel
    @Binding var path: NavigationPath

    private var rootNoteIndex: Int { model.rootMidi % 12 }
    private var rootOctave: Int { model.rootMidi / 12 - 1 }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {

                // Title area
                VStack(spacing: 6) {
                    Image(systemName: "music.note")
                        .font(.system(size: 40))
                        .foregroundColor(.indigo)
                    Text("Ear Ring")
                        .font(.largeTitle.bold())
                    Text("Train your musical ear")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 20)

                // Root note section
                VStack(alignment: .leading, spacing: 10) {
                    Label("Root Note", systemImage: "music.quarternote.3")
                        .font(.headline)
                    LazyVGrid(
                        columns: Array(repeating: GridItem(.flexible()), count: 6),
                        spacing: 8
                    ) {
                        ForEach(0..<12, id: \.self) { i in
                            Button(MusicTheory.NOTE_NAMES[i]) {
                                model.rootMidi = (rootOctave + 1) * 12 + i
                            }
                            .buttonStyle(ChipButtonStyle(selected: rootNoteIndex == i))
                        }
                    }
                }
                .cardStyle()

                // Octave section
                VStack(alignment: .leading, spacing: 10) {
                    Label("Octave", systemImage: "dial.medium")
                        .font(.headline)
                    HStack(spacing: 10) {
                        ForEach([3, 4, 5], id: \.self) { oct in
                            Button("\(oct)") {
                                model.rootMidi = (oct + 1) * 12 + rootNoteIndex
                            }
                            .buttonStyle(ChipButtonStyle(selected: rootOctave == oct))
                        }
                        Spacer()
                    }
                }
                .cardStyle()

                // Scale section
                VStack(alignment: .leading, spacing: 10) {
                    Label("Scale", systemImage: "waveform.path")
                        .font(.headline)
                    LazyVGrid(
                        columns: Array(repeating: GridItem(.flexible()), count: 2),
                        spacing: 8
                    ) {
                        ForEach(0..<MusicTheory.SCALE_NAMES.count, id: \.self) { i in
                            Button(MusicTheory.SCALE_NAMES[i]) {
                                model.scaleId = i
                            }
                            .buttonStyle(ChipButtonStyle(selected: model.scaleId == i))
                        }
                    }
                }
                .cardStyle()

                // Sequence length section
                VStack(alignment: .leading, spacing: 10) {
                    Label("Sequence Length", systemImage: "list.number")
                        .font(.headline)
                    HStack(spacing: 8) {
                        ForEach(2...8, id: \.self) { len in
                            Button("\(len)") {
                                model.sequenceLength = len
                            }
                            .buttonStyle(ChipButtonStyle(selected: model.sequenceLength == len))
                        }
                        Spacer()
                    }
                }
                .cardStyle()

                // Action buttons
                VStack(spacing: 12) {
                    Button("Start Exercise") {
                        model.generateSequence()
                        path.append(AppRoute.exercise)
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button("Mic Setup") {
                        path.append(AppRoute.setup)
                    }
                    .buttonStyle(SecondaryButtonStyle())

                    Button("View Progress") {
                        path.append(AppRoute.progress)
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                .padding(.bottom, 30)
            }
            .padding(.horizontal)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Ear Ring")
        .navigationBarTitleDisplayMode(.inline)
    }
}
