# Installing agy-staff — a guide for coding agents

You are a coding agent that has been asked to install and verify the **agy-staff** plugin. Follow this file top to bottom. When you finish (or get blocked), report the outcome to the user **in the user's own language** — the language they have been using with you, not necessarily English.

> [!IMPORTANT]
> If you reached this file through a URL, read its **raw** text — `curl -fsSL https://raw.githubusercontent.com/keli-wen/agy-staff/master/docs/INSTALL_FOR_AGENTS.md` — or clone the repo. Fetching the rendered page through a web tool that summarises before handing you the content can return a paraphrase, and a paraphrased install command is a broken install command. If all you have is a summary, stop and fetch the raw file.

## 0. Prerequisites

1. **`agy` binary** — run `agy --version`. Any recent version works (tested with v1.1.15). If it is missing, do **not** install it yourself: give the user the official install page <https://antigravity.google/docs/cli/install> (macOS/Linux: `curl -fsSL https://antigravity.google/cli/install.sh | bash`) and wait for them to install and authenticate (`agy` run interactively once handles login).
2. **Node.js** — run `node --version`. The companion script uses only the Node standard library.

## 1. Detect which harness you are running in

You normally know which product you are. If unsure, check:

- **Claude Code** — you have `/plugin` slash commands, project instructions arrive via `CLAUDE.md`, and your Bash tool typically has `CLAUDECODE=1` in the environment. → Follow section 2a.
- **Codex** — you invoke skills with `$name` syntax, follow `AGENTS.md`, and plugins are managed through the `codex` CLI. → Follow section 2b.
- **Anything else** — this plugin only ships Claude Code and Codex skills. Say so and stop.

Follow exactly one of the two sections below.

## 2a. Claude Code — install / upgrade

Use the `claude` CLI. The `/plugin …` forms you may have seen are TUI slash commands typed by a human — you cannot execute them from your Bash tool, and there is no shell equivalent of "typing a slash command".

Install (use the local checkout path instead of the slug if the user gave you one):

```bash
claude plugin marketplace add keli-wen/agy-staff   # human types: /plugin marketplace add keli-wen/agy-staff
claude plugin install agy@agy-staff                # human types: /plugin install agy@agy-staff
```

Upgrade an existing install — note this is `update`, not `install`:

```bash
claude plugin marketplace update agy-staff
claude plugin update agy@agy-staff
```

> [!IMPORTANT]
> `install` never upgrades: on an already-installed plugin it answers "already installed" and does nothing, whatever the version. And `update` is keyed on the **version string**, not the commit — if the published version is unchanged it answers "already at the latest version", so the user keeps running the old commit while the marketplace clone has moved on. Check by comparing `gitCommitSha` in `~/.claude/plugins/installed_plugins.json` against `git -C ~/.claude/plugins/marketplaces/agy-staff log -1`. When they differ but the version does not, force the current commit in: `claude plugin uninstall agy@agy-staff && claude plugin install agy@agy-staff`.

Then verify what actually landed: `claude plugin list` should show `agy@agy-staff` enabled, at the version you expected. If the user is a contributor, watch for an install whose marketplace source is a **local directory** rather than the GitHub slug — that install tracks their working tree, not a release, which is fine for development but is not what "install the plugin" usually means. Say so, and offer the clean path: `claude plugin uninstall agy@agy-staff`, `claude plugin marketplace remove agy-staff`, then add the slug again.

**A restart is required before the plugin is usable.** A freshly installed plugin is not in the current session's skill registry, so `/agy:…` either does not resolve or — if an older copy was loaded when the session started — silently resolves to that stale copy. Tell the user to restart Claude Code, or verify without a restart using the shell fallback in section 3.

## 2b. Codex — install / upgrade

Install (use the local checkout path instead of the URL if the user gave you one):

```bash
codex plugin marketplace add https://github.com/keli-wen/agy-staff
codex plugin add agy@agy-staff
```

Then the user must restart the app — Codex caches plugins per version. Upgrades reach the app only after the plugin version is bumped **and** `codex plugin marketplace upgrade` is run, followed by a restart.

> [!IMPORTANT]
> Codex's command sandbox cannot run agy. agy binds a localhost port for its internal language server and reads its OAuth token file; the workspace-write sandbox blocks the bind and hides the token (secret protection — no `writable_roots`/`network_access` config opens it). Every companion command (both job dispatch and management commands such as `wait`, `status`, `result`) must run **unsandboxed**: the workspace needs full access, or each companion command needs escalated approval. The failure signature is `operation not permitted` on `~/.gemini/antigravity-cli/...` followed by empty output or a bogus "authentication failed".

## 3. Smoke test

Run the zero-setup ask mode — it needs no allowlist and answers in ~3 seconds:

- Claude Code: `/agy:ask "reply with OK"` — **after the restart**, otherwise you are testing the old copy or nothing at all
- Codex: `$agy:ask reply with OK`

If you cannot restart the session, call the companion of the freshly installed copy directly from the shell. It is the same code path the skill takes, so a pass here means the install is sound:

```bash
AGY_ROOT=$(node -p 'require(process.env.HOME+"/.claude/plugins/installed_plugins.json").plugins["agy@agy-staff"][0].installPath')
node "$AGY_ROOT/companion/agy-companion.mjs" ask --prompt "reply with OK"
```

Resolve the root that way rather than globbing `cache/agy-staff/agy/*/`: superseded version directories are left behind after an upgrade, so the glob expands to several paths and the command fails with `unknown subcommand`. `installPath` is always the copy in use. (Codex's equivalent root is printed by `codex plugin list`.) A fallback pass still leaves the restart outstanding — report it as "installed and verified, restart Claude Code to use it".

Expect a short answer on stdout with no telemetry mixed in, plus an `[agy-staff]` telemetry line on stderr (mode, profile, model, duration, tokens, conversation id — for you, not for the user). If it errors, relay the error verbatim; the usual causes are expired agy auth (user runs `agy` interactively once to re-login) or an invalid model id (`agy models` lists valid ids). Do not improvise flags to work around errors.

> [!IMPORTANT]
> A passing `ask` smoke means the install is done. `staffer`, `researcher`, `reviewer` and `implementer` all default to the **unrestricted** profile, so they gather evidence and edit files without any allowlist — nothing else is required to use them. Section 4 (`setup`) is **optional hardening**: it only matters if the user wants to run with `--restricted`, where headless agy fail-closes on every tool call that is not on the allowlist. Do not run setup unprompted; offer it, and apply it only if the user asks for the hardened path.

## 4. Optional hardening — setup, dry run first

Skip this section unless the user wants it. Every tool-using mode already works unrestricted; setup exists so that the opt-in `--restricted` profile is usable, because a restricted run needs an **evidence-gathering command allowlist** in agy's settings or it comes back empty. Mention it to security-sensitive users (shared machines, reviewing untrusted PRs) and let them decide. Setup can also record a per-repo policy (`setup --restrict review,research` makes those modes default to restricted in the current repository; `--restrict none` clears it) — offer that only in the same opt-in conversation.

If they opt in, global install is the normal path. Run the setup **dry run** first — never apply directly:

```bash
node <plugin-root>/companion/agy-companion.mjs setup   # dry run; only add --apply after user confirmation
```

The full guided flow lives in the jobs skill (`skills/jobs/references/setup.md`).

Show the user the full dry-run output and state these four things plainly before asking for confirmation:

1. Which command rules would be added, and that they exist so `--restricted` runs can gather evidence unattended.
2. The target file is the **global** `~/.gemini/antigravity-cli/settings.json`, so the rules apply to every `agy` run on this machine — not only to agy-staff jobs.
3. The rules are **prefix-matched, so this is not a read-only allowlist**: `command(git)` also matches `git push`, `command(gh)` also matches `gh pr merge`.
4. The existing file is backed up before writing.

Apply only after the user explicitly agrees. If they decline, nothing is lost from the default experience — all four modes keep working; they simply cannot harden a run with `--restricted` until the allowlist exists.

If the user is security-sensitive and the machine-wide scope is unacceptable, tell them agy also supports project-scoped permission rules (highest priority) tied to its `--project` system — but that **the project-settings file path is undocumented and unverified against the current agy release**. Do not guess a path and do not write one; point them at [REFERENCE.md → Advanced: project-scoped permissions](REFERENCE.md#advanced-project-scoped-permissions) and let them verify it interactively with `agy`.

## 5. The execution model

`ask` returns its answer synchronously. `staffer`, `research`, `review` and `implement` return a job id, and the job-start output prints the exact collect command (`wait <id> --timeout <n>m`). Run that as a background command — one background wait per job — and deliver the result when it exits; exit code 2 means still running, so run the same `wait` again (`cancel <id>` stops the job). Do not leave a started job unreported.

Per-repo state lives in `<repo>/.agy-staff/`; the companion git-ignores it automatically on first use (via `.git/info/exclude` — the tracked `.gitignore` is never touched).

## 6. Report back

Tell the user, in **their** language: whether install succeeded (name the version and whether it came from the GitHub slug or a local checkout), the smoke-test result, whether a restart is still needed before the skills load, and whether the optional setup allowlist was applied, declined, or never offered (the default unrestricted profile does not need it).
