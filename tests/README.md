# Companion regression tests

Regression tests for the 0.6.1 companion interface: black-box CLI tests for `companion/agy-companion.mjs`, plus focused tests for observation parsing, byte budgets and state locking.

`issue-regressions.test.mjs` covers #8 response-timeout attention and conversation configuration history, #9 workspace attachment across execution/recovery paths, and #10 broad allow plus targeted deny setup rules, preserving existing settings and upgrading deny-only gaps. Timeout tests distinguish complete answers, unrelated errors, absent conversation IDs and the background timeout ceiling; terminal-observation tests cover attention publication races. All use fake AGY and temporary workspaces/settings.
The standard suite uses Node's built-in test runner and assertions, with no test dependencies or model/network calls. Run unsandboxed when the host restricts process inspection/signals: lifecycle tests use `ps` to verify detached descendant cleanup. Packaging tests also use npm and tar. The optional Pi integration suite uses a separately installed Pi CLI, never a model provider; the opt-in real AGY suite below does make model calls.

## Run

```sh
npm test                         # standard offline suite
node --test tests/*.test.mjs      # from the repo root
node --test                       # equivalent: walks the repo for *.test.mjs
```

Pi packaging checks run in the standard suite (`pi-packaging.test.mjs`). They check generated entrypoints and references, version alignment, and an actual npm archive, then run its companion with fake agy. Run `npm run generate:pi` after changing canonical skills; `npm run check:pi` is read-only and fails on drift.

With Pi installed, `npm run test:pi` exercises its real package loader, skill-command expansion, and Bash tool, using disposable settings and fake agy. The suite discovers Pi from PATH, or accepts `AGY_PI_PACKAGE_ROOT`. It never reads credentials or calls a model; offline success does not prove LLM behavior. For manual testing in Pi, use `pi -e /path/to/checkout` (temporary session) or `pi install /path/to/checkout`. After editing canonical skills in `skills/`, re-run `npm run generate:pi` and run `/reload` in Pi.

GitHub CI runs `npm run check:pi` and `npm test` on Ubuntu with Node 24 for pushes and pull requests. The job retains the required status-check name `Generated skills consistency`. Pi integration and real AGY smoke tests remain opt-in; CI does not install Pi or run a Node version matrix.

Note: `node --test tests/` does **not** work on Node >= 22 — positional
arguments are glob patterns there, and a bare directory matches the directory
itself. Node 24.7 verified.

## How it works

CLI behavior is exercised through subprocesses, because the companion calls `main()` on import. Observation and lock tests also import their modules directly. CLI tests build isolated sandboxes (`tests/helpers.mjs`):

- a throwaway git repo under `os.tmpdir()` (so `.agy-staff/` state never lands in
  the real repo), with `.agy-staff/` added to `.git/info/exclude` — since 0.4 the
  companion does this itself on first use (`ensureStateDir`), the sandbox just
  pre-applies it so the companion's own state stays out of implement dirty-context prompts and review/research delta reports. The auto-exclude path itself is pinned in `dx.test.mjs`.
  `sandbox(label, { git: false })` skips the `git init` for the cases that must
  run outside a repository;
- a throwaway `HOME` (so `setup` can never touch the real `~/.gemini`);
- `AGY_BIN` pointed at `tests/fake-agy.mjs`, which records every argv it is
  called with to `$FAKE_AGY_ARGV_FILE` and emits canned JSON results or streaming NDJSON events according to the requested output format. The standard suite never invokes real `agy`. Its behaviour is steered by env
  knobs (`FAKE_AGY_RESPONSE`, `FAKE_AGY_STATUS`, `FAKE_AGY_SLEEP_MS`,
  `FAKE_AGY_EXIT`, and `FAKE_AGY_TOUCH_FILE`, which writes a file mid-"run" to
  simulate agy dirtying the working tree).

Coverage: removed 0.1 flags and their migration messages, deprecated
`--strict`/`--loose` aliases, profile mutual exclusion, per-mode execution style,
and permission-profile wiring asserted on the argv the fake `agy` received —
round 2's equal-permissions default (`research`/`review`/`implement` all send
`--dangerously-skip-permissions` with no flags and no setup, `--restricted` is
the opt-in that removes it, `ask` never gets it). Also: the tiered git guards
(`implement` injects bounded dirty-workspace prompt context, warns and proceeds outside a
repository, defaults to `gemini-3.8-flash-high`, allows continuation over its own dirty result, and reports workspace state with the result; `review`/`research` are never
blocked and instead report a working-tree delta — present when the fake `agy`
touches a file, silent when it does not, scoped to what appeared during the run,
and skipped entirely for `--restricted` runs); the reworded `--restricted`
empty-response triage message (and the unrestricted case that must never suggest
setup); the output split (the `[agy-staff]` telemetry line is asserted on stderr
for foreground runs and in `jobs/<id>.log` for background ones, and asserted
absent from stdout and from `jobs/<id>.result.md`); prompt-based `review`; job
lifecycle (`status`/`result`/`cancel`);
the task-source contract (task text comes from exactly one of `--prompt`,
`--prompt-file`, or `--stdin`; positional task text is an error; task contents
are opaque — flag-like text inside a task never becomes a companion option, and
prompt bytes reach the fake `agy` verbatim; value flags reject missing, empty,
and flag-shaped values; management commands keep their positional ids);
`continue` mode inheritance; `setup`'s dry run and its optional-hardening
framing; and the state-file robustness fixes (`state.test.mjs`).

## State-file races (found by this suite, fixed in the companion)

Two pre-existing 0.1 races were surfaced while writing these tests and fixed as
part of 0.2, since background-first made them the default path:

1. `saveState()` used a non-atomic truncate-then-write, and `loadState()`
   silently treated an unparseable (mid-write) file as "no state" — the next
   save then wiped all job records and conversation ids. Now: atomic
   write-then-rename, and a corrupt `state.json` dies loudly instead of
   resetting.
2. `dispatch()` registered a background job *after* spawning the worker, so an
   instant worker's own read-modify-write could clobber the record. Now: the
   job is registered before the spawn, and the pid is backfilled after.

`state.test.mjs` pins both. The other suites still wait read-only for the
worker's result file and give the fake `agy` a 300 ms latency floor
(`FAKE_AGY_SLEEP_MS`) — since 0.6.0, lifecycle writes use a crash-recoverable lock around read-modify-write, while observers stay read-only. `streaming.test.mjs` also starts three jobs concurrently to verify that registrations, conversations and terminal states survive contention.

## Streaming lifecycle (0.6.0)

`observation.test.mjs` checks UTF-8/parser boundaries, malformed and oversized records, merged and late tool/text updates, serialized byte budgets and explicit truncation. `streaming.test.mjs` checks short soft/hard deadlines, wait interruption, multiple observers, process cleanup, concurrent dispatch, recovery configuration/linkage, warning retention, crash packets and terminal cleanup races. No model calls are made by these tests.

`recovery-regressions.test.mjs` covers durable cancellation reports, crash preservation, process identity and group checks, cancellation across locale/timezone changes, inherited output pipes, transient process-inspection failures, complete responses at hard expiry, the 120m timeout ceiling and AGY argument forwarding, and recovery within the original worktree with the selected job's configuration. `state-lock.test.mjs` verifies that competing stale-lock reapers cannot remove a successor or lose concurrent updates.

The optional real AGY suite requires an authenticated AGY installation and incurs model usage:

```sh
AGY_REAL_SMOKE=1 node tests/real-agy.integration.mjs
```

Run it unsandboxed in the same permission context as AGY. It creates disposable directories, validates real streaming and structured review output, then cancels and hard-stops jobs after their shell tools start. It records observed process IDs, checks for surviving processes and unintended completion markers, and prints the retained evidence directory. It never changes global settings. The shortened hard deadline exercises the worker timer; it does not claim a full-hour endurance test.

`terminal-observation.test.mjs` verifies bounded JSON for done/error/canceled/crashed and legacy jobs, terminal-sidecar races, nested recovery metadata, and observe alongside a pending wait with a large report. Observe never consumes or duplicates full result delivery.
