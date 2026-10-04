import SwiftUI

private struct WelcomeStep {
    let id: String
    let title: String
    let body: String
    let primaryLabel: String
    let hint: String
    let success: String
    let exitLabel: String
}

private func parseWelcomeSteps(_ json: String) -> [WelcomeStep] {
    guard let data = json.data(using: .utf8),
          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else { return [] }
    return arr.map { o in
        WelcomeStep(id: o["id"] ?? "", title: o["title"] ?? "", body: o["body"] ?? "",
                    primaryLabel: o["primaryLabel"] ?? "Next", hint: o["hint"] ?? "",
                    success: o["success"] ?? "",
                    exitLabel: o["exitLabel"] ?? "")
    }
}

/// First-run welcome flow (issue #43). Step text comes from the Rust core.
struct WelcomeView: View {
    @EnvironmentObject var model: ExerciseModel
    let onFinished: () -> Void

    private let steps = parseWelcomeSteps(EarRingCore.onboardingSteps())
    @State private var index = 0
    @State private var micHeard = false

    var body: some View {
        if steps.isEmpty {
            Color.clear.onAppear { onFinished() }
        } else {
            let step = steps[min(index, steps.count - 1)]
            let isMic = step.id == "mic"
            // The content scrolls; the buttons stay pinned below it so Next and Back are
            // always visible, even beside the tall embedded Mic Setup screen.
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    if !step.exitLabel.isEmpty {
                        Button(step.exitLabel) { onFinished() }
                    }
                }
                .frame(minHeight: 44)
                .padding(.horizontal, 24)

                ScrollView {
                    VStack(spacing: 0) {
                        Text("Step \(index + 1) of \(steps.count)")
                            .font(.caption).foregroundColor(.secondary)
                        Text(step.title)
                            .font(.title2.bold()).multilineTextAlignment(.center)
                            .padding(.top, 16)
                        VStack(spacing: 8) {
                            ForEach(step.body.components(separatedBy: "\n\n"), id: \.self) { para in
                                Text(para.trimmingCharacters(in: .whitespacesAndNewlines))
                                    .font(.body).multilineTextAlignment(.center)
                            }
                        }
                        .padding(.top, 16)

                        Group {
                            if step.id == "instrument" { InstrumentChoice() }
                            if isMic { MicCheck(step: step, heard: $micHeard) }
                        }
                        .padding(.top, 20)
                    }
                    .frame(maxWidth: 520)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 24)
                    .frame(maxWidth: .infinity)
                }

                VStack(spacing: 4) {
                    Button {
                        advance()
                    } label: {
                        Text(step.primaryLabel).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.erPrimary)
                    .disabled(isMic && !micHeard)

                    HStack {
                        if index > 0 {
                            Button("\u{2190} Back") { index -= 1 }
                        }
                        Spacer()
                    }
                    .frame(minHeight: 36)
                }
                .frame(maxWidth: 520)
                .padding(.horizontal, 24)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity)
                .background(Color(.systemBackground))
            }
            .background(Color(.systemBackground))
        }
    }

    private func advance() {
        if index >= steps.count - 1 { onFinished() } else { index += 1 }
    }
}

private struct InstrumentChoice: View {
    @EnvironmentObject var model: ExerciseModel

    private var instruments: [(id: Int, name: String, semitones: Int)] {
        guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
              let arr = json as? [[String: Any]] else { return [(0, "Piano", 0)] }
        return arr.compactMap { obj in
            guard let id = obj["id"] as? Int, let name = obj["name"] as? String,
                  let semis = obj["semitones"] as? Int else { return nil }
            guard !(obj["premium"] as? Bool ?? false) || model.isPremium else { return nil }
            return (id, name, semis)
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            Picker("Instrument", selection: Binding(
                get: { model.instrumentIndex },
                set: { model.instrumentIndex = $0 }
            )) {
                ForEach(instruments, id: \.id) { Text($0.name).tag($0.id) }
            }
            .pickerStyle(.menu)
            // Concert pitch, the same as the Range on Home.
            Text("Range: \(MusicTheory.midiToLabel(model.rangeStart)) to \(MusicTheory.midiToLabel(model.rangeEnd))")
                .font(.subheadline).foregroundColor(.secondary)
        }
    }
}

/// The real Mic Setup screen (staff, tuner meter, sensitivity, Advanced), embedded. iOS shows its
/// microphone prompt when capture starts, i.e. when this step opens.
private struct MicCheck: View {
    let step: WelcomeStep
    @Binding var heard: Bool
    @State private var showHint = false

    var body: some View {
        VStack(spacing: 8) {
            SetupView(embedded: true, onNoteHeard: { heard = true })
                .frame(height: 560)
            if heard {
                Text("\u{2713} " + step.success)
                    .font(.subheadline.weight(.semibold)).foregroundColor(.erPrimary)
            } else if showHint {
                Text(step.hint).font(.subheadline).multilineTextAlignment(.center)
            }
        }
        .task {
            try? await Task.sleep(nanoseconds: 10_000_000_000)
            showHint = true
        }
    }
}
