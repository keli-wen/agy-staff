#!/usr/bin/env python3
"""The figures of a bench version, as SVGs for the READMEs (render-png.sh makes the PNGs).

  usage: viz-svg.py <data.json> [--out DIR] [--bench vN] [--version V] [--charts]
         e.g. viz-svg.py bench/results/v2/data.json --charts   (writes bench/results/v2/*.svg)
  --out      where the SVGs go (default: the directory of data.json)
  --bench    the bench version in the titles (default: that directory's name, e.g. v2)
  --version  the agy-staff version to show (default: the latest in data.json)
  --charts   also draw the charts; without it, only the table

summary.svg is the headline table: every benchmark, both hosts, three setups (resolved, host cost,
host + worker cost with the change vs solo, median time), from data.json's aggregates and trial audit flags (viz-data.py).
The charts share its card and its grid: cost.svg and tokens.svg stack the host's and the worker's share
per trial in the table's columns; pareto.svg plots tasks solved against host and total cost per trial.
Brand marks come from bench/viz/logos.json (taken from the repo's assets/); the card follows assets/design.svg.
Text is measured with a width table, not a browser, so labels are placed with some slack.
The numbers are set in Source Serif 4, downloaded on first use (pinned to a google/fonts commit) and embedded
as a WOFF2 subset; the subset is built without timestamps, so the same data gives the same SVG.
"""

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

ROOT = Path(__file__).resolve().parent.parent
LOGOS = json.loads((ROOT / "viz" / "logos.json").read_text())
BENCH_ICON = ROOT.parent / "assets" / "logo" / "bench.svg"

FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, 'PingFang SC', sans-serif"
C = {"bg": "#FFFFFF", "ink": "#202124", "muted": "#5F6368", "grid": "#E8EAED", "border": "#DADCE0"}
HOSTS = {"Claude Code": {"color": "#D97757", "logo": "claude", "subagent": "Sonnet 5.5"},
         "Codex": {"color": "#202123", "logo": "codex", "subagent": "GPT-6 Luna"}}
SETUPS = ["solo", "native", "agy-staff"]
DATASETS = {"swebench-verified": "SWE-bench Verified", "swe-atlas-qna": "SWE-Atlas QnA", "deepsearchqa": "DeepSearchQA"}
# Versions not in data.json, shown in the table's notes: the agy CLI baked into every task image (bake-task.sh) and the
# Harbor release every job's lock.json records.
AGY_CLI, HARBOR = "1.3.0", "0.24.0"
# The table's numbers are set in Source Serif 4 (SIL OFL 1.1, from github.com/google/fonts). A GitHub README shows SVG as
# <img>, which loads no external fonts, so the face is subset to the glyphs used and embedded as WOFF2. The font file is
# not in the repository: font_file() downloads it into bench/viz/fonts/ (git-ignored) and checks its sha256.
FONTS_DIR = ROOT / "viz" / "fonts"
FONT_FILES = {
    "SourceSerif4.ttf": ("https://raw.githubusercontent.com/google/fonts/7b203a635ebe80801c80f29633d4fc467cd1214e/"
                         "ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf",
                         "97b2d4da6e3cb494b5a1e66ae176914d852ccabef49e0c02c0df25f3e39aca0b"),
}
NUM_FONTS = {
    "source-serif": {400: ("SourceSerif4.ttf", {"wght": 400, "opsz": 14}), 700: ("SourceSerif4.ttf", {"wght": 700, "opsz": 14})},
}
NUM_FONTS["source-serif-charts"] = NUM_FONTS["source-serif"]
NUM_GLYPHS = "0123456789$./%=+ minbaseline"
# The charts also print token counts (9.9M, 450K); the table keeps its own subset, so its SVG stays as published.
GLYPHS = {"source-serif": NUM_GLYPHS, "source-serif-charts": NUM_GLYPHS + "MK"}


def font_file(name):
    path = FONTS_DIR / name
    url, sha = FONT_FILES[name]
    if not path.is_file():
        print(f"downloading {name} from {url}", file=sys.stderr)
        FONTS_DIR.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=60) as r:
            path.with_suffix(".part").write_bytes(r.read())
        path.with_suffix(".part").rename(path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
        sys.exit(f"{path} does not match its pinned sha256; delete it to download it again")
    return path


def font_face(key):
    """@font-face rules for one NUM_FONTS entry, subset to its GLYPHS (tabular and lining figures kept)."""
    import base64
    import io
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    rules = []
    for weight, (fname, axes) in NUM_FONTS[key].items():
        # No timestamps: fontTools otherwise stamps head.modified with the current time, and the SVG changes every run.
        font = TTFont(font_file(fname), recalcTimestamp=False)
        if axes:
            have = {a.axisTag for a in font["fvar"].axes}
            font = instancer.instantiateVariableFont(font, {k: v for k, v in axes.items() if k in have})
        font.recalcTimestamp = False
        opts = subset.Options()
        opts.flavor, opts.layout_features = "woff2", ["tnum", "lnum", "kern"]
        sub = subset.Subsetter(opts)
        sub.populate(text=GLYPHS[key])
        sub.subset(font)
        buf = io.BytesIO()
        subset.save_font(font, buf, opts)
        rules.append(f"@font-face{{font-family:'num-{key}';font-weight:{weight};"
                     f"src:url(data:font/woff2;base64,{base64.b64encode(buf.getvalue()).decode()}) format('woff2')}}")
    return "<style>" + "".join(rules) + "</style>"


def tw(s, size, bold=False):
    """Approximate rendered width of s in px."""
    w = 0.0
    for ch in s:
        if ch in "il.,:;|!'()[] ":
            w += 0.28
        elif ch in "mwMW":
            w += 0.84
        elif ch.isupper():
            w += 0.65
        elif ch.isdigit() or ch in "$%+":
            w += 0.58
        elif ord(ch) > 0x2E80:
            w += 1.0
        else:
            w += 0.53
    return w * size * (1.05 if bold else 1.0)



def bench_mark():
    """The bench icon's pixels (16x16 viewBox) from assets/logo/bench.svg, pinned to its light palette: the table is always light."""
    s = BENCH_ICON.read_text()
    body = s[s.index("<g shape-rendering"):s.rindex("</g>") + 4]
    return body.replace('class="sh"', 'fill="#BDC1C6"').replace('class="ink"', f'fill="{C["ink"]}"')


class Fig:
    def __init__(self, h, label):
        self.h, self.label, self.parts, self.defs = h, label, [], set()

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=14, fill=C["muted"], weight=400, anchor="start", rotate=False):
        rot = f' transform="rotate(-90 {x:.1f} {y:.1f})"' if rotate else ""
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
                 f'text-anchor="{anchor}"{rot}>{escape(s)}</text>')

    def line(self, x1, y1, x2, y2, stroke, width=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width}"{d}/>')

    def logo(self, name, x, y, size):
        lg = LOGOS[name]
        if lg.get("defs"):
            self.defs.add(lg["defs"])
        self.add(f'<svg x="{x:.1f}" y="{y:.1f}" width="{size}" height="{size}" viewBox="{lg["viewBox"]}" '
                 f'shape-rendering="{"crispEdges" if name in ("agy", "lead-flag") else "auto"}">{lg["body"]}</svg>')


def wrap(s, size, maxw):
    lines, cur = [], ""
    for word in s.split(" "):
        nxt = f"{cur} {word}".strip()
        if cur and tw(nxt, size) > maxw:
            lines.append(cur)
            cur = word
        else:
            cur = nxt
    return lines + [cur]


MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"



# --- the card every figure shares ----------------------------------------------------------------------------
# Styled after assets/design.svg: dotted paper, blue corner marks, the bench icon leading the title block, a white
# card, mono labels, a dimension line, a centered key and two columns of notes. The table and the charts all use it.
TW, PX = 920, 40
BLUE, AGYBG, GREEN, RED, PAPER, FAINT = "#1A73E8", "#F5F8FF", "#188038", "#D93025", "#F8F9FA", "#9AA0A6"
AGY = "#4285F4"
COLS = [(h, s) for h in HOSTS for s in SETUPS]
CARD_X, CARD_W, LW = PX, TW - 2 * PX, 190
CW = (CARD_W - 24 - LW) / len(COLS)


def col_x(j):
    return CARD_X + 12 + LW + CW * j


def cx(j):
    return col_x(j) + CW / 2


def mono_w(s, size):
    return len(s) * size * 0.6


def mix(hex_color, toward, t):
    a = [int(hex_color[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(toward[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def tint(host):
    """The host's lighter step: its own subagents' share in the charts."""
    return mix(HOSTS[host]["color"], "#FFFFFF", 0.62)


def num_attr(num_font):
    numfam = f"'num-{num_font}', {FONT}" if num_font else FONT
    return f'font-family="{numfam}" style="font-variant-numeric:tabular-nums lining-nums"'


def draw_head(f, H, eyebrow, title, subtitle, version):
    """Paper, corner marks, and the title block: bench icon, eyebrow, title, one line on what is shown, the Harbor
    badge and the plugin version."""
    f.add(f'<rect x="0.75" y="0.75" width="{TW - 1.5}" height="{H - 1.5}" rx="8" fill="{PAPER}" stroke="{C["ink"]}" stroke-width="1.5"/>')
    f.add(f'<rect x="2" y="2" width="{TW - 4}" height="{H - 4}" rx="7" fill="url(#dots)"/>')
    for x, y in ((26, 26), (TW - 26, H - 26)):
        f.add(f'<g stroke="#4285F4" stroke-width="1.5" opacity="0.85"><line x1="{x - 6}" y1="{y}" x2="{x + 6}" y2="{y}"/>'
              f'<line x1="{x}" y1="{y - 6}" x2="{x}" y2="{y + 6}"/></g>')
    # the bench icon (4 px per cell, its art's left edge on the card's), then the title, one line on what is compared,
    # and the two badges: built on Harbor, plugin version
    f.add(f'<svg x="{PX - 4}" y="38" width="64" height="64" viewBox="0 0 16 16">{bench_mark()}</svg>')
    TX = PX + 76
    f.add(f'<text x="{TX}" y="44" font-size="12.5" font-weight="700" fill="{BLUE}" letter-spacing="1.6">{escape(eyebrow)}</text>')
    f.text(TX, 78, title, 28, C["ink"], 700)
    f.text(TX, 104, subtitle, 14)
    hb_w = tw("built on", 12) + 8 + 18 + 6 + tw("Harbor", 13, True) + 24
    hx = TW - PX - hb_w
    f.add(f'<rect x="{hx:.1f}" y="34" width="{hb_w:.1f}" height="26" rx="13" fill="#FFFFFF" stroke="{C["border"]}"/>')
    f.text(hx + 12, 51, "built on", 12)
    f.logo("harbor", hx + 12 + tw("built on", 12) + 8, 38, 18)
    f.text(hx + 12 + tw("built on", 12) + 32, 51.5, "Harbor", 13, C["ink"], 700)
    f.add(f'<text x="{TW - PX:.1f}" y="82" font-size="11.5" font-family="{MONO}" fill="{C["muted"]}" '
          f'text-anchor="end">agy-staff {escape(version)}</text>')


def draw_card(f, top, end):
    f.add(f'<rect x="{CARD_X}" y="{top}" width="{CARD_W}" height="{end - top}" rx="10" fill="#FFFFFF" '
          f'stroke="{C["border"]}" stroke-width="1.5"/>')


def draw_columns(f, card_top, body_top, body_end, runs):
    """The column head the table and the bar charts share: the + agy columns framed as agy's staff badge, a host
    group per host, and a head per setup."""
    f.line(CARD_X + 12, body_top - 8, CARD_X + CARD_W - 12, body_top - 8, C["ink"])
    # + agy columns: agy's staff badge, a blue frame with a clip on top
    for j, (h, s) in enumerate(COLS):
        if s != "agy-staff":
            continue
        bx, by = col_x(j) + 5, card_top + 76
        f.add(f'<rect x="{bx:.1f}" y="{by}" width="{CW - 10:.1f}" height="{body_end - by + 6:.1f}" rx="9" fill="{AGYBG}" '
              f'stroke="#4285F4" stroke-width="1.5"/>')
        f.add(f'<rect x="{cx(j) - 10:.1f}" y="{by - 6}" width="20" height="10" rx="2" fill="{C["ink"]}"/>'
              f'<rect x="{cx(j) - 5:.1f}" y="{by - 3}" width="10" height="3" fill="#E8EAED"/>')
    # host groups
    for gi, h in enumerate(HOSTS):
        run = next(r for r in runs if r["host"] == h)
        g0, g1 = col_x(3 * gi), col_x(3 * gi + 3)
        mid = (g0 + g1) / 2
        nw = 28 + tw(h, 16, True)
        f.logo(HOSTS[h]["logo"], mid - nw / 2, card_top + 18, 22)
        f.text(mid - nw / 2 + 29, card_top + 35, h, 16, C["ink"], 700)
        f.add(f'<text x="{mid:.1f}" y="{card_top + 54}" font-size="11.5" font-family="{MONO}" fill="{C["muted"]}" '
              f'text-anchor="middle">{escape("v" + run["cli"].split()[-1] + " · " + run["model"] + " · " + run["effort"])}</text>')
        f.add(f'<rect x="{g0 + 10:.1f}" y="{card_top + 63}" width="{g1 - g0 - 20:.1f}" height="3" rx="1.5" fill="{HOSTS[h]["color"]}"/>')
    # column heads: plain words; the agy mark appears only on the + agy columns, the point of the table
    iy = card_top + 98
    for j, (h, s) in enumerate(COLS):
        if s == "agy-staff":
            f.text(cx(j) - 13, iy, "+", 15, BLUE, 700, "middle")
            f.logo("agy", cx(j) - 4, iy - 16, 20)
            f.text(cx(j), iy + 18, "Gemini 3.8 Flash", 10.5, BLUE, 600, "middle")
            # the /agy:lead tag from assets/design.svg: how the host is told to reach agy
            tag_w = 8 + 10 + 5 + len("/agy:lead") * 10.5 * 0.6 + 8
            tx = cx(j) - tag_w / 2
            f.add(f'<rect x="{tx:.1f}" y="{iy + 27}" width="{tag_w:.1f}" height="18" rx="4" fill="#E8F0FE"/>')
            f.logo("lead-flag", tx + 8, iy + 31, 10)
            f.add(f'<text x="{tx + 23:.1f}" y="{iy + 40}" font-size="10.5" font-family="{MONO}" font-weight="700" '
                  f'fill="{BLUE}">/agy:lead</text>')
        else:
            f.text(cx(j), iy, "solo" if s == "solo" else "+ subagents", 13, C["ink"], 600, "middle")
            if s == "native":
                f.text(cx(j), iy + 18, HOSTS[h]["subagent"], 10.5, C["muted"], 400, "middle")


def draw_section_title(f, y, ds, n):
    f.text(CARD_X + 16, y + 28, DATASETS[ds], 15, C["ink"], 700)
    f.add(f'<text x="{CARD_X + 26 + tw(DATASETS[ds], 15, True) * 1.04:.1f}" y="{y + 28}" font-size="11.5" '
          f'font-family="{MONO}" fill="{C["muted"]}">{n} tasks</text>')


def draw_chart_title(f, y, ds, n):
    """A benchmark's name over its task count, in the label column: the chart sits beside it, not below."""
    f.text(CARD_X + 16, y + 28, DATASETS[ds], 15, C["ink"], 700)
    f.add(f'<text x="{CARD_X + 16}" y="{y + 47}" font-size="11.5" font-family="{MONO}" fill="{C["muted"]}">{n} tasks</text>')


def notes_layout(notes):
    col_w = (CARD_W - 28) / 2
    note_rows = [wrap(f"{k} {v}", 12, col_w - 16) for k, v in notes]
    row_lines = [max(len(note_rows[i]), len(note_rows[i + 1]) if i + 1 < len(note_rows) else 0) for i in range(0, len(note_rows), 2)]
    return note_rows, row_lines, sum(n * 17 + 12 for n in row_lines)


def draw_key(f, y, key):
    """One centered legend row: [(glyph width, draw(x), label)]."""
    mid = TW / 2
    widths = [gw + tw(label, 12) for gw, _, label in key]
    x = mid - (sum(widths) + 22 * (len(key) - 1)) / 2
    for (gw, draw, label), wd in zip(key, widths):
        draw(x)
        f.text(x + gw, y, label, 12)
        x += wd + 22


def draw_footer(f, dim_y, key_y, notes_y, dim, key, notes, note_rows, row_lines):
    """The dimension line, the key centered under it, and the notes: short items, two columns, bold term first.
    key: [(glyph width, draw(x), label)]."""
    dw = mono_w(dim, 12) + 28
    mid = TW / 2
    f.add(f'<g stroke="{C["muted"]}" stroke-width="1"><line x1="{PX}" y1="{dim_y}" x2="{mid - dw / 2:.1f}" y2="{dim_y}"/>'
          f'<line x1="{mid + dw / 2:.1f}" y1="{dim_y}" x2="{TW - PX}" y2="{dim_y}"/>'
          f'<line x1="{PX}" y1="{dim_y - 5}" x2="{PX}" y2="{dim_y + 5}"/><line x1="{TW - PX}" y1="{dim_y - 5}" x2="{TW - PX}" y2="{dim_y + 5}"/></g>')
    f.add(f'<text x="{mid}" y="{dim_y + 4}" font-size="12" font-family="{MONO}" fill="{C["muted"]}" text-anchor="middle">{escape(dim)}</text>')
    draw_key(f, key_y, key)
    col_w = (CARD_W - 28) / 2
    yy = notes_y
    for r0 in range(0, len(note_rows), 2):
        for c in range(2):
            i = r0 + c
            if i >= len(note_rows):
                continue
            nx = PX + c * (col_w + 28)
            term = notes[i][0]
            f.add(f'<rect x="{nx:.1f}" y="{yy - 8}" width="6" height="6" fill="#4285F4"/>')
            for li, ln in enumerate(note_rows[i]):
                if li == 0 and ln.startswith(term):
                    f.add(f'<text x="{nx + 14:.1f}" y="{yy:.1f}" font-size="12" fill="{C["muted"]}"><tspan font-weight="700" '
                          f'fill="{C["ink"]}">{escape(term)}</tspan>{escape(ln[len(term):])}</text>')
                else:
                    f.text(nx + 14, yy + li * 17, ln, 12)
        yy += row_lines[r0 // 2] * 17 + 12


def render(f, H, num_font):
    if num_font:
        f.defs.add(font_face(num_font))
    f.defs.add('<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">'
               '<rect x="8" y="8" width="1.4" height="1.4" fill="#E3E5E8"/></pattern>')
    body = "\n".join(f.parts)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{TW}" height="{H}" viewBox="0 0 {TW} {H}" role="img" '
            f'aria-label="{escape(f.label)}" font-family="{FONT}">\n<defs>{"".join(sorted(f.defs))}</defs>\n{body}\n</svg>\n')


def dimension(aggs, dss):
    n_tasks = sum(next(a["trials"] for a in aggs if a["dataset"] == d) for d in dss)
    return f"{n_tasks} tasks · {len(dss)} benchmarks · {len(HOSTS)} hosts × {len(SETUPS)} setups · 1 run each"


def versions_note(version):
    return ("Versions", f"agy-staff {version}, agy CLI {AGY_CLI} in every task image, Harbor {HARBOR}.")


def swatches(colors, size=8, gap=2):
    """A key glyph: one small square per color, side by side."""
    def draw(f, x, y):
        for i, col in enumerate(colors):
            f.add(f'<rect x="{x + i * (size + gap):.1f}" y="{y - size - 1:.1f}" width="{size}" height="{size}" rx="1.5" fill="{col}"/>')
    return len(colors) * (size + gap) + 4, draw


# --- the table -----------------------------------------------------------------------------------------------
def task_square(f, x, y, color, resolved=False, timed_out=False, issue=False):
    """Use the table's pixel squares for outcomes and reviewed answer-key issues.

    A solid red square is an issue; a hollow one is a timeout. When both apply,
    a red center inside the hollow square keeps both visible without a new glyph or color.
    """
    fill = RED if issue else (color if resolved else "#DADCE0")
    if timed_out:
        f.add(f'<rect x="{x + 0.6:.1f}" y="{y + 0.6:.1f}" width="4.8" height="4.8" fill="#FFFFFF" '
              f'stroke="{RED}" stroke-width="1.2"/>')
        if issue:
            f.add(f'<rect x="{x + 2:.1f}" y="{y + 2:.1f}" width="2" height="2" fill="{RED}"/>')
    else:
        f.add(f'<rect x="{x:.1f}" y="{y}" width="6" height="6" fill="{fill}"/>')


def summary_table(aggs, runs, version, bench, num_font="source-serif", *, trials, presentation=None):
    """The headline table: every benchmark, both hosts, three setups, in one image.

    Each column says what it is with marks, not words: the host alone; the host with two small copies of itself
    (its own subagents); the host + agy. Touches: a pixel strip per resolved cell (one square per task:
    solved, unsolved, or stopped by the time limit, with reviewed answer-key issues),
    the + agy columns framed as agy's staff badge, and
    both cost rows compared with the same host's solo (the baseline) as green / red arrows.
    """
    presentation = presentation or {}
    get = {(a["dataset"], a["host"], a["setup"]): a for a in aggs}
    trial_groups = {}
    for t in trials:
        trial_groups.setdefault((t["dataset"], t["host"], t["setup"]), []).append(t)
    # Audit marks must be attached to the actual trial, including a trial that also timed out.
    # Refuse inconsistent inputs rather than rendering the marks against aggregate placeholders.
    for key, a in get.items():
        group = trial_groups.get(key, [])
        counts = {"trials": len(group), "resolved": sum(bool(t["resolved"]) for t in group),
                  "timeouts": sum(bool(t["timed_out"]) for t in group),
                  "rule_violations": sum(bool(t.get("rule_violation")) for t in group),
                  "answer_key_contaminations": sum(bool(t.get("answer_key_contamination")) for t in group)}
        for field, n in counts.items():
            if a.get(field, 0) != n:
                raise ValueError(f"{key}: aggregate {field}={a.get(field, 0)} differs from trial count {n}")
        group.sort(key=lambda t: (not t["resolved"], bool(t["timed_out"]), t["task"], t["rep"]))
    dss = [d for d in DATASETS if any(a["dataset"] == d for a in aggs)]
    num = num_attr(num_font)

    def delta(v, base, accent):
        d = (v / base - 1) * 100
        if abs(d) < 0.5:
            return f'<tspan fill="{C["muted"]}">= baseline</tspan>'
        fill = (GREEN if d < 0 else RED) if accent else "#80868B"
        return f'<tspan fill="{fill}">{"▼" if d < 0 else "▲"} {abs(d):.0f}%</tspan>'

    sec_h, ROWS = 40, (46, 44, 44, 32)
    card_top = 126
    body_top = card_top + 160
    body_end = body_top + len(dss) * (sec_h + sum(ROWS))
    card_end = body_end + 16
    timeouts = [(a["host"], a["setup"], a["dataset"], a["timeouts"]) for a in aggs if a["timeouts"]]
    notes = [
        ("Resolved", "SWE-bench by its tests. QnA and DeepSearchQA only when both judges pass (Gemini 3.8 Flash, DeepSeek V4 Pro)."),
        ("Host $", "what the host model itself uses, at API list price: the part that comes out of your Claude or ChatGPT plan."),
        ("Total $", "host + worker. Subagents bill the host's plan; agy is priced at Gemini list price but runs on agy's own quota."),
        ("+ agy", "the prompt asks the host to use agy lead (/agy:lead), and lead picks which agy job to run."),
    ]
    if timeouts:
        limit = ", ".join(f"{h} {n}" for h, s, d, n in timeouts)
        sets = sorted({DATASETS[d] for h, s, d, n in timeouts})
        notes.append(("Time limit", f"{' and '.join(sets)} stops a trial at 30 min. {sum(n for *_, n in timeouts)} + agy trials hit it "
                                    f"({limit}) and count as unsolved."))
    audited = any(a.get("rule_violations") or a.get("answer_key_contaminations") for a in aggs)
    notes.append(versions_note(version))
    if audited:
        notes.append(("Answer-key issues", "solid red: confirmed rule violation or answer-content contamination. A red center with an outline means it also timed out. Raw grades stay in the counts."))
        if bench == "v1":
            notes.append(("Claude Code + agy · 0118", "agy downloaded and cited the answer table. The host discarded the result and timed out re-checking sources."))
    notes.extend(presentation.get("notes", []))
    note_rows, row_lines, notes_h = notes_layout(notes)
    dim_y = card_end + 32
    key_y = dim_y + 32
    notes_y = key_y + 34
    H = notes_y + notes_h + 14

    f = Fig(H, f"agy-staff Bench {bench}, a harness and orchestration bench: Claude Code and Codex, solo, with their own subagents, and with agy, on "
               f"{', '.join(DATASETS[d] for d in dss)}; resolved tasks, host cost, total cost and median time")
    eyebrow = "HARNESS & ORCHESTRATION BENCH" + (" · PREVIEW" if presentation.get("preview") else "")
    subtitle = presentation.get("subtitle", f"Claude Code and Codex on {len(dss)} benchmarks: solo, with their own subagents, and with agy.")
    draw_head(f, H, eyebrow, f"agy-staff Bench {bench}", subtitle, version)
    draw_card(f, card_top, card_end)
    draw_columns(f, card_top, body_top, body_end, runs)
    # body
    labels = [("resolved", None), ("host $", "your plan's quota"), ("total $", "host + worker"), ("median time", None)]
    y = body_top
    for k, ds in enumerate(dss):
        if k:
            f.line(CARD_X + 12, y, CARD_X + 12 + LW - 8, y, C["border"])
            for j in range(len(COLS)):
                if COLS[j][1] != "agy-staff":
                    f.line(col_x(j), y, col_x(j) + CW, y, C["border"])
        n = next(a["trials"] for a in aggs if a["dataset"] == ds)
        draw_section_title(f, y, ds, n)
        y += sec_h
        for ri, (label, sub) in enumerate(labels):
            base = y + (19 if ri < 3 else 21)
            f.add(f'<text x="{CARD_X + 28}" y="{base}" font-size="12.5" font-family="{MONO}" fill="{C["ink"]}">{label}</text>')
            if sub:
                f.text(CARD_X + 28, base + 16, sub, 11, FAINT)
            for j, (h, s) in enumerate(COLS):
                a = get.get((ds, h, s))
                if not a:
                    f.text(cx(j), base, "—", 14, "#BDC1C6", 400, "middle")
                    continue
                solo = get.get((ds, h, "solo"))
                if ri == 0:
                    f.add(f'<text x="{cx(j):.1f}" y="{base}" font-size="15" font-weight="700" fill="{C["ink"]}" '
                          f'text-anchor="middle" {num}>{a["resolved"]}/{a["trials"]}</text>')
                    sq, gap = 6, 2
                    sx = cx(j) - (a["trials"] * (sq + gap) - gap) / 2
                    for q, t in enumerate(trial_groups[ds, h, s]):
                        qx, qy = sx + q * (sq + gap), y + 28
                        violated = bool(t.get("rule_violation"))
                        contaminated = bool(t.get("answer_key_contamination"))
                        statuses = ["solved" if t["resolved"] else "not solved"]
                        if t["timed_out"]:
                            statuses.append("stopped at the time limit")
                        if violated:
                            statuses.append("confirmed rule violation: " + t["rule_violation"])
                        if contaminated:
                            statuses.append("confirmed answer-content contamination: " + t["answer_key_contamination"])
                        title = f'{h} / {s} / {t["task"]} / run {t["rep"]}: ' + "; ".join(statuses)
                        f.add(f'<g class="trial" data-job={quoteattr(t["job"])} data-resolved="{str(bool(t["resolved"])).lower()}" '
                              f'data-timeout="{str(bool(t["timed_out"])).lower()}" '
                              f'data-rule-violation="{str(violated).lower()}" data-contamination="{str(contaminated).lower()}">'
                              f'<title>{escape(title)}</title>')
                        task_square(f, qx, qy, HOSTS[h]["color"], t["resolved"], t["timed_out"], violated or contaminated)
                        f.add('</g>')
                    continue
                if ri == 3:
                    f.add(f'<text x="{cx(j):.1f}" y="{base}" font-size="14" fill="{C["ink"]}" text-anchor="middle" {num}>'
                          f'{a["median_minutes"]:.1f} min</text>')
                    continue
                key = "host_cost_per_trial" if ri == 1 else "total_cost_per_trial"
                f.add(f'<text x="{cx(j):.1f}" y="{base}" font-size="14" fill="{C["ink"]}" text-anchor="middle" {num}>${a[key]:.2f}</text>')
                if s == "solo":
                    f.text(cx(j), base + 16, "baseline", 10.5, FAINT, 400, "middle")
                elif solo:
                    f.add(f'<text x="{cx(j):.1f}" y="{base + 16}" font-size="11" font-weight="700" text-anchor="middle" {num}>'
                          f'{delta(a[key], solo[key], s == "agy-staff")}</text>')
            y += ROWS[ri]

    def square(color):
        return lambda x: f.add(f'<rect x="{x:.1f}" y="{key_y - 9}" width="6" height="6" fill="{color}"/>')

    def arrow(kind):
        return lambda x: f.add(f'<text x="{x:.1f}" y="{key_y}" font-size="11" font-weight="700" fill="{GREEN if kind == "down" else RED}">'
                               f'{"▼" if kind == "down" else "▲"}</text>')

    key = [
        (20, lambda x: f.add(f'<rect x="{x:.1f}" y="{key_y - 9}" width="6" height="6" fill="{HOSTS["Claude Code"]["color"]}"/>'
                             f'<rect x="{x + 8:.1f}" y="{key_y - 9}" width="6" height="6" fill="{HOSTS["Codex"]["color"]}"/>'), "solved"),
        (12, square("#DADCE0"), "not solved"),
        (12, lambda x: f.add(f'<rect x="{x + 0.6:.1f}" y="{key_y - 8.4}" width="4.8" height="4.8" fill="#FFFFFF" stroke="{RED}" stroke-width="1.2"/>'),
         "stopped at the time limit"),
        (14, arrow("down"), "cheaper than solo"),
        (14, arrow("up"), "costlier than solo"),
    ]
    if audited:
        key.insert(3, (12, square(RED), "rule violation / contamination"))
    draw_footer(f, dim_y, key_y, notes_y, dimension(aggs, dss), key, notes, note_rows, row_lines)
    return render(f, H, num_font)


# --- the charts ----------------------------------------------------------------------------------------------
TOKEN_KEYS = ("input", "cache_creation", "cache_read", "output")
CHART_FONT = "source-serif-charts"


def per_trial(a, kind):
    """(host, worker) per trial: USD for cost, tokens for tokens."""
    if kind == "cost":
        return a["host_cost_per_trial"], a["total_cost_per_trial"] - a["host_cost_per_trial"]
    n = a["trials"]
    return (sum(a["host_tokens"][k] for k in TOKEN_KEYS) / n, sum(a["worker_tokens"][k] for k in TOKEN_KEYS) / n)


def money(v):
    return f"${v:.2f}"


def mtok(v):
    return f"{v / 1e6:.1f}M" if v >= 1e5 else f"{v / 1e3:.0f}K"


def ticks_for(vmax, steps=(1, 2, 2.5, 5)):
    """Clean tick values from 0 to at most vmax, three or four of them."""
    import math
    raw = vmax / 4
    k = 10 ** math.floor(math.log10(raw))
    step = next(m * k for m in steps + (10,) if m * k >= raw)
    out, v = [], 0.0
    while v <= vmax + 1e-9:
        out.append(round(v, 10))
        v += step
    return out


def bar_path(x, y_top, w, h, round_top):
    """A bar segment: square at the bottom, a 4 px rounded data-end on top when it is the bar's last segment."""
    if h <= 0:
        return ""
    r = min(4, h, w / 2) if round_top else 0
    if not r:
        return f'<rect x="{x:.1f}" y="{y_top:.1f}" width="{w:.1f}" height="{h:.1f}"'
    yb = y_top + h
    return (f'<path d="M{x:.1f},{yb:.1f} V{y_top + r:.1f} Q{x:.1f},{y_top:.1f} {x + r:.1f},{y_top:.1f} '
            f'H{x + w - r:.1f} Q{x + w:.1f},{y_top:.1f} {x + w:.1f},{y_top + r:.1f} V{yb:.1f} Z"')


def bars_chart(aggs, runs, version, bench, kind, num_font=CHART_FONT):
    """Cost or tokens per trial: the table's grid, with a stacked bar in each cell. The host's share sits on the
    baseline in its brand color; the worker's share is stacked on top, 2 px apart: the host's lighter step for its
    own subagents, agy blue for agy. One scale for every benchmark, so the rows compare."""
    get = {(a["dataset"], a["host"], a["setup"]): a for a in aggs}
    dss = [d for d in DATASETS if any(a["dataset"] == d for a in aggs)]
    num = num_attr(num_font)
    fmt = money if kind == "cost" else mtok
    vmax = max(sum(per_trial(a, kind)) for a in aggs)
    ticks = ticks_for(vmax)
    top_v = vmax * 1.16  # room for the value over the tallest bar
    PT, PH, PB = 16, 124, 22
    card_top = 126
    body_top = card_top + 160
    body_end = body_top + len(dss) * (PT + PH + PB)
    card_end = body_end + 16
    if kind == "cost":
        title, sub = "Cost per trial", "What one trial costs at API list price: the host's share, with the worker's on top."
        notes = [
            ("Host $", "what the host model itself uses, at API list price: the part that comes out of your Claude or ChatGPT plan."),
            ("Worker $", "stacked on top. Subagents bill the host's plan; agy is priced at Gemini list price but runs on agy's own quota."),
            ("Per trial", "the mean over the benchmark's tasks, as in the table. The number over each bar is host + worker."),
            versions_note(version),
        ]
    else:
        title, sub = "Tokens per trial", "How many tokens one trial uses, cache reads included: the host's, with the worker's on top."
        notes = [
            ("Tokens", "input, cache writes, cache reads and output (reasoning included) of every model call. Cache reads dominate long agent runs."),
            ("Host", "the host model's tokens: they count against your Claude or ChatGPT plan."),
            ("Worker", "stacked on top. Subagents count against the host's plan; agy's tokens count against agy's own quota."),
            versions_note(version),
        ]
    note_rows, row_lines, notes_h = notes_layout(notes)
    dim_y = card_end + 32
    key_y = dim_y + 32
    notes_y = key_y + 34
    H = notes_y + notes_h + 14

    f = Fig(H, f"agy-staff Bench {bench}: {title.lower()} for Claude Code and Codex, solo, with their own subagents, and with agy, "
               f"on {', '.join(DATASETS[d] for d in dss)}; the host's share and the worker's")
    draw_head(f, H, f"AGY-STAFF BENCH {bench.upper()}", title, sub, version)
    draw_card(f, card_top, card_end)
    draw_columns(f, card_top, body_top, body_end, runs)
    BW = 24
    y = body_top
    for k, ds in enumerate(dss):
        if k:
            f.line(CARD_X + 12, y, CARD_X + 12 + LW - 8, y, C["border"])
            for j in range(len(COLS)):
                if COLS[j][1] != "agy-staff":
                    f.line(col_x(j), y, col_x(j) + CW, y, C["border"])
        n = next(a["trials"] for a in aggs if a["dataset"] == ds)
        draw_chart_title(f, y, ds, n)
        base = y + PT + PH
        scale = lambda v: v / top_v * (PH - 8)  # noqa: E731
        for t in ticks:
            ty = base - scale(t)
            if t:
                f.line(col_x(0) + 4, ty, col_x(len(COLS)) - 4, ty, C["grid"])
            f.add(f'<text x="{col_x(0) - 8:.1f}" y="{ty + 4:.1f}" font-size="10.5" font-family="{MONO}" fill="{FAINT}" '
                  f'text-anchor="end">{"$0" if kind == "cost" and not t else ("0" if not t else (f"${t:g}" if kind == "cost" else f"{t / 1e6:g}M"))}</text>')
        f.line(col_x(0) + 4, base, col_x(len(COLS)) - 4, base, "#BDC1C6")
        for j, (h, s) in enumerate(COLS):
            a = get.get((ds, h, s))
            if not a:
                f.text(cx(j), base - 8, "—", 14, "#BDC1C6", 400, "middle")
                continue
            hv, wv = per_trial(a, kind)
            x = cx(j) - BW / 2
            hh, wh = scale(hv), scale(wv)
            worker_col = AGY if s == "agy-staff" else tint(h)
            top = base - hh
            f.add(bar_path(x, top, BW, hh, round_top=wh < 0.5) + f' fill="{HOSTS[h]["color"]}"/>')
            if wh >= 0.5:
                wtop = top - 2 - wh
                f.add(bar_path(x, wtop, BW, wh, round_top=True) + f' fill="{worker_col}"/>')
                top = wtop
            f.add(f'<text x="{cx(j):.1f}" y="{top - 7:.1f}" font-size="12.5" font-weight="700" fill="{C["ink"]}" '
                  f'text-anchor="middle" {num}>{fmt(hv + wv)}</text>')
        y += PT + PH + PB

    def glyph(colors):
        gw, draw = swatches(colors)
        return gw, lambda x: draw(f, x, key_y)

    key = [
        (*glyph([HOSTS["Claude Code"]["color"], HOSTS["Codex"]["color"]]), "the host's own share"),
        (*glyph([tint("Claude Code"), tint("Codex")]), "its subagents' share"),
        (*glyph([AGY]), "agy's share"),
    ]
    draw_footer(f, dim_y, key_y, notes_y, dimension(aggs, dss), key, notes, note_rows, row_lines)
    return render(f, H, num_font)


def pareto_chart(aggs, runs, version, bench, num_font=CHART_FONT):
    """Tasks solved against cost per trial, one row per benchmark: host $ on the left, total $ (host + worker) on
    the right, on one log scale. Color is the host; the mark is the setup, as in the table: filled for solo, the
    host's lighter step for its own subagents, an agy-blue ring for + agy. A dashed line joins the setups no other
    setup beats on both cost and tasks solved."""
    import math
    dss = [d for d in DATASETS if any(a["dataset"] == d for a in aggs)]
    lo = min(min(a["host_cost_per_trial"] for a in aggs), 0.25) / 1.25
    hi = max(a["total_cost_per_trial"] for a in aggs) * 1.2
    xticks = [t for t in (0.1, 0.25, 0.5, 1, 2, 5) if lo <= t <= hi]
    card_top = 126
    head_h, RH = 66, 184
    body_top = card_top + head_h
    body_end = body_top + len(dss) * RH
    card_end = body_end + 8
    notes = [
        ("Solved", "the share of the benchmark's tasks: SWE-bench by its tests, QnA and DeepSearchQA when both judges pass."),
        ("Host $, total $", "per trial at API list price, on a log scale. Total adds the worker: subagents on the host's plan, agy on its own quota."),
        ("Frontier", "the setups no other setup beats on both cost and tasks solved, over both hosts. Up and to the left is better."),
        versions_note(version),
    ]
    note_rows, row_lines, notes_h = notes_layout(notes)
    dim_y = card_end + 32
    key_y = dim_y + 32
    notes_y = key_y + 34
    H = notes_y + notes_h + 14

    f = Fig(H, f"agy-staff Bench {bench}: tasks solved against cost per trial, host cost and total cost, for Claude Code and "
               f"Codex, solo, with their own subagents, and with agy, on {', '.join(DATASETS[d] for d in dss)}")
    draw_head(f, H, f"AGY-STAFF BENCH {bench.upper()}", "Solved vs cost",
              "Each setup's share of tasks solved against what one trial costs: up and to the left is better.", version)
    draw_card(f, card_top, card_end)
    px0, gap = col_x(0) + 14, 30
    pw = (CARD_X + CARD_W - 18 - px0 - gap) / 2
    panels = [("host $ per trial", "your plan's quota", "host_cost_per_trial"),
              ("total $ per trial", "host + worker", "total_cost_per_trial")]
    for pi, (label, sub, _) in enumerate(panels):
        x0 = px0 + pi * (pw + gap)
        f.add(f'<text x="{x0:.1f}" y="{card_top + 30}" font-size="12.5" font-family="{MONO}" fill="{C["ink"]}">{label}</text>')
        f.text(x0, card_top + 47, sub, 11, FAINT)
    f.line(CARD_X + 12, body_top - 8, CARD_X + CARD_W - 12, body_top - 8, C["ink"])

    def sx(v, x0):
        return x0 + (math.log(v) - math.log(lo)) / (math.log(hi) - math.log(lo)) * pw

    y = body_top
    for k, ds in enumerate(dss):
        if k:
            f.line(CARD_X + 12, y, CARD_X + CARD_W - 12, y, C["border"])
        group = [a for a in aggs if a["dataset"] == ds]
        draw_chart_title(f, y, ds, group[0]["trials"])
        top, bot = y + 24, y + RH - 36

        def sy(p):
            return bot - p * (bot - top)

        for pi, (_, _, field) in enumerate(panels):
            x0 = px0 + pi * (pw + gap)
            for p in (0, 0.5, 1):
                f.line(x0, sy(p), x0 + pw, sy(p), "#BDC1C6" if p == 0 else C["grid"])
                if pi == 0:
                    f.add(f'<text x="{x0 - 8:.1f}" y="{sy(p) + 4:.1f}" font-size="10.5" font-family="{MONO}" fill="{FAINT}" '
                          f'text-anchor="end">{int(p * 100)}%</text>')
            for t in xticks:
                tx = sx(t, x0)
                f.line(tx, top, tx, bot, C["grid"])
                f.add(f'<text x="{tx:.1f}" y="{bot + 16:.1f}" font-size="10.5" font-family="{MONO}" fill="{FAINT}" '
                      f'text-anchor="middle">${t:g}</text>')
            pts = [(a[field], a["resolved"] / a["trials"], a) for a in group]
            front = sorted((p for p in pts if not any(q is not p and q[0] <= p[0] and q[1] >= p[1] and (q[0] < p[0] or q[1] > p[1])
                                                      for q in pts)), key=lambda p: p[0])
            if len(front) > 1:
                d = " ".join(f'{"M" if i == 0 else "L"}{sx(c, x0):.1f},{sy(r):.1f}' for i, (c, r, _) in enumerate(front))
                f.add(f'<path d="{d}" fill="none" stroke="{FAINT}" stroke-width="1.5" stroke-dasharray="4 3"/>')
            # + agy first (its ring is the largest), then the smaller marks on top
            for c, r, a in sorted(pts, key=lambda p: SETUPS.index(p[2]["setup"]), reverse=True):
                mx, my, col = sx(c, x0), sy(r), HOSTS[a["host"]]["color"]
                if a["setup"] == "agy-staff":
                    f.add(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="10" fill="#FFFFFF" stroke="{AGY}" stroke-width="3"/>'
                          f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="5.5" fill="{col}"/>')
                elif a["setup"] == "native":
                    f.add(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="6" fill="{tint(a["host"])}" stroke="{col}" stroke-width="2"/>')
                else:
                    f.add(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="6.5" fill="{col}" stroke="#FFFFFF" stroke-width="2"/>')
        y += RH

    def dot(fill, stroke=None, sw=0, r=5):
        return 14, lambda x: f.add(f'<circle cx="{x + 5:.1f}" cy="{key_y - 4}" r="{r}" fill="{fill}"'
                                   + (f' stroke="{stroke}" stroke-width="{sw}"' if stroke else "") + "/>")

    key = [
        (*dot(HOSTS["Claude Code"]["color"]), "Claude Code"),
        (*dot(HOSTS["Codex"]["color"]), "Codex"),
        (*dot("#80868B"), "solo"),
        (*dot("#DADCE0", "#80868B", 2), "+ subagents"),
        (22, lambda x: f.add(f'<circle cx="{x + 7:.1f}" cy="{key_y - 4}" r="7" fill="#FFFFFF" stroke="{AGY}" stroke-width="2.5"/>'
                             f'<circle cx="{x + 7:.1f}" cy="{key_y - 4}" r="3.5" fill="#80868B"/>'), "+ agy"),
        (24, lambda x: f.add(f'<line x1="{x:.1f}" y1="{key_y - 4}" x2="{x + 18:.1f}" y2="{key_y - 4}" stroke="{FAINT}" '
                             f'stroke-width="1.5" stroke-dasharray="4 3"/>'), "frontier"),
    ]
    draw_footer(f, dim_y, key_y, notes_y, dimension(aggs, dss), key, notes, note_rows, row_lines)
    return render(f, H, None)


CHARTS = {"cost": lambda *a: bars_chart(*a, kind="cost"), "tokens": lambda *a: bars_chart(*a, kind="tokens"),
          "pareto": pareto_chart}


def main(argv):
    ap = argparse.ArgumentParser(
        description="Draw a bench version's figures from its data.json (viz-data.py): the results table, summary.svg,\n"
                    "and with --charts also cost.svg, tokens.svg and pareto.svg. Then render-png.sh makes the PNGs\n"
                    "the READMEs show.",
        epilog="""examples:
  viz-svg.py bench/results/v2/data.json --charts         writes summary, cost, tokens and pareto into bench/results/v2/
  viz-svg.py bench/results/v1/data.json --out /tmp/v1    redraws the v1 table elsewhere

for agents:
  - A published version is never edited: do not write into bench/results/v1/ or another published
    version's directory. The first run downloads the number font (pinned, about 1.2 MB).""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data", type=Path, help="the version's data.json (viz-data.py)")
    ap.add_argument("--out", type=Path, help="output directory (default: the directory of data.json)")
    ap.add_argument("--bench", help="bench version for the titles, e.g. v2 (default: the name of that directory)")
    ap.add_argument("--version", help="agy-staff version to show (default: the latest in data.json)")
    ap.add_argument("--charts", action="store_true", help="also draw cost.svg, tokens.svg and pareto.svg")
    args = ap.parse_args(argv)
    bench = args.bench or args.data.resolve().parent.name
    if not re.fullmatch(r"v\d+", bench):
        ap.error(f"cannot tell the bench version from {args.data}; pass --bench vN")
    out = args.out or args.data.resolve().parent
    doc = json.loads(args.data.read_text())
    version = args.version or doc["agy_staff_versions"][-1]
    runs = sorted((r for r in doc["runs"] if r["host"] in HOSTS), key=lambda r: list(HOSTS).index(r["host"]))
    out.mkdir(parents=True, exist_ok=True)
    aggs = [a for a in doc["aggregates"] if a["agy_staff"] == version and a["host"] in HOSTS]
    trials = [t for t in doc["trials"] if t["agy_staff"] == version and t["host"] in HOSTS]
    figures = {"summary": summary_table} | (CHARTS if args.charts else {})
    for name, draw in figures.items():
        kwargs = {"trials": trials, "presentation": doc.get("presentation")} if name == "summary" else {}
        (out / f"{name}.svg").write_text(draw(aggs, runs, version, bench, **kwargs))
    print(f"wrote {', '.join(f'{n}.svg' for n in figures)} to {out} (agy-staff Bench {bench}, agy-staff {version})", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
