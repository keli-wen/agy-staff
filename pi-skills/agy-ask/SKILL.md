---
name: agy-ask
description: Ask Google's Antigravity CLI (agy staffer, fast Gemini) a cheap one-shot question - the fast zero-tool mode and the post-install smoke test. Use when the user says /skill:agy-ask, "ask agy", "quick second opinion from agy", or right after installing to verify the plugin works.
---

<!-- Generated from skills/ask/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy ask

The quick mode: one question in, one answer out, ~3 seconds on the default `gemini-3.8-flash-low`. Zero tools by design (restricted profile, question-only prompt), so it needs no setup and works on a fresh install — run it first as the smoke test: `ask --prompt "reply with OK"`.

ask is the only persona that runs in the foreground: the call blocks, records an `ask-...` job ID (emitted on stderr as `job=ask-...` and listed by `status`), and returns the answer on stdout. staffer, researcher, reviewer, and implementer instead return a background job id (see the jobs skill, `../agy-jobs/SKILL.md`).

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

This skill file lives at `<plugin-root>/pi-skills/agy-ask/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" ask [flags] --prompt "question"
```

## Flags (all optional)

- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the question, from exactly one of these three sources. Use file/stdin for a long question.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.8-flash-low`.
- `--timeout <dur>` — default 2m.

For a follow-up to an earlier `ask` run, use `continue --job <id> --prompt "question"` with the `ask-...` job ID recorded on stderr (or listed by `status`). A continued `ask` job stays synchronous in the foreground.

ask is always restricted (it is tool-free, so there is nothing to unrestrict); `--unrestricted` is ignored with a note on stderr. That is fixed for ask alone — the tool-using personas default to unrestricted, where `--restricted` is an opt-in hardening flag. Execution style is likewise fixed per mode and no flag changes it.

## Rules

- Pass the user's question through verbatim and return the answer verbatim. The `[agy-staff]` telemetry line arrives on stderr and is metadata for you, the calling agent — do not show it to the user; mention the follow-up ability in natural language when relevant, and give model/duration/token numbers only if asked.
- If the answer says "not sure", relay it as-is; do not silently substitute your own answer.
- Exit 5 means a resumable response timeout: explain it and ask whether the user wants to continue with the suggested timeout or stop. Continue only after explicit user confirmation, using `continue --job <id> --timeout <dur>` with the recorded `ask-...` job ID. For other companion errors, quote the error and add a concise diagnosis. Full failure protocol: `../agy-jobs/SKILL.md`.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
