# Setup Assistant — Design (WIP, brainstorming paused)

**Status:** DRAFT / work in progress. Brainstorming paused 2026-09-30. Not yet reviewed or
approved as a spec; no plan written; no code written.
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

## Architecture (Shared Logic Rule)

- **Rust core:** builds the schema and request, parses the response, validates and applies
  proposals.
- **Platforms:** render the Help-tab chat and Apply card, and perform the HTTPS POST.
  Keeping the network call out of the cross-compiled Rust library avoids adding a TLS
  stack to the Android/iOS builds.
- **Proxy:** stateless; holds the API key; rate-limits per install; forwards only the
  question, recent turns and settings snapshot (no audio, progress or identity).

## Remaining work (not yet designed)

- Get explicit approval of Section 1.
- **Section 2 — request/response shapes, proxy, rate limit.**
  - **Open question: where does `submit_feedback` go?** Options: server log, email to Paul,
    GitHub issue.
  - How the per-install id is generated and stored.
  - Quota-exceeded UX (what a rate-limited user sees).
- Error handling: offline, proxy down, malformed model output.
- Testing strategy (Rust unit tests for schema/validation; proxy tests with a stubbed model).
- Doc updates: DESIGN.md (Help tab section, new Premium/quota notes) and `rust/src/help.md`.
- Then: spec self-review → Paul reviews written spec → `writing-plans`.

## Context

The app currently has no networking or backend. It is free with AdMob banner ads and has a
`premium` flag already gating Voice instruments and ads.
