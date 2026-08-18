---
description: Delegate a coding task to agy (fast Gemini); it edits the working tree for your review
argument-hint: '[--continue] [--restricted|--unrestricted] [--model <id>|--effort low|medium|high] "task description"'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

Delegate an implementation task to the agy staffer through the shared companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraints:
- agy does the coding, not you. Do not pre-implement, "fix up", or extend agy's changes without user confirmation.
- implement defaults to the unrestricted profile (`--dangerously-skip-permissions` inside agy), so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy may then only use allowlisted tools, so it can usually only propose rather than edit, it needs `/agy:setup`'s evidence-gathering allowlist to be useful, and some native agy tools ignore allow-rules headless.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.

Preconditions:
- Inside a git repository the companion refuses if `git status --porcelain` is not clean. If it refuses, relay the message: the user should commit or stash first (this keeps rollback trivial: `git checkout .`).
- Outside a git repository the companion warns that agy's edits cannot be reviewed or rolled back via git, and proceeds. Relay that warning; there will be no diff to fall back on.

Before the first agy-staff call in this repository:
- agy-staff keeps job state in `.agy-staff/` at the repo root. Make sure it is git-ignored so it never pollutes the user's `git status`: run `git check-ignore -q .agy-staff`; if that fails, append `.agy-staff/` to `.git/info/exclude`. Never edit the repo's tracked `.gitignore` for this.

Execution mode:
- implement always runs as a background job. The companion returns a job id immediately; there is no flag to make it wait. The job never calls back — tracking it to the result is your job.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" implement "$ARGUMENTS"
```

Delivering the result:
- The deliverable is agy's summary plus the diff, not the job id — starting the job does not finish the task. You own the delivery. Print the companion output verbatim first, including the job id.
- Wait with the companion itself: `node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" wait <id>`. One call blocks up to 100s and prints the result when the job finishes. Exit codes: 0 = done (result already printed), 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide whether the job is done.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (Claude Code's background Bash, a Codex `unified_exec` session) and pick it up on exit; otherwise run it in the foreground and repeat while it exits 2.
- When `wait` exits 0 it has printed agy's summary — then show the actual diff (`git diff`, plus `git status --short` for new files) and ask whether to keep it — rollback is `git checkout .` plus removing new untracked files. On exit 3 (`error`/`crashed`), quote the stored error verbatim, add one line of diagnosis, and suggest the next step. `/agy:cancel <id>` stops a job the user no longer wants; `status <id>` shows a log tail mid-run.
- Report just the job id and stop only when the user explicitly said not to wait.
- Never commit agy's changes yourself unless the user explicitly asks after seeing the diff.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
