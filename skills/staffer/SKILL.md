---
name: staffer
description: Delegate a general-purpose task to Google's Antigravity CLI with a brief that defines the work. The default worker for agy lead. Use for /agy:staffer, "have agy do/handle X", or "have agy generate an image"; supports research, analysis, writing, planning, implementation, and native tools such as image generation.
argument-hint: '[--restricted|--unrestricted] [--model <id>|--effort low|medium|high] [--timeout <dur>] [--prompt-file <path>|--stdin] "task"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

# agy staffer

The general-purpose persona and default worker for lead. Its prompt template contains the task, environment (cwd, branch, date), and safety guardrails. The brief defines the work and output, so one conversation can support investigation, drafting, implementation, and revision as the task evolves.

Choose a specialist when requested or when its guidance materially improves the assignment: `researcher` for a source-backed survey, `reviewer` for independent critique, or `implementer` for a scoped code change with verification. Reserve `ask` for installation smoke tests or explicit testing.

staffer is also the route to agy-native tools no specialist covers — notably **image generation**: agy ships a `generate_image` tool (verified on v1.1.15; a 1024×1024 PNG in ~30s). Name the output path in the task, e.g. `staffer --prompt "generate a pixel-art robot mascot, save it as assets/mascot.png"`.

## Locating the companion

This skill file lives at `<plugin-root>/skills/staffer/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" staffer [flags] --prompt "task"
```

For a direct invocation, pass the user's task text verbatim via `--prompt`; use `--prompt-file <path>` or `--stdin` for long text. In a lead workflow, use the brief composed by the lead skill.

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../jobs/references/troubleshooting.md`.

## Collecting the result

The command returns a job id. Read `../jobs/SKILL.md` for result collection and recovery: dispatch, wait for the final result, then validate as needed. Do not proactively observe progress, read logs or inspect intermediate artifacts while running. Observe only when the user explicitly asks for progress; diagnose a failure or a result requiring intervention under the jobs protocol.

## Flags (all optional)

- `--prompt <text>` / `--prompt-file <path>` / `--stdin` — the task, from exactly one of these three sources. Use file/stdin for long prompts instead of shell quoting.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.8-flash-medium`.
- `--restricted` / `--unrestricted` — permission profile; staffer defaults to unrestricted like the other tool-using personas, `--restricted` is the opt-in hardening path.
- `--continue` (or `--conversation <id>`), `--timeout <dur>` (default 60m, maximum 120m hard execution limit).

## Rules

- For a direct invocation, pass the user's task through verbatim. In a lead workflow, preserve the user's requirements in the delegated brief. State the desired output format when needed.
- Pass the user's explicit authorizations through verbatim. The template default-denies costly or irreversible side effects (commits/pushes, deleting files outside the workspace, side-effectful network calls, paid-quota commands); that default opens only when the task itself asks for the operation.
- A general task may legitimately edit files. The companion reports any working-tree delta with the result — inspect it (`git diff`) and confirm it is what the task asked for before building on it.
- For errors and recovery, follow `../jobs/SKILL.md`.

For an existing conversation, `--continue` / `--conversation <id>` inherit its recorded model and permission profile unless explicitly overridden. The unrestricted defaults above apply to new tasks.
