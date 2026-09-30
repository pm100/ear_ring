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

fn settings_value(settings_json: &str, platform: Platform) -> Value {
    serde_json::from_str(&normalize_json(settings_json, platform)).unwrap_or(Value::Null)
}

/// The context block the proxy gives the model: every assistant-visible setting with its valid
/// values, default, current value and description, plus the user's premium state.
pub fn context_json(settings_json: &str, is_premium: bool, platform: Platform) -> String {
    let current = settings_value(settings_json, platform);
    let defaults: Value = serde_json::from_str(&defaults_json(platform)).unwrap_or(Value::Null);
    let settings: Vec<Value> = SPECS
        .iter()
        .map(|spec| {
            let mut entry = Map::new();
            entry.insert("key".into(), json!(spec.key));
            entry.insert("label".into(), json!(spec.label));
            entry.insert("description".into(), json!(tooltip_text(spec.tooltip)));
            match &spec.kind {
                Kind::Bool => {
                    entry.insert("type".into(), json!("bool"));
                }
                Kind::Choice(_) | Kind::Instrument => {
                    entry.insert("type".into(), json!("choice"));
                    let opts: Vec<Value> = options(spec)
                        .into_iter()
                        .map(|(value, label, premium)| json!({"value": value, "label": label, "premium": premium}))
                        .collect();
                    entry.insert("options".into(), json!(opts));
                }
                Kind::Int { min, max, step } => {
                    entry.insert("type".into(), json!("int"));
                    entry.extend([("min".into(), json!(min)), ("max".into(), json!(max)), ("step".into(), json!(step))]);
                }
                Kind::Float { min, max, step } => {
                    entry.insert("type".into(), json!("float"));
                    entry.extend([("min".into(), json!(min)), ("max".into(), json!(max)), ("step".into(), json!(step))]);
                }
            }
            if let Some(value) = user_value(&current, spec) {
                entry.insert("currentLabel".into(), json!(display(spec, &value)));
                entry.insert("current".into(), value);
            }
            if let Some(value) = user_value(&defaults, spec) {
                entry.insert("default".into(), value);
            }
            Value::Object(entry)
        })
        .collect();
    json!({
        "platform": match platform { Platform::Android => "android", Platform::Ios => "ios", Platform::Desktop => "desktop" },
        "premium": is_premium,
        "settings": settings,
    })
    .to_string()
}

// ── Request building ─────────────────────────────────────────────────────────

fn truncate_chars(text: &str, max: usize) -> String {
    text.trim().chars().take(max).collect()
}

/// Builds the proxy request body: the last [`MAX_TURNS`] chat turns plus the context block.
/// `history_json` is `[{"role":"user"|"assistant","text":"..."}]`; anything malformed is dropped.
pub fn request_json(history_json: &str, settings_json: &str, is_premium: bool, platform: Platform) -> String {
    let parsed: Value = serde_json::from_str(history_json).unwrap_or(Value::Null);
    let mut turns: Vec<(String, String)> = parsed
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|turn| {
                    let role = turn["role"].as_str().filter(|r| *r == "user" || *r == "assistant")?;
                    let text = truncate_chars(turn["text"].as_str()?, MAX_TURN_CHARS);
                    (!text.is_empty()).then(|| (role.to_string(), text))
                })
                .collect()
        })
        .unwrap_or_default();
    if turns.len() > MAX_TURNS {
        turns.drain(..turns.len() - MAX_TURNS);
    }
    // The model API requires the conversation to start with a user turn.
    while turns.first().map_or(false, |(role, _)| role == "assistant") {
        turns.remove(0);
    }
    let messages: Vec<Value> = turns.into_iter().map(|(role, text)| json!({"role": role, "text": text})).collect();
    let context: Value = serde_json::from_str(&context_json(settings_json, is_premium, platform)).unwrap_or(Value::Null);
    json!({"messages": messages, "context": context}).to_string()
}

// ── Proposal validation ──────────────────────────────────────────────────────

/// Checks a proposal (`[{"setting":"noteRetries","value":5},...]`) against `settings_json` and
/// returns the confirm card: `{"items":[{key,label,from,to,action}],"rejected":[{key,reason}]}`.
///
/// Items are validated in order against the running result, so a later item sees the effect of
/// an earlier one. Anything unknown, unavailable, premium-locked for a free user, a no-op, or
/// not actually applied by settings.rs (e.g. sequence length in Diatonic mode) is rejected and
/// never shown as a change. Applying the card means dispatching each item's `action` in order.
pub fn resolve_proposal_json(proposal_json: &str, settings_json: &str, is_premium: bool, platform: Platform) -> String {
    let proposal: Value = serde_json::from_str(proposal_json).unwrap_or(Value::Null);
    let mut state = normalize_json(settings_json, platform);
    let mut items: Vec<Value> = Vec::new();
    let mut rejected: Vec<Value> = Vec::new();
    let reject = |rejected: &mut Vec<Value>, key: &str, reason: &str| rejected.push(json!({"key": key, "reason": reason}));

    // A setting named twice keeps only its last value.
    let entries: Vec<&Value> = proposal.as_array().map(|list| list.iter().collect()).unwrap_or_default();
    let last_index = |key: &str| entries.iter().rposition(|e| e["setting"].as_str() == Some(key));
    for (index, entry) in entries.iter().enumerate() {
        let Some(key) = entry["setting"].as_str() else { continue };
        if last_index(key) != Some(index) {
            continue;
        }
        let Some(spec) = find_spec(key) else {
            reject(&mut rejected, key, "not a setting the assistant can change");
            continue;
        };
        let Some(requested) = entry.get("value").and_then(|raw| coerce(spec, raw)).filter(|v| is_available(spec, v)) else {
            reject(&mut rejected, key, "that value isn't available");
            continue;
        };
        if matches!(spec.kind, Kind::Instrument) {
            let premium_instrument = requested.as_i64().and_then(|i| INSTRUMENTS.get(i as usize)).map_or(false, |i| i.premium);
            if premium_instrument && !is_premium {
                reject(&mut rejected, key, "that instrument is a premium feature");
                continue;
            }
        }
        let before_settings: Value = serde_json::from_str(&state).unwrap_or(Value::Null);
        let action = action_for(spec, &requested);
        let next_state = apply_json(&state, &action.to_string(), platform);
        let after_settings: Value = serde_json::from_str(&next_state).unwrap_or(Value::Null);
        let (Some(before), Some(after)) = (user_value(&before_settings, spec), user_value(&after_settings, spec)) else {
            reject(&mut rejected, key, "couldn't be applied");
            continue;
        };
        if !same(&after, &requested) {
            let reason = if key == "sequenceLength" { "sequence length is fixed at 3 for Diatonic Arpeggios" } else { "couldn't be applied" };
            reject(&mut rejected, key, reason);
            continue;
        }
        if same(&before, &after) {
            reject(&mut rejected, key, "already set to that");
            continue;
        }
        items.push(json!({
            "key": key,
            "label": spec.label,
            "from": display(spec, &before),
            "to": display(spec, &after),
            "action": action,
        }));
        state = next_state;
    }
    json!({"items": items, "rejected": rejected}).to_string()
}

// ── Response handling ────────────────────────────────────────────────────────

/// User-facing text for a failure. `kind` is one of "offline", "quota_exceeded", "server";
/// anything else is treated as an unreadable response.
pub fn error_text(kind: &str) -> String {
    match kind {
        "offline" => "Can't reach the assistant right now. Check your connection and try again.",
        "quota_exceeded" => "You've used today's free questions. You can still change everything in Settings, and the assistant will be back tomorrow.",
        "server" => "The assistant ran into a problem. Please try again in a moment.",
        _ => "The assistant sent something I couldn't read. Please try again.",
    }
    .to_string()
}

pub fn error_view_json(kind: &str) -> String {
    json!({"reply": error_text(kind), "card": null, "proposal": null, "feedbackSent": false, "quota": null, "isError": true}).to_string()
}

/// `{"remaining","resetsAt"}` from the proxy's quota object, if it sent one.
fn quota_view(quota: Option<&Value>) -> Option<Value> {
    let quota = quota?.as_object()?;
    Some(json!({
        "remaining": quota.get("remaining").and_then(Value::as_i64).unwrap_or(0),
        "resetsAt": quota.get("resetsAt").and_then(Value::as_str).unwrap_or(""),
    }))
}

/// Turns the proxy's response body into what the chat shows:
/// `{"reply","card","proposal","feedbackSent","quota","isError"}`. `card` is the validated
/// confirm card (or null if nothing usable was proposed); `proposal` is kept so the platform can
/// re-validate it with [`resolve_proposal_json`] at the moment the user taps Apply.
pub fn resolve_response_json(response_json: &str, settings_json: &str, is_premium: bool, platform: Platform) -> String {
    let Ok(Value::Object(response)) = serde_json::from_str::<Value>(response_json) else {
        return error_view_json("bad_response");
    };
    let mut reply = truncate_chars(response.get("reply").and_then(Value::as_str).unwrap_or(""), MAX_REPLY_CHARS);
    let feedback_sent = response.get("feedbackSent").and_then(Value::as_bool).unwrap_or(false);

    let proposal = response.get("proposal").filter(|p| p.is_array()).cloned();
    let mut card = Value::Null;
    let mut kept_proposal = Value::Null;
    let mut nothing_usable = false;
    if let Some(proposal) = proposal {
        let resolved: Value =
            serde_json::from_str(&resolve_proposal_json(&proposal.to_string(), settings_json, is_premium, platform)).unwrap_or(Value::Null);
        let has_items = resolved["items"].as_array().map_or(false, |items| !items.is_empty());
        let has_rejections = resolved["rejected"].as_array().map_or(false, |r| !r.is_empty());
        if has_items {
            card = resolved;
            kept_proposal = proposal;
        } else if has_rejections {
            nothing_usable = true;
        }
    }

    if reply.is_empty() {
        reply = if !card.is_null() {
            "Here's the change I'd suggest:".to_string()
        } else if nothing_usable {
            "I couldn't find a safe change for that. Try rephrasing, or use the Settings screen.".to_string()
        } else if feedback_sent {
            "Thanks, I've passed that on as feedback.".to_string()
        } else {
            "Sorry, I don't have an answer for that. Try rephrasing.".to_string()
        };
    }

    let quota = quota_view(response.get("quota")).unwrap_or(Value::Null);

    json!({
        "reply": reply,
        "card": card,
        "proposal": kept_proposal,
        "feedbackSent": feedback_sent,
        "quota": quota,
        "isError": false,
    })
    .to_string()
}

/// What the chat shows for one proxy round trip. `status` is the HTTP status, or 0 when the
/// request never reached the server. A 429 also carries the quota so the footer can say 0 left.
/// This is the only function a platform needs to call with a network result.
pub fn resolve_outcome_json(status: i64, body: &str, settings_json: &str, is_premium: bool, platform: Platform) -> String {
    match status {
        200 => resolve_response_json(body, settings_json, is_premium, platform),
        0 => error_view_json("offline"),
        429 => {
            let mut view: Value = serde_json::from_str(&error_view_json("quota_exceeded")).unwrap_or(Value::Null);
            let quota = serde_json::from_str::<Value>(body).ok().and_then(|b| quota_view(b.get("quota")));
            if let Some(quota) = quota {
                view["quota"] = quota;
            }
            view.to_string()
        }
        _ => error_view_json("server"),
    }
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

    // ── Context ──────────────────────────────────────────────────────────────

    #[test]
    fn context_lists_every_setting_with_current_and_default() {
        let ctx = parse(&context_json(&defaults(), false, ANDROID));
        let list = ctx["settings"].as_array().unwrap();
        assert_eq!(list.len(), SPECS.len());
        let note = list.iter().find(|s| s["key"] == "noteRetries").unwrap();
        assert_eq!(note["label"], "Retry Same Note");
        assert_eq!(note["current"], 2);
        assert_eq!(note["default"], 2);
        assert_eq!(note["type"], "choice");
        assert!(note["description"].as_str().unwrap().contains("wrong note"));
        assert_eq!(ctx["premium"], false);
        assert_eq!(ctx["platform"], "android");
    }

    #[test]
    fn context_reflects_the_users_current_settings() {
        let custom = with(&defaults(), r#"{"type":"set","values":{"noteRetries":4,"tempoBpm":140}}"#);
        let ctx = parse(&context_json(&custom, true, ANDROID));
        let find = |key: &str| ctx["settings"].as_array().unwrap().iter().find(|s| s["key"] == key).unwrap().clone();
        assert_eq!(find("noteRetries")["current"], 4);
        assert_eq!(find("tempoBpm")["currentLabel"], "140");
        assert_eq!(ctx["premium"], true);
    }

    #[test]
    fn context_flags_premium_instruments() {
        let ctx = parse(&context_json(&defaults(), false, ANDROID));
        let inst = ctx["settings"].as_array().unwrap().iter().find(|s| s["key"] == "instrumentIndex").unwrap().clone();
        let opts = inst["options"].as_array().unwrap();
        assert_eq!(opts.len(), INSTRUMENTS.len());
        assert_eq!(opts[0]["label"], "Piano");
        assert_eq!(opts[0]["premium"], false);
        assert!(opts.iter().any(|o| o["premium"] == true), "Voice instruments must be flagged premium");
    }

    #[test]
    fn context_survives_garbage_settings() {
        let ctx = parse(&context_json("garbage", false, ANDROID));
        assert_eq!(ctx["settings"].as_array().unwrap().len(), SPECS.len());
    }

    #[test]
    fn ios_default_note_stability_is_a_valid_current_value() {
        // iOS confirms a note a frame sooner (2); the assistant must still show it as an option.
        let ios = defaults_json(Platform::Ios);
        let ctx = parse(&context_json(&ios, false, Platform::Ios));
        let stability = ctx["settings"].as_array().unwrap().iter().find(|s| s["key"] == "framesToConfirm").unwrap().clone();
        assert_eq!(stability["current"], 2);
        assert_eq!(ctx["platform"], "ios");
    }

    #[test]
    fn mic_sensitivity_is_shown_on_the_ui_scale() {
        let ctx = parse(&context_json(&defaults(), false, ANDROID));
        let mic = ctx["settings"].as_array().unwrap().iter().find(|s| s["key"] == "micSensitivity").unwrap().clone();
        assert_eq!(mic["current"], 8, "default silence threshold 0.003 is sensitivity 8");
        assert_eq!((mic["min"].as_i64(), mic["max"].as_i64()), (Some(1), Some(10)));
    }

    // ── Request ──────────────────────────────────────────────────────────────

    fn turns(n: usize) -> String {
        let list: Vec<Value> = (0..n)
            .map(|i| json!({"role": if i % 2 == 0 { "user" } else { "assistant" }, "text": format!("turn {i}")}))
            .collect();
        Value::Array(list).to_string()
    }

    #[test]
    fn request_keeps_only_the_last_turns_and_starts_with_a_user_turn() {
        let req = parse(&request_json(&turns(9), &defaults(), false, ANDROID));
        let messages = req["messages"].as_array().unwrap();
        assert!(messages.len() <= MAX_TURNS);
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages.last().unwrap()["text"], "turn 8");
    }

    #[test]
    fn request_drops_malformed_and_empty_turns_and_truncates_long_ones() {
        let long = "x".repeat(MAX_TURN_CHARS + 50);
        let history = json!([
            {"role": "system", "text": "ignore me"},
            {"role": "user"},
            {"role": "user", "text": "   "},
            {"role": "user", "text": long},
        ])
        .to_string();
        let messages = parse(&request_json(&history, &defaults(), false, ANDROID))["messages"].clone();
        assert_eq!(messages.as_array().unwrap().len(), 1);
        assert_eq!(messages[0]["text"].as_str().unwrap().chars().count(), MAX_TURN_CHARS);
    }

    #[test]
    fn request_tolerates_garbage_history() {
        for bad in ["", "not json", "{}", "null", "42"] {
            let req = parse(&request_json(bad, &defaults(), false, ANDROID));
            assert_eq!(req["messages"].as_array().unwrap().len(), 0, "history {bad:?}");
            assert!(req["context"]["settings"].is_array());
        }
    }

    #[test]
    fn request_truncates_multibyte_text_on_character_boundaries() {
        let long = "é".repeat(MAX_TURN_CHARS + 10);
        let history = json!([{"role": "user", "text": long}]).to_string();
        let req = parse(&request_json(&history, &defaults(), false, ANDROID));
        assert_eq!(req["messages"][0]["text"].as_str().unwrap().chars().count(), MAX_TURN_CHARS);
    }

    // ── Proposal validation ──────────────────────────────────────────────────

    fn resolve(proposal: &str, settings: &str, premium: bool) -> Value {
        parse(&resolve_proposal_json(proposal, settings, premium, ANDROID))
    }

    #[test]
    fn proposal_for_retry_same_note_becomes_a_card_item_with_the_settings_action() {
        let card = resolve(r#"[{"setting":"noteRetries","value":5}]"#, &defaults(), false);
        let item = &card["items"][0];
        assert_eq!(item["key"], "noteRetries");
        assert_eq!(item["label"], "Retry Same Note");
        assert_eq!(item["from"], "2");
        assert_eq!(item["to"], "5");
        assert_eq!(item["action"], json!({"type": "set", "values": {"noteRetries": 5}}));
        assert_eq!(card["rejected"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn dispatching_a_cards_actions_produces_the_proposed_settings() {
        let card = resolve(
            r#"[{"setting":"noteRetries","value":5},{"setting":"rootNote","value":7},{"setting":"micSensitivity","value":10}]"#,
            &defaults(),
            false,
        );
        let mut settings = defaults();
        for item in card["items"].as_array().unwrap() {
            settings = with(&settings, &item["action"].to_string());
        }
        let out = parse(&settings);
        assert_eq!(out["noteRetries"], 5);
        assert_eq!(out["rootNote"], 7);
        assert_eq!(out["silenceThreshold"], 0.001);
    }

    #[test]
    fn unknown_setting_and_unavailable_values_are_rejected() {
        let card = resolve(
            r#"[{"setting":"theme","value":"dark"},{"setting":"maxRetries","value":7},{"setting":"tempoBpm","value":"fast"},{"setting":"showTestNotes","value":1},{"setting":"yinThreshold","value":0.9}]"#,
            &defaults(),
            false,
        );
        assert_eq!(card["items"].as_array().unwrap().len(), 0);
        let keys: Vec<&str> = card["rejected"].as_array().unwrap().iter().map(|r| r["key"].as_str().unwrap()).collect();
        assert_eq!(keys, ["theme", "maxRetries", "tempoBpm", "showTestNotes", "yinThreshold"]);
    }

    #[test]
    fn premium_instrument_is_rejected_for_free_users_and_accepted_for_premium() {
        let voice = INSTRUMENTS.iter().position(|i| i.premium).unwrap();
        let proposal = format!(r#"[{{"setting":"instrumentIndex","value":{voice}}}]"#);
        let free = resolve(&proposal, &defaults(), false);
        assert_eq!(free["items"].as_array().unwrap().len(), 0);
        assert!(free["rejected"][0]["reason"].as_str().unwrap().contains("premium"));
        let paid = resolve(&proposal, &defaults(), true);
        assert_eq!(paid["items"][0]["to"], INSTRUMENTS[voice].name);
        assert_eq!(paid["items"][0]["action"], json!({"type": "setInstrument", "value": voice}));
    }

    #[test]
    fn a_change_that_is_already_in_effect_is_reported_not_proposed() {
        let card = resolve(r#"[{"setting":"noteRetries","value":2}]"#, &defaults(), false);
        assert_eq!(card["items"].as_array().unwrap().len(), 0);
        assert_eq!(card["rejected"][0]["reason"], "already set to that");
    }

    #[test]
    fn sequence_length_is_rejected_while_diatonic_mode_is_selected() {
        let diatonic = with(&defaults(), r#"{"type":"setTestType","value":2}"#);
        let card = resolve(r#"[{"setting":"sequenceLength","value":5}]"#, &diatonic, false);
        assert_eq!(card["items"].as_array().unwrap().len(), 0);
        assert!(card["rejected"][0]["reason"].as_str().unwrap().contains("Diatonic"));
    }

    #[test]
    fn items_are_validated_against_the_result_of_earlier_items() {
        // Switching to Diatonic first makes the later sequence length impossible.
        let card = resolve(
            r#"[{"setting":"testType","value":2},{"setting":"sequenceLength","value":5}]"#,
            &defaults(),
            false,
        );
        assert_eq!(card["items"].as_array().unwrap().len(), 1);
        assert_eq!(card["items"][0]["key"], "testType");
        assert_eq!(card["rejected"][0]["key"], "sequenceLength");
    }

    #[test]
    fn a_setting_named_twice_keeps_only_its_last_value() {
        let card = resolve(
            r#"[{"setting":"maxRetries","value":3},{"setting":"maxRetries","value":8}]"#,
            &defaults(),
            false,
        );
        assert_eq!(card["items"].as_array().unwrap().len(), 1);
        assert_eq!(card["items"][0]["to"], "8");
    }

    #[test]
    fn integral_floats_and_step_snapping_are_accepted() {
        let card = resolve(r#"[{"setting":"maxRetries","value":8.0},{"setting":"yinThreshold","value":0.2004}]"#, &defaults(), false);
        assert_eq!(card["items"].as_array().unwrap().len(), 2);
        assert_eq!(card["items"][1]["to"], "0.2");
    }

    #[test]
    fn numeric_strings_and_missing_or_null_values_are_rejected() {
        let card = resolve(
            r#"[{"setting":"maxRetries","value":"5"},{"setting":"tempoBpm"},{"setting":"noteRetries","value":null}]"#,
            &defaults(),
            false,
        );
        assert_eq!(card["items"].as_array().unwrap().len(), 0);
        assert_eq!(card["rejected"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn out_of_range_choices_and_fractional_ints_are_rejected() {
        let card = resolve(
            r#"[{"setting":"rootNote","value":12},{"setting":"rootNote","value":-1},{"setting":"maxRetries","value":2.5},{"setting":"postChordGapMs","value":450}]"#,
            &defaults(),
            false,
        );
        assert_eq!(card["items"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn proposal_tolerates_garbage() {
        for bad in ["", "not json", "{}", "null", "[1,2,{}]", r#"[{"setting":5}]"#] {
            let card = resolve(bad, &defaults(), false);
            assert_eq!(card["items"].as_array().unwrap().len(), 0, "proposal {bad:?}");
        }
    }

    // ── Response ─────────────────────────────────────────────────────────────

    fn view(response: &str) -> Value {
        parse(&resolve_response_json(response, &defaults(), false, ANDROID))
    }

    #[test]
    fn text_only_reply_has_no_card() {
        let v = view(r#"{"reply":"Try a slower tempo.","quota":{"remaining":4,"resetsAt":"2026-10-01T00:00:00Z"}}"#);
        assert_eq!(v["reply"], "Try a slower tempo.");
        assert!(v["card"].is_null());
        assert_eq!(v["isError"], false);
        assert_eq!(v["quota"]["remaining"], 4);
    }

    #[test]
    fn reply_with_a_proposal_carries_a_card_and_the_proposal_for_reapplying() {
        let v = view(r#"{"reply":"Give yourself more tries.","proposal":[{"setting":"noteRetries","value":5}]}"#);
        assert_eq!(v["card"]["items"][0]["to"], "5");
        assert_eq!(v["proposal"], json!([{"setting": "noteRetries", "value": 5}]));
    }

    #[test]
    fn empty_reply_with_a_valid_proposal_gets_a_default_lead_in() {
        let v = view(r#"{"proposal":[{"setting":"noteRetries","value":5}]}"#);
        assert_eq!(v["reply"], "Here's the change I'd suggest:");
    }

    #[test]
    fn unusable_proposal_falls_back_to_text_and_never_shows_a_card() {
        let v = view(r#"{"reply":"","proposal":[{"setting":"theme","value":"dark"}]}"#);
        assert!(v["card"].is_null());
        assert!(v["proposal"].is_null());
        assert!(v["reply"].as_str().unwrap().contains("couldn't find a safe change"));
        let with_text = view(r#"{"reply":"I can't do that.","proposal":[{"setting":"theme","value":"dark"}]}"#);
        assert_eq!(with_text["reply"], "I can't do that.");
        assert!(with_text["card"].is_null());
    }

    #[test]
    fn feedback_only_reply_gets_a_thanks() {
        let v = view(r#"{"feedbackSent":true}"#);
        assert_eq!(v["feedbackSent"], true);
        assert!(v["reply"].as_str().unwrap().contains("feedback"));
    }

    #[test]
    fn empty_response_gets_a_generic_reply() {
        assert!(view("{}")["reply"].as_str().unwrap().contains("Try rephrasing"));
    }

    #[test]
    fn malformed_response_is_an_error_view() {
        for bad in ["", "not json", "[]", "null", "42"] {
            let v = view(bad);
            assert_eq!(v["isError"], true, "response {bad:?}");
            assert!(v["card"].is_null());
        }
    }

    #[test]
    fn overlong_reply_is_truncated() {
        let long = "y".repeat(MAX_REPLY_CHARS + 100);
        let v = view(&json!({"reply": long}).to_string());
        assert_eq!(v["reply"].as_str().unwrap().chars().count(), MAX_REPLY_CHARS);
    }

    #[test]
    fn proxy_url_is_an_https_ask_endpoint() {
        assert!(PROXY_URL.starts_with("https://"));
        assert!(PROXY_URL.ends_with("/v1/ask"));
    }

    #[test]
    fn error_text_covers_each_failure_kind() {
        let kinds = ["offline", "quota_exceeded", "server", "bad_response", "anything else"];
        let texts: Vec<String> = kinds.iter().map(|k| error_text(k)).collect();
        assert!(texts.iter().all(|t| !t.is_empty()));
        assert_eq!(texts[3], texts[4], "unknown kinds read as an unreadable response");
        assert!(texts[1].contains("Settings"));
    }

    // ── Outcome (status mapping) ─────────────────────────────────────────────

    fn outcome(status: i64, body: &str) -> Value {
        parse(&resolve_outcome_json(status, body, &defaults(), false, ANDROID))
    }

    #[test]
    fn outcome_200_is_the_resolved_response() {
        let v = outcome(200, r#"{"reply":"Hi."}"#);
        assert_eq!(v["reply"], "Hi.");
        assert_eq!(v["isError"], false);
    }

    #[test]
    fn outcome_0_means_offline() {
        let v = outcome(0, "");
        assert_eq!(v["isError"], true);
        assert_eq!(v["reply"], error_text("offline"));
    }

    #[test]
    fn outcome_429_is_quota_exceeded_and_keeps_the_quota_when_sent() {
        let v = outcome(429, r#"{"error":"quota_exceeded","quota":{"remaining":0,"resetsAt":"2026-10-02T00:00:00Z"}}"#);
        assert_eq!(v["isError"], true);
        assert_eq!(v["reply"], error_text("quota_exceeded"));
        assert_eq!(v["quota"]["resetsAt"], "2026-10-02T00:00:00Z");
        assert!(outcome(429, "garbage")["quota"].is_null());
    }

    #[test]
    fn outcome_for_any_other_status_is_a_server_error() {
        for status in [400, 413, 500, 502, 503] {
            let v = outcome(status, r#"{"reply":"ignored"}"#);
            assert_eq!(v["isError"], true, "status {status}");
            assert_eq!(v["reply"], error_text("server"));
        }
    }
}
