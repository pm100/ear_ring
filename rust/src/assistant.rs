//! Setup-assistant model (docs/superpowers/specs/2026-09-30-setup-assistant-design.md).
//! Platforms only render the chat and do the HTTPS call; everything else lives here: the
//! settings schema the model is shown, request building, response/proposal validation and the
//! user-facing error text. Like `settings.rs`, every public function is total string-in /
//! string-out and never fails or panics.

use crate::music_theory::INSTRUMENTS;
use crate::settings::{apply_json, defaults_json, normalize_json, Platform};
use serde_json::{json, Map, Value};

/// Chat turns resent to the proxy with each request.
pub const MAX_TURNS: usize = 6;
/// Longest turn sent to the proxy, in characters.
const MAX_TURN_CHARS: usize = 500;
/// Longest model reply shown, in characters.
const MAX_REPLY_CHARS: usize = 4000;
/// Where every platform POSTs questions. Replace with the deployed proxy's address.
pub const PROXY_URL: &str = "https://ear-ring-assistant.example.workers.dev/v1/ask";

enum Kind {
    /// Discrete options: (stored value, label).
    Choice(&'static [(i64, &'static str)]),
    /// One of the instruments in the `INSTRUMENTS` table.
    Instrument,
    Int { min: i64, max: i64, step: i64 },
    Float { min: f64, max: f64, step: f64 },
    Bool,
}

/// How a change is written. Most settings use the plain `set` action; a few have dedicated
/// actions with side effects (see `DEDICATED_ACTION_FIELDS` in settings.rs).
#[derive(Clone, Copy, PartialEq)]
enum Route {
    Set,
    RootNote,
    Instrument,
    TestType,
}

struct Spec {
    /// The name the model uses.
    key: &'static str,
    /// The key in the persisted settings JSON (differs from `key` only for mic sensitivity).
    stored_key: &'static str,
    /// Entry in tooltips.md used as the model-facing description.
    tooltip: &'static str,
    label: &'static str,
    kind: Kind,
    route: Route,
    /// Appended to Int/Float values when shown to the user, e.g. " ms".
    unit: &'static str,
}

const ROOT_NOTES: &[(i64, &str)] = &[
    (0, "C"), (1, "C#/Db"), (2, "D"), (3, "D#/Eb"), (4, "E"), (5, "F"),
    (6, "F#/Gb"), (7, "G"), (8, "G#/Ab"), (9, "A"), (10, "A#/Bb"), (11, "B"),
];
// Locrian (id 4) is deliberately absent, as in each platform's scale picker.
const SCALES: &[(i64, &str)] = &[(0, "Major"), (1, "Natural Minor"), (2, "Dorian"), (3, "Mixolydian")];
const TEST_TYPES: &[(i64, &str)] = &[(0, "Random Notes"), (2, "Diatonic Arpeggios")];
const TEMPOS: &[(i64, &str)] = &[(60, "60"), (80, "80"), (100, "100"), (120, "120"), (140, "140")];
const KEY_SIG: &[(i64, &str)] = &[(0, "Inline accidentals"), (1, "Key signature")];
const INTRO: &[(i64, &str)] = &[(0, "Root Note"), (1, "Chord"), (2, "Arpeggio"), (3, "Scale"), (4, "None")];
const MAX_RETRIES: &[(i64, &str)] = &[(1, "1"), (2, "2"), (3, "3"), (5, "5"), (8, "8"), (10, "10")];
const NOTE_RETRIES: &[(i64, &str)] = &[(0, "0 (off)"), (1, "1"), (2, "2"), (3, "3"), (4, "4"), (5, "5")];
const WRONG_PAUSE: &[(i64, &str)] = &[(1000, "1 s"), (2000, "2 s"), (3000, "3 s"), (5000, "5 s")];
const STABILITY: &[(i64, &str)] = &[(2, "2"), (3, "3"), (4, "4"), (5, "5")];
const WARMUP: &[(i64, &str)] = &[(0, "0"), (1, "1"), (2, "2"), (3, "3"), (4, "4"), (5, "5"), (6, "6")];
const GRACE: &[(i64, &str)] = &[(0, "0"), (1, "1"), (2, "2"), (3, "3"), (4, "4"), (5, "5"), (6, "6")];

/// Every setting the assistant may propose, matching what each platform's Settings, Home and
/// Mic Setup screens can actually show (DESIGN.md). Pitch tolerance, the meter style and the
/// note range are left out: they are premium-only / picker-driven and awkward to describe.
const SPECS: &[Spec] = &[
    Spec { key: "rootNote", stored_key: "rootNote", tooltip: "key", label: "Key", kind: Kind::Choice(ROOT_NOTES), route: Route::RootNote, unit: "" },
    Spec { key: "scaleId", stored_key: "scaleId", tooltip: "scale", label: "Scale", kind: Kind::Choice(SCALES), route: Route::Set, unit: "" },
    Spec { key: "testType", stored_key: "testType", tooltip: "test_type", label: "Test Type", kind: Kind::Choice(TEST_TYPES), route: Route::TestType, unit: "" },
    Spec { key: "sequenceLength", stored_key: "sequenceLength", tooltip: "sequence_length", label: "Sequence Length", kind: Kind::Int { min: 1, max: 10, step: 1 }, route: Route::Set, unit: " notes" },
    Spec { key: "tempoBpm", stored_key: "tempoBpm", tooltip: "tempo", label: "Tempo (BPM)", kind: Kind::Choice(TEMPOS), route: Route::Set, unit: "" },
    Spec { key: "instrumentIndex", stored_key: "instrumentIndex", tooltip: "instrument", label: "Instrument", kind: Kind::Instrument, route: Route::Instrument, unit: "" },
    Spec { key: "playPassFailSounds", stored_key: "playPassFailSounds", tooltip: "play_pass_fail_sounds", label: "Play Pass/Fail Sounds", kind: Kind::Bool, route: Route::Set, unit: "" },
    Spec { key: "introSoundMode", stored_key: "introSoundMode", tooltip: "intro_sound", label: "Intro Sound", kind: Kind::Choice(INTRO), route: Route::Set, unit: "" },
    Spec { key: "showTestNotes", stored_key: "showTestNotes", tooltip: "display_test_notes", label: "Display Test Notes", kind: Kind::Bool, route: Route::Set, unit: "" },
    Spec { key: "keySignatureMode", stored_key: "keySignatureMode", tooltip: "use_key_signature", label: "Use Key Signature", kind: Kind::Choice(KEY_SIG), route: Route::Set, unit: "" },
    Spec { key: "maxRetries", stored_key: "maxRetries", tooltip: "max_retries", label: "Max Retries", kind: Kind::Choice(MAX_RETRIES), route: Route::Set, unit: "" },
    Spec { key: "noteRetries", stored_key: "noteRetries", tooltip: "retry_same_note", label: "Retry Same Note", kind: Kind::Choice(NOTE_RETRIES), route: Route::Set, unit: "" },
    Spec { key: "postChordGapMs", stored_key: "postChordGapMs", tooltip: "pause_before_playing", label: "Pause Before Playing", kind: Kind::Int { min: 400, max: 2000, step: 100 }, route: Route::Set, unit: " ms" },
    Spec { key: "wrongNotePauseMs", stored_key: "wrongNotePauseMs", tooltip: "wrong_note_pause", label: "Wrong Note Pause", kind: Kind::Choice(WRONG_PAUSE), route: Route::Set, unit: "" },
    Spec { key: "micSensitivity", stored_key: "silenceThreshold", tooltip: "mic_sensitivity", label: "Mic Sensitivity", kind: Kind::Int { min: 1, max: 10, step: 1 }, route: Route::Set, unit: " of 10" },
    Spec { key: "framesToConfirm", stored_key: "framesToConfirm", tooltip: "note_stability", label: "Note Stability (frames to confirm)", kind: Kind::Choice(STABILITY), route: Route::Set, unit: "" },
    Spec { key: "warmupFrames", stored_key: "warmupFrames", tooltip: "mic_warmup_frames", label: "Mic Warmup Frames", kind: Kind::Choice(WARMUP), route: Route::Set, unit: "" },
    Spec { key: "graceFrames", stored_key: "graceFrames", tooltip: "grace_frames", label: "Grace Frames", kind: Kind::Choice(GRACE), route: Route::Set, unit: "" },
    Spec { key: "octaveCorrection", stored_key: "octaveCorrection", tooltip: "octave_correction", label: "Octave Correction", kind: Kind::Bool, route: Route::Set, unit: "" },
    Spec { key: "yinThreshold", stored_key: "yinThreshold", tooltip: "yin_threshold", label: "YIN Threshold", kind: Kind::Float { min: 0.05, max: 0.30, step: 0.01 }, route: Route::Set, unit: "" },
];

// ── Mic sensitivity <-> stored silence threshold ─────────────────────────────
// The Mic Setup slider is 1..10; the stored value is threshold = 0.011 - sensitivity * 0.001.

fn round_to(value: f64, places: i32) -> f64 {
    let factor = 10f64.powi(places);
    (value * factor).round() / factor
}

fn sensitivity_to_threshold(sensitivity: i64) -> f64 {
    round_to(0.011 - sensitivity as f64 * 0.001, 4)
}

fn threshold_to_sensitivity(threshold: f64) -> i64 {
    (((0.011 - threshold) / 0.001).round() as i64).clamp(1, 10)
}

// ── Reading and writing values in the user's terms ───────────────────────────

fn find_spec(key: &str) -> Option<&'static Spec> {
    SPECS.iter().find(|spec| spec.key == key)
}

/// The options of a Choice/Instrument setting as (value, label, premium).
fn options(spec: &Spec) -> Vec<(i64, String, bool)> {
    match &spec.kind {
        Kind::Choice(list) => list.iter().map(|(v, l)| (*v, l.to_string(), false)).collect(),
        Kind::Instrument => INSTRUMENTS
            .iter()
            .enumerate()
            .map(|(i, inst)| (i as i64, inst.name.to_string(), inst.premium))
            .collect(),
        _ => Vec::new(),
    }
}

/// The setting's current value in the user's terms (a number or a bool), read from settings JSON.
fn user_value(settings: &Value, spec: &Spec) -> Option<Value> {
    let stored = settings.get(spec.stored_key)?;
    if spec.key == "micSensitivity" {
        return Some(json!(threshold_to_sensitivity(stored.as_f64()?)));
    }
    match spec.kind {
        Kind::Bool => Some(json!(stored.as_bool()?)),
        Kind::Float { .. } => Some(json!(round_to(stored.as_f64()?, 4))),
        _ => Some(json!(stored.as_i64().or_else(|| stored.as_f64().map(|f| f.round() as i64))?)),
    }
}

fn same(a: &Value, b: &Value) -> bool {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => (x - y).abs() < 1e-6,
        _ => a == b,
    }
}

/// How a value is shown on the confirm card.
fn display(spec: &Spec, value: &Value) -> String {
    if let Some(flag) = value.as_bool() {
        return if flag { "On" } else { "Off" }.to_string();
    }
    if let Some(number) = value.as_i64() {
        if let Some((_, label, _)) = options(spec).into_iter().find(|(v, _, _)| *v == number) {
            return label;
        }
    }
    match value.as_f64() {
        Some(n) if n.fract() == 0.0 => format!("{}{}", n as i64, spec.unit),
        Some(n) => format!("{}{}", round_to(n, 4), spec.unit),
        None => value.to_string(),
    }
}

/// Coerces what the model sent into the value type the spec expects, snapped to its step.
fn coerce(spec: &Spec, raw: &Value) -> Option<Value> {
    match spec.kind {
        Kind::Bool => raw.as_bool().map(Value::Bool),
        Kind::Float { step, .. } => {
            let n = raw.as_f64().filter(|f| f.is_finite())?;
            Some(json!(round_to((n / step).round() * step, 4)))
        }
        _ => {
            let n = raw.as_f64().filter(|f| f.is_finite())?;
            (n.fract() == 0.0).then(|| json!(n as i64))
        }
    }
}

fn is_available(spec: &Spec, value: &Value) -> bool {
    match &spec.kind {
        Kind::Bool => value.is_boolean(),
        Kind::Choice(_) | Kind::Instrument => {
            value.as_i64().map_or(false, |v| options(spec).iter().any(|(id, _, _)| *id == v))
        }
        Kind::Int { min, max, step } => {
            value.as_i64().map_or(false, |v| (*min..=*max).contains(&v) && (v - min) % step == 0)
        }
        Kind::Float { min, max, .. } => value.as_f64().map_or(false, |v| v >= min - 1e-9 && v <= max + 1e-9),
    }
}

/// The settings.rs action that writes `value` for `spec`.
fn action_for(spec: &Spec, value: &Value) -> Value {
    match spec.route {
        Route::RootNote => json!({"type": "setRootNote", "value": value}),
        Route::Instrument => json!({"type": "setInstrument", "value": value}),
        Route::TestType => json!({"type": "setTestType", "value": value}),
        Route::Set => {
            let stored = if spec.key == "micSensitivity" {
                json!(sensitivity_to_threshold(value.as_i64().unwrap_or(8)))
            } else {
                value.clone()
            };
            json!({"type": "set", "values": { spec.stored_key: stored }})
        }
    }
}

// ── Schema shown to the model ────────────────────────────────────────────────

fn tooltip_text(key: &str) -> String {
    let entries: Value = serde_json::from_str(&crate::tooltips_json()).unwrap_or(Value::Null);
    entries
        .as_array()
        .and_then(|list| list.iter().find(|e| e["key"] == key))
        .and_then(|e| e["text"].as_str())
        .unwrap_or("")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANDROID: Platform = Platform::Android;

    fn defaults() -> String {
        defaults_json(ANDROID)
    }

    fn parse(s: &str) -> Value {
        serde_json::from_str(s).expect("output must be valid JSON")
    }

    fn with(settings_json: &str, action: &str) -> String {
        apply_json(settings_json, action, ANDROID)
    }

    // ── Spec table stays in sync with the rest of the core ───────────────────

    #[test]
    fn every_spec_tooltip_exists_in_tooltips_md() {
        for spec in SPECS {
            assert!(!tooltip_text(spec.tooltip).is_empty(), "{} has no tooltip '{}'", spec.key, spec.tooltip);
        }
    }

    #[test]
    fn spec_keys_are_unique() {
        for spec in SPECS {
            assert_eq!(SPECS.iter().filter(|s| s.key == spec.key).count(), 1, "{}", spec.key);
        }
    }

    /// Every value the assistant may advertise must be accepted unchanged by settings.rs, so a
    /// change to a clamp there can't silently make a proposal unappliable.
    #[test]
    fn every_advertised_value_is_accepted_unchanged_by_settings() {
        let base = parse(&defaults());
        for spec in SPECS {
            let values: Vec<Value> = match &spec.kind {
                Kind::Bool => vec![json!(true), json!(false)],
                Kind::Choice(_) | Kind::Instrument => options(spec).into_iter().map(|(v, _, _)| json!(v)).collect(),
                Kind::Int { min, max, step } => (*min..=*max).step_by(*step as usize).map(|v| json!(v)).collect(),
                Kind::Float { min, max, step } => {
                    let count = ((max - min) / step).round() as i64;
                    (0..=count).map(|i| json!(round_to(min + i as f64 * step, 4))).collect()
                }
            };
            for value in values {
                let next = parse(&with(&defaults(), &action_for(spec, &value).to_string()));
                let got = user_value(&next, spec).unwrap_or(Value::Null);
                assert!(same(&got, &value), "{} = {value} came back as {got}", spec.key);
                assert!(user_value(&base, spec).is_some(), "{} missing from settings JSON", spec.key);
            }
        }
    }
}
