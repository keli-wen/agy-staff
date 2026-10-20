"""Record which agy-staff build a trial ran, so results from later plugin versions can be told apart.

bake-task.sh copies the plugin to /opt/agy-staff and writes the source commit to /opt/agy-staff/.bench-source.
Agents call record() after setup; it writes <trial>/agent/provenance.json with the plugin version (from
.claude-plugin/plugin.json) and that commit. Trials from before this existed ran agy-staff 0.7.3 (f00d149);
analyze.py fills that in when the file is missing.
"""

import json

_READ = (
    "v=$(sed -n 's/.*\"version\" *: *\"\\([^\"]*\\)\".*/\\1/p' /opt/agy-staff/.claude-plugin/plugin.json 2>/dev/null | head -1); "
    "c=$(cat /opt/agy-staff/.bench-source 2>/dev/null); printf '%s\\n%s\\n' \"$v\" \"$c\""
)


async def record(agent, environment) -> None:
    try:
        r = await environment.exec(command=_READ, timeout_sec=30)
        version, commit = ((r.stdout or "") + "\n\n").splitlines()[:2]
    except Exception:  # noqa: BLE001 - informational only
        version, commit = "", ""
    agent.logs_dir.mkdir(parents=True, exist_ok=True)
    (agent.logs_dir / "provenance.json").write_text(
        json.dumps({"agy_staff_version": version.strip() or None, "agy_staff_commit": commit.strip() or None}) + "\n")
