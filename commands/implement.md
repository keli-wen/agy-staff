---
description: Delegate a coding task to agy (fast Gemini); it edits the working tree for your review
argument-hint: '[--wait|--background] [--continue] [--strict] [--model <id>|--effort low|medium|high] "task description"'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*), AskUserQuestion
---

Delegate an implementation task to the agy staffer through the shared companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraints:
- agy does the coding, not you. Do not pre-implement, "fix up", or extend agy's changes without user confirmation.
- Implement mode defaults to the loose profile (`--dangerously-skip-permissions` inside agy). The companion enforces a clean working tree before starting and reports the resulting diff after.

Preconditions:
- The companion refuses if `git status --porcelain` is not clean. If it refuses, relay the message: the user should commit or stash first (this keeps rollback trivial: `git checkout .`).

Execution mode rules:
- If the raw arguments include `--wait` or `--background`, do not ask; the companion honors the flag.
- Otherwise the companion defaults to background for implement. Estimate task size first; for a clearly trivial task (one small file, one obvious fix) use `AskUserQuestion` exactly once:
  - `Run in background (Recommended)` / `Wait for results` — flip the recommendation to waiting only for trivial tasks.
- For background runs, launch the Bash call with `run_in_background: true`.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" implement "$ARGUMENTS"
```

Result handling:
- Foreground: print agy's summary verbatim. Then show the user the actual diff (`git diff`, plus `git status --short` for new files) and ask whether to keep it. Rollback is `git checkout .` plus removing new untracked files.
- Background: tell the user the job id; `/agy:status` tracks it. When they fetch `/agy:result` later, the diff-and-confirm step above still applies.
- Never commit agy's changes yourself unless the user explicitly asks after seeing the diff.

## Failure protocol

- If the companion exits with an error, relay the error message to the user verbatim and stop.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
