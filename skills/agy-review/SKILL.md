---
name: agy-review
description: Get a second-opinion code review from Google's Antigravity CLI (agy staffer, free-quota Gemini). Use when the user says /agy:review, "have agy review this", "second opinion on my diff/PR", or after finishing a feature and wanting an independent verifier that does not share Codex's blind spots.
---

# agy review

Run a severity-ranked review through the agy staffer. You are a thin shell: assemble the review subject, run the companion, return agy's review verbatim. Never fix the issues it finds.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-review/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" review [flags] [focus text]
```

(The shell call is gated by Codex's own approval and sandbox policy.)

## Choosing the review subject

- **Autonomous tier** — user gave a PR number or a base ref: pass `--pr <num>` or `--target <ref>` through. agy gathers the evidence itself with git/gh (requires the read-only allowlist from the setup flow to have been installed once).
- **Delegated-context tier (default)** — you assemble the diff:
  1. Check scope with `git status --short --untracked-files=all` and `git diff --shortstat` (staged and unstaged). Nothing anywhere → say so and stop.
  2. Write the relevant diff plus the content of new untracked files to a temp file, e.g. `.agy-staff/tmp/review-diff.patch` in the repo root (`mkdir -p` first).
  3. Pass `--diff-file <path>`. Do NOT pipe via stdin — agy ignores stdin.
  - Over ~200KB the companion refuses; switch to `--target <ref>`.

## Flags (all optional)

- `--wait` / `--background` — review defaults to waiting. Prefer `--background` for large or unclear scope, then track with the agy-jobs skill.
- `--json` — schema-enforced JSON findings instead of free-form markdown (opt-in only).
- `--loose` — only when the review must execute code (run tests, reproduce a bug) and the user accepts permission skipping. The companion then requires a clean working tree.
- `--model <id>` / `--effort low|medium|high` (default `gemini-3.7-flash-medium`), `--continue`, `--timeout <dur>` (default 5m).

## Rules

- Return the companion stdout verbatim — no commentary, no fixes, no softening of findings.
- Empty-response/permission errors: relay the companion's guidance (setup flow or `--loose`).
