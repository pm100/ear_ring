# Sage Help Screen and History-Based Advice: Design (WIP, brainstorming paused)

**Status:** DRAFT / work in progress. Brainstorming paused 2026-10-01 after design Section 1 was
presented (not yet approved). No plan written, no code written.
**Path:** architectural (changes the wire contract, reverses a stated privacy promise, reshapes the
Help screen on all three platforms).
**Builds on:** `docs/superpowers/specs/2026-09-30-setup-assistant-design.md` (the shipped assistant,
"sage") and its three plans.

## What Paul asked for (2026-10-01)

> Reduce the help screen to just the quick start and the sage prompt. It should have advice about how
> best to set things up in general, to make things easier, to move the difficulty up etc. This could
> maybe be based on looking at the tests the user has already done.

## Understanding (write-back; Paul has not corrected it)

- The Help screen shows only **Getting Started** and the **sage chat** ("Ask about setup").
- Sage gives general guidance on setting the app up, making it easier, and raising the difficulty,
  grounded in the user's own test history where there is any.
- Assumptions (not yet confirmed by Paul):
  - The removed sections (Test Types, Mic Setup, Running an Exercise, Progress, Settings) are not
    lost: their text becomes reference knowledge given to sage so "what does X do?" still works.
  - Practice history is summarised **on the device in Rust**; only a compact summary (no audio, no
    raw note lists) goes to the proxy with the question.
  - This reverses what the shipped Help text and privacy wording say ("no practice history is
    sent"), so the privacy policy, App Store Connect App Privacy, Google Play Data safety and
    `PrivacyInfo.xcprivacy` all change.
  - It applies to all three platforms (UI Consistency Rule).

## Facts found while exploring

- Every completed test is stored on all three platforms with: scale, root, score percent,
  attempts used, max attempts, passed, sequence length, expected notes, detected notes, timestamp,
  session id. **Not stored:** instrument, tempo, range, test type (random vs diatonic), or the
  settings in force at the time.
- Storage differs per platform (Android `SharedPreferences` via Gson, iOS `UserDefaults`, desktop
  `localStorage`) but the record shapes are near-identical, so a shared Rust summariser is feasible.
- `rust/src/help.md` is about 3.4 KB in 8 sections (Getting Started, Ask About Setup, Test Types,
  Mic Setup, Running an Exercise, Progress, Settings, About); every platform renders it through
  `helpContent()` / `cmd_help_content`.
- The assistant's context today is the settings schema, current values, premium flag and platform
  (`assistant::context_json`); the proxy puts the stable part (rules + schema) in a cached prompt
  block and per-user state after it.

## Decisions made (Paul confirmed)

1. **Advice UX: suggested prompts plus free text.** Tappable suggestions under the input
   ("Make it easier", "Make it harder", "What should I practise next?"); the user can still type
   anything. Chosen over free-text-only and over a proactive tip on opening Help (which would spend a
   model call per Help visit).
2. **Consent: one-time consent before the first question.** A short sheet states what is sent (the
   question, current settings, a summary of recent test results; no audio) and that it goes to our
   server and an AI provider. Allow / Not now ("Not now" sends nothing). Remembered per install.
   Chosen over disclosure-line-only and over an opt-in toggle for history. Reason: store review and
   users' expectations around sharing personal data with third-party AI (check current Apple and
   Google guideline wording when writing the policy text; I believe Apple's guideline 5.1.2 is strict
   about this but have not verified it).

## Approach (recommended, not yet confirmed)

**A. Summarise on the device in Rust.** Each platform passes its stored test records (normalised to
one JSON shape) to a new Rust function that returns a compact summary: pass rate and average score
over recent tests, attempts needed relative to the limit, the longest sequence length passed
reliably, strong and weak scales or keys, and most-missed notes. The summary is added to the request
`context` and the proxy shows it to the model. Follows the Shared Logic Rule; identical numbers on
all platforms; only a small summary leaves the device.

Rejected: **B** each platform computes the statistics (three drifting implementations, violates the
Shared Logic Rule); **C** send raw records and summarise on the proxy (far more personal data leaves
the device, large payloads, worse privacy story).

## Design Section 1: what the user sees (presented, awaiting approval)

- **Help screen:** "Getting Started" (unchanged) and the sage chat only. Proposed: keep a one-line
  copyright footer ("Ear Ring (c) 2026 Jolly Good Software") under the chat so the legal text is not
  lost; Paul may prefer it elsewhere.
- **Suggestions:** three tappable prompts under the input: "Make it easier", "Make it harder",
  "What should I practise next?". Tapping asks sage exactly as if typed. The wording lives once in
  the Rust core so all platforms match.
- **Consent:** one-time sheet on the first send (typed or tapped), as described in Decision 2. A
  small link in the chat footer lets the user switch it off again and see what is sent.
- **Answers:** with enough history, advice cites the user's own results and proposes changes through
  the existing Apply card (for example "You passed 9 of your last 10 three-note tests, so try four
  notes"). With little or no history, sage says so and gives general guidance.
- **Reference knowledge:** the removed help sections move into a new `guide.md` that only sage reads,
  together with a **difficulty ladder** (what makes the exercise easier or harder: sequence length,
  scale, tempo, retries, whether test notes are shown, intro sound, test type, and so on). I would
  write a first draft of the ladder for Paul to edit.

## Open items and defaults I would propose (not discussed yet)

- **Window and content of the summary:** last 100 tests or 90 days, whichever is smaller;
  aggregates plus weakest notes and scales; nothing per-test.
- **Minimum history before advice is personalised:** about 10 tests.
- **Where suggestion text and consent text live:** Rust, exposed through the same bridges as the rest
  of the assistant (`suggested_prompts`, `consent_text`), so wording matches everywhere.
- **Consent storage and revocation:** per-platform persistence of one boolean; a "turn off" control
  in the chat footer.
- **Wire contract change:** `context.history` (the summary) and `context.guide` (reference text) added
  to the request; proxy validation caps for both; the guide goes in the cached prompt block, the
  history in the per-user block; prompt rules for difficulty advice and the ladder.
- **Prompt and model:** advice behaviour needs live tuning (as before); the example-question script
  gets history-based examples.
- **Policy and store forms:** privacy policy wording, App Store Connect App Privacy (usage data /
  other data), Google Play Data safety, `PrivacyInfo.xcprivacy`; revisit the existing wording that
  says no practice history is sent, and the Help section "Ask About Setup" that says the same.
- **Tests:** Rust unit tests for the summariser (empty history, short history, one scale, many
  scales, garbage records, extreme values); proxy validation tests; platform checks for consent
  and the three suggestions.
- **Migration:** removing help sections changes what existing users see; DESIGN.md Help Screen
  section, `help.md`, and the earlier assistant spec ("no practice history is sent") must be updated.

## Remaining brainstorming steps

1. Get approval (or changes) on Section 1 above, including the footer and consent behaviour.
2. Present Section 2: data and architecture (summary fields, request shape, proxy changes, guide.md).
3. Present Section 3: consent flow details, error handling, testing, policy and docs.
4. Write the final spec (this file becomes it), self-review, Paul reviews, then writing-plans.
