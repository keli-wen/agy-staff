---
name: researcher
description: Delegate a deep research or survey task to Google's Antigravity CLI (agy staffer, fast Gemini). Use when the user says /agy:researcher, "ask agy to research", "have the agy staffer survey X", or wants a second, independent deep-dive on a topic or codebase without spending the host model's quota.
argument-hint: '[--model <id>|--effort low|medium|high|xhigh] [--restricted|--unrestricted] [--prompt-file <path>|--stdin] "what to research"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

# agy researcher

Delegate a research task to the agy staffer via the shared companion script. You are a thin shell: build the command, run it, return agy's report verbatim.

<!-- BEGIN SHARED PERSONA RULES -->
<!-- Generated from templates/persona-skill-rules.md; run npm run generate:skills. Do not edit this block. -->
## Dispatch

- Continue a completed job with `continue --job <id> --prompt "..."` when the task and persona are the same and prior context helps, even if the user does not say "continue". Keep each job ID with its assignment; if the target is unclear, check known jobs before asking the user.
- Start fresh for a different task or persona, an independent opinion, or an explicit fresh start. Carry relevant findings and artifact paths into the new brief.
- Pass the user's task and explicit authorizations verbatim. On follow-up, add decisions and constraints from the host chat that the worker has not seen. Continuation does not expand authorization.
- Run the companion unsandboxed; in Codex, request escalated execution. Follow `../jobs/SKILL.md` for collection and recovery. After an execution timeout, obtain explicit user confirmation before continuing or restarting.
<!-- END SHARED PERSONA RULES -->

## Locating the companion

This skill file lives at `<plugin-root>/skills/researcher/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" research [flags] --prompt "what to research"
```

## Collecting the result

The command returns a job id. Read `../jobs/SKILL.md` for result collection and recovery: dispatch, wait for the final result, then validate as needed. Do not proactively observe progress, read logs or inspect intermediate artifacts while running. Observe only when the user explicitly asks for progress; diagnose a failure or a result requiring intervention under the jobs protocol.

## Flags (all optional)

- `--model <id>` or `--effort low|medium|high|xhigh` — default model is `gemini-4-hydrogen-high`; `--model` also accepts family aliases `hydrogen` (`gemini-4-hydrogen`), `carbon` (`gemini-4-carbon`), `argon` (`gemini-4-argon`), `flash` (`gemini-3.8-flash`), and `pro` (`gemini-3.1-pro`).
- `--restricted` / `--unrestricted` — permission profile. research defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs the setup flow's evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts.
- `--timeout <dur>` — default 60m, maximum 120m hard execution limit.

## Rules

- Do not do the research yourself and do not re-verify agy's findings.
- Return the companion stdout verbatim. The `[agy-staff]` telemetry line goes to stderr (and into `jobs/<id>.log` for background runs) — it is metadata for you, the calling agent, not something to show the user.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.
- If a `--restricted` run reports an empty response due to denied permissions, relay the companion's guidance: run the setup flow once (see `../jobs/references/setup.md`), or drop `--restricted`.
- For errors and recovery, follow `../jobs/SKILL.md`.

For an existing session, `continue --job <id>` inherits the job's persona, recorded model, and permission profile unless explicitly overridden. The unrestricted defaults above apply to new tasks.
