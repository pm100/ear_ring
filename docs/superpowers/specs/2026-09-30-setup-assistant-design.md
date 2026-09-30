# Setup Assistant — Design (WIP, brainstorming paused)

**Status:** Spec approved by Paul ("all is ok", 2026-09-30). Three implementation plans
written (see "Changes decided while planning"); awaiting Paul's review and choice of execution
method. No product code written. Branch: `sage`.
**Path:** architectural (new subsystem, LLM backend, touches all platforms + settings core).

## Goal

A user types a free-text question about setting up the app and the assistant either
answers it or proposes a settings change on their behalf.

Example: "I want a chance to correct a wrong note" → the answer is **Retry Same Note**
(Settings → Exercise & Timing; chips 0–5, default 2). Related: **Max Retries** (whole-test
replays) and **Wrong Note Pause** (how long the wrong note stays visible).

Success: a user who doesn't know the setting names gets the behaviour they want with
fewer taps than hunting through Settings.

## Decisions made (confirmed by Paul)

1. **Backend: hosted proxy.** A small stateless serverless function holds the Claude API
   key and calls a small, fast model (e.g. Haiku 4.5). Not a user-supplied key, not local
   keyword matching.
2. **Access: everyone, rate-limited.** About 5 free questions/day, more for premium,
   limited per install. **Attestation (Play Integrity / App Attest) is skipped for v1**;
   reinstall-abuse risk is accepted.
3. **Applying changes: propose, then confirm.** A card such as
   "Retry Same Note 2 → 5 [Apply] [Cancel]". Nothing changes until the user taps Apply.
4. **UI: short multi-turn chat on the Help tab** ("Ask about setup" box at the top).
   History lives on-device and is discarded when the user leaves. The proxy is stateless;
   the app resends recent turns each request.
5. **Approach A: tool-calling** (chosen over free-text-with-JSON and answer-only).
6. **All three platforms** (Android, iOS, desktop) per the UI Consistency Rule.

## Section 1 — What the assistant can do (presented, not yet explicitly approved)

Each turn Claude returns text, optionally with one tool call.

- **Text-only reply** — no tool. Covers advice ("try playing slower"), "that's a premium
  feature", or a plain explanation. Advice may be paired with a settings proposal (e.g. a
  lower Tempo) when it makes sense.
- **`propose_settings_changes`** — list of `{setting, value}`. Shown as the confirm card.
- **`submit_feedback`** — `{category, summary}`. For feature requests such as "I'd like
  different colours". Touches no setting; the app shows "Sent as feedback, thanks".

### What the model is told (built by the Rust core per request)

- **Settings schema:** each setting's id, valid values, default, current value and tooltip,
  derived from `rust/src/settings.rs` and `rust/src/tooltips.md`. No second copy to keep
  in sync.
- **Premium state:** whether the user is premium, and which settings/instruments are
  premium-only (premium flag on `InstrumentInfo`), so it says "that's premium" rather than
  proposing a change the app would refuse.
- **Guardrails:** setup help only (off-topic gets a polite refusal); never invent
  settings; say so when a wish isn't supported instead of approximating it silently.

### Validation (Rust core)

A proposed setting that is unknown, out of range (using the existing `settings.rs`
clamps) or premium-locked for a non-premium user is dropped before display. If everything
in a proposal is dropped, the reply falls back to text.

## Section 2 — Proxy API (presented; feedback destination confirmed)

- **Endpoint:** `POST /v1/ask`. Headers carry a random install id (generated on first use,
  kept in platform persistence), platform and app version.
- **Request body:** the last ~6 chat turns plus a `context` block built by the Rust core
  (settings schema, current values, `premium` flag).
- **Response:** `{reply, proposal?, quota}`.
  - `proposal` is the list of `{setting, value}` for the confirm card; the client validates
    and applies it.
  - `quota` holds remaining count and reset time; the proxy returns 429 once exhausted and
    the app shows the quota message.
  - The proxy executes `submit_feedback` itself and strips it from the reply; the app only
    learns that feedback was sent.
- **Feedback delivery (decided):** each item is written to the proxy's key-value store and a
  daily digest is emailed to Paul. Needs an email service on the proxy.
- **Cost control:** the static prompt (guardrails + settings schema, ~3–4k tokens) is marked
  for prompt caching; current values go in a separate uncached block. Low `max_tokens`
  cap. Per-install daily counters live in the proxy's key-value store.
- **Known v1 limits:** the `premium` flag is client-asserted (a liar gets a larger quota but
  no paid features, since the app still enforces premium locally); install ids reset on
  reinstall.

## Section 3 — Errors, privacy, testing, docs

### Errors (all shown inline in the chat)

- **Offline / proxy unreachable:** "Can't reach the assistant right now" with a Retry
  button. The question is kept and no quota is used.
- **Quota exhausted (429):** shows when it resets and points to the normal Settings screen,
  since everything the assistant does can also be done by hand.
- **Malformed or invalid model output:** the Rust core drops anything it cannot validate.
  If nothing usable remains, show the text reply, or "I couldn't work out a safe change,
  try rephrasing" when there is no text either.
- **Stale proposal:** if settings change by hand between proposal and Apply, the card is
  recomputed against current values and the before/after refreshed.

### Privacy

- **Sent:** typed text, recent chat turns, settings snapshot. No audio, no progress data,
  no identity beyond the random install id.
- **Disclosure:** a one-line note under the chat box says questions are sent to a server;
  the privacy policy (URL already set in App Store Connect) gets a line about this.

### Testing

- **Rust core:** unit tests for schema generation, validation (unknown / out-of-range /
  premium-locked settings) and applying proposals.
- **Proxy:** tests against a stubbed model covering tool-call routing, rate limiting and
  feedback storage.
- **End to end:** a scripted set of example questions ("correct a wrong note", "make it
  easier", "I want dark mode") run against the real model before release, checking each
  lands on the right outcome (setting, text or feedback).
- **Platforms:** manual pass on each of chat, Apply card and quota message.

### Docs to update when built

DESIGN.md Help-tab section (including per-platform chat layout), `rust/src/help.md`, and
the privacy policy.

### Out of v1

Voice input, history across sessions, proposals that touch anything outside settings,
attestation.

## Possible later phase — mic diagnostics (decided: later, not v1)

Idea: help users get better tone recognition from their mic setup. Do **not** send raw
audio: as far as is known the Claude API has no audio input, and it would break the
"no audio leaves the device" rule. Instead the Rust core would produce a small numeric
diagnostic summary (noise floor, peak level, pitch stability, missed / octave-flipped /
mis-detected note rates, current detection parameters) added to the `context` block. The
model explains problems and proposes detection-setting changes through the existing
`propose_settings_changes` flow.

Relationship to Auto-Calibrate (branch `auto_calibrate`): Auto-Calibrate stays the engine
that tunes parameters. The assistant is the conversational layer: recommend running it,
explain its results, and give non-setting advice such as mic placement. Depends on
Auto-Calibrate reaching Android and iOS (Phase 2, not yet scoped). v1 keeps the `context`
block extensible so a diagnostics section can be added without an API change.

## Architecture (Shared Logic Rule)

- **Rust core:** builds the schema and request, parses the response, validates and applies
  proposals.
- **Platforms:** render the Help-tab chat and Apply card, and perform the HTTPS POST.
  Keeping the network call out of the cross-compiled Rust library avoids adding a TLS
  stack to the Android/iOS builds.
- **Proxy:** stateless; holds the API key; rate-limits per install; forwards only the
  question, recent turns and settings snapshot (no audio, progress or identity).

## Parameters deferred to the plan

Figures above are placeholders to be fixed in the implementation plan: free vs premium
daily quota (~5 free), number of chat turns resent (~6), `max_tokens`, exact model, proxy
host. The plan should split the work into three independently testable pieces: proxy, Rust
core (schema, request/response, validation), and per-platform Help-tab UI.

## Remaining work

- Get explicit approval of Section 1.
- Paul reviews this written spec → `writing-plans`.

## Changes decided while planning (2026-09-30)

These refine or override the sections above; the plans follow them.

- **The language model is configuration, not code (Paul's requirement).** The proxy has a
  `ModelProvider` interface with two implementations, Claude (official SDK) and any
  OpenAI-compatible server (OpenAI, Gemini, Groq, OpenRouter, self-hosted Ollama/vLLM), chosen by
  `PROVIDER`/`MODEL` variables. The apps and the Rust core never name a vendor. Default is
  Claude `claude-haiku-4-5`.
- **One Rust entry point for network results.** The core's `resolve_outcome_json(status, body, ...)`
  maps HTTP status (0 = unreachable, 200, 429, other) to the chat view, so no platform interprets
  status codes. The proxy address lives once in `assistant::PROXY_URL`.
- **Not proposable in v1:** the note range, pitch tolerance and meter style (awkward for a model
  to describe safely; pitch tolerance only shows for premium instruments). The assistant can
  propose the 20 settings the Settings, Home and Mic Setup screens expose as chips, sliders and
  toggles. Mic Sensitivity is proposed on its 1 to 10 slider scale.
- **Proposals are validated by the settings core.** Each proposed change runs through
  `settings::apply_json`; anything unknown, unavailable, premium-locked, already in effect, or
  not actually applied is rejected before the user sees it. Apply re-validates against the
  settings as they are at that moment.
- **Hosting:** Cloudflare Workers with KV and a cron trigger; feedback digest emailed with Resend.
- **Release work the feature adds:** privacy policy wording, App Store Connect App Privacy,
  Google Play Data safety and `PrivacyInfo.xcprivacy` (plan 3, Task 4).
- **Implementation plans:** `docs/superpowers/plans/2026-09-30-setup-assistant-1-rust-core.md`,
  `-2-proxy.md` and `-3-platforms.md`, to be executed in that order.

## Context

The app currently has no networking or backend. It is free with AdMob banner ads and has a
`premium` flag already gating Voice instruments and ads.
