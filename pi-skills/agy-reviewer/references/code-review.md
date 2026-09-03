<!-- Generated from skills/reviewer/references/code-review.md; run npm run generate:pi. Do not edit here. -->

# Composing a code-review task

Read this when the review subject is code: a PR, a branch or ref, the working tree, a patch file, or specific files. The companion's template carries only the reviewer stance and guardrails; the code-review contract below travels in the task string. Compose the task as the user's request, verbatim, followed by this contract — adjusted only where the request explicitly overrides it. A composed task is usually long: pass it with `--prompt-file` or `--stdin` rather than `--prompt` (the three are the only task sources, and exactly one per call).

The standards and spec-alignment axes are adapted from `code-review` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

## The contract to append to the task

### Gathering the evidence

No diff is inlined. Identify the review subject from the request, then fetch the evidence yourself with the tools you have:

- A pull request → `gh pr view <num>` for title, description, and discussion, then `gh pr diff <num>` for the change.
- A git ref or branch → `git diff <ref>` for the change and `git log --oneline <ref>..HEAD` for the commit trail.
- The current working tree → `git status` plus `git diff` and `git diff --staged`.
- A patch or diff file → read the file at the given path.
- Specific files or a directory → read them directly.

Read surrounding source files wherever the diff alone is ambiguous — the review is about the code the change lands in, not just the changed lines.

### Review axes

Cover each axis; drop one only when the diff plainly has none of that surface, and say in the report that you dropped it:

- **correctness** — does the code do what it claims: logic, edge cases, error and retry paths, concurrency, resource lifetimes, and tests that only appear to test something.
- **standards** — does it follow *this* repo's conventions, documented (lint config, CONTRIBUTING, CLAUDE.md / AGENTS.md) and observed (how neighbouring modules do it). Establish the convention from the repo before judging, and cite the file that establishes it — a convention you cannot cite is a preference, not a finding.
- **spec alignment** — does it do what the originating issue, ticket, or request actually asked: requirements left unmet, cases silently dropped, scope added on its own.
- **security** — untrusted input reaching a sink, authz checks missing or in the wrong layer, secrets and logging, injection, unsafe defaults.

### Findings

- **Rank by severity**: `critical` (data loss, security, corruption), `high` (incorrect behavior on realistic input), `medium` (bug in edge case, resource leak), `low` (robustness, maintainability), `nit` (style). Report in that order.
- **Every finding needs `file:line`** (or `file:hunk` if line numbers are unavailable) plus a one-line title and a concrete explanation of the failure mode — what input or sequence triggers it.
- **Check what the change touches, not just what it shows**: callers of changed functions, invariants the change might break, error paths, and concurrency.

### Output format

- `## Verdict` — one of: approve / request changes / comment, with one sentence of justification.
- `## Findings` — severity-ranked list as specified above. If none: say so explicitly and state what was checked.
- `## What I could not verify` — mandatory. Evidence that could not be fetched, tests that could not run, callers not seen, assumptions made.

## --json

`--json` makes the companion enforce a findings schema (verdict / summary / findings with severity, file, line, title, detail / could_not_verify) instead of markdown. Opt-in only, when the user wants machine-readable output; it matches the output format above, so no extra task text is needed for it.
