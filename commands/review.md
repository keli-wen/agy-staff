---
description: Get a second-opinion code review from agy (fast Gemini)
argument-hint: '[--restricted|--unrestricted] [--json] [--model <id>|--effort low|medium|high] "what to review"'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

Run an agy review through the shared companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only. Do not fix issues, apply patches, or announce that you will make changes.
- Your only job is to pass the request through, run the review, and return agy's output verbatim.

The review subject is the prompt:
- review is prompt-based. Pass the user's natural-language request through as the task string, unchanged. Do not inspect the repo, assemble diffs, write patch files, or translate the request into flags.
- agy identifies the subject from the prompt and gathers the evidence itself: `gh pr view`/`gh pr diff` for PRs, `git diff`/`git log` for refs and the working tree, reading files for patches. review runs unrestricted by default, so this works with no setup.
- If the subject is ambiguous, agy reports the ambiguity instead of guessing. Relay that report and let the user sharpen the request; do not guess a subject on agy's behalf.
- Canonical invocations:
  - `/agy:review Review PR #730`
  - `/agy:review Review the current working tree`
  - `/agy:review Review changes against master`
  - `/agy:review Review the patch at /tmp/change.patch`
- A subject description is required; review with an empty task string exits with an error.

Before the first agy-staff call in this repository:
- agy-staff keeps job state in `.agy-staff/` at the repo root. Make sure it is git-ignored so it never pollutes the user's `git status`: run `git check-ignore -q .agy-staff`; if that fails, append `.agy-staff/` to `.git/info/exclude`. Never edit the repo's tracked `.gitignore` for this.

Permission profile:
- review defaults to unrestricted, so it works out of the box with no setup and can run tests or reproduce a bug when the request asks for it. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs `/agy:setup`'s evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- Untrusted content: an unrestricted review of code from an untrusted author (a PR from a stranger, a patch from an unknown source) means prompt injection in that content could run arbitrary commands. For those reviews, consider `--restricted` (it may fail closed) or an isolated checkout.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.

Execution mode:
- review always runs as a background job. The companion returns a job id immediately; there is no flag to make it wait. The job never calls back — tracking it to the result is your job.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" review "$ARGUMENTS"
```

Delivering the result:
- The deliverable is agy's review, not the job id — starting the job does not finish the task. You own the delivery. Print the command stdout verbatim first, exactly as-is, including the job id; no commentary, and do not fix anything it mentions.
- Wait with the companion itself: `node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" wait <id>`. One call blocks up to 100s and prints the result when the job finishes. Exit codes: 0 = done (result already printed), 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide whether the job is done.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (Claude Code's background Bash, a Codex `unified_exec` session) and pick it up on exit; otherwise run it in the foreground and repeat while it exits 2.
- When `wait` exits 0 the result is already printed. A short report (about a screenful) → deliver it verbatim. A long report → deliver the verdict/key points plus the result-file path (printed at job start) and expand sections on request, instead of pasting the whole file into the conversation. On exit 3 (`error`/`crashed`), quote the stored error verbatim, add one line of diagnosis, and suggest the next step. `/agy:cancel <id>` stops a job the user no longer wants; `status <id>` shows a log tail mid-run.
- Report just the job id and stop only when the user explicitly said not to wait.

Failure handling:
- Empty responses from a `--restricted` run: relay the companion's guidance (run `/agy:setup` once, or drop `--restricted`).
- `--json` returns schema-enforced findings instead of markdown; use it only when the user asks for machine-readable output.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
