import SwiftUI

enum AppRoute: Hashable {
    case exercise
    case results
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
    @EnvironmentObject var exerciseModel: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel
    @State private var selectedTab: Int = {
        if !UserDefaults.standard.bool(forKey: "hasLaunched") {
            UserDefaults.standard.set(true, forKey: "hasLaunched")
            return 4  // Help tab
        }
        return 0
    }()

    var body: some View {
        TabView(selection: $selectedTab) {
            // Tab 1: Home (with exercise navigation nested inside)
            HomeTabView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(0)

            // Tab 2: Mic Setup
            NavigationStack {
                SetupView()
                    .hideNavigationBar()
            }
            .tabItem {
                Label("Mic", systemImage: "mic.fill")
            }
            .tag(1)

            // Tab 3: Progress
            NavigationStack {
                ProgressScreen()
                    .hideNavigationBar()
            }
            .tabItem {
                Label("Progress", systemImage: "chart.bar.fill")
            }
            .tag(2)

            // Tab 4: Settings
            NavigationStack {
                SettingsView()
                    .hideNavigationBar()
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape.fill")
            }
            .tag(3)

            // Tab 5: Help
            NavigationStack {
                HelpView()
                    .hideNavigationBar()
            }
            .tabItem {
                Label("Help", systemImage: "questionmark.circle.fill")
            }
            .tag(4)
        }
        .tint(.indigo)
    }
}

// Home tab wraps HomeView in a NavigationStack so Exercise can be pushed on top.
struct HomeTabView: View {
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            HomeView(path: $path)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .exercise:
                        ExerciseView(path: $path)
                    case .results:
                        ResultsView(path: $path)
                    }
                }
        }
        .tint(.indigo)
        .hideNavigationBar()
    }
}
