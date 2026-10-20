#!/usr/bin/env python3
"""Where does a trial's wall-clock time go? Splits each agent's time into model / tool / idle.

  usage: timeline.py [--data DIR] <job-name> [...]

agy (brain transcript_full.jsonl): a PLANNER_RESPONSE's created_at is when the model started
thinking; each following GENERIC tool result carries "Created At" (tool start = model done) and
"Completed At" (tool end). Anything between a tool's end and the next step's start is idle,
e.g. waiting for a background task to send its SYSTEM_MESSAGE.
Codex (rollout): a tool call's timestamp is when the model finished; its *_output timestamp is
when the tool finished; the next call's timestamp minus the previous output is model time.
"""
import glob
import json
import os
import re
from datetime import datetime

J = None  # <data>/jobs, set in __main__


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def agy_timeline(path):
    S = [json.loads(l) for l in open(path)]
    model = tool = idle = 0.0
    steps, cmds, bg = 0, [], 0
    last_end = ts(S[0]["created_at"])
    pending = None  # (planner start, tool calls)
    for s in S:
        t = ts(s["created_at"])
        if s["type"] == "PLANNER_RESPONSE":
            steps += 1
            idle += max(0, (t - last_end).total_seconds())
            pending = (t, s.get("tool_calls") or [])
            bg += sum(1 for tc in pending[1] if tc["name"] == "schedule")
            last_end = t
            if not pending[1]:
                last_end = t  # turn ended; time until the next step is idle (waiting)
        elif s["type"] == "GENERIC" and pending:
            c = s.get("content") or ""
            m1 = re.search(r"Created At: (\S+)", c)
            m2 = re.search(r"Completed At: (\S+)", c)
            if m1 and m2:
                a, b = ts(m1.group(1)), ts(m2.group(1))
                model += max(0, (a - pending[0]).total_seconds())
                tool += (b - a).total_seconds()
                name = pending[1][0]["name"] if pending[1] else "?"
                arg = pending[1][0].get("args", {}).get("CommandLine", "") if pending[1] else ""
                cmds.append(((b - a).total_seconds(), name, arg.replace("\n", " ")[:90]))
                last_end = b
                pending = (b, pending[1])  # parallel results: no extra model time
        elif s["type"] in ("SYSTEM_MESSAGE", "USER_INPUT"):
            idle += max(0, (t - last_end).total_seconds())
            last_end = t
    span = (ts(S[-1]["created_at"]) - ts(S[0]["created_at"])).total_seconds()
    return dict(span=span, steps=steps, model=model, tool=tool, idle=max(0, span - model - tool), bg=bg,
                slow=sorted(cmds, reverse=True)[:4], n_cmds=len(cmds))


def codex_timeline(path):
    L = [json.loads(l) for l in open(path)]
    meta = L[0]["payload"]
    me = meta["id"]
    own = {e["payload"]["turn_id"] for e in L if e["type"] == "token_usage_record" and e["payload"]["thread_id"] == me}
    start = next((i for i, e in enumerate(L) if e["type"] in ("turn_context", "event_msg")
                  and e["payload"].get("turn_id") in own), len(L))
    L = L[start:]
    calls, model, tool, steps = {}, 0.0, 0.0, 0
    cmds = []
    last = ts(L[0]["timestamp"]) if L else None
    waits = 0.0
    for e in L:
        p = e.get("payload", {})
        t = ts(e["timestamp"])
        if e["type"] == "response_item" and p.get("type") in ("custom_tool_call", "function_call"):
            steps += 1
            model += max(0, (t - last).total_seconds())
            calls[p.get("call_id")] = (t, p.get("name"), (p.get("input") or p.get("arguments") or ""))
            last = t
        elif e["type"] == "response_item" and p.get("type") in ("custom_tool_call_output", "function_call_output"):
            c = calls.pop(p.get("call_id"), None)
            if c:
                d = (t - c[0]).total_seconds()
                if c[1] in ("wait_agent", "wait"):
                    waits += d
                else:
                    tool += d
                m = re.search(r'cmd:"((?:[^"\\]|\\.)*)"', c[2])
                cmds.append((d, c[1], (m.group(1) if m else c[2])[:90]))
            last = t
    span = (ts(L[-1]["timestamp"]) - ts(L[0]["timestamp"])).total_seconds() if L else 0
    return dict(span=span, steps=steps, model=model, tool=tool, wait=waits,
                slow=sorted(cmds, reverse=True)[:4], n_cmds=len(cmds))


def trial(job):
    T = glob.glob(f"{J}/{job}/*/")[0]
    r = json.load(open(T + "result.json"))
    a = r["agent_execution"]
    t0, t1 = ts(a["started_at"]), ts(a["finished_at"])
    print(f"\n=== {job}  agent {round((t1 - t0).total_seconds())}s")
    for lg in sorted(glob.glob(T + "artifacts/*/.agy-staff/jobs/*.log")):
        reg = re.search(r"dispatch registered \S+ at (\S+)", open(lg).read())
        status = lg.replace(".log", ".result.md.status.json")
        if not reg or not os.path.isfile(status):  # still running when the trial ended (e.g. a timeout)
            print(f"  agy job {lg.split('/')[-1][:28]}: did not finish")
            continue
        st = json.load(open(status))
        a_, b_ = ts(reg.group(1)), ts(st["finished_at"])
        print(f"  agy job {lg.split('/')[-1][:28]}: starts +{round((a_ - t0).total_seconds())}s, "
              f"runs {round((b_ - a_).total_seconds())}s, ends {round((t1 - b_).total_seconds())}s before trial end")
    for tr in glob.glob(T + "artifacts/root/.gemini/antigravity-cli/brain/*/.system_generated/logs/transcript_full.jsonl"):
        x = agy_timeline(tr)
        print(f"  agy: {x['steps']} model calls, {x['n_cmds']} tool calls; span {round(x['span'])}s = "
              f"model {round(x['model'])}s ({round(x['model'] / max(1, x['steps']), 1)}s/call) + tools {round(x['tool'])}s "
              f"+ idle {round(x['idle'])}s; background tasks {x['bg']}")
        for d, n, c in x["slow"]:
            print(f"      {round(d):>4}s {n}: {c}")
    for p in sorted(glob.glob(T + "agent/sessions/**/rollout-*.jsonl", recursive=True)):
        meta = json.loads(open(p).readline())["payload"]
        role = "host" if meta["source"] == "exec" else meta["source"]["subagent"]["thread_spawn"]["agent_path"]
        x = codex_timeline(p)
        if not x["steps"]:
            continue
        extra = f" + waiting on workers/jobs {round(x['wait'])}s" if x["wait"] else ""
        print(f"  {role}: {x['steps']} tool calls; span {round(x['span'])}s = model {round(x['model'])}s "
              f"({round(x['model'] / max(1, x['steps']), 1)}s/call) + tools {round(x['tool'])}s{extra}")
        for d, n, c in x["slow"][:3]:
            print(f"      {round(d):>4}s {n}: {c}")


if __name__ == "__main__":
    import argparse

    import benchdata
    ap = argparse.ArgumentParser(
        description="Where a trial's wall-clock time went: for the host, each native worker and each agy job,\n"
                    "the time in model calls, in tools and idle, and the slowest tool calls. A diagnostic for\n"
                    "why a setup is slow; the published table does not use it.",
        epilog="""example:
  timeline.py claude-agy-staff-deepsearchqa-0118-c55x-r1

for agents:
  - It only reads job directories and prints: no model call, no credential.""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    benchdata.add_argument(ap)
    ap.add_argument("jobs", nargs="+", metavar="job-name")
    args = ap.parse_args()
    J = os.path.join(benchdata.resolve(args.data), "jobs")
    for job in args.jobs:
        trial(job)
