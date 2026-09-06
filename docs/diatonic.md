# Diatonic Arpeggios — Feature Spec

## Overview

A "Diatonic Arpeggios" exercise type (Test Type = 2), selected from the Test Type
dropdown on the Home screen. Instead of a random melody, each test plays a single
diatonic chord (triad or 7th) arpeggiated ascending or descending.

## Home Screen Behaviour

- Sequence Length chips: only **3** and **4** are enabled; chips 1, 2, 5, 6, 7, 8 are
  disabled (opacity 0.38, non-interactive).
- Default chip selection in this mode: 3.
- Scale and Key dropdowns remain active (they define the diatonic pool).
- Piano range picker remains active.

## Chord Generation

### 3-note (Triad)
- Chord tones: scale degrees **1, 3, 5** of a diatonic chord rooted on any of the 7
  scale degrees.
- Example in C Major: C-E-G, D-F-A, E-G-B, F-A-C, G-B-D, A-C-E, B-D-F.

### 4-note (Seventh Chord)
- Chord tones: scale degrees **1, 3, 5, 7** of a diatonic chord rooted on any of the
  7 scale degrees.
- Example in C Major: Cmaj7, Dm7, Em7, Fmaj7, G7, Am7, Bm7b5.

**Note:** The "1,3,5,7" labelling uses diatonic scale degrees counted from the chord
root within the scale — not absolute semitone intervals. The 7th chord note is the
7th degree above the chord root (skip-one-degree pattern), giving the naturally
occurring 7th chord quality for each scale degree.

### Voicing

Root position only — no inversions (see "Future: inversions" below).

### Range and rejection

Every note must fall inside the user's selected range. Rather than clamping an
out-of-range note to the range boundary (which can silently substitute a pitch
that isn't actually a member of the chord — e.g. producing D,E,G instead of the
real D-triad D,F,A), a scale degree whose triad/7th doesn't fit inside the range
at any octave is rejected outright, and a different scale degree (via a new
random seed) is tried instead. If no fitting degree turns up in a bounded number
of attempts, the last attempt is used as a fallback rather than looping forever.

### No immediate repeat

Consecutive tests must not open on the same note — the same rule already applied
to Random Notes mode. This uses the same reject-and-reseed retry as the
range-fit check above.

## Direction

Each test randomly picks **ascending** or **descending** (a coin-flip on the
client side, independent of chord generation) — the arpeggio plays the notes in
that order. This is not a user-facing choice; it varies test to test.

## Octave Placement

The chord is anchored at the highest octave that fits entirely inside the
selected range with no overflow (ties favour the higher, brighter octave).

## Intro Chord

The existing tonic triad intro chord (played before the test sequence) is unchanged —
it still plays the I chord of the selected key/scale as a simultaneous chord.

## Future: inversions

Voicing the chord in 1st/2nd (/3rd, for 7ths) inversion — not just root
position — is a natural follow-on feature, tracked as a possible premium/paid
addition rather than part of the free base exercise. Not yet implemented.
