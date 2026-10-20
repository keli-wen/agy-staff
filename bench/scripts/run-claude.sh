#!/usr/bin/env bash
# Run one Harbor trial with Claude Code as the host on a task baked with --claude, then leak-scan the job.
#   usage: run-claude.sh [options] <setup> <task> [job-suffix]
#   setup: solo | native (every subagent forced onto Sonnet 5.5) | agy-staff
#   task:  <instance_id> for SWE-bench Verified, or <dataset>/<task-name> (swe-atlas-qna, deepsearchqa)
#   job:   claude-<setup>-<task-name>-<job-suffix>; put a run tag and the rep in the suffix, e.g. c55x-r1
# Auth: the user's own `claude setup-token` token (--claude-token, mode 600), read into this script's
# environment only (never argv or --ae, so it is not written to the job's config.json), with
# CLAUDE_FORCE_OAUTH=1 so Harbor drops any API key. The token does not refresh, so nothing is written back.
# agy-staff also gets the agy sign-in (--agy-auth-dir). Judge keys never reach Harbor.
# Tasks come from datasets-baked-claude (bake-task.sh --claude), whose image already has Claude Code;
# --ak version pins Harbor to the same version so it skips its own install.
# Exit codes: 2 usage or setup error, 3 leak scan hit, 4 egress check failed (with --expect-egress).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

MODEL=claude-opus-5-5:xhigh
help() {
  cat <<EOF
run-claude.sh: run one Harbor trial with Claude Code as the host, then leak-scan the job.

usage: run-claude.sh [options] <setup> <task> [job-suffix]
  setup       solo | native (every subagent forced onto Sonnet 5.5) | agy-staff (told to use /agy:lead)
  task        an instance_id for SWE-bench Verified, or <dataset>/<task-name> for swe-atlas-qna and
              deepsearchqa, baked first with bake-task.sh --claude (bench/tasks/v1-plan.txt lists the v1 tasks)
  job-suffix  run tag and repetition, e.g. c55x-r1, or c55x-r1-rerun1 for an infrastructure rerun
              (default: a timestamp). The job is <data>/jobs/claude-<setup>-<task-name>-<job-suffix>.
              Harbor keeps a finished trial of an existing job instead of running it again, so a new
              attempt needs a new suffix.

options:
  --model MODEL:EFFORT  host model and reasoning effort (default: $MODEL)
$COMMON_USAGE

examples:
  run-claude.sh --dry-run agy-staff deepsearchqa/deepsearchqa-0190 c55x-r1
  run-claude.sh --data ~/agy-bench --proxy http://host.docker.internal:7890 \\
      --expect-egress ~/.agy-bench/expected-egress-ip solo django__django-12406 c55x-r1

$TRIAL_EXIT_CODES

$TRIAL_AGENT_NOTES
  - The setup-token is the user's own (claude setup-token); only the user creates or copies it.
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
task_paths "${ARGS[1]}" datasets-baked-claude
[ -d "$TASK" ] || die "missing baked task: $TASK (run bake-task.sh --claude first)"
JOB="claude-$SETUP-$NAME-$SUFFIX"
# The Claude templates differ from the Codex ones only in the orchestration line.
TEMPLATE_DIR="$BENCH/templates/claude"; [ "$DATASET" = swebench-verified ] || TEMPLATE_DIR="$TEMPLATE_DIR/$DATASET"
[ -f "$TEMPLATE_DIR/$SETUP.j2" ] || die "no template for setup $SETUP: $TEMPLATE_DIR/$SETUP.j2"

proxy_args
CLAUDE_AK=(-m "anthropic/$HOST_MODEL" --ak "version=$CLAUDE_VERSION" --ak "reasoning_effort=$HOST_EFFORT"
           --ak "prompt_template_path=$TEMPLATE_DIR/$SETUP.j2")
case "$SETUP" in
  solo)      AGENT=(-a bench.harbor_agents.claude_guarded:ClaudeGuarded "${CLAUDE_AK[@]}") ;;
  # Like Codex's default_subagent_model (configs/codex/native.toml): every subagent runs the in-family worker.
  native)    AGENT=(-a bench.harbor_agents.claude_guarded:ClaudeGuarded "${CLAUDE_AK[@]}"
                    --ae CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5-5 --ae CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1) ;;
  agy-staff) AGENT=(-a bench.harbor_agents.claude_agy_staff:ClaudeAgyStaff "${CLAUDE_AK[@]}"
                    --artifact "$WORKDIR/.agy-staff" --artifact /root/.gemini/antigravity-cli/brain) ;;
  *) die "unknown setup: $SETUP" ;;
esac
# ${A[@]+"${A[@]}"} expands an empty array to nothing under set -u, also in macOS's bash 3.2.
HARBOR=(harbor run -p "$TASK" "${AGENT[@]}" ${PROXY_AE[@]+"${PROXY_AE[@]}"} ${DATASET_ARGS[@]+"${DATASET_ARGS[@]}"}
        -n 1 -r 0 -o "$DATA/jobs" --job-name "$JOB")
# Judge keys and any Anthropic API key stay on the host; only the setup-token reaches Harbor. The agents read
# the egress check (off when unset) and the agy sign-in from Harbor's environment.
ENV=(env -u all_proxy -u ALL_PROXY -u GEMINI_API_KEY -u DEEPSEEK_API_KEY -u DEEPSEEK_BASE_URL
     -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL -u AGY_BENCH_EXPECTED_EGRESS CLAUDE_FORCE_OAUTH=1
     HARBOR_TELEMETRY=0 DOCKER_DEFAULT_PLATFORM=linux/amd64 PYTHONPATH="$REPO" AGY_BENCH_AGY_AUTH_DIR="$AGY_AUTH_DIR")
[ -n "$EXPECT_EGRESS" ] && ENV+=(AGY_BENCH_EXPECTED_EGRESS="$EXPECT_EGRESS")
if [ "$DRY_RUN" = 1 ]; then echo "(cd $DATA; CLAUDE_CODE_OAUTH_TOKEN from $CLAUDE_TOKEN)"; show_command "${ENV[@]}" "${HARBOR[@]}"; exit 0; fi

{ [ -s "$CLAUDE_TOKEN" ] && [ "$(file_mode "$CLAUDE_TOKEN")" = 600 ]; } \
  || die "need $CLAUDE_TOKEN (mode 600) from claude setup-token"
EGRESS_URL=https://api.anthropic.com/cdn-cgi/trace
egress_host "$EGRESS_URL" host-pre

CLAUDE_CODE_OAUTH_TOKEN=$(tr -d '[:space:]' < "$CLAUDE_TOKEN"); export CLAUDE_CODE_OAUTH_TOKEN
cd "$DATA"
"${ENV[@]}" "${HARBOR[@]}" 2>&1 | harbor_filter || true
unset CLAUDE_CODE_OAUTH_TOKEN
echo "job: $DATA/jobs/$JOB"

# The leak scan also looks for the setup-token file's value.
rc=0; leak_scan "$DATA/jobs/$JOB" || rc=$?
eg=0; ( egress_host "$EGRESS_URL" host-post ) || eg=4
egress_container "$DATA/jobs/$JOB" || eg=4
[ "$rc" -ne 0 ] && exit "$rc"
exit "$eg"
