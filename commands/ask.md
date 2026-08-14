---
description: Ask agy (Gemini free quota) a cheap one-shot question; also the post-install smoke test
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
