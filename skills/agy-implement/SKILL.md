---
name: agy-implement
description: Delegate a coding task to Google's Antigravity CLI (agy staffer, fast Gemini), which edits the working tree directly for later human review. Use when the user says /agy:implement, "have agy fix/build X", or wants to hand a well-scoped coding task to the agy staffer instead of doing it in Codex.
---

# agy implement

Hand a coding task to the agy staffer. agy edits the real working tree under its unrestricted permission profile; the safety net is git. You are a thin shell: run the companion, then surface the diff for the user's decision.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-implement/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" implement [flags] "task description"
```

> [!IMPORTANT]
> Run this command **unsandboxed**. agy cannot work inside the harness command sandbox: it binds a localhost port for its internal language server and reads its OAuth token file, which sandbox secret-protection hides — the run then dies with `operation not permitted` or a bogus "authentication failed". In Codex, request escalated permissions for the command (or have the user set the chat to full access).

(The shell call is gated by Codex's own approval and sandbox policy. Note the companion passes `--dangerously-skip-permissions` to agy in this mode — that is the unrestricted profile working as designed.)

## Before the first agy-staff call in a repo

agy-staff keeps its job state in `.agy-staff/` at the repo root. Make sure it is git-ignored so it never shows up in the user's `git status`:

```bash
git check-ignore -q .agy-staff || printf '.agy-staff/\n' >> .git/info/exclude
```

Use `.git/info/exclude` — never edit the repo's tracked `.gitignore` on the user's behalf.

## Preconditions and safety

- Inside a git repository the companion refuses to start unless `git status --porcelain` is clean. If it refuses, relay the message: commit or stash first. This keeps rollback trivial (`git checkout .` plus deleting new untracked files).
- Outside a git repository the companion warns that agy's edits cannot be reviewed or rolled back via git, and proceeds. Relay that warning; there is no diff to fall back on.
- After the run, the companion prints `git diff --stat` and an instruction to show the full diff. Follow it: show the user `git diff` and `git status --short`, ask whether to keep the changes, and never commit without an explicit request.

## Execution style

implement always runs as a background job: the call returns a job id immediately. The job never calls back — tracking it to the result is your job (see below).

## Delivering the result

The deliverable is agy's summary plus the diff, not the job id — starting the job does not finish the task. You own the delivery:

- Wait with the companion itself: `wait <id>`. One call blocks up to 100s and prints the result when the job finishes. Exit codes: 0 = done (result already printed), 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide whether the job is done.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (a Codex `unified_exec` session, Claude Code's background Bash) and pick it up on exit; otherwise run it in the foreground and repeat while it exits 2.
- When `wait` exits 0 it has printed agy's summary (deliver it verbatim if short; key points plus the result-file path if long) — then run the diff-and-confirm step above. On exit 3 (`error`/`crashed`), quote the stored error verbatim, add one line of diagnosis, and suggest the next step.
- Report just the job id and stop only when the user explicitly said not to wait.

## Flags (all optional)

- `--restricted` / `--unrestricted` — permission profile. implement defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it can then usually only propose rather than edit, it needs the setup flow's evidence-gathering allowlist to be useful, and some native agy tools ignore allow-rules headless.
- `--continue` (or `--conversation <id>`), `--model <id>` / `--effort low|medium|high` (default `gemini-3.7-flash-medium`), `--timeout <dur>` (default 10m).

## Rules

- Do not pre-implement, extend, or "clean up" agy's changes without user confirmation.
- Return agy's summary verbatim before presenting the diff.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
