# Diatonic Triads — Feature Spec

## Overview

A new "Diatonic Triads" exercise type (Test Type = 2). The user selects it from the
Test Type dropdown on the Home screen. Instead of a random melody, each test plays a
single diatonic chord arpeggiated ascending or descending.

## Home Screen Behaviour

- Sequence Length chips: only **3** and **4** are enabled; chips 2, 5, 6, 7, 8 are
  disabled (opacity 0.38, non-interactive).
- Default chip selection in this mode: 3.
- Scale and Key dropdowns remain active (they define the diatonic pool).
- Piano range picker remains active.

## Chord Generation

### 3-note (Triad)
- Chord tones: scale degrees **1, 3, 5** of a diatonic chord rooted on any of the 7
  scale degrees.
- Example in C Major: C-E-G, D-F-A, E-G-B, F-A-C, G-B-D, A-C-E, B-D-F.
- Inversions: root position, 1st inversion, 2nd inversion (randomly chosen).

### 4-note (Seventh Chord)
- Chord tones: scale degrees **1, 3, 5, 7** of a diatonic chord rooted on any of the
  7 scale degrees.
- Example in C Major: Cmaj7, Dm7, Em7, Fmaj7, G7, Am7, Bm7b5.
- Inversions: root position, 1st, 2nd, 3rd inversion (randomly chosen).

**Note:** The "1,3,5,7" labelling uses diatonic scale degrees counted from the chord
root within the scale — not absolute semitone intervals. The 7th chord note is the
7th degree above the chord root (skip-one-degree pattern), giving the naturally
occurring 7th chord quality for each scale degree.

## Direction

Each test randomly picks **ascending** or **descending** — the arpeggio plays the
notes in that order.

## Octave Placement

The chord is anchored near the centre of the selected piano range (or closest to
middle C by default). Inversions shift individual notes by an octave to stay compact.

## Intro Chord

The existing tonic triad intro chord (played before the test sequence) is unchanged —
it still plays the I chord of the selected key/scale as a simultaneous chord.
