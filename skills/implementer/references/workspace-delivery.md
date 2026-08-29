# Implementer Workspace And Delivery

Use this reference when an implement task is not the simple clean-worktree `diff` path.

## Workspace Decisions

The companion inspects the repo root, cwd, worktree, branch, HEAD, status, tracked diff, and untracked file hashes before starting agy. It does not mutate Git state during this inspection.

When the workspace is dirty, ask the user to choose one path:

- Continue on current changes when the listed paths are part of, or required by, the requested implementation. Rerun with `Dirty workspace: continue` in the task prompt.
- Use an isolated worktree when the task is independent of the listed paths.
- Commit existing changes first only after the user confirms exact paths and intent.
- Stash only when the user explicitly asks for it.

Never silently stash, reset, discard, rebase, or overwrite existing work.

## Delivery Contracts

`diff` means agy edits and verifies, then the companion leaves the working tree dirty for review.

`commit` means agy edits and verifies, then the companion stages exact status paths with `git add -- <paths>` and creates one local commit.

`pr` means agy edits and verifies, then the companion commits, pushes the current branch with `git push -u origin <branch>`, and creates or updates a draft PR with `gh pr`.

Choosing `commit` or `pr` at task start is the authorization for that delivery. Do not ask the user to approve the same action again unless the target, repo, branch, scope, or side effects changed.

Dirty baselines are not included in `commit` or `pr` by default. Add `Include baseline: yes` to the task prompt only after the user confirms every baseline path belongs in that commit or PR.

## Continuation

A successful implement task records a task manifest under `.agy-staff/state.json`. Continuation compares the recorded repo, worktree, branch, HEAD, status, tracked diff hash, and untracked file hashes before dispatching agy again.

If the snapshot matches, continue the same conversation even when the working tree is dirty. That dirty state is the task result.

If the snapshot mismatches, stop and report the mismatch. Do not force a clean tree, and do not guess whether the user or agy changed the files.

## Side Effects

Safe local verification is allowed by default: lint, typecheck, unit tests, and read-only local integration tests.

Pause for user confirmation when the task needs a product choice, public API choice, new dependency, wider refactor, migration apply, destructive Git operation, external write, shared database write, deployment, publishing, paid request, or message-sending action.

Use this short packet when pausing:

```text
Need confirmation: <action>
Target: <environment, resource, or interface>
Impact: <what changes, cost, or risk>
Recommendation: <preferred option and why>
Safe alternative: <how to keep moving without it>
```
