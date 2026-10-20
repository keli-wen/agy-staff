#!/usr/bin/env bash
# Check that this machine reaches a service from the expected egress IP (fail closed). The run scripts call
# it only with --expect-egress; on its own it is
#   usage: egress-check.sh <expected-ip-file> <cdn-cgi/trace URL> [label]
#   e.g.   egress-check.sh ~/.agy-bench/expected-egress-ip https://chatgpt.com/cdn-cgi/trace host-pre
# Asking the service's own Cloudflare trace endpoint measures the egress that requests to that domain
# actually use, even when a proxy routes by domain. Prints only match/mismatch and the Cloudflare location,
# never an IP. Exits 0 on a match and 4 otherwise, including a failed lookup or an empty expected-IP file.
set -uo pipefail
help() {
  echo "usage: egress-check.sh <expected-ip-file> <cdn-cgi/trace URL> [label]"
  echo "  exit 0 if the service sees the IP in the file, 4 otherwise. The run scripts call it with --expect-egress."
}
case "${1:-}" in -h|--help) help; exit 0 ;; "") help >&2; exit 2 ;; esac
EXP_FILE="$1"
URL="${2:?usage: egress-check.sh <expected-ip-file> <trace-url> [label]}"; LABEL="${3:-host}"
HOST="${URL#https://}"; HOST="${HOST%%/*}"
EXP=$(tr -d '[:space:]' 2>/dev/null < "$EXP_FILE") || EXP=""
[ -n "$EXP" ] || { echo "egress $LABEL ($HOST): no expected IP in $EXP_FILE" >&2; exit 4; }
BODY=""
for attempt in 1 2; do   # one retry, so a single dropped request does not stop a batch
  BODY=$(env -u all_proxy -u ALL_PROXY curl -fsS --max-time 20 "$URL" 2>/dev/null) && break
  BODY=""; [ "$attempt" = 1 ] && sleep 5
done
[ -n "$BODY" ] || { echo "egress $LABEL ($HOST): lookup failed" >&2; exit 4; }
IP=$(printf '%s\n' "$BODY" | sed -n 's/^ip=//p'); LOC=$(printf '%s\n' "$BODY" | sed -n 's/^loc=//p')
if [ -n "$IP" ] && [ "$IP" = "$EXP" ]; then echo "egress $LABEL ($HOST): match loc=$LOC"; exit 0; fi
echo "egress $LABEL ($HOST): MISMATCH loc=${LOC:-?}" >&2; exit 4
