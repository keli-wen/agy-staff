# Composing a general review task

Read this when the review subject is not code: a decision, a plan, a design, a document, or a set of claims. The companion's template carries the reviewer stance (find real problems, no speculative findings) and the guardrails — nothing else. The task string defines everything specific, including the output's shape.

Two composition rules:

1. **The user's request goes through verbatim.** Their numbering, their wording, their scope — the task is theirs, the framing below is scaffolding around it, never a replacement for it.
2. **State the deliverable's shape in the task when the user needs a specific one.** The template imposes no output format by design; if nothing is stated, agy chooses its own structure.

## The framing to append to the task

Challenge the subject from independent angles rather than summarizing or grading it. Angles that earn their place for most subjects:

- **First principles** — rebuild the reasoning from the problem, not from the proposal. Does the conclusion still fall out?
- **Hidden assumptions** — what must be true for this to work that is nowhere stated? Which assumption, if wrong, sinks it?
- **Simpler alternatives** — what cheaper or smaller option was not considered, and why would it not suffice (Occam's razor)?
- **Failure modes** — under what realistic conditions does this break, and what is the blast radius when it does?
- **Evidence** — which claims are backed by something checkable in the environment, and which are conviction? Check the checkable ones.

Drop an angle that plainly has no surface for the subject, and add one the subject demands (cost, timeline, reversibility, security). For each angle, report concrete objections grounded in the subject's own text or the environment — generic caution is noise. Where everything holds up, say so plainly; manufacturing objections is the same failure as rubber-stamping.
