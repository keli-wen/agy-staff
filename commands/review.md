---
description: Get a second-opinion code review from agy (Gemini free quota)
argument-hint: '[--wait|--background] [--pr <num>|--target <ref>] [--loose] [--json] [focus text]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*), AskUserQuestion
---

Run an agy review through the shared companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only. Do not fix issues, apply patches, or announce that you will make changes.
- Your only job is to assemble the review subject, run the review, and return agy's output verbatim.

Choosing the review subject:
- If the arguments include `--pr <num>` or `--target <ref>`: pass them through unchanged. agy gathers the evidence itself (autonomous tier — requires `/agy:setup` to have been run once).
- Otherwise (delegated-context tier, the default): you assemble the diff.
  1. Inspect scope: `git status --short --untracked-files=all`, `git diff --shortstat` and `git diff --shortstat --cached`.
  2. If there is nothing to review anywhere, say so and stop.
  3. Write the relevant diff (working tree, staged, or branch diff — whatever matches the user's intent, plus the content of new untracked files) to a temp file, e.g. `.agy-staff/tmp/review-diff.patch` under the repo root (`mkdir -p` first).
  4. Pass it with `--diff-file <path>`. Do NOT pipe via stdin — agy ignores stdin.
  - If the diff is larger than ~200KB the companion will refuse; switch to `--target <ref>` instead.

Execution mode rules:
- If the raw arguments include `--wait` or `--background`, do not ask; the companion honors the flag.
- Otherwise estimate size first (from the shortstat output). Then use `AskUserQuestion` exactly once with two options, recommended first and suffixed `(Recommended)`:
  - Tiny change (1-2 files): `Wait for results (Recommended)` / `Run in background`
  - Anything larger or unclear: `Run in background (Recommended)` / `Wait for results`
- For `--background`, launch the Bash call with `run_in_background: true`; the companion also records it as a job for `/agy:status`.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" review "$ARGUMENTS" --diff-file <path-if-delegated>
```

Result handling:
- Foreground: return the stdout verbatim, exactly as-is. No commentary before or after, and do not fix anything it mentions.
- Background: tell the user the job id and to use `/agy:status` / `/agy:result`.

Failure handling:
- Empty-response/permission errors: relay the companion's guidance (`/agy:setup` or `--loose`).
- A review that must execute code (run tests, reproduce a bug) needs `--loose`; suggest it only when the user asked for that kind of verification.

## Failure protocol

- If the companion exits with an error, relay the error message to the user verbatim and stop.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
