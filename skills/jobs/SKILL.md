---
name: jobs
description: Manage agy staffer background jobs - collect results, check status, cancel, follow-up conversation, and setup. Use when an agy job needs collecting, when the user asks "is the agy job done", "show agy's result", "cancel the agy job", "continue the agy conversation", or "set up agy". This is the orchestrator's skill; the persona skills (staffer/researcher/reviewer/implementer) point here.
user-invocable: false
allowed-tools: Bash(node:*), AskUserQuestion
---

# agy jobs

Manage background staffer/research/review/implement jobs. State is per repository in `.agy-staff/`. Only ask runs synchronously.

This file lives at `<plugin-root>/skills/jobs/SKILL.md`:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" <command> [args]
```

## Collect the result

1. Keep the returned job id. Start `wait <id> --timeout 10m` in the background, using the same unsandboxed context as launch. Use a separate wait for each job; never wait for several jobs serially in one shell.
2. For **wait**, branch on the exit code:

| Code | Meaning | Next action |
| --- | --- | --- |
| 0 | Finished; result printed | Deliver it. Mention any warnings in the log. |
| 2 | Still running; current progress printed | Read the progress, then wait again if work should continue. |
| 3 | Error or crash | Read the error and recovery information below. |
| 4 | Canceled | Report cancellation. |
| 1 | Invalid command or other command error | Quote the error and correct the named problem. |

For a user progress question or a mid-run update, call `observe <id>` before reporting progress, even if a wait is already running. Report changed tool activity, response text or an actionable warning; do not repeat an unchanged snapshot. Do not call observe again just to duplicate the snapshot returned by a soft-expired wait.

Keep the pending wait open while observing. Host command collectors (for example, Codex `write_stdin`) only collect that command's output; they do not call observe or read AGY progress for you. Prefer background completion delivery; when polling is required, use a substantial supported wait (typically 30–60s), not repeated 1s empty polls. An outer `functions.wait` resumes a yielded `functions.exec` call, not an AGY job. During silent waiting the session has no output; only completion or soft expiry produces the result/snapshot for its collector. Observe reads job state independently, not wait’s output.

A wait expires without stopping the worker. Cancel only when the task calls for stopping; a quiet period alone is not a reason. If progress leaves a specific question unanswered, read only the relevant part of the file named in `details`, such as the last 4 KiB of its diagnostic log. Do not load an entire stream by default.

Deliver short results verbatim; summarize long results with their file path. Keep quoted verdicts, numbers and errors exact. For implement, also report the workspace state and inspect changes with `git diff`; verify any Git delivery that the user explicitly requested.

Follow through to a result unless the user asked only to launch. If the host cannot deliver background command results, use shorter waits (bare `wait` defaults to 100s). The host controls when the model receives a tool result; this plugin cannot schedule a future model invocation by itself.

## Other commands

| Command | Purpose |
| --- | --- |
| `observe [id]` | Always return bounded JSON: progress while running, terminal metadata and result/recovery pointers when finished. Never return report text. |
| `status [id]` | List jobs or show one job's state and log tail. |
| `result [id]` | Reprint stored output; default to the latest finished job. |
| `cancel <id>` | Stop that job's execution. Interrupting wait does not cancel it. |
| `continue --job <id> --prompt "..."` | Resume the job's conversation with its original mode/model/profile; create a linked new job. |
| `continue --prompt "..."` | Continue the latest conversation; `--conversation <id>` selects a known older one. |
| `restart <id>` | Start the original task/configuration again without its conversation; create a linked new job. |
| `setup [--apply] [--restrict <modes\|none>]` | Optional permission setup; read `references/setup.md` first. |

Wait/observe default to the latest job. Observe uses the same status exit codes, but exit 0 means **finished, not full result delivered**. Collect the existing wait session, or use `result <id>` if none is pending; do not start another wait or expect observe to consume the pending session. Failed/canceled observations provide bounded recovery metadata; wait/result deliver the full report. A continued ask remains synchronous.

## Progress and recovery

Progress contains up to five recent tool calls, input/output excerpts, and the latest response text. Timestamps, incomplete text and truncation are labeled. It is a snapshot, not a judgment of useful progress. Reads do not consume history or reset deadlines. Payload limits and file layout are in `../../docs/REFERENCE.md`.

The worker has a separate 60m hard limit; launch `--timeout` can shorten it. At that limit it stops execution and reports `hard_timeout`, the last snapshot, logs, known conversation ID and original configuration. Before recovery, inspect `git status` and `git diff` so partial changes are accounted for. Prefer `continue --job` when a conversation exists; otherwise use `restart`. Each creates a new budget and preserves the old terminal record. Recover only within the user's authorization; never restart automatically because a wait expired.

Warning-free success removes intermediate stream/snapshot files after results are stored. Errors, cancellation, hard timeout and warning results retain them; results, logs and conversation metadata remain available. Older jobs may have no progress files.

Quote errors and add a concise diagnosis. For sandbox/permission errors or an apparent crash without a result, check that collection uses the same unsandboxed context as launch; see `references/troubleshooting.md`. For restricted empty responses, relay the companion's permission guidance. Do not switch repositories to bypass a precondition.
