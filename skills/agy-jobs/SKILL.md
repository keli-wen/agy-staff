---
name: agy-jobs
description: Manage agy staffer background jobs and setup - status, results, cancel, follow-up conversation, and installing the evidence-gathering allowlist for the restricted profile. Use when the user says /agy:status, /agy:result, /agy:cancel, /agy:continue, /agy:setup, "is the agy job done", "show agy's result", or "set up agy".
---

# agy jobs, follow-ups, and setup

Utility operations for the agy-staff plugin. All state is per-repository under `.agy-staff/`.

research, review, and implement always start a background job and return a job id immediately; only ask runs in the foreground. These subcommands are how you collect a background result: `wait` to block until it is done, `status` to peek, `result` to re-print, `cancel` to stop.

## Delivering the result

Background jobs never call back. The deliverable is agy's output, not the job id — starting the job does not finish the task, and waiting for it is your job, not the user's:

- Wait with the companion itself: `wait <id>`. One call blocks up to 100s and prints the result when the job finishes. Exit codes: 0 = done (result already printed), 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide whether the job is done.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (a Codex `unified_exec` session, Claude Code's background Bash) and pick it up on exit; otherwise run it in the foreground and repeat while it exits 2.
- When `wait` exits 0 the result is already printed. A short report (about a screenful) → deliver it verbatim. A long report → deliver the verdict/key points plus the result-file path (printed at job start) and expand sections on request, instead of pasting the whole file into the conversation. On exit 3 (`error`/`crashed`), quote the stored error verbatim, add one line of diagnosis, and suggest the next step.
- Report just the job id and stop only when the user explicitly said not to wait.

## Before the first agy-staff call in a repo

agy-staff keeps its job state in `.agy-staff/` at the repo root. Make sure it is git-ignored so it never shows up in the user's `git status`:

```bash
git check-ignore -q .agy-staff || printf '.agy-staff/\n' >> .git/info/exclude
```

Use `.git/info/exclude` — never edit the repo's tracked `.gitignore` on the user's behalf.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-jobs/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" <subcommand> [args]
```

## Subcommands

### wait `[job-id] [--timeout <dur>]`
Blocks until the job (default: the most recent one) reaches a terminal state, then prints its result — the preferred way to collect a background job. One call waits up to 100s (its own `--timeout`, independent of the job's); expiring is not a failure: exit code 2 means "still running — run the same `wait` again". Exit codes: 0 = done, 2 = running, 3 = error/crashed, 4 = canceled, 1 = generic error.

### status `[job-id]`
Lists background jobs (id, mode, status, timestamps) or shows one job with a log tail. Render the list as a compact table; show single-job output as-is. With a job id it exits with the same machine-readable codes as `wait` (0/2/3/4), so branch on the exit code instead of grepping the JSON.

### result `[job-id]`
Prints the stored output of a finished job (defaults to the most recent finished one). Deliver it per "Delivering the result" above (short → verbatim; long → key points + result-file path). If it was an implement job whose output says the working tree changed, also show `git diff` and ask the user whether to keep the changes.

### cancel `<job-id>`
Kills a running job's process and marks it canceled.

### continue `"follow-up text"`
Sends a follow-up message to the most recent agy conversation in this repo (any mode). Continuation is quota-friendly — agy serves prior context from cache. `--conversation <id>` targets an older conversation; the conversation id is tracked in `.agy-staff/state.json` automatically, and the `[agy-staff]` telemetry line on stderr also shows it. Execution style follows the resolved mode: a continued ask stays in the foreground, a continued research/review/implement returns a job id.

### setup `[--apply] [--restrict <modes|none>]`
Optional hardening, and the entry point for permission configuration. research, review, and implement default to unrestricted and need no setup; run this only when the user wants restricted runs — per call (`--restricted`) or by default in this repo. Without `--apply` the allowlist part is a dry run. Flow:
1. Run `setup` (dry run): it reports the current per-repo policy, the allowlist state, and exactly which rules would be written to which file (the file is backed up first).
2. Per-repo policy: if the user wants some modes to default to restricted in this repository, run `setup --restrict review,research` (their selection; `none` clears it). This writes `.agy-staff/config.json` — a per-repo, per-machine preference (normally git-ignored, not shared with the team); a `--restricted`/`--unrestricted` flag on a call still overrides it, and it is a run policy, not a security boundary.
3. Allowlist: only after the user confirms, run `setup --apply`.
4. Relay the notes: the allowlist is written to the GLOBAL agy settings file, so it applies to every project on this machine; rules are prefix-matched, so `command(git)` / `command(gh)` also match write commands such as `git push` or `gh pr merge` — it is an evidence-gathering allowlist, not a read-only one; agy's project-scoped settings path is undocumented and unverified, so only the global file is edited; and some agy tools ignore allow-rules headless, so even after setup a restricted run can come back empty.

## Rules

- Never paraphrase verdicts, numbers, or error text — quote them. Summarizing a long report is fine (per "Delivering the result"), but what you do quote must be verbatim.
- If a `--restricted` run keeps returning empty responses even after setup, suggest dropping `--restricted` (the default) for that command.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- `operation not permitted` on `~/.gemini/...` or `bind: operation not permitted` in the error means the companion ran inside the command sandbox, where agy cannot work (it needs a localhost port and its OAuth token file, which the sandbox hides). Rerun the command unsandboxed — escalated approval or workspace full access — instead of retrying as-is.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
