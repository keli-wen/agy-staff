---
name: agy-research
description: Delegate a deep research or survey task to Google's Antigravity CLI (agy staffer, fast Gemini). Use when the user says /agy:research, "ask agy to research", "have the agy staffer survey X", or wants a second, independent deep-dive on a topic or codebase without spending Codex quota.
---

# agy research

Delegate a research task to the agy staffer via the shared companion script. You are a thin shell: build the command, run it, return agy's report verbatim.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-research/SKILL.md`; the companion is at `<plugin-root>/companion/agy-companion.mjs`. Resolve the absolute path relative to this skill directory before running:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" research [flags] "what to research"
```

> [!IMPORTANT]
> Run this command **unsandboxed**. agy cannot work inside the harness command sandbox: it binds a localhost port for its internal language server and reads its OAuth token file, which sandbox secret-protection hides — the run then dies with `operation not permitted` or a bogus "authentication failed". In Codex, request escalated permissions for the command (or have the user set the chat to full access).

(The shell call itself is gated by Codex's own approval and sandbox policy; the companion spawns the local `agy` binary and needs network access to Google's backend.)

## Before the first agy-staff call in a repo

agy-staff keeps its job state in `.agy-staff/` at the repo root. Make sure it is git-ignored so it never shows up in the user's `git status`:

```bash
git check-ignore -q .agy-staff || printf '.agy-staff/\n' >> .git/info/exclude
```

Use `.git/info/exclude` — never edit the repo's tracked `.gitignore` on the user's behalf.

## Execution style

research always runs as a background job: the call returns a job id immediately, and nothing streams back from agy in this turn. The job never calls back — tracking it to the result is your job (see below).

## Delivering the result

The deliverable is agy's report, not the job id — starting the job does not finish the task. You own the delivery:

- Wait with the companion itself: `wait <id>`. One call blocks up to 100s and prints the result when the job finishes. Exit codes: 0 = done (result already printed), 2 = still running — rerun the same `wait <id>`, 3 = error/crashed, 4 = canceled. Loop on the exit code; never parse the output to decide whether the job is done.
- If you have other work in flight, run `wait <id>` through your harness's background command facility (a Codex `unified_exec` session, Claude Code's background Bash) and pick it up on exit; otherwise run it in the foreground and repeat while it exits 2.
- When `wait` exits 0 the result is already printed. A short report (about a screenful) → deliver it verbatim. A long report → deliver the verdict/key points plus the result-file path (printed at job start) and expand sections on request, instead of pasting the whole file into the conversation. On exit 3 (`error`/`crashed`), quote the stored error verbatim, add one line of diagnosis, and suggest the next step.
- Report just the job id and stop only when the user explicitly said not to wait.

## Flags (all optional)

- `--continue` — reuse the last research conversation (quota-friendly, served largely from cache); `--conversation <id>` targets a specific one.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.7-flash-high`.
- `--restricted` / `--unrestricted` — permission profile. research defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs the setup flow's evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- `--timeout <dur>` — default 10m.

## Rules

- Do not do the research yourself and do not re-verify agy's findings.
- Return the companion stdout verbatim. The `[agy-staff]` telemetry line goes to stderr (and into `jobs/<id>.log` for background runs) — it is metadata for you, the calling agent, not something to show the user.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.
- If a `--restricted` run reports an empty response due to denied permissions, relay the companion's guidance: run the setup flow once (see the agy-jobs skill's setup section), or drop `--restricted`.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
