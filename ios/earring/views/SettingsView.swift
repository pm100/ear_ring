import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: ExerciseModel
    @State private var showResetConfirm = false

    var body: some View {
        VStack(spacing: 0) {
            Text("Settings")
                .font(.title2.bold())
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 12)

            // A real List (not ScrollView+VStack) so Toggle renders as a true native UISwitch
            // and rows get the native grouped look (issues #30, #52).
            List {
                Section {
                    NavigationLink { InstrumentPlaybackSettings() } label: {
                        SettingsRow(title: "Instrument & Playback", symbol: "music.note",
                                    tint: .blue, value: currentInstrumentName)
                    }
                    NavigationLink { SoundDisplaySettings() } label: {
                        SettingsRow(title: "Sound & Display", symbol: "speaker.wave.2.fill", tint: .orange)
                    }
                    NavigationLink { ExerciseTimingSettings() } label: {
                        SettingsRow(title: "Exercise & Timing", symbol: "timer", tint: .green)
                    }
                }

                #if DEBUG
                // Debug-only: excluded from Release/TestFlight/App Store builds. Nothing else can
                // set isPremium true yet, so this is the only way to test the premium gate.
                Section {
                    Toggle("Debug: Premium", isOn: $model.isPremium)
                } footer: {
                    Text("Testing only — not shown in release builds.")
                }
                #endif

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
                } footer: {
                    Text("Build \(EarRingCore.gitHash())")
                        .font(.caption2)
                        .foregroundColor(.erMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 8)
                }
            }
            .listStyle(.insetGrouped)
        }
        .background(Color(.systemGroupedBackground))
        .hideNavigationBar()
    }

    private var currentInstrumentName: String {
        loadInstrumentList(premium: true).first { $0.id == model.instrumentIndex }?.name ?? "Piano"
    }
}

private struct InstrumentInfo: Identifiable {
    let id: Int
    let name: String
    let semitones: Int
    let premium: Bool
}

/// Premium instruments (Voice) are left out for a non-premium user; model.instrumentIndex is kept
/// off them by ExerciseModel's own safety net.
private func loadInstrumentList(premium: Bool) -> [InstrumentInfo] {
    guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
          let arr = json as? [[String: Any]] else {
        return [InstrumentInfo(id: 0, name: "Piano", semitones: 0, premium: false)]
    }
    return arr.compactMap { obj in
        guard let id = obj["id"] as? Int,
              let name = obj["name"] as? String,
              let semitones = obj["semitones"] as? Int else { return nil }
        let isPremiumInstrument = obj["premium"] as? Bool ?? false
        guard !isPremiumInstrument || premium else { return nil }
        return InstrumentInfo(id: id, name: name, semitones: semitones, premium: isPremiumInstrument)
    }
}

/// A native-style settings row: coloured icon tile, title, optional current value.
private struct SettingsRow: View {
    let title: String
    let symbol: String
    let tint: Color
    var value: String? = nil

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 29, height: 29)
                .background(tint)
                .clipShape(RoundedRectangle(cornerRadius: 6.5))
            Text(title)
            if let value {
                Spacer()
                Text(value).foregroundColor(.secondary)
            }
        }
    }
}

private func sectionLabel(_ text: String, tooltipKey: String? = nil) -> some View {
    // .erCaption, not .erMuted: the pale gray is too faint for prompt text meant to be read.
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

private struct InstrumentPlaybackSettings: View {
    @EnvironmentObject var model: ExerciseModel
    private let bpmOptions = [60, 80, 100, 120, 140]

    var body: some View {
        let instruments = loadInstrumentList(premium: model.isPremium)
        List {
            Section {
                HStack(spacing: 4) {
                    // Binding(get:set:) rather than $model.instrumentIndex: that sugar needs a real
                    // @Published property, but instrumentIndex is a computed proxy onto the Rust-owned
                    // settings blob (see ExerciseModel.swift).
                    Picker("Instrument", selection: Binding(
                        get: { model.instrumentIndex },
                        set: { model.instrumentIndex = $0 }
                    )) {
                        ForEach(instruments) { inst in
                            Text(inst.name).tag(inst.id)
                        }
                    }
                    .pickerStyle(.menu)
                    TooltipIcon(key: "instrument")
                }
            }
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    sectionLabel("Tempo (BPM)", tooltipKey: "tempo")
                    chipGrid(options: bpmOptions.map { "\($0)" },
                             selected: bpmOptions.firstIndex(of: model.tempoBpm) ?? 0,
                             count: bpmOptions.count) { idx in
                        model.tempoBpm = bpmOptions[idx]
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Instrument & Playback")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct SoundDisplaySettings: View {
    @EnvironmentObject var model: ExerciseModel
    private let introSoundOptions = ["Root Note", "Chord", "Arpeggio", "Scale", "None"]

    var body: some View {
        List {
            Section {
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
            }
            Section {
                HStack(spacing: 4) {
                    // Same Binding(get:set:) reasoning as the Instrument picker.
                    Picker("Intro Sound", selection: Binding(
                        get: { model.introSoundMode },
                        set: { model.introSoundMode = $0 }
                    )) {
                        ForEach(introSoundOptions.indices, id: \.self) { idx in
                            Text(introSoundOptions[idx]).tag(idx)
                        }
                    }
                    .pickerStyle(.menu)
                    TooltipIcon(key: "intro_sound")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Sound & Display")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ExerciseTimingSettings: View {
    @EnvironmentObject var model: ExerciseModel
    private let retryOptions = [1, 2, 3, 5, 8, 10]
    private let noteRetryOptions = [0, 1, 2, 3, 4, 5]
    private let wrongPauseOptions: [(UInt64, String)] = [
        (1_000_000_000, "1s"), (2_000_000_000, "2s"),
        (3_000_000_000, "3s"), (5_000_000_000, "5s")
    ]

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    sectionLabel("Max Retries", tooltipKey: "max_retries")
                    chipGrid(options: retryOptions.map { "\($0)" },
                             selected: retryOptions.firstIndex(of: model.maxRetries) ?? 0,
                             count: retryOptions.count) { idx in
                        model.maxRetries = retryOptions[idx]
                    }
                }
                .padding(.vertical, 6)
                VStack(alignment: .leading, spacing: 12) {
                    sectionLabel("Retry Same Note", tooltipKey: "retry_same_note")
                    chipGrid(options: noteRetryOptions.map { "\($0)" },
                             selected: noteRetryOptions.firstIndex(of: model.noteRetries) ?? 0,
                             count: noteRetryOptions.count) { idx in
                        model.noteRetries = noteRetryOptions[idx]
                    }
                }
                .padding(.vertical, 6)
            }
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    sectionLabel("Pause Before Playing", tooltipKey: "pause_before_playing")
                    Text("\(model.postChordGapNanoseconds / 1_000_000)ms")
                        .font(.caption).foregroundColor(.erCaption).frame(maxWidth: .infinity, alignment: .leading)
                    Slider(value: Binding(
                        get: { Double(model.postChordGapNanoseconds / 1_000_000) },
                        set: { model.postChordGapNanoseconds = UInt64($0) * 1_000_000 }
                    ), in: 400...2000, step: 100)
                }
                .padding(.vertical, 6)
                VStack(alignment: .leading, spacing: 12) {
                    sectionLabel("Wrong Note Pause", tooltipKey: "wrong_note_pause")
                    chipGrid(options: wrongPauseOptions.map { $0.1 },
                             selected: wrongPauseOptions.firstIndex(where: { $0.0 == model.wrongNotePauseNanoseconds }) ?? 0,
                             count: wrongPauseOptions.count) { idx in
                        model.wrongNotePauseNanoseconds = wrongPauseOptions[idx].0
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Exercise & Timing")
        .navigationBarTitleDisplayMode(.inline)
    }
}
