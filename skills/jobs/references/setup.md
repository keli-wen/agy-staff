# setup — optional hardening for restricted runs

staffer, research, review, and implement default to unrestricted and work with no setup. Run setup only when the user wants restricted runs — per call (`--restricted`) or by default in this repository. Restricted runs agy WITHOUT `--dangerously-skip-permissions`, so agy can only use tools explicitly allowlisted in its settings (ask is tool-free and needs nothing either way).

## Flow

**Step 1 — status + dry run.** Shows the current per-repo policy, the allowlist state, and the plan without writing anything:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" setup
```

If it reports the agy CLI itself is missing, stop and relay its install guidance — do not attempt to install agy yourself.

**Step 2 — per-repo policy.** Ask the user with `AskUserQuestion` (multiSelect over `staffer`, `research`, `review`, `implement`, plus a "None — keep the defaults (Recommended)" option): which modes should default to the **restricted** profile in this repository? Make clear this is a per-repo, per-machine preference (`.agy-staff/config.json`, git-ignored, not shared with the team), that a `--restricted`/`--unrestricted` flag on a call still overrides it, and that it is a run policy, not a security boundary — untrusted input still calls for an isolated checkout. Then apply their answer:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" setup --restrict review,research   # their selection
node "<skill-dir>/../../companion/agy-companion.mjs" setup --restrict none              # if they chose none
```

If they chose none AND the step-1 output shows the allowlist already installed, you are done — skip to the final report.

**Step 3 — allowlist.** If any mode is restricted (by policy or because the user wants `--restricted` runs) and rules are missing, present the step-1 dry-run output in full: which rules would be added, to which file, and that the file is backed up first. Be explicit about two things before asking for confirmation:

- **Scope is global.** The rules go into agy's global settings file, so they apply to every project on this machine, not just this repository.
- **Rules are prefix-matched.** `command(git)` and `command(gh)` also match write commands such as `git push` or `gh pr merge`. This is an evidence-gathering allowlist, not a read-only one — never describe it as read-only.

Then use `AskUserQuestion` exactly once: `Apply the allowlist (Recommended)` / `Skip for now`.

**Step 4 — only if the user chose apply:**

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" setup --apply
```

## Final report

Tell the user what is now in effect: the per-repo policy (if any) and where to change it later (`setup --restrict ...` / `setup --restrict none`), whether the allowlist was applied (including the backup path), and the caveats: prefix matching, global scope, the headless caveat that some agy tools ignore allow-rules entirely so a restricted run can still come back empty, and the honest note that agy's project-scoped settings path is undocumented and unverified — so only the global file is edited. Security-sensitive users can scope permissions to a single project themselves, but do not guess a path for them.
