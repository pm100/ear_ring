import SwiftUI

enum AppRoute: Hashable {
    case exercise
    case setup
    case results
    case progress
}

struct ContentView: View {
    @State private var path = NavigationPath()
    @EnvironmentObject var exerciseModel: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel

    var body: some View {
        NavigationStack(path: $path) {
            HomeView(path: $path)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .exercise:
                        ExerciseView(path: $path)
                    case .setup:
                        SetupView()
                    case .results:
                        ResultsView(path: $path)
                    case .progress:
                        ProgressScreen()
                    }
                }
        }
        .tint(.indigo)
    }
}
