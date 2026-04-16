# Melody Snippet Library — Implementation Plan

## Status (2026-04-08)

**Desktop/Tauri — complete, including note duration display and audio articulation**
**Android — NOT YET DONE** (some files partially changed by earlier automation; incomplete and unverified)
**iOS — NOT YET DONE** (some files partially changed by earlier automation; incomplete and unverified)

### What is done (Desktop)
- Rust core: `MelodyNote`, `MelodySnippet`, 57-tune library, all functions — ✅
- Rust: `note_timing(bpm, duration_beats) -> (hold_ms, step_ms)` — ✅
- Tauri commands: `cmd_melody_count`, `cmd_shuffle_melody_indices`, `cmd_pick_melody_by_index`, `cmd_melody_range_midi`, `cmd_sequence_timings` — ✅
- Desktop `types.ts`: `testType`, `duration?` on `StaffDisplayNote` — ✅
- Desktop `App.tsx`, `ExerciseScreen.tsx`, `useAudioPlayback.ts` — ✅
- Desktop `HomeScreen.tsx`: Test Type dropdown, Scale/SeqLength disabled in melody mode — ✅
- Desktop `MusicStaff.tsx`: duration-based rendering (open/closed noteheads, flags, dots) — ✅
- Audio articulation: notes cut off at 88% of notated duration via Web Audio `source.stop()` — ✅

Files to change:
- `types.ts` — add `duration?: number` to `StaffDisplayNote` — ✅ done
- `MusicStaff.tsx` — render open/closed noteheads, flags, augmentation dots — ✅ done
- `ExerciseScreen.tsx` — pass `melodyDurations[i]` into `StaffDisplayNote` for melody mode — ✅ done

### What remains for Android (future session)
- `EarRingCore.kt`, `AudioPlayback.kt`, `ExerciseViewModel.kt`, `HomeScreen.kt`
- Note duration display on Android staff canvas
- Rebuild JNI `.so` files: `cargo ndk -t arm64-v8a -t x86_64 -o android\app\src\main\jniLibs build -p ear_ring_core`

### What remains for iOS (future session)
- `EarRingCore.swift`, `AudioPlayback.swift`, `ExerciseModel.swift`, `HomeView.swift`
- Note duration display on iOS staff canvas

## Note Duration Display & Audio Articulation Spec

### Note Duration Display on Staff

Duration categories (beats, where 1.0 = quarter note):

| Duration (beats) | Symbol | Notehead | Stem | Flags | Dot |
|-----------------|--------|----------|------|-------|-----|
| ≥ 3.5           | whole  | open     | no   | 0     | no  |
| ≥ 2.5           | dotted half | open | yes | 0     | yes |
| ≥ 1.75          | half   | open     | yes  | 0     | no  |
| ≥ 1.25          | dotted quarter | filled | yes | 0 | yes |
| ≥ 0.875         | quarter | filled  | yes  | 0     | no  |
| ≥ 0.625         | dotted eighth | filled | yes | 1 | yes |
| ≥ 0.375         | eighth | filled   | yes  | 1     | no  |
| < 0.375         | sixteenth | filled | yes | 2    | no  |

- **Open notehead**: ellipse fill=white, stroke=note-colour
- **Augmentation dot**: small circle to the right of notehead, 1.6× noteHeadRx offset, radius ~2px
- **Flag**: cubic Bézier curve on the stem; stem-up flags go right from stem top
- Duration `undefined` → render as quarter note (backward-compatible; random mode unchanged)

### Audio Articulation (Note Cutoff)

Piano samples sustain until natural decay unless explicitly stopped. For melody playback
notes must be cut off at their notated duration to avoid a "sustain pedal" effect.

**Rust core owns the articulation math** (per the shared-logic rule):

```rust
// Returns (hold_ms, step_ms) for a single note.
// hold_ms: how long the piano key is "held" (88% of step by default)
// step_ms: how long to wait before the next note starts
pub fn note_timing(bpm: f32, duration_beats: f32) -> (u32, u32) {
    let step_ms = ((60_000.0 / bpm.max(1.0)) * duration_beats).max(50.0) as u32;
    let hold_ms = ((step_ms as f32) * 0.88) as u32;
    (hold_ms, step_ms)
}
```

**Tauri command** (batch — one IPC call per sequence, before playback starts):
```rust
cmd_sequence_timings(bpm: f32, durations: Vec<f32>) -> Vec<(u32, u32)>
```

**`useAudioPlayback.ts`**: `playSequence` gains `timings?: [number, number][]`.
For each note: `source.stop(ctx.currentTime + hold_ms / 1000)` schedules the cutoff.
In random mode (no durations/timings): use step_ms×0.88 as hold to match existing behaviour.

## Overview

Replace pure random note generation with an optional melody snippet mode. Users pick a
**Test Type** from a new dropdown on the Home screen:

- **Random Notes** — existing behaviour
- **Melody Snippets** — new: plays the opening bars of a well-known tune
- **Diatonic Triads** — stub, planned for a future session

All logic lives in the shared Rust core per the project's shared-logic rule.
All three platforms (Android, iOS, Desktop/Tauri) must be updated simultaneously.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Test Type selector | Dropdown on Home screen (not a settings item) |
| Scale dropdown in melody mode | **Disabled** (greyed out) |
| Sequence Length chips in melody mode | **Disabled** (greyed out) |
| Key dropdown in melody mode | **Active** — determines transposition |
| Range in melody mode | **Auto-set** to snippet MIDI range ± 6 semitones; piano picker read-only |
| Tune title reveal after correct answer | **No** |
| Playback timing | **Rhythmic** — notes play with real durations, not all quarter notes |
| Tune count | ~50 public domain / traditional tunes |
| Copyright | Small extracts for educational use; stick to public domain to be safe |

## Data Representation (Rust)

```rust
pub struct MelodyNote {
    pub semitones: i8,          // offset from tonic; 0=root, 7=fifth, 12=octave up
    pub duration_beats: f32,    // 1.0=quarter, 0.5=eighth, 2.0=half, 1.5=dotted quarter
}

pub struct MelodySnippet {
    pub title: &'static str,
    pub notes: &'static [MelodyNote],
}
```

Stored as a flat `&'static [MelodySnippet]`.

**Key functions to add to `rust/src/music_theory.rs`:**
- `pick_melody(seed: u64) -> &'static MelodySnippet` — random selection
- `melody_to_midi(snippet, root_chroma: u8) -> (Vec<u8>, Vec<f32>)` — transposes semitone
  offsets to absolute MIDI numbers, picking the octave whose centre of gravity is nearest
  middle C; returns parallel MIDI and duration arrays

## Shuffle Deck — No-Repeat Design

Pure random selection is notorious for repeating tunes. Instead, use a **shuffle deck**:

1. At exercise session start, shuffle all melody indices (Fisher-Yates) into a deck.
2. Pop from the deck one by one — each tune plays exactly once per cycle.
3. When the deck is exhausted, reshuffle with a new seed and start again.

This guarantees no repeats until every tune has been heard. State (deck + cursor) lives
in the platform exercise session; the shuffle algorithm lives in Rust.

## FFI Interface

```c
// C ABI (used by Android JNI and iOS)

// Returns total number of melodies in the library
uint32_t ear_ring_melody_count();

// Fisher-Yates shuffle of [0..count); out_buf must be melody_count() bytes
int32_t ear_ring_shuffle_melody_indices(uint64_t seed, uint8_t* out_buf);

// Resolve a shuffled index to MIDI notes + durations for a given root key
int32_t ear_ring_pick_melody_by_index(
    uint8_t index,
    uint8_t root_chroma,
    uint8_t* out_midi,
    float*   out_dur
);  // returns note count, or -1 on error
```

```rust
// Tauri command (Desktop)
#[tauri::command]
fn cmd_melody_count() -> u32

#[tauri::command]
fn cmd_shuffle_melody_indices(seed: u64) -> Vec<u8>   // shuffled index array

#[tauri::command]
fn cmd_pick_melody_by_index(index: u8, root_chroma: u8)
    -> MelodyResult  // { midi_notes: Vec<u8>, durations: Vec<f32> }
```

**Session lifecycle:**
- On `Start Exercise` (melody mode): call `shuffle_melody_indices(seed)` → store as deck, cursor = 0
- Each new test: take `deck[cursor]`, call `pick_melody_by_index`, cursor++
- When cursor == deck.len(): reshuffle with `Date.now()` seed, cursor = 0

## Audio Timing Change

`playSequence()` on all three platforms gains an optional `durations` parameter:

```
step_ms for note N = (60_000 / bpm) * durations[N]
```

When `durations` is absent (random mode), all steps default to `1.0` — existing
behaviour is unchanged.

## Melody Library Sample

Semitone offsets from tonic. Duration in beats (1.0=quarter, 0.5=eighth, 2.0=half,
0.75=dotted eighth, 1.5=dotted quarter).

```rust
// Major
("Twinkle Twinkle Little Star",   &[(0,1.0),(0,1.0),(7,1.0),(7,1.0),(9,1.0),(9,1.0),(7,2.0)]),
("Mary Had a Little Lamb",        &[(4,1.0),(2,1.0),(0,1.0),(2,1.0),(4,1.0),(4,1.0),(4,2.0)]),
("Ode to Joy",                    &[(4,1.0),(4,1.0),(5,1.0),(7,1.0),(7,1.0),(5,1.0),(4,1.0),(2,1.0)]),
("Happy Birthday",                &[(0,0.75),(0,0.25),(2,1.0),(0,1.0),(5,1.0),(4,2.0)]),
("Frère Jacques",                 &[(0,1.0),(2,1.0),(4,1.0),(0,1.0),(0,1.0),(2,1.0),(4,1.0),(0,1.0)]),
("Jingle Bells",                  &[(4,0.5),(4,0.5),(4,1.0),(4,0.5),(4,0.5),(4,1.0),(4,0.5),(7,0.5),(0,1.0),(2,1.0),(4,2.0)]),
("Yankee Doodle",                 &[(0,1.0),(0,1.0),(2,1.0),(4,1.0),(0,1.0),(4,1.0),(2,1.0)]),
("Oh Susanna",                    &[(0,1.0),(2,1.0),(4,1.0),(7,1.0),(9,1.5),(7,0.5),(4,1.0),(0,1.0)]),
("Row Your Boat",                 &[(0,1.0),(0,1.0),(0,0.75),(2,0.25),(4,1.0),(4,0.75),(2,0.25),(4,0.5),(5,0.5),(7,2.0)]),
("Amazing Grace",                 &[(0,1.0),(5,2.0),(9,1.0),(5,1.0),(9,1.0),(7,1.0),(5,2.0)]),
("Camptown Races",                &[(4,0.5),(4,0.5),(2,0.5),(4,0.5),(7,1.0),(7,1.0),(4,1.0),(7,1.0)]),
("Clementine",                    &[(0,1.0),(0,0.5),(0,0.5),(4,1.0),(4,0.5),(4,0.5),(7,1.5),(5,0.5)]),
("London Bridge",                 &[(7,0.5),(9,0.5),(7,0.5),(5,0.5),(4,0.5),(5,0.5),(7,1.0)]),
("Skip to My Lou",                &[(4,0.5),(4,0.5),(4,0.5),(2,0.5),(0,0.5),(0,0.5),(0,0.5),(2,0.5)]),
("Old MacDonald",                 &[(7,1.0),(7,1.0),(7,1.0),(2,1.0),(4,1.5),(4,0.5),(2,2.0)]),
("Yankee Doodle",                 &[(0,1.0),(0,1.0),(2,1.0),(4,1.0),(0,1.0),(4,1.0),(2,1.0)]),
("Auld Lang Syne",                &[(7,1.0),(12,1.5),(12,0.5),(12,1.0),(16,1.0),(14,1.5),(12,0.5),(14,1.0)]),
("Oh Christmas Tree",             &[(0,1.0),(5,1.0),(5,1.0),(5,1.5),(7,0.5),(5,1.0),(4,1.0)]),
("Silent Night",                  &[(7,1.5),(9,0.5),(7,1.0),(4,2.0),(7,1.5),(9,0.5),(7,1.0),(4,2.0)]),
("We Wish You a Merry Christmas", &[(0,1.0),(5,1.0),(5,0.5),(7,0.5),(5,0.5),(4,0.5),(2,1.0),(2,1.0)]),
("Good King Wenceslas",           &[(0,1.0),(0,1.0),(0,1.0),(2,1.0),(4,2.0),(4,1.0),(2,1.0)]),
("When the Saints Go Marching In",&[(0,0.5),(2,0.5),(4,0.5),(7,2.0),(0,0.5),(2,0.5),(4,0.5),(9,2.0)]),
("Scarborough Fair (opening)",    &[(0,1.0),(0,2.0),(3,1.0),(5,1.0),(7,2.0),(5,1.0),(3,1.0)]),
("Pop Goes the Weasel",           &[(0,0.5),(4,0.5),(7,0.5),(4,0.5),(7,0.5),(9,0.5),(7,1.0)]),
("She'll Be Coming Round",        &[(7,0.5),(7,1.0),(7,0.5),(5,1.0),(5,0.5),(4,0.5),(4,1.0)]),

// Minor / modal
("Greensleeves",                  &[(0,1.0),(3,2.0),(5,1.0),(7,1.5),(8,0.5),(7,1.0),(5,2.0)]),
("Fur Elise (opening)",           &[(11,0.5),(10,0.5),(11,0.5),(10,0.5),(11,0.5),(7,0.5),(10,0.5),(8,0.5)]),
("Hall of the Mountain King",     &[(0,0.5),(2,0.5),(3,0.5),(5,0.5),(7,0.5),(3,0.5),(7,0.5),(6,1.0)]),
("Scarborough Fair",              &[(0,1.0),(3,2.0),(-2,1.0),(0,1.0),(3,2.0),(5,1.0),(3,1.0)]),
("Danny Boy",                     &[(4,1.0),(7,1.5),(9,0.5),(7,1.0),(4,1.0),(2,1.0),(0,2.0)]),
("Joshua Fought the Battle",      &[(0,1.0),(0,1.0),(0,0.5),(2,0.5),(3,0.5),(2,0.5),(0,1.0),(3,1.0)]),

// Classical (public domain)
("Beethoven 5th (opening)",       &[(7,0.5),(7,0.5),(7,0.5),(3,2.0),(6,0.5),(6,0.5),(6,0.5),(2,2.0)]),
("Ode to Joy (full phrase)",      &[(4,1.0),(4,1.0),(5,1.0),(7,1.0),(7,1.0),(5,1.0),(4,1.0),(2,1.0),(0,1.0),(0,1.0),(2,1.0),(4,1.0),(4,1.5),(2,0.5)]),
("Eine Kleine Nachtmusik",        &[(7,0.5),(7,0.5),(7,0.5),(7,0.5),(7,2.0),(5,1.0),(4,1.0),(2,1.0)]),
("Turkish March",                 &[(0,0.5),(2,0.5),(3,1.0),(3,0.5),(5,0.5),(7,1.0)]),
("Canon in D (melody)",           &[(9,1.0),(7,1.0),(5,1.0),(4,1.0),(2,1.0),(0,1.0),(2,1.0),(4,1.0)]),
("Air on G String",               &[(7,2.0),(9,0.5),(8,0.5),(6,1.0),(4,2.0),(5,1.0),(4,0.5),(3,0.5)]),
("Swan Lake Theme",               &[(4,1.0),(7,1.5),(6,0.5),(4,1.0),(2,2.0),(4,0.5),(2,0.5),(0,1.0)]),
("Blue Danube",                   &[(4,1.5),(5,0.5),(4,0.5),(2,0.5),(0,0.5),(2,0.5),(4,2.0)]),
("La Marseillaise",               &[(4,0.5),(4,0.5),(4,1.0),(0,1.0),(4,1.0),(7,2.0)]),
// ... fill to 50 with additional hymns, folk songs, national anthems
```

## Task List

| ID             | Title                                         | Depends on                    | Status  |
|----------------|-----------------------------------------------|-------------------------------|---------|
| rust-types     | Rust: melody data types + functions           | —                             | pending |
| rust-library   | Rust: ~50 melody library entries              | —                             | pending |
| rust-ffi       | Rust: FFI (C ABI + Tauri command)             | rust-types, rust-library      | pending |
| android-bridge | Android: JNI bridge in EarRingCore.kt         | rust-ffi                      | pending |
| android-audio  | Android: per-note durations in playSequence   | rust-types                    | pending |
| android-vm     | Android: ViewModel testType + melody state    | android-bridge, android-audio | pending |
| android-home   | Android: Home UI dropdown + disable controls  | android-vm                    | pending |
| ios-all        | iOS: all equivalent changes                   | rust-ffi                      | pending |
| desktop-all    | Desktop: Tauri/React changes                  | rust-ffi                      | pending |
| agents-md      | Update AGENTS.md with Test Type dropdown spec | android-home                  | pending |

## Implementation Notes

- Start with `rust-types` and `rust-library` in parallel (no dependencies)
- `android-bridge` and `android-audio` can also be done in parallel after `rust-ffi`
- `ios-all` and `desktop-all` can be done in parallel after `rust-ffi`
- Verify each melody sounds correct by listening after implementation
- The 50-tune target is approximate; prioritise variety across major/minor/modal
