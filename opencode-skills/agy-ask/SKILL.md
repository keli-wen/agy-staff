---
name: agy-ask
description: Ask Google's Antigravity CLI (agy staffer, fast Gemini) a cheap one-shot question - the fast zero-tool mode and the post-install smoke test. Use when the user says /agy-ask, "ask agy", "quick second opinion from agy", or right after installing to verify the plugin works.
---

<!-- Generated from skills/ask/SKILL.md; run npm run generate:opencode. Do not edit here. -->

# agy ask

The quick mode: one question in, one answer out, ~2–3 seconds on the default `gemini-4-hydrogen-low`. Zero tools by design (restricted profile, question-only prompt), so it needs no setup and works on a fresh install — run it first as the smoke test: `ask --prompt "reply with OK"`.

ask is the only persona that runs in the foreground: the call blocks, records an `ask-...` job ID (emitted on stderr as `job=ask-...` and listed by `status`), and returns the answer on stdout. staffer, researcher, reviewer, and implementer instead return a background job id (see the jobs skill, `../agy-jobs/SKILL.md`).

<!-- BEGIN SHARED PERSONA RULES -->
<!-- Generated from templates/persona-skill-rules.md; run npm run generate:skills. Do not edit this block. -->
## Dispatch

- Continue a completed job with `continue --job <id> --prompt "..."` when the task and persona are the same and prior context helps, even if the user does not say "continue". Keep each job ID with its assignment; if the target is unclear, check known jobs before asking the user.
- Start fresh for a different task or persona, an independent opinion, or an explicit fresh start. Carry relevant findings and artifact paths into the new brief.
- Pass the user's task and explicit authorizations verbatim. On follow-up, add decisions and constraints from the host chat that the worker has not seen. Continuation does not expand authorization.
- Run the companion unsandboxed; in Codex, request escalated execution. Follow `../agy-jobs/SKILL.md` for collection and recovery. After an execution timeout, obtain explicit user confirmation before continuing or restarting.
<!-- END SHARED PERSONA RULES -->

## Locating the companion

This skill file lives at `<plugin-root>/opencode-skills/agy-ask/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" ask [flags] --prompt "question"
```

## Flags (all optional)

- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the question, from exactly one of these three sources. Use file/stdin for a long question.
- `--model <id>` or `--effort low|medium|high|xhigh` — default model is `gemini-4-hydrogen-low`; `--model` also accepts family aliases `hydrogen` (`gemini-4-hydrogen`), `carbon` (`gemini-4-carbon`), `argon` (`gemini-4-argon`), `flash` (`gemini-3.8-flash`), and `pro` (`gemini-3.1-pro`).
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
