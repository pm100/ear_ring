import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: ExerciseModel
    private let bpmOptions = [60, 80, 100, 120, 140]
    private let retryOptions = [1, 2, 3, 5, 8, 10]
    private let stabilityOptions = [2, 3, 4, 5]
    private let warmupOptions = [0, 1, 2, 3, 4, 5, 6]
    private let wrongPauseOptions: [(UInt64, String)] = [
        (1_000_000_000, "1s"), (2_000_000_000, "2s"),
        (3_000_000_000, "3s"), (5_000_000_000, "5s")
    ]

    private struct InstrumentInfo: Identifiable {
        let id: Int
        let name: String
        let semitones: Int
    }

    @State private var instruments: [InstrumentInfo] = []
    @State private var showResetConfirm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                sectionHeader("Instrument")
                sectionLabel("Instrument").padding(.top, 8)
                Picker("Instrument", selection: $model.instrumentIndex) {
                    ForEach(instruments) { inst in
                        Text(inst.name).tag(inst.id)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 4)

                sectionHeader("Playback")
                sectionLabel("Tempo (BPM)").padding(.top, 8)
                chipGrid(options: bpmOptions.map { "\($0)" },
                         selected: bpmOptions.firstIndex(of: model.tempoBpm) ?? 0,
                         count: bpmOptions.count) { idx in
                    model.tempoBpm = bpmOptions[idx]
                }

                sectionHeader("Exercise").padding(.top, 16)
                sectionLabel("Max Retries").padding(.top, 8)
                Text("Attempts per test before moving on")
                    .font(.caption).foregroundColor(.erMuted).padding(.bottom, 6)
                chipGrid(options: retryOptions.map { "\($0)" },
                         selected: retryOptions.firstIndex(of: model.maxRetries) ?? 0,
                         count: retryOptions.count) { idx in
                    model.maxRetries = retryOptions[idx]
                }

                sectionHeader("Pitch Detection").padding(.top, 16)
                sectionLabel("Mic Sensitivity").padding(.top, 8)
                Text("Silence threshold: \(String(format: "%.3f", model.silenceThreshold)) — lower = picks up quieter sounds")
                    .font(.caption).foregroundColor(.erMuted).padding(.bottom, 4)
                Slider(value: Binding(
                    get: { Double(model.silenceThreshold) },
                    set: { model.silenceThreshold = Float($0) }
                ), in: 0.001...0.010, step: 0.001)

                sectionLabel("Note Stability").padding(.top, 8)
                Text("Consecutive stable frames before confirming a note")
                    .font(.caption).foregroundColor(.erMuted).padding(.bottom, 6)
                chipGrid(options: stabilityOptions.map { "\($0)" },
                         selected: stabilityOptions.firstIndex(of: model.framesToConfirm) ?? 0,
                         count: stabilityOptions.count) { idx in
                    model.framesToConfirm = stabilityOptions[idx]
                }

                sectionLabel("Mic Warmup Frames").padding(.top, 8)
                Text("Frames discarded when mic opens (both Exercise and Mic Setup)")
                    .font(.caption).foregroundColor(.erMuted).padding(.bottom, 6)
                chipGrid(options: warmupOptions.map { "\($0)" },
                         selected: warmupOptions.firstIndex(of: model.warmupFrames) ?? 4,
                         count: warmupOptions.count) { idx in
                    model.warmupFrames = warmupOptions[idx]
                }

                sectionHeader("Timing").padding(.top, 16)
                sectionLabel("Pause Before Playing").padding(.top, 8)
                Text("Gap between chord and test sequence: \(model.postChordGapNanoseconds / 1_000_000)ms")
                    .font(.caption).foregroundColor(.erMuted).padding(.bottom, 4)
                Slider(value: Binding(
                    get: { Double(model.postChordGapNanoseconds / 1_000_000) },
                    set: { model.postChordGapNanoseconds = UInt64($0) * 1_000_000 }
                ), in: 400...2000, step: 100)

                sectionLabel("Wrong Note Pause").padding(.top, 8)
                Text("How long to display a wrong note before replaying")
                    .font(.caption).foregroundColor(.erMuted).padding(.bottom, 6)
                chipGrid(options: wrongPauseOptions.map { $0.1 },
                         selected: wrongPauseOptions.firstIndex(where: { $0.0 == model.wrongNotePauseNanoseconds }) ?? 0,
                         count: wrongPauseOptions.count) { idx in
                    model.wrongNotePauseNanoseconds = wrongPauseOptions[idx].0
                }

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
            .padding(.top, 8)
    }

    @ViewBuilder
    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundColor(.erMuted)
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
