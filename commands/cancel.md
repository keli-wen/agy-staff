---
description: Cancel a running agy-staff background job
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" cancel "$ARGUMENTS"`

Present the command output to the user. If no job id was given, list the running jobs from `/agy:status` so the user can pick one.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.
