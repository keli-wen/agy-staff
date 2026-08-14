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
