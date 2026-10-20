# Running agy-staff Bench

How to redraw a published table, and how to grade, analyze and publish a bench version. What the bench measures and what v1 found is in the [README](README.md).

This directory holds the half of the harness that comes after the trials: the prompt templates and task lists v1 ran, offline grading, analysis and the table. The half that runs trials (the Harbor agents, the run scripts, the batch runner and the tool downloads) is not published yet.

## For agents

Every script answers `--help` with its arguments, defaults, examples, exit codes and a "for agents" section. Read it before you run the script. These rules hold for all of them:

- The data directory is the user's own setting and is not in the repository. Ask for it and never guess.
- `grade.py` uses the judge API keys from the environment. Never print the keys or the environment.
- A published version (`results/vN/`) is never edited, and the task records in `tasks/` change only for a new version.

| script | what it does | costs or touches |
|---|---|---|
| `grade.py` | grades QnA and DeepSearchQA answers with two judges | judge API keys, a few cents per job |
| `analyze.py`, `report.py`, `timeline.py` | summarize, tabulate and time trials | read-only |
| `select-tasks.py`, `select-pilot.py` | redraw the task lists | rewrite the v1 records in `tasks/` |
| `viz-data.py`, `viz-svg.py`, `render-png.sh` | write a version's `data.json`, table and PNG | `results/` |

## Redraw a published table

This needs no account, and it uses only the files in `results/`:

```sh
pip install -r bench/requirements.txt
python3 bench/scripts/viz-svg.py bench/results/v1/data.json --out /tmp/v1 --charts   # summary, cost, tokens, pareto
bench/scripts/render-png.sh /tmp/v1/summary.svg                              # needs Chrome or Chromium
```

Each SVG is byte for byte its file in `results/v1/`: the embedded number font is subset without timestamps, so the same `data.json` always gives the same SVGs.

## Grade and analyze

The trials live in a data directory outside the repository, one Harbor job per trial under `<data>/jobs/`. Every script that reads it takes `--data DIR`, or reads `AGY_BENCH_DATA`.

SWE-bench Verified is graded by its own tests inside the trial. SWE-Atlas QnA and DeepSearchQA trials keep only the answer, which `grade.py` grades on the host. It uses each dataset's own grader, with two judge models in place of the official one (Gemini 3.8 Flash and DeepSeek V4 Pro, `GEMINI_API_KEY` and `DEEPSEEK_API_KEY`), three runs each:

```sh
export AGY_BENCH_DATA=~/agy-bench
ls "$AGY_BENCH_DATA/jobs" | grep -E -- '-(task-|deepsearchqa-).*-c55x-r1(-rerun[0-9]+)?$' | xargs python3 bench/scripts/grade.py jobs
python3 bench/scripts/analyze.py          # every formal job -> bench/results/trials.jsonl (not committed)
python3 bench/scripts/report.py           # Markdown tables per dataset and host, for review
python3 bench/scripts/timeline.py <job>   # where one trial's time went
```

`analyze.py` flags trials for review: `infra_flags` (usage limit, worker down, agent stalled), `cheat_flag` (git history, upstream fix, dataset lookups), `adhered` (whether the host followed the setup), and `answer_key_exposure`. Trials with infrastructure flags are rerun, never counted as unsolved.

The task lists come from `select-tasks.py` (SWE-bench Verified, `tasks/tasks.json`) and `select-pilot.py` (SWE-Atlas QnA and DeepSearchQA, `tasks/pilot.json`), both with a fixed seed. SWE-bench Verified is pinned to a dataset commit. The other two were downloaded with Harbor at their latest version, so `pilot.json` records a sha256 of every task v1 used, to check a later download against.

## Publish a version

1. List the runs the version publishes in `RUNS` in `scripts/viz-data.py`.
2. `python3 bench/scripts/viz-data.py --out bench/results/vN/data.json`
3. `python3 bench/scripts/viz-svg.py bench/results/vN/data.json --charts`, then `bench/scripts/render-png.sh` on each SVG
4. Add a row to the version table in `README.md` and `README.zh-CN.md`, and point the root READMEs at the new table.

A published version is never edited. A new run, prompt, setup or task set is a new version.

## Layout

```
bench/
├── templates/       prompt templates per host, dataset and setup; only the last line differs between setups
├── tasks/           task selections (tasks.json, pilot.json) and the v1 plan (v1-plan.txt)
├── scripts/         select-*, grade, analyze, report, timeline, viz-data, viz-svg, render-png
├── viz/             brand marks for the table (the number font is downloaded on first use)
└── results/vN/      published versions: data.json, summary.svg, summary.png
```
