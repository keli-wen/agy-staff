# Single-source shared persona rules

Host-facing dispatch and continuation rules for all five direct personas (`ask`, `staffer`, `researcher`, `reviewer`, `implementer`) are maintained in one source file (`templates/persona-skill-rules.md`) and generated into each direct persona's `SKILL.md` before adapter generation.

## What maintainers edit

- `templates/persona-skill-rules.md`: the shared host-agent rules, including pre-dispatch continuation heuristics (`continue --job <id>` vs. starting a fresh persona invocation) and task-input/execution requirements. Edit once for all five direct personas.
- `skills/<persona>/SKILL.md`: persona-specific instructions outside the marked shared block (`<!-- BEGIN SHARED PERSONA RULES -->` ... `<!-- END SHARED PERSONA RULES -->`). The shared block is generated; do not maintain its contents by hand.
- `skills/lead/` and `skills/jobs/`: orchestration and lifecycle instructions. They are not direct persona entry points and must not contain shared persona markers.

The shared block appears before `## Locating the companion` (the dispatch command example). It contains instructions for the host agent, never for the AGY worker. Worker execution rules and guardrails remain separate in `templates/{staffer,research,review,implement,ask}.md`.

## Generation and verification

Run `npm run generate:skills` after changing `templates/persona-skill-rules.md` or any file under `skills/`. The generator:

1. Validates that all five direct persona entrypoints (`skills/{ask,implementer,researcher,reviewer,implementer,staffer}/SKILL.md`) exist and each has one well-formed marker pair before `## Locating the companion`, and rejects markers in `skills/{jobs,lead}/` or non-entrypoint files.
2. Synchronizes the marked block in canonical `skills/<persona>/SKILL.md`.
3. Generates `pi-skills/` and `opencode-skills/` from the updated canonical skills. Target-specific generation (`npm run generate:pi`, `npm run generate:opencode`) also synchronizes canonical blocks first.

Commit `templates/persona-skill-rules.md`, canonical `skills/`, and generated `pi-skills/` / `opencode-skills/` together. Claude Code and Codex consume the checked-in canonical files directly; Pi and OpenCode consume their generated adapters. Installation needs neither a build step nor an additional runtime file read to load the shared rules.

Run `npm run check:skills` (or `npm run check:pi` / `npm run check:opencode`) to verify consistency. Check mode is strictly read-only: it rejects stale canonical blocks, stale adapters, missing expected persona blocks, unexpected markers on non-persona skills, or malformed marker boundaries without modifying files on disk.

## Job-ID-only continuation interface

Continuation targets an explicit job ID (`continue --job <id> --prompt "..."` or `--prompt-file` / `--stdin`) and inherits that job's original persona (`mode`), recorded `model`, permission `profile`, and `cwd` (plus `json` for `review` jobs). It never switches personas across a continued conversation.

- **Background personas (`staffer`, `research`, `review`, `implement`)** return `job id: <id>` on stdout when launched; `continue --job <id>` launches a linked background job (`parent_job_id: <id>`).
- **Synchronous `ask`** runs in the foreground, returns only the answer text on stdout, and records an `ask-...` job in `.agy-staff/state.json` (emitted on stderr as `job=ask-...` and `conversation: <conv> (follow up with continue --job ask-...)`, and listed by `status`). Continuing an `ask` job via `continue --job <ask-id>` stays synchronous in the foreground and records a linked `ask-...` job.
- **Removed legacy selectors** (`<persona> --continue`, `<persona> --conversation <id>`, `<persona> --job <id>`, `continue --continue`, `continue --conversation <id>`, and bare `continue` without `--job`) fail fast with exit code 1 and an actionable `continue --job <id>` hint without invoking AGY. Pre-0.8.1 conversation records that have no job record in `state.json` (such as legacy jobless `ask` runs) are reported explicitly so the caller can start a fresh run to create a job ID.
