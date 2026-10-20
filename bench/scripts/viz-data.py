#!/usr/bin/env python3
"""The published data of a bench version: one JSON with the trials and the per-group aggregates.

  usage: viz-data.py [records.jsonl] [--out FILE]   (default: bench/results/trials.jsonl -> bench/results/viz-data.json)
         e.g. viz-data.py --out bench/results/v2/data.json

bench/results/v1/data.json is this script's output for v1, byte for byte.

A run is one host configuration (model + effort) on one agy-staff build. Its trials are the formal jobs
(suffix -r<n>, plus -rerun<k> reruns) of that host; for each (dataset, setup, task, rep) the latest valid
record is kept, as in report.py, and trials flagged with an infra failure are left out. Runs are keyed
by agy-staff version, so results from later plugin versions add new series instead of replacing these.
Tokens: input (uncached), cache_creation (writes), cache_read, output (includes reasoning); costs are API
list-price USD. host_cost is the host subscription; worker_cost is the delegate (agy: Gemini price
equivalent on agy's own quota; native: the host family's worker on the same subscription).
"""

import argparse
import json
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "results" / "trials.jsonl"
OUT = ROOT / "results" / "viz-data.json"
# The runs a bench version publishes: (host_model, job tag) -> label. A new version edits this list; a trial
# belongs to a run when its host model matches and its job name carries the tag (e.g. -c55x-r1).
RUNS = {
    ("gpt-6.1-sol", "s61x"): {"host": "Codex", "model": "GPT-6.1 Sol", "effort": "xhigh", "cli": "Codex 0.160.1"},
    ("claude-opus-5-5", "c55x"): {"host": "Claude Code", "model": "Claude Opus 5.5", "effort": "xhigh",
                                  "cli": "Claude Code 2.1.296"},
}
TOKEN_KEYS = ("input", "cache_creation", "cache_read", "output")


def run_key(r):
    for (model, tag), meta in RUNS.items():
        if r.get("host_model") == model and f"-{tag}-" in r["job"] + "-":
            return model, tag
    return None


def main(argv):
    ap = argparse.ArgumentParser(
        description="Write a bench version's data.json from analyze.py's records: the trials of the runs listed in\n"
                    "RUNS in this script (the latest valid record per task and repetition; trials with infra flags\n"
                    "left out), and the per-group aggregates the table shows.",
        epilog="""examples:
  viz-data.py --out bench/results/v2/data.json     a new version, after editing RUNS
  viz-data.py --out /tmp/v1-data.json              v1 again: identical to bench/results/v1/data.json, except
                                                   that "source" names the input you passed

for agents:
  - It reads the records and writes --out: no model call, no credential. A published version is never
    edited: do not write into bench/results/v1/ or another published version's directory.""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("records", nargs="?", type=Path, default=SRC,
                    help="analyze.py output (default: bench/results/trials.jsonl)")
    ap.add_argument("--out", type=Path, default=OUT, help="output (default: bench/results/viz-data.json)")
    args = ap.parse_args(argv)
    src, out = args.records, args.out
    recs = [json.loads(line) for line in src.read_text().splitlines() if line.strip()]
    latest = {}
    for r in sorted(recs, key=lambda r: r["job"]):
        k = run_key(r)
        if not k or r["infra_flags"]:
            continue
        latest[(r["agy_staff_version"], k, r["dataset"], r["setup"], r["instance_id"], r["rep"])] = r

    trials = []
    for (version, (model, tag), dataset, setup, task, rep), r in sorted(latest.items()):
        meta = RUNS[(model, tag)]
        trials.append({
            "agy_staff": version, "host": meta["host"], "model": meta["model"], "effort": meta["effort"], "cli": meta["cli"],
            "dataset": dataset, "setup": setup, "task": task.split("/")[-1], "rep": rep, "job": r["job"],
            "resolved": r["resolved"], "reward": r["reward"], "timed_out": r["timed_out"],
            "answer_key_exposure": bool(r.get("answer_key_exposure")),
            "host_cost": r["host_cost_usd"], "worker_cost": r["worker_cost_usd"],
            "host_tokens": {k: r["host_tokens"].get(k, 0) for k in TOKEN_KEYS},
            "worker_tokens": {k: r["worker_tokens"].get(k, 0) for k in TOKEN_KEYS},
            "wall_clock_s": r["wall_clock_s"], "claude_binary": r.get("claude_binary"),
        })

    groups = defaultdict(list)
    for t in trials:
        groups[(t["agy_staff"], t["host"], t["model"], t["effort"], t["dataset"], t["setup"])].append(t)
    aggregates = []
    for (version, host, model, effort, dataset, setup), ts in sorted(groups.items()):
        n = len(ts)
        hc = sum(t["host_cost"] for t in ts); wc = sum(t["worker_cost"] for t in ts)
        aggregates.append({
            "agy_staff": version, "host": host, "model": model, "effort": effort, "dataset": dataset,
            "setup": setup, "trials": n, "resolved": sum(t["resolved"] for t in ts),
            "resolve_rate": round(sum(t["resolved"] for t in ts) / n, 4),
            "host_cost": round(hc, 4), "worker_cost": round(wc, 4), "total_cost": round(hc + wc, 4),
            "host_cost_per_trial": round(hc / n, 4), "total_cost_per_trial": round((hc + wc) / n, 4),
            "host_tokens": {k: sum(t["host_tokens"][k] for t in ts) for k in TOKEN_KEYS},
            "worker_tokens": {k: sum(t["worker_tokens"][k] for t in ts) for k in TOKEN_KEYS},
            "median_minutes": round(st.median(t["wall_clock_s"] for t in ts) / 60, 2),
            "timeouts": sum(t["timed_out"] for t in ts),
            "exposure": sum(t["answer_key_exposure"] for t in ts),
        })
    doc = {
        "source": str(src.relative_to(ROOT.parent)) if src.is_relative_to(ROOT.parent) else str(src),
        "agy_staff_versions": sorted({t["agy_staff"] for t in trials}),
        "runs": [dict(meta, model_id=m, tag=tag) for (m, tag), meta in RUNS.items()],
        "trials": trials, "aggregates": aggregates,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {len(trials)} trials, {len(aggregates)} groups to {out}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
