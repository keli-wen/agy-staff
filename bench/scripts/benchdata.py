"""The bench data directory (datasets, baked tasks, tools, jobs), shared by the Python scripts.

It lives outside the repository and comes from --data DIR, else $AGY_BENCH_DATA, else the --data line of the
user's defaults file: ~/.agy-bench/config, or $AGY_BENCH_CONFIG (empty for none). The file is read the way
lib.sh reads it for the shell scripts: one "--option value" per line, # comments, ~ for the home directory,
and relative paths taken from the file's directory.
"""

import os
import sys
from pathlib import Path

CONFIG_OPTIONS = ("--data", "--proxy", "--expect-egress", "--agy-auth-dir", "--claude-token", "--codex-auth")


def config_file():
    f = os.environ.get("AGY_BENCH_CONFIG", str(Path.home() / ".agy-bench" / "config"))
    return Path(f) if f else None


def config():
    """{option: value} from the defaults file ({} without one)."""
    f = config_file()
    if f is None or not f.is_file():
        return {}
    out = {}
    for n, line in enumerate(f.read_text().splitlines(), 1):
        words = line.split("#", 1)[0].split(None, 1)
        if not words:
            continue
        opt, val = words[0], words[1].strip() if len(words) > 1 else ""
        if opt not in CONFIG_OPTIONS:
            sys.exit(f"{f}:{n}: {opt} cannot be a default (only: {' '.join(CONFIG_OPTIONS)})")
        if not val:
            sys.exit(f"{f}:{n}: {opt} needs a value")
        if val == "~" or val.startswith("~/"):
            val = str(Path.home()) + val[1:]
        if opt != "--proxy" and not val.startswith("/"):
            val = os.path.join(os.path.abspath(f.parent), val)
        out[opt] = val
    return out


def add_argument(parser):
    parser.add_argument("--data", metavar="DIR",
                        help="bench data directory (default: $AGY_BENCH_DATA, else --data in the defaults file)")


def resolve(arg=None):
    d = arg or os.environ.get("AGY_BENCH_DATA") or config().get("--data")
    if not d:
        sys.exit(f"no data directory: pass --data DIR, set AGY_BENCH_DATA, or put --data in {config_file() or 'the defaults file'}")
    path = Path(d).expanduser().resolve()
    if not path.is_dir():
        sys.exit(f"data directory not found: {path}")
    return path
