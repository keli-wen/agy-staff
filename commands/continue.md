---
description: Send a follow-up message to the most recent agy conversation
argument-hint: '[--conversation <id>] "follow-up text"'
allowed-tools: Bash(node:*)
---

Continue the most recent agy-staff conversation in this repository (continuation is quota-friendly: agy serves most context from cache).

Raw slash-command arguments:
`$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" continue "$ARGUMENTS"
```

Result handling:
- The follow-up inherits the execution style of the conversation's mode: a continued ask answers synchronously, while a continued research, review, or implement returns a background job id. Nothing overrides that.
- Return the command stdout verbatim. The `[agy-staff]` telemetry line goes to stderr and is metadata for you, the calling agent — do not show it to the user.
- If the output is a job id, the deliverable is still agy's result, not the id: block on it with `node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" wait <id>` (up to 100s per call; exit 0 = result printed, exit 2 = still running — rerun the same `wait <id>`, through your harness's background command facility if you have other work in flight) and deliver the printed result verbatim. `/agy:cancel <id>` stops it. Report just the job id and stop only when the user explicitly said not to wait.
- To target an older conversation instead of the most recent, the user can pass `--conversation <id>` (ids are recorded in `.agy-staff/state.json`, and the telemetry line on stderr shows the one just used), or rerun a mode command with `--continue` to reuse that mode's last conversation.
- If it reports no recorded conversation, tell the user to start one with `/agy:research`, `/agy:review`, or `/agy:implement` first.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
