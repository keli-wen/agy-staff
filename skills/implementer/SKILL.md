---
name: implementer
description: Delegate a coding task to Google's Antigravity CLI (agy staffer, fast Gemini), with explicit workspace handling and diff/commit/PR delivery. Use when the user says /agy:implementer, "have agy fix/build X", or wants to hand a well-scoped coding task to the agy staffer instead of doing it in the host model.
argument-hint: '[--delivery diff|commit|pr] [--dirty continue] [--include-baseline] [--restricted|--unrestricted] [--model <id>|--effort low|medium|high] [--prompt-file <path>|--stdin] "task description"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*), AskUserQuestion
---

# agy implementer

Hand a coding task to the agy staffer. agy edits and verifies the workspace; the companion owns workspace preflight, continuation state, and authorized Git/PR delivery.

## Locating the companion

This skill file lives at `<plugin-root>/skills/implementer/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" implement [flags] "task description"
```

> [!IMPORTANT]
> Run this command **unsandboxed** — agy needs a localhost port and its OAuth token file, which harness sandboxes hide. In Codex, request escalated permissions for the command. Details: `../jobs/references/troubleshooting.md`. (The companion passes `--dangerously-skip-permissions` to agy by default in this mode.)

## Main flow

1. Choose the delivery contract from the user's request: `diff` leaves a reviewable working-tree diff, `commit` commits locally, and `pr` commits, pushes, then creates or updates a draft PR. Prefer passing `--delivery` explicitly; the companion can infer obvious commit/PR requests from task text.
2. Run the companion. If the workspace is dirty and the companion returns a workspace decision packet, ask the user how to handle the listed paths. Rerun with `--dirty continue` only when the user confirms those changes are part of this task.
3. Collect the background job with the printed `wait <id> --timeout <n>m` command. One job gets one background wait.
4. For `diff`, show the resulting status/diff as usual. For `commit` or `pr`, do not ask the user to approve the same commit/push/PR again unless the target, repo, scope, or side effects changed.

Read `references/workspace-delivery.md` when the workspace is dirty, the user requests `commit`/`pr`, a continuation mismatches, or agy pauses for a side-effect decision.

## Flags

- `--delivery diff|commit|pr` — explicit delivery contract. `diff` is the default.
- `--dirty continue` — start from the current dirty workspace after the user confirms the listed changes are in scope.
- `--include-baseline` — allow a dirty baseline to be committed or included in a PR. Use only after confirming every baseline path belongs there.
- `--commit-message <text>`, `--pr-title <text>`, `--pr-body <text>`, `--base <branch>` — optional Git delivery metadata.
- `--restricted` / `--unrestricted`, `--continue` / `--conversation <id>`, `--model <id>` / `--effort low|medium|high`, `--timeout <dur>`, `--prompt-file <path>` / `--stdin`.

## Rules

- Pass the user's explicit authorizations through to the task string verbatim.
- Do not silently stash, reset, discard, rebase, overwrite, or stage unrelated paths.
- On any companion error: quote it verbatim, add one line of diagnosis, and stop unless the message asks for a specific user decision. Full failure protocol: `../jobs/SKILL.md`.
