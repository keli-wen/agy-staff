---
description: Ask agy (fast Gemini) a cheap one-shot question; also the post-install smoke test
argument-hint: '[--continue] [--model <id>|--effort low|medium|high] [--timeout <dur>] "question"'
allowed-tools: Bash(node:*)
---

Ask the agy staffer a quick question. This is the cheap, fast mode (~3s on the default `gemini-3.7-flash-low`): zero tools, question-only prompt, no `/agy:setup` required — it works on a fresh install, which makes it the smoke test.

Raw slash-command arguments:
`$ARGUMENTS`

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" ask "$ARGUMENTS"
```

Rules:
- Pass the user's question through verbatim; do not rephrase or enrich it.
- Return the answer verbatim, including the `[agy-staff]` footer (it carries the conversation id; follow up with `--continue` or `/agy:continue`).
- ask is always foreground; the companion rejects `--background` with an explanation — relay it if that happens.
- If the answer says "not sure", relay that as-is; do not fill the gap with your own guess without telling the user it is yours.

## Failure protocol

- If the companion exits with an error, relay the error message to the user verbatim and stop.
- Do not retry with different flags unless the error message itself suggests the exact flag.
- Never change directories, search the filesystem, or pick a different repo to satisfy a precondition — preconditions are safety features, not obstacles.

## Model ids

agy only accepts effort-suffixed model ids: `gemini-3.7-flash-low|medium|high`, `gemini-3.6-flash-*`, `gemini-3.5-flash-*`, `gemini-3.1-pro-low|high` (no medium for pro), plus `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`. The companion also accepts a bare family (e.g. `--model gemini-3.7-flash`, suffixed from `--effort`, default medium) and the aliases `flash` (gemini-3.7-flash) and `pro` (gemini-3.1-pro). Anything else fails pre-flight before agy is called; `agy models` lists valid ids.
