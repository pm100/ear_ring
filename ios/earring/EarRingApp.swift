import SwiftUI

@main
struct EarRingApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
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
