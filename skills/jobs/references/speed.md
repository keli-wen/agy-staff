# Checking agy's speed before large work

agy's speed depends on how busy Google's servers are. When capacity is free it runs fast (hundreds of tokens per second); when many users are on at once, some are slowed (under 50). That is the state of the shared service at that moment, not noise in one call: it can last for a while. A large assignment sent during a slow period takes far longer than expected, and the delay only shows up after the job has started. `speed` measures the current state first.

## The command

```bash
node "<skill-dir>/../../companion/agy-companion.mjs" speed
```

One tool-free call on the `ask` model (`gemini-3.8-flash-low`) that takes about 10 seconds, most of it agy's own start-up, and uses one short generation of quota. It prints one line of facts on stdout and writes no job or conversation state:

```
[agy-staff speed] model=gemini-3.8-flash-low samples=1 tokens_per_second=97 ttft=3.4s startup=6.5s stream=1.4s output_tokens=140 total=11.3s
```

| Field | Meaning |
| --- | --- |
| `tokens_per_second` | Output tokens divided by the time the answer text took to stream. `n/a` when the answer was too short to time. |
| `ttft` | Time from agy's own start-up finishing to the first answer text. This is the model-side wait. |
| `startup` | Time for the agy process to start. A fixed cost on every agy call, unrelated to model speed. |
| `stream`, `output_tokens`, `total` | The raw numbers behind the rate, and the whole call. |

`--model` and `--effort` probe another model. The thresholds below are calibrated for the default, so quote the numbers without applying them to other models. The command runs unsandboxed like every other companion command; it accepts no task text and only `--model`, `--effort` and `--timeout` (default 90s, at most 10m).

## When to run it

- Before `lead` dispatches a large assignment: several jobs, or one expected to run long (about ten minutes or more).
- When the user asks whether agy is fast or slow right now.

Do not run it before a small single task, before every job, or on a timer. It is one sample, takes about ten seconds, and speed can change during a long job.

Start it in the background (as you would a `wait`) before composing the brief, and read its output just before dispatching: the host's own preparation hides most of the ten seconds. If the host cannot run background commands, run it in the foreground.

## How to read it

The companion reports; you judge, using these defaults:

- **Too slow for large work:** `tokens_per_second` below 50, or `ttft` above 15 seconds. The ttft limit is about three times the slowest first-text wait seen in a good period (2.6 to 4.9 seconds).
- **Not measurable:** `tokens_per_second=n/a` alone says nothing about speed; judge by `ttft`, or run once more.
- **Ignore `startup`** when judging model speed. It varied from 5 to 16 seconds without any change in generation speed.

If the command fails, or reports no result within its timeout, treat agy as too slow right now and report the error and any numbers it printed.

## What to do with the result

- **Fast enough:** continue with the plan. Mention the numbers only if the user asked.
- **Too slow:** the service is probably busy right now, and an immediate second probe is likely to show the same state. Tell the user the measured numbers and what they mean for this assignment, then let the user choose: proceed anyway, do the work with the host's own tools, or wait and measure again later. Do not switch silently, and do not loop on repeated probes. Probe again only when the user asks, or after a real wait.

A good measurement does not promise the whole job will stay fast. If the user later asks why a running job is slow, answer from `observe`, not from another probe.
