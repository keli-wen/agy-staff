#!/usr/bin/env node
// Generates the approved Codex integration diagram at assets/integration.svg.
// Regenerate: node scripts/gen-diagrams.mjs
// Render PNG: rsvg-convert -w 2760 -b white assets/integration.svg -o assets/integration.png
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INK = '#202124', MUTED = '#5F6368', BORDER = '#DADCE0', BLUE = '#4285F4', LINK = '#1A73E8',
  PURPLE = '#9B72CB', YELLOW = '#FBBC04', GREEN = '#34A853', RED = '#D93025', LIGHT = '#E8F0FE', BG = '#F8F9FA';
// lane / command colours for the integration diagram
const CLAY = '#D97757', CLAY_DARK = '#B5573A';                      // Anthropic terracotta: the harness loop
const GREEN_DARK = '#188038', GREEN_LIGHT = '#E6F4EA';              // launch
const AMBER = '#F29900', AMBER_DARK = '#B06000', AMBER_LIGHT = '#FEF7E0'; // wait (pending)
const PURPLE_DARK = '#6A3AB2', PURPLE_LIGHT = '#F3EDFA';            // observe
const RAINBOW = ['#F6912E', '#EF5441', '#955FA5', '#6C73D8', '#3D85FC', '#43AEAA', '#85C64E']; // agy's arch

// ---------- pixel helpers ----------
// bitmap -> merged rects. '.' = empty, anything else = pixel (one colour per call)
function px(bitmap, x, y, u, fill) {
  const rows = bitmap.trim().split('\n').map(r => r.trim());
  const out = [];
  rows.forEach((row, ry) => {
    let cx = 0;
    while (cx < row.length) {
      if (row[cx] === '.') { cx++; continue; }
      const start = cx; while (cx < row.length && row[cx] !== '.') cx++;
      out.push(`<rect x="${x + start * u}" y="${y + ry * u}" width="${(cx - start) * u}" height="${u}"/>`);
    }
  });
  return `<g fill="${fill}" shape-rendering="crispEdges">${out.join('')}</g>`;
}

const LOOP = `
...#####....
..#.....#...
.#.......#..
.#.......###
#........###
#.........#.
#...........
#...........
.#.........#
.#........#.
..#......#..
...######...`;

const PLUG = `
..#...#...
..#...#...
.########.
.########.
.########.
..######..
...####...
....##....
....##....`;

const FLAG = `
#.........
#.##..##..
#...##..##
#.##..##..
#...##..##
#.##..##..
#.........
#.........
#.........`;

const CLOCK = `
...####...
..#....#..
.#......#.
#....#...#
#....#...#
#....##..#
#........#
.#......#.
..#....#..
...####...`;

const CHEVRON = `
#..
.#.
..#
.#.
#..`;

// Antigravity arch sprite (assets/logo/arch-rainbow-sprite.svg), 140x130 native, 10px cells
const ARCH = [
  ['#3D85FC', [[80,70],[90,80],[90,90],[100,90],[100,100],[110,100],[110,110],[120,110]]],
  ['#64B6F5', [[50,70],[30,90],[40,90],[30,100],[10,110],[20,110]]],
  ['#85C64E', [[40,30],[40,40],[50,40],[30,50],[40,50],[30,60],[30,70]]],
  ['#F6912E', [[60,10],[70,10],[60,20],[70,20],[60,30],[70,30],[70,40]]],
  ['#955FA5', [[80,50],[90,50],[100,50],[100,60],[100,70]]],
  ['#EF5441', [[80,20],[80,30],[90,30],[80,40],[90,40]]],
  ['#6C73D8', [[80,60],[90,60],[90,70],[100,80],[110,90]]],
  ['#D9B031', [[50,20],[50,30],[60,40]]],
  ['#43AEAA', [[50,50],[40,60],[50,60],[40,70],[30,80],[40,80],[20,90],[20,100]]],
];
function arch(x, y, s) {
  const g = ARCH.map(([c, cells]) => `<g fill="${c}">${cells.map(([cx, cy]) => `<rect x="${cx}" y="${cy}" width="10" height="10"/>`).join('')}</g>`).join('');
  return `<g transform="translate(${x},${y}) scale(${s})" shape-rendering="crispEdges">${g}</g>`;
}

const CLAUDE_PATH = 'M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z';
const CODEX_BG = 'M19.503 0H4.496A4.496 4.496 0 000 4.496v15.007A4.496 4.496 0 004.496 24h15.007A4.496 4.496 0 0024 19.503V4.496A4.496 4.496 0 0019.503 0z';
const CODEX_FG = 'M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z';

// harness logos row (Claude Code + Codex), right-aligned so that the text ends at `right`
function harnessLogos(right, y) {
  // widths: icon 24 + gap 4 + "Claude Code" ~76 ; gap 20 ; icon 24 + gap 4 + "Codex" ~40
  const codexText = right - 40, codexIcon = codexText - 28, claudeText = codexIcon - 20 - 76, claudeIcon = claudeText - 28;
  return `<g transform="translate(${claudeIcon},${y})"><path clip-rule="evenodd" fill-rule="evenodd" d="${CLAUDE_PATH}" fill="#D97757"/></g>
  <text x="${claudeText}" y="${y + 17}" font-size="12.5" font-weight="600">Claude Code</text>
  <g transform="translate(${codexIcon},${y})"><path d="${CODEX_BG}" fill="#fff"/><path d="${CODEX_FG}" fill="url(#codexgrad)"/></g>
  <text x="${codexText}" y="${y + 17}" font-size="12.5" font-weight="600">Codex</text>`;
}

// ---------- shared chrome ----------
function shell(W, H, ariaLabel, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ariaLabel}">
  <style>
    text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; fill: ${INK}; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .muted { fill: ${MUTED}; }
    .link { fill: ${LINK}; }
    .white { fill: #FFFFFF; }
    .silver { fill: #BDC1C6; }
    .label { font-size: 12px; font-weight: 700; fill: ${LINK}; letter-spacing: 1.5px; }
    .sub { font-size: 12px; fill: ${MUTED}; letter-spacing: 0; font-weight: 400; }
    .arrowlbl { font-size: 11px; font-weight: 700; fill: ${LINK}; }
  </style>
  <defs>
    ${Object.entries({ arrow: LINK, 'arrow-clay': CLAY, 'arrow-green': GREEN, 'arrow-amber': AMBER, 'arrow-purple': PURPLE, 'arrow-ink': INK })
      .map(([id, c]) => `<marker id="${id}" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="11" refY="5.5" orient="auto"><path d="M0,0 L12,5.5 L0,11 Z" fill="${c}"/></marker>`).join('\n    ')}
    <marker id="arrow-start" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="1" refY="5.5" orient="auto"><path d="M12,0 L0,5.5 L12,11 Z" fill="${LINK}"/></marker>
    <linearGradient id="rainbow" x1="0" x2="1" y1="0" y2="0">${RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>
    <linearGradient id="rainbow-soft" x1="0" x2="1" y1="0" y2="0">${RAINBOW.map((c, i) => `<stop offset="${(i / (RAINBOW.length - 1)).toFixed(3)}" stop-color="${c}" stop-opacity="0.2"/>`).join('')}</linearGradient>
    <pattern id="grid" width="18" height="18" patternUnits="userSpaceOnUse"><rect x="8" y="8" width="1.6" height="1.6" fill="${BORDER}"/></pattern>
    <linearGradient gradientUnits="userSpaceOnUse" id="codexgrad" x1="12" x2="12" y1="3" y2="21"><stop stop-color="#B1A7FF"/><stop offset=".5" stop-color="#7A9DFF"/><stop offset="1" stop-color="#3941FF"/></linearGradient>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="8" fill="${BG}" stroke="${INK}" stroke-width="1.5"/>
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="8" fill="url(#grid)"/>
  <g stroke="${BLUE}" stroke-width="1.5" opacity="0.85"><line x1="20" y1="26" x2="32" y2="26"/><line x1="26" y1="20" x2="26" y2="32"/></g>
  <g stroke="${BLUE}" stroke-width="1.5" opacity="0.85"><line x1="888" y1="${H - 26}" x2="900" y2="${H - 26}"/><line x1="894" y1="${H - 32}" x2="894" y2="${H - 20}"/></g>
${body}
</svg>
`;
}

function frame(f, label, sub, stroke = BLUE, labelColor = LINK) {
  return `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="10" fill="#FFFFFF" stroke="${stroke}" stroke-width="1.5"/>
  <text x="${f.x + 14}" y="${f.y + 25}" class="label" style="fill:${labelColor}">${label}<tspan class="sub" dx="7">· ${sub}</tspan></text>`;
}
function card(c, stroke = BORDER, sw = 1.5, dash = '') {
  return `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="8" fill="#FFFFFF" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
// a slot in a frame border where a connector passes through
function slot(x, y) {
  return `<g shape-rendering="crispEdges"><rect x="${x - 9}" y="${y - 4}" width="18" height="8" fill="${BG}"/><rect x="${x - 9}" y="${y - 4}" width="5" height="8" fill="${INK}"/><rect x="${x + 4}" y="${y - 4}" width="5" height="8" fill="${INK}"/></g>`;
}
function vline(x, y1, y2, { dash = '', marker = 'arrow', stroke = LINK } = {}) {
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${stroke}" stroke-width="1.8"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}/>`;
}
function fact(iconSvg, x, textX, y, html) {
  return `${iconSvg}<text x="${textX}" y="${y}" font-size="12.5">${html}</text>`;
}

// Integration: a streaming async tool riding a sync tool loop.
function diagramIntegration() {
  const W = 920, H = 632;
  const A = { x: 48, y: 56, w: 824, h: 150 };    // agent loop, unrolled in time   (clay)
  const B = { x: 48, y: 260, w: 824, h: 112 };   // plugin: bash commands           (blue)
  const C = { x: 48, y: 406, w: 824, h: 166 };   // background job + files          (ink + rainbow)
  const cols = [80, 236, 392, 548, 704].map(x => ({ x, w: 136, cx: x + 68 }));
  const T = cols.map(c => ({ x: c.x, y: 96, w: c.w, h: 78, cx: c.cx }));
  const [T1, T2, T3, T4, T5] = T;
  // one colour per command
  const LAUNCH_C = { stroke: GREEN, text: GREEN_DARK, fill: GREEN_LIGHT, marker: 'arrow-green' };
  const WAIT_C = { stroke: AMBER, text: AMBER_DARK, fill: AMBER_LIGHT, marker: 'arrow-amber' };
  const OBS_C = { stroke: PURPLE, text: PURPLE_DARK, fill: PURPLE_LIGHT, marker: 'arrow-purple' };
  const DONE_C = { stroke: INK, text: INK, fill: '#FFFFFF', marker: 'arrow-ink' };

  const turn = (t, head, body, tag) => `${card(t, tag ? CLAY : BORDER, 1.5, tag ? '' : '4 3')}
  ${tag ? `<rect x="${t.x + t.w - 18}" y="${t.y + 10}" width="8" height="8" fill="${tag.stroke}" shape-rendering="crispEdges"/>` : ''}
  <text x="${t.x + 10}" y="${t.y + 18}" font-size="12" font-weight="700" class="mono" style="fill:${tag ? CLAY_DARK : MUTED}">${head}</text>
  ${body.map((l, i) => `<text x="${t.x + 10}" y="${t.y + 36 + i * 14}" font-size="11" class="muted">${l}</text>`).join('')}`;
  const chevron = (x, y) => px(CHEVRON, x - 3, y - 5, 2, CLAY);
  const midY = T1.y + T1.h / 2;
  const lbl = (x, y, txt, col, anchor = 'start') => `<text x="${x}" y="${y}" font-size="10" text-anchor="${anchor}" class="mono" style="fill:${col.text}">${txt}</text>`;

  // lane B chips
  const LAUNCH = { x: T1.x, y: 296, w: T1.w, h: 60 };
  const OBSERVE = { x: T4.x, y: 296, w: T4.w, h: 60 };
  const WAIT = { x: T2.x, y: 312, w: T5.x + T5.w - T2.x, h: 28 };
  const chip = (c, head, body, col) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="8" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.5"/>
  <text x="${c.x + 10}" y="${c.y + 17}" font-size="12" font-weight="700" class="mono" style="fill:${col.text}">${head}</text>
  ${body.map((l, i) => `<text x="${c.x + 10}" y="${c.y + 31 + i * 12.5}" font-size="9.5" class="${l.startsWith('`') ? 'mono' : ''}" style="fill:${INK}">${l.replace(/`/g, '')}</text>`).join('')}`;

  // lane C: files row + worker bar
  const FILES_Y = 444, FILES_H = 44;
  const EVENTS = { x: T2.x, y: FILES_Y, w: T3.x + T3.w - T2.x, h: FILES_H };
  const PROGRESS = { x: T4.x, y: FILES_Y, w: T4.w, h: FILES_H };
  const RESULT = { x: T5.x, y: FILES_Y, w: T5.w, h: FILES_H };
  const fileChip = (c, head, body, stroke = BORDER, fill = '#FFFFFF', headColor = INK) => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
  <text x="${c.x + 10}" y="${c.y + 17}" font-size="11" font-weight="700" class="mono" style="fill:${headColor}">${head}</text>
  <text x="${c.x + 10}" y="${c.y + 33}" font-size="9.5" class="muted">${body}</text>`;
  const TILE = { x: 104, y: 498, w: 132, h: 44 };
  const BAR = { x: 254, y: 504, w: 586, h: 32 };
  const blips = [];
  for (let x = 560, i = 0; x <= 700; x += 28, i++) {
    const c = RAINBOW[i % RAINBOW.length];
    blips.push(`<rect x="${x}" y="${BAR.y + 12}" width="6" height="6" fill="${c}"/><rect x="${x + 10}" y="${BAR.y + 16}" width="4" height="4" fill="${c}" opacity="0.6"/>`);
  }
  const dots = (x, y1, y2, c) => { const o = []; for (let y = y1; y < y2; y += 5) o.push(`<rect x="${x - 1}" y="${y}" width="2" height="2" fill="${c}"/>`); return `<g shape-rendering="crispEdges">${o.join('')}</g>`; };

  const body = `
  <!-- ===== 01 · AGENT LOOP, unrolled in time (clay) ===== -->
  ${frame(A, '01 · AGENT LOOP', 'host turns over time →', CLAY, CLAY_DARK)}
  ${harnessLogos(A.x + A.w - 20, 64)}
  ${turn(T1, 'Delegate', ['Read the staffer skill.', 'Run the launch', 'command.'], LAUNCH_C)}
  ${chevron(T1.x + T1.w + 10, midY)}
  ${turn(T2, 'Start a wait', ['Use the job ID to', 'wait in background.', 'Continue other work.'], WAIT_C)}
  ${chevron(T2.x + T2.w + 10, midY)}
  ${turn(T3, 'Keep working', ['Use other tools,', 'delegate more work,', 'or talk to the user.'])}
  ${chevron(T3.x + T3.w + 10, midY)}
  ${turn(T4, 'Check progress', ['Call observe when', 'progress matters.', 'Read a small snapshot.'], OBS_C)}
  ${chevron(T4.x + T4.w + 10, midY)}
  ${turn(T5, 'Use the result', ['The wait finishes.', 'The host returns the', 'report to the agent.'], DONE_C)}

  <!-- call / return arrows between the loop and the plugin, coloured per command -->
  ${vline(T1.cx - 20, T1.y + T1.h, LAUNCH.y, { stroke: GREEN, marker: LAUNCH_C.marker })}
  ${vline(T1.cx + 20, LAUNCH.y, T1.y + T1.h, { stroke: GREEN, marker: LAUNCH_C.marker })}
  ${lbl(T1.cx - 26, 238, 'shell', LAUNCH_C, 'end')}
  ${lbl(T1.cx + 26, 238, 'job ID', LAUNCH_C)}
  ${vline(T2.cx, T2.y + T2.h, WAIT.y, { stroke: AMBER, marker: WAIT_C.marker })}
  ${lbl(T2.cx + 8, 238, 'background command', WAIT_C)}
  ${vline(T4.cx - 20, T4.y + T4.h, OBSERVE.y, { stroke: PURPLE, marker: OBS_C.marker })}
  ${vline(T4.cx + 20, OBSERVE.y, T4.y + T4.h, { stroke: PURPLE, marker: OBS_C.marker })}
  ${lbl(T4.cx - 26, 238, 'shell', OBS_C, 'end')}
  ${lbl(T4.cx + 26, 238, 'snapshot ≤ 8 KiB', OBS_C)}
  ${vline(T5.cx, WAIT.y, T5.y + T5.h, { stroke: INK, marker: DONE_C.marker })}
  ${lbl(T5.cx + 8, 238, 'full report', DONE_C)}
  ${[T1.cx - 20, T1.cx + 20, T2.cx, T4.cx - 20, T4.cx + 20, T5.cx].map(x => slot(x, A.y + A.h)).join('')}

  <!-- ===== 02 · PLUGIN: bash commands (blue) ===== -->
  ${frame(B, '02 · AGY-STAFF', 'skills guide the agent; shell commands manage the job', BLUE, LINK)}
  <rect x="${WAIT.x}" y="${WAIT.y}" width="${WAIT.w}" height="${WAIT.h}" rx="6" fill="${WAIT_C.fill}" stroke="${WAIT_C.stroke}" stroke-width="1.5"/>
  <text x="${WAIT.x + 10}" y="${WAIT.y + 18}" font-size="11" font-weight="700" class="mono" style="fill:${WAIT_C.text}">wait &lt;id&gt; --timeout 10m</text>
  <text x="${T3.x + 22}" y="${WAIT.y + 18}" font-size="10" class="mono" style="fill:${WAIT_C.text}">silent until ready</text>
  <text x="${T5.cx + 8}" y="${WAIT.y + 18}" font-size="10" font-weight="700" class="mono" style="fill:${INK}">result</text>
  <text x="${WAIT.x + 10}" y="${B.y + B.h - 8}" font-size="9.5" class="muted">One wait per job. Wait expiry returns a snapshot; execution continues.</text>
  ${chip(LAUNCH, 'launch', ['`staffer --prompt "…"`', 'Start an independent job.', 'Return a job ID.'], LAUNCH_C)}
  ${chip(OBSERVE, 'observe &lt;id&gt;', ['Return current progress:', '5 recent tool calls', '+ latest response'], OBS_C)}

  <!-- plugin <-> job arrows -->
  ${vline(T1.cx, LAUNCH.y + LAUNCH.h, TILE.y - 6, { stroke: GREEN, marker: LAUNCH_C.marker })}
  ${lbl(T1.cx + 8, 392, 'start worker', LAUNCH_C)}
  ${vline(T4.cx, PROGRESS.y, OBSERVE.y + OBSERVE.h, { stroke: PURPLE, marker: OBS_C.marker })}
  ${lbl(T4.cx + 8, 392, 'read snapshot', OBS_C)}
  ${vline(T5.cx, RESULT.y, WAIT.y + WAIT.h, { stroke: INK, marker: DONE_C.marker })}
  ${lbl(T5.cx + 8, 392, 'on completion', DONE_C)}

  <!-- ===== 03 · BACKGROUND JOB (ink frame, rainbow worker) ===== -->
  ${frame(C, '03 · BACKGROUND JOB', 'streaming continues independently of agent turns', INK, INK)}
  ${fileChip(EVENTS, 'Event log', 'Raw AGY events · events.jsonl')}
  ${fileChip(PROGRESS, 'Progress snapshot', '≤ 8 KiB · progress.json', PURPLE, PURPLE_LIGHT, PURPLE_DARK)}
  ${fileChip(RESULT, 'Final report', 'Saved as result.md', INK, '#FFFFFF', INK)}
  ${dots(T2.cx + 74, FILES_Y + FILES_H + 2, BAR.y, MUTED)}${dots(T4.cx, FILES_Y + FILES_H + 2, BAR.y, PURPLE)}${dots(T5.cx, FILES_Y + FILES_H + 2, BAR.y, INK)}
  <rect x="${BAR.x}" y="${BAR.y}" width="${BAR.w}" height="${BAR.h}" rx="6" fill="url(#rainbow-soft)" stroke="url(#rainbow)" stroke-width="1.5"/>
  <text x="${BAR.x + 12}" y="${BAR.y + 20}" font-size="10.5" class="mono" style="fill:${INK}">Worker · drains AGY stream-json</text>
  <g shape-rendering="crispEdges">${blips.join('')}</g>
  ${px(FLAG, 806, BAR.y + 7, 2, INK)}
  <rect x="${TILE.x}" y="${TILE.y}" width="${TILE.w}" height="${TILE.h}" rx="6" fill="${INK}"/>
  ${arch(TILE.x + 6, TILE.y + 5, 0.26)}
  <text x="${TILE.x + 48}" y="${TILE.y + 18}" font-size="11" font-weight="700" class="mono white">agy CLI</text>
  <text x="${TILE.x + 48}" y="${TILE.y + 32}" font-size="9" class="silver">Gemini Flash</text>
  <text x="${BAR.x + 12}" y="${BAR.y + 50}" font-size="9.5" class="muted">Worker deadline: 60m default, 120m max. Wait expiry leaves it running; cancel &lt;id&gt; stops the job.</text>

  <!-- Three equal footer columns; icons sit in 24px slots with an 8px text gap. -->
  ${fact(px(LOOP, 64, 590, 2, CLAY), 64, 96, 607, 'Delegate, then keep working')}
  ${fact(px(CLOCK, 340, 592, 2, AMBER), 338, 370, 607, 'Host schedules agent turns')}
  ${px(PLUG, 615, 592, 2, LINK)}<text x="644" y="607" font-size="12.5"><tspan font-weight="700" fill="${LINK}">Skills + shell tools</tspan></text>`;

  return shell(W, H, 'agy-staff exposes asynchronous agent work through persona skills and ordinary shell tool calls. The host agent delegates a task, receives a job ID, and starts a background wait where supported. It can continue other work or request a bounded progress snapshot. The worker runs AGY independently, continuously drains its stream-json output, stores events and progress, and saves a final report. Wait expiry leaves execution running. The host controls model scheduling while the worker enforces a separate deadline, default 60 minutes and configurable up to 120 minutes.', body);
}

// Keep the optional integration argument compatible with earlier regeneration commands.
const selected = process.argv.slice(2);
if (selected.length > 1 || (selected.length === 1 && selected[0] !== 'integration')) {
  throw new Error('Usage: node scripts/gen-diagrams.mjs [integration]');
}
const svg = diagramIntegration().replace(/[ \t]+$/gm, '');
fs.writeFileSync(path.join(ROOT, 'assets/integration.svg'), svg);
console.log('wrote assets/integration.svg', svg.length, 'bytes');
