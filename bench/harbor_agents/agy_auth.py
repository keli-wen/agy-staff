"""Copy the user's own agy sign-in into the trial container, for the agy-staff setups.

The files come from AGY_BENCH_AGY_AUTH_DIR on the host (run-*.sh --agy-auth-dir; default
~/.gemini/antigravity-cli/) and go into the container user's ~/.gemini/antigravity-cli/ with mode 600. The
official, unmodified agy binary is the only client that uses them. They go through Harbor's upload_file,
never through `--ae`, so they are not written to the job's config.json.
"""

import os
import tempfile
from pathlib import Path

FILES = ("antigravity-oauth-token", "installation_id")
WRAPPER = (
    "rm -f /usr/local/bin/agy\n"
    "cat <<'EOF' > /usr/local/bin/agy\n"
    "#!/bin/sh\n"
    "if [ -z \"${GEMINI_API_KEY:-}\" ] && [ -f \"${HOME:-/root}/.gemini/antigravity-cli/.gemini-api-key\" ]; then\n"
    "  GEMINI_API_KEY=\"$(cat \"${HOME:-/root}/.gemini/antigravity-cli/.gemini-api-key\")\"\n"
    "  export GEMINI_API_KEY\n"
    "fi\n"
    "exec /opt/agy/antigravity \"$@\"\n"
    "EOF\n"
    "chmod 755 /usr/local/bin/agy"
)
_SCRUB = (
    "node -e '"
    "const fs = require(\"fs\"), path = require(\"path\");"
    "const kf = process.argv[1];"
    "const key = fs.existsSync(kf) ? fs.readFileSync(kf, \"utf8\").trim() : \"\";"
    "try { fs.unlinkSync(kf); } catch {}"
    "if (!key) process.exit(0);"
    "function walk(d) {"
    "  let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }"
    "  for (const e of entries) {"
    "    const p = path.join(d, e.name);"
    "    if (e.isDirectory()) walk(p);"
    "    else if (e.isFile()) {"
    "      try {"
    "        const s = fs.readFileSync(p, \"utf8\");"
    "        if (s.includes(key)) fs.writeFileSync(p, s.split(key).join(\"[REDACTED_GEMINI_API_KEY]\"));"
    "      } catch {}"
    "    }"
    "  }"
    "}"
    "for (const r of process.argv.slice(2)) walk(r);"
    "'"
)


async def upload(agent, environment, remote_home: str) -> None:
    local_dir = Path(os.environ.get("AGY_BENCH_AGY_AUTH_DIR") or Path.home() / ".gemini" / "antigravity-cli")
    remote_dir = f"{remote_home}/.gemini/antigravity-cli"
    api_key = (os.environ.get("AGY_BENCH_GEMINI_API_KEY") or "").strip()
    if not (local_dir / "antigravity-oauth-token").is_file() and api_key:
        inst = local_dir / "installation_id"
        if inst.is_file():
            await environment.upload_file(str(inst), f"{remote_dir}/installation_id")
        with tempfile.TemporaryDirectory() as tmp:
            key_file = Path(tmp) / "key"
            settings_file = Path(tmp) / "settings.json"
            key_file.write_text(api_key)
            settings_file.write_text('{"modelProvider": "gemini"}\n')
            await environment.upload_file(str(key_file), f"{remote_dir}/.gemini-api-key")
            await environment.upload_file(str(settings_file), f"{remote_dir}/settings.json")
        await agent.exec_as_root(
            environment,
            command=f"chmod 600 {remote_dir}/.gemini-api-key {remote_dir}/settings.json; {WRAPPER}",
        )
        return
    for name in FILES:
        src = local_dir / name
        if not src.is_file():
            raise RuntimeError(f"agy credential file missing on host: {name}")
        await environment.upload_file(str(src), f"{remote_dir}/{name}")
    await agent.exec_as_root(
        environment, command=" ".join(["chmod 600"] + [f"{remote_dir}/{n}" for n in FILES])
    )


async def scrub(agent, environment, remote_home: str) -> None:
    remote_dir = f"{remote_home}/.gemini/antigravity-cli"
    roots = f"{remote_dir}/brain /logs /testbed/.agy-staff /app/.agy-staff /workspace/.agy-staff"
    await agent.exec_as_root(
        environment,
        command=f"{_SCRUB} {remote_dir}/.gemini-api-key {roots} || true",
    )
