#!/usr/bin/env bash
# Run one Harbor trial with Codex as the host on a baked task (bake-task.sh), then leak-scan the job.
#   usage: run-codex.sh [options] <setup> <task> [job-suffix]
#   setup: solo | native | agy-staff, or oracle | nop (the task checks select-tasks.py reads)
#   task:  <instance_id> for SWE-bench Verified, or <dataset>/<task-name> (swe-atlas-qna, deepsearchqa)
#   job:   codex-<setup>-<task-name>-<job-suffix>; put a run tag and the rep in the suffix, e.g. s61x-r1
# Auth: the bench's own Codex auth.json (--codex-auth). Harbor uploads it into the container and
# CodexWriteback copies it back if Codex refreshed the token (agent/auth-writeback.txt). agy-staff also
# gets the agy sign-in (--agy-auth-dir). Judge keys and Anthropic credentials never reach Harbor.
# Exit codes: 2 usage or setup error, 3 leak scan hit, 4 egress check failed (with --expect-egress).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

MODEL=gpt-6.1-sol:xhigh
help() {
  cat <<EOF
run-codex.sh: run one Harbor trial with Codex as the host, then leak-scan the job.

usage: run-codex.sh [options] <setup> <task> [job-suffix]
  setup       solo | native (Codex subagents on GPT-6 Luna) | agy-staff (told to use \$agy:lead);
              oracle | nop: the gold patch and no change, the task checks select-tasks.py reads
  task        an instance_id for SWE-bench Verified, or <dataset>/<task-name> for swe-atlas-qna and
              deepsearchqa, baked first with bake-task.sh (bench/tasks/v1-plan.txt lists the v1 tasks)
  job-suffix  run tag and repetition, e.g. s61x-r1, or s61x-r1-rerun1 for an infrastructure rerun
              (default: a timestamp). The job is <data>/jobs/codex-<setup>-<task-name>-<job-suffix>.
              Harbor keeps a finished trial of an existing job instead of running it again, so a new
              attempt needs a new suffix.

options:
  --model MODEL:EFFORT  host model and reasoning effort (default: $MODEL)
$COMMON_USAGE

examples:
  run-codex.sh --dry-run agy-staff swe-atlas-qna/task-6905333b74f22949d97baa04 s61x-r1
  run-codex.sh --data ~/agy-bench --proxy http://host.docker.internal:7890 \\
      --expect-egress ~/.agy-bench/expected-egress-ip solo django__django-12406 s61x-r1

$TRIAL_EXIT_CODES

$TRIAL_AGENT_NOTES
  - Codex may refresh its token during a trial, and the agent then writes the new auth.json back to
    --codex-auth (agent/auth-writeback.txt says unchanged, updated, or failed: ...). Run two Codex trials
    at once only as run-batch.py lanes, which stop when a token is refreshed.
EOF
}
usage() { usage_exit "${1:-2}"; }
ARGS=()
while [ $# -gt 0 ]; do
  common_opt "$1" "${2:-}"
  if [ "$OPT_SHIFT" -gt 0 ]; then shift "$OPT_SHIFT"; continue; fi
  case "$1" in
    --model)   MODEL="${2:?--model needs MODEL:EFFORT}"; shift 2 ;;
    -h|--help) usage 0 ;;
    -*)        echo "unknown option: $1" >&2; usage ;;
    *)         ARGS+=("$1"); shift ;;
  esac
done
# Two or three words; the host model is --model now, not a fourth word.
[ "${#ARGS[@]}" -ge 2 ] && [ "${#ARGS[@]}" -le 3 ] || usage
config_notice
SETUP="${ARGS[0]}"; SUFFIX="${ARGS[2]:-$(date +%Y%m%d-%H%M%S)}"
HOST_MODEL="${MODEL%%:*}"; HOST_EFFORT="${MODEL#*:}"; [ "$HOST_EFFORT" = "$MODEL" ] && HOST_EFFORT=xhigh
require_data
task_paths "${ARGS[1]}" datasets-baked
[ -d "$TASK" ] || die "missing baked task: $TASK (run bake-task.sh first)"
JOB="codex-$SETUP-$NAME-$SUFFIX"
# SWE-bench keeps its templates at templates/codex/<setup>.j2; the other datasets in templates/codex/<dataset>/.
TEMPLATE_DIR="$BENCH/templates/codex"; [ "$DATASET" = swebench-verified ] || TEMPLATE_DIR="$TEMPLATE_DIR/$DATASET"

proxy_args
CODEX_AK=(-m "openai/$HOST_MODEL" --ak "version=$CODEX_VERSION" --ak "reasoning_effort=$HOST_EFFORT"
          --ak "prompt_template_path=$TEMPLATE_DIR/$SETUP.j2")
# Every Codex setup uses the same agent with auth.json write-back (agy-staff inherits it).
CODEX_AGENT=bench.harbor_agents.codex_writeback:CodexWriteback
case "$SETUP" in
  oracle|nop) AGENT=(-a "$SETUP"); CODEX_AK=(); PROXY_AE=() ;;
  solo)       AGENT=(-a "$CODEX_AGENT") ;;
  native)     AGENT=(-a "$CODEX_AGENT" --ak "config=$BENCH/configs/codex/native.toml") ;;
  agy-staff)  AGENT=(-a bench.harbor_agents.codex_agy_staff:CodexAgyStaff --ak "config=$BENCH/configs/codex/agy-staff.toml"
                     --artifact "$WORKDIR/.agy-staff" --artifact /root/.gemini/antigravity-cli/brain) ;;
  *) die "unknown setup: $SETUP" ;;
esac
case "$SETUP" in oracle|nop) ;; *) [ -f "$TEMPLATE_DIR/$SETUP.j2" ] || die "no template: $TEMPLATE_DIR/$SETUP.j2" ;; esac
# ${A[@]+"${A[@]}"} expands an empty array to nothing under set -u, also in macOS's bash 3.2.
HARBOR=(harbor run -p "$TASK" "${AGENT[@]}" ${CODEX_AK[@]+"${CODEX_AK[@]}"} ${PROXY_AE[@]+"${PROXY_AE[@]}"} ${DATASET_ARGS[@]+"${DATASET_ARGS[@]}"}
        -n 1 -r 0 -o "$DATA/jobs" --job-name "$JOB")
# The agents read these from Harbor's environment: the egress check (off when unset) and the agy sign-in.
ENV=(env -u all_proxy -u ALL_PROXY -u GEMINI_API_KEY -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL
     -u CLAUDE_CODE_OAUTH_TOKEN -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u AGY_BENCH_EXPECTED_EGRESS
     HARBOR_TELEMETRY=0 DOCKER_DEFAULT_PLATFORM=linux/amd64 PYTHONPATH="$REPO"
     CODEX_AUTH_JSON_PATH="$CODEX_AUTH" AGY_BENCH_AGY_AUTH_DIR="$AGY_AUTH_DIR")
[ -n "$EXPECT_EGRESS" ] && ENV+=(AGY_BENCH_EXPECTED_EGRESS="$EXPECT_EGRESS")
if [ "$DRY_RUN" = 1 ]; then echo "(cd $DATA)"; show_command "${ENV[@]}" "${HARBOR[@]}"; exit 0; fi

case "$SETUP" in oracle|nop) ;; *) [ -f "$CODEX_AUTH" ] || die "missing Codex auth.json: $CODEX_AUTH" ;; esac
EGRESS_URL=https://chatgpt.com/cdn-cgi/trace
egress_host "$EGRESS_URL" host-pre
cd "$DATA"
"${ENV[@]}" "${HARBOR[@]}" 2>&1 | harbor_filter || true
echo "job: $DATA/jobs/$JOB"

rc=0; leak_scan "$DATA/jobs/$JOB" || rc=$?
# Egress after the run on the host, plus the container checks the agent recorded (oracle/nop run no agent).
eg=0; ( egress_host "$EGRESS_URL" host-post ) || eg=4
case "$SETUP" in oracle|nop) ;; *) egress_container "$DATA/jobs/$JOB" || eg=4 ;; esac
[ "$rc" -ne 0 ] && exit "$rc"
exit "$eg"
