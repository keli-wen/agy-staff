---
name: agy-staffer
description: Delegate a general-purpose task to Google's Antigravity CLI (agy staffer, fast Gemini) with a minimal, unopinionated prompt. Use when the user says /skill:agy-staffer, "have agy do/handle X", "have agy generate an image", or the task fits none of the specialist personas (researcher / reviewer / implementer / ask) — the template adds no role, rules, or output format, so the task text alone shapes the output. Also the route to agy-native tools no specialist covers, notably image generation (generate_image).
---

<!-- Generated from skills/staffer/SKILL.md; run npm run generate:pi. Do not edit here. -->

# agy staffer

The general-purpose persona: a clean entry point for tasks that none of the specialists fit. Its prompt template is deliberately minimal — the task text, the environment (cwd, branch, date), and the safety guardrails, nothing else. No role framing, no rules, no output format: the task defines its own output, and no unrelated template context can pull the run off course.

Prefer a specialist when one fits: `researcher` for surveys and deep dives, `reviewer` for second opinions on code or plans, `implementer` for edits to the working tree, `ask` for a cheap one-shot question.

staffer is also the route to agy-native tools no specialist covers — notably **image generation**: agy ships a `generate_image` tool (verified on v1.1.15; a 1024×1024 PNG in ~30s). Name the output path in the task, e.g. `staffer --prompt "generate a pixel-art robot mascot, save it as assets/mascot.png"`.

## Locating the companion

This skill file lives at `<plugin-root>/pi-skills/agy-staffer/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" staffer [flags] --prompt "task"
```

Pass the user's task text verbatim via `--prompt`; use `--prompt-file <path>` or `--stdin` for long text.

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../agy-jobs/references/troubleshooting.md`.

## Execution style

staffer always runs as a background job: the call returns a job id immediately and never calls back — collecting the result is your job.

## Collecting the result

The job-start output prints the exact collect command (`` `wait <id> --timeout <n>m` ``). Run it as a background command — one background wait per job, in the same unsandboxed permission context as the start command — and deliver the printed result when it exits 0. Everything else about job management (status, result, cancel, continue, failure protocol, waiting on several jobs at once) is in the jobs skill: `../agy-jobs/SKILL.md`.

## Flags (all optional)

- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts instead of shell quoting.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.8-flash-medium`.
- `--restricted` / `--unrestricted` — permission profile; staffer defaults to unrestricted like the other tool-using personas, `--restricted` is the opt-in hardening path.
- `--continue` (or `--conversation <id>`), `--timeout <dur>` (default 10m).

## Rules

- Pass the user's task through verbatim. Because the template imposes no output format, state the desired format in the task text when the caller needs a specific one.
- Pass the user's explicit authorizations through verbatim. The template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, paid-quota commands); that default opens only when the task itself asks for the operation.
- A general task may legitimately edit files. The companion reports any working-tree delta with the result — inspect it (`git diff`) and confirm it is what the task asked for before building on it.
- On any companion error: quote it verbatim, add one line of your own diagnosis, stop. Full failure protocol: `../agy-jobs/SKILL.md`.

## Host compatibility

When this skill or its referenced instructions require a tool that the current environment does not provide, use available capabilities to achieve an equivalent result. Adapt only the tool-specific execution method; preserve the task goal, authorization requirements, explicit confirmation steps, result delivery, and stopping conditions.

If an equivalent result cannot be achieved, or you cannot establish that an alternative is equivalent, explain the missing capability and its impact, and ask the user for help. Do not silently skip requirements or bypass the environment's restrictions.
