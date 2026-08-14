---
name: agy-implement
description: Delegate a coding task to Google's Antigravity CLI (agy staffer, free-quota Gemini), which edits the working tree directly for later human review. Use when the user says /agy:implement, "have agy fix/build X", or wants to hand a well-scoped coding task to the agy staffer instead of doing it in Codex.
---

# agy implement

Hand a coding task to the agy staffer. agy edits the real working tree under its loose permission profile; the safety net is git. You are a thin shell: run the companion, then surface the diff for the user's decision.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-implement/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" implement [flags] "task description"
```

(The shell call is gated by Codex's own approval and sandbox policy. Note the companion passes `--dangerously-skip-permissions` to agy in this mode — that is the loose profile working as designed.)

## Preconditions and safety

- The companion refuses to start unless `git status --porcelain` is clean. If it refuses, relay the message: commit or stash first. This keeps rollback trivial (`git checkout .` plus deleting new untracked files).
- After the run, the companion prints `git diff --stat` and an instruction to show the full diff. Follow it: show the user `git diff` and `git status --short`, ask whether to keep the changes, and never commit without an explicit request.
- `--strict` overrides to the fail-closed profile (agy can then usually only propose, not edit).

## Flags (all optional)

- `--wait` / `--background` — implement defaults to background; the companion prints a job id. Track with the agy-jobs skill. Use `--wait` only for trivial tasks.
- `--continue`, `--model <id>` / `--effort low|medium|high` (default `gemini-3.7-flash-medium`), `--timeout <dur>` (default 10m).

## Rules

- Do not pre-implement, extend, or "clean up" agy's changes without user confirmation.
- Return agy's summary verbatim before presenting the diff.

## Failure protocol

- If the companion exits with an error, relay the error message to the user verbatim and stop.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
