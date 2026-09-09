import SwiftUI

private struct SectionContainer: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.leading, 12)
            .overlay(alignment: .leading) {
                Rectangle().fill(Color.erMuted.opacity(0.4)).frame(width: 2)
            }
            .padding(.leading, 12)
            .padding(.bottom, 4)
    }
}

extension View {
    /// Indents and left-rules a DisclosureGroup's expanded content so it reads as
    /// visually contained under its header, matching Android's ExpandableSection.
    func sectionContained() -> some View {
        modifier(SectionContainer())
    }
}

struct SettingsView: View {
    @EnvironmentObject var model: ExerciseModel
    private let bpmOptions = [60, 80, 100, 120, 140]
    private let retryOptions = [1, 2, 3, 5, 8, 10]
    private let noteRetryOptions = [0, 1, 2, 3, 4, 5]
    private let wrongPauseOptions: [(UInt64, String)] = [
        (1_000_000_000, "1s"), (2_000_000_000, "2s"),
        (3_000_000_000, "3s"), (5_000_000_000, "5s")
    ]
    private let introSoundOptions = ["Root Note", "Chord", "Arpeggio", "Scale", "None"]

    private struct InstrumentInfo: Identifiable {
        let id: Int
        let name: String
        let semitones: Int
    }

    @State private var instruments: [InstrumentInfo] = []
    @State private var showResetConfirm = false

    // All sections start collapsed.
    @State private var expandInstrumentPlayback = false
    @State private var expandSoundDisplay = false
    @State private var expandExerciseTiming = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Settings")
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.bottom, 8)

                DisclosureGroup(isExpanded: $expandInstrumentPlayback) {
                    VStack(alignment: .leading, spacing: 0) {
                        sectionLabel("Instrument").padding(.top, 8)
                        Picker("Instrument", selection: $model.instrumentIndex) {
                            ForEach(instruments) { inst in
                                Text(inst.name).tag(inst.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 4)

                        sectionLabel("Tempo (BPM)").padding(.top, 8)
                        chipGrid(options: bpmOptions.map { "\($0)" },
                                 selected: bpmOptions.firstIndex(of: model.tempoBpm) ?? 0,
                                 count: bpmOptions.count) { idx in
                            model.tempoBpm = bpmOptions[idx]
                        }
                    }
                    .sectionContained()
                } label: { sectionHeader("Instrument & Playback") }
                Divider()

                DisclosureGroup(isExpanded: $expandSoundDisplay) {
                    VStack(alignment: .leading, spacing: 0) {
                        Toggle(isOn: Binding(
                            get: { model.playPassFailSounds },
                            set: { model.playPassFailSounds = $0 }
                        )) {
                            Text("Play Pass/Fail Sounds")
                        }
                        Text("A chime when a test is passed, a different tone when it fails")
                            .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)

                        sectionLabel("Intro Sound").padding(.top, 8)
                        Text("What plays before each test")
                            .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)
                        Picker("Intro Sound", selection: $model.introSoundMode) {
                            ForEach(introSoundOptions.indices, id: \.self) { idx in
                                Text(introSoundOptions[idx]).tag(idx)
                            }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 4)

                        Toggle(isOn: Binding(
                            get: { model.showTestNotes },
                            set: { model.showTestNotes = $0 }
                        )) {
                            Text("Display Test Notes")
                        }
                        .padding(.top, 8)
                        Toggle(isOn: Binding(
                            get: { model.keySignatureMode == 1 },
                            set: { model.keySignatureMode = $0 ? 1 : 0 }
                        )) {
                            Text("Use Key Signature")
                        }
                    }
                    .sectionContained()
                } label: { sectionHeader("Sound & Display") }
                Divider()

                DisclosureGroup(isExpanded: $expandExerciseTiming) {
                    VStack(alignment: .leading, spacing: 0) {
                        sectionLabel("Max Retries").padding(.top, 8)
                        Text("Attempts per test before moving on")
                            .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)
                        chipGrid(options: retryOptions.map { "\($0)" },
                                 selected: retryOptions.firstIndex(of: model.maxRetries) ?? 0,
                                 count: retryOptions.count) { idx in
                            model.maxRetries = retryOptions[idx]
                        }

                        sectionLabel("Retry Same Note").padding(.top, 8)
                        Text("Tries allowed on a wrong note before the whole test restarts — each retry costs a few points (0 = off)")
                            .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)
                        chipGrid(options: noteRetryOptions.map { "\($0)" },
                                 selected: noteRetryOptions.firstIndex(of: model.noteRetries) ?? 0,
                                 count: noteRetryOptions.count) { idx in
                            model.noteRetries = noteRetryOptions[idx]
                        }

                        sectionLabel("Pause Before Playing").padding(.top, 8)
                        Text("Gap between chord and test sequence: \(model.postChordGapNanoseconds / 1_000_000)ms")
                            .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 4)
                        Slider(value: Binding(
                            get: { Double(model.postChordGapNanoseconds / 1_000_000) },
                            set: { model.postChordGapNanoseconds = UInt64($0) * 1_000_000 }
                        ), in: 400...2000, step: 100)

                        sectionLabel("Wrong Note Pause").padding(.top, 8)
                        Text("How long to display a wrong note before replaying")
                            .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)
                        chipGrid(options: wrongPauseOptions.map { $0.1 },
                                 selected: wrongPauseOptions.firstIndex(where: { $0.0 == model.wrongNotePauseNanoseconds }) ?? 0,
                                 count: wrongPauseOptions.count) { idx in
                            model.wrongNotePauseNanoseconds = wrongPauseOptions[idx].0
                        }
                    }
                    .sectionContained()
                } label: { sectionHeader("Exercise & Timing") }
                Divider()

                Spacer(minLength: 32)

                Button(action: { showResetConfirm = true }) {
                    Text("Reset to Defaults")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .alert("Reset Settings?", isPresented: $showResetConfirm) {
                    Button("Reset", role: .destructive) { model.resetSettings() }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    Text("All settings will be restored to their defaults. Your progress history will not be affected.")
                }

                Text("Build \(EarRingCore.gitHash())")
                    .font(.caption2)
                    .foregroundColor(.erMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 16)

                Spacer(minLength: 24)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
        .background(Color(.systemBackground))
        .hideNavigationBar()
        .onAppear {
            loadInstruments()
        }
    }

    private func loadInstruments() {
        guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
              let arr = json as? [[String: Any]] else {
            instruments = [InstrumentInfo(id: 0, name: "Piano", semitones: 0)]
            return
        }
        instruments = arr.compactMap { obj in
            guard let id = obj["id"] as? Int,
                  let name = obj["name"] as? String,
                  let semitones = obj["semitones"] as? Int else { return nil }
            return InstrumentInfo(id: id, name: name, semitones: semitones)
        }
    }

    @ViewBuilder
    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption.weight(.bold))
            .foregroundColor(.erPrimary)
            .padding(.vertical, 8)
    }

    @ViewBuilder
    private func sectionLabel(_ text: String) -> some View {
        // Distinctly larger than the .caption explanatory text below each control
        // (matches Android's SectionLabel, which uses labelLarge vs a 12sp caption —
        // same-size text differing only by weight reads as near-identical at a glance).
        // .erCaption, not .erMuted — erMuted (#BDBDBD) is too pale for prompt text
        // that's meant to be read, not just glanced at; erCaption is a literal match
        // for Android's onSurfaceVariant, which is a dark, legible gray.
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundColor(.erCaption)
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
