import SwiftUI
import UIKit

struct ExerciseView: View {
    @EnvironmentObject var model: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel
    @Binding var path: NavigationPath
    @Environment(\.horizontalSizeClass) var hsc

    private var isIPad: Bool { hsc == .regular }
    private var staffHeight: CGFloat { isIPad ? 220 : 160 }
    private var meterSize: CGFloat { isIPad ? 130 : 90 }

    @State private var transpSemitones: Int = 0

    private func transpMidi(_ midi: Int) -> Int {
        min(127, max(0, midi + transpSemitones))
    }

    private var staffNotes: [StaffDisplayNote] {
        let durations = model.melodyDurations
        if model.showTestNotes {
            return model.sequence.enumerated().map { index, expectedMidi in
                let dur = index < durations.count ? durations[index] : nil
                if index < model.detectedNotes.count {
                    let detected = model.detectedNotes[index]
                    return StaffDisplayNote(
                        midi: transpMidi(detected.isCorrect ? expectedMidi : detected.midi),
                        state: detected.isCorrect ? .correct : .incorrect,
                        duration: detected.isCorrect ? dur : nil
                    )
                }
                return StaffDisplayNote(midi: transpMidi(expectedMidi), state: .expected, duration: dur)
            }
        }
        return model.detectedNotes.enumerated().map { index, note in
            StaffDisplayNote(
                midi: transpMidi(note.midi),
                state: note.isCorrect ? .correct : .incorrect,
                duration: note.isCorrect && index < durations.count ? durations[index] : nil
            )
        }
    }

    var body: some View {
        portraitLayout
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                // Always the actual (concert) key/range, regardless of instrument
                // transposition — unlike the staff, it's not notation to read/play.
                let concertKeyChroma = EarRingCore.effectiveKeyChroma(rootChroma: model.rootNote, scaleId: model.scaleId)
                let rootLabel = EarRingCore.preferredNoteLabel(midi: model.rootNote, rootChroma: concertKeyChroma)
                let rangeLabel = "\(EarRingCore.preferredMidiLabel(midi: model.rangeStart, rootChroma: concertKeyChroma))–\(EarRingCore.preferredMidiLabel(midi: model.rangeEnd, rootChroma: concertKeyChroma))"
                Text("\(rootLabel) \(rangeLabel) \(MusicTheory.SCALE_NAMES[model.scaleId])")
                    .font(.subheadline.weight(.semibold))
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            loadTransposition()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            if model.isSessionRunning {
                model.stopExerciseSession()
                progressModel.reload()
            }
        }
        .onChange(of: model.instrumentIndex) { _ in
            loadTransposition()
        }
    }

    private func loadTransposition() {
        guard let json = try? JSONSerialization.jsonObject(with: Data(EarRingCore.instrumentList().utf8)),
              let arr = json as? [[String: Any]],
              arr.indices.contains(model.instrumentIndex) else {
            transpSemitones = 0
            return
        }
        transpSemitones = (arr[model.instrumentIndex]["semitones"] as? Int) ?? 0
    }

    private var statusMessage: String {
        switch model.status {
        case .playing:
            return "Listen carefully…"
        case .listening:
            if model.isRetryingSameNote {
                return "Wrong note. Try again (\(model.noteRetryCount)/\(model.noteRetries))…"
            }
            return "Play note \(model.currentNoteIndex + 1) of \(model.sequence.count)"
        case .retryDelay:
            if model.detectedNotes.last?.isCorrect == false && model.currentAttempt < model.maxAttempts {
                return "Wrong note. Replaying the same test…"
            }
            return "Starting the next test…"
        case .stopped:
            return "Testing stopped"
        }
    }

    // MARK: — Shared subviews

    private var staffView: some View {
        MusicStaffView(
            notes: staffNotes,
            fixedSpacing: 44,
            rootChroma: (EarRingCore.effectiveKeyChroma(rootChroma: model.rootNote, scaleId: model.scaleId) + ((transpSemitones % 12) + 12) % 12) % 12,
            keySignatureMode: model.keySignatureMode
        )
        .frame(height: staffHeight)
    }

    private var listeningBanner: some View {
        HStack(spacing: 8) {
            Text("👂").font(.system(size: 28))
            Text("Listening…")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.erPrimary)
        }
        .frame(maxWidth: .infinity)
        .opacity(model.status == .listening ? 1 : 0)
    }

    private var metaText: some View {
        VStack(spacing: 4) {
            Text(statusMessage)
                .font(.body)
                .foregroundColor(.erCaption)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            Text("Attempt \(model.currentAttempt) of \(model.maxAttempts)  •  Tests \(model.testsCompleted)  •  Score \(model.score)%")
                .font(.subheadline)
                .foregroundColor(.erCaption)
                .frame(maxWidth: .infinity)
        }
    }

    private var pitchMeter: some View {
        PitchMeterView(midi: model.liveMidi, isActive: model.status == .listening)
            .frame(width: meterSize, height: meterSize)
    }

    private var stopButton: some View {
        HStack(spacing: 10) {
            Button("↻ Repeat") {
                model.repeatCurrentTest()
            }
            // Tonal (light-filled), not bare outline — next to Stop Testing's solid
            // fill, a plain outline read as the "colorless"/lesser button rather than
            // a deliberate secondary action.
            .buttonStyle(TonalButtonStyle(height: 52, fontSize: 17))
            .disabled(model.status != .listening)

            // "■" (Geometric Shapes, same family as "▶" on Home's Start Exercise), not
            // "⏹" (Miscellaneous Technical), which renders as a colour emoji by default —
            // an outlier next to Repeat's plain "↻".
            //
            // PrimaryButtonStyle, not ErrorButtonStyle — stopping a test is a normal,
            // reversible navigation action (it saves the session, same as leaving any
            // other way), not a destructive one like Settings' Reset to Defaults or
            // Progress' Clear All Progress. Red here was also a real accessibility
            // problem: a colour-blind (red/green) user can't distinguish it from Start
            // Exercise's intent by colour alone, and it wrongly signals danger.
            Button("■ Stop Testing") {
                model.stopExerciseSession()
                progressModel.reload()
                path = NavigationPath()
            }
            .buttonStyle(PrimaryButtonStyle(height: 52, fontSize: 17))
        }
    }

    @ViewBuilder
    private var currentAttemptRow: some View {
        if !model.detectedNotes.isEmpty {
            let concertKeyChroma = EarRingCore.effectiveKeyChroma(rootChroma: model.rootNote, scaleId: model.scaleId)
            VStack(alignment: .leading, spacing: 4) {
                Text("Current attempt")
                    .font(.caption)
                    .foregroundColor(.erCaption)
                HStack(spacing: 10) {
                    ForEach(Array(model.detectedNotes.enumerated()), id: \.offset) { _, note in
                        // Always the actual (concert) pitch, regardless of instrument
                        // transposition — this is a readout, not notation to read/play.
                        Text(EarRingCore.preferredMidiLabel(midi: note.midi, rootChroma: concertKeyChroma))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(note.isCorrect ? .erSuccess : .erError)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var chordLabelRow: some View {
        if !model.chordLabel.isEmpty && model.showTestNotes {
            Text("🎵 \(model.chordLabel)")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.erPrimary)
                .frame(maxWidth: .infinity)
        }
    }

    // MARK: — Layout (iPhone + iPad, portrait and landscape)
    // A single centred column, scaled up on iPad — matches HomeView's iPad treatment
    // rather than a bespoke split layout, so this screen doesn't feel inconsistent
    // with the rest of the app.

    private var portraitLayout: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 8)
            chordLabelRow
            staffView
            Spacer().frame(height: 8)
            listeningBanner
            Spacer().frame(height: 4)
            metaText
            Spacer().frame(height: 16)
            HStack { Spacer(); pitchMeter; Spacer() }
            Spacer().frame(height: 20)
            currentAttemptRow
            Spacer().frame(height: 24)
            stopButton
            Spacer()
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: isIPad ? 680 : .infinity)
        .frame(maxWidth: .infinity)  // centre on iPad
        .background(Color(.systemBackground))
    }
}
