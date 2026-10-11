<!--
Draft of the Help page for jollygoodsw.com (WordPress). Source of truth for the website help;
paste into the page editor. Defaults and ranges are from the settings schema
(assistant-proxy/test/fixtures/context.json); re-check them when settings change.
Items marked [verify] need a check against the app before publishing.

Page: https://jollygoodsw.com/ear-ring-help/ (WordPress page id 509, draft). Section anchors, set
on the headings in WordPress and linked from the Contents list; keep them stable because the apps
may deep-link to them (…/ear-ring-help/#microphone):
  1 #getting-started  2 #microphone  3 #running-an-exercise  4 #test-types  5 #settings
    (#settings-practise, #settings-sound, #settings-retries, #settings-mic)
  6 #easier-or-harder  7 #progress  8 #assistant  9 #troubleshooting  10 #contact
Each settings-table row also has an anchor (a span id in its first cell) named by the same key as
rust/src/tooltips.md, so an ⓘ icon can link straight to it, e.g. #mic_sensitivity,
#retry_same_note, #display_test_notes.
-->

# Ear Ring Help

Ear Ring plays you a short sequence of notes. You play or sing it back, and real-time pitch detection scores each note. This page explains everything the app does. Inside the app, the Help tab has a quick start and a built-in assistant you can ask about setup.

## Contents

1. Getting started
2. Setting up your microphone
3. Running an exercise
4. Test types
5. Settings reference
6. Making it easier or harder
7. Reading your progress
8. The setup assistant
9. Troubleshooting
10. Contact

## 1. Getting started

1. **Pick your instrument.** Open the Settings tab and choose your instrument. This sets a sensible note range for it and shows notes the way your instrument reads them (a B♭ instrument shows written pitch, not concert pitch). Choosing an instrument does not change how the tests are played: the notes you hear are always played on a piano.
2. **Check your microphone.** Open the Mic tab and play a few notes. They should appear on the staff and on the pitch meter. If they do, you are ready.
3. **Choose what to practise.** On the Home tab, choose a test type, key, scale, note range and sequence length.
4. **Tap Start Exercise.** The app plays a chord to set the key, then the notes to copy. Play them back in order.

Green notes mean you got it. Red means keep trying. The app replays the same sequence up to your retry limit, then moves on.

## 2. Setting up your microphone

The Mic tab starts listening as soon as you open it. Play a note and watch the staff and pitch meter respond. Notes outside your selected range are ignored.

Three controls sit on the same screen so you can tune them against the live feedback:

- **Mic Sensitivity** (1 to 10, default 8). Higher picks up quieter playing. Raise it if quiet notes are missed. Lower it if background noise triggers false notes.
- **Note Stability** (2 to 5 readings, default 3). How many matching pitch readings in a row confirm a note. Higher is steadier but slower to react.
- **Mic Warmup Frames** (0 to 6, default 4). Readings thrown away right after the mic starts, so it can settle.

Tap **Advanced** for finer pitch-detection controls: Grace Frames, Octave Correction and YIN Threshold (see the settings reference). **Clear**, below the staff, empties the note history on screen. It doesn't affect detection.

**Tips**

- Play in a quiet room, with the phone or computer a metre or less from your instrument.
- Play each note clearly and hold it for a moment.
- If detection is flaky, change one setting at a time and test again on the Mic tab.

## 3. Running an exercise

Once you start, the app runs hands-free:

1. An intro sound plays to establish the key. By default it is a chord.
2. The test sequence plays. These are the notes to copy.
3. Listening starts automatically.
4. Correct notes turn green and wrong notes turn red.
5. After a wrong note, the sequence replays, up to your retry limit. Then a new test starts.
6. Get the whole sequence right and the app moves straight to the next test.

Tap **Stop Testing** (or use the back gesture on a phone) to end early. Your session is saved as long as you finished at least one test.

A note is correct if it is the right note name (the octave does not matter) and within 50 cents of the target.

**Retries work at two levels.** *Retry Same Note* gives you extra tries at one wrong note, in place. *Max Retries* is how many times the whole sequence replays before the app moves on.

**How a test is scored.** A pass on the first attempt scores 100. Each later attempt loses 100 divided by Max Retries points, so with the default of 5 the scores are 100, 80, 60, 40 and 20. A test that runs out of attempts scores 0. Each Retry Same Note you use also costs a few points: with the defaults, 10 per retry. Your session score is the average of its tests.

## 4. Test types

- **Random Notes.** An arbitrary sequence of notes within your chosen range, in the key and scale you picked.
- **Diatonic Arpeggios.** A triad built from your chosen key and scale. Its quality (major, minor or diminished) follows the scale automatically. Scale and Sequence Length are locked in this mode, because the triad fixes them.

## 5. Settings reference

Settings are grouped into three sections you can expand: Instrument & Playback, Sound & Display, and Exercise & Timing. Tap the ⓘ icon beside any control in the app for a short description. **Reset to Defaults** restores everything. Your progress isn't affected.

### What to practise

| Setting | Choices | Default | What it does |
|---|---|---|---|
| Test Type | Random Notes, Diatonic Arpeggios | Random Notes | The kind of exercise (see section 4). |
| Key | C through B, 12 keys | C | The tonic note exercises are built around. |
| Scale | Major, Natural Minor, Dorian, Mixolydian | Major | The scale notes are drawn from. |
| Range | Any span of at least one octave | By instrument | The lowest and highest notes the exercise uses. Tap the piano icon to set it on a keyboard, or type note names. |
| Sequence Length | 1 to 10 notes | 1 | How many notes make up each test. Locked to 3 for Diatonic Arpeggios. |
| Instrument | Piano, Guitar, Transposed Guitar, Soprano Sax, Alto Sax, Tenor Sax, Trumpet, Clarinet, and three voice types (premium) | Piano | Sets the default range, how notes are named, and the mic defaults that suit the instrument (for example Guitar starts with Octave Correction on and Grace Frames 5). Choosing an instrument resets those, so choose it first and fine-tune afterwards. Choosing an instrument does not change how the tests are played: the notes you hear are always played on a piano. |

### How it sounds and looks

| Setting | Choices | Default | What it does |
|---|---|---|---|
| Tempo | 60, 80, 100, 120, 140 BPM | 100 | How fast the test sequence plays. |
| Intro Sound | Root Note, Chord, Arpeggio, Scale, None | Chord | What plays first to establish the key. |
| Pause Before Playing | 400 ms to 2 s | 800 ms | The gap between the intro and the test sequence. |
| Play Pass/Fail Sounds | On, Off | On | A short chime when a test passes or fails, as well as the note colours. |
| Display Test Notes | On, Off | Off | Shows the expected notes on the staff in black before you play them. They turn green as you get each right. Good for learning. Off keeps the staff blank until you play, which is harder. |
| Use Key Signature | Inline accidentals, Key signature | Inline accidentals | With a key signature, only out-of-key notes get an accidental. Otherwise every accidental is shown on the note. |

### Retries and timing

| Setting | Choices | Default | What it does |
|---|---|---|---|
| Max Retries | 1, 2, 3, 5, 8, 10 | 5 | Attempts at a test before the app moves on. |
| Retry Same Note | 0 (off) to 5 | 2 | Extra tries at a single wrong note, in place, before it counts as a failed attempt and the whole test replays. Each retry used costs a few points. |
| Wrong Note Pause | 1, 2, 3 or 5 seconds | 3 s | How long a wrong note stays on screen before the test replays or a new one starts. |

### Microphone and pitch detection

| Setting | Choices | Default | What it does |
|---|---|---|---|
| Mic Sensitivity | 1 to 10 | 8 | Higher picks up quieter sounds. Raise it if quiet playing is missed. Lower it if background noise triggers false notes. |
| Note Stability | 2 to 5 | 3 | Consistent readings in a row needed to confirm a note. Higher is steadier but slower. |
| Mic Warmup Frames | 0 to 6 | 4 | Readings discarded after the mic starts, so it can settle. |
| Grace Frames | 0 to 6 | 3 | How many shaky readings after a confirmed note are tolerated before the app gives up on it and starts confirming a new one. |
| Octave Correction | On, Off | Off | Snaps detected pitches that are an octave off to the nearest note in your range. Helps instruments prone to octave errors. |
| YIN Threshold | 0.05 to 0.30 | 0.15 | How strict the detector is about a sound being a clear, steady pitch. Lower is stricter: fewer false notes, but weak or noisy notes may be missed. Higher is more lenient: it catches weaker or noisier notes, but gives more false notes and octave errors. |
| Pitch Tolerance | In cents (voice instruments only) | 80 for voices | How far a note's pitch can wander before it counts as a different note. A wider tolerance absorbs vibrato. Only shown for the voice instruments, which are premium. |

## 6. Making it easier or harder

If the exercise is too hard or too easy, these are the main dials, roughly in order of effect.

**To make it easier**

- Shorten the sequence (fewer notes per test).
- Turn on Display Test Notes, so you can see the notes while you play.
- Slow the tempo.
- Increase Max Retries and Retry Same Note.
- Use a major scale in a key you know well. Natural Minor, Dorian and Mixolydian are harder to hear.
- Narrow the range to the part of your instrument you play most confidently.
- Use a longer intro (Chord, Arpeggio or Scale) so the key is firmly in your ear.

**To make it harder**

- Lengthen the sequence, one note at a time.
- Turn off Display Test Notes.
- Speed up the tempo.
- Reduce Max Retries and set Retry Same Note to 0.
- Move to Natural Minor, Dorian or Mixolydian, or to keys you don't usually play in.
- Widen the range to the full compass of your instrument.
- Set Intro Sound to Root Note or None.

A good habit: change one thing at a time, and move up when you pass most tests at the current level.

## 7. Reading your progress

The Progress tab shows your **day streak**, the **total recorded tests** and your **average score**. Tap a past session to see its individual tests: the notes expected against the notes detected, the attempts used and the score.

**Clear All Progress** erases all recorded history. It appears once you have at least one session. It can't be undone.

Your progress is stored on your own device. It is not uploaded.

## 8. The setup assistant

The Help tab includes an assistant for setup questions. Type what you want, for example "I want a chance to correct a wrong note" or "it misses my quiet notes", and it answers or suggests a change.

- Suggested changes appear on a card. **Nothing changes until you tap Apply.** You can review everything afterwards in Settings.
- It can only help with setting up and using Ear Ring.
- If you ask for something the app can't do, the assistant passes it on to the developer as a feature request.
- You get a limited number of questions each day.

**What is sent.** Your question and your current settings go to our server and an AI provider, to produce the answer. No audio and no practice history is sent. [verify: update this paragraph if the history-based advice design goes ahead. See the privacy policy.]

## 9. Troubleshooting

**Notes aren't being detected.** Check the Mic tab first. If nothing shows when you play, check the app has microphone permission in your device settings. Then raise Mic Sensitivity (and, if that is not enough, the YIN Threshold slightly), play more clearly, and move closer to the microphone.

**Wrong notes appear that I didn't play.** Lower Mic Sensitivity, raise Note Stability, and check for background noise. Lowering the YIN Threshold slightly makes the detector stricter, which also helps.

**The note shows an octave too high or low.** Turn on Octave Correction. Make sure your instrument is set correctly, as that decides how notes are named.

**Notes are detected late or cut off.** Lower Note Stability by one, or play each note a bit longer.

**My voice keeps getting marked wrong.** Voice instruments use a wider Pitch Tolerance to allow for vibrato. Check the Mic tab, where the tuner dial shows how far off each note is.

**One long note is counted as two.** Raise Grace Frames, so a brief dip in volume is not treated as the end of the note.

**The score or streak looks wrong.** A session is saved only if you finish at least one test.

## 10. Contact

Questions, bug reports or feature requests: use the [Contact page](https://jollygoodsw.com/contact/). Early access to the Android and iOS test versions is also by request there.
