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
  E bolt-gradient.svg  variant B with a simple warm-to-blue vertical step
  F bolt-rainbow.svg   variant B with the TRUE Antigravity 2D gradient
                       (spectral wheel sampled from the CLI's own pixel arch)
  G gemini-gradient.svg  variant B with the Gemini wordmark's horizontal
                       sweep (blue -> periwinkle -> violet -> mauve -> rose)
                       across the whole line, violet sparkle over the last F

arch-rainbow-sprite.svg is a standalone preview of the corrected pixel
arch, reconstructed cell-by-cell from the Antigravity CLI welcome screen
(the official pixel-art rendering of the logo).

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
    YELLOW, _glyph, _pw, _prects, _rects_svg, _runs, _stair,
)

OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "logo"

RED = "#D93025"
TINT = "#E8F0FE"

BOLT = ("...XX", "..XX.", ".XX..", "XXXXX", "..XX.", ".XX..", "XX...")

# CSS: .ink/.shadow flip with the color scheme; everything else is fixed.
STYLE = ("<style>.ink{fill:%s}.sh{fill:#BDC1C6}"
         "@media (prefers-color-scheme:dark){.ink{fill:#E8EAED}"
         ".sh{fill:#3C4043}}</style>" % INK)


def svg(w, h, aria, body, extra_style=""):
    style = STYLE.replace("</style>", extra_style + "</style>")
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            'viewBox="0 0 {w} {h}" role="img" aria-label="{aria}">'
            '<title>{aria}</title>{style}'
            '<g shape-rendering="crispEdges">{body}</g></svg>\n').format(
                w=w, h=h, aria=aria, style=style, body=body)


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


# Antigravity vertical gradient, stepped per glyph row (7 rows). Stops are
# the sampled logo colors; dark mode brightens only the warm rows, which
# otherwise lose punch on #0d1117.
GRAD_ROWS = ("ga", "ga", "gb", "gc", "gc", "gd", "gd")
GRAD_STYLE = (".ga{fill:#DB863D}.gb{fill:#E8975A}"
              ".gc{fill:#4285F4}.gd{fill:#3289FC}"
              "@media (prefers-color-scheme:dark){.ga{fill:#E8975A}"
              ".gb{fill:#F2A96C}}")


# ---- the TRUE Antigravity gradient -----------------------------------------
# Sampled from the CLI welcome screen's official pixel arch (cell centers of
# the 12x11 grid): a spectral wheel, not a two-tone. Green left leg rising
# through teal/aqua, a yellow-orange-red apex, and red falling through purple
# and violet into Google blue on the right leg.
RB = {
    "G": "#85C64E",  # green (left flank)
    "Y": "#D9B031",  # yellow (apex left)
    "O": "#F6912E",  # orange (apex)
    "R": "#EF5441",  # red / coral (apex right)
    "g": "#43AEAA",  # teal (left transition)
    "C": "#64B6F5",  # aqua (left leg bottom)
    "P": "#955FA5",  # purple (right transition)
    "V": "#6C73D8",  # violet-blue (right upper leg)
    "B": "#3D85FC",  # Google blue (right leg bottom)
}

# 12x11 corrected arch, following the CLI sprite's silhouette and scheme.
ARCH_RAINBOW = (
    ".....OO.....",
    "....YOOR....",
    "...GYOORR...",
    "...GGYORR...",
    "..GGg..PPP..",
    "..Ggg..VVP..",
    "..GgC..BVP..",
    "..gg....BV..",
    ".gCC....BBV.",
    ".gC......BB.",
    "CC........BB",
)


def rainbow_arch(x, y, u):
    """The corrected Antigravity pixel arch at cell size u."""
    by = {}
    for r, row in enumerate(ARCH_RAINBOW):
        for c, key in enumerate(row):
            if key != ".":
                by.setdefault(key, []).append(
                    '<rect x="{}" y="{}" width="{}" height="{}"/>'.format(
                        x + c * u, y + r * u, u, u))
    return "".join('<g fill="{}">{}</g>'.format(RB[k], "".join(v))
                   for k, v in sorted(by.items()))


# Per-letter row ramps mapping the same wheel onto AGY (7 glyph rows):
# A = the left leg (green -> teal -> aqua), G = the apex (yellow/orange ->
# blue), Y = the right leg (red -> purple -> violet -> blue).
RAINBOW_LETTER_ROWS = {
    "A": "GGGggCC",
    "G": "YYOOBBB",
    "Y": "RRRPPVB",
}


def rainbow_text(x, y, text, u):
    by = {}
    cx = x
    for ch in text:
        g = _glyph(ch)
        ramp = RAINBOW_LETTER_ROWS[ch]
        for r, row in enumerate(g):
            for c, bit in enumerate(row):
                if bit != "X":
                    continue
                key = ramp[r]
                # apex continuity: G's top rows ramp yellow -> orange
                # left-to-right, like the arch apex itself
                if ch == "G" and r < 2:
                    key = "Y" if c < 3 else "O"
                if True:
                    by.setdefault(key, []).append(
                        '<rect x="{}" y="{}" width="{}" height="{}"/>'.format(
                            cx + c * u, y + r * u, u, u))
        cx += (len(g[0]) + 1) * u
    return "".join('<g fill="{}">{}</g>'.format(RB[k], "".join(v))
                   for k, v in sorted(by.items()))


# ---- the Gemini wordmark sweep ---------------------------------------------
# Six stops sampled from vertical slices of the Gemini wordmark reference
# (body pixels only, sparkle excluded); the rose tip comes from the saturated
# pixels of the final letter. Applied per pixel column across the whole line.
GEM_STOPS = ("#609CE4", "#6495E7", "#6F8CDF", "#8782CE", "#9E7FBE", "#C36D82")
GEM_SPARKLE = "#888DD1"  # sampled from the sparkle above the Gemini "i"

SPARK_MINI = (  # 5x5 four-point star for masthead scale
    "..X..",
    ".XXX.",
    "XXXXX",
    ".XXX.",
    "..X..",
)


def gemini_line(x, y, u, bolt_after):
    """AGY + bolt + STAFF with the Gemini sweep per pixel column.

    bolt_after: index in the glyph sequence after which the bolt sits."""
    seq = "AGYSTAFF"
    widths = [len(_glyph(ch)[0]) for ch in seq]
    bolt_cols = len(BOLT[0])
    total_cols = sum(w + 1 for w in widths) + bolt_cols + 1 - 1
    by = {}
    def put(col, row, cx, cy):
        stop = GEM_STOPS[min(int(col * len(GEM_STOPS) / total_cols),
                             len(GEM_STOPS) - 1)]
        by.setdefault(stop, []).append(
            '<rect x="{}" y="{}" width="{}" height="{}"/>'.format(
                cx, cy, u, u))
    col = 0
    cx = x
    for idx, ch in enumerate(seq):
        g = _glyph(ch)
        for r, row in enumerate(g):
            for c, bit in enumerate(row):
                if bit == "X":
                    put(col + c, r, cx + c * u, y + r * u)
        cx += (len(g[0]) + 1) * u
        col += len(g[0]) + 1
        if idx == bolt_after:
            by.setdefault("BOLT", []).append((cx, y))
            cx += (bolt_cols + 1) * u
            col += bolt_cols + 1
    bolt_pos = by.pop("BOLT")[0]
    body = "".join('<g fill="{}">{}</g>'.format(k, "".join(v))
                   for k, v in sorted(by.items()))
    return body, bolt_pos, total_cols * u


def variant_g():
    u, sh, pad, head = 8, 3, 8, 17
    body_line, bolt_pos, line_w = gemini_line(pad, pad + head, u, bolt_after=2)
    # hard shadow for the whole line (letters only; bolt drawn on top)
    shadow = _prects(pad, pad + head, "AGY", u)
    sx = bolt_pos[0] + (len(BOLT[0]) + 1) * u
    shadow += _prects(sx, pad + head, "STAFF", u)
    body = '<g class="sh" transform="translate({0},{0})">{1}</g>'.format(
        sh, _rects_svg(shadow))
    body += body_line
    body += group(YELLOW, _rects_svg(_runs(BOLT, bolt_pos[0], pad + head, u)))
    # violet sparkle centered over the final F, Gemini-style dotted-i gesture
    spark_u = 3
    spark_x = pad + line_w - (5 * u + 5 * spark_u) // 2
    body += group(GEM_SPARKLE, _rects_svg(_runs(SPARK_MINI, spark_x, 0, spark_u)))
    W = pad * 2 + line_w + sh
    H = pad * 2 + head + 7 * u + sh
    return svg(W, H,
               "AGY-STAFF pixel wordmark, Gemini horizontal gradient sweep",
               body)


def variant_f():
    u, sh, pad = 8, 3, 8
    agy_w = _pw("AGY", u)
    bolt_w = (len(BOLT[0]) + 1) * u
    total = agy_w + u + bolt_w + u + _pw("STAFF", u)
    sx = pad + agy_w + u + bolt_w + u
    body = '<g class="sh" transform="translate({0},{0})">{1}</g>'.format(
        sh, _rects_svg(_prects(pad, pad, "AGY", u)
                       + _prects(sx, pad, "STAFF", u)))
    body += rainbow_text(pad, pad, "AGY", u)
    body += group(YELLOW, _rects_svg(_runs(BOLT, pad + agy_w + u, pad, u)))
    body += group("ink", _rects_svg(_prects(sx, pad, "STAFF", u)), cls=True)
    W, H = pad * 2 + total + sh, pad * 2 + 7 * u + sh
    return svg(W, H,
               "AGY-STAFF pixel wordmark, true Antigravity spectral gradient",
               body)


def arch_sprite_preview():
    u, pad = 10, 10
    body = rainbow_arch(pad, pad, u)
    W = pad * 2 + 12 * u
    H = pad * 2 + 11 * u
    return svg(W, H, "Corrected Antigravity pixel arch (CLI welcome-screen "
               "scheme)", body)


def banded_text(x, y, text, u, row_classes, dither_row=None):
    """Bitmap text with one fill class per glyph row.

    dither_row: optional row index rendered as a checkerboard of that row's
    class and the next row's class."""
    by_class = {}
    cx = x
    for ch in text:
        g = _glyph(ch)
        for r, row in enumerate(g):
            for c, bit in enumerate(row):
                if bit != "X":
                    continue
                cls = row_classes[r]
                if dither_row is not None and r == dither_row:
                    nxt = row_classes[min(r + 1, len(row_classes) - 1)]
                    cls = cls if (c + r) % 2 == 0 else nxt
                by_class.setdefault(cls, []).append(
                    '<rect x="{}" y="{}" width="{}" height="{}"/>'.format(
                        cx + c * u, y + r * u, u, u))
        cx += (len(g[0]) + 1) * u
    return "".join('<g class="{}">{}</g>'.format(cls, "".join(rects))
                   for cls, rects in sorted(by_class.items()))


def variant_e(dither=False):
    u, sh, pad = 8, 3, 8
    agy_w = _pw("AGY", u)
    bolt_w = (len(BOLT[0]) + 1) * u
    total = agy_w + u + bolt_w + u + _pw("STAFF", u)
    sx = pad + agy_w + u + bolt_w + u
    body = '<g class="sh" transform="translate({0},{0})">{1}</g>'.format(
        sh, _rects_svg(_prects(pad, pad, "AGY", u)
                       + _prects(sx, pad, "STAFF", u)))
    body += banded_text(pad, pad, "AGY", u, GRAD_ROWS,
                        dither_row=2 if dither else None)
    body += group(YELLOW, _rects_svg(_runs(BOLT, pad + agy_w + u, pad, u)))
    body += group("ink", _rects_svg(_prects(sx, pad, "STAFF", u)), cls=True)
    W, H = pad * 2 + total + sh, pad * 2 + 7 * u + sh
    return svg(W, H,
               "AGY-STAFF pixel wordmark, Antigravity gradient with bolt",
               body, extra_style=GRAD_STYLE)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("pure-wordmark", variant_a), ("bolt", variant_b),
                     ("arch-lockup", variant_c), ("id-card", variant_d),
                     ("bolt-gradient", variant_e), ("bolt-rainbow", variant_f),
                     ("gemini-gradient", variant_g),
                     ("arch-rainbow-sprite", arch_sprite_preview)):
        path = OUT / (name + ".svg")
        path.write_text(fn())
        print("wrote", path)


if __name__ == "__main__":
    main()
