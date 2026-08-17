# Installing agy-staff — a guide for coding agents

You are a coding agent that has been asked to install and verify the **agy-staff** plugin. Follow this file top to bottom. When you finish (or get blocked), report the outcome to the user **in the user's own language** — the language they have been using with you, not necessarily English.

## 0. Prerequisites

1. **`agy` binary** — run `agy --version`. Any recent version works (tested with v1.1.13). If it is missing, do **not** install it yourself: give the user the official install page <https://antigravity.google/docs/cli/install> (macOS/Linux: `curl -fsSL https://antigravity.google/cli/install.sh | bash`) and wait for them to install and authenticate (`agy` run interactively once handles login).
2. **Node.js** — run `node --version`. The companion script uses only the Node standard library.

## 1. Detect which harness you are running in

You normally know which product you are. If unsure, check:

- **Claude Code** — you have `/plugin` slash commands, project instructions arrive via `CLAUDE.md`, and your Bash tool typically has `CLAUDECODE=1` in the environment. → Follow section 2a.
- **Codex** — you invoke skills with `$name` syntax, follow `AGENTS.md`, and plugins are managed through the `codex` CLI. → Follow section 2b.
- **Anything else** — this plugin only ships Claude Code commands and Codex skills. Say so and stop.

Follow exactly one of the two sections below.

## 2a. Claude Code — install / upgrade

Install (use the local checkout path instead of the slug if the user gave you one):

```
/plugin marketplace add keli-wen/agy-staff
/plugin install agy@agy-staff
```

Upgrade an existing install:

```
/plugin marketplace update agy-staff
/plugin install agy@agy-staff
```

## 2b. Codex — install / upgrade

Install (use the local checkout path instead of the URL if the user gave you one):

```bash
codex plugin marketplace add https://github.com/keli-wen/agy-staff
codex plugin add agy@agy-staff
```

Then the user must restart the app — Codex caches plugins per version. Upgrades reach the app only after the plugin version is bumped **and** `codex plugin marketplace upgrade` is run, followed by a restart.

## 3. Smoke test

Run the zero-setup ask mode — it needs no allowlist and answers in ~3 seconds:

- Claude Code: `/agy:ask "reply with OK"`
- Codex: `$agy:agy-ask reply with OK`

Expect a short answer ending with an `[agy-staff]` footer. If it errors, relay the error verbatim; the usual causes are expired agy auth (user runs `agy` interactively once to re-login) or an invalid model id (`agy models` lists valid ids). Do not improvise flags to work around errors.

## 4. Setup — dry run first

The strict permission profile (default for `research`/`review`) needs a read-only allowlist in agy's settings. Run the setup **dry run** first — never apply directly:

- Claude Code: `/agy:setup` (the command itself dry-runs first and asks before applying)
- Codex: `node <plugin-root>/companion/agy-companion.mjs setup` (dry run; only add `--apply` after user confirmation)

Show the user the full dry-run output: which read-only rules would be added, that the target file is `~/.gemini/antigravity-cli/settings.json`, and that it is backed up before writing. Apply only after the user explicitly agrees. If they decline, `ask` still works; autonomous `review --pr` / `research` evidence gathering will need setup later.

## 5. Report back

Tell the user, in **their** language: whether install succeeded, the smoke-test result, and whether the setup allowlist was applied or deferred.
