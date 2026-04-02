import SwiftUI
import UIKit

struct ExerciseView: View {
    @EnvironmentObject var model: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel
    @Binding var path: NavigationPath
    @Environment(\.horizontalSizeClass) var hsc
    @Environment(\.verticalSizeClass) var vsc

    private var isIPad: Bool { hsc == .regular }
    private var staffHeight: CGFloat { isIPad ? 220 : 160 }
    private var meterSize: CGFloat { isIPad ? 130 : 90 }

    @State private var transpSemitones: Int = 0

    private func transpMidi(_ midi: Int) -> Int {
        min(127, max(0, midi + transpSemitones))
    }

    private var staffNotes: [StaffDisplayNote] {
        if model.showTestNotes {
            return model.sequence.enumerated().map { index, expectedMidi in
                if index < model.detectedNotes.count {
                    let detected = model.detectedNotes[index]
                    return StaffDisplayNote(
                        midi: transpMidi(detected.isCorrect ? expectedMidi : detected.midi),
                        state: detected.isCorrect ? .correct : .incorrect
                    )
                }
                return StaffDisplayNote(midi: transpMidi(expectedMidi), state: .expected)
            }
        }
        return model.detectedNotes.map {
            StaffDisplayNote(midi: transpMidi($0.midi), state: $0.isCorrect ? .correct : .incorrect)
        }
    }

    var body: some View {
        GeometryReader { geo in
            Group {
                if isIPad && geo.size.width > geo.size.height {
                    iPadLandscapeLayout
                } else {
                    portraitLayout
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Text("\(model.rangeLabel) \(MusicTheory.SCALE_NAMES[model.scaleId])")
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
            rootChroma: EarRingCore.effectiveKeyChroma(rootChroma: model.rootNote, scaleId: model.scaleId),
            keySignatureMode: model.keySignatureMode
        )
        .frame(height: staffHeight)
    }

    private var metaText: some View {
        VStack(spacing: 4) {
            Text(statusMessage)
                .font(.body)
                .foregroundColor(.erMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            Text("Attempt \(model.currentAttempt) of \(model.maxAttempts)  •  Tests \(model.testsCompleted)  •  Score \(model.score)%")
                .font(.subheadline)
                .foregroundColor(.erMuted)
                .frame(maxWidth: .infinity)
        }
    }

    private var pitchMeter: some View {
        PitchMeterView(midi: model.liveMidi, isActive: model.status == .listening)
            .frame(width: meterSize, height: meterSize)
    }

    private var stopButton: some View {
        Button("⏹ Stop Testing") {
            model.stopExerciseSession()
            progressModel.reload()
            path = NavigationPath()
        }
        .buttonStyle(ErrorButtonStyle(height: 52, fontSize: 17))
    }

    @ViewBuilder
    private var currentAttemptRow: some View {
        if !model.detectedNotes.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Current attempt")
                    .font(.caption)
                    .foregroundColor(.erMuted)
                HStack(spacing: 10) {
                    ForEach(Array(model.detectedNotes.enumerated()), id: \.offset) { _, note in
                        Text(MusicTheory.midiToLabel(transpMidi(note.midi)))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(note.isCorrect ? .erSuccess : .erError)
                    }
                }
            }
        }
    }

    // MARK: — Portrait layout (iPhone + iPad portrait)

    private var portraitLayout: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer().frame(height: 8)
            staffView
            Spacer().frame(height: 12)
            metaText
            Spacer().frame(height: 16)
            HStack { Spacer(); pitchMeter; Spacer() }
            Spacer().frame(height: 24)
            stopButton
            Spacer().frame(height: 20)
            currentAttemptRow
            Spacer()
        }
        .padding(.horizontal, 16)
        .background(Color(.systemBackground))
    }

    // MARK: — iPad landscape: staff+info left, meter+stop right

    private var iPadLandscapeLayout: some View {
        HStack(alignment: .top, spacing: 24) {
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: 8)
                staffView
                Spacer().frame(height: 12)
                metaText
                Spacer().frame(height: 16)
                currentAttemptRow
                Spacer()
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 24) {
                Spacer()
                pitchMeter
                stopButton
                Spacer()
            }
            .frame(width: meterSize + 48)
        }
        .padding(.horizontal, 24)
        .background(Color(.systemBackground))
    }
}
