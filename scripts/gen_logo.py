#!/usr/bin/env python3
"""Generate the pixel logo variants in assets/logo/.

Four candidate lockups for the README masthead, built on the same bitmap
machinery as scripts/gen_badges.py (5x7 glyph font, merged rect runs, stair
corners, hard shadows) at logo scale:

  A pure-wordmark.svg  two-tone AGY-STAFF wordmark with a purple hyphen
  B bolt.svg           wordmark with a yellow lightning bolt for the hyphen
  C arch-lockup.svg    ink stair tile with the Antigravity arch + wordmark
  D id-card.svg        a tiny pixel employee ID card (arch photo, name line,
                       barcode) playing on the "staff" concept

Light/dark GitHub: ink and shadow colors flip via a prefers-color-scheme
media query inside each SVG; fixed hues (Google blue/purple/yellow/red and
the arch two-tone) hold on both. Deterministic, stdlib only.
Run from anywhere: `python3 scripts/gen_logo.py`.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from gen_badges import (  # noqa: E402
    ARCH, ARCH_APEX, ARCH_LEGS, ARCH_SPLIT, BLUE, EDGE, INK, PAPER, PURPLE,
    YELLOW, _pw, _prects, _rects_svg, _runs, _stair,
)

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "logo"

RED = "#D93025"
TINT = "#E8F0FE"

BOLT = ("...XX", "..XX.", ".XX..", "XXXXX", "..XX.", ".XX..", "XX...")

# CSS: .ink/.shadow flip with the color scheme; everything else is fixed.
STYLE = ("<style>.ink{fill:%s}.sh{fill:#BDC1C6}"
         "@media (prefers-color-scheme:dark){.ink{fill:#E8EAED}"
         ".sh{fill:#3C4043}}</style>" % INK)


def svg(w, h, aria, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            'viewBox="0 0 {w} {h}" role="img" aria-label="{aria}">'
            '<title>{aria}</title>{style}'
            '<g shape-rendering="crispEdges">{body}</g></svg>\n').format(
                w=w, h=h, aria=aria, style=STYLE, body=body)


def group(cls_or_fill, markup, cls=False):
    key = 'class' if cls else 'fill'
    return '<g {}="{}">{}</g>'.format(key, cls_or_fill, markup)


def arch_sprite(x, y, u):
    top = [(r if i < ARCH_SPLIT else "." * len(r)) for i, r in enumerate(ARCH)]
    bot = [(r if i >= ARCH_SPLIT else "." * len(r)) for i, r in enumerate(ARCH)]
    return (group(ARCH_APEX, _rects_svg(_runs(top, x, y, u)))
            + group(ARCH_LEGS, _rects_svg(_runs(bot, x, y, u))))


def wordmark(x, y, u, sh=None, hyphen="pixel"):
    """AGY-STAFF: AGY blue, hyphen purple (or a yellow bolt), STAFF ink.

    Returns (markup, width)."""
    parts = []
    agy_w = _pw("AGY", u)
    hy_w = _pw("-", u) if hyphen == "pixel" else (len(BOLT[0]) + 1) * u
    total = agy_w + u + hy_w + u + _pw("STAFF", u)
    if sh is not None:
        # single hard shadow behind the whole line
        shadow = (_prects(x, y, "AGY", u)
                  + _prects(x + agy_w + u + hy_w + u, y, "STAFF", u))
        if hyphen == "pixel":
            shadow += _prects(x + agy_w + u, y, "-", u)
        parts.append('<g class="sh" transform="translate({0},{0})">{1}</g>'
                     .format(sh, _rects_svg(shadow)))
    parts.append(group(BLUE, _rects_svg(_prects(x, y, "AGY", u))))
    hx = x + agy_w + u
    if hyphen == "pixel":
        parts.append(group(PURPLE, _rects_svg(_prects(hx, y, "-", u))))
    else:
        parts.append(group(YELLOW, _rects_svg(_runs(BOLT, hx, y, u))))
    sx = hx + hy_w + u
    parts.append(group("ink", _rects_svg(_prects(sx, y, "STAFF", u)), cls=True))
    return "".join(parts), total


def variant_a():
    u, sh, pad = 8, 3, 8
    body, w = wordmark(pad, pad, u, sh=sh)
    W, H = pad * 2 + w + sh, pad * 2 + 7 * u + sh
    return svg(W, H, "AGY-STAFF pixel wordmark", body)


def variant_b():
    u, sh, pad = 8, 3, 8
    body, w = wordmark(pad, pad, u, sh=sh, hyphen="bolt")
    W, H = pad * 2 + w + sh, pad * 2 + 7 * u + sh
    return svg(W, H, "AGY-STAFF pixel wordmark with lightning bolt", body)


def variant_c():
    u, pad = 6, 8
    tile = 64
    # ink stair tile with light outline (silhouette-safe on both themes)
    body = '<path class="sh" d="{}"/>'.format(
        _stair(pad + 3, pad + 3, tile, tile, 8, 4))
    body += '<path fill="{}" d="{}"/>'.format(
        EDGE, _stair(pad, pad, tile, tile, 8, 4))
    body += '<path fill="{}" d="{}"/>'.format(
        INK, _stair(pad + 2, pad + 2, tile - 4, tile - 4, 8, 4))
    au = 5  # arch 9x8 at 5px cells = 45x40 inside the 64 tile
    body += arch_sprite(pad + (tile - 9 * au) // 2, pad + (tile - 8 * au) // 2, au)
    wm, w = wordmark(pad + tile + 18, pad + (tile - 7 * u) // 2, u, sh=2)
    body += wm
    W = pad * 2 + tile + 18 + w + 4
    H = pad * 2 + tile + 3
    return svg(W, H, "AGY-STAFF lockup with Antigravity arch tile", body)


def variant_d():
    # employee ID card, landscape, hanging clip on top
    cw, ch = 232, 132
    ox, oy = 12, 22  # card origin
    body = []
    # lanyard clip: small ink stub + slot above the card
    body.append('<rect class="ink" x="{}" y="4" width="26" height="22" rx="0"/>'
                .format(ox + cw // 2 - 13))
    body.append('<rect class="sh" x="{}" y="9" width="14" height="5"/>'
                .format(ox + cw // 2 - 7))
    # card: shadow, light edge, white face with stair corners
    body.append('<path class="sh" d="{}"/>'.format(
        _stair(ox + 3, oy + 3, cw, ch, 10, 5)))
    body.append('<path fill="{}" d="{}"/>'.format(
        INK, _stair(ox, oy, cw, ch, 10, 5)))
    body.append('<path fill="#FFFFFF" d="{}"/>'.format(
        _stair(ox + 2, oy + 2, cw - 4, ch - 4, 10, 5)))
    # header stripe: blue-to-purple in two flat steps + slot punch
    body.append('<rect fill="{}" x="{}" y="{}" width="{}" height="10"/>'.format(
        BLUE, ox + 8, oy + 8, (cw - 16) // 2))
    body.append('<rect fill="{}" x="{}" y="{}" width="{}" height="10"/>'.format(
        PURPLE, ox + 8 + (cw - 16) // 2, oy + 8, (cw - 16) - (cw - 16) // 2))
    body.append('<rect fill="{}" x="{}" y="{}" width="22" height="6"/>'.format(
        TINT, ox + cw // 2 - 11, oy + 10))
    # photo: tinted square with the arch
    body.append('<rect fill="{}" x="{}" y="{}" width="52" height="52"/>'.format(
        TINT, ox + 12, oy + 30))
    body.append(arch_sprite(ox + 12 + (52 - 9 * 4) // 2,
                            oy + 30 + (52 - 8 * 4) // 2, 4))
    # name + role lines in bitmap type
    body.append(group(INK, _rects_svg(_prects(ox + 76, oy + 34, "AGY-STAFF", 3))))
    body.append(group(RED, _rects_svg(_prects(ox + 76, oy + 62, "WORKER", 2))))
    # barcode: deterministic pixel bars from the letters of the name
    bx, by = ox + 76, oy + 88
    for i, ch2 in enumerate("AGYSTAFFAGYSTAFF"):
        wbar = 2 + (ord(ch2) % 3) * 2
        body.append('<rect fill="{}" x="{}" y="{}" width="{}" height="24"/>'
                    .format(INK, bx, by, wbar))
        bx += wbar + 3
    W, H = cw + 27, ch + oy + 8
    return svg(W, H, "AGY-STAFF pixel employee ID card", "".join(body))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("pure-wordmark", variant_a), ("bolt", variant_b),
                     ("arch-lockup", variant_c), ("id-card", variant_d)):
        path = OUT / (name + ".svg")
        path.write_text(fn())
        print("wrote", path)


if __name__ == "__main__":
    main()
