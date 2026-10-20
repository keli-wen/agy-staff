"""Harbor agent for the `agy-staff` orchestration setup with Claude Code as the host.

Same as ClaudeGuarded (Harbor's `claude-code` plus the egress check), plus setup steps before Claude
Code runs, mirroring CodexAgyStaff:
1. Install the agy-staff plugin from the local marketplace baked at /opt/agy-staff into the config
   dir Harbor gives Claude Code for the run (CLAUDE_CONFIG_DIR = <agent logs>/sessions), so the
   plugin is enabled at user scope exactly as a user's `claude plugin install agy@agy-staff` would.
2. Upload the user's own agy sign-in into the container (agy_auth.py).

Load with:  PYTHONPATH=<repo> harbor run -a bench.harbor_agents.claude_agy_staff:ClaudeAgyStaff ...
"""

import shlex

from bench.harbor_agents import agy_auth
from bench.harbor_agents.claude_guarded import ClaudeGuarded


def _plugin_setup(config_dir: str) -> str:
    return (
        "set -euo pipefail; "
        f"export CLAUDE_CONFIG_DIR={shlex.quote(config_dir)}; mkdir -p \"$CLAUDE_CONFIG_DIR\"; "
        "export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1; "
        "claude plugin marketplace add /opt/agy-staff >/dev/null; "
        "claude plugin install agy@agy-staff >/dev/null; "
        "grep -q '\"agy@agy-staff\": true' \"$CLAUDE_CONFIG_DIR/settings.json\"; "
        "mkdir -p \"$HOME/.gemini/antigravity-cli\"; chmod 700 \"$HOME/.gemini\" \"$HOME/.gemini/antigravity-cli\"; "
        "printf %s \"$HOME\""
    )


class ClaudeAgyStaff(ClaudeGuarded):
    @staticmethod
    def name() -> str:
        return "claude-agy-staff"

    async def run(self, instruction, environment, context) -> None:
        config_dir = (self.environment_logs_dir / "sessions").as_posix()
        result = await self.exec_as_agent(environment, command=_plugin_setup(config_dir))
        if getattr(result, "return_code", 0) != 0:
            raise RuntimeError("agy-staff plugin setup failed")
        remote_home = (getattr(result, "stdout", "") or "").strip().splitlines()[-1]
        if not remote_home.startswith("/"):
            raise RuntimeError("could not resolve the container user's HOME")

        await agy_auth.upload(self, environment, remote_home)
        await super().run(instruction, environment, context)
