---
description: Send a follow-up message to the most recent agy conversation
argument-hint: '[--conversation <id>] [--background] "follow-up text"'
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
- Return the command stdout verbatim, including the `[agy-staff]` footer.
- To target an older conversation instead of the most recent, the user can pass `--conversation <id>` (ids appear in every footer), or rerun a mode command with `--continue` to reuse that mode's last conversation.
- If it reports no recorded conversation, tell the user to start one with `/agy:research`, `/agy:review`, or `/agy:implement` first.

## Failure protocol

- If the companion exits with an error, relay the error message to the user verbatim and stop.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
