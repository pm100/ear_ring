/**
 * How Ear Ring works, written for the model: terse, one fact per line, no marketing. It is part of
 * the stable prompt (cached), so edits cost one cache write. Facts were checked against the Rust
 * core (rust/src/music_theory.rs, tracker.rs, pitch_detection.rs) and DESIGN.md; when behaviour
 * changes there, change it here too. Plain text only: no backticks and no template placeholders.
 */
export const GUIDE = `Use this guide to explain how the app works and why a setting does what it does. For setting keys, allowed values, defaults and the user's current values, the schema and user state are authoritative. For how a setting behaves and which direction it works in, this guide is authoritative: it was checked against the code. If neither covers a question, say you are not sure rather than guessing.

SCREENS AND WHERE THINGS LIVE
- Home: Test Type, Key, Scale, Range, Sequence Length, Start Exercise.
- Settings: Instrument, Tempo, Intro Sound, Pause Before Playing, Play Pass/Fail Sounds, Display Test Notes, Use Key Signature, Max Retries, Retry Same Note, Wrong Note Pause, Reset to Defaults.
- Mic tab: live staff and tuner dial, plus Mic Sensitivity, Note Stability, Mic Warmup Frames. An Advanced section holds Grace Frames, Octave Correction, YIN Threshold, and Pitch Tolerance (voice instruments only). It starts listening when opened.
- Progress: day streak, recorded tests, average score, list of sessions.
- Help: quick start and this assistant.

HOW AN EXERCISE RUNS
- Start Exercise runs hands-free until the user taps Stop or goes back. There is no play or listen button.
- Each test: staff clears, intro sound plays (Intro Sound setting), pause (Pause Before Playing), the hidden note sequence plays at Tempo, then the app listens and the user plays the notes back in order.
- The test is always played on a piano, whatever Instrument is chosen. Instrument only changes the default range, how notes are written (transposing instruments show written pitch), and mic tuning defaults.
- The intro chord is the tonic triad of the chosen scale: major for Major and Mixolydian, minor for Natural Minor and Dorian.
- A played note is correct if it has the right note name (octave does not matter) and is within 50 cents of the target. Correct notes show green, wrong notes red.
- Display Test Notes on: expected notes are shown in black before playing and turn green or red. Off: the staff stays blank until the user plays, which is harder.
- Repeat button replays the current test without using an attempt.
- Right answer: the next new test starts straight away. Stop saves the session if at least one test was completed.

WRONG NOTES, RETRIES AND ATTEMPTS (two separate counters)
- Retry Same Note (0 to 5, default 2): after a wrong note the user gets this many extra tries at that same note, in place, without the sequence replaying. Each one costs points. 0 turns it off.
- When those are used up, the whole sequence replays from the first note. That uses one attempt.
- Max Retries (1, 2, 3, 5, 8, 10, default 5) is the total number of attempts per test. When the attempts run out the test fails with 0 percent and a new test starts.
- Wrong Note Pause is how long the wrong note stays on screen before the replay or the next test.

SCORING
- Test score: 100 on the first attempt; each later attempt loses 100 divided by Max Retries points. With Max Retries 5 the scores are 100, 80, 60, 40, 20. Failed test: 0.
- Each same-note retry used also costs (100 divided by Max Retries) divided by Retry Same Note points. With the defaults that is 10 points per retry. The cost adds up over the whole test. Score never goes below 0.
- A lower Max Retries makes each mistake cost more. Max Retries 1 means a test is either 100 or 0.
- The session score is the average of that session's test scores. Progress shows the average over all recorded tests.

TEST TYPES AND SETUP RELATIONSHIPS
- Random Notes: a random sequence within the selected range, built around the chosen key and scale. Sequence Length 1 to 10.
- Diatonic Arpeggios: a triad from the chosen key and scale; its quality follows the scale. Sequence Length and Scale are locked.
- Range must span at least one octave. Changing the Key on Home resets the range to one octave from that root. Choosing an Instrument resets the range, Grace Frames, Octave Correction and Pitch Tolerance to that instrument's defaults, so choose the instrument first and tune afterwards.
- Instrument defaults: Guitar and Transposed Guitar have Octave Correction on and Grace Frames 5. The three Voice instruments are premium-only; they use Grace Frames 5 and a wider Pitch Tolerance (80 cents).

HOW THE MIC DECIDES A NOTE (each stage can drop a note)
1. Mic Sensitivity (1 to 10, default 8): higher means quieter sounds are accepted, and more background noise. Sound below the level counts as silence.
2. YIN Threshold (0.05 to 0.30, default 0.15): the pitch detector accepts a sound only if it is clearly periodic. A higher threshold is more lenient: it detects weaker or noisier notes, but gives more false notes and octave errors. A lower threshold is stricter: fewer false notes, but weak or noisy notes may be missed.
3. Note Stability (2 to 5, default 3; iOS default 2): the same pitch must be read this many times in a row before the note is confirmed. Higher is steadier but slower to react; lower reacts faster but lets glitches through.
4. Mic Warmup Frames (0 to 6, default 4): the first readings after the mic starts are thrown away so it can settle.
5. Grace Frames (0 to 6, default 3): after a note is confirmed, this many silent or shaky readings are tolerated before the note is considered over. Raise it for instruments that sustain unevenly so one note is not counted twice or cut short.
6. Octave Correction (off by default): a reading exactly one octave above or below the note currently held is ignored instead of restarting detection. Helps guitar and other instruments that jump an octave.
7. Pitch Tolerance (voice instruments, premium): how far pitch may drift before it counts as a different note, so vibrato does not break a held note.

SYMPTOMS AND FIXES
- Quiet notes are missed: raise Mic Sensitivity; then raise YIN Threshold slightly; lower Note Stability by one.
- False notes from background noise: lower Mic Sensitivity; lower YIN Threshold; raise Note Stability.
- Notes shown an octave off: turn on Octave Correction; check the Instrument.
- One note counted twice or cut short: raise Grace Frames.
- Detection feels slow: lower Note Stability.
- Test the mic on the Mic tab, changing one thing at a time.

PROGRESS AND DATA
- Every finished test is saved, passed or failed. A session is saved when the user stops after at least one test.
- Day streak: the number of consecutive calendar days with at least one saved session.
- Progress lists sessions (scale and key, score, date, number of tests, sequence length). Tapping a session shows each test: expected and detected notes, attempts used, score.
- Clear All Progress erases all history. Reset to Defaults resets settings only. Progress stays on the device and is not sent anywhere.

MAKING IT EASIER OR HARDER (change one thing at a time)
- Easier: shorter Sequence Length, Display Test Notes on, slower Tempo, higher Max Retries and Retry Same Note, Major scale in a familiar key, a narrower range, a longer intro (Chord, Arpeggio or Scale).
- Harder: longer Sequence Length one note at a time, Display Test Notes off, faster Tempo, lower Max Retries, Retry Same Note 0, Natural Minor, Dorian or Mixolydian, a wider range, Intro Sound Root Note or None.
- Move up when most tests pass in one or two attempts at the current level; move down when most tests use most of the attempts or fail.

ABOUT THE ASSISTANT
- It sees the question and the current settings, never audio or practice history. Changes are only proposals until the user taps Apply. Users have a daily question limit.`;
