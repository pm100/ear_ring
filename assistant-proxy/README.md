# Ear Ring setup assistant proxy

Cloudflare Worker between the apps and a language model. Design:
`docs/superpowers/specs/2026-09-30-setup-assistant-design.md`.

- `POST /v1/ask`: answers one setup question (wire contract:
  `docs/superpowers/plans/2026-09-30-setup-assistant-1-rust-core.md`).
- `GET /health`: liveness.
- Cron (08:00 UTC): emails unsent feedback as one digest.

## Choosing the model

The apps never know which model answers. `wrangler.toml` `[vars]`:

| PROVIDER | Needs |
|---|---|
| `anthropic` (default) | secret `ANTHROPIC_API_KEY`; `MODEL` optional (default `claude-haiku-4-5`) |
| `openai` (any OpenAI-compatible API) | secret `OPENAI_API_KEY`; vars `OPENAI_BASE_URL`, `MODEL`; optional `OPENAI_MAX_TOKENS_FIELD`, `OPENAI_TEMPERATURE` (0 to 2) |

Change the vars, `npx wrangler deploy`, then run `node scripts/examples.mjs <url>` to check behaviour.

## Develop

    npm install
    npm test              # unit tests with stubbed providers, no network
    npm run typecheck
    npx wrangler dev      # local server; put secrets in .dev.vars (untracked)

## Deploy

    npx wrangler deploy

Secrets (`npx wrangler secret put`): the provider key, `RESEND_API_KEY` and `DIGEST_TO`.
Variables (`wrangler.toml`): `PROVIDER`, `MODEL`, limits, `DIGEST_FROM`.

## After changing the settings the apps expose

Regenerate the contract fixture and re-run the tests:

    cargo test -p ear_ring_core write_context_fixture -- --ignored
    npm test
