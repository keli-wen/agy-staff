---
name: lead
description: Orchestrate an ongoing task with AGY while the current agent owns key decisions, review, and delivery. Use when the user invokes /agy:lead or asks you to coordinate a task using AGY.
argument-hint: '[task]'
---

# agy lead

Task orchestration with AGY. You are the lead in the current harness. With an argument, work on that task; otherwise apply this guidance to the active task. Extend it across the session only when the user asks.

## Working with AGY

1. **Delegate substantive work.** Use AGY to advance the task while you own user communication, consequential decisions, acceptance, and delivery. Handle small matters directly when delegation and review would cost more. Stay within the user's requested scope and stage: discussing a proposal does not authorize implementing it.
2. **Default to staffer.** Its brief defines the work, including research, analysis, writing, planning, and implementation. Choose a specialist when the user requests it or its guidance materially improves the assignment: `researcher` for a source-backed survey, `reviewer` for independent critique, `implementer` for a scoped code change with verification. Reserve `ask` for installation smoke tests or explicit testing; do not route ordinary work to it.
3. **Delegate coherent outcomes.** Assign the whole task or a useful result that enables your next decision. Give the worker room to choose its approach. Adapt subsequent assignments to discoveries instead of prescribing every step upfront. Keep related work together when splitting it would create more handoffs than value.
4. **Supply the needed context.** Include the outcome, relevant background and settled decisions, constraints, and evidence or artifacts to return. Preserve explicit authorizations accurately without expanding them. Ask the worker to report consequential assumptions, decisions, and unresolved issues. AGY sees its brief and its conversation, not the host's intervening discussion.
5. **Split by context, not by stage.** Divide work only where assignments share little context: independent research angles, separate sites of one change, black-box verification of a finished artifact. Keep tightly coupled work in one assignment or with you, especially core implementation; do not split one change into implement, test, and review handoffs. Fix cross-cutting decisions such as interfaces, naming, and approach before dispatch and quote them in every affected brief. Workers that edit files in parallel need separate git worktrees, each launched from its own worktree, because job state and continuation are per worktree; otherwise run editing assignments one at a time and parallelize only reads. While AGY runs, advance a different part of the task or wait; avoid duplicating delegated work.
6. **Review, then decide the next step.** Check the evidence that matters for acceptance, including relevant diffs and verification for edits. Read every result yourself and look first for cross-worker inconsistencies: duplicated helpers, conflicting assumptions, interfaces that drifted from a fixed decision. State what was delegated and what was dropped. Integrate useful results and give concrete feedback for gaps. Continue the same conversation when its context helps, supplying new user decisions. Use a fresh conversation for an independent opinion or different context. Take over when another handoff is unlikely to help; deliver when the task is satisfied. Add review rounds only when they resolve meaningful uncertainty.

## Dispatch and follow through

Read `../jobs/SKILL.md` for result collection, cancellation, continuation, and recovery. This skill lives at `<plugin-root>/skills/lead/SKILL.md`. Write the brief to a temporary file and call the shared companion:

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" staffer --prompt-file "<brief-path>"
```

For a specialist, replace `staffer` with `research`, `review`, or `implement`. When requesting code review, use the review-brief guidance in `../reviewer/references/code-review.md`. Modes retain their existing model and permission defaults; honor user overrides. Run unsandboxed as described in `../jobs/references/troubleshooting.md` (escalated execution in Codex).

Keep each returned job ID with its assignment and collect the result through jobs. Prefer `continue --job <id>` for follow-ups; the companion refuses it while that job is still running. Let useful running work finish when feedback can wait; for an immediate change, follow jobs' cancel, confirm termination, then continue sequence. Account for partial work after interruption and follow the existing timeout recovery rules.

In this workflow you compose briefs and synthesize results. The persona skills' thin-shell and verbatim-delivery instructions apply to direct persona invocations. Preserve exact quotes, figures, errors, and evidence references when integrating results. The lead skill uses existing companion modes; it adds no scheduler.
