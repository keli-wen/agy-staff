# Companion regression tests

Black-box tests for `companion/agy-companion.mjs` against the 0.3.1 interface.
Zero dependencies (`node:test` + `node:assert`), no `package.json`, no network.

## Run

```sh
node --test tests/*.test.mjs      # from the repo root
node --test                       # equivalent: walks the repo for *.test.mjs
```

Note: `node --test tests/` does **not** work on Node >= 22 — positional
arguments are glob patterns there, and a bare directory matches the directory
itself. Node 24.7 verified.

## How it works

Everything is exercised through the CLI, because the companion calls `main()` on
import. Each test builds its own sandbox (`tests/helpers.mjs`):

- a throwaway git repo under `os.tmpdir()` (so `.agy-staff/` state never lands in
  the real repo), with `.agy-staff/` added to `.git/info/exclude` — since 0.4 the
  companion does this itself on first use (`ensureStateDir`), the sandbox just
  pre-applies it so the companion's own state stays out of implement dirty-context prompts and review/research delta reports. The auto-exclude path itself is pinned in `dx.test.mjs`.
  `sandbox(label, { git: false })` skips the `git init` for the cases that must
  run outside a repository;
- a throwaway `HOME` (so `setup` can never touch the real `~/.gemini`);
- `AGY_BIN` pointed at `tests/fake-agy.mjs`, which records every argv it is
  called with to `$FAKE_AGY_ARGV_FILE` and prints a canned single-line JSON
  payload. The real `agy` is never invoked. Its behaviour is steered by env
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
repository, defaults to `gemini-3.7-flash-high`, allows continuation over its own dirty result, and reports workspace state with the result; `review`/`research` are never
blocked and instead report a working-tree delta — present when the fake `agy`
touches a file, silent when it does not, scoped to what appeared during the run,
and skipped entirely for `--restricted` runs); the reworded `--restricted`
empty-response triage message (and the unrestricted case that must never suggest
setup); the output split (the `[agy-staff]` telemetry line is asserted on stderr
for foreground runs and in `jobs/<id>.log` for background ones, and asserted
absent from stdout and from `jobs/<id>.result.md`); prompt-based `review`; job
lifecycle (`status`/`result`/`cancel`);
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
(`FAKE_AGY_SLEEP_MS`) — a residual lost-update window remains when two processes
read-modify-write `state.json` at the same instant (full fix would need file
locking, out of scope).
