---
description: Check the agy CLI and install the read-only allowlist that powers the strict profile
argument-hint: ''
allowed-tools: Bash(node:*), AskUserQuestion
---

Set up the strict permission profile (the default for research and review). Strict runs agy WITHOUT `--dangerously-skip-permissions`, so agy can only use tools that are explicitly allowlisted in its settings.

Step 1 — dry run. Show the plan without writing anything:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" setup
```

Step 2 — present the dry-run output to the user in full: which read-only rules would be added, to which file, and that the file is backed up first.

Step 3 — if rules are missing, use `AskUserQuestion` exactly once:
- `Apply the allowlist (Recommended)`
- `Skip for now`

Step 4 — only if the user chose apply:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" setup --apply
```

Present the final output, including the backup path and the notes section (prefix matching, the unverified project-scoped settings path, and the headless caveat that some tools only work with `--loose`).

If the dry run reports the agy CLI itself is missing, stop and relay its install guidance — do not attempt to install agy yourself.
