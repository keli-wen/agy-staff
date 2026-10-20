"""Harbor's built-in `codex` agent plus auth.json write-back.

Harbor uploads CODEX_AUTH_JSON_PATH into the container but never copies it back, and its cleanup
deletes CODEX_HOME. A refresh token works only once (openai/codex #15410, #26303): if Codex
refreshed during a trial, the host copy is stale and the next trial fails. OpenAI's CI/CD auth guide
prescribes restore -> run -> write back, with one auth.json per serialized stream.

Right before Harbor's cleanup command runs, this agent:
1. copies "$CODEX_HOME/auth.json" in the container to a private temp file (`cp -L` follows
   Harbor's symlink, or reads the regular file if Codex replaced the link);
2. downloads that copy with Harbor's download_file and deletes it in the container;
3. if it is a Codex token file that differs from the copy uploaded at the start of the run (so Codex
   refreshed it), atomically replaces the host file (mode 600). Comparing with the uploaded copy, not
   with the host file as it is now, keeps a trial that did not refresh from writing its stale token
   over a newer one that a parallel trial wrote back in the meantime.
Token contents are never printed or logged; the container command prints only the temp path.
The outcome goes to <trial>/agent/auth-writeback.txt: "unchanged", "updated", "skipped: ...", or
"failed: ...". The batch runner stops on anything but "unchanged" or "updated".

With --expect-egress it also checks the container's egress (bench/harbor_agents/egress.py) against
chatgpt.com: in setup(), before Codex is installed or auth.json is uploaded, aborting the trial unless
it matches; and again after the run, recorded only. Results go to <trial>/agent/egress.txt.

Load with:  PYTHONPATH=<repo> harbor run -a bench.harbor_agents.codex_writeback:CodexWriteback ...
"""

import json
import os
import shutil
import tempfile
from pathlib import Path

from harbor.agents.installed.codex import Codex

from bench.harbor_agents import egress, provenance

_COPY_OUT = (
    'umask 077; t=$(mktemp /tmp/agy-bench-auth.XXXXXX); cp -L "$CODEX_HOME/auth.json" "$t"; printf %s "$t"'
)
STATUS_FILE = "auth-writeback.txt"


def _is_token_file(data: bytes) -> bool:
    try:
        doc = json.loads(data)
    except ValueError:
        return False
    tokens = doc.get("tokens") if isinstance(doc, dict) else None
    return isinstance(tokens, dict) and isinstance(tokens.get("refresh_token"), str)


class CodexWriteback(Codex):
    EGRESS_URL = "https://chatgpt.com/cdn-cgi/trace"

    @staticmethod
    def name() -> str:
        return "codex-writeback"

    async def setup(self, environment) -> None:
        # Fail closed before anything is installed or any credential is uploaded.
        if not await egress.check(self, environment, self.EGRESS_URL, "pre"):
            raise RuntimeError(f"egress check failed before setup; see agent/{egress.STATUS_FILE}")
        await super().setup(environment)
        await provenance.record(self, environment)

    async def run(self, instruction, environment, context) -> None:
        # The auth.json Codex.run() is about to upload, for _write_back() to tell whether Codex refreshed it.
        try:
            path = self._resolve_auth_json_path()
            self._uploaded_auth = path.read_bytes() if path is not None else None
        except (OSError, ValueError):
            self._uploaded_auth = None
        try:
            await super().run(instruction, environment, context)
        finally:
            await egress.check(self, environment, self.EGRESS_URL, "post")

    def _is_cleanup(self, command: str) -> bool:
        return (
            command.startswith("rm -rf ")
            and self._REMOTE_CODEX_SECRETS_DIR.as_posix() in command
            and "$CODEX_HOME" in command
        )

    async def exec_as_agent(self, environment, command, env=None, cwd=None, timeout_sec=None):
        if self._is_cleanup(command):
            status = await self._write_back(environment, env)
            (self.logs_dir / STATUS_FILE).write_text(status + "\n")
        return await super().exec_as_agent(
            environment, command, env=env, cwd=cwd, timeout_sec=timeout_sec
        )

    async def _write_back(self, environment, env) -> str:
        try:
            host_path = self._resolve_auth_json_path()
        except ValueError as e:
            return f"failed: {e}"
        if host_path is None:
            return "skipped: no auth.json in use"
        try:
            result = await super().exec_as_agent(environment, command=_COPY_OUT, env=env)
        except Exception as e:  # noqa: BLE001 - report, never raise into Harbor's cleanup
            return f"failed: could not copy auth.json in the container ({type(e).__name__})"
        remote_tmp = (getattr(result, "stdout", "") or "").strip().splitlines()[-1:]
        if not remote_tmp or not remote_tmp[0].startswith("/tmp/agy-bench-auth."):
            return "failed: unexpected temp path from the container"
        staging = Path(tempfile.mkdtemp(prefix=".writeback-", dir=host_path.parent))
        try:
            local = staging / "auth.json"
            await environment.download_file(remote_tmp[0], local)
            data = local.read_bytes()
            uploaded = getattr(self, "_uploaded_auth", None)
            if data == (host_path.read_bytes() if uploaded is None else uploaded):
                return "unchanged"
            if not _is_token_file(data):
                return "failed: container auth.json is not a Codex token file; host copy kept"
            fd = os.open(staging / "new", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            os.replace(staging / "new", host_path)
            return "updated"
        except Exception as e:  # noqa: BLE001
            return f"failed: {type(e).__name__}"
        finally:
            shutil.rmtree(staging, ignore_errors=True)
            try:
                await super().exec_as_agent(environment, command=f"rm -f {remote_tmp[0]}", env=env)
            except Exception:  # noqa: BLE001 - Harbor's cleanup and the container teardown follow
                pass
