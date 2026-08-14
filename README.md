# agy-staff

Hire Google's Antigravity CLI (`agy`) as a staffer for **Claude Code** and **OpenAI Codex**.

agy-staff is a thin dual-platform plugin that lets your primary coding agent delegate work to `agy` — which ships free-quota access to Gemini 3.7 Flash — through three modes:

| Mode | What it is | Default model | Default profile | Default execution |
|---|---|---|---|---|
| `research` | Deep survey with cited sources and explicit unverified-claims marking | `gemini-3.7-flash-high` | strict | wait |
| `review` | Second-opinion verifier: severity-ranked findings with `file:line` refs | `gemini-3.7-flash-medium` | strict | wait |
| `implement` | Well-scoped coding task; agy edits the working tree, you review the diff | `gemini-3.7-flash-medium` | loose | background |

Both platforms surface the same commands under the `agy` plugin name (`/agy:*`), backed by one companion script (`companion/agy-companion.mjs`, Node stdlib only) and shared prompt templates (`templates/`).

## Why wrap the official CLI instead of an Antigravity API proxy?

Several community projects reverse-engineer the Antigravity/Gemini backend into an OpenAI-compatible proxy. agy-staff deliberately does not: those proxies impersonate the IDE's private protocol, violate the Antigravity Terms of Service, and Google can (and does) revoke accounts that use them — an unacceptable risk for a daily-driver Google account. The official `agy` binary in headless mode gives the same free-quota models through a supported surface, at the cost of a small per-session token overhead (~15k input tokens of system context, mostly cache-served on continuation).

## Installation

Prerequisite on the machine: `agy` on PATH (tested with v1.1.13 at `~/.local/bin/agy`) and Node.js.

### Claude Code

The repo is its own single-plugin marketplace:

```
/plugin marketplace add /path/to/agy-staff        # or a GitHub slug once pushed
/plugin install agy@agy-staff
```

Commands appear as `/agy:research`, `/agy:review`, `/agy:implement`, `/agy:continue`, `/agy:status`, `/agy:result`, `/agy:cancel`, `/agy:setup`.

### Codex

The repo carries a `.codex-plugin/plugin.json` manifest exposing the four skills in `skills/`. Install it by adding this repo as a plugin source in your Codex marketplace setup — e.g. add an entry pointing at this repo in the marketplace you already use (such as a personal `dev-skills`/`devai` marketplace), or install the repo directly with Codex's plugin management UI/command. The skills trigger on `/agy:*` phrasing and natural requests like "have agy review this".

### First-time setup

Run `/agy:setup` once. It checks the `agy` binary, then (after showing you exactly what it will write, and backing the file up) appends a read-only allowlist to `~/.gemini/antigravity-cli/settings.json` so strict-profile runs can gather evidence autonomously.

## The two-profile permission model

Every mode runs under exactly one of two profiles. The mode picks the default; `--strict`/`--loose` override per call.

| | **strict** (default: research, review) | **loose** (default: implement) |
|---|---|---|
| agy invocation | no permission skipping — fail-closed, every unlisted tool call is auto-denied | `--dangerously-skip-permissions` |
| What agy can do | read-only evidence gathering via the setup allowlist: `git gh cat head ls grep find rg wc` (prefix-matched commands) | anything, including editing files and running commands |
| Safety net | agy physically cannot write | git: companion refuses to start on a dirty tree; prints `git diff --stat` after; rollback is `git checkout .` |
| Typical use | surveys, code review | coding tasks; reviews that must run tests (`/agy:review --loose`) |

## Usage and CUJs

```
/agy:review                          # after finishing a feature: the outer agent
                                     # assembles your diff and gets a second opinion
/agy:review --pr 123                 # autonomous: agy fetches the PR itself via gh
/agy:review --target main --loose    # review that may run the test suite
/agy:research "survey how X works in this repo and upstream"
/agy:implement "fix the failing test in foo_test.py"
/agy:continue "now check the error path too"
/agy:status                          # background jobs table
/agy:result <job-id>                 # stored output of a finished job
/agy:cancel <job-id>
/agy:setup                           # install the strict-profile allowlist (confirmed, backed up)
```

### Flags (uniform across modes)

| Flag | Meaning |
|---|---|
| `--conversation <id>` | resume a specific agy conversation |
| `--continue` | reuse this mode's last conversation id from state |
| `--model <id>` | explicit agy model (see `agy models`); overrides `--effort` |
| `--effort low\|medium\|high` | shorthand for `gemini-3.7-flash-<effort>` |
| `--strict` / `--loose` | permission profile override |
| `--background` / `--wait` | execution style override |
| `--json` | (review) schema-enforced JSON findings; default is free-form markdown |
| `--timeout <dur>` | agy `--print-timeout` (defaults: 10m research/implement, 5m review) |
| `--diff-file <path>` | (review) file whose content is inlined into the prompt |
| `--pr <num>` / `--target <ref>` | (review) autonomous evidence gathering |

## State and background jobs

Per-repository state lives in `<repo>/.agy-staff/` (gitignore it in your projects; this repo's `.gitignore` shows the pattern):

- `state.json` — last conversation id per mode + a jobs registry.
- `jobs/<id>.log`, `jobs/<id>.spec.json`, `jobs/<id>.result.md` — one triple per background job.

Background jobs are plain detached processes (the companion re-spawns itself as a worker; no daemon). `status` detects crashed workers by pid liveness; `cancel` kills the pid. Conversation continuation (`--continue`, `/agy:continue`) is cheap: agy serves prior context largely from cache (`cache_read_tokens`).

## Troubleshooting

- **Empty response, "status SUCCESS"** — agy reports success even when every tool call was denied; the content is then empty and stderr carries a permission note. The companion detects this and tells you the fix: run `/agy:setup`, or retry with `--loose`. Caveat baked into agy: some tools ignore allow-rules in headless mode entirely and only work with the skip flag — those always need `--loose`.
- **"inline content over the 200KB limit"** — the whole prompt travels as one argv entry and macOS ARG_MAX is ~1MB; agy does not read stdin. Split the diff or switch to autonomous review (`--pr`/`--target`).
- **Never use agy's `--sandbox` for these modes** — it redirects execution into agy's own scratch workspace (`~/.gemini/antigravity-cli/scratch`) and cannot see your real working directory. The companion never passes it.
- **Dirty-tree refusal on implement** — intentional. Commit or stash so agy's edits are isolated and `git checkout .` is a complete rollback.
- **Project-scoped agy permissions** — agy has project-level rules ("highest priority") tied to its `--project` system; the settings-file path for those is unverified, so setup only edits the global file. If a rule seems ignored, check agy interactively.
- **Rules context** — agy auto-loads `AGENTS.md`/`GEMINI.md`/`.agents/rules/*.md` from the workspace; keep those files sane in repos where you delegate.

## Repository layout

```
companion/agy-companion.mjs   the single brain (all modes, jobs, setup)
templates/                    shared prompt templates (research/review/implement)
.claude-plugin/               Claude Code plugin + self-hosting marketplace manifests
commands/                     Claude Code slash commands (thin shells)
.codex-plugin/plugin.json     Codex plugin manifest
skills/                       Codex skills (thin shells)
```

## License

MIT — see [LICENSE](LICENSE).

*中文文档见 [README.zh-CN.md](README.zh-CN.md).*
