## Shared dispatch rules

### Continue or start fresh

- Before dispatching, decide whether this is a follow-up to prior AGY work in this chat. For the same task and persona, continue the existing session when its context helps, even when the user does not say "continue".
- Keep each returned job ID with its assignment in your chat context (background runs print `job id: <id>` on stdout; synchronous `ask` prints `job=<id>` on stderr; `status` lists all recorded jobs). Resume with `continue --job <id> --prompt-file <brief-path>` (or `--prompt` / `--stdin`); the job determines the persona and execution style. Never call bare `continue`, use removed `--continue` / `--conversation` flags, pass `--job` to a persona command, or pass a conversation ID as `--job`. If the target job is unclear, resolve it from the chat and known job records; ask only if it remains ambiguous.
- Start a fresh persona invocation for an unrelated task, an independent opinion, an explicit fresh start, or a different persona. Pass relevant findings and artifact paths in its brief rather than sharing the old session across roles.
- A continued worker knows its own history, but not the intervening host chat. Include new user decisions, constraints, and authorizations explicitly in the follow-up brief.
- These defaults cover normal follow-ups, not automatic timeout recovery. For a running, failed, canceled, or timed-out job, follow `../jobs/SKILL.md` before acting. Do not automatically retry after a timeout.

### Task input and execution

- Pass the user's task and explicit authorizations through verbatim. Supply the task through exactly one of `--prompt`, `--prompt-file`, or `--stdin`; prefer file/stdin for long text. Continuing context does not expand authorization.
- Resolve the companion relative to this skill: `<skill-dir>/../../companion/agy-companion.mjs`. Run it **unsandboxed**: AGY needs a localhost port and its OAuth token file. In Codex, request escalated execution. Read `../jobs/references/troubleshooting.md` for permission failures.
- Read `../jobs/SKILL.md` for result collection and recovery. Preserve persona-specific delivery instructions and keep companion telemetry out of the user-facing result unless requested.
