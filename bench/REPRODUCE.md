# Running agy-staff Bench

How to redraw a published table, and how to run, grade and publish a bench version. What the bench measures and what v1 found is in the [README](README.md).

The harness is the one that produced v1. It ran on macOS on Apple Silicon with Docker Desktop, and that is the only platform it has been run on end to end. The scripts also run on Linux, and `--claude-arch x64` bakes the linux-x64 Claude Code build for an x86-64 Docker engine, but no trial has run there yet.

## For agents

Every script answers `--help` with its arguments, defaults, examples, exit codes and a "for agents" section. Read it before you run the script. These rules hold for all of them:

- Trials and batches spend the user's subscription quota and take minutes to hours. Run them only when the user asked, and show the `--dry-run` output first.
- The data directory, the container proxy and the expected-egress file are the user's own settings, and none of them is in the repository. Take them from the user's [defaults file](#defaults-file), or ask the user. Never guess, and never edit the file without being asked. Keep `--expect-egress` whenever the user uses it.
- Credentials go in only as file paths through the options. Never print, copy or `cat` a credential file, and never print the environment.
- On a leak-scan hit (exit 3) or a failed egress check (exit 4), stop and tell the user.
- Exit 5 means the environment failed before agent setup and could not produce a container egress record. The batch stops and reports the environment failure; this does not establish a network or IP mismatch.
- A published version (`results/vN/`) is never edited, and the task records in `tasks/` change only for a new version.

| script | what it does | costs or touches |
|---|---|---|
| `fetch-tools.sh` | downloads and checks the pinned tools | ~700 MB of downloads |
| `bake-task.sh` | copies tasks and adds the tools layer | the baked copies in the data directory |
| `run-claude.sh`, `run-codex.sh` | run one trial, then leak-scan it | subscription quota, credentials |
| `run-batch.py` | runs a plan of trials, stops on anything that needs a person | hours of quota, credentials |
| `leak-scan.sh` | looks for credentials in jobs | reads credential values, prints counts only |
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

## Run trials

### What you need

- **Docker**, with tens of GB free. The task images are amd64 only, so on Apple Silicon they run under emulation.
- **Harbor 0.24.0**, the version every v1 job records: `uv tool install harbor==0.24.0`.
- **Python 3.11+** with `pip install -r bench/requirements.txt`, plus bash, git, curl, perl and node on the host.
- **Accounts.** Each one is read from a file or an environment variable, and nothing is printed:

  | for | what | where |
  |---|---|---|
  | Claude Code host | `claude setup-token` output, mode 600 | `--claude-token FILE` (default `~/.agy-bench/claude-oauth-token`) |
  | Codex host | an `auth.json` that only the bench uses: Codex refreshes it during trials and the bench writes it back | `--codex-auth FILE` (default `~/.agy-bench/codex-home/auth.json`) |
  | agy | your agy sign-in: `antigravity-oauth-token` and `installation_id`, written when you sign in to `agy` | `--agy-auth-dir DIR` (default `~/.gemini/antigravity-cli`) |
  | judges | Gemini and DeepSeek API keys, used on the host only | `GEMINI_API_KEY`, `DEEPSEEK_API_KEY` (and optionally `DEEPSEEK_BASE_URL`) |

  Credentials never go on a command line or into a job's `config.json`. Harbor gets the Claude token through its environment, and the agy and Codex files through its file upload. After every trial the run script runs a leak scan of the job directory. It looks for the judge keys, the Claude token, any Anthropic key, the agy tokens and the Codex tokens, and for strings shaped like Google or Anthropic credentials. It prints counts only, and exits 3 on a hit. `leak-scan.sh <job>` runs it again before you share a job; give it the same credential options as the run, or it looks for the values in the default files.

### Defaults file

Your own settings go in `~/.agy-bench/config`, outside the repository, so you don't have to repeat them on every command. Write one option per line:

```
# agy-staff Bench defaults
--data ~/agy-bench
--proxy http://host.docker.internal:7890
--expect-egress ~/.agy-bench/expected-egress-ip
```

- Only `--data`, `--proxy`, `--expect-egress`, `--agy-auth-dir`, `--claude-token` and `--codex-auth` can be defaults.
- An option on the command line wins over the file, and `AGY_BENCH_DATA` wins over its `--data`.
- Every script names the options it took from the file, and `--dry-run` shows the command they make.
- `AGY_BENCH_CONFIG=/path` reads another file instead, and `AGY_BENCH_CONFIG=` (empty) reads none.

### 1. Data directory, tools and tasks

Everything a run reads or writes lives in one data directory outside the repository: datasets, baked tasks, tools and jobs. Every script that uses it takes `--data DIR`, or reads `AGY_BENCH_DATA`, or the defaults file.

```sh
export AGY_BENCH_DATA=~/agy-bench && mkdir -p "$AGY_BENCH_DATA"   # or --data in the defaults file

# Codex, Node, agy, agy-staff, Claude Code: pinned versions, checked against their checksums.
bench/scripts/fetch-tools.sh --agy-archive /path/to/agy-1.3.0-linux-x64.tar.gz

# The three datasets, as <data>/datasets/<dataset>/<task>/.
cd "$AGY_BENCH_DATA"
harbor dataset download swebench-verified@1.0 -o datasets
harbor dataset download scale-ai/swe-atlas-qna -o datasets
harbor dataset download kgmon/deepsearchqa -o datasets
cd -

# Bake the v1 tasks: the shared tools layer, plus the Claude Code layer for the Claude Code copies.
tasks=$(awk '!/^#/ && NF {print $2}' bench/tasks/v1-plan.txt | sort -u)
bench/scripts/bake-task.sh $tasks
bench/scripts/bake-task.sh --claude $tasks
```

Notes:

- **agy 1.3.0.** agy's installer only serves the latest release, so `fetch-tools.sh` cannot download 1.3.0. It takes an archive you already have and checks its sha512. A newer agy works the same way, but it makes a new bench version.
- **Alpine runtime.** On Apple Silicon the Claude Code layer also needs the arm64 musl loader and C++ runtime from three Alpine 3.20 packages. Alpine keeps only the latest release of each package, so these downloads can disappear too; `fetch-tools.sh` then says so, and the files' checksums say which ones a replacement must match.
- **Dataset versions.** SWE-bench Verified is pinned to a dataset commit (`tasks/tasks.json`). SWE-Atlas QnA and DeepSearchQA were downloaded at their latest version, so `tasks/pilot.json` records a sha256 of every task v1 used, to check a later download against.
- **Task selection.** `select-tasks.py` and `select-pilot.py` redraw the task lists with the fixed seed. `select-tasks.py` also reads the oracle/nop checks of each SWE-bench candidate (`run-codex.sh oracle <id> select` and `run-codex.sh nop <id> select`).

### 2. Run

One trial:

```sh
bench/scripts/run-claude.sh --dry-run agy-staff deepsearchqa/deepsearchqa-0190 c55x-r1   # print the Harbor command
bench/scripts/run-claude.sh agy-staff deepsearchqa/deepsearchqa-0190 c55x-r1
bench/scripts/run-codex.sh solo django__django-12406 s61x-r1
```

The setups are `solo`, `native` (the host's own subagents) and `agy-staff` (the host is told to use `/agy:lead` or `$agy:lead`). A task is an instance_id for SWE-bench Verified, or `<dataset>/<task>` for the others. The job is `<host>-<setup>-<task>-<suffix>` under `<data>/jobs/`. Put a run tag and the repetition in the suffix, e.g. `c55x-r1`, and `-rerun1` for an infrastructure rerun.

Options shared by `run-claude.sh` and `run-codex.sh`:

| option | default | what it does |
|---|---|---|
| `--model MODEL:EFFORT` | `claude-opus-5-5:xhigh`, `gpt-6.1-sol:xhigh` | host model and reasoning effort |
| `--proxy URL` | none | HTTP(S) proxy for the trial container, e.g. `http://host.docker.internal:7890` |
| `--expect-egress FILE` | off | fail closed unless the model service sees the IP in FILE: checked on the host before and after the trial, and in the container before setup and after the run |
| `--dry-run` | | print the Harbor command; read no credential, run nothing |

A batch runs a plan file, one `<setup> <task> [<cache-group>]` per line:

```sh
python3 bench/scripts/run-batch.py --host claude --plan bench/tasks/v1-plan.txt --suffix c55x-r1
```

It stops on anything that needs a person, and writes the reason to `<data>/batch-<suffix>.STOP`: a leak-scan hit, a failed egress check, a Harbor exception other than a timeout or a stall, a Codex token write-back problem, host quota at `--quota-stop` (85% by default), a usage-limited trial, or the worker being down twice in a row. Once the cause is dealt with, delete the STOP file and start the same command again. It skips the jobs that already exist. To run two lanes in parallel, split the plan into two files and start one batch per file with the same `--suffix` and different `--lane` names. It takes the run scripts' options and passes them through.

## Grade and analyze

SWE-bench Verified is graded by its own tests inside the trial. SWE-Atlas QnA and DeepSearchQA trials keep only the answer, which `grade.py` grades on the host. It uses each dataset's own grader, with two judge models in place of the official one (Gemini 3.8 Flash and DeepSeek V4 Pro, `GEMINI_API_KEY` and `DEEPSEEK_API_KEY`), three runs each:

```sh
ls "$AGY_BENCH_DATA/jobs" | grep -E -- '-(task-|deepsearchqa-).*-c55x-r1(-rerun[0-9]+)?$' | xargs python3 bench/scripts/grade.py jobs
python3 bench/scripts/analyze.py          # every formal job -> bench/results/trials.jsonl (not committed)
python3 bench/scripts/report.py           # Markdown tables per dataset and host, for review
python3 bench/scripts/timeline.py <job>   # where one trial's time went
```

`analyze.py` flags trials for review: `infra_flags` (usage limit, worker down, agent stalled), `cheat_flag` (git history, upstream fix, dataset lookups), `adhered` (whether the host followed the setup), and `answer_key_exposure`. Trials with infrastructure flags are rerun, never counted as unsolved.

## Publish a version

1. List the runs the version publishes in `RUNS` in `scripts/viz-data.py`.
2. `python3 bench/scripts/viz-data.py --out bench/results/vN/data.json`
3. `python3 bench/scripts/viz-svg.py bench/results/vN/data.json --charts`, then `bench/scripts/render-png.sh` on each SVG
4. Add a row to the version table in `README.md` and `README.zh-CN.md`, and point the root READMEs at the new table.

A published version is never edited. A new run, prompt, setup or task set is a new version.

## Layout

```
bench/
├── harbor_agents/   Harbor agents: Claude Code and Codex plus the egress check and Codex token write-back,
│                    and the agy-staff variants that install the plugin and upload the agy sign-in
├── templates/       prompt templates per host, dataset and setup; only the last line differs between setups
├── configs/codex/   Codex config for the native and agy-staff setups
├── tasks/           task selections (tasks.json, pilot.json) and the v1 plan (v1-plan.txt)
├── scripts/         fetch-tools, bake-task, run-claude, run-codex, run-batch, leak-scan, egress-check,
│                    select-*, grade, analyze, report, timeline, viz-data, viz-svg, render-png
├── viz/             brand marks for the table (the number font is downloaded on first use)
└── results/vN/      published versions: data.json, summary.svg, summary.png
```
