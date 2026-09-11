## test_type

Choose what kind of prompt to practice: Random Notes plays an arbitrary sequence within your range; Diatonic Arpeggios plays a triad built from the selected scale.

## key

The tonic note exercises are built around.

## scale

The scale exercises are drawn from.

## range

The lowest and highest notes the exercise will use — must span at least an octave. Tap the piano icon to set it on a keyboard, or type note names directly.

## sequence_length

How many notes make up each test. Locked to 3 for Diatonic Arpeggios.

## instrument

The instrument you're practicing on — sets its default range and note-name transposition (e.g. a B♭ instrument shows written pitches, not concert pitches).

## tempo

How fast the test sequence plays, in beats per minute.

## play_pass_fail_sounds

Play a short chime when a test passes or fails, in addition to the note colors.

## display_test_notes

Show the expected notes on the staff before you play them, in black, turning green as you get each one right — good for learning. Off by default: the staff stays blank until you play, for a bigger challenge.

## use_key_signature

Show a standard key signature after the clef, so only out-of-key notes get an accidental. Off by default: every accidental is shown directly on the note.

## intro_sound

What plays before the test sequence to establish the key: a single root note, a block chord, the chord arpeggiated, a scale run, or nothing.

## max_retries

How many attempts you get on a test before the app moves on.

## retry_same_note

How many extra tries you get at a single wrong note, in place, before it counts as a failed attempt and the whole test replays. Each retry used costs a few points. 0 turns this off.

## pause_before_playing

The gap between the intro chord and the test sequence.

## wrong_note_pause

How long a wrong note is shown before the test replays or a new one starts.

## mic_sensitivity

How quiet a sound needs to be before it's treated as silence. Raise this if background noise triggers false notes; lower it if quiet playing gets missed.

## note_stability

How many consistent pitch readings in a row are needed before a note is confirmed. Higher is steadier but slower to react.

## mic_warmup_frames

How many initial readings are discarded right after the mic starts listening, to let it settle before detection begins.

## grace_frames

How many shaky readings after a confirmed note are tolerated before the tracker gives up on it and starts confirming a new one.

## octave_correction

Snap detected pitches that are an octave off to the nearest note in your exercise's range — helps with instruments prone to octave errors.

## yin_threshold

How strict the pitch detector is about a note being clearly periodic. Lower catches quieter or noisier notes; higher rejects more false positives.
