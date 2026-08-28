# agy-staff — Full reference

Back to the [README](../README.md). 中文版见 [REFERENCE.zh-CN.md](REFERENCE.zh-CN.md)。

## Modes and defaults

| Persona (skill) | Companion mode | What it is | Default model | Profile | Execution |
|---|---|---|---|---|---|
| `ask` | `ask` | Cheap zero-tool one-shot Q&A (~3s); doubles as the post-install smoke test | `gemini-3.7-flash-low` | restricted (prompt-only) | synchronous — the answer comes back in the same call |
| `staffer` | `staffer` | General-purpose delegation with a minimal prompt: no role, rules, or output format — the task text alone shapes the output | `gemini-3.7-flash-medium` | unrestricted | background job — returns a job id |
| `researcher` | `research` | Deep survey with cited sources and explicit unverified-claims marking | `gemini-3.7-flash-high` | unrestricted | background job — returns a job id |
| `reviewer` | `review` | Second-opinion verifier, two flavors routed by subject: code review (severity-ranked findings with `file:line` refs) and general review (multi-angle challenge of a plan, design, or decision) | `gemini-3.7-flash-medium` | unrestricted | background job — returns a job id |
| `implementer` | `implement` | Well-scoped coding task; agy edits and verifies, while the companion manages workspace decisions and `diff` / `commit` / `pr` delivery | `gemini-3.7-flash-medium` | unrestricted | background job — returns a job id |

Execution style is fixed per mode and cannot be overridden by a flag. `continue` inherits the resolved mode's style (continuing an `ask` stays synchronous; continuing the others returns a job id).

Both platforms surface the same personas under the `agy` plugin name, backed by one companion script (`companion/agy-companion.mjs`, Node stdlib only) and shared prompt templates (`templates/`). Invocation tokens: `/agy:<persona>` on Claude Code, `$agy:<persona>` on Codex. Job management (`wait`/`status`/`result`/`cancel`/`continue`/`setup`) lives in the model-facing `jobs` skill plus the companion CLI itself — ask for it in natural language ("is the agy job done?").

## The two-profile permission model

Every mode runs under exactly one of two profiles. **Every tool-using mode defaults to `unrestricted`**, so the plugin works out of the box with no allowlist and no setup; `--restricted` is the opt-in hardening flag. `--restricted`/`--unrestricted` override per call (`ask` is tool-free and forced restricted — it ignores both, and passing `--unrestricted` to it prints a note and proceeds restricted).

The profile for a run is resolved in this order: CLI flag > per-repo policy ([`setup --restrict`](#per-repo-policy-setup---restrict)) > built-in default.

| | **unrestricted** (default: staffer, research, review, implement) | **restricted** (opt-in hardening; forced for ask) |
|---|---|---|
| agy invocation | `--dangerously-skip-permissions` | no permission skipping — fail-closed, every unlisted tool call is auto-denied |
| What agy can do | anything, including editing files and running commands | evidence gathering via the setup allowlist: `git gh cat head ls grep find rg wc` (prefix-matched commands) |
| Safety net | prompt-level guardrails (default-deny on irreversible/costly actions) + the tiered git guards below | agy stays inside agy's own permission enforcement |
| Typical use | the normal path: Q&A, surveys, reviews, coding tasks | hardened runs: untrusted input, or machines where skipping agy's permission prompts is unacceptable |

`--restricted` and `--unrestricted` are mutually exclusive; passing both is an error. Two things to know before hardening: `--restricted` is only useful once setup's allowlist is installed (otherwise agy denies its own evidence gathering and the run comes back empty), and some native tools ignore allow-rules in headless mode entirely — a restricted run can be thinner than an unrestricted one.

### Tiered git guards

The guards differ by mode. The `implement` workspace contract applies to every implement run because `commit` / `pr` delivery is a companion-owned Git write:

| Mode | Inside a git repo | Not a git repo |
|---|---|---|
| `implement` | workspace decision **required** when dirty. A clean first run starts immediately; a dirty first run returns a decision packet unless the caller chose `--dirty continue`. Continuation compares the recorded task snapshot instead of requiring a clean tree | `diff` warns that agy's edits cannot be reviewed or rolled back via git, then proceeds; `commit` and `pr` require a git repository |
| `research`, `review` | never blocked, no clean-tree check. The worker snapshots `git status --porcelain` before the run and compares afterwards; if agy introduced changes, the result carries a warning listing the delta plus a rollback hint | nothing to compare — silent |
| `staffer` | same snapshot/report as research/review, but neutrally worded: a general task may legitimately edit files, so the delta is information for the caller ("verify the task asked for it"), not an accusation | nothing to compare — silent |

Silence is the normal case for `research`/`review`: the delta warning shows up only when agy touched the working tree, which the templates tell it not to do.

### Implement delivery contracts

`implement` has one delivery contract per task:

- `diff` — agy edits and verifies, then the companion leaves an uncommitted diff.
- `commit` — agy edits and verifies, then the companion stages exact changed paths with `git add -- <paths>` and creates one local commit.
- `pr` — agy edits and verifies, then the companion commits, pushes the current branch with `git push -u origin <branch>`, and creates or updates a draft PR with `gh pr`.

Pass `--delivery diff|commit|pr` to make the contract explicit. If omitted, `diff` is the default, while obvious task text such as "commit this" or "open a PR" is inferred. Choosing `commit` or `pr` is authorization for that delivery; the caller should not ask for the same commit/push/PR confirmation again unless the target, repository, branch, scope, or side effects change.

Dirty baselines are not committed or included in a PR by default. `--dirty continue` allows agy to build on existing changes, but `commit` and `pr` also require `--include-baseline` before those pre-existing changes can enter Git history.

### Prompt-level guardrails: default-deny, prompt-opens

The `staffer`, `research`, `review` and `implement` templates deny irreversible or costly side effects **by default**:

- no commits, pushes, PR writes or history rewrites from inside the agy model run; authorized `commit` / `pr` delivery is performed by the companion after agy returns;
- no deleting files outside the workspace;
- no side-effectful network calls;
- no commands that burn paid API quota or tokens (e.g. an e2e suite that bills a live API).

Scratch scripts go in a temp dir, and everything the run does inside the workspace stays git-revertible.

**The default is closed, not locked.** If your request explicitly authorizes one of those operations ("run the e2e tests", "call the staging API"), agy does exactly what was authorized and reports what it ran — so pass such authorizations through verbatim when you delegate. `review` in particular may run read-only commands, scratch scripts and tests to verify a finding; what it must not do is modify tracked files, commit or push.

### Reviewing untrusted content

Under `unrestricted`, prompt injection is code execution. If you point `review` or `research` at content written by someone you do not trust — a PR from a stranger, a vendored dependency, an issue body full of instructions — text inside that content can tell agy to run arbitrary commands, and an unrestricted agy will run them.

Two mitigations, neither of them the default:

- **`--restricted`** — agy's own permission enforcement applies, so unlisted tools are auto-denied. Caveats as above: it needs setup's allowlist to be useful, the allowlist is prefix-matched rather than read-only, and native tools that ignore allow-rules may fail-close and thin out the review. It shrinks the blast radius; it is not a sandbox.
- **An isolated checkout** — review it in a throwaway clone, container or VM with no credentials worth stealing.

The default optimizes for the common case: your own code on your own machine. Untrusted input is the case where you should reach for one of the two.

### Optional hardening (setup)

`/agy:setup` is **optional** — nothing requires it, because every tool-using mode defaults to `unrestricted`. Run it when you want `--restricted` to be usable: it checks the `agy` binary, then (after showing you exactly what it will write, and backing the file up) appends an **evidence-gathering command allowlist** to `~/.gemini/antigravity-cli/settings.json` so restricted-profile runs can collect evidence without a human approving every tool call. The default flow is a dry run; nothing is written until you explicitly confirm.

Two properties of that allowlist you should know before applying it:

- **It is not a read-only allowlist.** Rules are prefix-matched on the command name: `command(git)` matches `git log` *and* `git push`; `command(gh)` matches `gh pr view` *and* `gh pr merge`. The rules are chosen for evidence gathering, but they do not technically prevent writes.
- **It is global.** The file is `~/.gemini/antigravity-cli/settings.json`, so the rules apply to every `agy` run on the machine, not only to agy-staff jobs. That is the intended product path ("set up once, use everywhere").

Web search is not in the allowlist and does not need to be: on the tested agy (v1.1.13) `search_web` runs headless without an allow rule.

### Per-repo policy (`setup --restrict`)

If you want some modes to run restricted every time *in a particular repository* — say, a repo where you routinely review strangers' PRs — you can declare that once instead of remembering the flag:

```bash
setup --restrict review,research   # these modes default to restricted in this repo
setup --restrict none              # back to the built-in defaults
```

The policy is written to `<repo>/.agy-staff/config.json` and applied automatically (the run prints a note that the profile came from the project policy). Three properties:

- **Precedence.** A `--restricted`/`--unrestricted` flag on a call always overrides the policy; unlisted modes keep the built-in default. `ask` is not configurable (tool-free, always restricted).
- **Scope.** `.agy-staff/` is normally git-ignored, so the policy is a personal, per-machine preference — it is not shared with your team through the repo.
- **What it is not.** This is a run policy for consistency and accident prevention, not a security boundary: it feeds the same `--restricted` machinery, with the same caveats (needs the global allowlist, prefix-matched, some tools ignore allow-rules headless). For genuinely untrusted input, use an isolated checkout.

Note the two files are different things: the **allowlist** (what a restricted agy may execute) is global by agy's design; the **policy** (which modes default to restricted) is per-repo by ours.

### Advanced: project-scoped permissions

If a machine-wide allowlist is too broad for you, agy also supports project-scoped permission rules (it treats them as highest priority) tied to its `--project` system. That would let you grant the evidence rules only inside the repos where you delegate.

Caveat, stated plainly: **the exact project-settings file path is undocumented and unverified against the current agy release**, so agy-staff does not write it and this document does not guess it. If you want project scoping, check `agy` interactively for where it reads project-level rules from, and configure it yourself. Until then, either accept the global scope or skip setup entirely — the default unrestricted profile bypasses agy's permission system rather than depending on it, and `ask` needs no allowlist at all; skipping setup only costs you the ability to harden a run with `--restricted`.

## Flags (uniform across modes)

| Flag | Meaning |
|---|---|
| `--conversation <id>` | resume a specific agy conversation |
| `--continue` | reuse this mode's last conversation id from state |
| `--model <id>` | explicit agy model (see `agy models`). Ids are effort-suffixed (`gemini-3.7-flash-low`); the companion normalizes bare families (`gemini-3.7-flash` + `--effort`) and the aliases `flash`/`pro`, and rejects unknown ids pre-flight |
| `--effort low\|medium\|high` | shorthand for `gemini-3.7-flash-<effort>` |
| `--restricted` / `--unrestricted` | permission profile override (ignored by `ask`). `unrestricted` is the default for `staffer`/`research`/`review`/`implement`, so `--restricted` is the flag you actually reach for |
| `--restrict <modes\|none>` | (setup) per-repo policy: the listed modes default to restricted in this repository; `none` clears it. See [Per-repo policy](#per-repo-policy-setup---restrict) |
| `--json` | (review) schema-enforced JSON findings; default is free-form markdown. Meant for the code-review flavor |
| `--delivery diff\|commit\|pr` | (implement) delivery contract. `diff` leaves a working-tree diff, `commit` creates a local commit, and `pr` commits, pushes, and creates or updates a draft PR |
| `--dirty continue` | (implement) start from a dirty workspace after the user confirms the listed paths are in scope |
| `--include-baseline` | (implement) allow a dirty baseline to be included in a `commit` or `pr`. Use only after confirming every baseline path belongs there |
| `--commit-message <text>` / `--pr-title <text>` / `--pr-body <text>` / `--base <branch>` | (implement) optional Git delivery metadata |
| `--timeout <dur>` | agy `--print-timeout` (defaults: 10m staffer/research/implement, 5m review, 2m ask) |
| `--prompt-file <path>` | read the task text from a file — for long prompts, instead of shell quoting |
| `--stdin` | read the task text from stdin. Exactly one task source per call: inline text, `--prompt-file`, or `--stdin` |

That table is the whole public surface. There is no flag for execution style — see the modes table above.

## Review is prompt-based

`review` takes a subject description and gathers the evidence itself with the tools it has (`gh pr view`/`gh pr diff` for PRs, `git diff`/`git log` for refs and the working tree, reading files for patches). There is no flag that hands it a diff; describe the subject in the prompt instead:

```
review "Review PR #730"
review "Review the current working tree"
review "Review changes against master"
review "Review the patch at /tmp/change.patch"
```

An empty task string is an error — `review` needs a subject. If the subject is ambiguous, agy is instructed to report the ambiguity rather than guess at what you meant.

The review template itself is a neutral skeleton (reviewer stance, evidence discipline, guardrails). Everything flavor-specific — the evidence-gathering menu, review axes, severity ranking, and output format for code reviews; the multi-angle challenge framing for plan/decision reviews — travels in the task string, composed by the `reviewer` skill from `skills/reviewer/references/{code-review,general-review}.md`.

## State and background jobs

**Output split.** stdout carries the result and any guard warning about the working tree; the `[agy-staff]` telemetry line (mode, profile, model, duration, tokens, conversation id) goes to stderr, and for background jobs into `jobs/<id>.log`. Telemetry is metadata for the calling agent — it is not part of the deliverable and is not stored in `jobs/<id>.result.md`.

`staffer`, `research`, `review` and `implement` return a job id immediately instead of blocking, and the job-start output prints the exact collect command — `wait <id> --timeout <n>m`, sized to outlive the job. Results are collected through the job lifecycle:

- `wait [id] [--timeout <dur>]` — block until the job (default: the most recent) reaches a terminal state, then print its result. The preferred collection path: one command instead of a hand-rolled poll loop. While waiting, heartbeat lines on stderr show liveness every ~15s.
- `status` — list jobs / show one job's state (`running`, `done`, `error`, `crashed`, `canceled`).
- `result <id>` — print a finished job's output (again).
- `cancel <id>` — kill a running job.

`status <id>` and `wait` exit with a machine-readable code so callers never parse output to branch: **0** done, **2** running, **3** error/crashed, **4** canceled (1 stays the generic error, e.g. unknown id). `wait`'s own `--timeout` defaults to 100s — deliberately under a typical harness per-command limit — but has no upper bound: the canonical pattern is the printed long-timeout `wait` run as a background command, **one background wait per job** (never several ids serially in one shell — that hides each completion behind the slowest predecessor). Expiring is not a failure: exit 2 means the job is still running, and you simply run the same `wait` again. The agent that started a job is expected to see it through with `wait` (and to tell you the job id when it starts one) rather than leave the run dangling.

Per-repository state lives in `<repo>/.agy-staff/`:

- `state.json` — last conversation id per mode, a jobs registry, and implement task manifests used for continuation snapshot checks.
- `config.json` — the per-repo profile policy, if you set one with `setup --restrict`.
- `jobs/<id>.log`, `jobs/<id>.spec.json`, `jobs/<id>.result.md` — one triple per background job.

Background jobs are plain detached processes (the companion re-spawns itself as a worker; no daemon). `status` detects crashed workers by pid liveness; `cancel` kills the pid. Conversation continuation (`--continue`, `continue`) is cheap: agy serves prior context largely from cache (`cache_read_tokens`).

### Keeping `.agy-staff/` out of git

Automatic since 0.4: when the companion creates `.agy-staff/` for the first time in a repo, it appends `.agy-staff/` to `.git/info/exclude` (repo-local, untracked) unless the path is already ignored. It never touches the tracked `.gitignore` — the state directory is local scratch, and adding it to a shared, committed file would change the repo for everyone else.

## Troubleshooting

- **"agy reported an error (status ERROR)"** — the companion relays agy's own error verbatim, and appends a cause hint only when the error text actually matches one (invalid model id → run `agy models`; expired auth → run `agy` interactively once to re-login; exhausted quota). If agy reported an error but still returned a complete response (e.g. one tool call timed out during wrap-up), the companion delivers the response anyway — exit 0, response on stdout, warning on stderr (`done_with_warnings`); only a run with no response fails.
- **`operation not permitted` on `~/.gemini/...` / `bind: operation not permitted` / sudden "authentication failed" while `agy` works fine in your terminal** — agy was launched inside a harness command sandbox (typically Codex's workspace-write). agy cannot run sandboxed: it binds a localhost port for its internal language server and reads its OAuth token file, and sandbox secret-protection hides that token no matter which `writable_roots`/`network_access` knobs you open. Run companion commands unsandboxed — in Codex, grant the workspace full access or approve the command with escalated permissions.
- **Empty response, "status SUCCESS"** — only happens on a restricted run (`--restricted`, or a project policy that restricts the mode): agy reports success even when every tool call was denied, so the content is empty and stderr carries a permission note. The companion detects this and tells you the fix: run `setup` once so the allowlist exists, or relax the profile (drop `--restricted`, or `setup --restrict none` if it came from the policy). Caveat baked into agy: some tools ignore allow-rules in headless mode entirely and only work with the skip flag — those always need an unrestricted run. (`ask` cannot hit this case; if it does, report a bug.)
- **"task text exceeds the 200KB inline limit"** — the whole prompt travels to agy as one argv entry and macOS ARG_MAX is ~1MB (agy itself does not read stdin, so `--prompt-file`/`--stdin` only fix shell quoting, not this ceiling). Shorten the task text: point agy at the material (a PR number, a ref, a file path) and let it fetch the content itself instead of pasting it in.
- **Never use agy's `--sandbox` for these modes** — it redirects execution into agy's own scratch workspace (`~/.gemini/antigravity-cli/scratch`) and cannot see your real working directory. The companion never passes it.
- **"implement needs a workspace decision"** — `implement` found a dirty workspace before starting. Confirm whether the listed paths are part of the task (`--dirty continue`), use an isolated worktree, commit them separately, or explicitly stash them. The companion never silently stashes, resets, or discards work.
- **"implement continuation refused"** — the recorded task snapshot no longer matches the current repo, worktree, branch, HEAD, status, tracked diff, or untracked file hashes. Inspect the mismatch and decide whether to continue manually, start a new task, or move the work to an isolated branch.
- **"agy modified the working tree during this review"** — the delta warning (printed with the result) on an unrestricted `research`/`review` run: agy changed files it was told to leave alone. Inspect the listed paths and revert them; the warning includes the rollback hint.
- **Project-scoped agy permissions** — agy has project-level rules ("highest priority") tied to its `--project` system; the settings-file path for those is undocumented and unverified, so setup only edits the global file. If a rule seems ignored, check agy interactively. See [Advanced: project-scoped permissions](#advanced-project-scoped-permissions).
- **Rules context** — agy auto-loads `AGENTS.md`/`GEMINI.md`/`.agents/rules/*.md` from the workspace; keep those files sane in repos where you delegate.

## Migration from 0.1

0.2 renamed the permission profiles, changed which profile the modes default to, and dropped the flags that 0.1 used to steer review and execution.

| 0.1 | 0.2 | Notes |
|---|---|---|
| `research`/`review` default to the strict (restricted) profile | `research`/`review`/`implement` default to `unrestricted` | 0.1 fail-closed research and review unless you ran setup first. 0.2 works out of the box and makes `--restricted` the opt-in hardening flag; `ask` still runs restricted (tool-free). |
| `--strict` | `--restricted` | Old name still accepted for one release; it warns on stderr. Same semantics. |
| `--loose` | `--unrestricted` | Old name still accepted for one release; it warns on stderr. Same semantics. |
| profile names "strict"/"loose" in output | "restricted"/"unrestricted" | Cosmetic rename; the telemetry line (stderr) now prints `profile=restricted` / `profile=unrestricted`. |
| `--diff-file <path>` | *(removed)* | Review is prompt-based: `review "Review the patch at /tmp/change.patch"`. |
| `--pr <num>` | *(removed)* | `review "Review PR #730"`. |
| `--target <ref>` | *(removed)* | `review "Review changes against master"`. |
| `--background` / `--wait` | *(removed)* | Execution style is fixed per mode: `ask` is synchronous, `research`/`review`/`implement` return a job id. Manage them with `status`/`result`/`cancel`. |

Removed flags fail fast with a message naming the replacement; the deprecated profile aliases keep working through this release and will be deleted in the next one.

## Migration from 0.3

0.4 consolidated the two invocation layers (commands + skills) into a single skills layer with persona names, added the `staffer` mode, and made `.agy-staff/` hygiene automatic.

| 0.3 | 0.4 | Notes |
|---|---|---|
| `/agy:research` (command) + `/agy:agy-research` (skill) | `/agy:researcher` | one skill per persona; the command layer is gone |
| `/agy:review` + `/agy:agy-review` | `/agy:reviewer` | now routes two flavors: code review and general (plan/decision) review |
| `/agy:implement` + `/agy:agy-implement` | `/agy:implementer` | |
| `/agy:ask` + `/agy:agy-ask` | `/agy:ask` | unchanged name, single entry |
| *(none)* | `/agy:staffer` | new general-purpose mode with a minimal prompt |
| `/agy:status`, `/agy:wait`, `/agy:result`, `/agy:cancel`, `/agy:continue`, `/agy:setup` | the `jobs` skill (model-facing) | ask in natural language ("is the agy job done?"); the companion subcommands are unchanged |
| manual `.git/info/exclude` step | automatic on first run | |

## Upgrading

Both harnesses cache the plugin under a per-**version** directory (e.g. `cache/agy-staff/agy/0.4.0`) and key "is it current?" on that version string, not on the commit. A push that does not bump the version therefore never reaches an existing install, in either harness — which also makes this a rule for maintainers: **bump the version for every user-visible change**, or nobody gets it.

- **Claude Code** — `claude plugin marketplace update agy-staff` refreshes the marketplace clone, then `claude plugin update agy@agy-staff` re-copies it into the cache. `install` is **not** the upgrade command: on an already-installed plugin it answers "already installed" and does nothing, whatever the version. And `update` only moves if the version string changed — on an unchanged version it answers "already at the latest version" and leaves the old commit in place. Force the current commit in with `claude plugin uninstall agy@agy-staff && claude plugin install agy@agy-staff`. Restart Claude Code afterwards either way — skills are registered at session start.
- **Codex** — bump the version, run `codex plugin marketplace upgrade` (or remove and re-add the marketplace entry), then restart the app.

You can check which commit is actually installed: the `gitCommitSha` in `~/.claude/plugins/installed_plugins.json`, versus `git -C ~/.claude/plugins/marketplaces/agy-staff log -1` for what the marketplace clone has fetched.

## Repository layout

```
companion/agy-companion.mjs   the single brain (all modes, jobs, setup)
templates/                    shared prompt templates (staffer/ask/research/review/implement)
.claude-plugin/               Claude Code plugin + self-hosting marketplace manifests
.codex-plugin/plugin.json     Codex plugin manifest
.agents/plugins/              Codex marketplace manifest
skills/                       the personas + jobs (thin shells, shared by both platforms;
                              reviewer/ and jobs/ carry references/ for on-demand detail)
assets/                       design diagram + logo + badges
docs/                         this reference + INSTALL_FOR_AGENTS.md
```
