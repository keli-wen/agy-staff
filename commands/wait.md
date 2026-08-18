---
description: Wait for an agy-staff background job to finish and print its result
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" wait "$ARGUMENTS"`

Blocks until the job (default: the most recent one) reaches a terminal state, then prints its result — the preferred way to collect a background job. One call waits up to 100s; expiring is not a failure.

Exit codes (machine-readable — branch on them, never parse the output to decide):
- 0 — done; the result has been printed above.
- 2 — still running when the 100s window closed. Run the same `wait <id>` again (through your harness's background command facility if you have other work in flight).
- 3 — error/crashed; the stored error has been printed. Quote it verbatim, add one line of diagnosis, and suggest the next step.
- 4 — canceled.
- 1 — generic error (e.g. unknown job id); quote the message verbatim.

Delivering the result on exit 0: a short report (about a screenful) → verbatim; a long report → the verdict/key points plus the result-file path, expanding sections on request. If it was an implement job whose output says the working tree was modified, additionally show the user the diff (`git diff` and `git status --short`) and ask whether to keep the changes. Do not commit anything without an explicit request.

## Failure protocol

- If the companion exits with code 1, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.
