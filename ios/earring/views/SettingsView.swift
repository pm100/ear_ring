import SwiftUI

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
        VStack(spacing: 0) {
            Text("Settings")
                .font(.title2.bold())
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 12)

            // A real List/Form (not ScrollView+VStack) so Toggle renders as a true
            // native UISwitch — outside a List, SwiftUI falls back to a simplified
            // custom-drawn switch whose knob touches the track with no margin,
            // unlike every native toggle elsewhere in iOS (issue found during the
            // UI review, issue #30: "the round slider is an oval... clipped on the
            // right" — that was this exact fallback rendering, not a design choice).
            List {
                Section {
                    DisclosureGroup(isExpanded: $expandInstrumentPlayback) {
                        VStack(alignment: .leading, spacing: 16) {
                            // No separate sectionLabel here — the Picker's own
                            // "Instrument" label already names the row (shown as
                            // "Instrument   Piano ⌄"), so a label above it just
                            // repeated the word.
                            HStack(spacing: 4) {
                                Picker("Instrument", selection: $model.instrumentIndex) {
                                    ForEach(instruments) { inst in
                                        Text(inst.name).tag(inst.id)
                                    }
                                }
                                .pickerStyle(.menu)
                                TooltipIcon(key: "instrument")
                                Spacer()
                            }

                            sectionLabel("Tempo (BPM)", tooltipKey: "tempo")
                            chipGrid(options: bpmOptions.map { "\($0)" },
                                     selected: bpmOptions.firstIndex(of: model.tempoBpm) ?? 0,
                                     count: bpmOptions.count) { idx in
                                model.tempoBpm = bpmOptions[idx]
                            }
                        }
                        .padding(.vertical, 6)
                    } label: { sectionHeader("Instrument & Playback") }
                }

                Section {
                    DisclosureGroup(isExpanded: $expandSoundDisplay) {
                        VStack(alignment: .leading, spacing: 16) {
                            Toggle(isOn: Binding(
                                get: { model.playPassFailSounds },
                                set: { model.playPassFailSounds = $0 }
                            )) {
                                HStack(spacing: 4) {
                                    Text("Play Pass/Fail Sounds")
                                    TooltipIcon(key: "play_pass_fail_sounds")
                                }
                            }
                            Toggle(isOn: Binding(
                                get: { model.showTestNotes },
                                set: { model.showTestNotes = $0 }
                            )) {
                                HStack(spacing: 4) {
                                    Text("Display Test Notes")
                                    TooltipIcon(key: "display_test_notes")
                                }
                            }
                            Toggle(isOn: Binding(
                                get: { model.keySignatureMode == 1 },
                                set: { model.keySignatureMode = $0 ? 1 : 0 }
                            )) {
                                HStack(spacing: 4) {
                                    Text("Use Key Signature")
                                    TooltipIcon(key: "use_key_signature")
                                }
                            }

                            HStack(spacing: 4) {
                                Picker("Intro Sound", selection: $model.introSoundMode) {
                                    ForEach(introSoundOptions.indices, id: \.self) { idx in
                                        Text(introSoundOptions[idx]).tag(idx)
                                    }
                                }
                                .pickerStyle(.menu)
                                TooltipIcon(key: "intro_sound")
                                Spacer()
                            }
                        }
                        .padding(.vertical, 6)
                    } label: { sectionHeader("Sound & Display") }
                }

                Section {
                    DisclosureGroup(isExpanded: $expandExerciseTiming) {
                        // Explanatory captions removed under each label here — redundant
                        // now that every label has a tooltip icon (issue #11). Pause
                        // Before Playing keeps its live ms readout since the Slider
                        // itself shows no value of its own.
                        VStack(alignment: .leading, spacing: 16) {
                            sectionLabel("Max Retries", tooltipKey: "max_retries")
                            chipGrid(options: retryOptions.map { "\($0)" },
                                     selected: retryOptions.firstIndex(of: model.maxRetries) ?? 0,
                                     count: retryOptions.count) { idx in
                                model.maxRetries = retryOptions[idx]
                            }

                            sectionLabel("Retry Same Note", tooltipKey: "retry_same_note")
                            chipGrid(options: noteRetryOptions.map { "\($0)" },
                                     selected: noteRetryOptions.firstIndex(of: model.noteRetries) ?? 0,
                                     count: noteRetryOptions.count) { idx in
                                model.noteRetries = noteRetryOptions[idx]
                            }

                            sectionLabel("Pause Before Playing", tooltipKey: "pause_before_playing")
                            Text("\(model.postChordGapNanoseconds / 1_000_000)ms")
                                .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading)
                            Slider(value: Binding(
                                get: { Double(model.postChordGapNanoseconds / 1_000_000) },
                                set: { model.postChordGapNanoseconds = UInt64($0) * 1_000_000 }
                            ), in: 400...2000, step: 100)

                            sectionLabel("Wrong Note Pause", tooltipKey: "wrong_note_pause")
                            chipGrid(options: wrongPauseOptions.map { $0.1 },
                                     selected: wrongPauseOptions.firstIndex(where: { $0.0 == model.wrongNotePauseNanoseconds }) ?? 0,
                                     count: wrongPauseOptions.count) { idx in
                                model.wrongNotePauseNanoseconds = wrongPauseOptions[idx].0
                            }
                        }
                        .padding(.vertical, 6)
                    } label: { sectionHeader("Exercise & Timing") }
                }

                Section {
                    Button(action: { showResetConfirm = true }) {
                        Text("Reset to Defaults")
                            .frame(maxWidth: .infinity)
                    }
                    .foregroundColor(.erError)
                    .alert("Reset Settings?", isPresented: $showResetConfirm) {
                        Button("Reset", role: .destructive) { model.resetSettings() }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("All settings will be restored to their defaults. Your progress history will not be affected.")
                    }
                }

                Section {
                    Text("Build \(EarRingCore.gitHash())")
                        .font(.caption2)
                        .foregroundColor(.erMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .listRowBackground(Color.clear)
            }
            .listStyle(.insetGrouped)
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
    }

    @ViewBuilder
    private func sectionLabel(_ text: String, tooltipKey: String? = nil) -> some View {
        // Distinctly larger than the .caption explanatory text below each control
        // (matches Android's SectionLabel, which uses labelLarge vs a 12sp caption —
        // same-size text differing only by weight reads as near-identical at a glance).
        // .erCaption, not .erMuted — erMuted (#BDBDBD) is too pale for prompt text
        // that's meant to be read, not just glanced at; erCaption is a literal match
        // for Android's onSurfaceVariant, which is a dark, legible gray.
        HStack(spacing: 4) {
            Text(text)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.erCaption)
            if let tooltipKey {
                TooltipIcon(key: tooltipKey)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
