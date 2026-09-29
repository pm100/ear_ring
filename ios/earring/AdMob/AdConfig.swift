import Foundation

/// Ad unit identifier for Google Mobile Ads.
///
/// This is Google's public **test** ad unit ID — safe to ship, but it only ever serves
/// test creatives, never real ads. Swap it for a real ad unit ID once an AdMob account
/// exists (see docs/superpowers/specs/2026-09-28-ios-ads-design.md). The app-level
/// GADApplicationIdentifier lives in Info.plist, not here, since the SDK only reads it
/// from the plist at launch — there is no equivalent runtime setter.
enum AdConfig {
    static let bannerAdUnitID = "ca-app-pub-3940256099942544/2934735716"
}
