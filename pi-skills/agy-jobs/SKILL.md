---
name: agy-jobs
description: Manage agy staffer background jobs - collect results, check status, cancel, follow-up conversation, and setup. Use when an agy job needs collecting, when the user asks "is the agy job done", "show agy's result", "cancel the agy job", "continue the agy conversation", or "set up agy". This is the orchestrator's skill; the persona skills (staffer/researcher/reviewer/implementer) point here.
---

<!-- Generated from skills/jobs/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy jobs

Manage background staffer/research/review/implement jobs. State is per repository in `.agy-staff/`. Only ask runs synchronously.

This file lives at `<plugin-root>/pi-skills/agy-jobs/SKILL.md`:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" <command> [args]
```

## Collect the result

1. Keep the returned job id. Start `wait <id> --timeout 10m` in the background, using the same unsandboxed context as launch. Use a separate wait for each job; never wait for several jobs serially in one shell.
2. Branch on the exit code:

| Code | Meaning | Next action |
| --- | --- | --- |
| 0 | Finished; result printed | Deliver it. Mention any warnings in the log. |
| 2 | Still running; current progress printed | Read the progress, then wait again if work should continue. |
| 3 | Error or crash | Read the error and recovery information below. |
| 4 | Canceled | Report cancellation. |
| 1 | Invalid command or other command error | Quote the error and correct the named problem. |

A wait expires without stopping the worker. Cancel only when the task calls for stopping; a quiet period alone is not a reason. If progress leaves a specific question unanswered, read only the relevant part of the file named in `details`, such as the last 4 KiB of its diagnostic log. Do not load an entire stream by default.

Deliver short results verbatim; summarize long results with their file path. Keep quoted verdicts, numbers and errors exact. For implement, also report the workspace state and inspect changes with `git diff`; verify any Git delivery that the user explicitly requested.

Follow through to a result unless the user asked only to launch. If the host cannot deliver background command results, use shorter waits (bare `wait` defaults to 100s). The host controls when the model receives a tool result; this plugin cannot schedule a future model invocation by itself.

## Other commands

| Command | Purpose |
| --- | --- |
| `observe [id]` | Immediately show current progress, or the terminal result/report. |
| `status [id]` | List jobs or show one job's state and log tail. |
| `result [id]` | Reprint stored output; default to the latest finished job. |
| `cancel <id>` | Stop that job's execution. Interrupting wait does not cancel it. |
| `continue --job <id> --prompt "..."` | Resume the job's conversation with its original mode/model/profile; create a linked new job. |
| `continue --prompt "..."` | Continue the latest conversation; `--conversation <id>` selects a known older one. |
| `restart <id>` | Start the original task/configuration again without its conversation; create a linked new job. |
| `setup [--apply] [--restrict <modes\|none>]` | Optional permission setup; read `references/setup.md` first. |

Wait/observe default to the latest job; observe and status-with-id use the same exit codes as wait. A continued ask remains synchronous.

## Progress and recovery

Progress contains up to five recent tool calls, input/output excerpts, and the latest response text. Timestamps, incomplete text and truncation are labeled. It is a snapshot, not a judgment of useful progress. Reads do not consume history or reset deadlines. Payload limits and file layout are in `../../docs/REFERENCE.md`.

The worker has a separate 60m hard limit; launch `--timeout` can shorten it. At that limit it stops execution and reports `hard_timeout`, the last snapshot, logs, known conversation ID and original configuration. Before recovery, inspect `git status` and `git diff` so partial changes are accounted for. Prefer `continue --job` when a conversation exists; otherwise use `restart`. Each creates a new budget and preserves the old terminal record. Recover only within the user's authorization; never restart automatically because a wait expired.

Warning-free success removes intermediate stream/snapshot files after results are stored. Errors, cancellation, hard timeout and warning results retain them; results, logs and conversation metadata remain available. Older jobs may have no progress files.

Quote errors and add a concise diagnosis. For sandbox/permission errors or an apparent crash without a result, check that collection uses the same unsandboxed context as launch; see `references/troubleshooting.md`. For restricted empty responses, relay the companion's permission guidance. Do not switch repositories to bypass a precondition.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
