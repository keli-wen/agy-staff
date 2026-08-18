---
description: Delegate a deep research/survey task to agy (fast Gemini)
argument-hint: '[--continue] [--model <id>|--effort low|medium|high] [--restricted|--unrestricted] "what to research"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

Delegate a research task to the agy staffer through the shared companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command delegates research; you do not do the research yourself.
- Return agy's report to the user verbatim. Do not paraphrase, trim, or re-verify it.

Permission profile:
- research defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs `/agy:setup`'s evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.

Before the first agy-staff call in this repository:
- agy-staff keeps job state in `.agy-staff/` at the repo root. Make sure it is git-ignored so it never pollutes the user's `git status`: run `git check-ignore -q .agy-staff`; if that fails, append `.agy-staff/` to `.git/info/exclude`. Never edit the repo's tracked `.gitignore` for this.

Execution mode:
- research always runs as a background job. The companion returns a job id immediately; there is no flag to make it wait. The job never calls back — tracking it to the result is your job.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" research "$ARGUMENTS"
```

Delivering the result:
- The deliverable is agy's report, not the job id — starting the job does not finish the task. You own the delivery. Print the command stdout verbatim first (the job id).
- Wait with the companion itself: `node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" wait <id>`. One call blocks up to 100s and prints the result when the job finishes. Exit codes: 0 = done (result already printed), 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide whether the job is done.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (Claude Code's background Bash, a Codex `unified_exec` session) and pick it up on exit; otherwise run it in the foreground and repeat while it exits 2.
- When `wait` exits 0 the result is already printed. A short report (about a screenful) → deliver it verbatim. A long report → deliver the verdict/key points plus the result-file path (printed at job start) and expand sections on request, instead of pasting the whole file into the conversation. On exit 3 (`error`/`crashed`), quote the stored error verbatim, add one line of diagnosis, and suggest the next step. `/agy:cancel <id>` stops a job the user no longer wants; `status <id>` shows a log tail mid-run.
- Report just the job id and stop only when the user explicitly said not to wait.

Failure handling:
- If a `--restricted` run reports an empty response caused by denied permissions, relay the companion's guidance: run `/agy:setup` once, or drop `--restricted`.
- Follow-ups in the same investigation: rerun this command with `--continue`, or use `/agy:continue <text>`.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
