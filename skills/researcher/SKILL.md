---
name: researcher
description: Delegate a deep research or survey task to Google's Antigravity CLI (agy staffer, fast Gemini). Use when the user says /agy:researcher, "ask agy to research", "have the agy staffer survey X", or wants a second, independent deep-dive on a topic or codebase without spending the host model's quota.
argument-hint: '[--continue] [--model <id>|--effort low|medium|high] [--restricted|--unrestricted] [--prompt-file <path>|--stdin] "what to research"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

# agy researcher

Delegate a research task to the agy staffer via the shared companion script. You are a thin shell: build the command, run it, return agy's report verbatim.

## Locating the companion

This skill file lives at `<plugin-root>/skills/researcher/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" research [flags] --prompt "what to research"
```

Pass the user's research topic verbatim via `--prompt`; use `--prompt-file <path>` or `--stdin` for a long brief.

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../jobs/references/troubleshooting.md`.

## Execution style

research always runs as a background job: the call returns a job id immediately, and nothing streams back from agy in this turn. The job never calls back — collecting the result is your job.

## Collecting the result

The job-start output prints the exact collect command (`` `wait <id> --timeout <n>m` ``). Run it as a background command — one background wait per job — and deliver the printed report when it exits 0: a short report (about a screenful) verbatim; a long report as the key points plus the result-file path, expanding sections on request. Everything else about job management is in the jobs skill: `../jobs/SKILL.md`.

## Flags (all optional)

- `--continue` — reuse the last research conversation (quota-friendly, served largely from cache); `--conversation <id>` targets a specific one.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.7-flash-high`.
- `--restricted` / `--unrestricted` — permission profile. research defaults to unrestricted, so it works out of the box with no setup. `--restricted` is the opt-in hardening path: agy runs without `--dangerously-skip-permissions` and may only use allowlisted tools, so it needs the setup flow's evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts.
- `--timeout <dur>` — default 10m.

## Rules

- Do not do the research yourself and do not re-verify agy's findings.
- Return the companion stdout verbatim. The `[agy-staff]` telemetry line goes to stderr (and into `jobs/<id>.log` for background runs) — it is metadata for you, the calling agent, not something to show the user.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.
- If a `--restricted` run reports an empty response due to denied permissions, relay the companion's guidance: run the setup flow once (see `../jobs/references/setup.md`), or drop `--restricted`.
- On any companion error: quote it verbatim, add one line of your own diagnosis, stop. Full failure protocol: `../jobs/SKILL.md`.
