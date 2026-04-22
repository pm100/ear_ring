# Copilot Instructions

**Before doing anything in this repository, read `AGENTS.md` in the repo root.**

`AGENTS.md` is the canonical source of truth for this project. It contains:
- UI specs for all screens (Android, iOS, Tauri/desktop)
- Platform rules and exceptions
- Build and debug commands for each platform
- Music staff, pitch meter, colour, and audio specifications
- Rules about cross-platform consistency (all UI changes must go to all 3 platforms)
- Shared Rust logic conventions

Do not rely on memory alone — always read `AGENTS.md` first.

## ⛔ Git Commit / Push Rules

**NEVER run `git commit` or `git push` unless the user explicitly says to in this message.**

- Do not commit after completing a task
- Do not commit after writing documentation
- Do not ask "should I commit?" — wait for the user to say so
- This rule has no exceptions regardless of how complete the work is
