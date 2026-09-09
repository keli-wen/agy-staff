---
name: agy-ask
description: Run a tool-free smoke test of Google's Antigravity CLI after installation, or an explicit test via /skill:agy-ask. Use to verify that the plugin and model respond. Ordinary delegated work uses staffer or a specialist.
---

<!-- Generated from skills/ask/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy ask

The installation smoke-test mode: one test prompt in, one response out on the default `gemini-3.8-flash-low`. Zero tools by design (restricted profile, question-only prompt), so it needs no setup and works on a fresh install: `ask --prompt "reply with OK"`. Reserve this mode for smoke tests or explicit testing; use staffer or a specialist for ordinary work.

ask is the only persona that runs in the foreground: the call blocks and the answer comes back on stdout. staffer, researcher, reviewer, and implementer instead return a background job id (see the jobs skill, `../agy-jobs/SKILL.md`).

## Locating the companion

This skill file lives at `<plugin-root>/pi-skills/agy-ask/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" ask [flags] --prompt "question"
```

Pass the user's question verbatim via `--prompt`; use `--prompt-file <path>` or `--stdin` for a long question.

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../agy-jobs/references/troubleshooting.md`.

## Flags (all optional)

- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the question, from exactly one of these three sources. Use file/stdin for a long question.
- `--continue` — reuse the last ask conversation; `--conversation <id>` targets a specific one.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.8-flash-low`.
- `--timeout <dur>` — default 2m.

ask is always restricted (it is tool-free, so there is nothing to unrestrict); `--unrestricted` is ignored with a note on stderr. That is fixed for ask alone — the tool-using personas default to unrestricted, where `--restricted` is an opt-in hardening flag. Execution style is likewise fixed per mode and no flag changes it.

## Rules

- Pass the user's question through verbatim and return the answer verbatim. The `[agy-staff]` telemetry line arrives on stderr and is metadata for you, the calling agent — do not show it to the user; mention the follow-up ability in natural language when relevant, and give model/duration/token numbers only if asked.
- If the answer says "not sure", relay it as-is; do not silently substitute your own answer.
- Exit 5 means a resumable response timeout: explain it and ask whether the user wants to continue with the suggested timeout or stop. Continue only after explicit user confirmation, using the recorded conversation and configuration. For other companion errors, quote the error and add a concise diagnosis. Full failure protocol: `../agy-jobs/SKILL.md`.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
