---
description: Cancel a running agy-staff background job
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" cancel "$ARGUMENTS"`

Present the command output to the user. If no job id was given, list the running jobs from `/agy:status` so the user can pick one.
