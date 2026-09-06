---
name: agy-jobs
description: Manage agy staffer background jobs - collect results, check status, cancel, follow-up conversation, and setup. Use when an agy job needs collecting, when the user asks "is the agy job done", "show agy's result", "cancel the agy job", "continue the agy conversation", or "set up agy". This is the orchestrator's skill; the persona skills (staffer/researcher/reviewer/implementer) point here.
---

<!-- Generated from skills/jobs/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy jobs

Job management for the agy-staff plugin. All state is per-repository under `.agy-staff/` (created and git-ignored automatically on first use).

staffer, research, review, and implement always start a background job and return a job id immediately; only ask runs in the foreground. Completion ends an outstanding wait; the outer harness controls when the tool result reaches the model. Bash + skills cannot universally wake an idle orchestrator: the deliverable is agy's output, not the job id, and collecting it is your job, not the user's.

## Locating the companion

This skill file lives at `<plugin-root>/pi-skills/agy-jobs/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" <subcommand> [args]
```

## Collecting results

The job-start output prints the exact collect command — `wait <id> --timeout 10m`, an attention interval independent of the worker’s 60-minute hard execution limit. The call returns the existing result on completion, or a bounded observation snapshot on soft expiry while the worker continues. Ordinary activity does not end the wait early. Never parse output to decide whether a job is done; branch on the exit code.

- **One job → one background wait.** Run the printed `wait` through your harness's background command facility (Claude Code's background Bash, a Codex `unified_exec` session), started as soon as the job starts, and pick it up when it exits. While it runs, heartbeat lines on stderr (`still waiting on <id>…`) show liveness.
- **N jobs → N background waits, never one shell.** Do not wait for several ids serially in a single shell (`wait a; wait b`, a for-loop): it hides each job's completion behind the slowest predecessor and gives you nothing to react to. Start every job's own background `wait` the moment that job starts.
- **Foreground fallback** (nothing else to do, single job): run `wait <id>` with its 100s default timeout and rerun it while it exits 2.
- **Match the permission context.** Run `wait`, `status`, `result`, and `cancel` in the same unsandboxed permission context as the corresponding job start. If collected from a different sandbox or permission context, the collector may not see the worker process and can falsely report a running job as crashed.

Exit codes (`wait`, `observe`, and `status <id>`): **0** = done — the result is already printed; **2** = still running — interpret the attached snapshot, then wait again, inspect more detail, or cancel as the task requires; **3** = error/crashed; **4** = canceled; **1** = generic companion error (e.g. unknown id).

Delivering an exit-0 result: a short report (about a screenful) → verbatim; a long report → the verdict/key points plus the result-file path (printed at job start), expanding sections on request. A `done_with_warnings` run (agy reported an error after producing a complete response) still exits 0 — the warning is on stderr / in the job log; mention it, deliver the response. If it was an implement job whose output says the working tree changed, also show `git diff`; if the task explicitly asked agy to commit or open a PR, report and verify agy's result instead of doing Git delivery yourself.

## Subcommands

- **wait `[job-id] [--timeout <dur>]`** — block until the job (default: the most recent one) reaches a terminal state, then print its result. Its own `--timeout` (default 100s, no upper limit) is independent of the job's; expiring is not a failure (exit 2 = run it again).
- **observe `[job-id]`** — immediately return the current running snapshot or existing terminal result/error report. Reads do not consume history or reset any deadline.
- **status `[job-id]`** — list jobs (render as a compact table) or show one job with a log tail; with an id it exits with the same codes as `wait`.
- **result `[job-id]`** — re-print the stored output of a finished job (default: the most recent finished one). Deliver per "Collecting results".
- **cancel `<job-id>`** — kill a running job and mark it canceled.
- **restart `<job-id>`** — explicitly create a linked new job from the stored original task/configuration with a fresh 60-minute budget. Inspect partial workspace changes first.
- **continue `--prompt "follow-up text"`** — send a follow-up to the most recent agy conversation in this repo (any mode; quota-friendly — agy serves prior context from cache). `--job <job-id>` is the preferred recovery target: it preserves the original mode/model/profile and links a new job, even if another job changed the last conversation. `--conversation <id>` targets a known older conversation; ids are tracked in `.agy-staff/state.json` and shown on the `[agy-staff]` stderr line. Execution style follows the resumed mode: a continued ask is foreground, everything else returns a job id.
- **setup `[--apply] [--restrict <modes|none>]`** — optional hardening for restricted runs. Read `references/setup.md` before running it.

## Rules

- Never paraphrase verdicts, numbers, or error text — quote them. Summarizing a long report is fine, but what you do quote must be verbatim.
- Report just the job id and stop only when the user explicitly said not to wait.
- If a `--restricted` run keeps returning empty responses even after setup, suggest dropping `--restricted` (the default) for that command.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, use its diagnostic and recovery information to decide the next step within the user’s authorization. Never retry or restart merely because a wait expired or no activity appeared.
- `operation not permitted` on `~/.gemini/...` or `bind: operation not permitted` means the companion ran inside a command sandbox, where agy cannot work. See `references/troubleshooting.md`; rerun unsandboxed instead of retrying as-is.
- If `wait`/`status`/`result` reports a job as crashed with no stored result, check whether the management command ran in a different permission or sandbox context from the job start. Rerun from the same unsandboxed context before treating the job as crashed.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Observation and recovery

The default running JSON snapshot contains timestamps, elapsed time, the latest five tool activities (bounded input/output excerpts), and the latest response text assembled from deltas. Tool states, incomplete text and truncation are explicit; activity is evidence, not proof of useful progress. Budgets after UTF-8 JSON serialization: 1 KiB per activity, 2 KiB for latest text, 8 KiB total. Final results retain their existing delivery contract. Follow `details` pointers with bounded reads/searches; never load a whole trajectory by default. Multiple observers see independent snapshots, with no shared cursor.

The worker explicitly gives AGY `--print-timeout 60m` and independently enforces its overall hard limit (default/max 60m; a launch `--timeout` may shorten it). Wait/observe never reset this budget. A hard timeout reports `reason=hard_timeout`, the last snapshot, known conversation ID, original mode/model/profile, retained logs and continuation/restart commands. Inspect `git status` and `git diff` before recovering partial work. Prefer `continue --job <id> --prompt "..."` when a conversation exists; otherwise use `restart <id>`. Recovery creates a linked job with a fresh budget; the old terminal record is preserved. The companion never relaunches automatically. Ask for more budget only when current user authorization requires it.

Successful jobs without warnings delete their intermediate raw stream and snapshot after results and metadata are durable. Failures, cancellation, hard timeout and completion with warnings retain them. Results, logs and conversation metadata remain available; AGY's own conversation storage is untouched. Older jobs without activity files still support state/result reads.

If the host has no background tool completion delivery, use shorter waits within its tool-call limit. A timer instruction or file write alone does not schedule a future model invocation. Interruption of a wait does not cancel its worker; `cancel <id>` explicitly stops execution belonging to the job.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
