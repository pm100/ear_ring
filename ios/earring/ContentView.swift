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

// Labels for each tab — shared between TabView and sidebar.
private let tabItems: [(label: String, icon: String)] = [
    ("Home",     "house.fill"),
    ("Mic",      "mic.fill"),
    ("Progress", "chart.bar.fill"),
    ("Settings", "gearshape.fill"),
    ("Help",     "questionmark.circle.fill"),
]

struct ContentView: View {
    @EnvironmentObject var exerciseModel: ExerciseModel
    @EnvironmentObject var progressModel: ProgressModel
    @Environment(\.horizontalSizeClass) var hsc

    @State private var selectedTab: Int = {
        if !UserDefaults.standard.bool(forKey: "hasLaunched") {
            UserDefaults.standard.set(true, forKey: "hasLaunched")
            return 4  // Help tab
        }
        return 0
    }()

    var body: some View {
        if hsc == .regular {
            iPadLayout
        } else {
            iPhoneLayout
        }
    }

    // MARK: — iPhone: bottom tab bar

    private var iPhoneLayout: some View {
        TabView(selection: $selectedTab) {
            HomeTabView()
                .tabItem { Label(tabItems[0].label, systemImage: tabItems[0].icon) }
                .tag(0)
            NavigationStack { SetupView().hideNavigationBar() }
                .tabItem { Label(tabItems[1].label, systemImage: tabItems[1].icon) }
                .tag(1)
            NavigationStack { ProgressScreen().hideNavigationBar() }
                .tabItem { Label(tabItems[2].label, systemImage: tabItems[2].icon) }
                .tag(2)
            NavigationStack { SettingsView().hideNavigationBar() }
                .tabItem { Label(tabItems[3].label, systemImage: tabItems[3].icon) }
                .tag(3)
            NavigationStack { HelpView().hideNavigationBar() }
                .tabItem { Label(tabItems[4].label, systemImage: tabItems[4].icon) }
                .tag(4)
        }
        .tint(.indigo)
    }

    // MARK: — iPad: sidebar + detail

    private var iPadLayout: some View {
        NavigationSplitView {
            List {
                ForEach(tabItems.indices, id: \.self) { i in
                    Button {
                        selectedTab = i
                    } label: {
                        Label(tabItems[i].label, systemImage: tabItems[i].icon)
                            .foregroundColor(selectedTab == i ? .erPrimary : .primary)
                    }
                    .listRowBackground(selectedTab == i
                        ? Color.erPrimary.opacity(0.12)
                        : Color.clear)
                }
            }
            .navigationTitle("Ear Ring")
            .listStyle(.sidebar)
        } detail: {
            iPadDetail
        }
        .tint(.indigo)
    }

    @ViewBuilder
    private var iPadDetail: some View {
        switch selectedTab {
        case 0: HomeTabView()
        case 1: NavigationStack { SetupView().hideNavigationBar() }
        case 2: NavigationStack { ProgressScreen().hideNavigationBar() }
        case 3: NavigationStack { SettingsView().hideNavigationBar() }
        case 4: NavigationStack { HelpView().hideNavigationBar() }
        default: HomeTabView()
        }
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

