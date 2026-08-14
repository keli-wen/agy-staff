---
name: agy-ask
description: Ask Google's Antigravity CLI (agy staffer, free-quota Gemini) a cheap one-shot question - the fast zero-tool mode and the post-install smoke test. Use when the user says /agy:ask, "ask agy", "quick second opinion from agy", or right after installing to verify the plugin works.
---

# agy ask

The quick mode: one question in, one answer out, ~3 seconds on the default `gemini-3.7-flash-low`. Zero tools by design (strict profile, question-only prompt), so it needs no setup and works on a fresh install — run it first as the smoke test: `ask "reply with OK"`.

## Locating the companion

This skill file lives at `<plugin-root>/skills/agy-ask/SKILL.md`; resolve the companion path relative to this skill directory:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" ask [flags] "question"
```

(The shell call is gated by Codex's own approval and sandbox policy.)

## Flags (all optional)

- `--continue` — reuse the last ask conversation; `--conversation <id>` targets a specific one.
- `--model <id>` or `--effort low|medium|high` — default model is `gemini-3.7-flash-low`.
- `--timeout <dur>` — default 2m.
- `--background` is rejected: ask is always foreground.

## Rules

- Pass the user's question through verbatim and return the answer verbatim, including the `[agy-staff]` footer.
- If the answer says "not sure", relay it as-is; do not silently substitute your own answer.
