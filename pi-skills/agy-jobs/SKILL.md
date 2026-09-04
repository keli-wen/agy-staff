---
name: agy-jobs
description: Manage agy staffer background jobs - collect results, check status, cancel, follow-up conversation, and setup. Use when an agy job needs collecting, when the user asks "is the agy job done", "show agy's result", "cancel the agy job", "continue the agy conversation", or "set up agy". This is the orchestrator's skill; the persona skills (staffer/researcher/reviewer/implementer) point here.
---

<!-- Generated from skills/jobs/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy jobs

Job management for the agy-staff plugin. All state is per-repository under `.agy-staff/` (created and git-ignored automatically on first use).

staffer, research, review, and implement always start a background job and return a job id immediately; only ask runs in the foreground. Background jobs never call back: the deliverable is agy's output, not the job id, and collecting it is your job, not the user's.

## Locating the companion

This skill file lives at `<plugin-root>/pi-skills/agy-jobs/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" <subcommand> [args]
```

## Collecting results

The job-start output prints the exact collect command — `wait <id> --timeout <n>m`, sized to outlive the job. That one call blocks until the job reaches a terminal state, prints the result, and exits with a machine-readable code. Never parse output to decide whether a job is done; branch on the exit code.

- **One job → one background wait.** Run the printed `wait` through your harness's background command facility (Claude Code's background Bash, a Codex `unified_exec` session), started as soon as the job starts, and pick it up when it exits. While it runs, heartbeat lines on stderr (`still waiting on <id>…`) show liveness.
- **N jobs → N background waits, never one shell.** Do not wait for several ids serially in a single shell (`wait a; wait b`, a for-loop): it hides each job's completion behind the slowest predecessor and gives you nothing to react to. Start every job's own background `wait` the moment that job starts.
- **Foreground fallback** (nothing else to do, single job): run `wait <id>` with its 100s default timeout and rerun it while it exits 2.
- **Match the permission context.** Run `wait`, `status`, `result`, and `cancel` in the same unsandboxed permission context as the corresponding job start. If collected from a different sandbox or permission context, the collector may not see the worker process and can falsely report a running job as crashed.

Exit codes (`wait`, and `status <id>`): **0** = done — the result is already printed; **2** = still running when the wait's own timeout expired — run the same `wait <id>` again; **3** = error/crashed; **4** = canceled; **1** = generic companion error (e.g. unknown id).

Delivering an exit-0 result: a short report (about a screenful) → verbatim; a long report → the verdict/key points plus the result-file path (printed at job start), expanding sections on request. A `done_with_warnings` run (agy reported an error after producing a complete response) still exits 0 — the warning is on stderr / in the job log; mention it, deliver the response. If it was an implement job whose output says the working tree changed, also show `git diff`; if the task explicitly asked agy to commit or open a PR, report and verify agy's result instead of doing Git delivery yourself.

## Subcommands

- **wait `[job-id] [--timeout <dur>]`** — block until the job (default: the most recent one) reaches a terminal state, then print its result. Its own `--timeout` (default 100s, no upper limit) is independent of the job's; expiring is not a failure (exit 2 = run it again).
- **status `[job-id]`** — list jobs (render as a compact table) or show one job with a log tail; with an id it exits with the same codes as `wait`.
- **result `[job-id]`** — re-print the stored output of a finished job (default: the most recent finished one). Deliver per "Collecting results".
- **cancel `<job-id>`** — kill a running job and mark it canceled.
- **continue `--prompt "follow-up text"`** — send a follow-up to the most recent agy conversation in this repo (any mode; quota-friendly — agy serves prior context from cache). `--conversation <id>` targets an older one; ids are tracked in `.agy-staff/state.json` and shown on the `[agy-staff]` stderr line. Execution style follows the resumed mode: a continued ask is foreground, everything else returns a job id.
- **setup `[--apply] [--restrict <modes|none>]`** — optional hardening for restricted runs. Read `references/setup.md` before running it.

## Rules

- Never paraphrase verdicts, numbers, or error text — quote them. Summarizing a long report is fine, but what you do quote must be verbatim.
- Report just the job id and stop only when the user explicitly said not to wait.
- If a `--restricted` run keeps returning empty responses even after setup, suggest dropping `--restricted` (the default) for that command.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- `operation not permitted` on `~/.gemini/...` or `bind: operation not permitted` means the companion ran inside a command sandbox, where agy cannot work. See `references/troubleshooting.md`; rerun unsandboxed instead of retrying as-is.
- If `wait`/`status`/`result` reports a job as crashed with no stored result, check whether the management command ran in a different permission or sandbox context from the job start. Rerun from the same unsandboxed context before treating the job as crashed.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
