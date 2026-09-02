#!/usr/bin/env python3
"""Generate the pixel-art README badges in assets/badges/.

Retro 8-bit chips: every glyph is a cluster of <rect>s from the 5x7 bitmap
font below (no font files, no fallback drift), stair-notched corners from a
path (no rx anywhere), a 2px hard offset shadow, and a 1px light outline so
the dark body keeps its silhouette on dark GitHub pages too. The style is
adapted from the badge generator in the author's token-history project.

Palette is the Gemini / Google brand system, not Anthropic's: Google blue
#4285F4, the Gemini heritage purple #9B72CB, Google yellow #FBBC04, and
Google greys for ink/paper/edges. The Antigravity arch sprite mirrors the
real logo's vertical gradient (warm apex over blue legs, sampled from the
official mark). Claude Code / Codex badges carry those products' own accent
colors for identification only.

Deterministic: same script -> same bytes. Python 3.9+, stdlib only.
Run from anywhere: `python3 scripts/gen_badges.py`.
"""

import pathlib

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "assets" / "badges"

# ----------------------------------------------------------- 5x7 bitmap font

GLYPHS = {
    "0": (".XXX.", "X...X", "X..XX", "X.X.X", "XX..X", "X...X", ".XXX."),
    "1": ("..X..", ".XX..", "..X..", "..X..", "..X..", "..X..", ".XXX."),
    "2": (".XXX.", "X...X", "....X", "...X.", "..X..", ".X...", "XXXXX"),
    "3": ("XXXXX", "....X", "...X.", "..XX.", "....X", "X...X", ".XXX."),
    "4": ("...X.", "..XX.", ".X.X.", "X..X.", "XXXXX", "...X.", "...X."),
    "5": ("XXXXX", "X....", "XXXX.", "....X", "....X", "X...X", ".XXX."),
    "6": ("..XX.", ".X...", "X....", "XXXX.", "X...X", "X...X", ".XXX."),
    "7": ("XXXXX", "....X", "...X.", "..X..", ".X...", ".X...", ".X..."),
    "8": (".XXX.", "X...X", "X...X", ".XXX.", "X...X", "X...X", ".XXX."),
    "9": (".XXX.", "X...X", "X...X", ".XXXX", "....X", "...X.", ".XX.."),
    "A": (".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"),
    "B": ("XXXX.", "X...X", "X...X", "XXXX.", "X...X", "X...X", "XXXX."),
    "C": (".XXX.", "X...X", "X....", "X....", "X....", "X...X", ".XXX."),
    "D": ("XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."),
    "E": ("XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"),
    "F": ("XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "X...."),
    "G": (".XXX.", "X...X", "X....", "X.XXX", "X...X", "X...X", ".XXXX"),
    "H": ("X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"),
    "I": ("XXX", ".X.", ".X.", ".X.", ".X.", ".X.", "XXX"),
    "J": (".XXXX", "...X.", "...X.", "...X.", "...X.", "X..X.", ".XX.."),
    "K": ("X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"),
    "L": ("X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"),
    "M": ("X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"),
    "N": ("X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"),
    "O": (".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."),
    "P": ("XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."),
    "Q": (".XXX.", "X...X", "X...X", "X...X", "X.X.X", "X..X.", ".XX.X"),
    "R": ("XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"),
    "S": (".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."),
    "T": ("XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."),
    "U": ("X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."),
    "V": ("X...X", "X...X", "X...X", "X...X", "X...X", ".X.X.", "..X.."),
    "W": ("X...X", "X...X", "X...X", "X.X.X", "X.X.X", "XX.XX", "X...X"),
    "X": ("X...X", "X...X", ".X.X.", "..X..", ".X.X.", "X...X", "X...X"),
    "Y": ("X...X", "X...X", ".X.X.", "..X..", "..X..", "..X..", "..X.."),
    "Z": ("XXXXX", "....X", "...X.", "..X..", ".X...", "X....", "XXXXX"),
    ".": ("..", "..", "..", "..", "..", "XX", "XX"),
    "/": ("....X", "...X.", "...X.", "..X..", ".X...", ".X...", "X...."),
    "-": ("....", "....", "....", "XXXX", "....", "....", "...."),
    " ": ("...", "...", "...", "...", "...", "...", "..."),
    "?": (".XXX.", "X...X", "....X", "...X.", "..X..", ".....", "..X.."),
}


def _glyph(ch):
    return GLYPHS.get(ch, GLYPHS["?"])


def _pw(text, u):
    """Pixel-text advance width: glyph columns + 1 column of spacing."""
    if not text:
        return 0
    return sum((len(_glyph(ch)[0]) + 1) * u for ch in text) - u


def _runs(pattern, x, y, u):
    """Rects for a bitmap pattern, horizontal runs merged per row."""
    rects = []
    for r, row in enumerate(pattern):
        c = 0
        while c < len(row):
            if row[c] == "X":
                c2 = c
                while c2 < len(row) and row[c2] == "X":
                    c2 += 1
                rects.append((x + c * u, y + r * u, (c2 - c) * u, u))
                c = c2
            else:
                c += 1
    return rects


def _prects(x, y, text, u):
    rects = []
    cx = x
    for ch in text:
        g = _glyph(ch)
        rects.extend(_runs(g, cx, y, u))
        cx += (len(g[0]) + 1) * u
    return rects


def _rects_svg(rects):
    return "".join('<rect x="{}" y="{}" width="{}" height="{}"/>'.format(*r)
                   for r in rects)


def _stair(x, y, w, h, n1, n2):
    """Closed path for a rectangle with two-step staircase corners (no rx)."""
    return ("M{ax},{y} H{bx} V{y2} H{cx} V{y1} H{x2} V{by1} H{cx} V{by2} "
            "H{bx} V{y3} H{ax} V{by2} H{dx} V{by1} H{x} V{y1} H{dx} V{y2} "
            "H{ax} Z").format(
        x=x, y=y, x2=x + w, y3=y + h,
        ax=x + n1, bx=x + w - n1, cx=x + w - n2, dx=x + n2,
        y1=y + n1, y2=y + n2, by1=y + h - n1, by2=y + h - n2)


# ------------------------------------------------------------------- palette

INK = "#202124"      # Google grey 900
PAPER = "#F8F9FA"    # Google grey 50
EDGE = "#BDC1C6"     # Google grey 400
BLUE = "#4285F4"     # Google / Gemini blue
PURPLE = "#9B72CB"   # Gemini heritage gradient purple
YELLOW = "#FBBC04"   # Google yellow
ARCH_APEX = "#DB863D"  # sampled from the official Antigravity mark (apex)
ARCH_LEGS = "#3289FC"  # sampled from the official Antigravity mark (legs)
CLAUDE = "#D97757"   # Claude Code product accent (identification only)
CODEX = "#7393FF"    # Codex product accent (identification only)

# ------------------------------------------------------------------- sprites

ARCH = (  # the Antigravity arch: warm apex fading into blue legs
    "....X....",
    "...XXX...",
    "..XXXXX..",
    "..XX.XX..",
    ".XX...XX.",
    ".XX...XX.",
    "XX.....XX",
    "XX.....XX",
)
ARCH_SPLIT = 3  # rows above this index wear the apex color

SPARKLE = (  # four-point Gemini sparkle
    "....X....",
    "....X....",
    "...XXX...",
    "..XXXXX..",
    "XXXXXXXXX",
    "..XXXXX..",
    "...XXX...",
    "....X....",
    "....X....",
)


def _sprite_svg(pattern, x, y, u, fill, rows=None):
    sub = [(r if rows is None or i in rows else "." * len(r))
           for i, r in enumerate(pattern)]
    return '<g fill="{}">{}</g>'.format(fill, _rects_svg(_runs(sub, x, y, u)))


# ----------------------------------------------------------------- the badge

U = 2               # glyph cell size: 10x14px caps, classic arcade scale
OH = 22             # outline height; +2px shadow = 24px total
N1, N2 = 4, 2       # stair notch steps
PAD_X, ICON_GAP, SEG_GAP, VPAD, RIGHT_PAD = 10, 6, 9, 7, 6
RECT_Y, RECT_H, TY = 3, 16, 4
SH = 2              # hard shadow offset


def badge(label, value, value_bg, value_fg, icons, aria, shadow_text=True):
    x = PAD_X
    icon_w = max((len(pat[0]) * iu for pat, _, iu, _ in icons), default=0)
    x_label = x + icon_w + ICON_GAP if icons else x
    vx = x_label + _pw(label, U) + SEG_GAP
    vw = _pw(value, U) + 2 * VPAD
    w = vx + vw + RIGHT_PAD

    out = []
    add = out.append
    add('<svg xmlns="http://www.w3.org/2000/svg" width="{}" height="{}" '
        'viewBox="0 0 {} {}" role="img" aria-label="{}">'.format(
            w, OH + SH, w, OH + SH, aria))
    add("<title>{}</title>".format(aria))
    add('<g shape-rendering="crispEdges">')
    # hard offset shadow, light outline, dark body
    add('<path fill="{}" d="{}"/>'.format(INK, _stair(SH, SH, w - SH, OH, N1, N2)))
    add('<path fill="{}" d="{}"/>'.format(EDGE, _stair(0, 0, w - SH, OH, N1, N2)))
    add('<path fill="{}" d="{}"/>'.format(
        INK, _stair(1, 1, w - SH - 2, OH - 2, N1, N2)))
    # value segment: plain rect inset in the dark body
    add('<rect fill="{}" x="{}" y="{}" width="{}" height="{}"/>'.format(
        value_bg, vx, RECT_Y, vw, RECT_H))
    # icon(s): per-entry row filter enables two-tone sprites
    for pat, fill, iu, rows in icons:
        iy = (OH - len(pat) * iu) // 2
        add(_sprite_svg(pat, x, iy, iu, fill, rows))
    # label (bitmap, light on dark), then value with a 1px drop for pop
    add('<g fill="{}">{}</g>'.format(
        PAPER, _rects_svg(_prects(x_label, TY, label, U))))
    if shadow_text:
        add('<g fill="{}" fill-opacity=".3">{}</g>'.format(
            INK, _rects_svg(_prects(vx + VPAD, TY + 1, value, U))))
    add('<g fill="{}">{}</g>'.format(
        value_fg, _rects_svg(_prects(vx + VPAD, TY, value, U))))
    add("</g>")
    add("</svg>")
    return "".join(out) + "\n"


SPECS = [
    ("powered-by-antigravity", "POWERED BY", "ANTIGRAVITY", BLUE, PAPER,
     [(ARCH, ARCH_APEX, 2, set(range(ARCH_SPLIT))),
      (ARCH, ARCH_LEGS, 2, set(range(ARCH_SPLIT, len(ARCH))))],
     "powered by: Antigravity", True),
    ("model-gemini-3-8-flash", "MODEL", "GEMINI 3.8 FLASH", PURPLE, PAPER,
     [(SPARKLE, BLUE, 2, None)],
     "model: Gemini 3.8 Flash", True),
    ("claude-code-plugin", "CLAUDE CODE", "PLUGIN", CLAUDE, PAPER, [],
     "Claude Code: plugin", True),
    ("codex-plugin", "CODEX", "PLUGIN", CODEX, PAPER, [],
     "Codex: plugin", True),
    ("license-mit", "LICENSE", "MIT", YELLOW, INK, [],
     "license: MIT", False),
]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for slug, label, value, vbg, vfg, icons, aria, shadow in SPECS:
        path = OUT_DIR / (slug + ".svg")
        path.write_text(badge(label, value, vbg, vfg, icons, aria, shadow))
        print("wrote", path)


if __name__ == "__main__":
    main()
