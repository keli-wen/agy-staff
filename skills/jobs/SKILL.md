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

Default flow: prepare the prompt → dispatch → wait for the final result → validate as needed. While a job is running, do not proactively call `observe`/`status`, read logs or inspect intermediate artifacts. Do not query progress for routine updates or create sleep/observe loops. Observe only when the user explicitly asks for progress; diagnose after receiving a failure or a result requiring intervention.

1. Keep the returned job id. Start `wait <id> --timeout 10m` in the background, using the same unsandboxed context as launch. Use a separate wait for each job; never wait for several jobs serially in one shell.
2. For **wait**, branch on the exit code:

| Code | Meaning | Next action |
| --- | --- | --- |
| 0 | Invocation ended; response text delivered | Assess whether it satisfies the task. Review attached diagnostics; inspect further only as needed. |
| 2 | Still running; wait soft-expired | Wait again for the same job. The attached snapshot is not a request to inspect progress or intervene. |
| 3 | Error or crash | Read the error and recovery information below. |
| 4 | Canceled | Complete any already-authorized follow-up; otherwise report cancellation. |
| 5 | Attention: resumable timeout | Inspect partial workspace changes; ask whether to continue with the suggested timeout or stop. Continue only after explicit user confirmation. |
| 1 | Invalid command or other command error | Quote the error and correct the named problem. |

`done` describes invocation and response delivery, not task acceptance. Preserve agy-cli response text and diagnostics; a nonempty response may only acknowledge launched background work. Successful calls with warnings include a bounded log tail on stderr and a full-log pointer. The orchestrator assesses the response and artifacts, uses `observe` or diagnostics if the returned result needs investigation, and decides whether to propose continuation. Keep the recovery confirmation rules below; do not infer timeout from response wording or add routine progress polling.

When the user explicitly asks for progress, use `observe <id>` and answer from that snapshot, keeping any pending wait open. An already returned snapshot may answer the question; do not duplicate it or turn one question into recurring observation.

Collecting a pending wait command is necessary result collection, not active observation. Host collectors (for example, Codex `write_stdin`) return that command's output; an outer `functions.wait` resumes a yielded `functions.exec` call. They do not independently read AGY progress. Prefer background completion delivery; if host collection requires polling, use a long supported blocking wait rather than short empty polls or sleep loops. Keep the same pending command until it returns; only restart `wait` for the same job after exit 2.

A wait expires without stopping the worker. Cancel only when the task calls for stopping; silence or soft expiry alone is not a reason. For a user-requested progress answer or diagnosis after failure/required intervention, read a bounded `details` excerpt only if the returned information leaves a specific question unanswered. Never inspect logs or intermediate artifacts for routine reassurance.

When using lead, let the lead assess and synthesize the results. For direct persona invocations, deliver short results verbatim; summarize long results with their file path. Keep quoted verdicts, numbers and errors exact. For implement, also report the workspace state and inspect changes with `git diff`; verify any Git delivery that the user explicitly requested.

Follow through to a result unless the user asked only to launch. If the host cannot deliver background command results, use the longest practical wait within its tool-call limit (bare `wait` defaults to 100s). The host controls when the model receives a tool result; this plugin cannot schedule a future model invocation by itself.

## Other commands

| Command | Purpose |
| --- | --- |
| `observe [id]` | On an explicit user progress request, or for diagnosis after failure/required intervention: bounded JSON with progress or terminal metadata and recovery pointers. Never returns report text. |
| `status [id]` | List jobs or show one job's state and log tail. |
| `result [id]` | Reprint stored output; default to the latest finished job. |
| `cancel <id>` | Stop that job's execution. Interrupting wait does not cancel it. |
| `continue --job <id> --prompt "..."` | Resume the job's conversation with its original mode/model/profile; create a linked new job. |
| `continue --prompt "..."` | Continue the latest conversation; `--conversation <id>` selects a known older one. |
| `restart <id>` | Start the original task/configuration again without its conversation; create a linked new job. |
| `setup [--apply] [--restrict <modes\|none>]` | Optional permission setup; read `references/setup.md` first. |

Wait/observe default to the latest job. Observe uses the same status exit codes, but exit 0 means **finished, not full result delivered**. Collect the existing wait session, or use `result <id>` if none is pending; do not start another wait or expect observe to consume the pending session. Failed/canceled/attention observations provide bounded recovery metadata; wait/result deliver the full report. A continued ask remains synchronous. `result` also returns exit 5 for attention (its legacy exit behavior for other terminal states is unchanged).

Continuation and restart may be invoked from the root or any subdirectory of the same worktree; execution returns to the original cwd. Generic `continue` fails for an unrecorded conversation ID. It does not search other worktrees or infer configuration from an unrelated conversation. For continuation, explicit model/profile flags override the inherited values.

Cancel records a request first and returns success only after the worker has stored the cancellation report and published `canceled`. A crashed job keeps its crash diagnostics. A cancellation error requires inspection; it does not mean execution has stopped.

## Follow-up instructions

Use `continue --job <id>` to target an existing AGY conversation. It starts a new invocation once the current execution has stopped. While that job is still running, the companion refuses the follow-up with exit 1, reporting the job ID and status; nothing is queued. Decide whether to wait or cancel.

- **Finished:** continue directly with the next assignment or revision.
- **Running, feedback can wait:** collect the current result, then continue.
- **Running, direction must change now:** cancel the active job, confirm termination, then continue with the updated brief. An already-authorized change of direction does not require another confirmation solely for this sequence.

Include relevant decisions made in the host conversation, what changed, and what the worker should do next. After interruption, reconcile partial artifacts before repeating work: cancellation does not roll back edits, and the conversation may not contain the last interrupted step. If no usable conversation exists, start a fresh task with the updated brief and retained work. Timeout recovery still follows the rules below.

## Progress and recovery

Progress contains up to five recent tool calls, input/output excerpts, and the latest response text. Timestamps, incomplete text and truncation are labeled. It is a snapshot, not a judgment of useful progress. Reads do not consume history or reset deadlines. Payload limits and file layout are in `../../docs/REFERENCE.md`.

The worker has a separate hard limit: default 60m, configurable with launch `--timeout` up to 120m. AGY receives the same response timeout; the worker independently enforces the overall budget, including initialization. At that limit it stops execution. If response text has already arrived, it delivers that text with a warning for the orchestrator to assess; otherwise it reports `hard_timeout`, the last snapshot, logs, known conversation ID and original configuration. Before recovery, inspect `git status` and `git diff` so partial changes are accounted for. Prefer `continue --job` when a conversation exists; otherwise use `restart`. Each creates a fresh 60m budget unless `--timeout` is specified, and preserves the old terminal record. Restart refreshes workspace context; older specifications explicitly label historical snapshots and append current context. An empty response at either the AGY response deadline or worker hard limit becomes `attention` (exit 5) when a conversation ID is known, otherwise `error`. The response-timeout classifier accepts explicit TIMEOUT statuses and AGY's exact `ERROR` / `timeout waiting for response` payload; unrelated tool/network/auth/quota errors keep their own failure path. The report includes pre-run/current workspace status, original configuration and an exact continuation command with a doubled timeout capped at 120m for background jobs. At that ceiling, offer a narrower task. Ask the user whether to continue or stop and inspect; do not automatically retry, restart or continue after a timeout. Run the proposed recovery only after explicit user confirmation. A wait soft expiry is still exit 2 and requires no new execution.

Warning-free success removes intermediate stream/snapshot files after results are stored. Errors, cancellation, hard timeout and warning results retain them; results, logs and conversation metadata remain available. Older jobs may have no progress files.

Quote errors and add a concise diagnosis. For sandbox/permission errors or an apparent crash without a result, check that collection uses the same unsandboxed context as launch; see `references/troubleshooting.md`. For restricted empty responses, relay the companion's permission guidance. Do not switch repositories to bypass a precondition.
