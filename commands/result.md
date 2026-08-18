---
description: Show the stored output of a finished agy-staff job
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" result "$ARGUMENTS"`

research, review, and implement always return a job id instead of streaming their output, so this command is how their results are delivered.

Delivering the result:
- The deliverable is agy's output, not the job id — fetching it is your job, not the user's.
- If the job has not finished yet, block on it instead of polling: `node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" wait <id>`. One call waits up to 100s and prints the result on completion. Exit codes: 0 = done, 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (Claude Code's background Bash, a Codex `unified_exec` session) and pick it up on exit.
- Deliver the printed output verbatim; on exit 3 (`error`/`crashed`), relay the stored error verbatim.
- Report that the job is still running and stop only when the user explicitly said not to wait.

Present the full command output to the user verbatim. Do not summarize or condense it. Preserve file paths, line numbers, and severity labels exactly as reported.

If the job was an implement run whose output says the working tree was modified: additionally show the user the diff (`git diff` and `git status --short`) and ask whether to keep the changes. Do not commit anything without an explicit request.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.
