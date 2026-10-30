# <img src="../assets/logo/bench.svg" width="48" height="48" alt=""> agy-staff Bench

[English](README.md) | [简体中文](README.zh-CN.md)

agy-staff Bench measures what delegating to agy costs a host agent and what it buys. Every task runs three ways: the host alone, the host with its own subagents, and the host with agy through `lead`. The table reports tasks solved, host spend, total spend and wall time.

[Tech Report](https://lastwhisper.dev/en/zen-of-harness-engineering/agy-staff-bench-v1/) · [中文报告](https://lastwhisper.dev/zen-of-harness-engineering/agy-staff-bench-v1/)

[![agy-staff Bench v1: Claude Code and Codex on SWE-bench Verified, SWE-Atlas QnA and DeepSearchQA, solo, with their own subagents and with agy](results/v1/summary.png)](results/v1/summary.svg)

> [!NOTE]
> **Why a bench.** It runs the same tasks on different hosts, with and without agy, to answer three questions:
> - **When to delegate.** Which tasks and which hosts gain from handing work to agy, and which are better left solo. The answers become best practices for using agy-staff.
> - **What to fix in agy-staff.** Each run shows where delegation wastes time or tokens. Those findings go back into the plugin as fixes, and later bench versions check whether the fixes worked.
> - **How harnesses behave.** Inspect the trajectories to see how each host delegates, waits and reviews. Worker models and effort levels differ, so the table alone cannot isolate orchestration effects across hosts.

## What v1 shows

- **Claude Code as host:** with agy, host spend fell on all three benchmarks: SWE-bench Verified −16%, SWE-Atlas QnA −36%, DeepSearchQA −39%. Host spend is the part billed to your Claude plan. SWE-bench results were identical: 6/8 in every setup. The price is time (median 13–19 minutes, against 2–8 minutes solo) and worker spend on agy's own quota.
- **Codex as host:** host spend fell only on DeepSearchQA (−16%). SWE-bench (+86%) and QnA (+22%) cost more. Codex polls while it waits for agy, and every wake-up carries the full context. Claude Code waits in the background and is woken when the job finishes.
- **Where agy lost tasks:** on the Claude Code side, three tasks were solved alone but not with agy. Two were DeepSearchQA runs that hit the 30-minute limit before writing an answer. One was a QnA judge split: Gemini passed it 3/3, DeepSeek 1/3. With agy, Claude Code solved one DeepSearchQA task that it missed alone; both answers named the same states, and the difference was a judge split over a remark about Puerto Rico.
- **One run per task and setup, 20 tasks.** A one-task difference is within noise. Read v1 as a first baseline, not a verdict.

## Charts

The same results as the table, drawn three more ways.

**Cost per trial.** The host's share, with the worker's stacked on top.

[![agy-staff Bench v1: cost per trial, the host's share and the worker's, for each benchmark and setup](results/v1/cost.png)](results/v1/cost.svg)

**Tokens per trial**, cache reads included. With agy, most of a trial's tokens are agy's, on agy's own quota.

[![agy-staff Bench v1: tokens per trial, the host's share and the worker's, for each benchmark and setup](results/v1/tokens.png)](results/v1/tokens.svg)

**Solved vs cost.** Tasks solved against host cost and total cost per trial. Up and to the left is better.

[![agy-staff Bench v1: tasks solved against host cost and total cost per trial, one row per benchmark](results/v1/pareto.png)](results/v1/pareto.svg)

## What it measures

The three setups share task rules. The final instruction chooses the orchestration and worker. The table compares complete configurations; worker capability, token price and reasoning effort are not controlled across hosts.

| setup | the host | worker |
|---|---|---|
| solo | works alone | none |
| + subagents | delegates to its own subagents | Claude Code: Sonnet 5.5 xhigh; Codex: GPT-6 Luna high |
| + agy | is told to use `lead` (`/agy:lead`, `$agy:lead`); lead picks which agy jobs to run | Gemini 3.8 Flash, agy CLI 1.3.0 |

v1 originally ran "+ subagents" only on SWE-bench Verified. The 2026-10-23 supplement fills the Codex native QnA and DeepSearchQA cells in v1; Claude Code native remains unmeasured on those two benchmarks.

Each benchmark stands for one way you might use a worker:

| benchmark | tasks | use case | solved when |
|---|---|---|---|
| SWE-bench Verified | 8 | a small, single fix: where delegation may not pay off | the official tests pass |
| SWE-Atlas QnA | 6 | investigate a repository and reach a conclusion | both LLM judges pass the rubric |
| DeepSearchQA | 6 | research on the web and combine sources | both LLM judges pass the answer set |

Tasks were drawn with a fixed seed; their IDs are in `data.json`.

| host | CLI | model | effort |
|---|---|---|---|
| Claude Code | 2.1.296 | Claude Opus 5.5 | xhigh |
| Codex | 0.160.1 | GPT-6.1 Sol | xhigh |

## Method

- **Runner.** [Harbor](https://github.com/harbor-framework/harbor) 0.24.0, the release every job's `lock.json` records. Every trial runs in a fresh container built from the benchmark's own image, with the host CLI, agy and agy-staff installed on top.
- **agy-staff version.** 0.7.3 (`f00d149`). For Claude Code and Codex, 0.7.4 changes no skill, companion code or prompt template, so these results also stand for 0.7.4.
- **Grading.** SWE-bench is graded by its tests. A test counts as passed only if no test of that name failed: SWE-bench's SymPy log parser keys results by the bare test name, so a later test with the same name can hide a failure. This changed one task in v1, and `resolved_official` in `data.json` keeps the official verdict. QnA and DeepSearchQA are graded offline with each dataset's own grading prompts, rubrics and aggregation. The one deviation from the official setup is the judge model: Gemini 3.8 Flash and DeepSeek V4 Pro, three runs each. A task counts as solved only when a majority of each judge's runs pass it.
- **Cost.** US dollars at API list price.
  - Host $ is what the host model uses, the part that comes out of your Claude or ChatGPT plan.
  - Total $ adds the worker. Native subagents bill the host's plan. agy is priced at Gemini list price but runs on agy's own quota.
  - Only token costs count, for every host and worker: a tool's per-request fee is left out, and the tokens of the model calls a tool makes stay in.
  - Claude Code's cost is its own reported `costUSD`, checked against list price, less WebSearch's per-request fee. Codex's is computed from its token counts.
- **Time.** Median wall clock per trial. Baseline trials ran two or three at a time; the native supplement was a later batch. Timing comparisons include the different batch conditions.
- **Time limits.** Each benchmark's own. DeepSearchQA stops the agent at 30 minutes and grades whatever answer file exists, so a run with no answer counts as unsolved.
- **Reruns.** Infrastructure failures are rerun, never counted as unsolved.
  - In 12 trials, Claude Code froze or was stopped by the stall watchdog. In the container it ran as an x86 build under emulation, so those trials were rerun with the native arm64 build of the same version. `data.json` records the build per trial (`claude_binary`).
  - The first Claude Code "+ subagents" prompt led the host to write its own subagent definitions instead of delegating. The prompt was revised, all 8 of those trials were rerun, and the table uses the reruns.
- **Answer exposure and a rule violation.** DeepSearchQA's answer tables are mirrored on the web. `answer_key_exposure` in `data.json` flags runs whose trajectory reached the answer table or its dataset page. Including the native supplement, v1 has three flagged trials, all on task 0118:
  - Codex solo (solved): one search result linked the dataset page, and its snippet showed the question only. The answer came from the original reports.
  - Claude Code + agy (unsolved): the host's brief to agy left out the rule against looking up the benchmark, and agy downloaded the answer table and cited it. The host saw this, discarded agy's result and was still re-checking the sources when the 30-minute limit hit. `rule_violation` in `data.json` records it. It is the only confirmed violation: every cheat-scan hit in v1 was reviewed by hand, and the rest were false positives.
  - Codex native (unsolved): ordinary searches returned the exact answer row into the Luna worker's context. This is recorded as `answer_key_contamination`, independently of `rule_violation`. Actual answer-content exposure is confirmed; intentional benchmark lookup is not established.
  - All three stay in the table as graded. The native DeepSearchQA score is 5/6 with one contaminated unsuccessful trial, not a fully clean six-task result.
  - The summary uses solid red task squares for confirmed rule violations or answer-content contamination, and hollow red squares for timeouts. Timeout takes visual precedence: a timed-out trial has only its hollow outline, with any overlapping review flags retained in the data. Dataset links alone receive no visual mark.

## Codex native supplement (2026-10-23)

The completed 12-job manifest fills the missing Codex native cells using GPT-6.1 Sol xhigh, GPT-6 Luna high and Codex CLI 0.160.1. The task IDs and prompts match v1. It ran later, with a different login and the refactored runner; it is not a controlled rerun of the whole matrix. Sonnet 5.5 and Luna are not matched by token price or established capability, and effort labels are not equivalent across providers.

| Added native group | Solved | Host USD / trial | Total USD / trial | Median minutes |
|---|---:|---:|---:|---:|
| SWE-Atlas QnA | 5/6 | 0.5401 | 0.5900 | 7.85 |
| DeepSearchQA | 5/6 | 0.2656 | 0.2946 | 2.75 |

The added jobs are exactly those in `manifest-s61x-native-supplement-20261023-r1-rerun4.json`: the first valid QnA trial comes from rerun1 and the other 11 from rerun4. Superseded s6x jobs and failed infrastructure attempts are excluded. Their analysis records are appended to the local, git-ignored `results/trials.jsonl`; the published `data.json` retains each exact job name and `source_phase`. Its `runs` metadata records native worker model and effort, verified against the actual worker trajectories. The original 96 selected trials and their measured results are retained.

## Known limits

- One run per task and setup, over 20 tasks.
- Claude Code "+ subagents" ran only on SWE-bench Verified; Codex native covers all three benchmarks after the supplement.
- Native workers differ in model, token price and effort, so cross-host results compare configurations rather than isolate harness effects.
- Replacing the judge model departs from the official QnA and DeepSearchQA grading.
- Times were measured in separate batches and include different concurrency conditions.
- Neither the prompt nor `lead` tells the host about DeepSearchQA's 30-minute limit. In the three timed-out runs, agy's first research job took about 21 minutes or more, two of the runs still had an agy job running at 30, and no host wrote a provisional answer first. The next version will add the time limit to every setup's prompt.

## Files

```
results/
└── v1/
    ├── summary.svg   the table
    ├── summary.png   the same table rendered for the READMEs (headless Chrome at 3x; rsvg-convert drops the embedded number font)
    ├── cost.svg      cost per trial, host and worker  (and cost.png)
    ├── tokens.svg    tokens per trial, host and worker  (and tokens.png)
    ├── pareto.svg    tasks solved against host and total cost per trial  (and pareto.png)
    └── data.json     the 108 trials behind the table and the charts, plus per-cell aggregates
```

Each trial in `data.json` records the host, model, setup, benchmark and task; whether it was solved (and, for SWE-bench, `resolved_official`), its reward, `timed_out`, `answer_key_exposure`, `rule_violation` and `answer_key_contamination`; host and worker cost and tokens; and wall-clock seconds. The added trials also record `source_phase`; `runs` includes native worker model and reasoning effort.

## Versions

Each published table gets its own directory under `results/`. A published version changes only for explicitly approved errata or dated supplements listed below. A supplement may fill missing setups without replacing existing trials; new models, prompts or task sets require a new version.

| version | published | agy-staff | hosts | tasks | changes |
|---|---|---|---|---|---|
| [v1](results/v1/) | 2026-10-19 | 0.7.3 (`f00d149`) | Claude Code 2.1.296 (Opus 5.5 xhigh); Codex 0.160.1 (GPT-6.1 Sol xhigh) | 20 | first baseline |

**Addition, v1 (2026-10-20).** Three charts drawn from the same `data.json`: cost per trial, tokens per trial, and solved vs cost. No file published before changed.

**Erratum, v1 (2026-10-20).** The method and the table's notes named Harbor commit `3e30cca`, but the trials ran Harbor 0.24.0, as every job's `lock.json` records; both now say 0.24.0. The timeout note under Known limits said one timed-out run still had agy working at 30 minutes; two did. No number changed.

**Erratum, v1 (2026-10-21).** Two cost corrections, one grading correction and a correction to the answer-exposure note.
- One Claude Code trial's host cost was undercounted. `claude-agy-staff-deepsearchqa-0118` hit the 30-minute limit in the middle of a turn, so that turn never wrote a `result` event, and `analyze.py` took the cost from the earlier turns' result. The main session's messages after that result are now added at list price: $0.61, not $0.22. This is still a lower bound: the cut-off turn's 4 WebSearch calls each ran a model call outside the session transcript, about $0.32 more at the rate the solo runs show.
- Costs now count tokens only, for every host and worker. Claude Code's `costUSD` included WebSearch's $10 per 1,000 requests, a fee the Codex figures never had. It is taken back out, and the tokens of the model call behind each search stay in. This lowers two Claude Code solo DeepSearchQA trials by $0.08 and $0.03.
- `sympy__sympy-14248` was solved in no trial, although 5 of 6 counted as solved. Its two FAIL_TO_PASS tests share their names with tests in other files, and SWE-bench's SymPy log parser keys results by the bare name, so the LaTeX file's `test_MatrixSymbol_printing ... ok` overwrote the pretty-printer file's `F`. Every run failed the pretty-printer assertion. A test now passes only if no test of that name failed. Claude Code drops from 7/8 to 6/8 in every setup; Codex + subagents and + agy drop from 5/8 to 4/8, and Codex solo stays at 5/8. `resolved_official` keeps SWE-bench's own verdict, and the official harness would still count the 5 as solved.
- The answer-exposure note understated one trial and overstated another. In `claude-agy-staff-deepsearchqa-0118`, agy did not just come across the answer table: it downloaded it, because the host's brief had left out the benchmark rule. `data.json` now records this as `rule_violation`; the trial was already unsolved. In `codex-solo-deepsearchqa-0118`, the tool output held a link to the dataset page and the question, not the answer table.

The two cost corrections move Claude Code's DeepSearchQA + agy host spend from −50% to −39% against solo, and its total cost from +74% to +88%. `data.json`, the table and the three charts are redrawn. The other Claude Code trials match their transcripts and did not change.

**Supplement and presentation update, v1 (2026-10-24).** Added the 12 completed Codex native trials from 2026-10-23 directly to v1, bringing it to 108 selected trials and 16 groups, and redrew the summary and all three charts. The existing 96 trials keep their measured results. The summary retains six footer items, adds native worker effort to the existing worker note, and uses hollow timeout squares without combined symbols. Review flags and batch limitations are documented above and retained in the data.

## Harness

The evaluation harness is in this directory: the Harbor agents for Claude Code and Codex with agy-staff, the run scripts and the batch runner, the prompt templates and task lists v1 ran, offline grading, analysis and the table renderer. [REPRODUCE.md](REPRODUCE.md) shows how to redraw a published table from its `data.json`, and how to run, grade and publish a version. The harness has run end to end only on macOS on Apple Silicon with Docker Desktop.
