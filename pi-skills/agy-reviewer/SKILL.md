---
name: agy-reviewer
description: Get a second-opinion review from Google's Antigravity CLI (agy staffer, fast Gemini) - of code (a diff, PR, working tree) or of a decision, plan, or design. Use when the user says /skill:agy-reviewer, "have agy review this", "second opinion on my diff/PR/plan", or after finishing work and wanting an independent verifier that does not share the host model's blind spots.
---

<!-- Generated from skills/reviewer/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy reviewer

Run a second-opinion review through the agy staffer. You are a thin shell: compose the task, run the companion, return agy's review verbatim. Never fix the issues it finds.

The companion's template contributes only the reviewer stance, evidence discipline, and guardrails. Everything flavor-specific travels in the task string you compose — so pick the flavor first:

- **Code review** — the subject is code: a PR, a branch/ref, the working tree, a patch file, specific files. Read `references/code-review.md` and compose the task per it (evidence gathering, review axes, severity-ranked output). `--json` belongs to this flavor only.
- **General review** — the subject is a decision, plan, design, document, or set of claims. Read `references/general-review.md` and compose the task per it (multi-angle challenge). No fixed output format: state the deliverable's shape in the task if the user needs a specific one.

## Locating the companion

This skill file lives at `<plugin-root>/pi-skills/agy-reviewer/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" review [flags] --prompt "what to review"
```

Pass the review subject verbatim via `--prompt`; use `--prompt-file <path>` or `--stdin` for long text, which a composed task usually needs.

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../agy-jobs/references/troubleshooting.md`.

## The review subject is the prompt

review is prompt-based: the user's request plus the flavor's framing is the task string. Do not gather diffs, write patch files, or translate the request into flags — agy collects the evidence itself. If the subject is ambiguous, agy reports the ambiguity instead of guessing; relay that and let the user sharpen the request. A task string is required; review with no subject exits with an error.

## Execution style

review always runs as a background job: the call returns a job id immediately. The job never calls back — collecting the result is your job.

## Collecting the result

The job-start output prints the exact collect command (`` `wait <id> --timeout <n>m` ``). Run it as a background command — one background wait per job, in the same unsandboxed permission context as the start command — and deliver the printed review when it exits 0: short (about a screenful) verbatim; long as the verdict/key points plus the result-file path, expanding sections on request. Everything else about job management is in the jobs skill: `../agy-jobs/SKILL.md`.

## Flags (all optional)

- `--json` — schema-enforced JSON findings (verdict/summary/findings/could_not_verify) instead of markdown. Code-review flavor only, and only when the user asks for machine-readable output.
- `--restricted` / `--unrestricted` — permission profile. review defaults to unrestricted, so it works out of the box and can run tests or reproduce a bug when the request asks for it. `--restricted` is the opt-in hardening path: agy may then only use allowlisted tools, so it needs the setup flow's evidence-gathering allowlist to be useful — and some native agy tools ignore allow-rules headless, so restricted runs can still come back empty.
- `--model <id>` / `--effort low|medium|high` (default `gemini-3.8-flash-medium`), `--continue` (or `--conversation <id>`), `--timeout <dur>` (default 5m).
- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts (a composed task with the flavor framing usually is one).

## Reviewing untrusted content

An unrestricted review of code from an untrusted author (a PR from a stranger, a patch from an unknown source) means prompt injection in that content could run arbitrary commands. For those reviews, consider `--restricted` (it may fail closed, and some native tools ignore allow-rules) or run the review in an isolated checkout.

## Rules

- Return the companion stdout verbatim — no commentary, no fixes, no softening of findings.
- Pass the user's explicit authorizations through to the task string verbatim. The prompt template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, commands that burn paid API quota); that default opens only when the request itself asks for the operation — so keep "run the e2e tests" or "call the staging API" in the prompt instead of trimming it.
- Empty responses from a `--restricted` run: relay the companion's guidance (run the setup flow once, or drop `--restricted`).
- On any companion error: quote it verbatim, add one line of your own diagnosis, stop. Full failure protocol: `../agy-jobs/SKILL.md`.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
