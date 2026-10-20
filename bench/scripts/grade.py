#!/usr/bin/env python3
"""Grade answers offline with the datasets' own grading code and two judge models.

Trials of swe-atlas-qna and deepsearchqa run without Harbor's verifier (run-*.sh); this script
grades the saved answer files on the host, so the judge keys never enter a container. It imports
the task's official grader (tests/evaluate_answer.py or tests/verifier.py) and changes only the
judge model and where files are read and written:
  swe-atlas-qna  official prompts, rubrics and pass rule (every scored must-have rubric is 1);
                 one judge call per rubric item, max_tokens as in the official grader unless
                 --max-tokens is given
  deepsearchqa   official rating prompt and metrics (F1 over the expected answer items)

  usage: grade.py [--data DIR] jobs <job-name>...             grade the answer of each job's trial
         grade.py [--data DIR] reference <dataset>/<task>...  grade the dataset's reference answer
         grade.py [--data DIR] nop <dataset>/<task>...        grade a non-answer (must fail, like Harbor's nop)
  options: --judges gemini-3.8-flash,deepseek-v4-pro  --repeats 3  --max-tokens N  --force
  keys:    GEMINI_API_KEY and DEEPSEEK_API_KEY (DEEPSEEK_BASE_URL optional), on the host only

Results: <trial>/grading/<judge>/r<k>.json for jobs, <data>/grading-reference/<dataset>/<task>/<judge>/
r<k>.json for reference answers (grading-nop/ for the non-answer). Each file holds the grader's result plus the judge
calls' token usage and their cost at list prices. Existing results are kept unless --force.
"""

import argparse
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
from pathlib import Path

from openai import OpenAI

import benchdata

DATA = None  # the bench data directory, set by main()
# USD per 1M tokens: input, cached input, output (output includes thinking). Checked 2026-10-12:
# Gemini at the paid-tier list price; DeepSeek at its peak-hour price (off-peak is half).
JUDGES = {
    "gemini-3.8-flash": {"key": "GEMINI_API_KEY", "price": (0.75, 0.075, 3.75),
                         "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/"},
    "deepseek-v4-pro": {"key": "DEEPSEEK_API_KEY", "price": (1.32, 0.044, 3.96),
                        "base_url": os.environ.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com"},
}


NOP_ANSWER = "I investigated this question but could not determine the answer."


class Usage:
    """Wraps an OpenAI client and sums the token usage of its chat completions."""

    def __init__(self, judge):
        self.judge, self.calls, self.input, self.cached, self.output, self.reasoning = judge, 0, 0, 0, 0, 0

    def client(self, **_ignored):
        cfg = JUDGES[self.judge]
        real = OpenAI(api_key=os.environ[cfg["key"]], base_url=cfg["base_url"], max_retries=4, timeout=600)
        usage = self

        class Completions:
            def create(self, **kw):
                kw["model"] = usage.judge
                resp = real.chat.completions.create(**kw)
                usage.add(resp.usage)
                return resp

        class Chat:
            completions = Completions()

        class Client:
            chat = Chat()

        return Client()

    def add(self, u):
        if u is None:
            return
        self.calls += 1
        self.input += u.prompt_tokens or 0
        self.output += u.completion_tokens or 0
        self.cached += getattr(u.prompt_tokens_details, "cached_tokens", 0) or 0
        self.reasoning += getattr(u.completion_tokens_details, "reasoning_tokens", 0) or 0

    def summary(self):
        p_in, p_cached, p_out = JUDGES[self.judge]["price"]
        cost = ((self.input - self.cached) * p_in + self.cached * p_cached + self.output * p_out) / 1e6
        return {"judge": self.judge, "calls": self.calls, "input_tokens": self.input,
                "cached_input_tokens": self.cached, "output_tokens": self.output,
                "reasoning_tokens": self.reasoning, "cost_usd": round(cost, 5)}


def load_module(path):
    spec = importlib.util.spec_from_file_location(f"grader_{abs(hash(str(path)))}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def grade_qna(task_dir, answer_text, judge, max_tokens):
    tests = task_dir / "tests"
    mod = load_module(tests / "evaluate_answer.py")
    usage = Usage(judge)
    mod.OpenAI = usage.client
    if max_tokens:
        mod.MAX_TOKENS = max_tokens
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "answer.txt").write_text(answer_text)
        mod.ANSWER_PATH, mod.RUBRICS_PATH = str(tmp / "answer.txt"), str(tests / "rubrics.json")
        mod.PROMPT_PATH, mod.SYSTEM_PROMPT_PATH = str(tests / "prompt.txt"), str(tests / "system_prompt.txt")
        mod.USER_PROMPT_TEMPLATE_PATH = str(tests / "user_prompt_template.txt")
        mod.REWARD_PATH, mod.RESULTS_PATH = str(tmp / "reward.txt"), str(tmp / "results.json")
        env = {"EVAL_API_KEY": "set-by-grade.py", "EVAL_BASE_URL": JUDGES[judge]["base_url"], "EVAL_MODEL": judge}
        old = {k: os.environ.get(k) for k in env}
        os.environ.update(env)
        log = io.StringIO()
        try:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                mod.main()
        finally:
            for k, v in old.items():
                os.environ.pop(k) if v is None else os.environ.__setitem__(k, v)
        result = json.loads((tmp / "results.json").read_text()) if (tmp / "results.json").exists() else {
            "reward": 0, "pass": False, "error": "no results written", }
    result["max_tokens"] = mod.MAX_TOKENS
    result["log"] = log.getvalue()[-4000:]
    return result, usage.summary()


def grade_dsqa(task_dir, answer_text, judge):
    mod = load_module(task_dir / "tests" / "verifier.py")
    usage = Usage(judge)
    client = usage.client()

    def call(prompt):
        last = None
        for attempt in range(5):
            try:
                return client.chat.completions.create(
                    model=judge, messages=[{"role": "user", "content": prompt}]).choices[0].message.content
            except Exception as exc:  # retried like the official call_gemini
                last = exc
                time.sleep(2 ** (attempt + 1))
        raise RuntimeError(f"judge failed after 5 attempts: {last}")

    mod.call_gemini = call
    metadata = json.loads((task_dir / "tests" / "metadata.json").read_text())
    try:
        if not answer_text.strip():
            raise ValueError("Agent answer file is empty.")
        result = mod.evaluate(metadata, answer_text.strip())
    except Exception as exc:  # same fallback as the official main()
        result = {"reward": 0.0, "fully_correct": 0.0, "f1_score": 0.0, "grader_valid": 0.0, "error": str(exc)}
    result.pop("rating_prompt", None)
    return result, usage.summary()


def grade(dataset, task_dir, answer_text, out_dir, judges, repeats, max_tokens, force):
    rows = []
    for judge in judges:
        for k in range(1, repeats + 1):
            out = out_dir / judge / f"r{k}.json"
            if out.exists() and not force:
                rows.append(json.loads(out.read_text()))
                continue
            t0 = time.time()
            if dataset == "swe-atlas-qna":
                result, usage = grade_qna(task_dir, answer_text, judge, max_tokens)
            elif dataset == "deepsearchqa":
                result, usage = grade_dsqa(task_dir, answer_text, judge)
            else:
                raise SystemExit(f"no offline grader for {dataset}")
            row = {"dataset": dataset, "task": task_dir.name, "judge": judge, "repeat": k,
                   "seconds": round(time.time() - t0, 1), "usage": usage, "result": result}
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(row, indent=2, ensure_ascii=False) + "\n")
            rows.append(row)
    return rows


def headline(row):
    r = row["result"]
    if row["dataset"] == "swe-atlas-qna":
        return (f"pass={r.get('pass')} passed={r.get('num_passed')}/{r.get('num_scored')} "
                f"unscored={r.get('num_unscored')}")
    return f"f1={r.get('f1_score')} fully_correct={r.get('fully_correct')} valid={r.get('grader_valid')}"


def trial_answer(job):
    trials = [t for t in (DATA / "jobs" / job).glob("*") if (t / "result.json").is_file()]
    if not trials:
        raise SystemExit(f"no trial in {job}")
    trial = trials[0]
    cfg = json.loads((trial / "config.json").read_text())
    task_dir = Path(cfg["task"]["path"])
    task_dir = task_dir if task_dir.is_absolute() else DATA / task_dir  # the run scripts start Harbor in <data>
    dataset = task_dir.parent.name
    candidates = [trial / "agent" / "answer.txt", trial / "artifacts" / "workspace" / "answer.txt"]
    answer = next((p.read_text() for p in candidates if p.is_file()), "")
    return dataset, task_dir, answer, trial / "grading"


def main():
    global DATA
    ap = argparse.ArgumentParser(
        description="Grade SWE-Atlas QnA and DeepSearchQA answers on the host, with each dataset's own grader and\n"
                    "two judge models (SWE-bench Verified is graded by its tests inside the trial).",
        epilog="""modes:
  jobs <job-name>...            grade the answer each job's trial left
  reference <dataset>/<task>... grade the dataset's own reference answer (a check of the judges)
  nop <dataset>/<task>...       grade a non-answer, which must fail (a check of the judges)
Results go to <trial>/grading/<judge>/r<k>.json (or <data>/grading-<mode>/); existing results are kept
unless --force. analyze.py reads them: a task is solved when every judge passes it in most of its runs.

examples:
  grade.py jobs claude-agy-staff-deepsearchqa-0190-c55x-r1
  ls "$AGY_BENCH_DATA/jobs" | grep -E -- '-(task-|deepsearchqa-).*-c55x-r1(-rerun[0-9]+)?$' | xargs grade.py jobs

for agents:
  - It calls the judge APIs with GEMINI_API_KEY and DEEPSEEK_API_KEY from the environment, on the host only;
    a job costs a few cents. Never print the keys or the environment.""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    benchdata.add_argument(ap)
    ap.add_argument("mode", choices=["jobs", "reference", "nop"], help="what to grade (see below)")
    ap.add_argument("items", nargs="+", help="job names, or <dataset>/<task>")
    ap.add_argument("--judges", default=",".join(JUDGES), help="comma-separated (default: %(default)s)")
    ap.add_argument("--repeats", type=int, default=3, help="runs per judge (default: %(default)s)")
    ap.add_argument("--max-tokens", type=int, default=None, help="judge max_tokens (default: the official grader's)")
    ap.add_argument("--force", action="store_true", help="grade again even where results exist")
    args = ap.parse_args()
    DATA = benchdata.resolve(args.data)
    judges = args.judges.split(",")
    for item in args.items:
        if args.mode == "jobs":
            dataset, task_dir, answer, out_dir = trial_answer(item)
        else:
            dataset, name = item.split("/", 1)
            task_dir = DATA / "datasets" / dataset / name
            if args.mode == "nop":
                answer = NOP_ANSWER
            elif dataset == "swe-atlas-qna":
                answer = (task_dir / "solution" / "answer.txt").read_text()
            else:
                answer = json.loads((task_dir / "tests" / "metadata.json").read_text())["answer"]
            out_dir = DATA / f"grading-{args.mode}" / dataset / name
        rows = grade(dataset, task_dir, answer, out_dir, judges, args.repeats, args.max_tokens, args.force)
        print(f"{item}")
        for row in rows:
            u = row["usage"]
            print(f"  {row['judge']:<17} r{row['repeat']} {headline(row)}  calls={u['calls']} "
                  f"in={u['input_tokens']} out={u['output_tokens']} (reasoning {u['reasoning_tokens']}) "
                  f"${u['cost_usd']:.4f} {row['seconds']}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
