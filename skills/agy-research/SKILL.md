---
name: agy-research
description: Delegate a deep research or survey task to Google's Antigravity CLI (agy staffer, free-quota Gemini). Use when the user says /agy:research, "ask agy to research", "have the agy staffer survey X", or wants a second, independent deep-dive on a topic or codebase without spending Codex quota.
---

# agy research

Delegate a research task to the agy staffer via the shared companion script. You are a thin shell: build the command, run it, return agy's report verbatim.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-research/SKILL.md`; the companion is at `<plugin-root>/companion/agy-companion.mjs`. Resolve the absolute path relative to this skill directory before running:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" research [flags] "what to research"
```

(The shell call itself is gated by Codex's own approval and sandbox policy; the companion spawns the local `agy` binary and needs network access to Google's backend.)

## Flags (all optional)

- `--wait` / `--background` — research defaults to waiting; use `--background` for long crawls, then track with the agy-jobs skill.
- `--continue` — reuse the last research conversation (quota-friendly, served largely from cache).
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.7-flash-high`.
- `--loose` — only if strict runs come back empty and the user accepts permission skipping.
- `--timeout <dur>` — default 10m.

## Rules

- Do not do the research yourself and do not re-verify agy's findings.
- Return the companion stdout verbatim, including the `[agy-staff]` footer (it carries the conversation id).
- If the companion reports an empty response due to denied permissions, relay its guidance: run the setup flow (see the agy-jobs skill's setup section) or retry with `--loose`.
- For a background run, report the printed job id and stop; do not poll in the same turn.
