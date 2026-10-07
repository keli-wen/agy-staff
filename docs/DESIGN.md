# Design

This document describes how agy-staff is designed as a portable agent CLI tool: bash plus skills, with no hard dependency on a particular host, worker CLI or runtime library. It is the ground truth for the project's behavior and a guide for building the same kind of tool for another agent CLI. Concrete commands, flags and default values are in [REFERENCE.md](REFERENCE.md).

## 1. The problem and two ideas

A host agent (Claude Code, Codex, Pi, OpenCode) wants to hand work to another agent CLI while it keeps its attention on decisions. The integration sits between them, and its caller is a model, not a person. A model pays for every byte it reads, cannot be woken by a background process, and acts on whatever an output seems to ask of it. Most of the design follows from that.

Two ideas run through everything below:

1. **Design the CLI for a model as its caller.** States are exit codes, outputs are bounded, next steps are spelled out, and nothing requires the caller to poll.
2. **Disclose progressively, from instructions through runtime.** Every layer, from the skill description to the job log, opens only when the caller needs it, and each layer points to the next.

## 2. Roles

| Role | Owns |
| --- | --- |
| User | Goals, authorizations, and confirmation of anything costly or irreversible |
| Host agent | User communication, the brief, cross-task decisions, acceptance, integration and delivery |
| Worker (the external agent CLI) | The substantive work its brief describes |
| Integration (skills and companion) | Translation and the job lifecycle |

The integration never judges. It does not decide whether work is good enough, whether to retry, or what comes next. It reports facts and options; the host and the user decide.

## 3. Architecture: thin skills over a companion CLI

- **The companion CLI is the interface.** A command, an exit code, stdout and files are what every host can use. Any host with a shell tool and a way to load instructions can integrate, and so can a script. The host never calls the worker CLI directly.
- **Skills only translate.** A skill tells the host when a role applies, how to compose the brief, which command to run and how to collect the result. Users speak natural language; flags appear only in the commands the host composes.
- **No install step.** The companion uses only its runtime's standard library, so a copied plugin directory runs as is.
- **One source, many hosts.** Skills are written once and per-host variants are generated. A compatibility clause tells the host to reach an equivalent result with its own tools when a named tool is missing, keeping the goal, the authorizations, the confirmation steps and the stopping conditions. When it cannot establish an equivalent, it explains the gap and asks the user.
- **Prompt templates belong to the companion**, so every host sends the worker the same contract.

## 4. Progressive disclosure

| Layer | Opens when | Contents |
| --- | --- | --- |
| Skill description | Always loaded | When to use the role |
| Skill body | The role is invoked | How to brief, run and collect |
| References | A specific flavor or failure needs them | One topic per file, such as code review, plan review or troubleshooting |
| Dispatch output | A job starts | The job id and the command that collects it |
| Snapshot (`observe`) | The user asks about progress, or a failure needs diagnosis | Bounded progress; never the report |
| Result (`wait` / `result`) | The job ends | The full report |
| Logs and raw events | Diagnosis only | Read as bounded excerpts |

- **Every output is bounded and names the next layer**: a result path, a collection command or a log pointer.
- **The deliverable and the metadata travel separately.** Stdout carries the report. Telemetry (model, duration, usage, conversation id) goes to stderr or the job log; it is for the host, not the user.
- **Large inputs travel as references.** The brief names the PR, branch, patch or file, and the worker fetches the material itself. This keeps the host's context small, avoids argument-size limits, and lets the worker verify what it reads.

## 5. The brief

- **The brief is all the worker knows.** The worker sees its brief and its own conversation, not the host's discussion. A brief states the outcome and completion criteria, the relevant background and constraints, settled decisions, existing authorizations, and the shape of the deliverable.
- **Task text is opaque.** It arrives through exactly one explicit source: an argument, a file or stdin. The companion never re-splits it, and flag-like text inside it stays text. A misparsed brief silently changes behavior, which is worse than a rejected command.
- **The user's words pass through.** The host forwards the request and its authorizations verbatim and adds framing around them, never in place of them.
- **Personas are thin.** A persona template adds a stance, an evidence discipline and the guardrails, nothing tied to a particular task. Flavor-specific contracts, such as how to review code versus a plan, travel in the brief; the skill composes them from a reference file.

| Persona | Contract |
| --- | --- |
| `ask` | One synchronous answer with no tools. Says "not sure" rather than guessing. Doubles as the installation smoke test. |
| `staffer` | General work. Only the guardrails are added; the task text alone shapes the output. |
| `researcher` | Every non-obvious claim carries its evidence. Observation is kept apart from inference. The report ends with what remains unverified. Tracked files stay untouched. |
| `reviewer` | Findings only with inspected evidence and a concrete failure mode. An ambiguous subject is reported, not guessed. An empty list from a shallow read and a confident false alarm are both failures. Tracked files stay untouched. |
| `implementer` | A minimal diff in the codebase's own conventions, verified before finishing. Changes stay uncommitted unless delivery is requested. An ambiguity gets the most conservative reading, with the alternatives flagged. |

On a direct persona invocation the host is a thin shell: it returns short results verbatim and never fixes what a reviewer found. Under orchestration (section 10) the host assesses and synthesizes instead, keeping quotes, numbers and errors exact.

## 6. Job lifecycle

- **Dispatch returns immediately.** Every tool-using persona starts a detached worker process and returns a job id. Only the tool-free quick question runs in the foreground. The execution mode is fixed per persona; no flag changes it.
- **The worker persists everything as it arrives.** It records the raw event stream, publishes progress snapshots by atomic replacement, and stores the result and a final status. Nothing depends on the host staying attached.
- **States are exit codes.** Collection and status commands exit with one code per state, so the host can branch without parsing prose:

| Exit | State | Host's next step |
| --- | --- | --- |
| 0 | Done: the invocation ended and the response was delivered | Assess the result |
| 2 | Running: this wait expired | Wait again on the same job |
| 3 | Error or crash | Read the diagnosis |
| 4 | Canceled | Report it, or run an already-authorized follow-up |
| 5 | Attention: a resumable timeout | Ask the user whether to continue |
| 1 | The command itself was invalid | Fix the named problem |

- **Two clocks.** A wait has a soft expiry and the job has a hard execution budget. A wait expiring never stops the job, and waiting or observing never extends the budget.
- **Wait, don't poll.** Where the host can run background commands, keep one background wait per job, never several jobs serially in one shell. Otherwise use the longest blocking wait the host allows. Avoid sleep loops and routine progress checks. The integration cannot wake an idle model; the host decides when the model receives a result.
- **Observe only when necessary.** The host sometimes needs to see inside a running job: when the user asks about progress, or when a failure needs diagnosis. Observation answers with a bounded snapshot of recent tool activity, the latest response excerpt and timestamps, with truncated and incomplete parts labeled, and never the report. Reading a snapshot consumes nothing and resets nothing. A snapshot shows activity; it is not a judgment of progress.
- **Say what an output does not mean.** "Done" means the response was delivered, not that the work is accepted. A snapshot attached to an expired wait is not a request to intervene. A model acts on cues, so unlabeled outputs get over-read.
- **Cancel is confirmed.** A cancel records the request and succeeds only after the worker has stored its cancellation report and published the canceled state. Interrupting a wait does not cancel the job. Cancellation does not roll back edits.
- **Continue and restart are different operations.** Continue resumes the worker's conversation with its recorded configuration, and explicit flags override it. Restart reruns the original task in a fresh conversation with refreshed workspace context. Both create a new linked job and keep the old record. A follow-up to a running job is refused rather than queued, so the host decides whether to wait or cancel first.
- **Recovery waits for the user.** A timeout that leaves a resumable conversation becomes attention. The report carries the partial state, the workspace status before and after, and the exact command to continue with a larger budget. The integration never retries, continues or restarts on its own.
- **Collect where you launched.** Management commands run in the same execution context as the launch. A different sandbox may not see the worker process and would report a live job as crashed.

## 7. Authority and the workspace

- **Default-closed, opened by the task.** Templates forbid costly or irreversible side effects unless the task asks for them: commits, pushes and history rewrites; deleting files outside the workspace or files the worker did not create; side-effectful network calls; commands that spend paid quota. Scratch files go to a temporary directory. An authorization opens exactly what it names, and the worker reports what it ran.
- **Prompt guardrails are not isolation, and the documentation says so.** There are two permission profiles. Unrestricted bypasses the worker CLI's approval checks so the integration works without setup. Restricted keeps the worker CLI's own permission checks on. Untrusted content calls for the restricted profile or an isolated checkout.
- **Resolve the profile in a fixed order**: an explicit flag, then the profile of the conversation being continued, then a per-repository policy, then the built-in default.
- **Existing changes belong to the user.** Before an editing run, tell the worker which paths were already changed. The worker builds on those changes only when the task includes them, and asks before overwriting, cleaning, stashing or resetting them.
- **Audit the workspace.** Compare version-control status before and after each run and report the difference: neutrally for general work, as a warning for read-only roles. When an editing role runs outside version control, warn that its edits cannot be reviewed or rolled back, then proceed.
- **Attach the workspace explicitly.** Pass the repository to the worker CLI rather than relying on an inherited working directory, since some CLIs run elsewhere otherwise.
- **Local state stays local.** Job state lives in a per-repository directory that the integration excludes from version control locally, without editing the shared ignore file.

## 8. Errors

- **Preserve the worker's own error.** Add a hint only when the error matches a known pattern, such as an unknown model, an expired login or a sandbox restriction.
- **Classify narrowly.** Only an explicit response timeout counts as a timeout. Tool, network, authentication and quota failures keep their own classes.
- **A response that arrived still counts.** If the worker reports an error after producing a response, deliver the response with a warning and let the host assess it.
- **Never substitute silently.** An unknown model fails before launch and lists valid alternatives. A removed flag fails with its replacement spelled out.
- **Crash reports are actionable and safe.** They include the launch record, the process id, whether the log exists and its size, and the next commands to run. They never include the full prompt or the environment.

## 9. State and processes

- **One state file per repository**, updated under a short transactional lock that recovers from stale holders. Readers do not take the lock.
- **Per-job files**: the specification, the log, the raw events, the progress snapshot, the result and the final status. Intermediate files are removed after a clean success and kept after an error, a cancellation, a timeout or a warning.
- **Stop the whole process tree, and only the right one.** The worker runs in its own process group. Before signaling a process, verify its identity, for example by its start time; never trust a stored PID alone, because process ids are reused. Bound the wait for output pipes after the worker exits.

## 10. Orchestration

The lead persona is guidance for the host, not a scheduler.

- **Frame just enough.** State the outcome and the completion criteria. When the right next step is unclear, discovery itself can be delegated.
- **Delegate substantive work by default.** Handle work directly when it is small, or when existing context makes handoff and review more expensive. Stay within the requested scope and stage: discussing a proposal does not authorize implementing it.
- **Shape assignments by outcome.** One change is one assignment, including its verification; do not split it into implement, test and review handoffs. Settle shared interfaces and naming before writing parallel briefs. Workers that edit in parallel need separate worktrees.
- **Wait by default.** Use the waiting time for already-identified independent work, never to duplicate delegated work.
- **Require an assessable result.** Ask for the artifacts and evidence that acceptance needs: sources and uncertainties for research, changes and verification for implementation, locations and evidence for review.
- **Assess, then decide.** Check each result against its completion criteria and look for conflicts between workers. Make targeted checks of consequential claims without repeating the work. Continue the same conversation when its context helps; start a fresh one for an independent opinion; take over when another handoff will not help.

## 11. What depends on the worker CLI

Everything above stays the same across CLIs. A new integration answers the questions below, and where the answer is no, it degrades instead of special-casing:

| Capability | Used for | Without it |
| --- | --- | --- |
| Non-interactive run with the prompt from an argument or stdin | Dispatch | Not usable as a worker |
| Structured event stream with tool calls, response text and a conversation id | Snapshots, result extraction, conversation capture | Snapshots show elapsed time and an output tail; the final output is the result |
| Resume by conversation id | Continue | Offer restart only |
| Approval bypass, plus the CLI's own permission rules | The two profiles | Offer one profile and say which |
| Explicit workspace attachment | A correct working directory | Launch from the workspace and verify where the worker runs |
| Model selection and listing | Model flags and pre-flight validation | Pass the model through unvalidated |
| Documented errors and exit codes | Classification | Treat a non-zero exit with stderr as an error |
| Known credential, port and sandbox needs | Where the companion can run | Document what must run outside the host's sandbox |
| Native tools beyond coding, such as image generation | Reach through the general-purpose persona | Nothing to add |

Probe the real CLI rather than trusting its documentation. Read its help, then make one cheap headless call with the user's consent, since it spends quota, and confirm the event stream, the conversation id and the working directory before building on them.

## 12. Testing

- The default suite is offline: a temporary repository, a temporary home directory and a fake worker CLI that replays scripted streams. It never calls a real model or reads personal configuration.
- Test the contract (states, exit codes, cancellation, recovery, snapshot bounds and the workspace audit), not model output.
- Tests against the real CLI are opt-in and run separately.

## 13. Non-goals

- No daemon, queue or scheduler. The host's own background execution is enough.
- No automatic retry, continuation or restart.
- No acceptance decisions. The host judges results.
- No security boundary. Isolation comes from the permission profile, the checkout or the machine.
- No routing between models or CLIs. Choosing a worker is the host's and the user's decision.
