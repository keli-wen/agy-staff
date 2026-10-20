#!/usr/bin/env python3
"""Draw the SWE-Atlas QnA and DeepSearchQA tasks and record them in bench/tasks/pilot.json.

  usage: select-pilot.py [--data DIR] [--out FILE]

Each layer's task names are sorted, shuffled with random.Random(SEED), and walked in order. A task
is taken while its stratum still has room and it does not repeat a repository (or category) already
taken in that layer. The walk continues to EXTEND tasks per layer: the first PILOT of them form the
pilot, and the rest are the pre-registered order for any later extension, so adding tasks never
involves choosing them after seeing results. v1 ran all EXTEND tasks of both layers.

  investigate  swe-atlas-qna  distinct repository; at most 2 per category;
                              the pilot covers two different categories
  research     deepsearchqa   strata by answer_type: Set Answer 4, Single Answer 2;
                              distinct problem_category; the pilot takes the first of each

Both datasets were downloaded with Harbor at their latest version (no version pin), so each task
also records the sha256 of its files, to check a later download against.
"""

import argparse
import hashlib
import json
import random
import tomllib
from datetime import datetime, timezone
from pathlib import Path

import benchdata

SEED = 20260923  # same seed as the SWE-bench layer (select-tasks.py)
PILOT, EXTEND = 2, 6
DATA = None  # set by main()
OUT = Path(__file__).resolve().parent.parent / "tasks" / "pilot.json"


def qna(d):
    meta = tomllib.loads((d / "task.toml").read_text())["metadata"]
    return {"repo": meta["repository"], "category": meta["category"], "language": meta["language"],
            "rubric_items": len(json.loads((d / "tests" / "rubrics.json").read_text()))}


def dsqa(d):
    m = json.loads((d / "tests" / "metadata.json").read_text())
    return {"category": m["problem_category"], "answer_type": m["answer_type"]}


def digest(d):
    """sha256 over the task's files (relative path and contents, in path order), Python caches left out."""
    h = hashlib.sha256()
    for f in sorted(p for p in d.rglob("*") if p.is_file() and "__pycache__" not in p.parts):
        h.update(f.relative_to(d).as_posix().encode() + b"\0" + f.read_bytes() + b"\0")
    return h.hexdigest()


LAYERS = [
    {"layer": "investigate", "dataset": "swe-atlas-qna", "load": qna,
     "keep": lambda t: True, "stratum": lambda t: "all", "quota": {"all": EXTEND},
     "distinct": ["repo"], "cap": ("category", 2), "pilot_distinct": "category"},
    {"layer": "research", "dataset": "deepsearchqa", "load": dsqa,
     "keep": lambda t: True, "stratum": lambda t: t["answer_type"],
     "quota": {"Set Answer": 4, "Single Answer": 2}, "distinct": ["category"], "cap": None},
]


def walk(spec):
    root = DATA / "datasets" / spec["dataset"]
    names = sorted(p.name for p in root.iterdir() if (p / "task.toml").is_file())
    random.Random(SEED).shuffle(names)
    taken, used, per_cap, room = [], {k: set() for k in spec["distinct"]}, {}, dict(spec["quota"])
    for rank, name in enumerate(names, 1):
        if not any(room.values()):
            break
        t = {"task": name, **spec["load"](root / name)}
        s = spec["stratum"](t)
        if not spec["keep"](t) or room.get(s, 0) == 0 or any(t[k] in used[k] for k in spec["distinct"]):
            continue
        if spec["cap"] and per_cap.get(t[spec["cap"][0]], 0) >= spec["cap"][1]:
            continue
        room[s] -= 1
        for k in spec["distinct"]:
            used[k].add(t[k])
        if spec["cap"]:
            per_cap[t[spec["cap"][0]]] = per_cap.get(t[spec["cap"][0]], 0) + 1
        taken.append({**t, "rank": rank, "stratum": s})
    # Pilot: the first task of each stratum in walk order (or, with pilot_distinct, the first tasks
    # that differ in that field), then walk order for the rest.
    if spec.get("pilot_distinct"):
        k, firsts = spec["pilot_distinct"], []
        for t in taken:
            if len(firsts) < PILOT and all(t[k] != f[k] for f in firsts):
                firsts.append(t)
    else:
        firsts = [next(t for t in taken if t["stratum"] == s) for s in spec["quota"]]
    order = firsts + [t for t in taken if t not in firsts]
    for i, t in enumerate(order, 1):
        t["order"], t["pilot"] = i, i <= PILOT
        t["sha256"] = digest(root / t["task"])
    return len(names), order


def main():
    global DATA
    ap = argparse.ArgumentParser(
        description="Draw the SWE-Atlas QnA and DeepSearchQA tasks with the fixed seed and record them, with a\n"
                    "sha256 of each task's files, in bench/tasks/pilot.json.",
        epilog="""for agents:
  - It reads the datasets and writes --out. Rewriting pilot.json changes the v1 record: only do it for a new
    bench version, when the user asked for new tasks. To check a fresh download against v1, write to
    another file with --out and compare the sha256 fields.""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    benchdata.add_argument(ap)
    ap.add_argument("--out", type=Path, default=OUT, help="where to write the record (default: bench/tasks/pilot.json)")
    args = ap.parse_args()
    DATA = benchdata.resolve(args.data)
    doc = {
        "seed": SEED,
        "shuffle": "per layer: Python random.Random(seed).shuffle over the dataset's task names sorted ascending",
        "pilot_size": PILOT,
        "extension_size": EXTEND,
        "extension_rule": "Pre-registered (2026-10-12): after the pilot, a layer is extended in "
                          "'order' only on cost and infrastructure grounds, never on results.",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "layers": [],
    }
    for spec in LAYERS:
        n, order = walk(spec)
        doc["layers"].append({"layer": spec["layer"], "dataset": spec["dataset"], "candidates": n,
                              "distinct": spec["distinct"], "quota": spec["quota"], "tasks": order})
        print(f"{spec['layer']} ({spec['dataset']}, {n} candidates)")
        for t in order:
            extra = {k: v for k, v in t.items() if k not in ("task", "rank", "order", "pilot", "stratum", "sha256")}
            print(f"  {'PILOT' if t['pilot'] else 'later'} #{t['order']} (walk rank {t['rank']:>3}) {t['task']}  {extra}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
