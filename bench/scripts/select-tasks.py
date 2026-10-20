#!/usr/bin/env python3
"""Draw the SWE-bench Verified tasks and record them in bench/tasks/tasks.json.

  usage: select-tasks.py [--data DIR] [--out FILE]

Each tier's instance_ids are sorted, shuffled with random.Random(SEED), and walked in order.
A candidate is taken if its repo is under the tier's cap and it passed both checks on its baked
copy (bench/scripts/bake-task.sh), which show that the task's tests can tell a fix from no fix:
  oracle:  run-codex.sh oracle <id> select   -> reward 1.0 (the gold patch passes)
  nop:     run-codex.sh nop <id> select      -> reward 0.0 (no change fails)
The check results are read from the Harbor jobs codex-{oracle,nop}-<id>-select* under
<data>/jobs (the newest job wins, so a rerun can use a suffix like select2).

Prints the walk and the candidates that still need checks, assuming pending candidates will
pass. Writes tasks.json only once every slot holds a checked task.
"""

import argparse
import json
import random
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path

import benchdata

SEED = 20260923
TIERS = [
    # name, difficulty, count, per-repo caps ("*" is the default cap)
    ("core", "15 min - 1 hour", 6, {"django/django": 2, "*": 1}),
    ("stretch", "1-4 hours", 2, {"*": 1}),
]
DATASET = {
    "name": "swebench-verified@1.0",
    "source": "laude-institute/harbor-datasets",
    "ref": "8672367",
}

TASKS_DIR = JOBS_DIR = None  # <data>/datasets/swebench-verified and <data>/jobs, set by main()
OUT = Path(__file__).resolve().parent.parent / "tasks" / "tasks.json"


def load_tasks():
    tasks = {}
    for d in sorted(TASKS_DIR.iterdir()):
        if not (d / "task.toml").is_file():
            continue
        toml = tomllib.loads((d / "task.toml").read_text())
        cfg = json.loads((d / "tests" / "config.json").read_text())
        tasks[d.name] = {
            "instance_id": d.name,
            "repo": cfg["repo"],
            "difficulty": toml["metadata"]["difficulty"],
            "base_commit": cfg["base_commit"],
            "timeout_sec": {
                "agent": toml["agent"]["timeout_sec"],
                "verifier": toml["verifier"]["timeout_sec"],
            },
        }
    return tasks


def check(kind, instance_id):
    """Latest codex-<kind>-<id>-select* job -> {"job", "reward", ...} or None if not run."""
    jobs = sorted(
        JOBS_DIR.glob(f"codex-{kind}-{instance_id}-select*"),
        key=lambda p: p.stat().st_mtime,
    )
    trials = [r for job in jobs[-1:] for r in job.glob("*/result.json")]
    if not trials:
        return None
    r = json.loads(trials[0].read_text())
    exc = r.get("exception_info")
    reward = ((r.get("verifier_result") or {}).get("rewards") or {}).get("reward")
    started = datetime.fromisoformat(r["started_at"])
    finished = datetime.fromisoformat(r["finished_at"]) if r.get("finished_at") else started
    return {
        "job": jobs[-1].name,
        "reward": reward,
        "error": (exc or {}).get("exception_type") if exc else None,
        "duration_s": round((finished - started).total_seconds()),
    }


def verdict(oracle, nop):
    """'pass', 'pending', 'error' (rerun needed, not a task defect), or a skip reason."""
    if oracle is None or nop is None:
        return "pending"
    if oracle["error"] or nop["error"]:
        return "error"
    if oracle["reward"] != 1.0:
        return f"oracle not resolved (reward {oracle['reward']})"
    if nop["reward"] != 0.0:
        return f"nop resolved (reward {nop['reward']})"
    return "pass"


def walk(tasks):
    selected, skipped, todo, errors = [], [], [], []
    for tier, difficulty, count, caps in TIERS:
        order = sorted(i for i, t in tasks.items() if t["difficulty"] == difficulty)
        random.Random(SEED).shuffle(order)
        taken, walked, per_repo = 0, 0, {}
        for rank, iid in enumerate(order, 1):
            if taken == count:
                break
            walked = rank
            t = tasks[iid]
            repo = t["repo"]
            if per_repo.get(repo, 0) >= caps.get(repo, caps["*"]):
                skipped.append({"instance_id": iid, "tier": tier, "rank": rank, "repo": repo,
                                "reason": "repo cap reached"})
                continue
            oracle, nop = check("oracle", iid), check("nop", iid)
            v = verdict(oracle, nop)
            if v in ("pass", "pending", "error"):
                taken += 1
                per_repo[repo] = per_repo.get(repo, 0) + 1
                entry = {**t, "tier": tier, "rank": rank, "checks": {"oracle": oracle, "nop": nop}}
                if v == "pass":
                    selected.append(entry)
                elif v == "pending":
                    todo.append(entry)
                else:
                    errors.append(entry)
            else:
                skipped.append({"instance_id": iid, "tier": tier, "rank": rank, "repo": repo,
                                "reason": v, "checks": {"oracle": oracle, "nop": nop}})
        print(f"{tier}: {len(order)} candidates, walked {walked}, took {taken}/{count}")
    return selected, skipped, todo, errors


def main():
    global TASKS_DIR, JOBS_DIR
    ap = argparse.ArgumentParser(
        description="Draw the SWE-bench Verified tasks with the fixed seed and record them in bench/tasks/tasks.json.\n"
                    "A candidate counts only after its oracle and nop checks: run-codex.sh oracle <id> select and\n"
                    "run-codex.sh nop <id> select. Prints what still needs checks.",
        epilog="""for agents:
  - It reads the dataset and the check jobs and writes --out. Rewriting tasks.json changes the v1 record:
    only do it for a new bench version, when the user asked for new tasks.""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    benchdata.add_argument(ap)
    ap.add_argument("--out", type=Path, default=OUT, help="where to write the record (default: bench/tasks/tasks.json)")
    args = ap.parse_args()
    data = benchdata.resolve(args.data)
    TASKS_DIR, JOBS_DIR = data / "datasets" / "swebench-verified", data / "jobs"
    tasks = load_tasks()
    selected, skipped, todo, errors = walk(tasks)
    for e in selected:
        print(f"  ok      {e['tier']:<8} #{e['rank']:<3} {e['instance_id']}")
    for e in errors:
        print(f"  ERROR   {e['tier']:<8} #{e['rank']:<3} {e['instance_id']}  {e['checks']}")
    for e in todo:
        print(f"  pending {e['tier']:<8} #{e['rank']:<3} {e['instance_id']}")
    for s in skipped:
        if s["reason"] != "repo cap reached":
            print(f"  skipped {s['tier']:<8} #{s['rank']:<3} {s['instance_id']}  {s['reason']}")
    if todo or errors:
        print("\nneeds checks:", " ".join(e["instance_id"] for e in todo + errors))
        return 1
    args.out.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "seed": SEED,
        "shuffle": "per tier: Python random.Random(seed).shuffle over the tier's instance_ids sorted ascending",
        "dataset": DATASET,
        "tiers": [{"name": n, "difficulty": d, "count": c, "repo_caps": caps} for n, d, c, caps in TIERS],
        "checks": "oracle reward 1.0 and nop reward 0.0 on the baked task (bench/scripts/bake-task.sh)",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "selected": selected,
        "skipped": skipped,
    }
    args.out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
