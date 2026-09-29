import UIKit
import GoogleMobileAds

class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        GoogleMobileAds.MobileAds.shared.start()
        return true
    }
}

