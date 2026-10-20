"""Harbor agent for the `agy-staff` orchestration setup with Codex as the host.

Same as CodexWriteback (Harbor's built-in `codex` agent plus auth.json write-back), plus setup
steps before Codex runs:
1. Install the agy-staff plugin from the local marketplace baked at /opt/agy-staff into
   Harbor's CODEX_HOME, so the plugin cache exists. Harbor rewrites config.toml before the
   run, so the marketplace/plugin entries must also be passed with
   `--ak config=bench/configs/codex/agy-staff.toml`.
2. Upload the user's own agy sign-in into the container (agy_auth.py).

Load with:  PYTHONPATH=<repo> harbor run -a bench.harbor_agents.codex_agy_staff:CodexAgyStaff ...
"""

from bench.harbor_agents import agy_auth
from bench.harbor_agents.codex_writeback import CodexWriteback

_PLUGIN_SETUP = (
    "set -euo pipefail; "
    "export CODEX_HOME=/tmp/codex-home; mkdir -p \"$CODEX_HOME\"; "
    "codex plugin marketplace add /opt/agy-staff >/dev/null; "
    "codex plugin add agy@agy-staff >/dev/null; "
    "test -d \"$CODEX_HOME/plugins/cache/agy-staff/agy\"; "
    "mkdir -p \"$HOME/.gemini/antigravity-cli\"; chmod 700 \"$HOME/.gemini\" \"$HOME/.gemini/antigravity-cli\"; "
    "printf %s \"$HOME\""
)


class CodexAgyStaff(CodexWriteback):
    @staticmethod
    def name() -> str:
        return "codex-agy-staff"

    async def run(self, instruction, environment, context) -> None:
        result = await self.exec_as_agent(environment, command=_PLUGIN_SETUP)
        if getattr(result, "return_code", 0) != 0:
            raise RuntimeError("agy-staff plugin setup failed")
        remote_home = (getattr(result, "stdout", "") or "").strip().splitlines()[-1]
        if not remote_home.startswith("/"):
            raise RuntimeError("could not resolve the container user's HOME")

        await agy_auth.upload(self, environment, remote_home)
        await super().run(instruction, environment, context)
