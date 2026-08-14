---
name: agy-jobs
description: Manage agy staffer background jobs and setup - status, results, cancel, follow-up conversation, and installing the strict-profile allowlist. Use when the user says /agy:status, /agy:result, /agy:cancel, /agy:continue, /agy:setup, "is the agy job done", "show agy's result", or "set up agy".
---

# agy jobs, follow-ups, and setup

Utility operations for the agy-staff plugin. All state is per-repository under `.agy-staff/` (gitignored).

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-jobs/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" <subcommand> [args]
```

## Subcommands

### status `[job-id]`
Lists background jobs (id, mode, status, timestamps) or shows one job with a log tail. Render the list as a compact table; show single-job output as-is.

### result `[job-id]`
Prints the stored output of a finished job (defaults to the most recent finished one). Present it verbatim. If it was an implement job whose footer says the working tree changed, also show `git diff` and ask the user whether to keep the changes.

### cancel `<job-id>`
Kills a running job's process and marks it canceled.

### continue `"follow-up text"`
Sends a follow-up message to the most recent agy conversation in this repo (any mode). Continuation is quota-friendly — agy serves prior context from cache. `--conversation <id>` targets an older conversation; ids appear in every `[agy-staff]` footer.

### setup `[--apply]`
Installs the read-only allowlist that powers the strict profile (research/review default). Without `--apply` it is a dry run. Flow:
1. Run `setup` (dry run) and show the user exactly which rules would be written to which file (the file is backed up first).
2. Only after the user confirms, run `setup --apply`.
3. Relay the notes: rules are prefix-matched; agy's project-scoped settings path is unverified so only the global file is edited; some agy tools ignore allow-rules headless and need `--loose`.

## Rules

- Present companion output verbatim; do not summarize job results.
- If a strict-profile run keeps returning empty responses even after setup, suggest retrying that command with `--loose`.
