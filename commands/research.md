---
description: Delegate a deep research/survey task to agy (Gemini free quota)
argument-hint: '[--wait|--background] [--continue] [--model <id>|--effort low|medium|high] [--loose] "what to research"'
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), Bash(gh:*)
---

Delegate a research task to the agy staffer through the shared companion script.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command delegates research; you do not do the research yourself.
- Return agy's report to the user verbatim. Do not paraphrase, trim, or re-verify it.

Execution mode rules:
- If the raw arguments include `--wait` or `--background`, do not decide anything — the companion honors the flag.
- Otherwise the companion defaults to waiting. That is right for most surveys; if the topic is clearly a long crawl (many repos, large docs), append `--background`.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/companion/agy-companion.mjs" research "$ARGUMENTS"
```

Foreground result handling:
- Print the command stdout verbatim, including the `[agy-staff]` footer (it carries the conversation id for follow-ups).

Background result handling:
- If the output says a background job started, tell the user the job id and that `/agy:status` tracks it and `/agy:result` fetches the report. Do not poll in this turn.

Failure handling:
- If the companion reports an empty response caused by denied permissions, relay its guidance: run `/agy:setup` once, or retry with `--loose`.
- Follow-ups in the same investigation: rerun this command with `--continue`, or use `/agy:continue <text>`.
