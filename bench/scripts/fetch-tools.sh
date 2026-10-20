#!/usr/bin/env bash
# Download the tools bake-task.sh puts into every task image, into <data>/tools, and check each one against
# its pinned checksum. Files already there are only checked, so it is safe to run again.
#   usage: fetch-tools.sh [options]
# The pins are the builds v1 ran (lib.sh has the versions). agy is the exception: its installer only serves
# the latest release, so agy 1.3.0 has to come from an archive you already have (--agy-archive).
set -euo pipefail
source "$(dirname "$0")/lib.sh"

CLAUDE_ARCH=auto; AGY_ARCHIVE=""
help() {
  cat <<EOF
fetch-tools.sh: put the tools bake-task.sh bakes into every task image into <data>/tools, at the versions
v1 ran, each checked against its pinned checksum: Codex $CODEX_VERSION, Node $NODE_VERSION, agy $AGY_VERSION,
agy-staff (exported from this repository), Claude Code $CLAUDE_VERSION and, for arm64, its musl runtime from
Alpine 3.20. A file that is already there is only checked, so it is safe to run again. A download is put in
place only after its checksum matches.

usage: fetch-tools.sh [options]

options:
  --data DIR            bench data directory (default: \$AGY_BENCH_DATA, else --data in ~/.agy-bench/config)
  --claude-arch ARCH    arm64 | x64 | none: the Claude Code build to fetch (default: the Docker engine's
                        architecture)
  --agy-archive FILE    agy $AGY_VERSION linux-x64 archive (cli_linux_x64.tar.gz). agy's installer only serves
                        the latest release, so this version cannot be downloaded; the file is copied in
                        only if its sha512 matches the pin.
  --agy-staff REF       agy-staff commit to export from this repository (default: $AGY_STAFF_REF); a branch or
                        tag is resolved to its commit
  -h, --help            show this help

examples:
  fetch-tools.sh --data ~/agy-bench --agy-archive ~/Downloads/cli_linux_x64.tar.gz
  fetch-tools.sh --claude-arch none          # Codex runs only

exit codes: 0 every tool is there and matches its pin; 2 something is missing or does not match (each one
is listed as MISSING, FAILED or MISMATCH)

for agents:
  - It downloads about 700 MB and never deletes or overwrites a tool that is there. A MISMATCH means a file
    differs from what v1 ran: tell the user; do not delete it or change a pin to make the check pass.
EOF
}
usage() { usage_exit "${1:-2}"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --data)        DATA="${2:?--data needs a directory}"; shift 2 ;;
    --claude-arch) CLAUDE_ARCH="${2:?--claude-arch needs arm64, x64 or none}"; shift 2 ;;
    --agy-archive) AGY_ARCHIVE="${2:?--agy-archive needs a file}"; shift 2 ;;
    --agy-staff)   AGY_STAFF_REF="${2:?--agy-staff needs a commit}"; shift 2 ;;
    -h|--help)     usage 0 ;;
    *)             echo "unknown option: $1" >&2; usage ;;
  esac
done
config_notice
require_data
TOOLS="$DATA/tools"
if [ "$CLAUDE_ARCH" = auto ]; then
  case "$(docker info --format '{{.Architecture}}' 2>/dev/null)" in
    aarch64|arm64) CLAUDE_ARCH=arm64 ;;
    x86_64|amd64)  CLAUDE_ARCH=x64 ;;
    *) die "could not read the Docker engine's architecture; pass --claude-arch arm64, x64 or none" ;;
  esac
fi

digest() {   # digest <256|512> <file>
  if command -v "sha$1sum" >/dev/null 2>&1; then "sha$1sum" "$2"; else shasum -a "$1" "$2"; fi | cut -d' ' -f1
}
FAILED=0
fail() { echo "$*" >&2; FAILED=1; }
# check <256|512> <file> <expected> [label]: true if the file matches its pin; a mismatch fails the run at the end.
check() {
  local label="${4:-${2#"$TOOLS"/}}"
  if [ "$(digest "$1" "$2")" = "$3" ]; then echo "ok       $label"; return 0; fi
  fail "MISMATCH $label (sha$1 differs from the pin)"; return 1
}
# place <file> <dest> [mode]: move a checked download into place.
place() { mkdir -p "$(dirname "$2")" && mv "$1" "$2" && { [ -z "${3:-}" ] || chmod "$3" "$2"; }; }
# fetch <url> <dest> <sha256> [mode]: check dest if it is there; else download, check, and only then put it in place.
fetch() {
  if [ -e "$2" ]; then check 256 "$2" "$3" || true; return 0; fi
  echo "get      $1"
  mkdir -p "$(dirname "$2")"
  if ! curl -fL --retry 3 --progress-bar -o "$2.part" "$1"; then
    rm -f "$2.part"; fail "FAILED   download of $1"; return 0
  fi
  if check 256 "$2.part" "$3" "${2#"$TOOLS"/}"; then place "$2.part" "$2" "${4:-}"; else rm -f "$2.part"; fi
}

# Codex: the official Linux package from the GitHub release.
fetch "https://github.com/openai/codex/releases/download/rust-v$CODEX_VERSION/codex-package-x86_64-unknown-linux-musl.tar.gz" \
  "$TOOLS/codex-pkg-$CODEX_VERSION/codex-package-x86_64-unknown-linux-musl.tar.gz" \
  340801565906a7028f6baaa9ab6853addaef221f0016a1417a7c1ffdd96c21f0 644

# Node: the official linux-x64 build (agy and the egress check's fallback use it inside the container).
fetch "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
  "$TOOLS/node/node-v$NODE_VERSION-linux-x64.tar.xz" \
  fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 644

# agy: the installer's manifest only names the latest release, so 1.3.0 comes from --agy-archive.
AGY_SHA512=f6f5e16f356ae8a345fd6ab265ad2a4e4dc8d0b7f4ac345249d0e250a06edd496677b8ac0193b258971feb7ccfbba2fccc2f482db1d62cc650498e352ef85280
AGY_DEST="$TOOLS/agy-$AGY_VERSION/payload"
if [ -e "$AGY_DEST" ]; then
  check 512 "$AGY_DEST" "$AGY_SHA512" || true
elif [ -z "$AGY_ARCHIVE" ]; then
  fail "MISSING  agy-$AGY_VERSION/payload: agy's installer serves only the latest release; pass --agy-archive
         with the agy $AGY_VERSION linux-x64 archive (cli_linux_x64.tar.gz). A newer agy is a new bench version."
elif check 512 "$AGY_ARCHIVE" "$AGY_SHA512" "agy-$AGY_VERSION/payload (from $AGY_ARCHIVE)"; then
  mkdir -p "$(dirname "$AGY_DEST")" && cp "$AGY_ARCHIVE" "$AGY_DEST.part" && place "$AGY_DEST.part" "$AGY_DEST" 644
fi

# agy-staff: the plugin at the pinned commit, exported from this repository. A branch or tag is resolved to its
# commit first, so the directory (and the provenance bake-task.sh records) always names a commit.
REF=$(resolve_ref "$AGY_STAFF_REF" || true)
[ -n "$REF" ] || die "unknown agy-staff commit: $AGY_STAFF_REF"
if [ ! -d "$TOOLS/agy-staff-$REF" ]; then
  rm -rf "$TOOLS/agy-staff-$REF.part" && mkdir -p "$TOOLS/agy-staff-$REF.part"
  git -C "$REPO" archive "$REF" | tar -x -C "$TOOLS/agy-staff-$REF.part"
  mv "$TOOLS/agy-staff-$REF.part" "$TOOLS/agy-staff-$REF"
fi
echo "ok       agy-staff-$REF"

# Claude Code: the official binaries; the checksums are the release manifest's.
CLAUDE_URL="https://downloads.claude.ai/claude-code-releases/$CLAUDE_VERSION"
CLAUDE_DIR="$TOOLS/claude-code-$CLAUDE_VERSION"
case "$CLAUDE_ARCH" in
  arm64)
    fetch "$CLAUDE_URL/linux-arm64-musl/claude" "$CLAUDE_DIR/linux-arm64-musl/claude" \
      b0bbc936a82930933d7d5645081050d5f827a946cf6abc6575383b777a0feec0 755
    # The arm64 musl loader and C++ runtime the musl build needs inside the amd64 task image, from Alpine 3.20.
    RT="$CLAUDE_DIR/arm64-musl-runtime"
    APK=https://dl-cdn.alpinelinux.org/alpine/v3.20/main/aarch64
    # file in the package, where it goes, sha256 of the file
    while read -r pkg src dst sum; do
      if [ -e "$RT/$dst" ]; then check 256 "$RT/$dst" "$sum" || true; continue; fi
      tmp=$(mktemp -d)
      echo "get      $APK/$pkg.apk"
      if curl -fL --retry 3 -s -o "$tmp/p.apk" "$APK/$pkg.apk" && tar -xzf "$tmp/p.apk" -C "$tmp" "$src" 2>/dev/null; then
        # keep the package's file mode (the loader and libstdc++ are 755, libgcc_s 644)
        if check 256 "$tmp/$src" "$sum" "${RT#"$TOOLS"/}/$dst"; then mkdir -p "$(dirname "$RT/$dst")" && cp -p "$tmp/$src" "$RT/$dst"; fi
      else
        fail "FAILED   $pkg.apk: not on the mirror any more? Alpine keeps only the latest release of a package"
      fi
      rm -rf "$tmp"
    done <<'PKGS'
musl-1.2.5-r3 lib/ld-musl-aarch64.so.1 ld-musl-aarch64.so.1 b4144363ac29c5b762604351a9f8f8d11c1f98f1676886d59a017fb3f6bac800
libgcc-13.2.1_git20240309-r1 usr/lib/libgcc_s.so.1 lib/libgcc_s.so.1 c8ae3477f1f9e16af032fe3a34764541b55ddb5abc83c4a50c7f18b3fdd4eb35
libstdc++-13.2.1_git20240309-r1 usr/lib/libstdc++.so.6.0.32 lib/libstdc++.so.6 b626ff6f60950cddabc0c71ee4c92fb09a15f6874802fd37f4515696752dbfb9
PKGS
    ;;
  x64)
    fetch "$CLAUDE_URL/linux-x64/claude" "$CLAUDE_DIR/linux-x64/claude" \
      24972e3bc859fab2b46ed4c1e51f7d6130f06d3bd550811a114640de3370d0de 755 ;;
  none) ;;
  *) die "--claude-arch must be arm64, x64 or none" ;;
esac

[ "$FAILED" = 0 ] || die "some tools are missing or do not match their pins"
echo "tools ready in $TOOLS"
