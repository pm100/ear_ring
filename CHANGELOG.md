# Changelog

All notable changes to Ear Ring are documented here.

## [Unreleased]

### Added
- **Diatonic Arpeggios** — two new test types: *Diatonic Arpeggios (ascend)* and *Diatonic Arpeggios (desc)*
  - Generates diatonic triads and seventh chords from the selected key/scale
  - Random degree, random inversion, correct octave placement within the selected range
  - Chord quality suffixes: `°` diminished, `-` minor, `+` augmented, blank for major
  - Chord label shown next to the scale name when *Display Test Notes* is checked
  - Sequence length restricted to 3 (triad) or 4 (seventh chord) in this mode
  - Scale dropdown disabled (arpeggios are always diatonic to the selected key)
  - All three platforms: Android, iOS, Tauri/desktop

---

## 2025

### iOS improvements (mic gain boost, faster note confirm)
- Mic gain boost on iOS for quieter instruments
- Faster note confirmation (reduced stability window)
- Diagnostic logging cleanup

### Melody Manager developer tool
- Standalone Tauri app (`melody-manager/`) for vetting, editing, and importing melodies
- ABC notation editor with inline playback
- Microphone recording tab for transcribing melodies
- Exports directly to `rust/src/melodies.txt`

### Melody Snippet Library
- New *Melody Snippets* test type on Home screen
- ~50 public-domain tunes stored as semitone offsets in shared Rust core
- Rhythmic playback using per-note `duration_beats`
- Shuffle deck (Fisher-Yates) ensures no repeats until all melodies played
- Range auto-set from snippet MIDI range ± 6 semitones
- All three platforms

### Audio session fixes (iOS + desktop)
- Fixed competing audio engines causing unreliable detection during exercise
- iOS: audio session stays active throughout Exercise screen; no `setActive(false)` between retries
- Desktop: `AudioContext` and `MediaStream` kept alive for entire session

### iPad native layout
- Universal target (iPhone + iPad)
- `NavigationSplitView` sidebar on iPad; `TabView` on iPhone
- Adaptive sizing: larger staff (220 pt), pitch meter (130 pt), piano (`keyScale=1.35`) on iPad
- Landscape two-column layout on iPad

### UI reorganisation — 5-tab bottom nav
- Persistent bottom tab bar: Home · Mic · Progress · Settings · Help
- Settings screen: Tempo, Max Retries, Mic Sensitivity, Note Stability, Post-Chord Gap, Wrong-Note Pause
- Progress screen with session history, streak counter, and per-test records
- Help content loaded from shared `rust/src/help.md`
- Instrument selector with transposition display (Piano, Guitar, Sax, Trumpet, Clarinet…)

### Key signature rendering
- Conventional key signature symbols (♯/♭) on staff when *Use Key Signature* is checked
- Pre-rendered PNG accidentals (sharp/flat, 4 colour variants) for pixel-identical rendering on all platforms
- Pre-rendered PNG treble clef (NotoMusic font via GDI+) matching Android Skia exactly

### Continuous exercise flow
- Hands-free session: generates new tests automatically, no Play/Start button
- Configurable retry cap (default 5); per-test and session-average scoring
- Session + per-test history persisted to local storage

### Piano range picker
- Interactive scrollable piano keyboard (MIDI 36–84)
- Drag handles to set range; minimum 12-semitone span
- Default range: one octave from root note closest to middle C

### Note detection improvements
- Centralised `PitchTracker` in Rust core with per-instrument parameters
- Silence threshold, stability frames, DC offset removal configurable in Settings
- Audio fade-out on Android for faster decay after playback
- Eliminated YIN fallback; added silence grace period

### Music theory
- Implied major key label for non-major scales (e.g. "Natural Minor (Eb)")
- Removed Harmonic Minor and Pentatonic/Blues scales
- Flat note name convention throughout (Db not C#)
- Circle-of-fifths flat spelling for all note labels

### Cross-platform foundation
- Converted from React Native/Expo to native Android (Kotlin/Compose), iOS (Swift/SwiftUI), and Tauri desktop (Rust + React/TSX)
- Shared Rust core for pitch detection, music theory, and help content
- Staff rendering: filled noteheads with stems, ledger lines, accidentals
- Pitch meter (90 dp circle) on Mic Setup and Exercise screens
