<p align="center"><img src="assets/logo/gemini-agy.svg" width="440" alt="AGY-STAFF"></p>

<p align="center"><a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a></p>

<p align="center"><a href="https://antigravity.google/product/antigravity-cli"><img src="assets/badges/powered-by-antigravity.svg" height="20" alt="powered by: Antigravity"></a> <img src="assets/badges/model-gemini-3-7-flash.svg" height="20" alt="model: Gemini 3.7 Flash"></p>

<p align="center"><a href="https://claude.com/claude-code"><img src="assets/badges/claude-code-plugin.svg" height="20" alt="Claude Code plugin"></a> <a href="https://developers.openai.com/codex/"><img src="assets/badges/codex-plugin.svg" height="20" alt="Codex plugin"></a> <a href="LICENSE"><img src="assets/badges/license-mit.svg" height="20" alt="license: MIT"></a></p>

Hire Google's Antigravity CLI (`agy`) as a staffer for **Claude Code** and **OpenAI Codex**.

![agy-staff design](assets/design.png)

## What & Why

agy-staff lets your senior agents delegate to `agy`, which ships fast Gemini 3.7 Flash. Four modes, one plugin name on both platforms: `/agy:ask`, `/agy:research`, `/agy:review`, `/agy:implement` (plus `continue`/`wait`/`status`/`result`/`cancel`/`setup`).

If you use Codex you know the feeling: GPT-5.6-Sol is slow even with fast mode on. Claude Code is quicker but still not fast, and Fable quota is scarce enough that you want it orchestrating subagents, not grinding through every survey and review itself. An agy worker gives you a fast lane — second opinions in seconds, research and reviews at Flash speed, scoped implementation handled off to the side while you keep moving. And where speed isn't the point, a second model family looking at the same code buys coverage and robustness your main agent can't give itself.

![two overloaded senior agents hand the baton to one fast agy worker](assets/why.png)

## How

Type `/agy:` in Claude Code and the four modes plus the job commands are right there:

![the /agy: command menu in Claude Code](assets/claude-code-screenshot.png)

Same plugin in Codex, invoked with `$agy`:

![the $agy skill picker in Codex](assets/codex-desktop-screenshot.png)

### Install

#### For humans

Step 1 — install the Antigravity CLI ([official docs](https://antigravity.google/docs/cli/install)), then verify with `agy --version` (tested with v1.1.13; Node.js is also required):

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Step 2 — install the plugin into your harness:

```bash
claude plugin marketplace add keli-wen/agy-staff
claude plugin install agy@agy-staff
```

```bash
codex plugin marketplace add https://github.com/keli-wen/agy-staff
codex plugin add agy@agy-staff
```

First run: `/agy:ask "reply with OK"` — ask is tool-free and works with zero setup.

> [!IMPORTANT]
> **There is no mandatory setup step.** `research`, `review` and `implement` run **unrestricted** by default: agy gathers evidence and edits files on its own, guarded by the prompt templates (no commits/pushes, no costly side effects) plus a clean-git-tree check on `implement`.
> `/agy:setup` + `--restricted` is **optional hardening** for untrusted input — per run (`--restricted`) or as a per-repo default (`setup --restrict review,research`). `setup` dry-runs and asks before writing anything; read the [permission notes](docs/REFERENCE.md#optional-hardening-setup) first — the allowlist is prefix-matched, applies machine-wide, and a restricted run can return less than an unrestricted one.

#### For agents

Paste this into any coding agent:

```
Read docs/INSTALL_FOR_AGENTS.md in https://github.com/keli-wen/agy-staff (or in your
local checkout of agy-staff) and follow it to install and verify the agy-staff plugin
for the harness you are running in. Respond in the user's language.
```

#### Upgrade

Both harnesses install a *copy*, so a new version only reaches you after you re-run the install:

```bash
claude plugin marketplace update agy-staff && claude plugin install agy@agy-staff
```

```bash
codex plugin marketplace upgrade && codex plugin add agy@agy-staff  # then restart Codex
```

Codex caches plugins per version directory, so an upgrade lands only if the plugin version changed — see [upgrading](docs/REFERENCE.md#upgrading) if a fix does not show up.

### CUJs

Invocation is always explicit — you type the command; the plugin never triggers itself on natural language.

| Use case | Claude Code | Codex |
|---|---|---|
| Quick second opinion | `/agy:agy-ask what's your backend model` | `$agy:agy-ask what's your backend model` |
| Review the working tree | `/agy:agy-review Review the current working tree` | `$agy:agy-review Review the current working tree` |
| Review a PR | `/agy:agy-review Review PR #730` | `$agy:agy-review Review PR #730` |
| Review against a branch | `/agy:agy-review Review changes against master` | `$agy:agy-review Review changes against master` |
| Review a patch file | `/agy:agy-review Review the patch at /tmp/change.patch` | `$agy:agy-review Review the patch at /tmp/change.patch` |
| Survey a topic | `/agy:agy-research how does auth work in this repo` | `$agy:agy-research how does auth work in this repo` |
| Implement a scoped fix | `/agy:agy-implement fix the flaky retry test` | `$agy:agy-implement fix the flaky retry test` |
| Continue last conversation | `/agy:continue also check the error path` | `$agy:agy-jobs continue also check the error path` |

`review` is fully prompt-based: you describe the subject and agy gathers the evidence itself (`gh pr view`, `git diff`, reading the file) — there is no flag for handing it a diff.

`ask` answers in the same call. `research`, `review` and `implement` run as background jobs: the call returns a job id, and `/agy:wait <id>` blocks until the job finishes and prints the result (`/agy:status` peeks, `/agy:cancel <id>` stops it).

**Full reference →** [docs/REFERENCE.md](docs/REFERENCE.md) (flags, permission model, jobs/state, troubleshooting, upgrading).

## Contributing

Contributions are welcome — issues, bug reports and pull requests all help.

Three things worth knowing before you open a PR:

- **Run the tests**: `node --test tests/*.test.mjs`. They are black-box tests against a fake `agy` (`tests/fake-agy.mjs`) in a throwaway repo and HOME, so they never hit the network or your real settings. Keep it that way — a test must never invoke the real binary.
- **Docs come in pairs**: `README.md` / `README.zh-CN.md` and `docs/REFERENCE.md` / `docs/REFERENCE.zh-CN.md` are kept in sync. Change one, change its counterpart.
- **Behaviour lives in one place**: `companion/agy-companion.mjs` holds all of it. The commands and skills are thin shells that call it, and the prompt templates in `templates/` carry the guardrails.

Adding a mode or a flag changes the public surface, so please open an issue first and we can agree on the shape.

## License

MIT — see [LICENSE](LICENSE).
