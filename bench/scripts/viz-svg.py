#!/usr/bin/env python3
"""The results table of a bench version, as an SVG for the READMEs (render-png.sh makes the PNG).

  usage: viz-svg.py <data.json> [--out DIR] [--bench vN] [--version V]
         e.g. viz-svg.py bench/results/v2/data.json       (writes bench/results/v2/summary.svg)
  --out      where summary.svg goes (default: the directory of data.json)
  --bench    the bench version in the title (default: that directory's name, e.g. v2)
  --version  the agy-staff version to show (default: the latest in data.json)

summary.svg is the headline table: every benchmark, both hosts, three setups (resolved, host cost,
host + worker cost with the change vs solo, median time), from data.json's aggregates (viz-data.py).
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
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
LOGOS = json.loads((ROOT / "viz" / "logos.json").read_text())
BENCH_ICON = ROOT.parent / "assets" / "logo" / "bench.svg"

FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, 'PingFang SC', sans-serif"
C = {"bg": "#FFFFFF", "ink": "#202124", "muted": "#5F6368", "grid": "#E8EAED", "border": "#DADCE0"}
HOSTS = {"Claude Code": {"color": "#D97757", "logo": "claude", "subagent": "Sonnet 5.5"},
         "Codex": {"color": "#202123", "logo": "codex", "subagent": "GPT-6 Luna"}}
SETUPS = ["solo", "native", "agy-staff"]
DATASETS = {"swebench-verified": "SWE-bench Verified", "swe-atlas-qna": "SWE-Atlas QnA", "deepsearchqa": "DeepSearchQA"}
# Versions not in data.json, shown in the table's notes: the agy CLI baked into every task image (bake-task.sh) and Harbor.
AGY_CLI, HARBOR_COMMIT = "1.3.0", "3e30cca"
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
NUM_GLYPHS = "0123456789$./%=+ minbaseline"


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
    """@font-face rules for one NUM_FONTS entry, subset to NUM_GLYPHS (tabular and lining figures kept)."""
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
        sub.populate(text=NUM_GLYPHS)
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


def summary_table(aggs, runs, version, bench, num_font="source-serif"):
    """The headline table: every benchmark, both hosts, three setups, in one image.

    Styled after assets/design.svg (dotted ground, blue corner marks, mono labels, dimension line), with the bench
    icon leading the title block. Each
    column says what it is with marks, not words: the host alone; the host with two small copies of itself
    (its own subagents); the host + agy. Touches: a pixel strip per resolved cell (one square per task:
    solved, unsolved, or stopped by the time limit), the + agy columns framed as agy's staff badge, and
    both cost rows compared with the same host's solo (the baseline) as green / red arrows.
    """
    TW, PX = 920, 40
    cols = [(h, s) for h in HOSTS for s in SETUPS]
    get = {(a["dataset"], a["host"], a["setup"]): a for a in aggs}
    dss = [d for d in DATASETS if any(a["dataset"] == d for a in aggs)]
    BLUE, AGYBG, GREEN, RED, PAPER, FAINT = "#1A73E8", "#F5F8FF", "#188038", "#D93025", "#F8F9FA", "#9AA0A6"
    card_x, card_w = PX, TW - 2 * PX
    LW = 190
    cw = (card_w - 24 - LW) / len(cols)
    col_x = lambda j: card_x + 12 + LW + cw * j
    cx = lambda j: col_x(j) + cw / 2
    mono_w = lambda s, size: len(s) * size * 0.6
    numfam = f"'num-{num_font}', {FONT}" if num_font else FONT
    num = f'font-family="{numfam}" style="font-variant-numeric:tabular-nums lining-nums"'

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
    n_tasks = sum(next(a["trials"] for a in aggs if a["dataset"] == d) for d in dss)
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
    notes.append(("Versions", f"agy-staff {version}, agy CLI {AGY_CLI} in every task image, Harbor at commit {HARBOR_COMMIT}."))
    col_w = (card_w - 28) / 2
    note_rows = [wrap(f"{k} {v}", 12, col_w - 16) for k, v in notes]
    dim_y = card_end + 32
    key_y = dim_y + 32
    notes_y = key_y + 34
    row_lines = [max(len(note_rows[i]), len(note_rows[i + 1]) if i + 1 < len(note_rows) else 0) for i in range(0, len(note_rows), 2)]
    H = notes_y + sum(n * 17 + 12 for n in row_lines) + 14

    f = Fig(H, f"agy-staff Bench {bench}, a harness and orchestration bench: Claude Code and Codex, solo, with their own subagents, and with agy, on "
               f"{', '.join(DATASETS[d] for d in dss)}; resolved tasks, host cost, total cost and median time")
    f.add(f'<rect x="0.75" y="0.75" width="{TW - 1.5}" height="{H - 1.5}" rx="8" fill="{PAPER}" stroke="{C["ink"]}" stroke-width="1.5"/>')
    f.add(f'<rect x="2" y="2" width="{TW - 4}" height="{H - 4}" rx="7" fill="url(#dots)"/>')
    for x, y in ((26, 26), (TW - 26, H - 26)):
        f.add(f'<g stroke="#4285F4" stroke-width="1.5" opacity="0.85"><line x1="{x - 6}" y1="{y}" x2="{x + 6}" y2="{y}"/>'
              f'<line x1="{x}" y1="{y - 6}" x2="{x}" y2="{y + 6}"/></g>')
    # the bench icon (4 px per cell, its art's left edge on the card's), then the title, one line on what is compared,
    # and the two badges: built on Harbor, plugin version
    f.add(f'<svg x="{PX - 4}" y="38" width="64" height="64" viewBox="0 0 16 16">{bench_mark()}</svg>')
    TX = PX + 76
    f.add(f'<text x="{TX}" y="44" font-size="12.5" font-weight="700" fill="{BLUE}" letter-spacing="1.6">HARNESS &amp; ORCHESTRATION BENCH</text>')
    f.text(TX, 78, f"agy-staff Bench {bench}", 28, C["ink"], 700)
    f.text(TX, 104, f"Claude Code and Codex on {len(dss)} benchmarks: solo, with their own subagents, and with agy.", 14)
    hb_w = tw("built on", 12) + 8 + 18 + 6 + tw("Harbor", 13, True) + 24
    hx = TW - PX - hb_w
    f.add(f'<rect x="{hx:.1f}" y="34" width="{hb_w:.1f}" height="26" rx="13" fill="#FFFFFF" stroke="{C["border"]}"/>')
    f.text(hx + 12, 51, "built on", 12)
    f.logo("harbor", hx + 12 + tw("built on", 12) + 8, 38, 18)
    f.text(hx + 12 + tw("built on", 12) + 32, 51.5, "Harbor", 13, C["ink"], 700)
    f.add(f'<text x="{TW - PX:.1f}" y="82" font-size="11.5" font-family="{MONO}" fill="{C["muted"]}" '
          f'text-anchor="end">agy-staff {escape(version)}</text>')
    # table card
    f.add(f'<rect x="{card_x}" y="{card_top}" width="{card_w}" height="{card_end - card_top}" rx="10" fill="#FFFFFF" '
          f'stroke="{C["border"]}" stroke-width="1.5"/>')
    f.line(card_x + 12, body_top - 8, card_x + card_w - 12, body_top - 8, C["ink"])
    # + agy columns: agy's staff badge, a blue frame with a clip on top
    for j, (h, s) in enumerate(cols):
        if s != "agy-staff":
            continue
        bx, by = col_x(j) + 5, card_top + 76
        f.add(f'<rect x="{bx:.1f}" y="{by}" width="{cw - 10:.1f}" height="{body_end - by + 6:.1f}" rx="9" fill="{AGYBG}" '
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
    for j, (h, s) in enumerate(cols):
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
    # body
    labels = [("resolved", None), ("host $", "your plan's quota"), ("total $", "host + worker"), ("median time", None)]
    y = body_top
    for k, ds in enumerate(dss):
        if k:
            f.line(card_x + 12, y, card_x + 12 + LW - 8, y, C["border"])
            for j in range(len(cols)):
                if cols[j][1] != "agy-staff":
                    f.line(col_x(j), y, col_x(j) + cw, y, C["border"])
        n = next(a["trials"] for a in aggs if a["dataset"] == ds)
        f.text(card_x + 16, y + 28, DATASETS[ds], 15, C["ink"], 700)
        f.add(f'<text x="{card_x + 26 + tw(DATASETS[ds], 15, True) * 1.04:.1f}" y="{y + 28}" font-size="11.5" '
              f'font-family="{MONO}" fill="{C["muted"]}">{n} tasks</text>')
        y += sec_h
        for ri, (label, sub) in enumerate(labels):
            base = y + (19 if ri < 3 else 21)
            f.add(f'<text x="{card_x + 28}" y="{base}" font-size="12.5" font-family="{MONO}" fill="{C["ink"]}">{label}</text>')
            if sub:
                f.text(card_x + 28, base + 16, sub, 11, FAINT)
            for j, (h, s) in enumerate(cols):
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
                    unsolved = a["trials"] - a["resolved"]
                    for q in range(a["trials"]):
                        qx, qy = sx + q * (sq + gap), y + 28
                        if q < a["resolved"]:
                            f.add(f'<rect x="{qx:.1f}" y="{qy}" width="{sq}" height="{sq}" fill="{HOSTS[h]["color"]}"/>')
                        elif q >= a["resolved"] + unsolved - a["timeouts"]:
                            f.add(f'<rect x="{qx + 0.6:.1f}" y="{qy + 0.6}" width="{sq - 1.2}" height="{sq - 1.2}" fill="#FFFFFF" '
                                  f'stroke="{RED}" stroke-width="1.2"/>')
                        else:
                            f.add(f'<rect x="{qx:.1f}" y="{qy}" width="{sq}" height="{sq}" fill="#DADCE0"/>')
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
    # dimension line, as in design.svg
    dim = f"{n_tasks} tasks · {len(dss)} benchmarks · {len(HOSTS)} hosts × {len(SETUPS)} setups · 1 run each"
    dw = mono_w(dim, 12) + 28
    mid = TW / 2
    f.add(f'<g stroke="{C["muted"]}" stroke-width="1"><line x1="{PX}" y1="{dim_y}" x2="{mid - dw / 2:.1f}" y2="{dim_y}"/>'
          f'<line x1="{mid + dw / 2:.1f}" y1="{dim_y}" x2="{TW - PX}" y2="{dim_y}"/>'
          f'<line x1="{PX}" y1="{dim_y - 5}" x2="{PX}" y2="{dim_y + 5}"/><line x1="{TW - PX}" y1="{dim_y - 5}" x2="{TW - PX}" y2="{dim_y + 5}"/></g>')
    f.add(f'<text x="{mid}" y="{dim_y + 4}" font-size="12" font-family="{MONO}" fill="{C["muted"]}" text-anchor="middle">{escape(dim)}</text>')
    # key, centered under the dimension line
    items = [("solved", "solved"), ("unsolved", "not solved"), ("timeout", "stopped at the time limit"),
             ("down", "cheaper than solo"), ("up", "costlier than solo")]
    widths = [(20 if k == "solved" else 12 if k in ("unsolved", "timeout") else 14) + tw(lbl, 12) for k, lbl in items]
    x = mid - (sum(widths) + 22 * (len(items) - 1)) / 2
    for (kind, label), wd in zip(items, widths):
        if kind == "solved":
            f.add(f'<rect x="{x:.1f}" y="{key_y - 9}" width="6" height="6" fill="{HOSTS["Claude Code"]["color"]}"/>'
                  f'<rect x="{x + 8:.1f}" y="{key_y - 9}" width="6" height="6" fill="{HOSTS["Codex"]["color"]}"/>')
            lx = x + 20
        elif kind == "unsolved":
            f.add(f'<rect x="{x:.1f}" y="{key_y - 9}" width="6" height="6" fill="#DADCE0"/>')
            lx = x + 12
        elif kind == "timeout":
            f.add(f'<rect x="{x + 0.6:.1f}" y="{key_y - 8.4}" width="4.8" height="4.8" fill="#FFFFFF" stroke="{RED}" stroke-width="1.2"/>')
            lx = x + 12
        else:
            f.add(f'<text x="{x:.1f}" y="{key_y}" font-size="11" font-weight="700" fill="{GREEN if kind == "down" else RED}">'
                  f'{"▼" if kind == "down" else "▲"}</text>')
            lx = x + 14
        f.text(lx, key_y, label, 12)
        x += wd + 22
    # notes: short items, two columns, bold term first
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
    if num_font:
        f.defs.add(font_face(num_font))
    f.defs.add('<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">'
               '<rect x="8" y="8" width="1.4" height="1.4" fill="#E3E5E8"/></pattern>')
    body = "\n".join(f.parts)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{TW}" height="{H}" viewBox="0 0 {TW} {H}" role="img" '
            f'aria-label="{escape(f.label)}" font-family="{FONT}">\n<defs>{"".join(sorted(f.defs))}</defs>\n{body}\n</svg>\n')


def main(argv):
    ap = argparse.ArgumentParser(
        description="Draw the results table of a bench version, summary.svg, from its data.json (viz-data.py).\n"
                    "Then render-png.sh makes the PNG the READMEs show.",
        epilog="""examples:
  viz-svg.py bench/results/v2/data.json                  writes bench/results/v2/summary.svg
  viz-svg.py bench/results/v1/data.json --out /tmp/v1    redraws v1 elsewhere

for agents:
  - A published version is never edited: do not write into bench/results/v1/ or another published
    version's directory. The first run downloads the number font (pinned, about 1.2 MB).""",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data", type=Path, help="the version's data.json (viz-data.py)")
    ap.add_argument("--out", type=Path, help="output directory (default: the directory of data.json)")
    ap.add_argument("--bench", help="bench version for the title, e.g. v2 (default: the name of that directory)")
    ap.add_argument("--version", help="agy-staff version to show (default: the latest in data.json)")
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
    (out / "summary.svg").write_text(summary_table(aggs, runs, version, bench))
    print(f"wrote {out / 'summary.svg'} (agy-staff Bench {bench}, agy-staff {version})", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
