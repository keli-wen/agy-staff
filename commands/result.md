---
description: Show the stored output of a finished agy-staff job
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" result "$ARGUMENTS"`

Present the full command output to the user verbatim. Do not summarize or condense it. Preserve file paths, line numbers, severity labels, and the `[agy-staff]` footer exactly as reported.

If the job was an implement run whose footer says the working tree was modified: additionally show the user the diff (`git diff` and `git status --short`) and ask whether to keep the changes. Do not commit anything without an explicit request.
