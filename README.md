<h1 align="center">agy-staff</h1>

<p align="center"><a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a></p>

<p align="center"><a href="https://antigravity.google/product/antigravity-cli"><img src="assets/badges/powered-by-antigravity.svg" alt="powered by: Antigravity"></a> <img src="assets/badges/model-gemini-3-7-flash.svg" alt="model: Gemini 3.7 Flash"> <a href="https://claude.com/claude-code"><img src="assets/badges/claude-code-plugin.svg" alt="Claude Code plugin"></a> <a href="https://developers.openai.com/codex/"><img src="assets/badges/codex-plugin.svg" alt="Codex plugin"></a> <a href="LICENSE"><img src="assets/badges/license-mit.svg" alt="license: MIT"></a></p>

Hire Google's Antigravity CLI (`agy`) as a staffer for **Claude Code** and **OpenAI Codex**.

![agy-staff design](assets/design.en.svg)

## What & Why

agy-staff lets your senior agents delegate to `agy`, which ships fast Gemini 3.7 Flash. Four modes, one plugin name on both platforms: `/agy:ask`, `/agy:research`, `/agy:review`, `/agy:implement` (plus `continue`/`status`/`result`/`cancel`/`setup`).

If you use Codex you know the feeling: GPT-5.6-Sol is slow even with fast mode on. Claude Code is quicker but still not fast, and Fable quota is scarce enough that you want it orchestrating subagents, not grinding through every survey and review itself. An agy worker gives you a fast lane — second opinions in seconds, read-only research and reviews at Flash speed, scoped implementation handled off to the side while you keep moving. And where speed isn't the point, a second model family looking at the same code buys coverage and robustness your main agent can't give itself.

![two overloaded senior agents hand the baton to one fast agy worker](assets/why.png)

## How

*(screenshots coming soon)*
<!-- screenshot: claude-code -->
<!-- screenshot: codex -->

### Install

#### For humans

Step 1 — install the Antigravity CLI ([official docs](https://antigravity.google/docs/cli/install)), then verify with `agy --version` (tested with v1.1.13; Node.js is also required):

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Step 2 — install the plugin into your harness:

```
/plugin marketplace add keli-wen/agy-staff
/plugin install agy@agy-staff
```

```bash
codex plugin marketplace add https://github.com/keli-wen/agy-staff
codex plugin add agy@agy-staff
```

First run: `/agy:ask "reply with OK"` (smoke test, zero setup), then `/agy:setup` (installs the read-only allowlist for autonomous evidence gathering).

#### For agents

Paste this into any coding agent:

```
Read docs/INSTALL_FOR_AGENTS.md in https://github.com/keli-wen/agy-staff (or in your
local checkout of agy-staff) and follow it to install and verify the agy-staff plugin
for the harness you are running in. Respond in the user's language.
```

### CUJs

Invocation is always explicit — you type the command; the plugin never triggers itself on natural language.

| Use case | Claude Code | Codex |
|---|---|---|
| Quick second opinion | `/agy:agy-ask what's your backend model` | `$agy:agy-ask what's your backend model` |
| Review my working diff | `/agy:agy-review review my working diff` | `$agy:agy-review review my working diff` |
| Review PR #123 | `/agy:agy-review review pr #123` | `$agy:agy-review review pr #123` |
| Survey a topic | `/agy:agy-research how does auth work in this repo` | `$agy:agy-research how does auth work in this repo` |
| Implement a scoped fix | `/agy:agy-implement fix the flaky retry test` | `$agy:agy-implement fix the flaky retry test` |
| Continue last conversation | `/agy:continue also check the error path` | `$agy:agy-jobs continue also check the error path` |

**Full reference →** [docs/REFERENCE.md](docs/REFERENCE.md) (flags, permission model, jobs/state, troubleshooting, upgrading).

## License

MIT — see [LICENSE](LICENSE).
