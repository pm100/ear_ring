# Melody Manager — Developer Guide

The Melody Manager is a **standalone Tauri desktop app** (`melody-manager/`) used to
vet, edit, and import melodies into the shared `rust/src/melodies.txt` library.
It is a developer tool — not part of the shipping app.

---

## Purpose

`rust/src/melodies.txt` is the source of truth for all melody snippets used in the
Ear Ring "Melody Snippets" test mode. The Melody Manager provides a UI to:

- Browse and audition every tune in the library
- Mark tunes keep / discard / later
- Import new tunes (search, paste ABC, URL, or record/transcribe by playing)
- Edit any tune's notes via inline ABC notation
- Export the final curated set back to `melodies.txt`

---

## Running the app

```powershell
cd C:\work\ear_ring\melody-manager
cargo tauri dev
```

The window appears after ~60 seconds (Rust + Vite build on first run; faster on subsequent runs).

---

## UI Overview

The app is a two-panel layout:

**Left panel** — tune list
- Shows all library tunes (loaded from Rust core) plus any imported tunes
- Colour-coded dots: green = keep, red = discard, orange = later, grey = undecided
- Search box to filter by title
- **+ Import** button opens the import dialog

**Right panel** — tune detail
- Title and source label
- Music staff (notes displayed in C major regardless of key)
- ▶ Play / ⏹ Stop buttons
- Decision buttons: ✅ Keep / 🗑 Discard / 🕐 Later
- Octave shift buttons (▲ Oct+1 / ▼ Oct-1 / ↺ Reset) to fix off-octave imports
- **✏ Edit ABC** button — opens inline ABC editor (see below)
- ◀ Prev / Next ▶ navigation
- Dot grid showing keep/discard/later state at a glance

---

## Import Dialog

Four tabs:

### 🔍 Search
Searches TheSession.org (Irish traditional) and abcnotation.com in parallel.
Results show title + source; click to preview, then Import.

### 🔗 URL
Paste a URL to any ABC file. Fetches via the Tauri backend (`cmd_fetch_url_text`),
parses ABC, imports first tune found.

### 📋 Paste ABC
Paste raw ABC notation directly. Supports standard ABC 2.1 format.

### 🎤 Record
Play a melody into your microphone. The app uses the shared Rust YIN pitch detector
to transcribe notes in real time. After recording, it auto-detects BPM and root,
quantises note durations, and offers an editable sequence to import.

---

## ABC Editor

Click **✏ Edit ABC** in the right panel to open the inline ABC editor for any tune
(library or imported).

The editor pre-fills with the current melody rendered as ABC notation (key C, L:1/4).

**ABC encoding used:**
- `K:C` — all notes expressed relative to C major
- `L:1/4` — default note length is a quarter note
- Uppercase = octave 4 (C=C4, D=D4, …), lowercase = octave 5 (c=C5, …)
- Commas lower an octave: `C,` = C3, `C,,` = C2
- Apostrophes raise: `c'` = C6
- `^` = sharp, `_` = flat
- Duration multipliers: `C2` = half note, `C/2` = eighth, `C3/2` = dotted quarter

Click **✓ Apply** to parse and update the tune. If the ABC is invalid, an error is
shown and the tune is not modified. Click **Cancel** to discard edits.

The `T:` field in the ABC is used as the tune title on Apply.

---

## Export

Click **💾 Export to melodies.txt** in the left panel header.

A confirmation dialog shows:
- How many tunes will be written
- How many discarded tunes will be permanently removed
- How many unviewed tunes will be fetched before writing (none are silently dropped)

Export overwrites `rust/src/melodies.txt` directly (relative path `../../rust/src/melodies.txt`
from the `melody-manager/` directory). After export, rebuild the Rust core so all three
platforms pick up the new library:

```powershell
cargo test   # verifies library compiles and melody count is correct
```

---

## melodies.txt format

Plain text, two lines per tune:

```
Title of the tune
semitones:duration, semitones:duration, ...
```

- `semitones` — integer offset from tonic (0 = root, 7 = fifth, 12 = octave up, -5 = fourth below, etc.)
- `duration` — float, beats (1.0 = quarter, 0.5 = eighth, 2.0 = half, 1.5 = dotted quarter)

Example:
```
Twinkle Twinkle Little Star
0:1, 0:1, 7:1, 7:1, 9:1, 9:1, 7:2, 5:1, 5:1, 4:1, 4:1, 2:1, 2:1, 0:2
```

---

## State persistence (localStorage)

The app persists decisions and octave shifts across sessions via `localStorage`:

| Key | Content |
|-----|---------|
| `mm_decisions` | `{ "0": "keep", "3": "discard", … }` — indexed by tune position |
| `mm_octave_shifts` | `{ "5": 1, "12": -1, … }` — octave adjustments per tune |
| `mm_index` | Last viewed tune index |

Imported tunes are **not** persisted between sessions — they exist only until export.

---

## Architecture

```
melody-manager/
  src/
    components/
      MelodyManagerApp.tsx   — main two-panel UI, state management, export
      ImportDialog.tsx        — four-tab import dialog
      MusicStaff.tsx          — staff renderer (shared visual logic with main app)
      RecordTab.tsx           — mic capture + quantise + import
    hooks/
      useAudioCapture.ts      — WebAudio mic → Rust YIN pitch detection
      useAudioPlayback.ts     — Salamander piano sample playback
    utils/
      abc.ts                  — bidirectional ABC ↔ RawNote conversion
                                parseAbcToNotes(abc) → RawNote[] | null
                                rawNotesToAbc(notes, title, octaveShift) → string
    types.ts                  — RawMelody, RawNote, Decision, StaffDisplayNote
  src-tauri/src/main.rs       — Tauri commands (see below)
```

### Tauri backend commands

| Command | Description |
|---------|-------------|
| `cmd_melody_titles` | Returns `string[]` — all tune titles from Rust core |
| `cmd_melody_raw` | Returns `{ title, notes }` for a single tune by index |
| `cmd_save_file` | Writes a string to a path; returns the resolved path |
| `cmd_search_melodies` | Parallel search of TheSession + abcnotation.com |
| `cmd_fetch_url_text` | Fetches URL text via reqwest (for URL import tab) |
| `cmd_detect_pitch` | Runs Rust YIN on a `Vec<f32>` PCM chunk; returns `f32?` Hz |

---

## Pitch detection in RecordTab

`useAudioCapture` captures mic via `ScriptProcessorNode` (bufferSize 4096, 44100 Hz),
sends each frame to `cmd_detect_pitch` every 100 ms, and applies the same 3-frame
stability filter used in the main app. After 3 consecutive frames of the same pitch
class (MIDI % 12), the note is confirmed and its duration measured from the previous
confirmation timestamp.

After recording, `RecordTab` auto-detects:
- **BPM**: median inter-onset interval → nearest common BPM (60/80/100/120/140/160)
- **Root**: most frequent pitch class in the recorded notes

Notes are then quantised to the nearest eighth note at the detected BPM before import.
