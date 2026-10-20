#!/usr/bin/env python3
"""Markdown tables from the per-trial summary records written by analyze.py.

  usage: report.py [records.jsonl]     (default: bench/results/trials.jsonl, both hosts)

One pair of tables per dataset. Trials flagged with an infra failure (usage_limited,
worker_unavailable, tool_failure) are left out and listed separately; trials whose tool output showed
a benchmark answer key (answer_key_exposure) are marked ⚠. When a (dataset, setup, task, rep) has
several valid records, e.g. an infra rerun, the record from the latest job is used. "resolved" for
the offline-graded datasets comes from analyze.py (every judge passes in most of its repeats).
"""

import argparse
import json
import statistics as st
from pathlib import Path

SETUPS = ["solo", "native", "agy-staff"]


def money(x):
    return f"${x:.2f}"


def main():
    ap = argparse.ArgumentParser(
        description="Markdown tables for review, from analyze.py's records: per dataset and host, each task's result\n"
                    "in each setup, then per setup the solve count, adherence, costs and time. Trials with infra\n"
                    "flags are listed apart; ⚠ marks a trial whose tool output showed an answer key.",
        epilog="""example:
  report.py > /tmp/report.md

for agents:
  - It only reads the records and prints: no model call, no credential. It is for review; the published
    numbers come from viz-data.py.""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("records", nargs="?", type=Path,
                    default=Path(__file__).resolve().parent.parent / "results" / "trials.jsonl",
                    help="analyze.py output (default: bench/results/trials.jsonl)")
    src = ap.parse_args().records
    recs = [json.loads(line) for line in src.read_text().splitlines() if line.strip()]
    infra = [r for r in recs if r["infra_flags"]]
    valid = {}
    for r in sorted((r for r in recs if not r["infra_flags"]), key=lambda r: r["job"]):
        valid[(f"{r.get('dataset', 'swebench-verified')} · host {r.get('host_model')} {r.get('host_effort')}",
               r["setup"], r["instance_id"], r["rep"])] = r
    for ds in sorted({k[0] for k in valid}):
        here = {k: r for k, r in valid.items() if k[0] == ds}
        tasks = sorted({k[2] for k in here})
        setups = [s for s in SETUPS if any(k[1] == s for k in here)]
        print(f"\n### {ds}\n")
        print("| task | " + " | ".join(setups) + " |")
        print("|---|" + "---|" * len(setups))
        for t in tasks:
            cells = []
            for s in setups:
                rs = [r for k, r in here.items() if k[1] == s and k[2] == t]
                cells.append(" / ".join(
                    f"{'✅' if r['resolved'] else '❌'}{' ⚠' if r.get('answer_key_exposure') else ''} "
                    f"{money(r['host_cost_usd'])}, {round(r['wall_clock_s'] / 60, 1)} min" for r in rs) or "—")
            print(f"| `{t.split('/')[-1]}` | " + " | ".join(cells) + " |")
        print("\n| setup | trials | resolved | adhered | host cost / trial (median) | host cost / resolved task | "
              "worker cost / trial (median) | agent time (median) |")
        print("|---|---|---|---|---|---|---|---|")
        for s in setups:
            rs = [r for k, r in here.items() if k[1] == s]
            solved = sum(r["resolved"] for r in rs)
            host = [r["host_cost_usd"] for r in rs]
            per_solved = money(sum(host) / solved) if solved else "—"
            print(f"| {s} | {len(rs)} | {solved}/{len(rs)} | {sum(bool(r['adhered']) for r in rs)}/{len(rs)} | "
                  f"{money(st.median(host))} | {per_solved} | {money(st.median(r['worker_cost_usd'] for r in rs))} | "
                  f"{round(st.median(r['wall_clock_s'] for r in rs) / 60, 1)} min |")
    if infra:
        print("\nExcluded (infra failures): " + ", ".join(f"`{r['job']}` ({', '.join(r['infra_flags'])})" for r in infra))
    exposed = [r["job"] for r in valid.values() if r.get("answer_key_exposure")]
    if exposed:
        print("\n⚠ Answer key seen in tool output: " + ", ".join(f"`{j}`" for j in exposed))


if __name__ == "__main__":
    main()
