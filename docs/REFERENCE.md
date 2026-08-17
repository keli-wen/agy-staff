# agy-staff — Full reference

Back to the [README](../README.md). 中文版见 [REFERENCE.zh-CN.md](REFERENCE.zh-CN.md)。

## Modes and defaults

| Mode | What it is | Default model | Default profile | Default execution |
|---|---|---|---|---|
| `ask` | Cheap zero-tool one-shot Q&A (~3s); doubles as the post-install smoke test | `gemini-3.7-flash-low` | strict (prompt-only) | wait (always) |
| `research` | Deep survey with cited sources and explicit unverified-claims marking | `gemini-3.7-flash-high` | strict | wait |
| `review` | Second-opinion verifier: severity-ranked findings with `file:line` refs | `gemini-3.7-flash-medium` | strict | wait |
| `implement` | Well-scoped coding task; agy edits the working tree, you review the diff | `gemini-3.7-flash-medium` | loose | background |

Both platforms surface the same commands under the `agy` plugin name (`/agy:*`), backed by one companion script (`companion/agy-companion.mjs`, Node stdlib only) and shared prompt templates (`templates/`).

## The two-profile permission model

Every mode runs under exactly one of two profiles. The mode picks the default; `--strict`/`--loose` override per call (`ask` is tool-free and ignores both).

| | **strict** (default: ask, research, review) | **loose** (default: implement) |
|---|---|---|
| agy invocation | no permission skipping — fail-closed, every unlisted tool call is auto-denied | `--dangerously-skip-permissions` |
| What agy can do | read-only evidence gathering via the setup allowlist: `git gh cat head ls grep find rg wc` (prefix-matched commands) | anything, including editing files and running commands |
| Safety net | agy physically cannot write | git: companion refuses to start on a dirty tree; prints `git diff --stat` after; rollback is `git checkout .` |
| Typical use | Q&A, surveys, code review | coding tasks; reviews that must run tests (`/agy:review --loose`) |

The loose git preconditions (repo present, clean tree) apply only to `implement` and `review`.

### First-time setup

Run `/agy:setup` once. It checks the `agy` binary, then (after showing you exactly what it will write, and backing the file up) appends a read-only allowlist to `~/.gemini/antigravity-cli/settings.json` so strict-profile runs can gather evidence autonomously.

## Flags (uniform across modes)

| Flag | Meaning |
|---|---|
| `--conversation <id>` | resume a specific agy conversation |
| `--continue` | reuse this mode's last conversation id from state |
| `--model <id>` | explicit agy model (see `agy models`). Ids are effort-suffixed (`gemini-3.7-flash-low`); the companion normalizes bare families (`gemini-3.7-flash` + `--effort`) and the aliases `flash`/`pro`, and rejects unknown ids pre-flight |
| `--effort low\|medium\|high` | shorthand for `gemini-3.7-flash-<effort>` |
| `--strict` / `--loose` | permission profile override (ignored by `ask`) |
| `--background` / `--wait` | execution style override (ask is always foreground and rejects `--background`) |
| `--json` | (review) schema-enforced JSON findings; default is free-form markdown |
| `--timeout <dur>` | agy `--print-timeout` (defaults: 10m research/implement, 5m review, 2m ask) |
| `--diff-file <path>` | (review) file whose content is inlined into the prompt |
| `--pr <num>` / `--target <ref>` | (review) autonomous evidence gathering |

## State and background jobs

Per-repository state lives in `<repo>/.agy-staff/` (gitignore it in your projects; this repo's `.gitignore` shows the pattern):

- `state.json` — last conversation id per mode + a jobs registry.
- `jobs/<id>.log`, `jobs/<id>.spec.json`, `jobs/<id>.result.md` — one triple per background job.

Background jobs are plain detached processes (the companion re-spawns itself as a worker; no daemon). `status` detects crashed workers by pid liveness; `cancel` kills the pid. Conversation continuation (`--continue`, `/agy:continue`) is cheap: agy serves prior context largely from cache (`cache_read_tokens`).

## Troubleshooting

- **"agy reported an error (status ERROR)"** — the companion relays agy's own error verbatim. Likely causes: invalid model id (agy needs effort-suffixed ids — run `agy models`), expired auth (run `agy` interactively once to re-login), or exhausted quota.
- **Empty response, "status SUCCESS"** — agy reports success even when every tool call was denied; the content is then empty and stderr carries a permission note. The companion detects this and tells you the fix: run `/agy:setup`, or retry with `--loose`. Caveat baked into agy: some tools ignore allow-rules in headless mode entirely and only work with the skip flag — those always need `--loose`. (`ask` cannot hit this case; if it does, report a bug.)
- **"inline content over the 200KB limit"** — the whole prompt travels as one argv entry and macOS ARG_MAX is ~1MB; agy does not read stdin. Split the diff or switch to autonomous review (`--pr`/`--target`).
- **Never use agy's `--sandbox` for these modes** — it redirects execution into agy's own scratch workspace (`~/.gemini/antigravity-cli/scratch`) and cannot see your real working directory. The companion never passes it.
- **Dirty-tree refusal on implement** — intentional. Commit or stash so agy's edits are isolated and `git checkout .` is a complete rollback.
- **Project-scoped agy permissions** — agy has project-level rules ("highest priority") tied to its `--project` system; the settings-file path for those is unverified, so setup only edits the global file. If a rule seems ignored, check agy interactively.
- **Rules context** — agy auto-loads `AGENTS.md`/`GEMINI.md`/`.agents/rules/*.md` from the workspace; keep those files sane in repos where you delegate.

## Upgrading

Codex caches plugins under a per-version directory (e.g. `plugins/cache/agy-staff/agy/0.1.0`), so a fix only reaches the app after the plugin version is bumped **and** you run `codex plugin marketplace upgrade` (or remove and re-add the marketplace entry), then restart the app. For Claude Code, update the marketplace and reinstall (`/plugin marketplace update agy-staff`, then `/plugin install agy@agy-staff`).

## Repository layout

```
companion/agy-companion.mjs   the single brain (all modes, jobs, setup)
templates/                    shared prompt templates (ask/research/review/implement)
.claude-plugin/               Claude Code plugin + self-hosting marketplace manifests
commands/                     Claude Code slash commands (thin shells)
.codex-plugin/plugin.json     Codex plugin manifest
.agents/plugins/              Codex marketplace manifest
skills/                       Codex skills (thin shells)
assets/                       design diagrams (en / zh-CN)
docs/                         this reference
```
