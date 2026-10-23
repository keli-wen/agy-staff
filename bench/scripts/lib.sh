# shellcheck shell=bash disable=SC2034  # sourced: the scripts that source it use these variables
# Shared by the bench shell scripts: pinned versions, the options every trial script takes, the leak scan
# and the optional egress check. Source it; it only defines variables and functions.

BENCH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$BENCH/.." && pwd)"

# Tool versions installed in every task image. fetch-tools.sh downloads them, bake-task.sh bakes them in,
# and the run scripts pin Harbor's agents to the same versions so Harbor skips its own install.
CODEX_VERSION=0.160.1
NODE_VERSION=24.21.0
AGY_VERSION=1.3.0
CLAUDE_VERSION=2.1.296
AGY_STAFF_REF=f00d149   # the plugin commit v1 ran; bake-task.sh --agy-staff picks another

die() { echo "$*" >&2; exit 2; }

# GNU stat first: BSD stat rejects -c without printing, while GNU stat reads -f as --file-system.
file_mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }

# abspath <path>: the run scripts cd into the data directory before Harbor starts, so paths become absolute.
abspath() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s' "$PWD/$1" ;; esac; }

# resolve_ref <ref>: the 7-character commit a ref names in this repository (empty if it names none).
resolve_ref() { git -C "$REPO" rev-parse --verify --quiet "$1^{commit}" | cut -c1-7; }

# --- options shared by run-codex.sh and run-claude.sh --------------------------------------------------
DATA="${AGY_BENCH_DATA:-}"
PROXY=""
EXPECT_EGRESS=""
AGY_AUTH_DIR="$HOME/.gemini/antigravity-cli"
CLAUDE_TOKEN="$HOME/.agy-bench/claude-oauth-token"
CODEX_AUTH="$HOME/.agy-bench/codex-home/auth.json"
DRY_RUN=0

# common_opt <arg> [<value>]: handles one shared option and sets OPT_SHIFT to the words it used (0: not shared).
common_opt() {
  OPT_SHIFT=2
  case "$1" in
    --data)          DATA="${2:?--data needs a directory}" ;;
    --proxy)         PROXY="${2:?--proxy needs a URL}" ;;
    --expect-egress) EXPECT_EGRESS="$(abspath "${2:?--expect-egress needs a file}")" ;;
    --agy-auth-dir)  AGY_AUTH_DIR="$(abspath "${2:?--agy-auth-dir needs a directory}")" ;;
    --claude-token)  CLAUDE_TOKEN="$(abspath "${2:?--claude-token needs a file}")" ;;
    --codex-auth)    CODEX_AUTH="$(abspath "${2:?--codex-auth needs a file}")" ;;
    --dry-run)       DRY_RUN=1; OPT_SHIFT=1 ;;
    *)               OPT_SHIFT=0 ;;
  esac
}

# --- the defaults file --------------------------------------------------------------------------------
# The user's own settings live outside the repository, in ~/.agy-bench/config (or $AGY_BENCH_CONFIG; set it
# empty for none): one "--option value" per line, # comments, ~ for the home directory, and relative paths
# taken from the file's directory. Options on the command line win over it, and AGY_BENCH_DATA wins over
# its --data. Only the user's settings can be defaults, never --model or --dry-run.
CONFIG_FILE="${AGY_BENCH_CONFIG-$HOME/.agy-bench/config}"
CONFIG_USED=""
CONFIG_OPTIONS="--data --proxy --expect-egress --agy-auth-dir --claude-token --codex-auth"
load_config() {
  local f="$CONFIG_FILE" dir line opt val n=0
  [ -n "$f" ] && [ -f "$f" ] || return 0
  dir="$(cd "$(dirname "$f")" && pwd)"
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    line="${line%%#*}"
    read -r opt val <<< "$line" || true
    [ -n "$opt" ] || continue
    case " $CONFIG_OPTIONS " in *" $opt "*) ;; *) die "$f:$n: $opt cannot be a default (only: $CONFIG_OPTIONS)" ;; esac
    [ -n "$val" ] || die "$f:$n: $opt needs a value"
    # shellcheck disable=SC2088  # matching a literal ~ written in the file, to expand it here
    case "$val" in "~") val="$HOME" ;; "~/"*) val="$HOME/${val#"~/"}" ;; esac
    case "$opt" in --proxy) ;; *) case "$val" in /*) ;; *) val="$dir/$val" ;; esac ;; esac
    if [ "$opt" = --data ]; then [ -n "${AGY_BENCH_DATA:-}" ] || DATA="$val"; else common_opt "$opt" "$val"; fi
    CONFIG_USED="$CONFIG_USED $opt"
  done < "$f"
}
# config_notice: say which defaults came from the file (stderr), so a run shows where its settings came from.
config_notice() { [ -z "$CONFIG_USED" ] || echo "defaults from $CONFIG_FILE:$CONFIG_USED" >&2; }

COMMON_USAGE='  --data DIR            bench data directory: datasets, baked tasks, tools and jobs
                        (default: $AGY_BENCH_DATA, else the defaults file below)
  --proxy URL           HTTP(S) proxy for the trial container, e.g. http://host.docker.internal:7890
                        (default: the defaults file, else none). The host side uses your shell environment.
  --expect-egress FILE  turn on the egress check (default: the defaults file, else off). FILE holds the
                        one IP the model service must see. The trial does not start unless the host
                        matches, and exits 4 unless the container matched too, before setup and after
                        the run.
  --agy-auth-dir DIR    agy sign-in copied into agy-staff containers (default: ~/.gemini/antigravity-cli)
  --claude-token FILE   Claude setup-token, mode 600 (default: ~/.agy-bench/claude-oauth-token);
                        run-claude.sh sends it to Harbor, and every leak scan looks for its value
  --codex-auth FILE     Codex auth.json for the bench (default: ~/.agy-bench/codex-home/auth.json);
                        run-codex.sh uploads it and writes it back after a refresh, and every leak scan
                        looks for its tokens
  --dry-run             check the arguments and paths, print the Harbor command, and exit: no egress
                        check, no credential read, no trial
  -h, --help            show this help

defaults file:
  ~/.agy-bench/config (or $AGY_BENCH_CONFIG) holds the user'"'"'s own settings, one option per line, e.g.
      --data ~/agy-bench
      --proxy http://host.docker.internal:7890
      --expect-egress ~/.agy-bench/expected-egress-ip
  Only --data, --proxy, --expect-egress, --agy-auth-dir, --claude-token and --codex-auth can be defaults.
  The command line wins over the file, and AGY_BENCH_DATA over its --data. The script names the options it
  took from the file on stderr. AGY_BENCH_CONFIG= (empty) turns the file off.'

TRIAL_EXIT_CODES='exit codes:
  0  the trial ran. A trial that failed, timed out or crashed inside Harbor also exits 0: read its result
     (analyze.py), or let run-batch.py do it.
  2  usage error, or something missing: data directory, baked task, template, credential file
  3  the leak scan found a credential in the job directory
  4  the egress check failed (only with --expect-egress)
  5  the environment failed before agent setup; no container egress record (with --expect-egress)'

TRIAL_AGENT_NOTES='for agents:
  - A trial spends the user'"'"'s subscription quota and takes 5 to 30 minutes. Run one only when the user
    asked for it, and show them the --dry-run command first. For more than one trial, use run-batch.py.
  - --data, --proxy and --expect-egress are the user'"'"'s own settings, and none of them is in the repository.
    Take them from the user'"'"'s defaults file (see above; --dry-run shows what it gives), or ask the user;
    never guess, and never edit the file without being asked. If the user uses --expect-egress, never turn
    it off: it keeps their accounts from being reached from an unexpected IP.
  - Credentials go in only as file paths through these options. Never print, cat or copy a credential file,
    and never print the environment (env, printenv, set).
  - Exit 3: stop, tell the user, and share or upload nothing from that job. Exit 4: stop and tell the user;
    do not retry without the check.'

# usage_exit <rc>: print the help of the calling script (its help function); stdout for -h, else stderr.
usage_exit() { if [ "$1" = 0 ]; then help; else help >&2; fi; exit "$1"; }

load_config

require_data() {
  [ -n "$DATA" ] || die "no data directory: pass --data DIR, set AGY_BENCH_DATA, or put --data in ${CONFIG_FILE:-the defaults file}"
  [ -d "$DATA" ] || die "data directory not found: $DATA"
  DATA="$(cd "$DATA" && pwd)"
}

# task_paths <task> <baked-dir>: sets DATASET, NAME, TASK, WORKDIR and DATASET_ARGS.
# <task> is an instance_id for SWE-bench Verified, or <dataset>/<task-name> for the other datasets.
task_paths() {
  case "$1" in */*) DATASET="${1%%/*}"; NAME="${1#*/}" ;; *) DATASET=swebench-verified; NAME="$1" ;; esac
  TASK="$DATA/$2/$DATASET/$NAME"
  # QnA and DeepSearchQA are graded offline by grade.py, so they run without Harbor's verifier (which would
  # need judge keys inside the container) and keep only the answer file. WORKDIR is where the agent starts;
  # agy-staff keeps its job state in <git root or cwd>/.agy-staff.
  DATASET_ARGS=(); WORKDIR=/testbed
  case "$DATASET" in
    swe-atlas-qna) DATASET_ARGS=(--disable-verification); WORKDIR=/app ;;   # answer: /logs/agent/answer.txt
    deepsearchqa)  DATASET_ARGS=(--disable-verification --artifact /workspace/answer.txt); WORKDIR=/workspace ;;
  esac
}

# proxy_args: --ae flags that point the container at --proxy (none without it).
proxy_args() {
  PROXY_AE=()
  [ -n "$PROXY" ] || return 0
  local no=localhost,127.0.0.1,host.docker.internal
  PROXY_AE=(--ae "HTTPS_PROXY=$PROXY" --ae "HTTP_PROXY=$PROXY" --ae "NO_PROXY=$no" --ae "no_proxy=$no")
}

# show_command <words...>: print a command with its words quoted (dry run).
show_command() { printf '%q ' "$@"; printf '\n'; }

# --- egress check (off unless --expect-egress) ----------------------------------------------------------
# egress_host <trace-url> <label>: exit 4 if the host's egress does not match; nothing when the check is off.
egress_host() {
  [ -n "$EXPECT_EGRESS" ] || return 0
  "$BENCH/scripts/egress-check.sh" "$EXPECT_EGRESS" "$1" "$2" || exit 4
}

# egress_container <job-dir>: return 4 on failed/missing checks, or 5 if the environment never started.
egress_container() {
  [ -n "$EXPECT_EGRESS" ] || return 0
  local rec
  rec=$(find "$1" -path '*/agent/egress.txt' 2>/dev/null | head -1)
  if [ -z "$rec" ]; then
    # An environment that never started cannot run an egress check. Keep this a failure,
    # but preserve its cause instead of misreporting it as a network/egress failure.
    local failure
    failure=$(python3 - "$1" <<'PY'
import json
import sys
from pathlib import Path

for path in sorted(Path(sys.argv[1]).glob("*/result.json")):
    try:
        result = json.loads(path.read_text())
    except (OSError, ValueError):
        continue
    exception = (result.get("exception_info") or {}).get("exception_type")
    if exception and result.get("environment_setup") and not result.get("agent_setup") and not result.get("agent_execution"):
        print(exception)
        break
PY
)
    if [ -n "$failure" ]; then
      echo "environment failed before agent setup: $failure; container egress unavailable" >&2
      return 5
    fi
    echo "egress container: no record" >&2; return 4
  fi
  sed 's/^/egress container /' "$rec"
  if grep -qv ': match ' "$rec"; then return 4; fi
}

# --- leak scan: counts only; secret values go to grep through a pipe and are never printed -------------
leak_scan() {
  local D="$1" k=0 d=0 c=0 o=0 x=0 p=0 cv=""
  count_fixed() { { grep -rlF -f - "$D" 2>/dev/null || true; } | wc -l | tr -d ' '; }
  [ -n "${GEMINI_API_KEY:-}" ] && k=$(printf '%s\n' "$GEMINI_API_KEY" | count_fixed)
  [ -n "${DEEPSEEK_API_KEY:-}" ] && d=$(printf '%s\n' "$DEEPSEEK_API_KEY" | count_fixed)
  # Anthropic credentials: the Claude setup-token (from the env or its file) and any API key. Empty values
  # are skipped here and in the token files below, since an empty grep pattern would match every file.
  [ -f "$CLAUDE_TOKEN" ] && cv=$(tr -d '[:space:]' < "$CLAUDE_TOKEN")
  c=$({ for v in "${CLAUDE_CODE_OAUTH_TOKEN:-}" "$cv" "${ANTHROPIC_API_KEY:-}" "${ANTHROPIC_AUTH_TOKEN:-}"; do
          [ -n "$v" ] && printf '%s\n' "$v"; done; true; } | count_fixed)
  local TOK="$AGY_AUTH_DIR/antigravity-oauth-token"
  [ -f "$TOK" ] && o=$(node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=[t.token?.access_token,t.token?.refresh_token,t.id_token].filter(s=>typeof s==="string"&&s.length>20);if(v.length)process.stdout.write(v.join("\n")+"\n")' "$TOK" | count_fixed)
  # Credential fields only: tokens.account_id is account metadata (creator_account_id),
  # not an authentication token. Scanning every tokens value falsely flags normal Codex rollouts.
  [ -f "$CODEX_AUTH" ] && x=$(node -e 'const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=[t.tokens?.access_token,t.tokens?.refresh_token,t.tokens?.id_token,t.OPENAI_API_KEY].filter(s=>typeof s==="string"&&s.length>0);if(v.length)process.stdout.write(v.join("\n")+"\n")' "$CODEX_AUTH" | count_fixed)
  # Shape scan; base64 image data (data:image/...;base64,...) and Claude thinking-block signatures
  # ("signature":"<base64>", an opaque blob from the API) are skipped first, because random base64 can
  # contain a "1//" + 30 chars run (a viewed matplotlib PNG did, and so did a signature). The exact-value
  # checks above still cover every file in full.
  p=$(find "$D" -type f -print0 | xargs -0 perl -0777 -ne 's{data:image/[\w.+-]+;base64,[A-Za-z0-9+/=]+}{}g; s{"signature":\s*"[A-Za-z0-9+/=]+"}{}g;
      $n += () = m{AIza[0-9A-Za-z_-]{35}|ya29\.[0-9A-Za-z_-]{20,}|1//[0-9A-Za-z_-]{30,}|sk-ant-[a-z]+[0-9]{2}-[0-9A-Za-z_-]{20,}}g; END { print $n + 0 }' | awk '{ s += $1 } END { print s + 0 }')
  echo "leak scan ($D): files with GEMINI_API_KEY=$k, files with DEEPSEEK_API_KEY=$d, files with Anthropic credential values=$c, files with host agy OAuth token values=$o, files with Codex auth.json token values=$x, Google/Anthropic-credential-shaped strings=$p"
  [ "$k$d$c$o$x$p" = "000000" ] || { echo "LEAK SCAN FAILED: inspect $D before sharing anything" >&2; return 3; }
}

# Harbor's progress output, cut down to the lines worth reading. Callers end the pipe with `|| true`.
harbor_filter() {
  grep -v -E "^\s*$|gotrue|Exception ignored|AttributeError|File \"|Traceback|_refresh_token_timer|^Tip:|harbor datasets list" \
    | grep -E "│ +[0-9]|Reward|Exception|runtime|Error|error" | head -12
}
