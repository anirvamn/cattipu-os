// Generates flappy-welcome.svg: a looping 1-bit pixel "Flappy Bird" gag for a
// GitHub profile README. The bird flaps through pipes (score 6), crashes,
// GAME OVER, SIKE., LEMME COOK., then loops forever.
//
// Usage: node github-profile-banner/generate.mjs
//
// Pure SVG + CSS keyframes (no JS, no external assets), so it animates when
// embedded with ![](flappy-welcome.svg) in a GitHub README.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "flappy-welcome.svg");

// ---------------------------------------------------------------- config ---
const W = 192;
const H = 64;
const SCALE = 4; // rendered size = 768 x 256
const GROUND = 56;
const V = 48; // world scroll, px/s
const FPS = 30; // bird sampling rate
const BX = 44; // bird left edge on screen
const BW = 16;
const BH = 12;
const CAPW = 22;
const CAPH = 7;
const BODYW = 18;
const GAP = 26;
const PIPE_X0 = 135;
const PIPE_STEP = 58;
const CRASH_PIPE = 6; // the pipe it flies into; its index is also the final score
// pipes after the crash one keep the course going, so the run never looks cut short
const GAPS = [28, 34, 26, 36, 30, 34, 18, 30, 24, 34];
const AIM = [28, 34, 26, 36, 30, 34, 37]; // where the bird aims (the crash pipe's is "wrong")
const SCORE_PIPES = CRASH_PIPE;

const SIKE = "SIKE.";
const PUNCH = "LEMME COOK.";
const BEST = 6;

// ------------------------------------------------------------------ font ---
const FONT = {
  A: ".XXX.|X...X|X...X|XXXXX|X...X|X...X|X...X",
  B: "XXXX.|X...X|X...X|XXXX.|X...X|X...X|XXXX.",
  C: ".XXX.|X...X|X....|X....|X....|X...X|.XXX.",
  D: "XXXX.|X...X|X...X|X...X|X...X|X...X|XXXX.",
  E: "XXXXX|X....|X....|XXXX.|X....|X....|XXXXX",
  F: "XXXXX|X....|X....|XXXX.|X....|X....|X....",
  G: ".XXX.|X...X|X....|X.XXX|X...X|X...X|.XXXX",
  H: "X...X|X...X|X...X|XXXXX|X...X|X...X|X...X",
  I: "XXXXX|..X..|..X..|..X..|..X..|..X..|XXXXX",
  J: "..XXX|...X.|...X.|...X.|...X.|X..X.|.XX..",
  K: "X...X|X..X.|X.X..|XX...|X.X..|X..X.|X...X",
  L: "X....|X....|X....|X....|X....|X....|XXXXX",
  M: "X...X|XX.XX|X.X.X|X.X.X|X...X|X...X|X...X",
  N: "X...X|XX..X|X.X.X|X..XX|X...X|X...X|X...X",
  O: ".XXX.|X...X|X...X|X...X|X...X|X...X|.XXX.",
  P: "XXXX.|X...X|X...X|XXXX.|X....|X....|X....",
  Q: ".XXX.|X...X|X...X|X...X|X.X.X|X..X.|.XX.X",
  R: "XXXX.|X...X|X...X|XXXX.|X.X..|X..X.|X...X",
  S: ".XXXX|X....|X....|.XXX.|....X|....X|XXXX.",
  T: "XXXXX|..X..|..X..|..X..|..X..|..X..|..X..",
  U: "X...X|X...X|X...X|X...X|X...X|X...X|.XXX.",
  V: "X...X|X...X|X...X|X...X|X...X|.X.X.|..X..",
  W: "X...X|X...X|X...X|X.X.X|X.X.X|XX.XX|X...X",
  X: "X...X|X...X|.X.X.|..X..|.X.X.|X...X|X...X",
  Y: "X...X|X...X|.X.X.|..X..|..X..|..X..|..X..",
  Z: "XXXXX|....X|...X.|..X..|.X...|X....|XXXXX",
  0: ".XXX.|X...X|X..XX|X.X.X|XX..X|X...X|.XXX.",
  1: "..X..|.XX..|X.X..|..X..|..X..|..X..|XXXXX",
  2: ".XXX.|X...X|....X|...X.|..X..|.X...|XXXXX",
  3: "XXXX.|....X|....X|.XXX.|....X|....X|XXXX.",
  4: "...X.|..XX.|.X.X.|X..X.|XXXXX|...X.|...X.",
  5: "XXXXX|X....|XXXX.|....X|....X|X...X|.XXX.",
  6: ".XXX.|X....|X....|XXXX.|X...X|X...X|.XXX.",
  7: "XXXXX|....X|...X.|..X..|.X...|.X...|.X...",
  8: ".XXX.|X...X|X...X|.XXX.|X...X|X...X|.XXX.",
  9: ".XXX.|X...X|X...X|.XXXX|....X|....X|.XXX.",
  ".": ".|.|.|.|.|.|X",
  "'": ".X|.X|X.|..|..|..|..",
};

// ------------------------------------------------------- geometry helpers ---
// Greedy merge of a boolean mask into as few rectangles as possible.
function rectsFromMask(w, h, on) {
  const rects = [];
  let active = new Map();
  for (let y = 0; y <= h; y++) {
    const runs = [];
    if (y < h) {
      let x = 0;
      while (x < w) {
        if (on(x, y)) {
          const x0 = x;
          while (x < w && on(x, y)) x++;
          runs.push([x0, x - x0]);
        } else {
          x++;
        }
      }
    }
    const next = new Map();
    for (const [x0, rw] of runs) {
      const key = `${x0},${rw}`;
      const r = active.get(key);
      if (r) {
        r.h++;
        next.set(key, r);
      } else {
        const nr = { x: x0, y, w: rw, h: 1 };
        rects.push(nr);
        next.set(key, nr);
      }
    }
    active = next;
  }
  return rects;
}

const pathOf = (rects, ox = 0, oy = 0) =>
  rects.map((r) => `M${r.x + ox} ${r.y + oy}h${r.w}v${r.h}h${-r.w}z`).join("");

const rectPath = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

// ----------------------------------------------------------------- text ---
const glyphRows = (ch) => FONT[ch].split("|");
const advance = (ch, scale) => (ch === " " ? 4 : glyphRows(ch)[0].length + 1) * scale;

function layoutText(str, scale) {
  const letters = [];
  let x = 0;
  for (const ch of str) {
    if (ch !== " ") letters.push({ ch, x });
    x += advance(ch, scale);
  }
  return { letters, width: x - scale };
}

function glyphInk(ch, scale) {
  const rows = glyphRows(ch);
  const w = rows[0].length * scale;
  const h = rows.length * scale;
  const ink = (x, y) =>
    x >= 0 && y >= 0 && x < w && y < h && rows[Math.floor(y / scale)][Math.floor(x / scale)] === "X";
  return { w, h, ink };
}

// One letter as <g>: paper halo (so it reads over pipes/clouds) + ink.
// halo: true = 1px knock-out, a number = that many px, false = none.
function letterSvg(ch, ox, oy, scale, halo = true) {
  const { w, h, ink } = glyphInk(ch, scale);
  const inkPath = pathOf(rectsFromMask(w, h, ink), ox, oy);
  const r = halo === true ? 1 : halo || 0;
  let haloPath = "";
  if (r) {
    const near = (px, py) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ink(px - r + dx, py - r + dy)) return true;
      return false;
    };
    haloPath = `<path class="p" d="${pathOf(rectsFromMask(w + 2 * r, h + 2 * r, near), ox - r, oy - r)}"/>`;
  }
  return `${haloPath}<path class="i" d="${inkPath}"/>`;
}

// ---------------------------------------------------------------- sprites ---
const blankGrid = (w, h) => Array.from({ length: h }, () => Array(w).fill("."));
const stamp = (grid, ascii, ox, oy) => {
  ascii.forEach((row, j) =>
    [...row].forEach((c, i) => {
      if (c !== " ") grid[oy + j][ox + i] = c;
    }),
  );
  return grid;
};
const cloneGrid = (g) => g.map((r) => [...r]);
const rotateCW = (g) => {
  const h = g.length;
  const w = g[0].length;
  return Array.from({ length: w }, (_, i) => Array.from({ length: h }, (_, j) => g[h - 1 - j][i]));
};

// '.' transparent, 'o' paper, 'X' ink, '#' 50% dither
function gridToPaths(grid) {
  const h = grid.length;
  const w = grid[0].length;
  const paper = rectsFromMask(w, h, (x, y) => grid[y][x] !== ".");
  const ink = rectsFromMask(w, h, (x, y) => grid[y][x] === "X" || (grid[y][x] === "#" && (x + y) % 2 === 0));
  return `<path class="p" d="${pathOf(paper)}"/><path class="i" d="${pathOf(ink)}"/>`;
}

// Solid ink (white) bird on a black sky: paper (black) is used for the eye, mouth slit and wing outline.
function birdBody(deadEye) {
  const g = blankGrid(16, 12);
  const cx = 6.5;
  const cy = 5.5;
  const rx = 7.2;
  const ry = 6.1;
  const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue;
      g[y][x] = "X";
    }
  }
  // eye: black dot with a white glint; dead eye is an X
  stamp(g, deadEye ? ["o  o", " oo ", " oo ", "o  o"] : [" oo ", "oXoo", "oooo", " oo "], 8, 1);
  // beak: black separator, dithered lips and a mouth slit
  stamp(g, ["oXXX", "o###", "oooo", "o###", "oXX "], 12, 4);
  return g;
}

// wing frames: black leaf tapering toward the tail; [rows, y offset] per flap pose
const WINGS = {
  up: [["oo...", "oooo.", ".oooo", "..ooo"], 3],
  mid: [["..oo.", "ooooo", "ooooo", "..oo."], 4],
  down: [["..ooo", ".oooo", "oooo.", "oo..."], 5],
};
const wingGrid = (pose) => stamp(blankGrid(16, 12), WINGS[pose][0], 2, WINGS[pose][1]);

const bodyAlive = birdBody(false);
const bodyDead = birdBody(true);
const deadUpright = stamp(cloneGrid(bodyDead), WINGS.mid[0], 2, WINGS.mid[1]);
const deadFall = rotateCW(deadUpright);

// ------------------------------------------------------------- simulation ---
const pipeX = (i) => PIPE_X0 + i * PIPE_STEP;
const LAND_Y = GROUND - 14; // rotated dead bird is 16 tall, drawn 2px above the alive origin

function pipeHit(y, s) {
  const l = BX + 2;
  const r = BX + BW - 2;
  const tp = y + 2;
  const bt = y + BH - 2;
  const overlap = (rx, ry, rw, rh) => l < rx + rw && r > rx && tp < ry + rh && bt > ry;
  for (let i = 0; i < GAPS.length; i++) {
    const x = pipeX(i) - s;
    const gt = GAPS[i] - GAP / 2;
    const gb = GAPS[i] + GAP / 2;
    if (
      overlap(x + 2, 0, BODYW, gt - CAPH) ||
      overlap(x, gt - CAPH, CAPW, CAPH) ||
      overlap(x, gb, CAPW, CAPH) ||
      overlap(x + 2, gb + CAPH, BODYW, GROUND - gb - CAPH)
    )
      return i;
  }
  return -1;
}

function simulate() {
  const GRAV = 270;
  const FLAP = 64;
  const DEAD_GRAV = 520;
  const SUB = 8;
  const dt = 1 / (FPS * SUB);
  let y = GAPS[0] - BH / 2;
  let vy = 0;
  let lastFlap = -1;
  const ys = [];
  const flaps = [];
  let crash = null;
  let land = null;
  for (let k = 0; k < 40 * FPS * SUB; k++) {
    const t = k * dt;
    if (k % SUB === 0) ys.push(Math.round(y));
    if (!crash) {
      const s = Math.floor(V * t);
      let idx = CRASH_PIPE;
      for (let i = 0; i <= CRASH_PIPE; i++) {
        if (pipeX(i) - s + CAPW > BX + BW / 2) {
          idx = i;
          break;
        }
      }
      const yc = y + BH / 2;
      if (t > 0.2 && yc > AIM[idx] + 3 && vy > -14 && t - lastFlap > 0.12) {
        vy = -FLAP;
        lastFlap = t;
        flaps.push(t);
      }
      vy += GRAV * dt;
      y += vy * dt;
      const hit = pipeHit(y, s);
      if (hit >= 0 || y + BH >= GROUND) {
        if (hit !== CRASH_PIPE) throw new Error(`bird crashed early (pipe ${hit}) at t=${t.toFixed(2)}s, y=${y.toFixed(1)}`);
        crash = { t, s, y };
        vy = 0;
      }
    } else {
      vy += DEAD_GRAV * dt;
      y += vy * dt;
      if (y >= LAND_Y) {
        y = LAND_Y;
        land = t;
        ys.push(Math.round(y));
        break;
      }
    }
  }
  if (!crash || land === null) throw new Error("bird never crashed / landed");
  const scoreTimes = [];
  for (let i = 0; i < SCORE_PIPES; i++) scoreTimes.push((pipeX(i) + CAPW - BX - BW / 2) / V);
  return { ys, flaps, crash, land, scoreTimes };
}

const sim = simulate();
const tc = sim.crash.t;

// --------------------------------------------------------------- timeline ---
const HALF = 0.08; // half of a transition's black phase
const tGO = sim.land + 0.2; // the world is frozen, GAME OVER drops in
const tPanel = tGO + 0.3;
const GO_HOLD = 1.25; // seconds the GAME OVER screen is up before the wipe starts
const c1 = tGO + GO_HOLD + HALF + 0.08; // wipe: bird revives, big SIKE. appears
const tSike = c1;
const SIKE_HOLD = 0.5; // seconds SIKE. stays up once the wipe clears
const tPunch = c1 + HALF + 0.08 + SIKE_HOLD; // LEMME COOK. hits
const PUNCH_STEP = 0.06;
const nPunch = layoutText(PUNCH, 3).letters.length;
const tPunchEnd = tPunch + nPunch * PUNCH_STEP;
const c3 = tPunchEnd + 3.0; // hold, then the last wipe resets everything for the loop
const T = Math.round((c3 + 0.16) * 100) / 100;

// -------------------------------------------------------------- keyframes ---
const pct = (t) => `${((Math.min(t, T) / T) * 100).toFixed(3)}%`;
const keyframes = [];

function track(name, events) {
  const sorted = events.map((e, i) => ({ t: e[0], css: e[1], i })).sort((a, b) => a.t - b.t || a.i - b.i);
  const m = new Map();
  for (const e of sorted) m.set(pct(e.t), e.css);
  if (!m.has("0.000%")) throw new Error(`${name}: no 0% keyframe`);
  const last = [...m.values()].at(-1);
  m.set("100.000%", last);
  const body = [...m].map(([p, css]) => `${p}{${css};animation-timing-function:step-end}`).join("");
  keyframes.push(`@keyframes ${name}{${body}}`);
}

function vis(name, intervals) {
  const ev = [[0, "opacity:0"]];
  for (const [a, b] of intervals) ev.push([a, "opacity:1"], [b, "opacity:0"]);
  track(name, ev);
}

const A = (name) => `class="an" style="animation-name:${name}"`;
const AP = (name) => `class="p an" style="animation-name:${name}"`;
const AI = (name) => `class="i an" style="animation-name:${name}"`;
const tr = (x, y) => `transform:translate(${x}px,${y}px)`;

// scroll: ease-less pixel stepping, one segment while playing, one in the welcome scene
function scrollTrack(name, factor, welcome) {
  const sCrash = Math.floor(V * tc);
  const t1 = sCrash / V;
  const n1 = Math.max(1, Math.round(sCrash * factor));
  const stops = [`0.000%{${tr(0, 0)};animation-timing-function:steps(${n1},end)}`, `${pct(t1)}{${tr(-n1, 0)};animation-timing-function:step-end}`];
  let n2 = 0;
  if (welcome) {
    const t2s = c1;
    const t2e = c3 - 0.01;
    n2 = Math.max(1, Math.round((t2e - t2s) * V * factor));
    stops.push(
      `${pct(t2s)}{${tr(-n1, 0)};animation-timing-function:steps(${n2},end)}`,
      `${pct(t2e)}{${tr(-(n1 + n2), 0)};animation-timing-function:step-end}`,
    );
  }
  stops.push(`${pct(c3)}{${tr(0, 0)}}`, `100.000%{${tr(0, 0)}}`);
  keyframes.push(`@keyframes ${name}{${stops.join("")}}`);
  return n1 + n2;
}

const nGround = scrollTrack("kGround", 1, true);
const nHills = scrollTrack("kHills", 0.5, true);
const nClouds = scrollTrack("kClouds", 0.25, true);
const CLOUD_STRIP = 430; // right edge of the last cloud in cloudsSvg()
if (W + nClouds > CLOUD_STRIP) throw new Error(`cloud strip too short for a ${T}s loop (needs ${W + nClouds}px)`);
scrollTrack("kWorld", 1, false);

// bird height, sampled at FPS and snapped to whole pixels
{
  const ev = [];
  let prev = null;
  sim.ys.forEach((y, k) => {
    if (y !== prev) ev.push([k / FPS, tr(BX, y)]);
    prev = y;
  });
  ev.push([c3, tr(BX, sim.ys[0])]);
  track("kBirdY", ev);
}

// wing frames follow the flaps: down -> mid -> up (held until the next flap)
{
  const states = [[0, "mid"]];
  for (const f of sim.flaps) {
    if (f >= tc) break;
    states.push([f, "down"], [f + 0.1, "mid"], [f + 0.2, "up"]);
  }
  states.sort((a, b) => a[0] - b[0]);
  const wingEvents = (which) => {
    const ev = [[0, "opacity:0"]];
    for (const [t, st] of states) ev.push([t, st === which ? "opacity:1" : "opacity:0"]);
    ev.push([tc, "opacity:0"], [c3, which === "mid" ? "opacity:1" : "opacity:0"]);
    return ev;
  };
  track("kWingUp", wingEvents("up"));
  track("kWingMid", wingEvents("mid"));
  track("kWingDown", wingEvents("down"));
}

vis("kGame", [[0, c1], [c3, T]]);
vis("kAlive", [[0, tc], [c3, T]]);
vis("kDead0", [[tc, tc + 0.15]]);
vis("kDead1", [[tc + 0.15, c3]]);
vis("kBurstA", [[tc, tc + 0.1]]);
vis("kBurstB", [[tc + 0.1, tc + 0.3]]);
vis("kFlash", [[tc, tc + 0.06]]);
vis("kPunchFlash", [[tPunch, tPunch + 0.06]]);
vis("kSike", [[tSike, tPunch]]);
vis("kSky", [[0, c1], [c3, T]]); // clouds clear out for the end cards so the big text stays clean
vis("kPanel", [[tPanel, c1]]);
vis("kStripes", [c1, c3].flatMap((c) => [[c - HALF - 0.08, c - HALF], [c + HALF, c + HALF + 0.08]]));
vis("kBlack", [c1, c3].map((c) => [c - HALF, c + HALF]));

track("kShake", [
  [0, tr(0, 0)],
  [tc, tr(2, 0)],
  [tc + 0.05, tr(-2, 1)],
  [tc + 0.1, tr(2, -1)],
  [tc + 0.15, tr(-1, 1)],
  [tc + 0.2, tr(1, 0)],
  [tc + 0.25, tr(0, 0)],
  [tPunch, tr(2, 0)],
  [tPunch + 0.05, tr(-2, 1)],
  [tPunch + 0.1, tr(1, -1)],
  [tPunch + 0.15, tr(0, 0)],
]);

track("kTitle", [
  [0, tr(0, -40)],
  [tGO, tr(0, -12)],
  [tGO + 0.07, tr(0, 2)],
  [tGO + 0.14, tr(0, 7)],
  [tGO + 0.21, tr(0, 5)],
  [c1, tr(0, -40)],
]);

// score digits 0..5
const scoreEdges = [0, ...sim.scoreTimes, tGO];
for (let d = 0; d <= SCORE_PIPES; d++) {
  vis(`kDigit${d}`, d === 0 ? [[0, scoreEdges[1]], [c3, T]] : [[scoreEdges[d], scoreEdges[d + 1]]]);
}

// ------------------------------------------------------------------- art ---
function tubeBody(x, y, w, h) {
  if (h <= 0) return "";
  return `<path class="p" d="${rectPath(x, y, w, h)}"/>${shade(x, y, w, h)}<path class="i" d="${rectPath(x, y, 1, h)}${rectPath(x + w - 1, y, 1, h)}"/>`;
}

// vertical dither columns, brightest on the left to fake a round tube
function shade(x, y, w, h) {
  const solid = [];
  const dashes = { "3 1": [], "1 1": [], "1 1 o": [], "1 3": [] };
  const col = (r, cx) => {
    if (r === 1) solid.push(rectPath(cx, y, 1, h));
    else if (r === 2) dashes["3 1"].push(`M${cx + 0.5} ${y}v${h}`);
    else if (r === 3) dashes["1 1"].push(`M${cx + 0.5} ${y}v${h}`);
    else if (r === 4) dashes["1 1 o"].push(`M${cx + 0.5} ${y}v${h}`);
    else if (r === 5) dashes["1 3"].push(`M${cx + 0.5} ${y}v${h}`);
  };
  for (let r = 1; r <= 5; r++) col(r, x + r);
  let out = solid.length ? `<path class="i" d="${solid.join("")}"/>` : "";
  for (const [k, list] of Object.entries(dashes)) {
    if (!list.length) continue;
    const off = k.endsWith("o") ? ' stroke-dashoffset="1"' : "";
    out += `<path class="s" d="${list.join("")}" stroke-dasharray="${k.replace(" o", "")}"${off}/>`;
  }
  return out;
}

function cap(x, y) {
  const inner = shade(x, y + 1, CAPW, CAPH - 2);
  return (
    `<path class="p" d="${rectPath(x, y, CAPW, CAPH)}"/>${inner}` +
    `<path class="i" d="${rectPath(x, y, CAPW, 1)}${rectPath(x, y + CAPH - 1, CAPW, 1)}${rectPath(x, y, 1, CAPH)}${rectPath(x + CAPW - 1, y, 1, CAPH)}"/>`
  );
}

function pipeSvg(i) {
  const x = pipeX(i);
  const gt = GAPS[i] - GAP / 2;
  const gb = GAPS[i] + GAP / 2;
  return tubeBody(x + 2, 0, BODYW, gt - CAPH) + cap(x, gt - CAPH) + cap(x, gb) + tubeBody(x + 2, gb + CAPH, BODYW, GROUND - gb - CAPH);
}

function groundSvg(width) {
  let s = `<path class="p" d="${rectPath(0, GROUND, width, H - GROUND)}"/>`;
  s += `<path class="i" d="${rectPath(0, GROUND, width, 1)}"/>`;
  let lines = "";
  for (let row = 0; row < 4; row++) {
    const y = GROUND + 2 + row;
    lines += `<path class="s" d="M0 ${y + 0.5}H${width}" stroke-dasharray="2 2" stroke-dashoffset="${row}"/>`;
  }
  return s + lines;
}

function hillsSvg(width) {
  const hh = (x) => Math.max(2, Math.round(5 + 3 * Math.sin(x * 0.085) + 2 * Math.sin(x * 0.21 + 1.3)));
  const maxH = 11;
  const on = (x, ry) => {
    const ay = GROUND - maxH + ry;
    const top = GROUND - hh(x);
    return ay === top || (ay > top && ay % 2 === 0);
  };
  return `<path class="i" d="${pathOf(rectsFromMask(width, maxH, on), 0, GROUND - maxH)}"/>`;
}

function cloudSvg(discs, baseY, ox, oy) {
  const covered = (x, y) => y <= baseY && discs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r + r * 0.6);
  const w = 34;
  const h = 14;
  const edge = (x, y) => covered(x, y) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => covered(x + dx, y + dy));
  return (
    `<path class="p" d="${pathOf(rectsFromMask(w, h, covered), ox, oy)}"/>` +
    `<path class="i" d="${pathOf(rectsFromMask(w, h, edge), ox, oy)}"/>`
  );
}

function cloudsSvg() {
  const a = [[5, 7, 3.6], [11, 5, 5], [18, 7, 3.8], [14, 8, 4]];
  const b = [[4, 6, 3], [9, 4, 4], [15, 6, 3]];
  const spots = [[16, 4, a, 10], [92, 9, b, 9], [150, 3, a, 10], [226, 8, b, 9], [284, 4, a, 10], [340, 9, b, 9], [396, 4, a, 10]];
  return spots.map(([x, y, d, base]) => cloudSvg(d, base, x, y)).join("");
}

function burstSvg(r0, r1) {
  const cx = BX + BW + 1;
  const cy = Math.round(sim.crash.y + BH / 2);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const rects = [];
  for (const [dx, dy] of dirs) for (let r = r0; r <= r1; r++) rects.push(rectPath(cx + dx * r, cy + dy * r, 1, 1));
  return `<path class="i" d="${rects.join("")}"/>`;
}

const textRun = (str, ox, oy, scale, halo = true, anim = null) => {
  const { letters } = layoutText(str, scale);
  return letters.map(({ ch, x }, k) => `<g ${anim ? anim(k) : ""}>${letterSvg(ch, ox + x, oy, scale, halo)}</g>`).join("");
};

// ---------------------------------------------------------------- assemble ---
const defs = `
<g id="bd-body">${gridToPaths(bodyAlive)}</g>
<g id="bd-wing-up">${gridToPaths(wingGrid("up"))}</g>
<g id="bd-wing-mid">${gridToPaths(wingGrid("mid"))}</g>
<g id="bd-wing-down">${gridToPaths(wingGrid("down"))}</g>
<g id="bd-dead0">${gridToPaths(deadUpright)}</g>
<g id="bd-dead1">${gridToPaths(deadFall)}</g>`;

const pipes = GAPS.map((_, i) => pipeSvg(i)).join("");

const title = (() => {
  const { width } = layoutText("GAME OVER.", 2);
  return `<g ${A("kTitle")}>${textRun("GAME OVER.", Math.round((W - width) / 2), 4, 2)}</g>`;
})();

// 1-bit plate: paper fill, ink border, hard ink drop shadow. Shared by the in-game score and the GAME OVER panel.
const plate = (x, y, w, h) =>
  `<path class="i" d="${rectPath(x + 2, y + 2, w, h)}"/>` +
  `<path class="p" d="${rectPath(x, y, w, h)}"/>` +
  `<path class="i" d="${rectPath(x, y, w, 1)}${rectPath(x, y + h - 1, w, 1)}${rectPath(x, y, 1, h)}${rectPath(x + w - 1, y, 1, h)}"/>`;

const panel = (() => {
  const left = layoutText(`SCORE ${SCORE_PIPES}`, 1);
  const right = layoutText(`BEST ${BEST}`, 1);
  const gap = 10;
  const inner = left.width + gap + right.width;
  const pw = inner + 14;
  const ph = 15;
  const px = Math.round((W - pw) / 2);
  const py = 22;
  const tx = px + 7;
  return (
    `<g ${A("kPanel")}>` +
    plate(px, py, pw, ph) +
    textRun(`SCORE ${SCORE_PIPES}`, tx, py + 4, 1, false) +
    textRun(`BEST ${BEST}`, tx + left.width + gap, py + 4, 1, false) +
    `</g>`
  );
})();

// in-game score: 2x digit, top centre
const digits = Array.from({ length: SCORE_PIPES + 1 }, (_, d) => {
  const x = Math.round((W - 10) / 2);
  return `<g ${A(`kDigit${d}`)}>${letterSvg(String(d), x, 4, 2)}</g>`;
}).join("");

// big SIKE. (pops in whole) -> LEMME COOK. (typed fast, the punchline)
const finalText = (() => {
  const center = (str, scale) => Math.round((W - layoutText(str, scale).width) / 2);
  let out = `<g ${A("kSike")}>${textRun(SIKE, center(SIKE, 4), 14, 4)}</g>`;
  layoutText(PUNCH, 3).letters.forEach((_, k) => vis(`kPunch${k}`, [[tPunch + k * PUNCH_STEP, c3 - HALF]]));
  out += textRun(PUNCH, center(PUNCH, 3), 17, 3, true, (k) => A(`kPunch${k}`));
  return out;
})();

const stripes = pathOf(Array.from({ length: H / 2 }, (_, i) => ({ x: 0, y: i * 2, w: W, h: 1 })));

const css = `
:root{--ink:#fff;--paper:#000}
.i{fill:var(--ink)}.p{fill:var(--paper)}.s{fill:none;stroke:var(--ink);stroke-width:1}
.an{animation-duration:${T}s;animation-iteration-count:infinite;animation-fill-mode:both}
${keyframes.join("\n")}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W * SCALE}" height="${H * SCALE}" shape-rendering="crispEdges" role="img" aria-label="Pixel flappy bird crashes. Game over. Sike. Lemme cook.">
<title>Lemme cook</title>
<style>${css}</style>
<defs>${defs}</defs>
<rect class="p" width="${W}" height="${H}"/>
<g ${A("kShake")}>
<g ${A("kSky")}><g ${A("kClouds")}>${cloudsSvg()}</g></g>
<g ${A("kHills")}>${hillsSvg(W + nHills + 8)}</g>
<g ${A("kGame")}><g ${A("kWorld")}>${pipes}</g></g>
<g ${A("kGround")}>${groundSvg(W + nGround + 8)}</g>
<g ${A("kGame")}>
<g ${A("kBirdY")}>
<g ${A("kAlive")}><use href="#bd-body"/></g>
<g ${A("kAlive")}><g ${A("kWingUp")}><use href="#bd-wing-up"/></g><g ${A("kWingMid")}><use href="#bd-wing-mid"/></g><g ${A("kWingDown")}><use href="#bd-wing-down"/></g></g>
<g ${A("kDead0")}><use href="#bd-dead0"/></g>
<g ${A("kDead1")}><use href="#bd-dead1" transform="translate(2 -2)"/></g>
</g>
<g ${A("kBurstA")}>${burstSvg(2, 3)}</g>
<g ${A("kBurstB")}>${burstSvg(4, 6)}</g>
${digits}
</g>
${title}
${panel}
${finalText}
</g>
<path ${AI("kFlash")} d="${rectPath(0, 0, W, H)}"/>
<path ${AI("kPunchFlash")} d="${stripes}"/>
<path ${AP("kStripes")} d="${stripes}"/>
<path ${AP("kBlack")} d="${rectPath(0, 0, W, H)}"/>
<path class="i" d="${rectPath(0, 0, W, 1)}${rectPath(0, H - 1, W, 1)}${rectPath(0, 1, 1, H - 2)}${rectPath(W - 1, 1, 1, H - 2)}"/>
</svg>
`;

writeFileSync(OUT, svg);
const kb = (Buffer.byteLength(svg) / 1024).toFixed(1);
console.log(`wrote ${OUT} (${kb} KB)`);
console.log(`loop ${T}s | crash ${tc.toFixed(2)}s (y=${sim.crash.y.toFixed(1)}) | flaps before crash: ${sim.flaps.filter((f) => f < tc).length}`);
console.log(`score times: ${sim.scoreTimes.map((t) => t.toFixed(2)).join(", ")}`);
console.log(`GAME OVER ${tGO.toFixed(2)}s | wipe ${c1.toFixed(2)}s | SIKE ${tSike.toFixed(2)}-${tPunch.toFixed(2)}s | LEMME COOK ${tPunch.toFixed(2)}s | wipe ${c3.toFixed(2)}s`);
