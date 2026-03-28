# Ear Ring 🎵

A music ear training app that helps you develop pitch recognition and interval hearing skills. Play notes back after hearing a sequence — the app uses real-time pitch detection to score your performance.

## Platforms

| Platform | Status | Tech Stack |
|----------|--------|------------|
| Android | ✅ Working | Kotlin + Jetpack Compose |
| iOS | ⚠️ Code complete, requires Mac to build | Swift + SwiftUI |

## Architecture

```
┌─────────────────────┐  ┌─────────────────────┐
│   Android (Kotlin)  │  │     iOS (Swift)      │
│   Jetpack Compose   │  │      SwiftUI         │
└────────┬────────────┘  └──────────┬──────────┘
         │ JNI                      │ C FFI
         └──────────┬───────────────┘
                    │
         ┌──────────▼──────────┐
         │     Rust Core       │
         │  pitch_detection    │
         │  music_theory       │
         └─────────────────────┘
```

The Rust core handles all music logic and is shared across platforms:
- **Pitch detection** — YIN algorithm, real-time from microphone
- **Music theory** — scales, intervals, MIDI ↔ frequency conversion, staff positioning
- **Sequence generation** — randomised note sequences from any scale/root

## Features

- 8 scale types: Major, Natural Minor, Harmonic Minor, Pentatonic Major/Minor, Dorian, Mixolydian, Blues
- 12 root notes, octave selection, sequence length 2–8 notes
- Real-time pitch detection with cents accuracy
- Visual music staff with animated note highlighting
- Session history and streak tracking
- Haptic feedback on correct/incorrect notes

## Project Structure

```
ear_ring/
├── android/                   # Android app (Kotlin + Compose)
│   └── app/src/main/java/com/earring/
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
└── rust/                      # Shared core library
    └── src/
        ├── pitch_detection.rs # YIN pitch detection
        └── music_theory.rs    # Scales, notes, intervals
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

## Audio

Piano samples are streamed from the [Salamander Grand Piano](https://tonejs.github.io/audio/salamander/) sample library and cached locally. Pitch shifting is applied via MediaPlayer/AVAudioPlayer playback rate to cover all 88 piano keys from ~30 base samples.

## Branches

- **`master`** — Native Android/iOS app (Kotlin + Swift + Rust)
- **`oldreact`** — Original Expo/React Native version
