---
name: agy-review
description: Get a second-opinion code review from Google's Antigravity CLI (agy staffer, fast Gemini). Use when the user says /agy:review, "have agy review this", "second opinion on my diff/PR", or after finishing a feature and wanting an independent verifier that does not share Codex's blind spots.
---

# agy review

Run a severity-ranked review through the agy staffer. You are a thin shell: pass the user's request through as the prompt, run the companion, return agy's review verbatim. Never fix the issues it finds.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-review/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" review [flags] "what to review"
```

> [!IMPORTANT]
> Run this command **unsandboxed**. agy cannot work inside the harness command sandbox: it binds a localhost port for its internal language server and reads its OAuth token file, which sandbox secret-protection hides — the run then dies with `operation not permitted` or a bogus "authentication failed". In Codex, request escalated permissions for the command (or have the user set the chat to full access).

(The shell call is gated by Codex's own approval and sandbox policy.)

## Before the first agy-staff call in a repo

agy-staff keeps its job state in `.agy-staff/` at the repo root. Make sure it is git-ignored so it never shows up in the user's `git status`:

```bash
git check-ignore -q .agy-staff || printf '.agy-staff/\n' >> .git/info/exclude
```

Use `.git/info/exclude` — never edit the repo's tracked `.gitignore` on the user's behalf.

## The review subject is the prompt

review is prompt-based. Pass the user's natural-language request straight through as the task string — do not gather diffs, write patch files, or translate the request into flags. agy identifies the subject from the prompt and collects the evidence itself (`gh pr view`/`gh pr diff` for PRs, `git diff`/`git log` for refs and the working tree, reading files for patches). If the subject is ambiguous, agy reports the ambiguity instead of guessing — relay that and let the user sharpen the request.

Canonical invocations:

```bash
review "Review PR #730"
review "Review the current working tree"
review "Review changes against master"
review "Review the patch at /tmp/change.patch"
```

A task string is required; review with no subject description exits with an error.

## Execution style

review always runs as a background job: the call returns a job id immediately. The job never calls back — tracking it to the result is your job (see below).

## Delivering the result

The deliverable is agy's review, not the job id — starting the job does not finish the task. You own the delivery:

- Wait with the companion itself: `wait <id>`. One call blocks up to 100s and prints the result when the job finishes. Exit codes: 0 = done (result already printed), 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide whether the job is done.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (a Codex `unified_exec` session, Claude Code's background Bash) and pick it up on exit; otherwise run it in the foreground and repeat while it exits 2.
- When `wait` exits 0 the result is already printed. A short report (about a screenful) → deliver it verbatim. A long report → deliver the verdict/key points plus the result-file path (printed at job start) and expand sections on request, instead of pasting the whole file into the conversation. On exit 3 (`error`/`crashed`), quote the stored error verbatim, add one line of diagnosis, and suggest the next step.
- Report just the job id and stop only when the user explicitly said not to wait.

## Flags (all optional)

- `--json` — schema-enforced JSON findings instead of free-form markdown (opt-in only).
- `--restricted` / `--unrestricted` — permission profile. review defaults to unrestricted, so it works out of the box with no setup and can run tests or reproduce a bug when the request asks for it. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs the setup flow's evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- `--model <id>` / `--effort low|medium|high` (default `gemini-3.7-flash-medium`), `--continue` (or `--conversation <id>`), `--timeout <dur>` (default 5m).

## Reviewing untrusted content

An unrestricted review of code from an untrusted author (a PR from a stranger, a patch from an unknown source) means prompt injection in that content could run arbitrary commands. For those reviews, consider `--restricted` (it may fail closed, and some native tools ignore allow-rules) or run the review in an isolated checkout.

## Rules

- Return the companion stdout verbatim — no commentary, no fixes, no softening of findings.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.
- Empty responses from a `--restricted` run: relay the companion's guidance (run the setup flow once, or drop `--restricted`).

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
