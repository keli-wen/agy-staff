---
name: agy-researcher
description: Delegate a deep research or survey task to Google's Antigravity CLI (agy staffer, fast Gemini). Use when the user says /skill:agy-researcher, "ask agy to research", "have the agy staffer survey X", or wants a second, independent deep-dive on a topic or codebase without spending the host model's quota.
---

<!-- Generated from skills/researcher/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy researcher

Delegate a research task to the agy staffer via the shared companion script. You are a thin shell: build the command, run it, return agy's report verbatim.

## Locating the companion

This skill file lives at `<plugin-root>/pi-skills/agy-researcher/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" research [flags] --prompt "what to research"
```

Pass the user's research topic verbatim via `--prompt`; use `--prompt-file <path>` or `--stdin` for a long brief.

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../agy-jobs/references/troubleshooting.md`.

## Execution style

research always runs as a background job: the call returns a job id immediately, and nothing streams back from agy in this turn. The job never calls back — collecting the result is your job.

## Collecting the result

The job-start output prints the exact collect command (`` `wait <id> --timeout <n>m` ``). Run it as a background command — one background wait per job, in the same unsandboxed permission context as the start command — and deliver the printed report when it exits 0: a short report (about a screenful) verbatim; a long report as the key points plus the result-file path, expanding sections on request. Everything else about job management is in the jobs skill: `../agy-jobs/SKILL.md`.

## Flags (all optional)

- `--continue` — reuse the last research conversation (quota-friendly, served largely from cache); `--conversation <id>` targets a specific one.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.8-flash-high`.
- `--restricted` / `--unrestricted` — permission profile. research defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs the setup flow's evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts.
- `--timeout <dur>` — default 10m.

## Rules

- Do not do the research yourself and do not re-verify agy's findings.
- Return the companion stdout verbatim. The `[agy-staff]` telemetry line goes to stderr (and into `jobs/<id>.log` for background runs) — it is metadata for you, the calling agent, not something to show the user.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.
- If a `--restricted` run reports an empty response due to denied permissions, relay the companion's guidance: run the setup flow once (see `../agy-jobs/references/setup.md`), or drop `--restricted`.
- On any companion error: quote it verbatim, add one line of your own diagnosis, stop. Full failure protocol: `../agy-jobs/SKILL.md`.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
