import SwiftUI
import GoogleMobileAds
import UIKit

/// A banner ad sized to the full device width via Google's current-orientation adaptive
/// banner API. Requests non-personalized ads only — no App Tracking Transparency prompt
/// is triggered anywhere in this app. Renders nothing visible if the ad fails to load
/// (the SDK's own default behavior) — there is no retry or error UI.
///
/// Known limitation (see docs/roadmap.md): sizes itself from the full screen width and a
/// fixed 50pt height rather than the view's actual container — on iPad's narrower
/// NavigationSplitView detail column this makes the ad wider than its slot. An attempted
/// fix (GeometryReader-based real-width/height measurement) made the iPhone layout worse
/// (the ad overlapped the tab bar) and was reverted rather than shipped unverified;
/// revisit with real interactive device testing, not blind iteration.
struct BannerAdView: View {
    var body: some View {
        BannerAdRepresentable()
            .frame(height: 50)
    }
}

private struct BannerAdRepresentable: UIViewRepresentable {
    func makeUIView(context: Context) -> GoogleMobileAds.BannerView {
        let width = UIScreen.main.bounds.width
        let bannerView = GoogleMobileAds.BannerView()
        bannerView.adSize = GoogleMobileAds.largeAnchoredAdaptiveBanner(width: width)
        bannerView.adUnitID = AdConfig.bannerAdUnitID
        bannerView.rootViewController = Self.keyWindowRootViewController()

        let request = GoogleMobileAds.Request()
        let extras = GoogleMobileAds.Extras()
        extras.additionalParameters = ["npa": "1"]
        request.register(extras)
        bannerView.load(request)

        return bannerView
    }

    func updateUIView(_ uiView: GoogleMobileAds.BannerView, context: Context) {}

    private static func keyWindowRootViewController() -> UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}
