---
name: implementer
description: Delegate a coding task to Google's Antigravity CLI (agy staffer, fast Gemini), which edits the working tree directly and can perform explicitly requested Git delivery. Use when the user says /agy:implementer, "have agy fix/build X", or wants to hand a well-scoped coding task to the agy staffer instead of doing it in the host model.
argument-hint: '[--continue] [--restricted|--unrestricted] [--model <id>|--effort low|medium|high] [--prompt-file <path>|--stdin] "task description"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

# agy implementer

Hand a coding task to the agy staffer. agy edits the real working tree under its unrestricted permission profile; the companion is a thin launcher and job collector. Pass the user's requested delivery through in the task text instead of doing Git work yourself.

## Locating the companion

This skill file lives at `<plugin-root>/skills/implementer/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" implement [flags] "task description"
```

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../jobs/references/troubleshooting.md`. (The companion passes `--dangerously-skip-permissions` to agy in this mode — that is the unrestricted profile working as designed.)

## Workspace and delivery

- Inside a git repository, dirty workspaces are allowed. When `git status --porcelain` is not clean, the companion injects a bounded pre-run status summary into the implement prompt so agy treats those paths as user-owned context.
- Outside a git repository the companion warns that agy's edits cannot be reviewed or rolled back via git, and proceeds. Relay that warning; there is no diff to fall back on.
- By default, agy leaves a working-tree diff. If the user explicitly asks for a commit, push, or PR, include that request verbatim in the task text and let agy do that exact Git delivery.
- After the run, surface agy's summary and the current workspace state. Do not add your own commit/PR step unless the user separately asks you to do it.

## Execution style

implement always runs as a background job: the call returns a job id immediately. The job never calls back — collecting the result is your job.

## Collecting the result

The job-start output prints the exact collect command (`` `wait <id> --timeout <n>m` ``). Run it as a background command — one background wait per job. When it exits 0 it has printed agy's summary: deliver it (verbatim if short; key points plus the result-file path if long), then report the current workspace state. Everything else about job management is in the jobs skill: `../jobs/SKILL.md`.

## Flags (all optional)

- `--restricted` / `--unrestricted` — permission profile. implement defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy may then only use allowlisted tools, so it can usually only propose rather than edit, and it needs the setup flow's evidence-gathering allowlist to be useful.
- `--continue` (or `--conversation <id>`), `--model <id>` / `--effort low|medium|high` (default `gemini-3.7-flash-high`), `--timeout <dur>` (default 10m).
- `--prompt-file <path>` / `--stdin` — task text from a file or stdin (long prompts).

## Rules

- Do not pre-implement, extend, or "clean up" agy's changes without user confirmation.
- Return agy's summary verbatim before presenting the diff.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects; that default opens only when the request itself asks for the operation — so keep "open a draft PR", "run the e2e tests", or "call the staging API" in the prompt instead of trimming it.
- Never commit agy's changes yourself unless the user explicitly asks you, the host agent, to do it.
- On any companion error: quote it verbatim, add one line of your own diagnosis, stop. Full failure protocol: `../jobs/SKILL.md`.
