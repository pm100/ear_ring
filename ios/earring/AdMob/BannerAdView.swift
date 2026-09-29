import SwiftUI
import GoogleMobileAds
import UIKit

/// A banner ad that adapts to the width of whatever container it's placed in — correct on
/// both iPhone and iPad, including iPad's narrower `NavigationSplitView` detail column, and
/// after rotation. Requests non-personalized ads only — no App Tracking Transparency
/// prompt is triggered anywhere in this app. Renders nothing visible if the ad fails to
/// load (the SDK's own default behavior) — there is no retry or error UI.
struct BannerAdView: View {
    // Corrected to the real adaptive height as soon as the container's width is known —
    // starting at a plain guess would otherwise leave a wrongly-sized gap for one frame.
    @State private var adHeight: CGFloat = 50

    var body: some View {
        GeometryReader { proxy in
            BannerAdRepresentable(width: proxy.size.width)
                .onAppear { updateHeight(for: proxy.size.width) }
                .onChange(of: proxy.size.width) { updateHeight(for: $0) }
        }
        .frame(height: adHeight)
    }

    private func updateHeight(for width: CGFloat) {
        guard width > 0 else { return }
        adHeight = GoogleMobileAds.currentOrientationAnchoredAdaptiveBanner(width: width).size.height
    }
}

private struct BannerAdRepresentable: UIViewRepresentable {
    let width: CGFloat

    func makeUIView(context: Context) -> GoogleMobileAds.BannerView {
        let bannerView = GoogleMobileAds.BannerView()
        bannerView.adUnitID = AdConfig.bannerAdUnitID
        bannerView.rootViewController = Self.keyWindowRootViewController()
        load(into: bannerView, width: width)
        return bannerView
    }

    func updateUIView(_ uiView: GoogleMobileAds.BannerView, context: Context) {
        // Re-request only when the width actually changed (rotation, split-view resize) —
        // avoids reloading the ad on every unrelated SwiftUI re-render.
        guard width > 0, uiView.adSize.size.width != width else { return }
        load(into: uiView, width: width)
    }

    private func load(into bannerView: GoogleMobileAds.BannerView, width: CGFloat) {
        // `currentOrientationAnchoredAdaptiveBanner` is deprecated in favor of
        // `largeAnchoredAdaptiveBanner`, but "large" is a genuinely bigger format (up to
        // ~15% of screen height) meant for full-width dedicated ad placements, not this
        // compact footer slot — it overlapped the tab bar in testing. Deliberately keeping
        // the deprecated, compact API here; the warning is cosmetic.
        bannerView.adSize = GoogleMobileAds.currentOrientationAnchoredAdaptiveBanner(width: width)
        let request = GoogleMobileAds.Request()
        let extras = GoogleMobileAds.Extras()
        extras.additionalParameters = ["npa": "1"]
        request.register(extras)
        bannerView.load(request)
    }

    private static func keyWindowRootViewController() -> UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?
            .rootViewController
    }
}
