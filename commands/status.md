---
description: Show agy-staff background jobs for this repository
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" status "$ARGUMENTS"`

research, review, and implement always run as background jobs and never call back, so this command plus `wait`/`/agy:result` is how you collect their output.

`status <id>` exits with a machine-readable code: 0 = done, 2 = running, 3 = error/crashed, 4 = canceled (1 = generic error, e.g. unknown id). Branch on the exit code; never grep the JSON to decide whether the job is done.

Delivering the result:
- The deliverable is agy's output, not the job status — waiting for it is your job, not the user's.
- To wait for a running job, prefer `node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" wait <id>`: one call blocks up to 100s and prints the result on completion, with the same exit codes (2 = still running — rerun it). Use your harness's background command facility for it if you have other work in flight.
- When the job is done, deliver the result: a short report (about a screenful) → verbatim; a long report → the verdict/key points plus the result-file path, expanding sections on request. On exit 3, quote the stored error verbatim, add one line of diagnosis, and suggest the next step.
- Report just the current status and stop only when the user explicitly said not to wait.

If the user did not pass a job id:
- Render the output as a single compact Markdown table (id, mode, status, started, finished). No extra prose.
- Mention the follow-up commands the output lists (`/agy:status <id>`, `/agy:result <id>`).

If the user did pass a job id:
- Present the full output as-is, including the log tail for running jobs. Do not summarize.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.
