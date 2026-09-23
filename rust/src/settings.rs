//! Shared settings model: defaults, load-time normalization, and every rule that changes
//! settings. Platforms only persist the JSON string this module returns and render it.
//!
//! Three stateless, total (never fail/panic) string-in/string-out functions:
//! * [`defaults_json`]  - the default settings for a platform.
//! * [`normalize_json`] - tolerant load: fills, clamps and repairs whatever was stored.
//! * [`apply_json`]     - applies one action (see [`apply_json`]) and returns new settings.

use crate::music_theory::{enforce_min_range_span, scale_type_from_id, INSTRUMENTS, MIN_RANGE_SPAN};
use serde::Serialize;
use serde_json::{Map, Value};

/// Which client is asking; selects the (few) per-platform default overrides.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    Android,
    Ios,
    Desktop,
}

impl Platform {
    /// Bridge-friendly id: 0 = Android, 1 = iOS, 2 = Desktop. Unknown ids get no overrides.
    pub fn from_id(id: u8) -> Platform {
        match id {
            0 => Platform::Android,
            1 => Platform::Ios,
            _ => Platform::Desktop,
        }
    }
}

/// The persisted settings. Field order here is the JSON field order (golden-tested).
/// Time values are milliseconds on every platform.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    root_note: u8,
    range_start: u8,
    range_end: u8,
    scale_id: u8,
    sequence_length: u8,
    tempo_bpm: u16,
    show_test_notes: bool,
    play_pass_fail_sounds: bool,
    key_signature_mode: u8,
    intro_sound_mode: u8,
    max_retries: u8,
    note_retries: u8,
    silence_threshold: f32,
    frames_to_confirm: u8,
    warmup_frames: u8,
    grace_frames: u8,
    octave_correction: bool,
    yin_threshold: f32,
    pitch_tolerance_cents: f32,
    use_tuner_meter: bool,
    post_chord_gap_ms: u32,
    wrong_note_pause_ms: u32,
    instrument_index: u8,
    test_type: u8,
}

/// Test types the UI offers: 0 = random notes, 2 = diatonic arpeggios.
const TEST_TYPE_RANDOM: i64 = 0;
const TEST_TYPE_DIATONIC: i64 = 2;
/// Diatonic mode is always a 3-note (triad) arpeggio; 4-note 7th chords are suppressed.
const DIATONIC_SEQUENCE_LENGTH: u8 = 3;
/// A pitch tolerance above this marks an instrument as lacking a mechanical pitch stop
/// (voice), which is what turns the continuous tuner meter on by default.
const FIXED_PITCH_TOLERANCE_CENTS: f32 = 50.0;

/// The one-octave window containing the key's root nearest middle C (MIDI 60). Ties (an
/// F#/Gb root is exactly 6 semitones either side) go to the lower octave.
fn default_range(root_note: u8) -> (u8, u8) {
    let mut best = 60i32;
    let mut best_distance = i32::MAX;
    for octave in 2..=6 {
        let candidate = (octave + 1) * 12 + root_note as i32;
        let distance = (candidate - 60).abs();
        if distance < best_distance {
            best = candidate;
            best_distance = distance;
        }
    }
    (best as u8, best as u8 + MIN_RANGE_SPAN)
}

fn defaults(platform: Platform) -> Settings {
    let piano = &INSTRUMENTS[0];
    let (range_start, range_end) = default_range(0);
    let mut settings = Settings {
        root_note: 0,
        range_start,
        range_end,
        scale_id: 0,
        sequence_length: 1,
        tempo_bpm: 100,
        show_test_notes: false,
        play_pass_fail_sounds: true,
        key_signature_mode: 0,
        intro_sound_mode: 1,
        max_retries: 5,
        note_retries: 2,
        silence_threshold: 0.003,
        frames_to_confirm: 3,
        warmup_frames: 4,
        grace_frames: piano.grace_frames as u8,
        octave_correction: piano.octave_correction,
        yin_threshold: crate::pitch_detection::DEFAULT_YIN_THRESHOLD,
        pitch_tolerance_cents: piano.pitch_tolerance_cents,
        use_tuner_meter: piano.pitch_tolerance_cents > FIXED_PITCH_TOLERANCE_CENTS,
        post_chord_gap_ms: 800,
        wrong_note_pause_ms: 3000,
        instrument_index: 0,
        test_type: TEST_TYPE_RANDOM as u8,
    };
    apply_platform_overrides(&mut settings, platform);
    settings
}

/// The only place platform-specific defaults live.
fn apply_platform_overrides(settings: &mut Settings, platform: Platform) {
    if platform == Platform::Ios {
        // iOS confirms a note a frame sooner; tuned together with its 2x software mic gain.
        settings.frames_to_confirm = 2;
    }
}

// ── Lenient field readers ─────────────────────────────────────────────────────
// A wrong-typed or missing field falls back to the given default without affecting any
// other field, so one corrupt value never wipes the user's whole configuration.

fn as_int(value: &Value) -> Option<i64> {
    if let Some(i) = value.as_i64() {
        return Some(i);
    }
    // JS/JSON producers may write 120.0 for an integer.
    value.as_f64().filter(|f| f.is_finite()).map(|f| f.round() as i64)
}

fn int_field(map: &Map<String, Value>, key: &str, default: i64) -> i64 {
    map.get(key).and_then(as_int).unwrap_or(default)
}

fn clamped_int(map: &Map<String, Value>, key: &str, default: i64, min: i64, max: i64) -> i64 {
    int_field(map, key, default).clamp(min, max)
}

/// An integer that must be one of a fixed set of ids; anything else keeps the default.
fn id_field(map: &Map<String, Value>, key: &str, default: i64, is_valid: impl Fn(i64) -> bool) -> i64 {
    let value = int_field(map, key, default);
    if is_valid(value) { value } else { default }
}

fn clamped_float(map: &Map<String, Value>, key: &str, default: f32, min: f32, max: f32) -> f32 {
    let value = map
        .get(key)
        .and_then(Value::as_f64)
        .filter(|f| f.is_finite())
        .map(|f| f as f32)
        .unwrap_or(default);
    value.clamp(min, max)
}

fn bool_field(map: &Map<String, Value>, key: &str, default: bool) -> bool {
    map.get(key).and_then(Value::as_bool).unwrap_or(default)
}

/// Enforces the one-octave minimum range, keeping the edge the user did not move.
fn fixed_range(new_start: i64, new_end: i64, old_start: u8, old_end: u8) -> (u8, u8) {
    let new_start = new_start.clamp(0, 127) as u8;
    let new_end = new_end.clamp(0, 127) as u8;
    let (start, end) = enforce_min_range_span(new_start, new_end, old_start, old_end);
    if end - start < MIN_RANGE_SPAN {
        // Only reachable at the very bottom of the MIDI range (end < 12).
        return (0, MIN_RANGE_SPAN);
    }
    (start, end)
}

/// Builds valid settings from possibly-messy JSON fields; `fallback` supplies the value
/// for any field that is missing, wrong-typed, or an invalid id.
fn build(map: &Map<String, Value>, fallback: &Settings) -> Settings {
    let f = fallback;
    let test_type = match int_field(map, "testType", f.test_type as i64) {
        0 | 1 => TEST_TYPE_RANDOM, // 1 = removed melody mode
        2 | 3 => TEST_TYPE_DIATONIC, // 3 = descending arpeggio, merged into 2
        _ => f.test_type as i64,
    };
    let sequence_length = if test_type == TEST_TYPE_DIATONIC {
        DIATONIC_SEQUENCE_LENGTH
    } else {
        clamped_int(map, "sequenceLength", f.sequence_length as i64, 1, 10) as u8
    };
    let (range_start, range_end) = {
        let start = clamped_int(map, "rangeStart", f.range_start as i64, 0, 127);
        let end = clamped_int(map, "rangeEnd", f.range_end as i64, 0, 127);
        fixed_range(start, end, start as u8, end as u8)
    };
    Settings {
        root_note: id_field(map, "rootNote", f.root_note as i64, |v| (0..12).contains(&v)) as u8,
        range_start,
        range_end,
        scale_id: id_field(map, "scaleId", f.scale_id as i64, |v| {
            (0..=255).contains(&v) && scale_type_from_id(v as u8).is_some()
        }) as u8,
        sequence_length,
        tempo_bpm: clamped_int(map, "tempoBpm", f.tempo_bpm as i64, 20, 300) as u16,
        show_test_notes: bool_field(map, "showTestNotes", f.show_test_notes),
        play_pass_fail_sounds: bool_field(map, "playPassFailSounds", f.play_pass_fail_sounds),
        key_signature_mode: id_field(map, "keySignatureMode", f.key_signature_mode as i64, |v| (0..=1).contains(&v)) as u8,
        intro_sound_mode: id_field(map, "introSoundMode", f.intro_sound_mode as i64, |v| (0..=4).contains(&v)) as u8,
        max_retries: clamped_int(map, "maxRetries", f.max_retries as i64, 1, 50) as u8,
        note_retries: clamped_int(map, "noteRetries", f.note_retries as i64, 0, 20) as u8,
        silence_threshold: clamped_float(map, "silenceThreshold", f.silence_threshold, 0.0001, 0.5),
        frames_to_confirm: clamped_int(map, "framesToConfirm", f.frames_to_confirm as i64, 1, 10) as u8,
        warmup_frames: clamped_int(map, "warmupFrames", f.warmup_frames as i64, 0, 20) as u8,
        grace_frames: clamped_int(map, "graceFrames", f.grace_frames as i64, 0, 20) as u8,
        octave_correction: bool_field(map, "octaveCorrection", f.octave_correction),
        yin_threshold: clamped_float(map, "yinThreshold", f.yin_threshold, 0.01, 0.5),
        pitch_tolerance_cents: clamped_float(map, "pitchToleranceCents", f.pitch_tolerance_cents, 5.0, 200.0),
        use_tuner_meter: bool_field(map, "useTunerMeter", f.use_tuner_meter),
        post_chord_gap_ms: clamped_int(map, "postChordGapMs", f.post_chord_gap_ms as i64, 0, 10_000) as u32,
        wrong_note_pause_ms: clamped_int(map, "wrongNotePauseMs", f.wrong_note_pause_ms as i64, 0, 10_000) as u32,
        instrument_index: id_field(map, "instrumentIndex", f.instrument_index as i64, |v| {
            (0..INSTRUMENTS.len() as i64).contains(&v)
        }) as u8,
        test_type: test_type as u8,
    }
}

fn parse_lenient(input: &str, platform: Platform) -> Settings {
    let base = defaults(platform);
    match serde_json::from_str::<Value>(input) {
        Ok(Value::Object(map)) => build(&map, &base),
        _ => base,
    }
}

fn to_json(settings: &Settings) -> String {
    serde_json::to_string(settings).unwrap_or_else(|_| "{}".to_string())
}

// ── Actions ───────────────────────────────────────────────────────────────────

/// Fields whose changes carry side effects, so they may only change via their own action.
const DEDICATED_ACTION_FIELDS: [&str; 5] = ["rootNote", "rangeStart", "rangeEnd", "instrumentIndex", "testType"];

enum Action {
    Set(Map<String, Value>),
    SetRootNote(i64),
    SetRange { start: i64, end: i64 },
    SetInstrument(i64),
    SetTestType(i64),
    Reset,
}

fn parse_action(json: &str) -> Option<Action> {
    let value: Value = serde_json::from_str(json).ok()?;
    let object = value.as_object()?;
    let int = |key: &str| object.get(key).and_then(as_int);
    match object.get("type")?.as_str()? {
        "reset" => Some(Action::Reset),
        "set" => Some(Action::Set(object.get("values")?.as_object()?.clone())),
        "setRootNote" => Some(Action::SetRootNote(int("value")?)),
        "setRange" => Some(Action::SetRange { start: int("start")?, end: int("end")? }),
        "setInstrument" => Some(Action::SetInstrument(int("value")?)),
        "setTestType" => Some(Action::SetTestType(int("value")?)),
        _ => None,
    }
}

fn apply(mut settings: Settings, action: Action, platform: Platform) -> Settings {
    match action {
        Action::Reset => return defaults(platform),
        Action::Set(values) => {
            let Ok(Value::Object(mut merged)) = serde_json::to_value(&settings) else {
                return settings;
            };
            for (key, value) in values {
                if !DEDICATED_ACTION_FIELDS.contains(&key.as_str()) {
                    merged.insert(key, value);
                }
            }
            return build(&merged, &settings);
        }
        Action::SetRootNote(note) => {
            if (0..12).contains(&note) {
                settings.root_note = note as u8;
                (settings.range_start, settings.range_end) = default_range(note as u8);
            }
        }
        Action::SetRange { start, end } => {
            (settings.range_start, settings.range_end) = fixed_range(start, end, settings.range_start, settings.range_end);
        }
        Action::SetInstrument(index) => {
            if let Some(instrument) = usize::try_from(index).ok().and_then(|i| INSTRUMENTS.get(i)) {
                // Snap everything the instrument defines, otherwise these overrides stay
                // stuck at whatever the previous instrument left them at (e.g. Voice would
                // silently keep Piano's strict 50-cent tolerance and lose vibrato handling).
                settings.instrument_index = index as u8;
                settings.range_start = instrument.range_start as u8;
                settings.range_end = instrument.range_end as u8;
                settings.grace_frames = instrument.grace_frames as u8;
                settings.octave_correction = instrument.octave_correction;
                settings.pitch_tolerance_cents = instrument.pitch_tolerance_cents;
                settings.use_tuner_meter = instrument.pitch_tolerance_cents > FIXED_PITCH_TOLERANCE_CENTS;
            }
        }
        Action::SetTestType(test_type) => {
            if test_type == TEST_TYPE_RANDOM || test_type == TEST_TYPE_DIATONIC {
                settings.test_type = test_type as u8;
                if test_type == TEST_TYPE_DIATONIC {
                    settings.sequence_length = DIATONIC_SEQUENCE_LENGTH;
                }
            }
        }
    }
    settings
}

// ── Public API ────────────────────────────────────────────────────────────────

/// The default settings for `platform`, as JSON.
pub fn defaults_json(platform: Platform) -> String {
    to_json(&defaults(platform))
}

/// Tolerant load: turns whatever was stored (nothing, garbage, an old or partial blob) into
/// valid settings. Missing/invalid fields take their platform default, numbers are clamped,
/// unknown fields are dropped, legacy test types are remapped. Never fails.
pub fn normalize_json(input: &str, platform: Platform) -> String {
    to_json(&parse_lenient(input, platform))
}

/// Applies one action to `current` (normalized first) and returns the new settings.
///
/// `action` is a JSON object with a `type`:
/// * `{"type":"set","values":{"tempoBpm":120,...}}` - plain fields (clamped); fields that
///   have their own action (rootNote, range, instrumentIndex, testType) are ignored here.
/// * `{"type":"setRootNote","value":5}` - also re-derives the default range for the key.
/// * `{"type":"setRange","start":48,"end":72}` - enforces the one-octave minimum span.
/// * `{"type":"setInstrument","value":8}` - snaps range and detection tuning to the table.
/// * `{"type":"setTestType","value":2}` - diatonic mode forces a 3-note sequence.
/// * `{"type":"reset"}` - back to `defaults(platform)`.
///
/// An unusable action returns the (normalized) current settings unchanged.
pub fn apply_json(current: &str, action: &str, platform: Platform) -> String {
    let settings = parse_lenient(current, platform);
    let next = match parse_action(action) {
        Some(action) => apply(settings, action, platform),
        None => settings,
    };
    to_json(&next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::music_theory::INSTRUMENTS;

    const ANDROID_DEFAULTS: &str = r#"{"rootNote":0,"rangeStart":60,"rangeEnd":72,"scaleId":0,"sequenceLength":1,"tempoBpm":100,"showTestNotes":false,"playPassFailSounds":true,"keySignatureMode":0,"introSoundMode":1,"maxRetries":5,"noteRetries":2,"silenceThreshold":0.003,"framesToConfirm":3,"warmupFrames":4,"graceFrames":3,"octaveCorrection":false,"yinThreshold":0.15,"pitchToleranceCents":50.0,"useTunerMeter":false,"postChordGapMs":800,"wrongNotePauseMs":3000,"instrumentIndex":0,"testType":0}"#;

    fn parse(s: &str) -> Value {
        serde_json::from_str(s).expect("output must be valid JSON")
    }

    fn norm(input: &str) -> String {
        normalize_json(input, Platform::Android)
    }

    /// Applies a `set` action with the given JSON object of values.
    fn set(current: &str, values: &str) -> String {
        apply_json(current, &format!(r#"{{"type":"set","values":{values}}}"#), Platform::Android)
    }

    fn act(current: &str, action: &str) -> String {
        apply_json(current, action, Platform::Android)
    }

    fn defaults() -> String {
        defaults_json(Platform::Android)
    }

    // ── Platform ─────────────────────────────────────────────────────────────

    #[test]
    fn platform_from_id_maps_known_ids_and_unknown_gets_no_overrides() {
        assert_eq!(Platform::from_id(0), Platform::Android);
        assert_eq!(Platform::from_id(1), Platform::Ios);
        assert_eq!(Platform::from_id(2), Platform::Desktop);
        assert_eq!(Platform::from_id(255), Platform::Desktop);
    }

    // ── defaults ─────────────────────────────────────────────────────────────

    #[test]
    fn defaults_android_match_golden_json() {
        assert_eq!(defaults_json(Platform::Android), ANDROID_DEFAULTS);
    }

    #[test]
    fn defaults_desktop_equal_android() {
        assert_eq!(defaults_json(Platform::Desktop), defaults_json(Platform::Android));
    }

    #[test]
    fn defaults_ios_differ_from_android_only_in_frames_to_confirm() {
        let android = parse(&defaults_json(Platform::Android));
        let ios = parse(&defaults_json(Platform::Ios));
        assert_eq!(android["framesToConfirm"], 3);
        assert_eq!(ios["framesToConfirm"], 2);
        for (key, value) in android.as_object().unwrap() {
            if key != "framesToConfirm" {
                assert_eq!(&ios[key], value, "field {key} should match across platforms");
            }
        }
    }

    #[test]
    fn defaults_detection_tuning_comes_from_the_piano_instrument_table() {
        let d = parse(&defaults());
        let piano = &INSTRUMENTS[0];
        assert_eq!(d["instrumentIndex"], 0);
        assert_eq!(d["graceFrames"], piano.grace_frames);
        assert_eq!(d["octaveCorrection"], piano.octave_correction);
        assert_eq!(d["pitchToleranceCents"], piano.pitch_tolerance_cents);
        assert_eq!(d["useTunerMeter"], piano.pitch_tolerance_cents > 50.0);
        assert_eq!(d["rangeStart"], piano.range_start);
        assert_eq!(d["rangeEnd"], piano.range_end);
    }

    // ── normalize: tolerance of bad input ────────────────────────────────────

    #[test]
    fn normalize_empty_string_returns_defaults() {
        assert_eq!(norm(""), defaults());
    }

    #[test]
    fn normalize_non_object_json_and_garbage_return_defaults() {
        for input in ["not json", "[]", "null", "42", "\"x\"", "{", "{\"a\":"] {
            assert_eq!(norm(input), defaults(), "input {input:?}");
        }
    }

    #[test]
    fn normalize_fills_missing_fields_with_defaults() {
        let out = parse(&norm(r#"{"tempoBpm":120}"#));
        assert_eq!(out["tempoBpm"], 120);
        let mut expected = parse(&defaults());
        expected["tempoBpm"] = Value::from(120);
        assert_eq!(out, expected);
    }

    #[test]
    fn normalize_drops_unknown_fields() {
        let out = parse(&norm(r#"{"bogus":1,"tempoBpm":90}"#));
        assert!(out.get("bogus").is_none());
        assert_eq!(out["tempoBpm"], 90);
    }

    #[test]
    fn normalize_wrong_typed_field_falls_back_without_losing_other_fields() {
        let out = parse(&norm(r#"{"tempoBpm":"fast","maxRetries":3,"showTestNotes":"yes"}"#));
        assert_eq!(out["tempoBpm"], 100, "bad type -> default for that field only");
        assert_eq!(out["maxRetries"], 3, "other fields survive");
        assert_eq!(out["showTestNotes"], false);
    }

    #[test]
    fn normalize_accepts_integral_floats_for_integer_fields() {
        // JS/JSON producers can emit 120.0 for an integer.
        assert_eq!(parse(&norm(r#"{"tempoBpm":120.0}"#))["tempoBpm"], 120);
    }

    #[test]
    fn normalize_clamps_numbers_to_safety_bounds() {
        let out = parse(&norm(
            r#"{"tempoBpm":9999,"maxRetries":0,"noteRetries":500,"yinThreshold":5.0,"pitchToleranceCents":1.0,
                "graceFrames":500,"warmupFrames":500,"framesToConfirm":0,"sequenceLength":99,
                "postChordGapMs":999999,"wrongNotePauseMs":999999,"silenceThreshold":9.0}"#,
        ));
        assert_eq!(out["tempoBpm"], 300);
        assert_eq!(out["maxRetries"], 1);
        assert_eq!(out["noteRetries"], 20);
        assert_eq!(out["yinThreshold"], 0.5);
        assert_eq!(out["pitchToleranceCents"], 5.0);
        assert_eq!(out["graceFrames"], 20);
        assert_eq!(out["warmupFrames"], 20);
        assert_eq!(out["framesToConfirm"], 1);
        assert_eq!(out["sequenceLength"], 10);
        assert_eq!(out["postChordGapMs"], 10000);
        assert_eq!(out["wrongNotePauseMs"], 10000);
        assert_eq!(out["silenceThreshold"], 0.5);
    }

    #[test]
    fn normalize_replaces_invalid_ids_with_defaults() {
        let out = parse(&norm(
            r#"{"rootNote":12,"scaleId":99,"instrumentIndex":99,"keySignatureMode":7,"introSoundMode":9,"testType":5}"#,
        ));
        assert_eq!(out["rootNote"], 0);
        assert_eq!(out["scaleId"], 0);
        assert_eq!(out["instrumentIndex"], 0);
        assert_eq!(out["keySignatureMode"], 0);
        assert_eq!(out["introSoundMode"], 1);
        assert_eq!(out["testType"], 0);
    }

    #[test]
    fn normalize_enforces_one_octave_minimum_range() {
        let out = parse(&norm(r#"{"rangeStart":60,"rangeEnd":62}"#));
        assert_eq!(out["rangeStart"], 50);
        assert_eq!(out["rangeEnd"], 62);
    }

    #[test]
    fn normalize_repairs_inverted_range() {
        let out = parse(&norm(r#"{"rangeStart":72,"rangeEnd":60}"#));
        let (start, end) = (out["rangeStart"].as_i64().unwrap(), out["rangeEnd"].as_i64().unwrap());
        assert!(end - start >= 12, "range {start}..{end} must span an octave");
    }

    #[test]
    fn normalize_maps_legacy_test_types() {
        // 1 = removed melody mode -> random; 3 = merged descending arpeggio -> diatonic.
        assert_eq!(parse(&norm(r#"{"testType":1}"#))["testType"], 0);
        assert_eq!(parse(&norm(r#"{"testType":3}"#))["testType"], 2);
    }

    #[test]
    fn normalize_diatonic_mode_forces_sequence_length_three() {
        assert_eq!(parse(&norm(r#"{"testType":2,"sequenceLength":4}"#))["sequenceLength"], 3);
        assert_eq!(parse(&norm(r#"{"testType":3,"sequenceLength":1}"#))["sequenceLength"], 3);
        assert_eq!(parse(&norm(r#"{"testType":0,"sequenceLength":4}"#))["sequenceLength"], 4);
    }

    #[test]
    fn normalize_is_idempotent() {
        let inputs = [
            "",
            "garbage",
            r#"{"tempoBpm":9999,"rangeStart":60,"rangeEnd":61,"testType":3}"#,
            r#"{"tempoBpm":120.7,"scaleId":2,"instrumentIndex":8}"#,
            ANDROID_DEFAULTS,
        ];
        for input in inputs {
            let once = norm(input);
            assert_eq!(norm(&once), once, "input {input:?}");
        }
    }

    #[test]
    fn normalize_uses_platform_defaults_for_missing_fields() {
        assert_eq!(parse(&normalize_json("", Platform::Ios))["framesToConfirm"], 2);
        assert_eq!(parse(&normalize_json("{}", Platform::Ios))["framesToConfirm"], 2);
        // ...but a stored value always wins over the platform default.
        assert_eq!(parse(&normalize_json(r#"{"framesToConfirm":4}"#, Platform::Ios))["framesToConfirm"], 4);
    }

    // ── apply: set ───────────────────────────────────────────────────────────

    #[test]
    fn apply_set_updates_plain_fields_and_keeps_the_rest() {
        let out = parse(&set(&defaults(), r#"{"tempoBpm":140,"showTestNotes":true,"maxRetries":8}"#));
        assert_eq!(out["tempoBpm"], 140);
        assert_eq!(out["showTestNotes"], true);
        assert_eq!(out["maxRetries"], 8);
        assert_eq!(out["noteRetries"], 2, "untouched field is preserved");
    }

    #[test]
    fn apply_set_clamps_values() {
        assert_eq!(parse(&set(&defaults(), r#"{"tempoBpm":99999}"#))["tempoBpm"], 300);
    }

    #[test]
    fn apply_set_ignores_fields_owned_by_dedicated_actions() {
        // These have side effects (range snapping etc.), so they must not be settable
        // through the plain `set` path.
        let out = parse(&set(
            &defaults(),
            r#"{"rootNote":5,"rangeStart":40,"rangeEnd":50,"instrumentIndex":3,"testType":2,"tempoBpm":120}"#,
        ));
        assert_eq!(out["tempoBpm"], 120, "plain field in the same action still applies");
        assert_eq!(out["rootNote"], 0);
        assert_eq!(out["rangeStart"], 60);
        assert_eq!(out["rangeEnd"], 72);
        assert_eq!(out["instrumentIndex"], 0);
        assert_eq!(out["testType"], 0);
    }

    // ── apply: setRootNote ───────────────────────────────────────────────────

    #[test]
    fn apply_set_root_note_rederives_range_around_middle_c() {
        let out = parse(&act(&defaults(), r#"{"type":"setRootNote","value":5}"#));
        assert_eq!(out["rootNote"], 5);
        assert_eq!((out["rangeStart"].as_i64(), out["rangeEnd"].as_i64()), (Some(65), Some(77)));
        let b = parse(&act(&defaults(), r#"{"type":"setRootNote","value":11}"#));
        assert_eq!((b["rangeStart"].as_i64(), b["rangeEnd"].as_i64()), (Some(59), Some(71)));
    }

    #[test]
    fn apply_set_root_note_tie_goes_to_the_lower_octave() {
        // F#/Gb is exactly 6 semitones from middle C both ways (54 and 66). Android and
        // iOS always chose the lower one; desktop's strict `<` chose 66. Rust pins the
        // majority behaviour so all three now agree.
        let out = parse(&act(&defaults(), r#"{"type":"setRootNote","value":6}"#));
        assert_eq!((out["rangeStart"].as_i64(), out["rangeEnd"].as_i64()), (Some(54), Some(66)));
    }

    #[test]
    fn apply_set_root_note_rejects_out_of_range_value() {
        let before = defaults();
        assert_eq!(act(&before, r#"{"type":"setRootNote","value":12}"#), before);
        assert_eq!(act(&before, r#"{"type":"setRootNote","value":-1}"#), before);
    }

    // ── apply: setRange ──────────────────────────────────────────────────────

    #[test]
    fn apply_set_range_accepts_a_wide_enough_range() {
        let out = parse(&act(&defaults(), r#"{"type":"setRange","start":48,"end":72}"#));
        assert_eq!((out["rangeStart"].as_i64(), out["rangeEnd"].as_i64()), (Some(48), Some(72)));
    }

    #[test]
    fn apply_set_range_keeps_the_start_edge_when_it_moved() {
        // Default is 60..72; dragging the start up to 70 must push the end out, not the start back.
        let out = parse(&act(&defaults(), r#"{"type":"setRange","start":70,"end":72}"#));
        assert_eq!((out["rangeStart"].as_i64(), out["rangeEnd"].as_i64()), (Some(70), Some(82)));
    }

    #[test]
    fn apply_set_range_keeps_the_end_edge_when_it_moved() {
        // Dragging the end down to 62 must push the start down, not the end back up.
        let out = parse(&act(&defaults(), r#"{"type":"setRange","start":60,"end":62}"#));
        assert_eq!((out["rangeStart"].as_i64(), out["rangeEnd"].as_i64()), (Some(50), Some(62)));
    }

    // ── apply: setInstrument ─────────────────────────────────────────────────

    #[test]
    fn apply_set_instrument_snaps_range_and_detection_tuning_to_the_table() {
        let out = parse(&act(&defaults(), r#"{"type":"setInstrument","value":1}"#)); // Guitar
        assert_eq!(out["instrumentIndex"], 1);
        assert_eq!((out["rangeStart"].as_i64(), out["rangeEnd"].as_i64()), (Some(52), Some(64)));
        assert_eq!(out["graceFrames"], 5);
        assert_eq!(out["octaveCorrection"], true);
        assert_eq!(out["pitchToleranceCents"], 50.0);
        assert_eq!(out["useTunerMeter"], false);
    }

    #[test]
    fn apply_set_instrument_with_wide_tolerance_enables_tuner_meter() {
        let voice = parse(&act(&defaults(), r#"{"type":"setInstrument","value":8}"#)); // Soprano Voice
        assert_eq!(voice["pitchToleranceCents"], 80.0);
        assert_eq!(voice["useTunerMeter"], true);
        // ...and switching back to a fixed-pitch instrument turns it off again.
        let piano = parse(&act(&voice.to_string(), r#"{"type":"setInstrument","value":0}"#));
        assert_eq!(piano["pitchToleranceCents"], 50.0);
        assert_eq!(piano["useTunerMeter"], false);
    }

    #[test]
    fn apply_set_instrument_keeps_unrelated_settings() {
        let customised = set(&defaults(), r#"{"tempoBpm":140,"maxRetries":8}"#);
        let out = parse(&act(&customised, r#"{"type":"setInstrument","value":1}"#));
        assert_eq!(out["tempoBpm"], 140);
        assert_eq!(out["maxRetries"], 8);
    }

    #[test]
    fn apply_set_instrument_rejects_invalid_index() {
        let before = defaults();
        assert_eq!(act(&before, r#"{"type":"setInstrument","value":99}"#), before);
        assert_eq!(act(&before, r#"{"type":"setInstrument","value":-1}"#), before);
    }

    // ── apply: setTestType ───────────────────────────────────────────────────

    #[test]
    fn apply_set_test_type_diatonic_forces_sequence_length_three() {
        let four = set(&defaults(), r#"{"sequenceLength":4}"#);
        let out = parse(&act(&four, r#"{"type":"setTestType","value":2}"#));
        assert_eq!(out["testType"], 2);
        assert_eq!(out["sequenceLength"], 3);
    }

    #[test]
    fn apply_set_test_type_random_keeps_sequence_length() {
        let four = set(&defaults(), r#"{"sequenceLength":4}"#);
        let out = parse(&act(&four, r#"{"type":"setTestType","value":0}"#));
        assert_eq!(out["testType"], 0);
        assert_eq!(out["sequenceLength"], 4);
    }

    #[test]
    fn apply_set_test_type_rejects_unsupported_values() {
        let before = defaults();
        for bad in [1, 3, 5, -1] {
            let action = format!(r#"{{"type":"setTestType","value":{bad}}}"#);
            assert_eq!(act(&before, &action), before, "testType {bad}");
        }
    }

    // ── apply: reset ─────────────────────────────────────────────────────────

    #[test]
    fn apply_reset_restores_defaults_after_customising() {
        let custom = act(&set(&defaults(), r#"{"tempoBpm":140}"#), r#"{"type":"setInstrument","value":8}"#);
        assert_ne!(custom, defaults());
        assert_eq!(act(&custom, r#"{"type":"reset"}"#), defaults());
    }

    #[test]
    fn apply_reset_uses_the_platform_defaults() {
        let out = apply_json(&defaults(), r#"{"type":"reset"}"#, Platform::Ios);
        assert_eq!(out, defaults_json(Platform::Ios));
        assert_eq!(parse(&out)["framesToConfirm"], 2);
    }

    #[test]
    fn apply_reset_needs_no_valid_current_settings() {
        assert_eq!(act("", r#"{"type":"reset"}"#), defaults());
        assert_eq!(act("garbage", r#"{"type":"reset"}"#), defaults());
    }

    // ── apply: robustness ────────────────────────────────────────────────────

    #[test]
    fn apply_with_unusable_action_returns_current_settings_unchanged() {
        let custom = set(&defaults(), r#"{"tempoBpm":140}"#);
        for bad in ["", "not json", "{}", r#"{"type":"explode"}"#, r#"{"type":"setRootNote"}"#, "[]"] {
            assert_eq!(act(&custom, bad), custom, "action {bad:?}");
        }
    }

    #[test]
    fn apply_normalizes_unusable_current_settings_before_applying() {
        let out = parse(&act("garbage", r#"{"type":"set","values":{"tempoBpm":120}}"#));
        let mut expected = parse(&defaults());
        expected["tempoBpm"] = Value::from(120);
        assert_eq!(out, expected);
    }

    #[test]
    fn apply_results_are_always_normalized_fixed_points() {
        let actions = [
            r#"{"type":"set","values":{"tempoBpm":9999,"sequenceLength":0}}"#,
            r#"{"type":"setRootNote","value":6}"#,
            r#"{"type":"setRange","start":60,"end":61}"#,
            r#"{"type":"setInstrument","value":8}"#,
            r#"{"type":"setTestType","value":2}"#,
            r#"{"type":"reset"}"#,
        ];
        for action in actions {
            let out = act(&defaults(), action);
            assert_eq!(norm(&out), out, "action {action}");
        }
    }
}
