"""Harbor's built-in `claude-code` agent plus the container egress check.

Authentication is the user's own `claude setup-token` token (model requests only, valid one year,
no refresh, so nothing is written back). run-claude.sh reads it from its --claude-token file into the
Harbor process environment and sets CLAUDE_FORCE_OAUTH=1; Harbor's agent then passes it to the
unmodified `claude` CLI in the container. It never goes through `--ae`, so it is not written to the
job's config.json.

Like CodexWriteback, with --expect-egress the container's egress (bench/harbor_agents/egress.py) is
checked against api.anthropic.com in setup(), before Claude Code is installed or the token is used,
aborting the trial unless it matches; and again after the run, recorded only. Results go to
<trial>/agent/egress.txt.

Stall watchdog: on 2026-10-16 two QnA trials went silent (one inside a Bash call that never returned,
one in the middle of a streamed reply) and sat until the 3-hour task timeout. While Claude Code runs,
the agent watches <trial>/agent/claude-code.txt (the live stream-json log); if it does not grow for
STALL_SEC, the run is stopped with a RuntimeError and agent/stalled.txt is written, so analyze.py
flags the trial as an infra failure (agent_stalled) to rerun. STALL_SEC is well above the longest
legitimate silence seen: agy-staff's background `wait --timeout 10m` wakes the host at least every
~10 minutes, and a single Bash call is capped at 10 minutes.

Load with:  PYTHONPATH=<repo> harbor run -a bench.harbor_agents.claude_guarded:ClaudeGuarded ...
"""

import asyncio
import os
import platform
import re
import time

from harbor.agents.installed.claude_code import ClaudeCode

from bench.harbor_agents import egress, provenance

STALL_SEC = 1500
# A background command (run_in_background) such as a full test suite can legitimately keep the host
# silent for longer; django-13401 agy-staff was stopped at 25 minutes while one was still running.
PENDING_STALL_SEC = 3600
STALL_FILE = "stalled.txt"
TASK_RE = re.compile(r'"subtype":\s*"(task_started|task_notification)".*?"task_id":\s*"([^"]+)"')


class ClaudeGuarded(ClaudeCode):
    EGRESS_URL = "https://api.anthropic.com/cdn-cgi/trace"
    WATCH_INTERVAL = 30

    @staticmethod
    def name() -> str:
        return "claude-guarded"

    async def _watch(self, task) -> None:
        log = self.logs_dir / "claude-code.txt"
        size, last, pending = -1, time.monotonic(), set()
        while not task.done():
            await asyncio.sleep(self.WATCH_INTERVAL)
            now_size = log.stat().st_size if log.exists() else 0
            if now_size != size:
                # Track background tasks (e.g. a test suite run with run_in_background): while one is
                # pending, the host may legitimately stay silent until its notification arrives.
                with open(log, "rb") if now_size else open(os.devnull, "rb") as f:
                    f.seek(max(size, 0))
                    for line in f.read().decode(errors="replace").splitlines():
                        m = TASK_RE.search(line)
                        if m:
                            (pending.add if m.group(1) == "task_started" else pending.discard)(m.group(2))
                size, last = now_size, time.monotonic()
            elif time.monotonic() - last > (PENDING_STALL_SEC if pending else STALL_SEC):
                self._stalled = True
                (self.logs_dir / STALL_FILE).write_text(f"no stream output for {STALL_SEC}s; run stopped\n")
                task.cancel()
                return

    async def _run_watched(self, coro) -> None:
        self._stalled = False
        task = asyncio.ensure_future(coro)
        watch = asyncio.ensure_future(self._watch(task))
        try:
            await task
        except asyncio.CancelledError:
            if self._stalled and not watch.cancelled():
                raise RuntimeError(f"Claude Code produced no output for {STALL_SEC}s; stopped as stalled")
            raise
        finally:
            watch.cancel()

    async def setup(self, environment) -> None:
        # Fail closed before anything is installed or the token is used.
        if not await egress.check(self, environment, self.EGRESS_URL, "pre"):
            raise RuntimeError(f"egress check failed before setup; see agent/{egress.STATUS_FILE}")
        await super().setup(environment)
        # Record which Claude Code build the trial ran: ELF e_machine 183 is aarch64 (native), 62 x86-64 (native on
        # an x86-64 host, translated by Rosetta on an Apple Silicon one).
        x64 = "linux-x64 (Rosetta)" if platform.machine() in ("arm64", "aarch64") else "linux-x64 (native)"
        try:
            r = await environment.exec(command="od -An -tu2 -j18 -N2 \"$(readlink -f \"$(command -v claude)\")\"", timeout_sec=30)
            machine = {"183": "linux-arm64 (native)", "62": x64}.get((r.stdout or "").strip(), (r.stdout or "").strip())
        except Exception:  # noqa: BLE001 - informational only
            machine = "unknown"
        (self.logs_dir / "claude-binary.txt").write_text(machine + "\n")
        await provenance.record(self, environment)

    async def run(self, instruction, environment, context) -> None:
        try:
            await self._run_watched(super().run(instruction, environment, context))
        finally:
            await egress.check(self, environment, self.EGRESS_URL, "post")
