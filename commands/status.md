---
description: Show agy-staff background jobs for this repository
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" status "$ARGUMENTS"`

If the user did not pass a job id:
- Render the output as a single compact Markdown table (id, mode, status, started, finished). No extra prose.
- Mention the follow-up commands the output lists (`/agy:status <id>`, `/agy:result <id>`).

If the user did pass a job id:
- Present the full output as-is, including the log tail for running jobs. Do not summarize.
