import SwiftUI

struct ExerciseView: View {
    @EnvironmentObject var model: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel
    @Binding var path: NavigationPath

    @State private var sessionSaved = false

    private var titleText: String {
        "\(MusicTheory.midiToLabel(model.rootMidi)) \(MusicTheory.SCALE_NAMES[model.scaleId])"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Music staff ───────────────────────────────────────────────
            Spacer().frame(height: 8)
            MusicStaffView(
                expectedNotes: model.sequence,
                detectedNotes: model.detectedNotes,
                currentNoteIndex: model.status == .listening ? model.currentNoteIndex : -1
            )
            .frame(height: 160)

            // ── Status text ───────────────────────────────────────────────
            Spacer().frame(height: 12)
            statusText
                .frame(maxWidth: .infinity)

            // ── Pitch meter ───────────────────────────────────────────────
            Spacer().frame(height: 16)
            HStack {
                Spacer()
                PitchMeterView(midi: model.liveMidi, isActive: model.status == .listening)
                    .frame(width: 90, height: 90)
                Spacer()
            }

            // ── Buttons ───────────────────────────────────────────────────
            Spacer().frame(height: 20)
            controlButtons

            // ── Note tracker ──────────────────────────────────────────────
            Spacer().frame(height: 20)
            if !model.sequence.isEmpty {
                noteTracker
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Color(.systemBackground))
        .navigationBarBackButtonHidden(true)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("← Back") { path.removeLast() }
                    .foregroundColor(.erPrimary)
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Text(titleText)
                    .font(.subheadline.weight(.semibold))
            }
        }
        .onAppear { sessionSaved = false }
        .onDisappear { model.cleanup() }
        .onChange(of: model.status) { newStatus in
            if newStatus == .done && !sessionSaved {
                sessionSaved = true
                progressModel.addSession(
                    scaleName: MusicTheory.SCALE_NAMES[model.scaleId],
                    rootLabel: MusicTheory.midiToLabel(model.rootMidi),
                    score: model.score,
                    length: model.sequence.count
                )
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    path.append(AppRoute.results)
                }
            }
        }
    }

    // MARK: - Status text

    private var statusMessage: String {
        switch model.status {
        case .idle:    return "Press Play to hear the sequence"
        case .playing: return "Listen carefully…"
        case .listening:
            let n     = model.currentNoteIndex + 1
            let total = model.sequence.count
            let label = model.currentNoteIndex < model.sequence.count
                ? MusicTheory.midiToLabel(model.sequence[model.currentNoteIndex])
                : "—"
            return "Sing note \(n) of \(total): \(label)"
        case .done:    return "Calculating score…"
        }
    }

    @ViewBuilder
    private var statusText: some View {
        Text(statusMessage)
            .font(.body)
            .foregroundColor(.erMuted)
            .multilineTextAlignment(.center)
    }

    // MARK: - Control buttons

    @ViewBuilder
    private var controlButtons: some View {
        switch model.status {
        case .idle:
            VStack(spacing: 10) {
                Button("▶ Play Sequence") {
                    Task { await model.playSequence() }
                }
                .buttonStyle(PrimaryButtonStyle(height: 52, fontSize: 17))

                Button("🎙 Start Listening") {
                    Task { await model.startListening() }
                }
                .buttonStyle(OutlinedButtonStyle(height: 48, fontSize: 16))
            }

        case .playing:
            Button("⏹ Stop Playback") {
                model.cancelPlayback()
            }
            .buttonStyle(OutlinedButtonStyle(height: 48, fontSize: 16))

        case .listening:
            Button("⏹ Stop Listening") {
                model.stopListening()
            }
            .buttonStyle(ErrorButtonStyle(height: 52, fontSize: 17))

        case .done:
            HStack {
                Spacer()
                ProgressView()
                    .scaleEffect(1.5)
                Spacer()
            }
        }
    }

    // MARK: - Note tracker

    private var noteTracker: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Notes:")
                .font(.caption)
                .foregroundColor(.erMuted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(0..<model.sequence.count, id: \.self) { i in
                        VStack(spacing: 2) {
                            Text(noteSymbol(at: i))
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(noteSymbolColor(at: i))
                            Text(MusicTheory.midiToLabel(model.sequence[i]))
                                .font(.system(size: 10))
                                .foregroundColor(.erMuted)
                        }
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    private func noteSymbol(at index: Int) -> String {
        if index < model.detectedNotes.count {
            return model.detectedNotes[index].isCorrect ? "✓" : "✗"
        } else if index == model.currentNoteIndex && model.status == .listening {
            return "→"
        } else {
            return "○"
        }
    }

    private func noteSymbolColor(at index: Int) -> Color {
        if index < model.detectedNotes.count {
            return model.detectedNotes[index].isCorrect ? .erSuccess : .erError
        } else if index == model.currentNoteIndex && model.status == .listening {
            return .erPrimary
        } else {
            return .erMuted
        }
    }
}
