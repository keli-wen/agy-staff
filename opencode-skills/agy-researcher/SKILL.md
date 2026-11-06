---
name: agy-researcher
description: Delegate a deep research or survey task to Google's Antigravity CLI (agy staffer, fast Gemini). Use when the user says /agy-researcher, "ask agy to research", "have the agy staffer survey X", or wants a second, independent deep-dive on a topic or codebase without spending the host model's quota.
---

<!-- Generated from skills/researcher/SKILL.md; run npm run generate:opencode. Do not edit here. -->

# agy researcher

Delegate a research task to the agy staffer via the shared companion script. You are a thin shell: build the command, run it, return agy's report verbatim.

<!-- BEGIN SHARED PERSONA RULES -->
<!-- Generated from templates/persona-skill-rules.md; run npm run generate:skills. Do not edit this block. -->
## Shared dispatch rules

### Continue or start fresh

- Before dispatching, decide whether this is a follow-up to prior AGY work in this chat. For the same task and persona, continue the existing session when its context helps, even when the user does not say "continue".
- Keep each returned job ID with its assignment in your chat context (background runs print `job id: <id>` on stdout; synchronous `ask` prints `job=<id>` on stderr; `status` lists all recorded jobs). Resume with `continue --job <id> --prompt-file <brief-path>` (or `--prompt` / `--stdin`); the job determines the persona and execution style. Never call bare `continue`, use removed `--continue` / `--conversation` flags, pass `--job` to a persona command, or pass a conversation ID as `--job`. If the target job is unclear, resolve it from the chat and known job records; ask only if it remains ambiguous.
- Start a fresh persona invocation for an unrelated task, an independent opinion, an explicit fresh start, or a different persona. Pass relevant findings and artifact paths in its brief rather than sharing the old session across roles.
- A continued worker knows its own history, but not the intervening host chat. Include new user decisions, constraints, and authorizations explicitly in the follow-up brief.
- These defaults cover normal follow-ups, not automatic timeout recovery. For a running, failed, canceled, or timed-out job, follow `../agy-jobs/SKILL.md` before acting. Do not automatically retry after a timeout.

### Task input and execution

- Pass the user's task and explicit authorizations through verbatim. Supply the task through exactly one of `--prompt`, `--prompt-file`, or `--stdin`; prefer file/stdin for long text. Continuing context does not expand authorization.
- Resolve the companion relative to this skill: `<skill-dir>/../../companion/agy-companion.mjs`. Run it **unsandboxed**: AGY needs a localhost port and its OAuth token file. In Codex, request escalated execution. Read `../agy-jobs/references/troubleshooting.md` for permission failures.
- Read `../agy-jobs/SKILL.md` for result collection and recovery. Preserve persona-specific delivery instructions and keep companion telemetry out of the user-facing result unless requested.
<!-- END SHARED PERSONA RULES -->

## Locating the companion

This skill file lives at `<plugin-root>/opencode-skills/agy-researcher/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" research [flags] --prompt "what to research"
```

## Collecting the result

The command returns a job id. Read `../agy-jobs/SKILL.md` for result collection and recovery: dispatch, wait for the final result, then validate as needed. Do not proactively observe progress, read logs or inspect intermediate artifacts while running. Observe only when the user explicitly asks for progress; diagnose a failure or a result requiring intervention under the jobs protocol.

## Flags (all optional)

- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.8-flash-high`.
- `--restricted` / `--unrestricted` — permission profile. research defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs the setup flow's evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts.
- `--timeout <dur>` — default 60m, maximum 120m hard execution limit.

## Rules

- Do not do the research yourself and do not re-verify agy's findings.
- Return the companion stdout verbatim. The `[agy-staff]` telemetry line goes to stderr (and into `jobs/<id>.log` for background runs) — it is metadata for you, the calling agent, not something to show the user.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.
- If a `--restricted` run reports an empty response due to denied permissions, relay the companion's guidance: run the setup flow once (see `../agy-jobs/references/setup.md`), or drop `--restricted`.
- For errors and recovery, follow `../agy-jobs/SKILL.md`.

For an existing session, `continue --job <id>` inherits the job's persona, recorded model, and permission profile unless explicitly overridden. The unrestricted defaults above apply to new tasks.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
