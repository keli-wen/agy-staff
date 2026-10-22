#!/usr/bin/env python3
"""Per-trial summary records for Codex- and Claude Code-hosted Harbor trials.

  usage: analyze.py [--data DIR] [--out FILE|-] [job-glob ...]
         (default: every formal run, jobs codex-*-r<n> and claude-*-r<n>, -> bench/results/trials.jsonl)

Claude Code trials (agent/claude-code.txt present) are read by summarize_claude(); see its docstring.
Sources for Codex trials, per trial directory under <data>/jobs/<job>/<trial>/:
- result.json / config.json        reward, timings, exception, setup (from the agent kwargs)
- agent/codex.txt                  host actions (`codex exec --json`): commands, file changes, web searches
- agent/sessions/**/rollout-*.jsonl  tokens. The FIRST session_meta line says whose rollout it
                                   is: source "exec" is the host, {"subagent": ...} a native worker. A forked
                                   worker rollout replays its parent's history first, so only turns that
                                   have a token_usage_record with this thread_id count as its own.
- artifacts/<workdir>/.agy-staff/  agy-staff jobs (state.json, <job>.events.jsonl result usage, <job>.log);
                                   <workdir> is testbed, app or workspace depending on the dataset
- artifacts/root/.gemini/antigravity-cli/brain/*/.system_generated/logs/transcript_full.jsonl
                                   agy actions, and per-step tokens as a fallback when a job has no result

Heuristic fields (final_patch_author, cheat_flag, the infra flags) are meant for triage; every hit
is reviewed by hand before it changes a result.
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import benchdata

JOBS = None  # <data>/jobs, set by main()
OUT = Path(__file__).resolve().parent.parent / "results" / "trials.jsonl"

# The native setups' worker: Codex's default_subagent_model (configs/codex/native.toml), and the model
# run-claude.sh forces every Claude Code subagent onto.
WORKER_MODEL = {"native": "gpt-6-luna"}
CLAUDE_WORKER_MODEL = {"native": "claude-sonnet-5-5"}
# Standard API prices in USD per 1M tokens: (input, cached input / cache read, output), checked 2026-10-09.
#   OpenAI  https://developers.openai.com/api/docs/pricing   (output includes reasoning tokens)
#   Gemini  https://ai.google.dev/gemini-api/docs/pricing    (output includes thinking; 3.8 Flash doubles on 2027-01-01)
# Codex's subscription rate card (https://learn.chatgpt.com/docs/pricing) is exactly 25 credits per API dollar for
# these models, so host USD is proportional to the ChatGPT usage limit it consumes.
PRICE_USD = {
    "gpt-6-astra": (10.00, 1.00, 50.00), "gpt-6-sol": (2.00, 0.20, 10.00), "gpt-6-luna": (0.10, 0.01, 0.50),
    "gpt-6.1-sol": (2.00, 0.10, 10.00),  # checked 2026-10-13; standard tier, <=272K input tokens
    "gemini-3.8-flash": (0.75, 0.075, 3.75),
}


def usd(model, uncached, cached, output):
    p = PRICE_USD[model]
    return (uncached * p[0] + cached * p[1] + output * p[2]) / 1e6
JOB_RE = re.compile(r"-r(\d+)(?:-rerun(\d+))?$")
LIMIT_RE = re.compile(r"usage limit|rate.?limit|\b429\b|quota|hit your .*limit", re.I)
# The smoke-test incident: a missing codex-code-mode-host made every command fail. A router error
# alone is not enough (e.g. "agent path `/root/worker` already exists" is an ordinary tool error).
TOOL_FAILURE_RE = re.compile(r"failed to spawn")
ROUTER_ERROR_RE = re.compile(r"ERROR codex_core::tools::router")
# File writes that are not apply_patch / file_change: python scripts, sed -i, perl -i.
SHELL_EDIT_RE = re.compile(r"apply_patch|\.write_text\(|\.write\(|\bsed\s+-i|\bperl\s+-\w*i"
                           r"|\bcat\b[^|;&\n]*?>{1,2}\s*(?!/dev/null)[\w/.~-]|\btee\s+(?:-a\s+)?[\w/.~-]")
WORKER_DOWN_RE = re.compile(r"at capacity|\b503\b|UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|\b429\b")
AGY_EDIT_TOOLS = re.compile(r"replace_file_content|write_to_file|create_file|edit_file|delete_file")
# Cheating rules (upstream fix from git history or the web, the dataset itself, the hidden tests),
# applied to actions only (commands, tool-call arguments, search queries), never to tool output. Edits to the files the test patch touches are not flagged: the verifier checks those
# files out at base_commit before applying the test patch (tests/test.sh), so they cannot sway it.
CHEAT_RULES = [
    ("git-history", re.compile(r"git\s+log\b[^|;&\n]*--all|git\s+(fetch|fsck|reflog)\b|git\s+remote\s+add"
                               r"|git\s+show\s+(?!HEAD)[0-9a-f]{7,40}\b")),
    ("upstream-web", re.compile(r"github\.com/[\w.-]+/[\w.-]+/(pull|commit|compare|issues)")),
    # "-site:huggingface.co" in a search query excludes the site, so it is not a hit.
    ("dataset", re.compile(r"(?<!-site:)(?:huggingface\.co|swe-?bench|swe[ -]?atlas|deepsearch-?qa|featurebench)", re.I)),
    ("hidden-files", re.compile(r"(?<![\w./-])/(tests|solution)(/|\b)")),
]


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def secs(a, b):
    return round((ts(b) - ts(a)).total_seconds()) if a and b else None


def jsonl(path):
    out = []
    for line in path.read_text(errors="replace").splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return out


def codex_tokens(records):
    t = {"input": 0, "cache_creation": 0, "cache_read": 0, "output": 0, "reasoning": 0}
    for u in records:
        cached = u.get("cached_input_tokens", 0)
        t["input"] += u.get("input_tokens", 0) - cached  # Codex input_tokens includes the cached part
        t["cache_read"] += cached
        t["cache_creation"] += u.get("cache_write_input_tokens", 0)
        t["output"] += u.get("output_tokens", 0)  # includes reasoning
        t["reasoning"] += u.get("reasoning_output_tokens", 0)
    return t


def add(a, b):
    return {k: a.get(k, 0) + b.get(k, 0) for k in set(a) | set(b)}


def total(t):
    return t["input"] + t["cache_creation"] + t["cache_read"] + t["output"]


def read_rollout(path):
    lines = jsonl(path)
    meta = lines[0]["payload"] if lines and lines[0].get("type") == "session_meta" else {}
    me = meta.get("id")
    src = meta.get("source")
    usage = [e["payload"] for e in lines
             if e.get("type") == "token_usage_record" and e["payload"].get("thread_id") == me]
    turn_model = {e["payload"].get("turn_id"): e["payload"].get("model") for e in lines if e.get("type") == "turn_context"}
    turn_effort = {e["payload"].get("turn_id"): e["payload"].get("effort") for e in lines if e.get("type") == "turn_context"}
    cost, unpriced = 0.0, set()
    for u in usage:
        model = turn_model.get(u.get("turn_id"))
        x = u["usage"]
        cached = x.get("cached_input_tokens", 0)
        if model not in PRICE_USD:
            unpriced.add(model)  # reported, not silently billed at another model's price
            continue
        cost += usd(model, x.get("input_tokens", 0) - cached, cached, x.get("output_tokens", 0))
    own_turns = {u.get("turn_id") for u in usage}
    start = next((i for i, e in enumerate(lines)
                  if e.get("type") in ("turn_context", "event_msg")
                  and e.get("payload", {}).get("turn_id") in own_turns), len(lines))
    own = lines[start:]
    rate = [e["payload"].get("rate_limits") for e in own
            if e.get("type") == "event_msg" and e["payload"].get("type") == "token_count"]
    return {
        "role": "host" if src == "exec" else "worker",
        "thread_id": me,
        "agent_path": (src or {}).get("subagent", {}).get("thread_spawn", {}).get("agent_path")
        if isinstance(src, dict) else None,
        "tokens": codex_tokens([u["usage"] for u in usage]),
        "cost_usd": cost,
        "responses": len(usage),
        "models": sorted({e["payload"].get("model") for e in own if e.get("type") == "turn_context"
                          and e["payload"].get("turn_id") in own_turns}),
        "efforts": sorted({str(turn_effort.get(u.get("turn_id"))) for u in usage}),
        "unpriced_models": sorted(str(m) for m in unpriced),
        "own": own,
        "rate_limits": next((r for r in reversed(rate) if r), None),
    }


def rollout_actions(r):
    """Action strings from a rollout's own items: tool-call inputs/arguments and web searches."""
    acts, edits, spawns, errors = [], 0, [], []
    for e in r["own"]:
        p = e.get("payload", {})
        if e.get("type") == "response_item":
            if p.get("type") == "custom_tool_call":
                acts.append(p.get("input", ""))
                edits += bool(SHELL_EDIT_RE.search(p.get("input", "")))
            elif p.get("type") == "function_call":
                acts.append(f"{p.get('name')} {p.get('arguments', '')}")
                if p.get("name") == "spawn_agent":
                    try:
                        spawns.append(json.loads(p.get("arguments") or "{}"))
                    except json.JSONDecodeError:
                        spawns.append({})
            elif p.get("type") == "web_search_call":
                acts.append(f"web_search {json.dumps(p.get('action', {}))}")
            elif p.get("type") == "agent_message":  # message from another agent, e.g. a worker's final answer
                text = " ".join(c.get("text", "") for c in p.get("content", []) if isinstance(c, dict))
                if "Agent errored:" in text:
                    errors.append(text.split("Agent errored:", 1)[1].strip()[:200])
        elif e.get("type") == "event_msg" and p.get("type") in ("error", "stream_error"):
            errors.append(str(p.get("message", ""))[:200])
    return acts, edits, spawns, errors


def host_events(trial):
    """Host actions and errors from codex.txt (the `codex exec --json` stream)."""
    path = trial / "agent" / "codex.txt"
    acts, edits, errors, raw, ok_cmds = [], 0, [], "", 0
    if not path.is_file():
        return acts, edits, errors, raw, ok_cmds
    raw = path.read_text(errors="replace")
    for e in jsonl(path):
        item = e.get("item") or {}
        if e.get("type") in ("error", "turn.failed"):
            errors.append(json.dumps(e)[:300])
        if e.get("type") != "item.completed":
            continue
        kind = item.get("type")
        if kind == "command_execution":
            acts.append(item.get("command", ""))
            edits += bool(SHELL_EDIT_RE.search(item.get("command", "")))
            ok_cmds += item.get("exit_code") == 0
        elif kind == "file_change":
            edits += 1
        elif kind == "web_search":
            acts.append(f"web_search {item.get('query', '')}")
        elif kind == "mcp_tool_call":
            acts.append(f"mcp {item.get('server')} {item.get('tool')} {json.dumps(item.get('arguments'))}")
        elif kind == "error":
            errors.append(str(item.get("message", ""))[:300])
    return acts, edits, errors, raw, ok_cmds


def agy_jobs(trial):
    """agy-staff jobs collected from <workdir>/.agy-staff, with usage and errors."""
    states = sorted((trial / "artifacts").glob("*/.agy-staff/state.json"))
    if not states:
        return []
    root = states[0].parent
    state = root / "state.json"
    jobs = []
    for j in json.loads(state.read_text()).get("jobs", []):
        jid = j.get("id")
        events = root / "jobs" / f"{jid}.events.jsonl"
        log = root / "jobs" / f"{jid}.log"
        result = next((e["result"] for e in reversed(jsonl(events)) if e.get("event") == "result"), None) \
            if events.is_file() else None
        log_text = log.read_text(errors="replace") if log.is_file() else ""
        agy_errors = [ln for ln in log_text.splitlines() if ln.startswith("AGY_ERROR")]
        if result and result.get("error"):
            agy_errors.append(result["error"])
        jobs.append({
            "id": jid, "mode": j.get("mode"), "model": j.get("model"), "status": j.get("status"),
            "conversation_id": j.get("conversation_id"), "usage": (result or {}).get("usage"),
            "errors": agy_errors,
        })
    return jobs


def agy_transcripts(trial):
    brain = trial / "artifacts" / "root" / ".gemini" / "antigravity-cli" / "brain"
    return {p.parts[-4]: jsonl(p) for p in brain.glob("*/.system_generated/logs/transcript_full.jsonl")}


def agy_worker(trial, jobs):
    """agy actions, edits and tokens (input excludes cache reads, as in agy's own usage)."""
    transcripts = agy_transcripts(trial)
    acts, edits = [], 0
    for steps in transcripts.values():
        for s in steps:
            for tc in s.get("tool_calls") or []:
                acts.append(f"{tc.get('name')} {json.dumps(tc.get('args', {}))}")
                edits += bool(AGY_EDIT_TOOLS.search(tc.get("name", ""))
                              or SHELL_EDIT_RE.search(json.dumps(tc.get("args", {}))))
    # Usage is per conversation: a `--continue` job reports the conversation's cumulative usage, so
    # take the largest result per conversation, not the sum over jobs. The brain transcript has the
    # same per-step counts (minus thinking); it wins when larger, e.g. a job killed before its result.
    per_conv = {}
    for j in jobs:
        u = j["usage"] or {}
        cur = per_conv.get(j["conversation_id"], {})
        if u.get("input_tokens", 0) >= cur.get("input", -1):
            per_conv[j["conversation_id"]] = {
                "input": u.get("input_tokens", 0), "cache_read": u.get("cache_read_tokens", 0),
                "output": u.get("output_tokens", 0), "thinking": u.get("thinking_tokens", 0)}
    tokens = {"input": 0, "cache_creation": 0, "cache_read": 0, "output": 0, "thinking": 0}
    sources = set()
    for conv in set(per_conv) | set(transcripts):
        res = per_conv.get(conv) or {}
        steps = [s for s in transcripts.get(conv, []) if s.get("type") == "PLANNER_RESPONSE"]
        tr = {"input": sum(s.get("input_tokens") or 0 for s in steps),
              "cache_read": sum(s.get("cache_read_tokens") or 0 for s in steps),
              "output": sum(s.get("output_tokens") or 0 for s in steps)}
        if tr["input"] > res.get("input", 0):
            tokens, _ = add(tokens, tr), sources.add("brain transcript (no thinking tokens)")
        else:
            tokens, _ = add(tokens, res), sources.add("events.result.usage")
    source = " + ".join(sorted(sources)) or None
    return acts, edits, tokens, source


# Answer keys or mirrors of the benchmark datasets showing up in what the agents read (search
# results, fetched pages, agy transcripts). Unlike CHEAT_RULES this looks at tool output, so it also
# catches a key that a search returned without being asked for.
EXPOSURE_RE = re.compile(r"huggingface\.co/datasets/[^\s\"']*(?:deepsearch|dsqa|swe-?atlas|swe-?bench|featurebench)"
                         r"|DSQA-full|kaggle\.com/benchmarks/google/dsqa|scaleapi/SWE-Atlas", re.I)


def answer_key_exposure(trial, codex_txt):
    hits = []
    sources = [("host", codex_txt)]
    for t in (trial / "artifacts").glob("root/.gemini/antigravity-cli/brain/*/.system_generated/logs/transcript_full.jsonl"):
        sources.append(("agy", t.read_text(errors="replace")))
    for p in (trial / "agent").glob("sessions/**/rollout-*.jsonl"):
        sources.append(("rollout", p.read_text(errors="replace")))
    for p in (trial / "agent").glob("sessions/projects/**/*.jsonl"):  # Claude Code sessions and subagents
        sources.append(("session", p.read_text(errors="replace")))
    for who, text in sources:
        for m in EXPOSURE_RE.finditer(text):
            hits.append({"in": who, "match": m.group(0)})
    uniq = {(h["in"], h["match"]) for h in hits}
    return [{"in": w, "match": m} for w, m in sorted(uniq)] or None


DISPATCH_RE = re.compile(r"Started background (\w+) job\.\s+job id:\s*(\S+)(?:.*?model:\s*(\S+))?", re.S)


def dispatches_from_host_log(trial, outputs=None):
    """agy-staff jobs as the host saw them start, from codex.txt (or the given command outputs). Used when
    the job state is gone, e.g. when the host ran agy from a temporary directory and deleted it."""
    if outputs is None:
        outputs = [it.get("aggregated_output") or "" for e in jsonl(trial / "agent" / "codex.txt")
                   for it in [e.get("item") or {}]
                   if e.get("type") == "item.completed" and it.get("type") == "command_execution"]
    out = []
    for text in outputs:
        for m in DISPATCH_RE.finditer(text):
            out.append({"kind": "agy-staff", "persona": m.group(1), "model": m.group(3),
                        "job_id": m.group(2), "status": None, "source": "host log"})
    return out


def grading(trial):
    """Offline grades from grade.py, per judge: repeats, pass rate (QnA) or mean F1 (DeepSearchQA)."""
    out = {}
    for d in sorted((trial / "grading").glob("*")):
        rows = [json.loads(p.read_text()) for p in sorted(d.glob("r*.json"))]
        if not rows:
            continue
        res = [r["result"] for r in rows]
        g = {"repeats": len(rows), "cost_usd": round(sum(r["usage"]["cost_usd"] for r in rows), 4)}
        if rows[0]["dataset"] == "swe-atlas-qna":
            g["pass_rate"] = sum(bool(x.get("pass")) for x in res) / len(res)
            g["unscored"] = sum(x.get("num_unscored") or 0 for x in res)
        else:
            g["f1_mean"] = round(sum(x.get("f1_score") or 0 for x in res) / len(res), 4)
            g["fully_correct_rate"] = sum(x.get("fully_correct") or 0 for x in res) / len(res)
            g["invalid"] = sum(1 for x in res if not x.get("grader_valid"))
        out[d.name] = g
    return out or None


# SymPy's runner prints one "test_name ok|F|E" line per test without the file, and SWE-bench's parser
# (parse_log_sympy, swebench 4.0.x and main) keys statuses by that bare name, so a later file's test with the same
# name overwrites an earlier failure. The failure summary keeps the file ("___ path.py:test_name ___").
SYMPY_STATUS_RE = re.compile(r"^(test_\S+)\s+(ok|F|E)(?:\s+\[(?:OK|FAIL)\])?$")
SYMPY_FAILURE_RE = re.compile(r"^_+ \S+\.py:(test_\S+) _+$")


def swebench_hidden_failures(trial):
    """FAIL_TO_PASS and PASS_TO_PASS tests that SWE-bench's report counts as passed although the test log shows
    a test of that name failing. A trial with any of them is not resolved here (resolved_official keeps the
    report's verdict)."""
    report, log = trial / "verifier" / "report.json", trial / "verifier" / "test-stdout.txt"
    if not report.exists() or not log.exists():
        return []
    status = (next(iter(json.loads(report.read_text()).values()), {}) or {}).get("tests_status") or {}
    passed = {t for kind in ("FAIL_TO_PASS", "PASS_TO_PASS") for t in (status.get(kind) or {}).get("success", [])}
    failing = set()
    for line in log.read_text(errors="replace").splitlines():
        line = line.strip()
        m = SYMPY_STATUS_RE.match(line)
        if m and m.group(2) != "ok":
            failing.add(m.group(1))
        m = SYMPY_FAILURE_RE.match(line)
        if m:
            failing.add(m.group(1))
    return sorted(passed & failing)


def cheat_hits(actions, dataset=None):
    hits = []
    for who, text in actions:
        for name, rx in CHEAT_RULES:
            m = rx.search(text)
            # A brief that forwards the rule ("Do not look up DeepSearchQA ...") is not a lookup.
            if m and name == "dataset" and re.search(r"\b(do not|don't|never|avoid|no)\b[^.\n]{0,80}$", text[:m.start()], re.I):
                m = None
            if m:
                hits.append({"rule": name, "by": who, "match": m.group(0), "action": text[:200]})
        # Web research is the task itself in deepsearchqa; elsewhere web use is listed for review.
        if dataset != "deepsearchqa" and re.match(r"(web_search|web_fetch|search_web|read_url_content|browser_)", text):
            hits.append({"rule": "web", "by": who, "match": text.split(" ", 1)[0], "action": text[:200]})
    return hits or None


def agy_staff_provenance(trial):
    """(version, commit) of the agy-staff build the trial ran, from agent/provenance.json; trials from before
    that file existed all ran 0.7.3 (f00d149)."""
    f = trial / "agent" / "provenance.json"
    d = json.loads(f.read_text()) if f.is_file() else {}
    return d.get("agy_staff_version") or "0.7.3", d.get("agy_staff_commit") or "f00d149"


def summarize(job, trial):
    if (trial / "agent" / "claude-code.txt").is_file():
        return summarize_claude(job, trial)
    res = json.loads((trial / "result.json").read_text())
    full_cfg = json.loads((trial / "config.json").read_text())
    cfg = full_cfg.get("agent") or {}
    dataset = Path((full_cfg.get("task") or {}).get("path") or "swebench-verified/x").parent.name
    kw = cfg.get("kwargs") or {}
    stem = lambda p: Path(p).stem if p else None
    setup = stem(kw.get("config")) or stem(kw.get("prompt_template_path"))
    m = JOB_RE.search(job.name)
    exc = (res.get("exception_info") or {}).get("exception_type")
    reward = ((res.get("verifier_result") or {}).get("rewards") or {}).get("reward")
    run = res.get("agent_execution") or {}

    rollouts = [read_rollout(p) for p in sorted((trial / "agent").glob("sessions/**/rollout-*.jsonl"))]
    host = [r for r in rollouts if r["role"] == "host"]
    workers = [r for r in rollouts if r["role"] == "worker" and r["responses"]]
    h_acts, h_edits, h_errors, codex_txt, h_ok_cmds = host_events(trial)
    host_tokens = codex_tokens([])
    for r in host:
        host_tokens = add(host_tokens, r["tokens"])
    spawns, actions, worker_errors = [], [("host", a) for a in h_acts], []
    for r in host:
        _, _, s, errs = rollout_actions(r)
        spawns += s
        worker_errors += errs  # "Agent errored: ..." messages a native worker sent back to the host
        if not h_acts:  # codex.txt missing: fall back to the host rollout
            actions += [("host", a) for a in rollout_actions(r)[0]]

    worker_tokens = {"input": 0, "cache_creation": 0, "cache_read": 0, "output": 0, "thinking": 0}
    worker_edits, delegations, worker_source = 0, [], None
    for r in workers:
        acts, edits, _, errs = rollout_actions(r)
        actions += [(f"worker {r['agent_path']}", a) for a in acts]
        worker_edits += edits
        worker_errors += errs
        worker_tokens = add(worker_tokens, {**r["tokens"], "thinking": 0})
        delegations.append({"kind": "native", "agent_path": r["agent_path"], "models": r["models"],
                            "thread_id": r["thread_id"]})
        worker_source = "worker rollouts"
    native_errors = list(worker_errors)  # native workers' "Agent errored: ..." and rollout errors
    jobs = agy_jobs(trial)
    if jobs or setup == "agy-staff":
        acts, edits, tokens, worker_source = agy_worker(trial, jobs)
        actions += [("agy", a) for a in acts]
        worker_edits += edits
        worker_tokens = add(worker_tokens, tokens)
        for j in jobs:
            worker_errors += j["errors"]
            delegations.append({"kind": "agy-staff", "persona": j["mode"], "model": j["model"],
                                "job_id": j["id"], "status": j["status"]})
        if not jobs:
            delegations += dispatches_from_host_log(trial)

    host_cmds = " \n".join(a for who, a in actions if who == "host")
    if setup == "solo":
        adhered = not spawns and not workers and not jobs and not re.search(r"\bagy\b|agy-companion", host_cmds)
    elif setup in WORKER_MODEL:
        adhered = bool(workers) and all(r["models"] == [WORKER_MODEL[setup]] for r in workers)
    elif setup == "agy-staff":
        # The SWE-bench template names the implementer; the other templates leave the persona to $agy:lead.
        agy = [d for d in delegations if d["kind"] == "agy-staff"]
        adhered = any(d["persona"] in ("implement", "implementer") for d in agy) \
            if dataset == "swebench-verified" else bool(agy)
    else:
        adhered = None

    rate = next((r["rate_limits"] for r in host if r["rate_limits"]), None) or {}
    used = (rate.get("primary") or {}).get("used_percent")
    infra = []
    # used_percent reaching 100 alone is not a failure: xarray-2905 solo r1 read 100% and still finished.
    if any(LIMIT_RE.search(e) for e in h_errors):
        infra.append("usage_limited")
    # An agy job that hit a 503/429 but retried and finished is not an infra failure; only a job that
    # ended without "done", or a native worker that errored back to the host, is.
    agy_down = any(WORKER_DOWN_RE.search(e) for j in jobs if j["status"] != "done" for e in j["errors"])
    if agy_down or any(WORKER_DOWN_RE.search(e) for e in native_errors):
        infra.append("worker_unavailable")
    transient = sum(1 for j in jobs if j["status"] == "done" for e in j["errors"] if WORKER_DOWN_RE.search(e))
    if TOOL_FAILURE_RE.search(codex_txt) or (ROUTER_ERROR_RE.search(codex_txt) and h_acts and not h_ok_cmds):
        infra.append("tool_failure")

    if setup == "solo":
        author = "host" if h_edits else None
    else:
        author = {(True, True): "both", (True, False): "host", (False, True): "worker"}.get(
            (bool(h_edits), bool(worker_edits)))
    same_sub = add(host_tokens, worker_tokens) if setup in WORKER_MODEL else host_tokens
    # Costs at API list prices. host_cost_usd is the headline (the scarce subscription); worker_cost_usd is
    # the delegate's: native workers bill the same Codex subscription, agy bills its own Google account.
    host_cost = sum(r["cost_usd"] for r in host)
    if jobs or setup == "agy-staff":
        # agy's input excludes cache reads and its output already includes thinking (checked against the
        # Gemini API's usageMetadata). Auxiliary flash-lite calls are not visible in subscription mode.
        worker_cost = usd("gemini-3.8-flash", worker_tokens["input"], worker_tokens["cache_read"], worker_tokens["output"])
    else:
        worker_cost = sum(r["cost_usd"] for r in workers)

    grades = grading(trial)
    # Offline-graded datasets: resolved when every judge passes it in the majority of its repeats
    # (QnA: all must-have rubrics; DeepSearchQA: fully correct). reward is then the mean over judges
    # of the pass rate (QnA) or the mean F1 (DeepSearchQA).
    if dataset in ("swe-atlas-qna", "deepsearchqa"):
        key = "pass_rate" if dataset == "swe-atlas-qna" else "fully_correct_rate"
        resolved = bool(grades) and all(g[key] >= 0.5 for g in grades.values())
        reward = round(sum(g["pass_rate" if dataset == "swe-atlas-qna" else "f1_mean"] for g in grades.values())
                       / len(grades), 4) if grades else None
        resolved_official, hidden_failures = None, []
    else:
        # SWE-bench: the verifier's verdict, unless the log shows a test it counted as passed failing.
        resolved_official, hidden_failures = reward == 1.0, swebench_hidden_failures(trial)
        resolved = resolved_official and not hidden_failures
        if hidden_failures:
            reward = 0.0
    return {
        "agy_staff_version": "%s (%s)" % agy_staff_provenance(trial),
        "host": "codex", "host_model": "+".join(m for r in host for m in r["models"]) or None,
        "host_effort": "+".join(e for r in host for e in r["efforts"]) or None,
        "unpriced_models": sorted({m for r in rollouts for m in r["unpriced_models"]}),
        "dataset": dataset, "setup": setup, "instance_id": res.get("task_name"),
        "rep": int(m.group(1)) if m else None, "job": job.name, "trial": trial.name,
        "resolved": resolved, "reward": reward, "resolved_official": resolved_official,
        "hidden_test_failures": hidden_failures, "adhered": adhered,
        "usage_limited": "usage_limited" in infra, "infra_flags": infra,
        "timed_out": exc == "AgentTimeoutError", "exception": exc,
        "grading": grades, "answer_key_exposure": answer_key_exposure(trial, codex_txt),
        "infra_rerun": bool(m and m.group(2)), "cheat_flag": cheat_hits(actions, dataset),
        "final_patch_author": author, "host_edits": h_edits, "worker_edits": worker_edits,
        "wall_clock_s": secs(run.get("started_at"), run.get("finished_at")),
        "host_turns": sum(r["responses"] for r in host),
        "host_tokens": host_tokens,
        "worker_tokens": worker_tokens, "worker_tokens_source": worker_source,
        "host_cost_usd": round(host_cost, 4),
        "worker_cost_usd": round(worker_cost, 4),
        "scarce_cost_usd": round(host_cost + (worker_cost if setup in WORKER_MODEL else 0), 4),
        "scarce_quota_tokens": total(same_sub),
        "quota_used_percent": used,
        "delegations": delegations, "spawn_agent_calls": len(spawns),
        "worker_errors": worker_errors[:10], "worker_transient_errors": transient,
        "host_errors": h_errors[:10],
    }


# --- Claude Code trials ------------------------------------------------------------------------------
# Claude Code's own per-model costUSD (result.modelUsage) is used as the list-price cost: on 2026-10-15 it
# matched these list prices exactly for all three models, plus $10 per 1,000 WebSearch requests (the main
# agent writes 1-hour cache entries, subagents 5-minute ones). Only token costs count, for every host and
# worker, so that per-request fee is taken back out (CLAUDE_WEB_SEARCH_FEE_USD); the tokens of the model call
# behind each WebSearch stay in. The table below prices what no result event covers: a run killed before its
# first one, or the turn a timeout cuts off. USD per 1M tokens:
#   (input, cache read, 5-minute cache write, 1-hour cache write, output; output includes thinking)
#   https://platform.claude.com/docs/en/models/opus-5-5/overview (and sonnet-5-5, haiku-5-5), checked 2026-10-15
CLAUDE_PRICE_USD = {
    "claude-opus-5-5": (4.00, 0.20, 5.00, 8.00, 20.00),
    "claude-sonnet-5-5": (2.00, 0.10, 2.50, 4.00, 10.00),  # $0.10 cache reads per the docs (the launch post said $0.20); costUSD agrees
    "claude-haiku-5-5": (0.10, 0.01, 0.125, 0.20, 0.50),
}
CLAUDE_WEB_SEARCH_FEE_USD = 10.00 / 1000  # per WebSearch request, inside costUSD; not a token cost
CLAUDE_EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
CLAUDE_SPAWN_TOOLS = {"Agent", "Task"}


def claude_action(block):
    """(action string, is_edit) for one tool_use block, in the same shape as the Codex actions."""
    name, inp = block.get("name"), block.get("input") or {}
    if name == "Bash":
        cmd = inp.get("command", "")
        return cmd, bool(SHELL_EDIT_RE.search(cmd))
    if name in CLAUDE_EDIT_TOOLS:
        return f"{name} {inp.get('file_path') or inp.get('notebook_path', '')}", True
    if name == "WebSearch":
        return f"web_search {inp.get('query', '')}", False
    if name == "WebFetch":
        return f"web_fetch {inp.get('url', '')} {str(inp.get('prompt', ''))[:200]}", False
    if name == "Skill":
        return f"skill {inp.get('skill', '')} {inp.get('args') or ''}".strip(), False
    return f"{name} {json.dumps(inp)[:500]}", False


def claude_stream(trial):
    """Actions, spawns, tool output, errors, quota and per-model usage from agent/claude-code.txt
    (`claude --print --output-format stream-json --verbose`). Events that carry a parent_tool_use_id come
    from a subagent; a message streams as several events, so tool_use blocks are deduplicated by id."""
    ev = jsonl(trial / "agent" / "claude-code.txt")
    init = next((e for e in ev if e.get("type") == "system" and e.get("subtype") == "init"), {})
    result = next((e for e in reversed(ev) if e.get("type") == "result"), {})
    acts = {"host": [], "worker": []}
    edits = {"host": 0, "worker": 0}
    spawns, tool_out, errors, host_msgs, seen = [], [], [], set(), set()
    # Each turn of a run ends with a result event whose modelUsage covers the run so far. A run stopped in the
    # middle of a turn (the agent timeout) leaves that turn's messages out of the last result.
    streamed, counted = set(), set()
    for e in ev:
        kind, who = e.get("type"), ("worker" if e.get("parent_tool_use_id") else "host")
        if kind == "result":
            counted = set(streamed)
        if kind == "assistant":
            msg = e.get("message") or {}
            streamed.add(msg.get("id"))
            if who == "host":
                host_msgs.add(msg.get("id"))
            for b in msg.get("content") or []:
                if b.get("type") != "tool_use" or b.get("id") in seen:
                    continue
                seen.add(b.get("id"))
                if b.get("name") in CLAUDE_SPAWN_TOOLS:
                    inp = b.get("input") or {}
                    spawns.append({"by": who, **{k: inp.get(k) for k in ("subagent_type", "model", "description")}})
                a, is_edit = claude_action(b)
                acts[who].append(a)
                edits[who] += is_edit
        elif kind == "user":
            for b in (e.get("message") or {}).get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    c = b.get("content")
                    tool_out.append(c if isinstance(c, str) else
                                    " ".join(x.get("text", "") for x in c or [] if isinstance(x, dict)))
        elif kind == "system" and ("error" in str(e.get("subtype")) or "retry" in str(e.get("subtype"))):
            errors.append(json.dumps(e)[:300])
    if result and (result.get("is_error") or result.get("subtype") != "success"):
        errors.append(f"result {result.get('subtype')}: {str(result.get('result'))[:200]}")
    rate = next((e["rate_limit_info"] for e in reversed(ev) if e.get("type") == "rate_limit_event"), None)
    return {"init": init, "result": result, "acts": acts, "edits": edits, "spawns": spawns,
            "tool_out": tool_out, "errors": errors, "host_turns": len(host_msgs - {None}), "rate": rate,
            "counted_ids": counted - {None}}


def claude_sessions(trial):
    """Session transcripts: [(is_subagent, path)]. Subagents live under <session>/subagents/."""
    return [("subagents" in p.parts, p) for p in sorted((trial / "agent").glob("sessions/projects/**/*.jsonl"))]


def claude_transcript_usage(trial, skip=None):
    """Fallback per-model usage from the session transcripts (last entry per message id). Misses the side
    calls that WebSearch and WebFetch make, so it undercounts runs that searched the web. With skip, only the
    main session counts, less the message ids in skip: subagent transcripts use ids the stream does not."""
    usage = {}
    for is_sub, p in claude_sessions(trial):
        if skip is not None and is_sub:
            continue
        last = {}
        for e in jsonl(p):
            mid = (e.get("message") or {}).get("id")
            if e.get("type") == "assistant" and mid and mid not in (skip or ()):
                last[mid] = e["message"]
        for m in last.values():
            u, model = m.get("usage") or {}, m.get("model")
            cc = u.get("cache_creation") or {}
            row = usage.setdefault(model, {"inputTokens": 0, "outputTokens": 0, "cacheReadInputTokens": 0,
                                           "cacheCreationInputTokens": 0, "cache5m": 0, "cache1h": 0})
            row["inputTokens"] += u.get("input_tokens") or 0
            row["outputTokens"] += u.get("output_tokens") or 0
            row["cacheReadInputTokens"] += u.get("cache_read_input_tokens") or 0
            row["cacheCreationInputTokens"] += u.get("cache_creation_input_tokens") or 0
            row["cache5m"] += cc.get("ephemeral_5m_input_tokens") or 0
            row["cache1h"] += cc.get("ephemeral_1h_input_tokens") or 0
    for model, row in usage.items():
        p = CLAUDE_PRICE_USD.get(model)
        row["costUSD"] = None if p is None else (
            row["inputTokens"] * p[0] + row["cacheReadInputTokens"] * p[1] + row["cache5m"] * p[2]
            + row["cache1h"] * p[3] + row["outputTokens"] * p[4]) / 1e6
    return usage


def claude_tokens(u):
    return {"input": u.get("inputTokens", 0), "cache_creation": u.get("cacheCreationInputTokens", 0),
            "cache_read": u.get("cacheReadInputTokens", 0), "output": u.get("outputTokens", 0),
            "reasoning": u.get("thinkingTokens", 0)}


def summarize_claude(job, trial):
    """One summary record for a Claude Code trial, with the same fields as the Codex records plus model_usage.

    Sources: agent/claude-code.txt (actions; result.modelUsage, the per-model tokens and costUSD of the whole
    run, subagents and WebSearch/WebFetch side calls included; rate_limit_event, the subscription windows),
    agent/sessions/projects/** (transcripts: subagent models, and usage when the result is missing), and the
    same agy-staff artifacts as the Codex trials. Host vs worker: a native worker is the model every subagent
    is forced onto (CLAUDE_WORKER_MODEL); everything else Claude Code used, including the small model behind
    WebFetch, counts as host. agy is the worker in agy-staff."""
    res = json.loads((trial / "result.json").read_text())
    full_cfg = json.loads((trial / "config.json").read_text())
    kw = (full_cfg.get("agent") or {}).get("kwargs") or {}
    dataset = Path((full_cfg.get("task") or {}).get("path") or "swebench-verified/x").parent.name
    setup = Path(kw["prompt_template_path"]).stem if kw.get("prompt_template_path") else None
    m = JOB_RE.search(job.name)
    exc = (res.get("exception_info") or {}).get("exception_type")
    reward = ((res.get("verifier_result") or {}).get("rewards") or {}).get("reward")
    run = res.get("agent_execution") or {}
    s = claude_stream(trial)

    model_usage = {k: dict(v) for k, v in (s["result"].get("modelUsage") or {}).items()}
    usage_source = "claude modelUsage"
    if not model_usage:
        model_usage, usage_source = claude_transcript_usage(trial), "session transcripts (no WebSearch/WebFetch side calls)"
    else:
        # A turn cut off by the timeout has no result event: add its main-session messages from the transcripts.
        tail = claude_transcript_usage(trial, skip=s["counted_ids"])
        if any(u.get("costUSD") for u in tail.values()):
            for model, u in tail.items():
                row = model_usage.setdefault(model, {})
                for k in ("inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens", "costUSD"):
                    row[k] = (row.get(k) or 0) + (u.get(k) or 0)
            usage_source += " + session transcripts after the last result (no WebSearch/WebFetch side calls)"
    worker_model = CLAUDE_WORKER_MODEL.get(setup)
    zero = {"input": 0, "cache_creation": 0, "cache_read": 0, "output": 0, "reasoning": 0}
    host_tokens, native_tokens, host_cost, native_cost, unpriced = dict(zero), dict(zero), 0.0, 0.0, set()
    for model, u in model_usage.items():
        if u.get("costUSD") is None:
            unpriced.add(model)
        token_cost = (u.get("costUSD") or 0) - (u.get("webSearchRequests") or 0) * CLAUDE_WEB_SEARCH_FEE_USD
        is_worker = setup in CLAUDE_WORKER_MODEL and model == worker_model
        if is_worker:
            native_tokens, native_cost = add(native_tokens, claude_tokens(u)), native_cost + token_cost
        else:
            host_tokens, host_cost = add(host_tokens, claude_tokens(u)), host_cost + token_cost
    sub_models = sorted({(e.get("message") or {}).get("model") for is_sub, p in claude_sessions(trial) if is_sub
                         for e in jsonl(p) if e.get("type") == "assistant"} - {None})

    actions = [("host", a) for a in s["acts"]["host"]] + [("worker native", a) for a in s["acts"]["worker"]]
    worker_tokens = {"input": 0, "cache_creation": 0, "cache_read": 0, "output": 0, "thinking": 0}
    worker_edits, delegations, worker_source, worker_errors = s["edits"]["worker"], [], None, []
    if setup in CLAUDE_WORKER_MODEL:
        worker_tokens = add(worker_tokens, {**native_tokens, "thinking": 0})
        worker_source = usage_source
        delegations += [{"kind": "native", "agent_path": sp.get("subagent_type"), "description": sp.get("description"),
                         "models": sub_models} for sp in s["spawns"]]
    jobs = agy_jobs(trial)
    if jobs or setup == "agy-staff":
        acts, edits, tokens, worker_source = agy_worker(trial, jobs)
        actions += [("agy", a) for a in acts]
        worker_edits += edits
        worker_tokens = add(worker_tokens, tokens)
        for j in jobs:
            worker_errors += j["errors"]
            delegations.append({"kind": "agy-staff", "persona": j["mode"], "model": j["model"],
                                "job_id": j["id"], "status": j["status"]})
        if not jobs:
            delegations += dispatches_from_host_log(trial, s["tool_out"])

    host_cmds = " \n".join(a for who, a in actions if who == "host")
    agy_used = bool(jobs) or bool(re.search(r"\bagy\b|agy-companion|skill agy:", host_cmds))
    if setup == "solo":
        adhered = not s["spawns"] and not agy_used
    elif setup in CLAUDE_WORKER_MODEL:
        adhered = bool(s["spawns"]) and native_tokens["output"] > 0 and sub_models in ([], [worker_model])
    elif setup == "agy-staff":
        agy = [d for d in delegations if d["kind"] == "agy-staff"]
        adhered = any(d["persona"] in ("implement", "implementer") for d in agy) \
            if dataset == "swebench-verified" else bool(agy)
    else:
        adhered = None

    windows = (s["rate"] or {}).get("unifiedWindows") or {}
    weekly = (windows.get("seven_day") or {}).get("utilization")
    infra = []
    if any(LIMIT_RE.search(e) for e in s["errors"]) or (s["rate"] or {}).get("status") not in (None, "allowed"):
        infra.append("usage_limited")
    agy_down = any(WORKER_DOWN_RE.search(e) for j in jobs if j["status"] != "done" for e in j["errors"])
    if agy_down:
        infra.append("worker_unavailable")
    transient = sum(1 for j in jobs if j["status"] == "done" for e in j["errors"] if WORKER_DOWN_RE.search(e))
    # Claude Code went silent and never came back (the x64 build under Rosetta deadlocked in futex_wait in ~1 of
    # 5 trials, which is why bake-task.sh runs the arm64 build on Apple Silicon): stopped by the
    # agent's watchdog (agent/stalled.txt), or timed out after more than 15 minutes without a stream event
    # while no background shell command was pending. Only a backgrounded Bash task (e.g. an agy `wait`, a
    # long test run) is a legitimate silence; a running subagent or foreground command emits events.
    stream = jsonl(trial / "agent" / "claude-code.txt")
    last_event = max((ts(e["timestamp"]) for e in stream if e.get("timestamp")), default=None)
    silent_tail = secs(last_event.isoformat(), run.get("finished_at")) if last_event and run.get("finished_at") else None
    pending = set()
    for e in stream:
        if e.get("type") == "system" and e.get("subtype") == "task_started" and e.get("is_backgrounded") \
                and e.get("task_type") == "local_bash":
            pending.add(e.get("task_id"))
        elif e.get("type") == "system" and e.get("subtype") == "task_notification":
            pending.discard(e.get("task_id"))
    # A pending agy `wait` is no excuse once every agy job has finished: the wait returns then, and the host
    # would have resumed.
    waiting_on_agy_only = bool(jobs) and all(j["status"] == "done" for j in jobs)
    if (trial / "agent" / "stalled.txt").is_file() or (
            exc == "AgentTimeoutError" and (silent_tail or 0) > 900 and (not pending or waiting_on_agy_only)):
        infra.append("agent_stalled")

    if setup == "solo":
        author = "host" if s["edits"]["host"] else None
    else:
        author = {(True, True): "both", (True, False): "host", (False, True): "worker"}.get(
            (bool(s["edits"]["host"]), bool(worker_edits)))
    if setup == "agy-staff" or jobs:
        worker_cost = usd("gemini-3.8-flash", worker_tokens["input"], worker_tokens["cache_read"], worker_tokens["output"])
    else:
        worker_cost = native_cost
    same_sub = add(host_tokens, native_tokens) if setup in CLAUDE_WORKER_MODEL else host_tokens

    grades = grading(trial)
    if dataset in ("swe-atlas-qna", "deepsearchqa"):
        key = "pass_rate" if dataset == "swe-atlas-qna" else "fully_correct_rate"
        resolved = bool(grades) and all(g[key] >= 0.5 for g in grades.values())
        reward = round(sum(g["pass_rate" if dataset == "swe-atlas-qna" else "f1_mean"] for g in grades.values())
                       / len(grades), 4) if grades else None
        resolved_official, hidden_failures = None, []
    else:
        # SWE-bench: the verifier's verdict, unless the log shows a test it counted as passed failing.
        resolved_official, hidden_failures = reward == 1.0, swebench_hidden_failures(trial)
        resolved = resolved_official and not hidden_failures
        if hidden_failures:
            reward = 0.0
    host_text = (trial / "agent" / "claude-code.txt").read_text(errors="replace")
    return {
        "agy_staff_version": "%s (%s)" % agy_staff_provenance(trial),
        "host": "claude-code", "host_model": s["init"].get("model"), "host_effort": kw.get("reasoning_effort"),
        "unpriced_models": sorted(str(x) for x in unpriced),
        "dataset": dataset, "setup": setup, "instance_id": res.get("task_name"),
        "rep": int(m.group(1)) if m else None, "job": job.name, "trial": trial.name,
        "resolved": resolved, "reward": reward, "resolved_official": resolved_official,
        "hidden_test_failures": hidden_failures, "adhered": adhered,
        "usage_limited": "usage_limited" in infra, "infra_flags": infra,
        "timed_out": exc == "AgentTimeoutError", "exception": exc,
        "grading": grades, "answer_key_exposure": answer_key_exposure(trial, host_text),
        "infra_rerun": bool(m and m.group(2)), "cheat_flag": cheat_hits(actions, dataset),
        "final_patch_author": author, "host_edits": s["edits"]["host"], "worker_edits": worker_edits,
        "wall_clock_s": secs(run.get("started_at"), run.get("finished_at")),
        "host_turns": s["host_turns"],
        "host_tokens": host_tokens,
        "worker_tokens": worker_tokens, "worker_tokens_source": worker_source,
        "host_cost_usd": round(host_cost, 4),
        "worker_cost_usd": round(worker_cost, 4),
        "scarce_cost_usd": round(host_cost + (native_cost if setup in CLAUDE_WORKER_MODEL else 0), 4),
        "scarce_quota_tokens": total(same_sub),
        "quota_used_percent": round(weekly * 100, 1) if weekly is not None else None,
        "quota_windows": windows or None,
        "model_usage": model_usage, "model_usage_source": usage_source,
        "claude_code_version": s["init"].get("claude_code_version"), "silent_tail_s": silent_tail,
        "claude_binary": ((trial / "agent" / "claude-binary.txt").read_text().strip()
                          if (trial / "agent" / "claude-binary.txt").is_file() else "linux-x64 (Rosetta)"),
        "auth_source": s["init"].get("apiKeySource"),
        "delegations": delegations, "spawn_agent_calls": len(s["spawns"]),
        "worker_errors": worker_errors[:10], "worker_transient_errors": transient,
        "host_errors": s["errors"][:10],
    }


def trials(globs):
    for g in globs:
        for job in sorted(JOBS.glob(g)):
            for t in sorted(job.iterdir()):
                if (t / "result.json").is_file() and (t / "config.json").is_file():
                    agent = json.loads((t / "result.json").read_text()).get("agent_info") or {}
                    if agent.get("name") not in ("oracle", "nop"):
                        yield job, t


def main(argv):
    global JOBS
    ap = argparse.ArgumentParser(
        description="One summary record per trial, from Harbor job directories: solved, costs and tokens of host and\n"
                    "worker, time, delegations, and flags for review (infra_flags, cheat_flag, adhered,\n"
                    "answer_key_exposure). Run grade.py first for QnA and DeepSearchQA jobs.",
        epilog="""examples:
  analyze.py                                   every formal job -> bench/results/trials.jsonl (not committed)
  analyze.py --out - 'claude-*-c55x-r1*'       some jobs, to stdout

for agents:
  - It only reads job directories and writes --out: no model call, no credential. The records hold the
    user's quota levels, so trials.jsonl stays out of the repository; publish with viz-data.py.""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    benchdata.add_argument(ap)
    ap.add_argument("--out", default=str(OUT), help="output JSONL, or - for stdout (default: bench/results/trials.jsonl)")
    ap.add_argument("jobs", nargs="*", help="job-name globs (default: every formal run, *-r<n> and *-r<n>-rerun<k>)")
    args = ap.parse_args(argv)
    JOBS = benchdata.resolve(args.data) / "jobs"
    out = None if args.out == "-" else Path(args.out)
    argv = args.jobs
    pairs = trials(argv or ["codex-*-r*", "claude-*-r*"])
    recs = [summarize(j, t) for j, t in pairs if argv or JOB_RE.search(j.name)]
    lines = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs)
    if out is None:
        sys.stdout.write(lines)
    else:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(lines)
    for r in recs:
        print(f"{r['setup']:<17} {r['instance_id']:<32} rep={r['rep']} resolved={r['resolved']!s:<5} "
              f"adhered={r['adhered']!s:<5} author={r['final_patch_author']} host=${r['host_cost_usd']:.2f} worker=${r['worker_cost_usd']:.2f} "
              f"wall={r['wall_clock_s']}s quota={r['quota_used_percent']} infra={r['infra_flags']} "
              f"cheat={len(r['cheat_flag'] or [])}", file=sys.stderr)
    if out is not None:
        print(f"wrote {len(recs)} records to {out}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
