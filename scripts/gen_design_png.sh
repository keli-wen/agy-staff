#!/usr/bin/env bash
# Render assets/design.svg to a high-resolution PNG (3x the 920x448 viewBox).
#
# The README embeds the PNG for consistent GitHub rendering.
#
# Requires librsvg (`brew install librsvg`).
set -euo pipefail

cd "$(dirname "$0")/.."
rsvg-convert -w 2760 -h 1344 -b white assets/design.svg -o assets/design.png
echo "wrote assets/design.png ($(rsvg-convert --version))"
