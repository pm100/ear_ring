//! First-run welcome flow content (issue #43). The steps live here so every platform shows
//! identical wording; platforms only render them and own navigation, the mic-permission prompt
//! and the first-launch flag.

struct Step {
    id: &'static str,
    title: &'static str,
    body: &'static str,
    primary_label: &'static str,
    /// Mic-check step only: shown when nothing has been heard yet.
    hint: &'static str,
    /// Mic-check step only: shown once a note is detected.
    success: &'static str,
    /// Mic-check step only: label of the "skip" link.
    skip_label: &'static str,
    /// Label of the action that leaves the whole flow early; empty on the last step.
    exit_label: &'static str,
}

const STEPS: [Step; 4] = [
    Step {
        id: "welcome",
        title: "Welcome to Ear Ring",
        body: "Ear Ring plays a short chord and a few notes. You play them back on your instrument and the app listens.\n\nGreen notes are right. Red means try again, and the same notes are replayed.\n\nLet's get you set up in under a minute.",
        primary_label: "Get started",
        hint: "",
        success: "",
        skip_label: "",
        exit_label: "Skip setup",
    },
    Step {
        id: "instrument",
        title: "Your instrument",
        body: "Pick the instrument you will play. This sets your note range and how your notes are heard.\n\nNext, your device will ask permission to use the microphone. Please tap Allow so the app can hear you play.",
        primary_label: "Next",
        hint: "",
        success: "",
        skip_label: "",
        exit_label: "Skip setup",
    },
    Step {
        id: "mic",
        title: "Check your microphone",
        body: "Play a note on your instrument and watch it appear below. If quiet notes are missed, raise Mic Sensitivity; if background noise makes false notes, lower it.",
        primary_label: "Next",
        hint: "Nothing heard yet. Try playing louder or more crisply, and closer to the device.",
        success: "Got it. Your microphone is working.",
        skip_label: "Skip mic check",
        exit_label: "Skip setup",
    },
    Step {
        id: "ready",
        title: "You're ready",
        body: "On the Home tab, choose a key, scale and range, then tap Start Exercise.\n\nYou can change anything later in Settings, and the Help tab has a full guide.",
        primary_label: "Done",
        hint: "",
        success: "",
        skip_label: "",
        exit_label: "",
    },
];

/// The steps as JSON:
/// `[{"id","title","body","primaryLabel","hint","success","skipLabel","exitLabel"},...]`.
pub fn onboarding_steps_json() -> String {
    let items: Vec<String> = STEPS
        .iter()
        .map(|s| {
            format!(
                "{{\"id\":{},\"title\":{},\"body\":{},\"primaryLabel\":{},\"hint\":{},\"success\":{},\"skipLabel\":{},\"exitLabel\":{}}}",
                crate::json_string(s.id),
                crate::json_string(s.title),
                crate::json_string(s.body),
                crate::json_string(s.primary_label),
                crate::json_string(s.hint),
                crate::json_string(s.success),
                crate::json_string(s.skip_label),
                crate::json_string(s.exit_label),
            )
        })
        .collect();
    format!("[{}]", items.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_four_steps_in_order() {
        let ids: Vec<&str> = STEPS.iter().map(|s| s.id).collect();
        assert_eq!(ids, ["welcome", "instrument", "mic", "ready"]);
    }

    #[test]
    fn instrument_step_warns_about_mic_permission() {
        let s = STEPS.iter().find(|s| s.id == "instrument").unwrap();
        assert!(s.body.contains("permission to use the microphone"));
    }

    #[test]
    fn only_the_mic_step_has_mic_check_texts() {
        for s in &STEPS {
            let is_mic = s.id == "mic";
            assert_eq!(!s.hint.is_empty(), is_mic, "{}", s.id);
            assert_eq!(!s.success.is_empty(), is_mic, "{}", s.id);
            assert_eq!(!s.skip_label.is_empty(), is_mic, "{}", s.id);
        }
    }

    #[test]
    fn every_step_but_the_last_can_exit_early() {
        let last = STEPS.len() - 1;
        for (i, s) in STEPS.iter().enumerate() {
            assert_eq!(!s.exit_label.is_empty(), i != last, "{}", s.id);
        }
    }

    #[test]
    fn every_step_has_a_title_body_and_button() {
        for s in &STEPS {
            assert!(!s.title.is_empty() && !s.body.is_empty() && !s.primary_label.is_empty());
        }
    }

    #[test]
    fn json_lists_all_steps_with_escaped_newlines() {
        let json = onboarding_steps_json();
        assert!(json.starts_with('[') && json.ends_with(']'));
        assert_eq!(json.matches("\"id\":").count(), 4);
        assert!(json.contains(r"\n\n"));
        assert!(!json.contains('\n'));
        assert!(json.contains("\"primaryLabel\":\"Get started\""));
    }
}
