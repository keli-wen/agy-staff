#!/usr/bin/env bash
# Render assets/design.svg to a high-resolution PNG (3x the 920x448 viewBox).
#
# The README embeds the PNG rather than the SVG: GitHub sanitizes SVGs it
# renders, and design.svg carries the Antigravity mark as an embedded
# `data:image/png;base64` image that the sanitizer can drop.
#
# Requires librsvg (`brew install librsvg`).
set -euo pipefail

cd "$(dirname "$0")/.."
rsvg-convert -w 2760 -h 1344 -b white assets/design.svg -o assets/design.png
echo "wrote assets/design.png ($(rsvg-convert --version))"
