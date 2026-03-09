import SwiftUI

@main
struct EarRingApp: App {
    @StateObject private var exerciseModel = ExerciseModel()
    @StateObject private var progressModel = ProgressModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(exerciseModel)
                .environmentObject(progressModel)
        }
    }
}
