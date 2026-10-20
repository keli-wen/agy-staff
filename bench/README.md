# <img src="../assets/logo/bench.svg" width="48" height="48" alt=""> agy-staff Bench

[English](README.md) | [简体中文](README.zh-CN.md)

agy-staff Bench measures what delegating to agy costs a host agent and what it buys. Every task runs three ways: the host alone, the host with its own subagents, and the host with agy through `lead`. The table reports tasks solved, host spend, total spend and wall time.

[![agy-staff Bench v1: Claude Code and Codex on SWE-bench Verified, SWE-Atlas QnA and DeepSearchQA, solo, with their own subagents and with agy](results/v1/summary.png)](results/v1/summary.svg)

> [!NOTE]
> **Why a bench.** It runs the same tasks on different hosts, with and without agy, to answer three questions:
> - **When to delegate.** Which tasks and which hosts gain from handing work to agy, and which are better left solo. The answers become best practices for using agy-staff.
> - **What to fix in agy-staff.** Each run shows where delegation wastes time or tokens. Those findings go back into the plugin as fixes, and later bench versions check whether the fixes worked.
> - **How harnesses differ.** Same prompt, same worker, different host. Gaps in the results trace back to design choices in each harness.

## What v1 shows

- **Claude Code as host:** with agy, host spend fell on all three benchmarks: SWE-bench Verified −16%, SWE-Atlas QnA −36%, DeepSearchQA −50%. Host spend is the part billed to your Claude plan. SWE-bench results were identical: 7/8 in every setup. The price is time (median 13–19 minutes, against 2–8 minutes solo) and worker spend on agy's own quota.
- **Codex as host:** host spend fell only on DeepSearchQA (−16%). SWE-bench (+86%) and QnA (+22%) cost more. Codex polls while it waits for agy, and every wake-up carries the full context. Claude Code waits in the background and is woken when the job finishes.
- **Where agy lost tasks:** on the Claude Code side, three tasks were solved alone but not with agy. Two were DeepSearchQA runs that hit the 30-minute limit before writing an answer. One was a QnA judge split: Gemini passed it 3/3, DeepSeek 1/3. With agy, Claude Code solved one DeepSearchQA task that it missed alone.
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

The three setups share one prompt. Only the last line, which says how to orchestrate, differs, so orchestration is the only variable.

| setup | the host | worker |
|---|---|---|
| solo | works alone | none |
| + subagents | delegates to its own subagents | Claude Code: Sonnet 5.5; Codex: GPT-6 Luna |
| + agy | is told to use `lead` (`/agy:lead`, `$agy:lead`); lead picks which agy jobs to run | Gemini 3.8 Flash, agy CLI 1.3.0 |

v1 ran "+ subagents" only on SWE-bench Verified.

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
- **Grading.** SWE-bench is graded by its tests. QnA and DeepSearchQA are graded offline with each dataset's own grading prompts, rubrics and aggregation. The one deviation from the official setup is the judge model: Gemini 3.8 Flash and DeepSeek V4 Pro, three runs each. A task counts as solved only when a majority of each judge's runs pass it.
- **Cost.** US dollars at API list price.
  - Host $ is what the host model uses, the part that comes out of your Claude or ChatGPT plan.
  - Total $ adds the worker. Native subagents bill the host's plan. agy is priced at Gemini list price but runs on agy's own quota.
  - Claude Code's cost is its own reported `costUSD`, checked against list price. Codex's is computed from its token counts.
- **Time.** Median wall clock per trial. Trials ran two or three at a time, so times were measured under that load.
- **Time limits.** Each benchmark's own. DeepSearchQA stops the agent at 30 minutes and grades whatever answer file exists, so a run with no answer counts as unsolved.
- **Reruns.** Infrastructure failures are rerun, never counted as unsolved.
  - In 12 trials, Claude Code froze or was stopped by the stall watchdog. In the container it ran as an x86 build under emulation, so those trials were rerun with the native arm64 build of the same version. `data.json` records the build per trial (`claude_binary`).
  - The first Claude Code "+ subagents" prompt led the host to write its own subagent definitions instead of delegating. The prompt was revised, all 8 of those trials were rerun, and the table uses the reruns.
- **Answer exposure.** DeepSearchQA's answer tables are mirrored on the web. Runs whose tool output contained the answer table are flagged in `data.json` (`answer_key_exposure`). v1 has two, both on task 0118: Claude Code + agy (unsolved, timed out) and Codex solo (solved). Both stay in the table as graded.

## Known limits

- One run per task and setup, over 20 tasks.
- "+ subagents" ran only on SWE-bench Verified.
- Replacing the judge model departs from the official QnA and DeepSearchQA grading.
- Times were measured with trials running concurrently.
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
    └── data.json     the 96 trials behind the table and the charts, plus per-cell aggregates
```

Each trial in `data.json` records the host, model, setup, benchmark and task; whether it was solved, its reward, `timed_out` and `answer_key_exposure`; host and worker cost and tokens; and wall-clock seconds.

## Versions

Each published table gets its own directory under `results/`. A published version is never edited, except for the errata and additions listed below. A new run, prompt, setup or task set becomes a new version.

| version | published | agy-staff | hosts | tasks | changes |
|---|---|---|---|---|---|
| [v1](results/v1/) | 2026-10-19 | 0.7.3 (`f00d149`) | Claude Code 2.1.296 (Opus 5.5 xhigh); Codex 0.160.1 (GPT-6.1 Sol xhigh) | 20 | first baseline |

**Addition, v1 (2026-10-20).** Three charts drawn from the same `data.json`: cost per trial, tokens per trial, and solved vs cost. No file published before changed.

**Erratum, v1 (2026-10-20).** The method and the table's notes named Harbor commit `3e30cca`, but the trials ran Harbor 0.24.0, as every job's `lock.json` records; both now say 0.24.0. The timeout note under Known limits said one timed-out run still had agy working at 30 minutes; two did. No number changed.

## Harness

This directory holds the half of the evaluation harness that comes after the trials: the prompt templates and task lists v1 ran, offline grading, analysis and the table renderer. [REPRODUCE.md](REPRODUCE.md) shows how to redraw a published table from its `data.json`, and how to grade, analyze and publish a version. The half that runs trials (the Harbor agents for Claude Code and Codex with agy-staff, the run scripts and the batch runner) will follow in its own PR.
