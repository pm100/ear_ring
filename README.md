# Ear Ring 🎵

A music ear training app that helps you develop pitch recognition and interval hearing skills. Play notes back after hearing a sequence — the app uses real-time pitch detection to score your performance.

## Platforms

| Platform | Status | Tech Stack |
|----------|--------|------------|
| Android | ✅ Working (Play Store internal testing) | Kotlin + Jetpack Compose |
| iOS | ✅ Working (TestFlight) | Swift + SwiftUI |
| Desktop (Windows/macOS) | ✅ Working | Tauri (Rust + React/TSX) |

A standalone developer tool, **Melody Manager** (`melody-manager/`), is used to vet, edit,
and import tunes into the melody library — see `docs/melody-manager.md`.

## Architecture

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Android (Kotlin)  │  │     iOS (Swift)      │  │  Desktop (Tauri)    │
│   Jetpack Compose   │  │      SwiftUI         │  │    React / TSX      │
└────────┬────────────┘  └──────────┬──────────┘  └──────────┬──────────┘
         │ JNI                      │ C FFI                   │ Tauri IPC
         └──────────┬───────────────┴─────────────────────────┘
                    │
         ┌──────────▼──────────┐
         │     Rust Core       │
         │  pitch_detection    │
         │  music_theory       │
         │  melodies + help    │
         └─────────────────────┘
```

The Rust core handles all music logic and is shared across platforms:
- **Pitch detection** — YIN algorithm, real-time from microphone
- **Music theory** — scales, intervals, MIDI ↔ frequency conversion, staff positioning, key signatures
- **Test generation** — random sequences, melody snippets, and diatonic arpeggios from any scale/root

## Features

- Three test types: Random Notes, Melody Snippets (~50 public-domain tunes with rhythmic playback), and Diatonic Arpeggios (ascending/descending triads and seventh chords)
- 5 scale types: Major, Natural Minor, Dorian, Mixolydian, Locrian — the opening triad's quality (major/minor/diminished) follows the selected scale
- 12 root notes, interactive piano range picker, sequence length 2–8 notes
- Real-time pitch detection with cents accuracy
- Visual music staff with key signatures, duration-aware note symbols, and animated highlighting
- Instrument transposition (Piano, Guitar, Sax, Trumpet, Clarinet…)
- Continuous hands-free exercise flow with configurable retries and scoring
- Session history, per-test records, and streak tracking
- Haptic feedback on correct/incorrect notes

## Project Structure

```
ear_ring/
├── android/                   # Android app (Kotlin + Compose)
│   └── app/src/main/java/com/jollygoodsw/earring/
│       ├── EarRingCore.kt     # JNI bridge to Rust
│       ├── AudioCapture.kt    # Microphone input
│       ├── AudioPlayback.kt   # Piano sample playback
│       ├── ExerciseViewModel.kt
│       └── ui/                # Compose screens
├── ios/earring/               # iOS app (Swift + SwiftUI)
│   ├── EarRingCore.swift      # C FFI bridge to Rust
│   ├── AudioCapture.swift
│   ├── AudioPlayback.swift
│   ├── ExerciseModel.swift
│   └── views/                 # SwiftUI screens
├── desktop/                   # Desktop app (Tauri + React/TSX)
│   ├── src/                   # React frontend (screens, hooks)
│   └── src-tauri/             # Tauri shell + Rust commands
├── melody-manager/            # Developer tool for curating the melody library
└── rust/                      # Shared core library
    └── src/
        ├── pitch_detection.rs # YIN pitch detection
        ├── tracker.rs         # Note confirmation / stability tracking
        ├── music_theory.rs    # Scales, notes, intervals, melodies, arpeggios
        ├── melodies.txt       # Melody snippet library (edited via melody-manager)
        └── help.md            # Shared Help screen content
```

## Building

### Android

**Prerequisites:** Android Studio, NDK, Rust with `cargo-ndk`

```bash
# Install Rust Android targets
rustup target add aarch64-linux-android x86_64-linux-android

# Install cargo-ndk
cargo install cargo-ndk

# Build and install APK
cd android
./gradlew installDebug
```

The Android Gradle build rebuilds the Rust JNI library automatically into `android/app/build/generated/rustJniLibs/<variant>`. Do not check shared libraries into `android/app/src/main/jniLibs`.

### iOS

**Prerequisites:** macOS, Xcode 15+, Rust with iOS targets

```bash
# Install Rust iOS targets
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim

# Then open ios/earring.xcodeproj in Xcode and build
```

The Xcode target rebuilds the Rust iOS static library automatically into `ios/build/generated/rust/<configuration><platform>`. Do not check iOS Rust library artifacts into git or link directly from the shared `target` directory.

### Desktop (Tauri)

**Prerequisites:** Rust, Node 20+

```bash
cd desktop
npm install
npx tauri dev      # run in development
npx tauri build    # build installer (MSI on Windows, DMG on macOS)
```

### Releases

`.github/workflows/cd.yml` is a manually-triggered pipeline that builds and uploads all
platforms in one run: iOS → TestFlight, Android → Play Store internal testing, and
desktop installers → GitHub Releases. Required secrets are documented in
`.github/workflows/SECRETS.md`. Equivalent local commands live in the `justfile`
(`just ios-testflight`, `just android-play`).

## Audio

Piano samples are streamed from the [Salamander Grand Piano](https://tonejs.github.io/audio/salamander/) sample library and cached locally. Pitch shifting is applied via MediaPlayer/AVAudioPlayer playback rate to cover all 88 piano keys from ~30 base samples.

## Branches

- **`master`** — Native Android/iOS app (Kotlin + Swift + Rust)
- **`oldreact`** — Original Expo/React Native version
