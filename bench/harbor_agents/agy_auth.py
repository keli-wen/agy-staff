"""Copy the user's own agy sign-in into the trial container, for the agy-staff setups.

The files come from AGY_BENCH_AGY_AUTH_DIR on the host (run-*.sh --agy-auth-dir; default
~/.gemini/antigravity-cli/) and go into the container user's ~/.gemini/antigravity-cli/ with mode 600. The
official, unmodified agy binary is the only client that uses them. They go through Harbor's upload_file,
never through `--ae`, so they are not written to the job's config.json.
"""

import os
from pathlib import Path

FILES = ("antigravity-oauth-token", "installation_id")


async def upload(agent, environment, remote_home: str) -> None:
    local_dir = Path(os.environ.get("AGY_BENCH_AGY_AUTH_DIR") or Path.home() / ".gemini" / "antigravity-cli")
    remote_dir = f"{remote_home}/.gemini/antigravity-cli"
    for name in FILES:
        src = local_dir / name
        if not src.is_file():
            raise RuntimeError(f"agy credential file missing on host: {name}")
        await environment.upload_file(str(src), f"{remote_dir}/{name}")
    await agent.exec_as_root(
        environment, command=" ".join(["chmod 600"] + [f"{remote_dir}/{n}" for n in FILES])
    )
