"""The bench data directory (datasets, baked tasks, tools, jobs), shared by the Python scripts.

It lives outside the repository and comes from --data DIR, or else $AGY_BENCH_DATA.
"""

import os
import sys
from pathlib import Path


def add_argument(parser):
    parser.add_argument("--data", metavar="DIR", help="bench data directory (default: $AGY_BENCH_DATA)")


def resolve(arg=None):
    d = arg or os.environ.get("AGY_BENCH_DATA")
    if not d:
        sys.exit("no data directory: pass --data DIR or set AGY_BENCH_DATA")
    path = Path(d).expanduser().resolve()
    if not path.is_dir():
        sys.exit(f"data directory not found: {path}")
    return path
