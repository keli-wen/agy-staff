---
name: staffer
description: Delegate a general-purpose task to Google's Antigravity CLI (agy staffer, fast Gemini) with a minimal, unopinionated prompt. Use when the user says /agy:staffer, "have agy do/handle X", "have agy generate an image", or the task fits none of the specialist personas (researcher / reviewer / implementer / ask) — the template adds no role or output format, only the shared working rules and guardrails, so the task text shapes the output. Also the route to agy-native tools no specialist covers, notably image generation (generate_image).
argument-hint: '[--restricted|--unrestricted] [--model <id>|--effort low|medium|high] [--timeout <dur>] [--prompt-file <path>|--stdin] "task"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

# agy staffer

The general-purpose persona: a clean entry point for tasks that none of the specialists fit. Its prompt template is deliberately minimal — the task text, the environment (cwd, branch, date), the shared working rules, and the safety guardrails, nothing else. No role framing or fixed body format: the task defines its own deliverable, and no domain-specific template context can pull the run off course.

Prefer a specialist when one fits: `researcher` for surveys and deep dives, `reviewer` for second opinions on code or plans, `implementer` for edits to the working tree, `ask` for a cheap one-shot question.

staffer is also the route to agy-native tools no specialist covers — notably **image generation**: agy ships a `generate_image` tool (verified on v1.1.15; a 1024×1024 PNG in ~30s). Name the output path in the task, e.g. `staffer --prompt "generate a pixel-art robot mascot, save it as assets/mascot.png"`.

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

This skill file lives at `<plugin-root>/skills/staffer/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" staffer [flags] --prompt "task"
```

## Collecting the result

The command returns a job id. Read `../jobs/SKILL.md` for result collection and recovery: dispatch, wait for the final result, then validate as needed. Do not proactively observe progress, read logs or inspect intermediate artifacts while running. Observe only when the user explicitly asks for progress; diagnose a failure or a result requiring intervention under the jobs protocol.

## Flags (all optional)

- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts instead of shell quoting.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.8-flash-medium`.
- `--restricted` / `--unrestricted` — permission profile; staffer defaults to unrestricted like the other tool-using personas, `--restricted` is the opt-in hardening path.
- `--timeout <dur>` — default 60m, maximum 120m hard execution limit.

## Rules

- Pass the user's task through verbatim. Because the template imposes no output format, state the desired format in the task text when the caller needs a specific one.
- Pass the user's explicit authorizations through verbatim. The template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, paid-quota commands); that default opens only when the task itself asks for the operation.
- A general task may legitimately edit files. The companion reports any working-tree delta with the result — inspect it (`git diff`) and confirm it is what the task asked for before building on it.
- For errors and recovery, follow `../jobs/SKILL.md`.

For an existing session, `continue --job <id>` inherits the job's persona, recorded model, and permission profile unless explicitly overridden. The unrestricted defaults above apply to new tasks.
