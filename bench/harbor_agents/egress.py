"""Egress check inside the trial container (fail closed; host side: bench/scripts/egress-check.sh).

Off unless the run script got --expect-egress, which passes the expected-IP file to Harbor's environment
as AGY_BENCH_EXPECTED_EGRESS. When on, the container must reach the model service from the same egress
IP as the host. The check asks the service's own Cloudflare trace endpoint from inside the container
(through the agent's proxy env), so it measures the egress that requests to that domain actually use.
Agents call it in setup(), before anything is installed or any credential is uploaded, and abort the
trial unless it matches; after the run they call it again and only record the result. Results are
appended to <trial>/agent/egress.txt as "<phase>: match loc=XX (<host>)", "<phase>: MISMATCH loc=XX
(<host>)", "<phase>: lookup failed (<host>)" or "<phase>: skipped, check off (<host>)", never with an IP.
"""

import os
import shlex
from pathlib import Path

EXPECTED_ENV = "AGY_BENCH_EXPECTED_EGRESS"
STATUS_FILE = "egress.txt"


def _trace_command(url: str) -> str:
    # curl when the image has it; otherwise the Node baked into every task image (bake-task.sh).
    # Always exits 0, so a failed lookup shows up as missing output rather than an exec error.
    q = shlex.quote(url)
    node = (
        "fetch(process.argv[1],{signal:AbortSignal.timeout(20000)})"
        ".then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(7))"
    )
    return (
        f"if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 20 {q}; "
        f"else NODE_USE_ENV_PROXY=1 node -e {shlex.quote(node)} {q}; fi; true"
    )


async def check(agent, environment, url: str, phase: str) -> bool:
    """Record the container's egress for `phase`; True on a match, or when the check is off."""
    host = url.split("/")[2]
    expected_file = Path(os.environ[EXPECTED_ENV]) if os.environ.get(EXPECTED_ENV) else None
    expected = expected_file.read_text().strip() if expected_file and expected_file.is_file() else ""
    if expected_file is None:
        status = f"{phase}: skipped, check off ({host})"
    elif not expected:
        status = f"{phase}: no expected IP on the host ({host})"
    else:
        body = ""
        for _ in range(2):  # one retry, so a single dropped request does not abort a trial
            try:
                result = await environment.exec(command=_trace_command(url), timeout_sec=60)
                body = getattr(result, "stdout", "") or ""
            except Exception:  # noqa: BLE001 - a failed lookup is recorded, never raised here
                body = ""
            if "ip=" in body:
                break
        fields = dict(line.split("=", 1) for line in body.splitlines() if "=" in line)
        if not fields.get("ip"):
            status = f"{phase}: lookup failed ({host})"
        elif fields["ip"].strip() == expected:
            status = f"{phase}: match loc={fields.get('loc', '?').strip()} ({host})"
        else:
            status = f"{phase}: MISMATCH loc={fields.get('loc', '?').strip()} ({host})"
    agent.logs_dir.mkdir(parents=True, exist_ok=True)
    with open(agent.logs_dir / STATUS_FILE, "a") as f:
        f.write(status + "\n")
    return expected_file is None or status.startswith(f"{phase}: match ")
