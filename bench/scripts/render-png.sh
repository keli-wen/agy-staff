#!/usr/bin/env bash
# Render a results table SVG to the README PNG at 3x, e.g.
#   bench/scripts/render-png.sh bench/results/v2/summary.svg     (writes bench/results/v2/summary.png)
#
# Uses headless Chrome, not rsvg-convert: librsvg ignores the @font-face rules
# viz-svg.py embeds, so the table's numbers would fall back to the system sans.
set -euo pipefail
help() {
  echo "usage: render-png.sh <summary.svg> [out.png]   (default: the SVG's path with .png)"
  echo "  renders at 3x with headless Chrome or Chromium; set CHROME to pick the binary"
}
case "${1:-}" in -h|--help) help; exit 0 ;; "") help >&2; exit 2 ;; esac

svg=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
png=${2:-${svg%.svg}.png}
# Chrome or Chromium: $CHROME, else the macOS app, else the first one on PATH.
chrome=${CHROME:-}
if [ -z "$chrome" ]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" google-chrome chromium chromium-browser; do
    if [ -x "$c" ] || command -v "$c" >/dev/null 2>&1; then chrome=$c; break; fi
  done
fi
[ -n "$chrome" ] || { echo "no Chrome or Chromium found; set CHROME" >&2; exit 2; }
w=$(head -1 "$svg" | sed -E 's/^<svg[^>]* width="([0-9.]+)".*/\1/')
h=$(head -1 "$svg" | sed -E 's/^<svg[^>]* height="([0-9.]+)".*/\1/')

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp "$svg" "$tmp/t.svg"
printf '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}img{display:block;width:%spx;height:%spx}</style><img src="t.svg">' \
  "$w" "$h" > "$tmp/page.html"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=3 \
  --window-size="$w,$h" --screenshot="$png" "file://$tmp/page.html" 2>/dev/null
file "$png"
