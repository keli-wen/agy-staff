#!/usr/bin/env python3
"""Run a plan of trials one after another with run-claude.sh or run-codex.sh, and stop on anything that needs
a person.

  usage: run-batch.py --host claude|codex --plan FILE --suffix TAG [options]
         e.g. run-batch.py --host claude --plan bench/tasks/v1-plan.txt --suffix c55x-r1 --data <data>

Plan: one trial per line, "<setup> <task> [<cache-group>]"; blank lines and # comments are skipped.
bench/tasks/v1-plan.txt is the v1 plan. Job names are <host>-<setup>-<task-name>-<suffix>; a trial whose
job directory exists is skipped, and a rerun is a new suffix (e.g. c55x-r1-rerun1). A stop writes the stop
file <data>/batch-<suffix>.STOP with the reason; once the cause is dealt with, delete the file and start the
same command again to resume where it stopped. Two lanes can run side by side on two plan files with the same
--suffix and their own --lane: they share the stop file, so a stop in either lane stops both.

Before each trial: no stop file, and Docker has at least --min-free-gb free. When the task changes, the
previous task's Docker build cache is pruned (images of the baked tasks are large; --no-prune keeps it).
After each trial it stops on: a leak-scan hit (exit 3), a failed egress check (exit 4), any other failure
of the run script, a trial with no result, a Harbor exception other than a timeout or a stall (a setup
failure, say, would otherwise repeat in every trial), a Codex auth.json write-back other than "unchanged"
or "updated" (with --lane, "updated" too: the lanes share one token), host quota at or above --quota-stop
(Codex: its primary window; Claude Code: the weekly and the 5-hour window), a usage_limited or
tool_failure trial, or worker_unavailable twice in a row. Timeouts and stalled trials are logged and left
for a rerun. Each trial's summary record (analyze.py) is appended to <data>/batch-<suffix>.jsonl, a
one-line summary to <data>/batch-<suffix>.log, and the run script's output to <data>/batch-<suffix>.<lane>.out.
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import analyze
import benchdata

SCRIPTS = Path(__file__).resolve().parent
HELP = """Run a plan of trials one after another with run-claude.sh or run-codex.sh, and stop on anything that
needs a person. Jobs that exist are skipped, so the same command resumes a stopped batch."""
EPILOG = """plan file:
  one trial per line, "<setup> <task> [<cache-group>]", # comments allowed; bench/tasks/v1-plan.txt is the
  v1 plan. The job of a line is <host>-<setup>-<task-name>-<suffix>.

examples:
  run-batch.py --host claude --plan bench/tasks/v1-plan.txt --suffix c55x-r1 --dry-run
  run-batch.py --host claude --plan bench/tasks/v1-plan.txt --suffix c55x-r1 --data ~/agy-bench \\
      --proxy http://host.docker.internal:7890 --expect-egress ~/.agy-bench/expected-egress-ip
  two lanes: split the plan into a.txt and b.txt, and run the same command twice, once with
      --plan a.txt --lane A and once with --plan b.txt --lane B (same --suffix)

it stops on:
  a leak-scan hit, a failed egress check, a run-script error, a trial with no result, a Harbor exception
  other than a timeout or a stall, a Codex auth.json write-back other than unchanged/updated ("updated"
  too with --lane), host quota at --quota-stop, a usage_limited or tool_failure trial, or the worker
  down twice in a row. Timeouts and stalls are logged and left for a rerun with a -rerun<k> suffix.

files in the data directory:
  batch-<suffix>.log      one line per trial: resolved, host cost, time, quota, infra flags
  batch-<suffix>.jsonl    the analyze.py record of each trial
  batch-<suffix>.<lane>.out  the run script's output
  batch-<suffix>.STOP     why the batch stopped; while it exists, no lane of that suffix starts a trial

exit codes: 0 the plan is done; 2 it stopped (the reason is in the log and the STOP file)

for agents:
  - A batch runs for hours and spends the user's subscription quota. Start one only when the user asked
    for it, with the plan, suffix and options they gave; show them the --dry-run listing first. Run it in
    the background and read batch-<suffix>.log to follow it.
  - --data, --proxy and --expect-egress are the user's own settings and are not in the repository. The run
    scripts take them from the user's defaults file (~/.agy-bench/config; see run-claude.sh --help), and
    the batch log's first line names what it gave. Without the file, ask the user; never guess, and never
    turn off --expect-egress when the user uses it.
  - On a stop, report the reason from the STOP file. Delete the STOP file to resume only when the user says
    the cause is dealt with. After a leak-scan stop, share nothing from that job.
  - Never print credentials or the environment; pass credential files only as paths."""
# Build-cache records of the bench layers (bake-task.sh) and of the task images. `docker builder prune` only
# takes a description filter, and a parent record goes only after its children, so each runs twice.
PRUNE = ["agy-staff", "codex", r"agy\.tar", r"node\.tar", "ENTRYPOINT", "ln.-sf./opt", "WORKDIR",
         "mkdir.-p./logs", "astral", "claude", "DISABLE_AUTOUPDATER"]


def sh(*cmd, timeout=300):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def docker_free_gb():
    r = sh("docker", "run", "--rm", "--platform", "linux/amd64", "curlimages/curl:latest", "sh", "-c", "df -Pk / | tail -1")
    try:
        return int(r.stdout.split()[3]) / 1024 / 1024
    except (AttributeError, IndexError, ValueError):
        return None


def prune(group):
    for pattern in PRUNE + ([group] if group else []):
        for _ in range(2):
            sh("docker", "builder", "prune", "-f", "--filter", f"description~={pattern}")


def read_plan(path):
    rows = []
    for n, line in enumerate(Path(path).read_text().splitlines(), 1):
        words = line.split("#", 1)[0].split()
        if not words:
            continue
        if len(words) not in (2, 3):
            sys.exit(f"{path}:{n}: expected '<setup> <task> [<cache-group>]'")
        rows.append((words[0], words[1], words[2] if len(words) == 3 else ""))
    return rows


def quota(rec):
    """[(window, percent used)] of the host subscription after the trial."""
    out = [("weekly" if rec["host"] == "claude-code" else "primary", rec.get("quota_used_percent"))]
    five = ((rec.get("quota_windows") or {}).get("five_hour") or {}).get("utilization")
    if five is not None:
        out.append(("5-hour", round(five * 100, 1)))
    return [(w, p) for w, p in out if p is not None]


def main():
    ap = argparse.ArgumentParser(description=HELP, epilog=EPILOG, formatter_class=argparse.RawDescriptionHelpFormatter)
    benchdata.add_argument(ap)
    ap.add_argument("--host", required=True, choices=["claude", "codex"], help="run-claude.sh or run-codex.sh")
    ap.add_argument("--plan", required=True, metavar="FILE", help="plan file: <setup> <task> [<cache-group>] per line")
    ap.add_argument("--suffix", required=True, help="job-name suffix: run tag and repetition, e.g. c55x-r1")
    ap.add_argument("--lane", default="", help="lane name, when two batches share a suffix")
    ap.add_argument("--model", metavar="MODEL:EFFORT", help="host model (default: the run script's)")
    ap.add_argument("--proxy", metavar="URL", help="container proxy, passed to the run script")
    ap.add_argument("--expect-egress", metavar="FILE", help="turn on the egress check, passed to the run script")
    ap.add_argument("--agy-auth-dir", metavar="DIR", help="passed to the run script")
    ap.add_argument("--claude-token", metavar="FILE", help="passed to the run script")
    ap.add_argument("--codex-auth", metavar="FILE", help="passed to run-codex.sh")
    ap.add_argument("--quota-stop", type=float, default=85, help="stop when the host quota reaches this percent (default 85)")
    ap.add_argument("--min-free-gb", type=float, default=8, help="Docker free disk needed before a trial (default 8)")
    ap.add_argument("--no-prune", action="store_true", help="keep the Docker build cache between tasks")
    ap.add_argument("--dry-run", action="store_true", help="list the trials and the commands; run nothing")
    args = ap.parse_args()
    if args.codex_auth and args.host != "codex":
        ap.error("--codex-auth is for --host codex")

    data = benchdata.resolve(args.data)
    analyze.JOBS = data / "jobs"
    script = SCRIPTS / f"run-{args.host}.sh"
    passthrough = ["--data", str(data)]
    for opt in ("model", "proxy", "expect_egress", "agy_auth_dir", "claude_token", "codex_auth"):
        if getattr(args, opt):
            passthrough += ["--" + opt.replace("_", "-"), getattr(args, opt)]
    stop_file = data / f"batch-{args.suffix}.STOP"
    log_file, records = data / f"batch-{args.suffix}.log", data / f"batch-{args.suffix}.jsonl"
    out_file = data / f"batch-{args.suffix}.{args.lane or 'main'}.out"
    tag = f"[{args.lane}] " if args.lane else ""

    def log(msg):
        line = f"{datetime.now():%H:%M} {tag}{msg}"
        print(line, flush=True)
        if not args.dry_run:
            with log_file.open("a") as f:
                f.write(line + "\n")

    def stop(msg):
        log(f"STOP {msg}")
        if not args.dry_run:
            stop_file.write_text(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {tag}{msg}\n")
        return 2

    plan = read_plan(args.plan)
    log(f"batch started: {len(plan)} trials in {args.plan}, suffix {args.suffix}")
    defaults = benchdata.config()
    if defaults:
        log(f"defaults from {benchdata.config_file()}: {' '.join(defaults)} (options given here win)")
    prev_task, prev_group, worker_down = None, "", 0
    for setup, task, group in plan:
        name = task.split("/")[-1]
        job = f"{args.host}-{setup}-{name}-{args.suffix}"
        cmd = [str(script), *passthrough, setup, task, args.suffix]
        if prev_task and task != prev_task and not args.no_prune and not args.dry_run:
            prune(prev_group)
        prev_task, prev_group = task, group
        if (data / "jobs" / job).exists():
            log(f"skip {job} (exists)")
            continue
        if args.dry_run:
            log(f"run  {job}: {' '.join(cmd)}")
            continue
        if stop_file.exists():
            log(f"STOP {stop_file.name} is there: {stop_file.read_text().strip()} (delete it to resume)")
            return 2
        free = docker_free_gb()
        if free is None or free < args.min_free_gb:
            return stop(f"Docker free disk {free and round(free, 1)} GB < {args.min_free_gb} GB before {job}")
        log(f"start {job} (Docker free {free:.0f} GB)")
        with out_file.open("a") as out:
            rc = subprocess.run(cmd, stdout=out, stderr=subprocess.STDOUT).returncode
        if rc == 3:
            return stop(f"leak scan hit in {job}; inspect it before sharing anything")
        if rc == 4:
            return stop(f"egress check failed in {job}")
        if rc == 5:
            return stop(f"environment failed before agent setup in {job}; see {out_file.name} for the Harbor exception")
        if rc != 0:
            return stop(f"run-{args.host}.sh exited {rc} for {job}; see {out_file.name}")
        trials = [t for t in (data / "jobs" / job).glob("*") if (t / "result.json").is_file()]
        if not trials:
            return stop(f"{job} has no trial result")
        try:
            rec = analyze.summarize(data / "jobs" / job, trials[0])
        except Exception as e:  # noqa: BLE001 - a record that cannot be read needs a person
            return stop(f"analyze.py failed on {job}: {type(e).__name__}: {e}")
        wb = trials[0] / "agent" / "auth-writeback.txt"
        if args.host == "codex":
            rec["auth_writeback"] = wb.read_text().strip() if wb.is_file() else "missing"
        rec["logged_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with records.open("a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        q = quota(rec)
        log(f"done  {job}: resolved={rec['resolved']} host=${rec['host_cost_usd']:.2f} wall={rec['wall_clock_s']}s "
            f"quota={', '.join(f'{w} {p}%' for w, p in q) or '?'} infra={','.join(rec['infra_flags']) or '-'}"
            + (f" writeback={rec['auth_writeback']}" if args.host == "codex" else ""))
        if args.host == "codex":
            if rec["auth_writeback"] not in ("unchanged", "updated"):
                return stop(f"auth.json write-back {rec['auth_writeback']!r} in {job}")
            if rec["auth_writeback"] == "updated" and args.lane:
                return stop(f"Codex refreshed its token in {job}; restart the lanes so they all use the new auth.json")
        for window, used in q:
            if used >= args.quota_stop:
                return stop(f"host quota ({window}) at {used}% >= {args.quota_stop}%")
        if {"usage_limited", "tool_failure"} & set(rec["infra_flags"]):
            return stop(f"{','.join(rec['infra_flags'])} in {job}")
        if rec["exception"] and not rec["timed_out"] and "agent_stalled" not in rec["infra_flags"]:
            return stop(f"Harbor exception {rec['exception']} in {job}; see its trial's exception.txt")
        worker_down = worker_down + 1 if "worker_unavailable" in rec["infra_flags"] else 0
        if worker_down >= 2:
            return stop("worker_unavailable twice in a row")
    log("batch complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
