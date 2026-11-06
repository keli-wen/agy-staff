---
name: implementer
description: Delegate a coding task to Google's Antigravity CLI (agy staffer, fast Gemini), which edits the working tree directly and can perform explicitly requested Git delivery. Use when the user says /agy:implementer, "have agy fix/build X", or wants to hand a well-scoped coding task to the agy staffer instead of doing it in the host model.
argument-hint: '[--restricted|--unrestricted] [--model <id>|--effort low|medium|high] [--prompt-file <path>|--stdin] "task description"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

# agy implementer

Hand a coding task to the agy staffer. agy edits the real working tree under its unrestricted permission profile; the companion is a thin launcher and job collector. Pass the user's requested delivery through in the task text instead of doing Git work yourself.

<!-- BEGIN SHARED PERSONA RULES -->
<!-- Generated from templates/persona-skill-rules.md; run npm run generate:skills. Do not edit this block. -->
## Shared dispatch rules

### Continue or start fresh

- Before dispatching, decide whether this is a follow-up to prior AGY work in this chat. For the same task and persona, continue the existing session when its context helps, even when the user does not say "continue".
- Keep each returned job ID with its assignment in your chat context (background runs print `job id: <id>` on stdout; synchronous `ask` prints `job=<id>` on stderr; `status` lists all recorded jobs). Resume with `continue --job <id> --prompt-file <brief-path>` (or `--prompt` / `--stdin`); the job determines the persona and execution style. Never call bare `continue`, use removed `--continue` / `--conversation` flags, pass `--job` to a persona command, or pass a conversation ID as `--job`. If the target job is unclear, resolve it from the chat and known job records; ask only if it remains ambiguous.
- Start a fresh persona invocation for an unrelated task, an independent opinion, an explicit fresh start, or a different persona. Pass relevant findings and artifact paths in its brief rather than sharing the old session across roles.
- A continued worker knows its own history, but not the intervening host chat. Include new user decisions, constraints, and authorizations explicitly in the follow-up brief.
- These defaults cover normal follow-ups, not automatic timeout recovery. For a running, failed, canceled, or timed-out job, follow `../jobs/SKILL.md` before acting. Do not automatically retry after a timeout.

### Task input and execution

- Pass the user's task and explicit authorizations through verbatim. Supply the task through exactly one of `--prompt`, `--prompt-file`, or `--stdin`; prefer file/stdin for long text. Continuing context does not expand authorization.
- Resolve the companion relative to this skill: `<skill-dir>/../../companion/agy-companion.mjs`. Run it **unsandboxed**: AGY needs a localhost port and its OAuth token file. In Codex, request escalated execution. Read `../jobs/references/troubleshooting.md` for permission failures.
- Read `../jobs/SKILL.md` for result collection and recovery. Preserve persona-specific delivery instructions and keep companion telemetry out of the user-facing result unless requested.
<!-- END SHARED PERSONA RULES -->

## Locating the companion

This skill file lives at `<plugin-root>/skills/implementer/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" implement [flags] --prompt "task description"
```

## Workspace and delivery

- Inside a git repository, dirty workspaces are allowed. When `git status --porcelain` is not clean, the companion injects a bounded pre-run status summary into the implement prompt so agy treats those paths as user-owned context.
- Outside a git repository the companion warns that agy's edits cannot be reviewed or rolled back via git, and proceeds. Relay that warning; there is no diff to fall back on.
- By default, agy leaves a working-tree diff. If the user explicitly asks for a commit, push, or PR, include that request verbatim in the task text and let agy do that exact Git delivery.
- After the run, surface agy's summary and the current workspace state. Do not add your own commit/PR step unless the user separately asks you to do it.

## Collecting the result

The command returns a job id. Read `../jobs/SKILL.md` for result collection and recovery: dispatch, wait for the final result, then validate as needed. Do not proactively observe progress, read logs or inspect intermediate artifacts while running. Observe only when the user explicitly asks for progress; diagnose a failure or a result requiring intervention under the jobs protocol.

## Flags (all optional)

- `--restricted` / `--unrestricted` — permission profile. implement defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy may then only use allowlisted tools, so it can usually only propose rather than edit, and it needs the setup flow's evidence-gathering allowlist to be useful.
- `--model <id>` / `--effort low|medium|high` (default `gemini-3.8-flash-high`), `--timeout <dur>` (default 60m, maximum 120m hard execution limit).
- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts.

## Rules

- Do not pre-implement, extend, or "clean up" agy's changes without user confirmation.
- Return agy's summary verbatim before presenting the diff.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects; that default opens only when the request itself asks for the operation — so keep "open a draft PR", "run the e2e tests", or "call the staging API" in the prompt instead of trimming it.
- Never commit agy's changes yourself unless the user explicitly asks you, the host agent, to do it.
- For errors and recovery, follow `../jobs/SKILL.md`.

For an existing session, `continue --job <id>` inherits the job's persona, recorded model, and permission profile unless explicitly overridden. The unrestricted defaults above apply to new tasks.
