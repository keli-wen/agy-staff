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
