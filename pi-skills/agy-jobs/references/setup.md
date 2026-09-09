<!-- Generated from skills/jobs/references/setup.md; run npm run generate:pi. Do not edit here. -->

# setup — optional hardening for restricted runs

staffer, research, review, and implement default to unrestricted and work with no setup. Run setup only when the user wants restricted runs — per call (`--restricted`) or by default in this repository. Restricted runs keep AGY's permission engine active (ask is tool-free and needs no command rules).

## Flow

**Step 1 — status + dry run.** Shows the current per-repo policy, the allow/deny rules state, and the plan without writing anything:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" setup
```

If it reports the agy CLI itself is missing, stop and relay its install guidance — do not attempt to install agy yourself.

**Step 2 — per-repo policy.** Ask the user with `AskUserQuestion` (multiSelect over `staffer`, `research`, `review`, `implement`, plus a "None — keep the defaults (Recommended)" option): which modes should default to the **restricted** profile in this repository? Make clear this is a per-repo, per-machine preference (`.agy-staff/config.json`, git-ignored, not shared with the team), that a `--restricted`/`--unrestricted` flag on a call still overrides it, and that it is a run policy, not a security boundary — untrusted input still calls for an isolated checkout. Then apply their answer:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" setup --restrict review,research   # their selection
node "<skill-dir>/../../companion/agy-companion.mjs" setup --restrict none              # if they chose none
```

If they chose none AND the step-1 output shows the allow/deny rules already installed, you are done — skip to the final report.

**Step 3 — allow/deny rules.** If any mode is restricted (by policy or because the user wants `--restricted` runs) and rules are missing, present the step-1 dry-run output in full: which rules would be added, to which file, and that the file is backed up first. Be explicit about two things before asking for confirmation:

- **Scope is global.** The rules go into agy's global settings file, so they apply to every project on this machine, not just this repository.
- **AGY owns rule enforcement.** Setup allows broad `git`/`gh` commands and adds five deny prefixes: `git push`, `git reset --hard`, `git clean`, `gh pr merge`, and `gh release delete`. AGY evaluates deny before ask before allow. This avoids maintaining every task's allowed subcommands, but does not cover other command forms, scripts or APIs and is not a read-only boundary. Existing allow/deny/ask rules are preserved; adding broad grants to an earlier narrow setup is visible in the dry run. A denied operation remains denied even if the task requests it; changing policy requires an explicit settings change.

Then use `AskUserQuestion` exactly once: `Apply the allow/deny rules (Recommended)` / `Skip for now`.

**Step 4 — only if the user chose apply:**

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" setup --apply
```

## Final report

Tell the user what is now in effect: the per-repo policy (if any) and where to change it later (`setup --restrict ...` / `setup --restrict none`), whether the allow/deny rules were applied (including the backup path), and the caveats: prefix matching, global scope, the headless caveat that some agy tools ignore allow-rules entirely so a restricted run can still come back empty, and the honest note that agy's project-scoped settings path is undocumented and unverified — so only the global file is edited. Security-sensitive users can scope permissions to a single project themselves, but do not guess a path for them.
