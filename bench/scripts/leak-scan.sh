#!/usr/bin/env bash
# Leak-scan existing jobs; see help below.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

help() {
  cat <<EOF
leak-scan.sh: look for credentials in job directories. Every file is checked for the exact values of the
judge keys (GEMINI_API_KEY, DEEPSEEK_API_KEY in the environment), the Claude setup-token and any Anthropic key,
the agy tokens and the Codex auth.json tokens, and for strings shaped like Google or Anthropic credentials.
It prints counts only, never a value. The run scripts do this after every trial; run it again before you
share anything from a job directory.

usage: leak-scan.sh [options] <job-name>...

options:
  --data DIR            bench data directory (default: \$AGY_BENCH_DATA, else --data in ~/.agy-bench/config)
  --claude-token FILE   the setup-token whose value to look for (default: ~/.agy-bench/claude-oauth-token)
  --agy-auth-dir DIR    the agy sign-in whose tokens to look for (default: ~/.gemini/antigravity-cli)
  --codex-auth FILE     the Codex auth.json whose tokens to look for (default: ~/.agy-bench/codex-home/auth.json)
  -h, --help            show this help
  Pass the same credential options as the run; a file that is not there is skipped without a warning.

examples:
  leak-scan.sh claude-agy-staff-deepsearchqa-0190-c55x-r1
  leak-scan.sh \$(ls "\$AGY_BENCH_DATA/jobs" | grep -- '-c55x-r1')

exit codes: 0 nothing found; 2 usage error or no such job; 3 a credential was found

for agents:
  - On exit 3, stop and tell the user which job; share or upload nothing from it. Never print or grep for
    the values yourself.
EOF
}
usage() { usage_exit "${1:-2}"; }

JOBS=()
while [ $# -gt 0 ]; do
  common_opt "$1" "${2:-}"
  if [ "$OPT_SHIFT" -gt 0 ]; then shift "$OPT_SHIFT"; continue; fi
  case "$1" in
    -h|--help) usage 0 ;;
    -*)        echo "unknown option: $1" >&2; usage ;;
    *)         JOBS+=("$1"); shift ;;
  esac
done
[ "${#JOBS[@]}" -gt 0 ] || usage
config_notice
require_data
rc=0
for job in "${JOBS[@]}"; do
  [ -d "$DATA/jobs/$job" ] || { echo "no such job: $DATA/jobs/$job" >&2; rc=2; continue; }
  leak_scan "$DATA/jobs/$job" || rc=3
done
exit "$rc"
