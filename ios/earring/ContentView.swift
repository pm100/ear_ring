import SwiftUI

enum AppRoute: Hashable {
    case exercise
    case setup
    case results
    case progress
}

extension View {
    @ViewBuilder
    func hideNavigationBar() -> some View {
        if #available(iOS 18, *) {
            self.toolbarVisibility(.hidden, for: .navigationBar)
        } else {
            self.toolbar(.hidden, for: .navigationBar)
        }
    }
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
        .hideNavigationBar()
    }
}
