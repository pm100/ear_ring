# iOS Premium-Gated Banner Ads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a non-personalized Google AdMob test banner ad on the iOS app's Home and
Progress tabs, hidden whenever `isPremium` is true.

**Architecture:** Add the Google Mobile Ads SDK via CocoaPods. A single reusable
`BannerAdView` SwiftUI wrapper renders the ad; `HomeView` and `ProgressScreen` each embed
it behind an `if !isPremium` check. The SDK initializes once at app launch in
`AppDelegate`. No Rust core involvement — this is platform SDK/UI plumbing, not
exercise logic.

**Tech Stack:** Swift, SwiftUI, CocoaPods, Google Mobile Ads SDK (`Google-Mobile-Ads-SDK`
pod), `GoogleMobileAds` framework (v12+ Swift API — unprefixed type names like
`BannerView`/`Request`/`Extras`/`MobileAds`, not the legacy `GADBannerView` etc.).

**Spec:** `docs/superpowers/specs/2026-09-28-ios-ads-design.md`

## Global Constraints

- iOS deployment target stays 16.0 (`ios/Podfile` line 1) — SDK requires iOS 13.0+, so no floor change needed.
- Non-personalized ads only — no App Tracking Transparency call anywhere, no `NSUserTrackingUsageDescription` key.
- Use Google's public **test** App ID (`ca-app-pub-3940256099942544~1458002511`) and test banner ad unit ID (`ca-app-pub-3940256099942544/2934735716`) — no real AdMob account exists yet.
- Gate every ad-showing `if` on the existing `isPremium` flag — no new persisted state, no changes to premium logic itself.
- Never show an ad on the Exercise screen (`ExerciseView.swift`) — not touched by any task in this plan.
- All new Swift code referencing the ad SDK uses fully-qualified `GoogleMobileAds.X` names (e.g. `GoogleMobileAds.BannerView`) to avoid any ambiguity with other modules' generically-named types (`Request`, `Extras`).
- No XCTest target exists in this iOS project today (confirmed: no `*Tests*` directory under `ios/`) — verification in every task below is manual, via building and running on the simulator, matching this codebase's existing iOS testing practice (see AGENTS.md's UI Debugging Guide, which is entirely screenshot/simulator-based).

## Review Focus

- **No AdMob account exists yet** — a reviewer must confirm every ID used is one of Google's two well-known public test IDs, not a placeholder that looks real, and that there's a clear comment marking where real IDs go later (Task 2).
- **Info.plist `GADApplicationIdentifier` missing or mismatched** — the SDK crashes at `MobileAds.shared.start()` if this key is absent; a reviewer must confirm the plist string exactly matches the constant used nowhere else but documented consistently (Task 2).
- **Ad accidentally reachable from the Exercise screen** — a reviewer must confirm `BannerAdView` is referenced only from `HomeView.swift` and `ProgressScreen.swift`, never `ExerciseView.swift` or anything it pushes/presents (Tasks 3-4).
- **Premium toggle doesn't actually hide the ad** — a reviewer must manually flip the DEBUG "Premium" switch and confirm both banners disappear immediately, not just on next launch (Tasks 3-4 verification, Task 6).
- **ATT prompt appears despite the "non-personalized only" decision** — a reviewer must confirm no `AppTrackingTransparency` import or `ATTrackingManager` call exists anywhere in the diff, and that no system permission dialog appears on first launch after this change (Task 2 verification, Task 6).

---

### Task 1: Add the Google Mobile Ads SDK dependency

**Files:**
- Modify: `ios/Podfile`

**Interfaces:**
- Consumes: nothing.
- Produces: the `GoogleMobileAds` framework, importable by any Swift file in the `earring` target from Task 2 onward.

- [ ] **Step 1: Add the pod**

Replace the placeholder comment in `ios/Podfile` (currently 6 lines: `platform :ios,
'16.0'`, blank, `target 'earring' do`, `use_frameworks!`, `# No pods needed — using
system frameworks only`, `end`) with:

```ruby
platform :ios, '16.0'

target 'earring' do
  use_frameworks!
  pod 'Google-Mobile-Ads-SDK'
end
```

- [ ] **Step 2: Install the pod on the Mac**

Run over SSH (see AGENTS.md's "Remote iOS Builds over SSH" section for the `mac` alias):

```bash
ssh mac "cd ~/work/ear_ring && git pull --ff-only && cd ios && pod install"
```

Expected: CocoaPods resolves and installs `Google-Mobile-Ads-SDK` (and its
dependencies, e.g. `GoogleUserMessagingPlatform` may or may not be pulled in
automatically — either is fine, it's unused by this plan), creates/updates
`ios/Podfile.lock` and `ios/earring.xcworkspace`, and prints `Pod installation
complete!` with no errors. If it fails because the local `ios/Podfile` edit hasn't
been pushed yet, commit and push Step 1 first, then re-run.

- [ ] **Step 3: Verify the project still builds with no source changes**

```bash
ssh mac "cd ~/work/ear_ring && just ios-sim"
```

Expected: builds and launches successfully, exactly as before this task (no visible
change in the app yet — this step only proves the new dependency links cleanly).

- [ ] **Step 4: Commit**

```bash
git add ios/Podfile ios/Podfile.lock
git commit -m "iOS: add Google Mobile Ads SDK dependency"
```

(`ios/earring.xcworkspace` and `Pods/` are typically gitignored for CocoaPods
projects — check `ios/.gitignore` before adding; if `Pods/` is tracked in this repo,
add it too.)

---

### Task 2: Ad SDK initialization, config, and the reusable banner component

**Files:**
- Create: `ios/earring/AdMob/AdConfig.swift`
- Create: `ios/earring/AdMob/BannerAdView.swift`
- Modify: `ios/earring/AppDelegate.swift`
- Modify: `ios/earring/Info.plist`

**Interfaces:**
- Consumes: `GoogleMobileAds` framework (Task 1).
- Produces: `AdConfig.bannerAdUnitID: String` (used by `BannerAdView`); `BannerAdView: View`
  (a SwiftUI view with no initializer parameters — `BannerAdView()`), used by Tasks 3-4.

- [ ] **Step 1: Add the ad unit ID config**

Create `ios/earring/AdMob/AdConfig.swift`:

```swift
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
```

- [ ] **Step 2: Add the required Info.plist keys**

In `ios/earring/Info.plist`, add these two entries (placement doesn't matter — e.g.
right after the existing `NSMicrophoneUsageDescription` string on line 28, before the
`NSAppTransportSecurity` dict):

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-3940256099942544~1458002511</string>
<key>SKAdNetworkItems</key>
<array>
<dict>
<key>SKAdNetworkIdentifier</key>
<string>cstr6suwn9.skadnetwork</string>
</dict>
</array>
```

`cstr6suwn9.skadnetwork` is Google's own AdMob SKAdNetwork identifier (confirmed
current as of this writing). Do not add `NSUserTrackingUsageDescription` — this app
never calls the ATT API.

- [ ] **Step 3: Initialize the SDK at launch**

In `ios/earring/AppDelegate.swift`, change:

```swift
import UIKit

class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        return true
    }
}
```

to:

```swift
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
```

- [ ] **Step 4: Create the reusable banner component**

Create `ios/earring/AdMob/BannerAdView.swift`:

```swift
import SwiftUI
import GoogleMobileAds
import UIKit

/// A banner ad sized to the full device width via Google's current-orientation adaptive
/// banner API. Requests non-personalized ads only — no App Tracking Transparency prompt
/// is triggered anywhere in this app. Renders nothing visible if the ad fails to load
/// (the SDK's own default behavior) — there is no retry or error UI.
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
        bannerView.adSize = GoogleMobileAds.currentOrientationAnchoredAdaptiveBanner(width: width)
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
```

The outer `BannerAdView` gives callers a plain `View` with a fixed 50pt height (the
standard banner height) so screen layouts don't jump before the ad loads and resizes
itself; `GoogleMobileAds.BannerView` reports its own `intrinsicContentSize` once
loaded, but a fixed wrapper height keeps this predictable even before that happens.

- [ ] **Step 5: Build and manually verify the SDK initializes and a banner can load**

This component isn't wired into any screen yet, so verify it in isolation by
temporarily adding `BannerAdView()` to the end of `ContentView`'s body (any visible
spot), building with `just ios-sim`, and confirming:
- The app launches with no crash (a missing/mismatched `GADApplicationIdentifier`
  crashes at `MobileAds.shared.start()` — if it crashes, re-check Step 2's string
  matches Step 1's exactly... actually the App ID isn't in `AdConfig.swift` at all,
  it's plist-only, so re-check the plist string is exactly
  `ca-app-pub-3940256099942544~1458002511` with no typos).
- No system permission dialog (ATT) appears at launch.
- A gray placeholder or Google test ad creative renders where you placed the temporary
  `BannerAdView()`.

Then remove the temporary line from `ContentView` before continuing — Task 3 adds the
real, permanent placement.

- [ ] **Step 6: Commit**

```bash
git add ios/earring/AdMob/AdConfig.swift ios/earring/AdMob/BannerAdView.swift ios/earring/AppDelegate.swift ios/earring/Info.plist
git commit -m "iOS: initialize Google Mobile Ads SDK and add reusable banner component"
```

---

### Task 3: Show the banner on the Home screen, gated on premium

**Files:**
- Modify: `ios/earring/views/HomeView.swift:192, 338-350`

**Interfaces:**
- Consumes: `BannerAdView` (Task 2), `model.isPremium: Bool` (already exists on
  `ExerciseModel`, already available in `HomeView` via `@EnvironmentObject var model: ExerciseModel`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Wrap the existing body in a VStack with the banner below it**

`HomeView.body` currently returns a `ScrollView { ... }` directly, with modifiers
chained on the `ScrollView` itself (background, `hideNavigationBar()`, `onAppear`,
`onChange`, `fullScreenCover`). Change the structure so the `ScrollView` and its
modifiers stay exactly as they are, but become the first child of a new outer
`VStack(spacing: 0)`, with the banner as the second child:

Before (`HomeView.swift:192-351`, showing only the start and end — everything in
between, all the existing Home screen content, is unchanged):

```swift
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // ... existing content, unchanged ...
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: isIPad ? 680 : .infinity)
            .frame(maxWidth: .infinity)  // centre on iPad
        }
        .background(Color(.systemBackground))
        .hideNavigationBar()
        .onAppear { loadInstrTranspose() }
        .onChange(of: model.instrumentIndex) { _ in loadInstrTranspose() }
        .fullScreenCover(isPresented: $showRangePicker) {
            PianoRangePickerFullScreen(
                rangeStart: model.rangeStart,
                rangeEnd: model.rangeEnd,
                onRangeChange: model.testType == 1 ? { _, _ in } : { s, e in model.setRange(start: s, end: e) },
                onDone: { showRangePicker = false }
            )
        }
    }
```

After:

```swift
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // ... existing content, unchanged ...
                }
                .padding(.horizontal, 16)
                .frame(maxWidth: isIPad ? 680 : .infinity)
                .frame(maxWidth: .infinity)  // centre on iPad
            }
            .background(Color(.systemBackground))
            .hideNavigationBar()
            .onAppear { loadInstrTranspose() }
            .onChange(of: model.instrumentIndex) { _ in loadInstrTranspose() }
            .fullScreenCover(isPresented: $showRangePicker) {
                PianoRangePickerFullScreen(
                    rangeStart: model.rangeStart,
                    rangeEnd: model.rangeEnd,
                    onRangeChange: model.testType == 1 ? { _, _ in } : { s, e in model.setRange(start: s, end: e) },
                    onDone: { showRangePicker = false }
                )
            }

            if !model.isPremium {
                BannerAdView()
            }
        }
    }
```

(Every line inside the inner `ScrollView { ... }` block is indented one level deeper
than before, since it's now nested one level further — but its content is
byte-for-byte identical to today.)

- [ ] **Step 2: Build and manually verify**

```bash
ssh mac "cd ~/work/ear_ring && just ios-sim"
```

On the Home tab, confirm:
- The test banner renders at the bottom of the screen, below the "Start Exercise"
  button, not scrolling with the rest of the content.
- Go to Settings, flip "Debug: Premium" on — return to Home, confirm the banner is
  gone immediately (no relaunch needed, since `isPremium` is `@Published`).
- Flip it back off, confirm the banner reappears.

- [ ] **Step 3: Commit**

```bash
git add ios/earring/views/HomeView.swift
git commit -m "iOS: show premium-gated banner ad on Home screen"
```

---

### Task 4: Show the banner on the Progress screen, gated on premium

**Files:**
- Modify: `ios/earring/views/ProgressScreen.swift:1-30`

**Interfaces:**
- Consumes: `BannerAdView` (Task 2), `ExerciseModel.isPremium` (Task 3 already
  established the pattern; `ProgressScreen` needs its own `@EnvironmentObject`
  reference since it currently only injects `ProgressModel`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the ExerciseModel environment object**

In `ProgressScreen.swift`, change:

```swift
struct ProgressScreen: View {
    @EnvironmentObject var progressModel: ProgressModel
    @Environment(\.dismiss) private var dismiss
```

to:

```swift
struct ProgressScreen: View {
    @EnvironmentObject var progressModel: ProgressModel
    @EnvironmentObject var exerciseModel: ExerciseModel
    @Environment(\.dismiss) private var dismiss
```

This is safe because `ContentView` already injects both `exerciseModel` and
`progressModel` as environment objects above every tab (`ContentView.swift:40-41`,
`.environmentObject(exerciseModel)` / `.environmentObject(progressModel)` applied to
the whole view tree in `EarRingApp.swift:12-13`), and `ProgressScreen` is always a
descendant of `ContentView` (`ContentView.swift:70,113`).

- [ ] **Step 2: Add the gated banner below the existing content**

Change:

```swift
    var body: some View {
        Group {
            if let session = selectedSession {
                sessionDetail(session)
            } else {
                sessionList
            }
        }
        .background(Color(.systemBackground))
        .onAppear { progressModel.reload() }
    }
```

to:

```swift
    var body: some View {
        VStack(spacing: 0) {
            Group {
                if let session = selectedSession {
                    sessionDetail(session)
                } else {
                    sessionList
                }
            }
            .background(Color(.systemBackground))
            .onAppear { progressModel.reload() }

            if !exerciseModel.isPremium {
                BannerAdView()
            }
        }
    }
```

- [ ] **Step 3: Build and manually verify**

```bash
ssh mac "cd ~/work/ear_ring && just ios-sim"
```

On the Progress tab, confirm:
- The test banner renders at the bottom, both on the session list and when drilled
  into an individual session's detail view.
- Flip "Debug: Premium" on in Settings, return to Progress, confirm the banner is
  gone on both the list and detail views.
- Flip it back off, confirm it reappears.
- Switch to the Exercise screen (start an exercise from Home) and confirm no banner
  ever appears there.

- [ ] **Step 4: Commit**

```bash
git add ios/earring/views/ProgressScreen.swift
git commit -m "iOS: show premium-gated banner ad on Progress screen"
```

---

### Task 5: Documentation updates

**Files:**
- Modify: `DESIGN.md:211-213` (Home Screen section)
- Modify: `DESIGN.md:509-511` (Progress Screen section)
- Modify: `docs/roadmap.md:15-27`

**Interfaces:**
- Consumes: nothing (docs only).
- Produces: nothing (docs only).

- [ ] **Step 1: Document the iOS-only exception in DESIGN.md's Home Screen section**

In `DESIGN.md`, immediately after line 211 (`Section labels: small/label typography,
muted colour, left-aligned, 6dp bottom margin.`) and before the `---` on line 213,
insert:

```markdown

**iOS exception (UI Consistency Rule):** iOS shows a non-personalized banner ad
(Google Mobile Ads test creative) fixed at the bottom of this screen, hidden when
`isPremium` is true — Android and desktop do not have this yet (see
`docs/roadmap.md`'s "Ads — UI and plumbing" item; desktop is permanently ad-free by
design). Implemented in `HomeView.swift`'s `BannerAdView()`.
```

- [ ] **Step 2: Document the same exception in DESIGN.md's Progress Screen section**

In `DESIGN.md`, immediately after line 509 (the closing ` ``` ` of the Progress Screen
code block) and before the `---` on line 511, insert:

```markdown

**iOS exception (UI Consistency Rule):** same banner-ad exception as the Home Screen
above — see that section for details. Implemented in `ProgressScreen.swift`'s
`BannerAdView()`, shown on both the session list and session detail views.
```

- [ ] **Step 3: Update docs/roadmap.md**

In `docs/roadmap.md`, replace lines 15-27 (the "Dev switch for `isPremium`" and "Ads —
UI and plumbing" entries):

Before:

```markdown
### Dev switch for `isPremium`
A developer-only toggle (Settings screen, hidden behind a long-press or debug-build
flag) to flip `isPremium` on/off locally, so premium UI/UX can be built and tested
before real billing exists. Should call the existing `setPremium()` on Android /
`isPremium` setter on iOS directly — no new plumbing needed there, just a UI affordance
and a guard so it can't ship visible in a release build.

### Ads — UI and plumbing
AdMob on Android + iOS (desktop stays ad-free). See prior discussion for the shape of
this: banner on Home/Results screens only, never during the Exercise screen (audio
session conflict risk), test ad unit IDs during dev, ATT prompt on iOS if personalized
ads are wanted, and the Play Console "Advertising ID" data-safety declaration needs
revisiting once a real SDK lands. Gate ad display behind `!isPremium` once both exist.
```

After:

```markdown
### Dev switch for `isPremium`
**Landed.** A `#if DEBUG` / `BuildConfig.DEBUG`-gated "Debug: Premium" toggle exists
in Settings on both platforms (`SettingsView.swift`'s `Toggle("Debug: Premium",
isOn: $model.isPremium)`, `SettingsScreen.kt`'s `SettingSwitchRow("Debug: Premium",
state.isPremium) { viewModel.setPremium(it) }`), calling the existing
setter/property directly, excluded from release builds. Nothing left to build here.

### Ads — UI and plumbing
**Landed on iOS (2026-09-28)**, see
`docs/superpowers/specs/2026-09-28-ios-ads-design.md`: Google Mobile Ads SDK via
CocoaPods, banner on Home + Progress tabs (there is no separate "Results" screen —
Progress stands in for it), never during Exercise, non-personalized ads only (no ATT
prompt), Google's public test App ID/ad unit ID until a real AdMob account exists,
gated behind `!isPremium`.

**Android is still open.** When picked up, mirror iOS's decisions rather than
re-deciding them: same placement (Home + the session-history screen, never Exercise),
non-personalized ads only, test IDs first, gate on the existing `isPremium`/
`PREF_IS_PREMIUM` flag (its dev toggle already exists — see above, no new plumbing
needed there), one config object for the ad unit ID. Integrates via Gradle
(`implementation 'com.google.android.gms:play-services-ads:...'`) rather than
CocoaPods. The Play Console "Advertising ID" data-safety declaration needs revisiting
once Android's SDK lands (iOS has no equivalent Play-Console-style step, but its own
App Store Connect App Privacy questionnaire will need a similar revisit before
release — not done as part of this iOS branch).
```

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md docs/roadmap.md
git commit -m "docs: record iOS banner ads as landed, correct stale premium-toggle note"
```

---

### Task 6: Whole-feature manual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full manual pass on the Mac simulator**

```bash
ssh mac "cd ~/work/ear_ring && just ios-sim"
```

Walk through the spec's testing checklist end to end in one session, with "Debug:
Premium" off by default:
1. Home tab shows the test banner at the bottom.
2. Progress tab shows the test banner (list view and drilled-into session detail).
3. Start an exercise from Home; confirm no banner ever appears on the Exercise screen,
   during or after a test.
4. In Settings, flip "Debug: Premium" on; return to Home and Progress, confirm both
   banners are gone.
5. Flip "Debug: Premium" back off; confirm both banners reappear.
6. Confirm no App Tracking Transparency ("Allow tracking?") system dialog ever
   appeared, at launch or at any point during this walkthrough.

- [ ] **Step 2: Report results**

If every check in Step 1 passes, the feature is complete. If anything fails, fix it
in the relevant task's files and re-run Step 1 before considering this task done —
do not commit a fix without re-verifying the full checklist, since ad-gating bugs are
exactly the kind of thing that look fine in isolation but break when screens interact
(e.g. a stale `@EnvironmentObject` reference, or a banner that doesn't re-check
`isPremium` on tab switch).
