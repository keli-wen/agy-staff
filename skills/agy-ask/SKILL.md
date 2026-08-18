---
name: agy-ask
description: Ask Google's Antigravity CLI (agy staffer, fast Gemini) a cheap one-shot question - the fast zero-tool mode and the post-install smoke test. Use when the user says /agy:ask, "ask agy", "quick second opinion from agy", or right after installing to verify the plugin works.
---

# agy ask

The quick mode: one question in, one answer out, ~3 seconds on the default `gemini-3.7-flash-low`. Zero tools by design (restricted profile, question-only prompt), so it needs no setup and works on a fresh install — run it first as the smoke test: `ask "reply with OK"`.

ask is the only mode that runs in the foreground: the call blocks and the answer comes back on stdout. research, review, and implement instead return a background job id (see the agy-jobs skill).

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-ask/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" ask [flags] "question"
```

> [!IMPORTANT]
> Run this command **unsandboxed**. agy cannot work inside the harness command sandbox: it binds a localhost port for its internal language server and reads its OAuth token file, which sandbox secret-protection hides — the run then dies with `operation not permitted` or a bogus "authentication failed". In Codex, request escalated permissions for the command (or have the user set the chat to full access).

(The shell call is gated by Codex's own approval and sandbox policy.)

## Flags (all optional)

- `--continue` — reuse the last ask conversation; `--conversation <id>` targets a specific one.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.7-flash-low`.
- `--timeout <dur>` — default 2m.

ask is always restricted (it is tool-free, so there is nothing to unrestrict); `--unrestricted` is ignored with a note on stderr. That is fixed for ask alone — research, review, and implement default to unrestricted, where `--restricted` is an opt-in hardening flag. Execution style is likewise fixed per mode and no flag changes it.

## Rules

- Pass the user's question through verbatim and return the answer verbatim. The `[agy-staff]` telemetry line arrives on stderr and is metadata for you, the calling agent — do not show it to the user; mention the follow-up ability in natural language when relevant, and give model/duration/token numbers only if asked.
- If the answer says "not sure", relay it as-is; do not silently substitute your own answer.

## Failure protocol

- If the companion exits with an error, quote its error message verbatim, add one line of your own diagnosis and the suggested next step, then stop — do not retry with different flags unless the error itself names one.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
