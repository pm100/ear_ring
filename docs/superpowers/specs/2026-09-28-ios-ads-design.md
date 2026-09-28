# iOS Banner Ads (Premium-Gated) — Design

## Status
Approved 2026-09-28 (Paul Moore). Implements the iOS half of `docs/roadmap.md`'s
"Ads — UI and plumbing" item. Android is explicitly out of scope for this branch —
see "Future: Android" below for what to mirror when that work happens.

## Context
`isPremium` already exists on iOS (`ExerciseModel.swift`, persisted via
`UserDefaults`, default `false`) and Android (`ExerciseViewModel.kt`, `PREF_IS_PREMIUM`),
each with a `#if DEBUG` / `BuildConfig.DEBUG`-gated "Debug: Premium" toggle in
Settings as the only way to flip it true today (no billing/gifting exists yet).
No ad SDK, ad account, or ad code exists on either platform. The iOS project uses
CocoaPods with an empty `Podfile` (`ios/Podfile` — "No pods needed" placeholder).

No AdMob account exists yet, so this branch ships against **Google's public test
App ID and ad unit ID**. Swapping in real production IDs (which requires creating
an AdMob account and registering the app — an account-side task only Paul can do)
is an explicit follow-up, not part of this branch.

## Decisions (from brainstorming)
- **Placement:** banner on the Home tab and the Progress tab (session history —
  the closest existing analog to "Results"; there is no dedicated post-exercise
  results screen in the codebase). Never on the Exercise screen (audio session
  conflict risk, per roadmap).
- **Personalization:** non-personalized ads only for v1. No App Tracking
  Transparency (ATT) prompt, no `NSUserTrackingUsageDescription`. Ad requests
  explicitly pass the non-personalized-ads extra. Personalized ads / ATT is a
  future enhancement, not part of this branch.
- **Integration method:** CocoaPods (`pod 'Google-Mobile-Ads-SDK'`), since the
  `Podfile` scaffold already exists and this avoids hand-editing `.xcodeproj`
  package references for SPM.
- **Gating:** reuse the existing `isPremium` flag as-is. No changes to premium
  logic itself — ads simply render `if !model.isPremium`.
- **Scope:** iOS only. This is a deliberate UI-parity exception to AGENTS.md's
  "UI Consistency Rule" — documented inline in `DESIGN.md` (see below) rather than
  silently violated.

## Architecture
A single reusable SwiftUI banner component wraps the SDK's UIKit banner view.
Two screens each conditionally show it. The SDK initializes once at app launch.
No new persisted state, no Rust core involvement (ad SDK integration is
platform UI/SDK plumbing, not deterministic exercise logic — outside the Shared
Logic Rule's scope).

```
App launch ──> GADMobileAds.sharedInstance().start()

HomeView ──┐
           ├─ if !isPremium { BannerAdView() }
ProgressScreen ──┘

BannerAdView (UIViewRepresentable)
  └─ wraps GADBannerView, adaptive width, non-personalized request
       (AdConfig.appID / AdConfig.bannerAdUnitID)
```

## Components

### `ios/earring/AdMob/AdConfig.swift` (new)
Holds the test App ID and banner ad unit ID as named constants, with a comment
flagging this as the single place to swap in real IDs once an AdMob account
exists. No environment branching (Debug vs Release) — both use test IDs for now
since no real IDs exist yet; this file is the seam for that later change.

### `ios/earring/AdMob/BannerAdView.swift` (new)
`UIViewRepresentable` wrapping `GADBannerView`:
- Adaptive anchored banner sized to the screen width.
- Builds a `GADRequest` with the non-personalized-ads extra set (no ATT call
  anywhere in this component or elsewhere in the app).
- Uses the app's key window's root view controller as the presenting controller
  (standard AdMob SwiftUI pattern — no navigation/UIKit bridging beyond this).

### App entry point (changed)
Call `GADMobileAds.sharedInstance().start(completionHandler: nil)` once, in the
`@main App` struct's `init()`.

### `HomeView.swift`, `ProgressScreen.swift` (changed)
Add `if !model.isPremium { BannerAdView() }` near the bottom of each view's body,
below existing content, above any tab-bar-adjacent safe-area padding.

### `ios/Podfile` (changed)
Replace the "no pods needed" placeholder with `pod 'Google-Mobile-Ads-SDK'`.
Requires running `pod install` on the Mac (CocoaPods is Mac-only tooling) —
part of the implementation/verification step, not something committed as a
generated diff beyond `Podfile.lock`.

### `ios/earring/Info.plist` (changed)
Add `GADApplicationIdentifier` (test App ID string) and `SKAdNetworkItems`
(Google's SDK-required identifiers for install attribution — verify the current
list against Google's live Mobile Ads SDK setup docs at implementation time
rather than trust a hardcoded list here, since Google updates it periodically).
No `NSUserTrackingUsageDescription` (not needed without ATT).

### `DESIGN.md` (changed)
Add a line documenting the iOS-first ads exception to the UI Consistency Rule,
matching how desktop's permanent ad-free status is already implied by the
roadmap doc.

### `docs/roadmap.md` (changed)
- Mark "Ads — UI and plumbing" as landed for iOS, landed-for-iOS/not-yet-Android.
- Correct the stale "Dev switch for isPremium" entry — it's already built on
  both platforms (cite `SettingsView.swift` / `SettingsScreen.kt`).
- Add a short "shape to mirror for Android" note: same placement (Home +
  session-history screen, never Exercise), same non-personalized-only decision,
  same test-IDs-now/real-IDs-later approach, same single-config-file convention
  — so that branch is a fast mirror, not a redesign.

## Error Handling
Ad load failures (no fill, network error) are the SDK's own concern — the
`GADBannerView` simply doesn't render content on failure; no custom error UI,
retry logic, or user-facing messaging. This matches how banner ads behave in
virtually every app (silent no-op on failure) and avoids adding UI states for a
non-critical, non-blocking feature.

## Testing
No unit-testable logic beyond the existing `isPremium` boolean gate (already
trivial and untested elsewhere in the codebase the same way). Verification is
manual/visual on the Mac:
1. `pod install`, then build via `just ios-sim`.
2. Confirm the test banner renders on Home and the Progress tab.
3. Flip the DEBUG "Premium" toggle on in Settings; confirm both banners
   disappear immediately.
4. Confirm no banner ever appears on the Exercise screen.
5. Confirm no ATT prompt appears anywhere in the app.

## Explicitly Out of Scope
- Android ads (separate future branch; this spec documents the pattern to mirror).
- Personalized ads / ATT flow.
- Real AdMob account, App ID, or ad unit ID (manual account-side follow-up).
- App Store Connect App Privacy questionnaire updates for the ad SDK (manual
  follow-up once real ads ship — non-personalized AdMob still collects some
  data Apple's privacy questionnaire may ask about).
- A dedicated post-exercise "Results" screen (doesn't exist; not being created
  here — Progress tab stands in for it).

## Future: Android
When Android ads are picked up as their own branch, mirror this spec's
decisions rather than re-deciding them: banner on Home + the session-history
screen (not Exercise), non-personalized ads only, test IDs first, gate on the
existing `isPremium`/`PREF_IS_PREMIUM` flag (already has its own DEBUG toggle,
no new plumbing needed there), single config object for ad unit IDs. The
Android Google Mobile Ads SDK integrates via Gradle (`implementation
'com.google.android.gms:play-services-ads:...'`), analogous to this branch's
CocoaPods step.
