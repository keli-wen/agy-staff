#!/usr/bin/env bash
# Make a local copy of a Harbor task with the bench tools layer appended (fetch-tools.sh downloads the tools).
# The layer is identical for every orchestration setup and only adds files under /opt and /usr/local/bin;
# the repository, tests and verifier are untouched.
#   usage: bake-task.sh [options] <task>...
#   task:  <instance_id> for SWE-bench Verified, or <dataset>/<task-name> (swe-atlas-qna, deepsearchqa)
# Tasks are read from <data>/datasets/<dataset>/ and written to <data>/datasets-baked/<dataset>/.
# --claude writes to datasets-baked-claude/<dataset>/ instead and appends a Claude Code layer after the
# shared tools layer, so the Codex images stay exactly as they were for the Codex runs.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

CLAUDE=0; CLAUDE_ARCH=""; TASKS=()
help() {
  cat <<EOF
bake-task.sh: copy Harbor tasks and append the bench tools layer (Codex, Node, agy, agy-staff) to their
Dockerfiles. run-codex.sh runs the copies in <data>/datasets-baked/, run-claude.sh the --claude copies in
<data>/datasets-baked-claude/, which add a Claude Code layer. The repository, tests and verifier stay as
they are. Run it once per task, after fetch-tools.sh, and again when a tool or the plugin changes.

usage: bake-task.sh [options] <task>...
  task                an instance_id for SWE-bench Verified, or <dataset>/<task-name> for swe-atlas-qna and
                      deepsearchqa, read from <data>/datasets/

options:
  --data DIR          bench data directory (default: \$AGY_BENCH_DATA, else --data in ~/.agy-bench/config)
  --claude            bake for Claude Code: write datasets-baked-claude/ and add the Claude Code layer
  --claude-arch ARCH  arm64 | x64: the Claude Code build in that layer (default: the Docker engine's
                      architecture). arm64 runs the native musl build, which avoids a deadlock of the x64
                      build under Rosetta on Apple Silicon.
  --agy-staff REF     the agy-staff commit to bake, from tools/agy-staff-<commit> (default: $AGY_STAFF_REF,
                      the build v1 ran). A different plugin build makes a new bench version.
  -h, --help          show this help

examples:
  bake-task.sh django__django-12406 deepsearchqa/deepsearchqa-0190
  bake-task.sh --claude \$(awk '!/^#/ && NF {print \$2}' bench/tasks/v1-plan.txt | sort -u)

for agents:
  - Baking replaces the task's baked copy in the data directory; it never touches <data>/datasets/ or
    any job. It runs no model and reads no credential.
EOF
}
usage() { usage_exit "${1:-2}"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --data)        DATA="${2:?--data needs a directory}"; shift 2 ;;
    --claude)      CLAUDE=1; shift ;;
    --claude-arch) CLAUDE_ARCH="${2:?--claude-arch needs arm64 or x64}"; shift 2 ;;
    --agy-staff)   AGY_STAFF_REF="${2:?--agy-staff needs a commit}"; shift 2 ;;
    -h|--help)     usage 0 ;;
    -*)            echo "unknown option: $1" >&2; usage ;;
    *)             TASKS+=("$1"); shift ;;
  esac
done
[ "${#TASKS[@]}" -gt 0 ] || usage
config_notice
require_data
# A branch or tag names its commit, as in fetch-tools.sh, so the plugin directory and .bench-source name a commit.
REF=$(resolve_ref "$AGY_STAFF_REF" || true)
[ -n "$REF" ] || die "unknown agy-staff commit: $AGY_STAFF_REF"
AGY_STAFF_REF=$REF

TOOLS="$DATA/tools"
CODEX_PKG="$TOOLS/codex-pkg-$CODEX_VERSION/codex-package-x86_64-unknown-linux-musl.tar.gz"
NODE_TAR="$TOOLS/node/node-v$NODE_VERSION-linux-x64.tar.xz"
AGY_TAR="$TOOLS/agy-$AGY_VERSION/payload"
PLUGIN="$TOOLS/agy-staff-$AGY_STAFF_REF"
CLAUDE_DIR="$TOOLS/claude-code-$CLAUDE_VERSION"
for f in "$CODEX_PKG" "$NODE_TAR" "$AGY_TAR" "$PLUGIN"; do [ -e "$f" ] || die "missing $f (run fetch-tools.sh)"; done
if [ "$CLAUDE" = 1 ]; then
  if [ -z "$CLAUDE_ARCH" ]; then
    case "$(docker info --format '{{.Architecture}}' 2>/dev/null)" in
      aarch64|arm64) CLAUDE_ARCH=arm64 ;;
      x86_64|amd64)  CLAUDE_ARCH=x64 ;;
      *) die "could not read the Docker engine's architecture; pass --claude-arch arm64 or x64" ;;
    esac
  fi
  case "$CLAUDE_ARCH" in
    arm64) for f in linux-arm64-musl/claude arm64-musl-runtime/ld-musl-aarch64.so.1 arm64-musl-runtime/lib/libgcc_s.so.1 \
                    arm64-musl-runtime/lib/libstdc++.so.6; do
             [ -e "$CLAUDE_DIR/$f" ] || die "missing $CLAUDE_DIR/$f (run fetch-tools.sh --claude-arch arm64)"; done ;;
    x64)   [ -e "$CLAUDE_DIR/linux-x64/claude" ] || die "missing $CLAUDE_DIR/linux-x64/claude (run fetch-tools.sh --claude-arch x64)" ;;
    *)     die "--claude-arch must be arm64 or x64" ;;
  esac
fi

# Copy-on-write clone where the filesystem has one (APFS), a plain copy elsewhere.
clone() { cp -c "$1" "$2" 2>/dev/null || cp "$1" "$2"; }

bake() {
  local DATASET ID SRC DST E
  case "$1" in */*) DATASET="${1%%/*}"; ID="${1#*/}" ;; *) DATASET=swebench-verified; ID="$1" ;; esac
  SRC="$DATA/datasets/$DATASET/$ID"
  DST="$DATA/datasets-baked/$DATASET/$ID"; [ "$CLAUDE" = 1 ] && DST="$DATA/datasets-baked-claude/$DATASET/$ID"
  [ -d "$SRC" ] || die "missing task: $SRC"
  rm -rf "$DST" && mkdir -p "$(dirname "$DST")" && cp -R "$SRC" "$DST"
  E="$DST/environment"
  clone "$CODEX_PKG" "$E/codex-package.tar.gz"
  clone "$NODE_TAR" "$E/node.tar.xz"
  clone "$AGY_TAR" "$E/agy.tar.gz"
  cp -R "$PLUGIN" "$E/agy-staff"
  # Source commit of the plugin copy, read back by bench/harbor_agents/provenance.py.
  echo "$AGY_STAFF_REF" > "$E/agy-staff/.bench-source"
  cat >> "$E/Dockerfile" <<DOCKER

# --- agy-bench tools layer (identical for every orchestration setup) ---
# Codex $CODEX_VERSION official Linux package, Node v$NODE_VERSION, agy $AGY_VERSION (linux_amd64), agy-staff @ $AGY_STAFF_REF.
ADD codex-package.tar.gz /opt/codex/
ADD node.tar.xz /opt/
ADD agy.tar.gz /opt/agy/
COPY agy-staff /opt/agy-staff
ENV PATH="/opt/codex/bin:/opt/codex/codex-path:/opt/node-v$NODE_VERSION-linux-x64/bin:\${PATH}"
# No chmod here: the archives already carry 755/644 modes, and a chmod would make overlayfs
# copy every file into a new layer (+664 MB per task).
RUN ln -sf /opt/codex/bin/codex /usr/local/bin/codex \\
 && ln -sf /opt/codex/codex-path/rg /usr/local/bin/rg \\
 && ln -sf /opt/node-v$NODE_VERSION-linux-x64/bin/node /usr/local/bin/node \\
 && ln -sf /opt/agy/antigravity /usr/local/bin/agy \\
 && codex --version && node --version && agy --version
# Harbor keeps the container alive with \`sh -c "sleep infinity"\`; on images whose ENTRYPOINT is a
# shell (the SWE-Atlas images use /bin/bash) that becomes \`bash sh -c ...\` and exits at once.
# Harbor runs every command through docker exec, so the entrypoint is not needed.
ENTRYPOINT []
DOCKER
  if [ "$CLAUDE" = 1 ] && [ "$CLAUDE_ARCH" = arm64 ]; then
    clone "$CLAUDE_DIR/linux-arm64-musl/claude" "$E/claude"
    cp -R "$CLAUDE_DIR/arm64-musl-runtime" "$E/claude-arm64-runtime"
    cat >> "$E/Dockerfile" <<DOCKER

# --- Claude Code host layer (datasets-baked-claude only) ---
# Claude Code $CLAUDE_VERSION official linux-arm64-musl binary, run natively (not under Rosetta) with the arm64
# musl loader at its standard path and the C++ runtime found through /etc/ld-musl-aarch64.path. Harbor
# skips its own install when the version matches (--ak version=$CLAUDE_VERSION); the auto-updater is off so
# every trial runs the same build.
COPY claude /opt/claude-code/claude
COPY claude-arm64-runtime/ld-musl-aarch64.so.1 /lib/ld-musl-aarch64.so.1
COPY claude-arm64-runtime/lib /opt/claude-code/lib
ENV DISABLE_AUTOUPDATER=1
RUN echo /opt/claude-code/lib > /etc/ld-musl-aarch64.path \\
 && ln -sf /opt/claude-code/claude /usr/local/bin/claude && claude --version
DOCKER
  elif [ "$CLAUDE" = 1 ]; then
    clone "$CLAUDE_DIR/linux-x64/claude" "$E/claude"
    cat >> "$E/Dockerfile" <<DOCKER

# --- Claude Code host layer (datasets-baked-claude only) ---
# Claude Code $CLAUDE_VERSION official linux-x64 binary. Harbor skips its own install when the version matches
# (--ak version=$CLAUDE_VERSION); the auto-updater is off so every trial runs the same build.
COPY claude /opt/claude-code/claude
ENV DISABLE_AUTOUPDATER=1
RUN ln -sf /opt/claude-code/claude /usr/local/bin/claude && claude --version
DOCKER
  fi
  # A task with a prebuilt docker_image would make Harbor skip the Dockerfile (and the tools layer);
  # the Dockerfile already starts FROM that image, so drop the key from the baked copy.
  sed '/^docker_image[[:space:]]*=/d' "$DST/task.toml" > "$DST/task.toml.tmp"
  mv "$DST/task.toml.tmp" "$DST/task.toml"
  # swe-atlas-qna and deepsearchqa are graded offline (grade.py), but Harbor still refuses to start when
  # a [verifier.env] variable such as ${OPENAI_API_KEY} is unset, so drop that table from the copy.
  case "$DATASET" in
    swe-atlas-qna|deepsearchqa)
      awk '/^\[/{skip = ($0 == "[verifier.env]")} !skip' "$DST/task.toml" > "$DST/task.toml.tmp"
      mv "$DST/task.toml.tmp" "$DST/task.toml" ;;
  esac
  echo "baked: $DST"
}

for t in "${TASKS[@]}"; do bake "$t"; done
