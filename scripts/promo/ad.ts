/**
 * CATTIPU OS — a 90s-style TV spot, built with Motion (framer-motion).
 *
 *   0–6s    drums only (100 BPM): a red headline streaks across black, then
 *           CATTIPU's pixel app icons fly out of the screen
 *   6–30s   the beat goes fast (150 BPM): hard cuts, every one on the beat,
 *           of REAL recorded CATTIPU motion (scripts/promo/record.mjs) —
 *           typing, clicks, menus, builds, launches, the apps it built —
 *           with CATTIPU's own click sound on every real cursor press
 *   30–40s  silence: "What will we build", a red "today?", the end card
 *
 * Every picture is CATTIPU: recorded clips, its screenshots
 * (docs/media/screens), its wallpapers, PixelForge icons, cursors, fonts and
 * logo. The soundtrack is synthesized here, deterministically.
 *
 * The whole spot is ONE Motion sequence. render-ad.mjs pauses it and seeks
 * `controls.time` frame by frame, waiting for each frame's images, so every
 * frame is exact. Run: `node scripts/promo/render-ad.mjs`.
 */
import { animate, motionValue, type AnimationSequence } from "framer-motion";
import { WALLPAPERS } from "@/lib/os/wallpapers";

interface ClipFrame { url: string; t: number }
interface CursorPoint { t: number; x: number; y: number; down: boolean; kind: string }
interface Clip { duration: number; showCursor: boolean; frames: ClipFrame[]; cursor: CursorPoint[] }

declare global {
  interface Window {
    __AD_BASE__: string;
    __CLIPS__: Record<string, Clip>;
    __ad: {
      duration: number;
      musicEnd: number;
      seek: (t: number) => Promise<void>;
      renderAudio: () => Promise<AudioBuffer>;
    };
  }
}

const W = 640;
const H = 480;
const SRC_W = 1600;
const SRC_H = 900;
const base = window.__AD_BASE__;
const CLIPS = window.__CLIPS__;
const asset = (p: string) => `${base}/${p}`;

const stage = document.getElementById("stage") as HTMLDivElement;
const sequence: AnimationSequence = [];
/** Images whose source changed during the current seek; seek waits for them. */
let loading: Promise<unknown>[] = [];
/** When CATTIPU's click plays, in spot time. */
const clicks: number[] = [];

// ── tempo ────────────────────────────────────────────────────────────────
const INTRO_BPM = 100;
const FAST_BPM = 150;
const INTRO_BEAT = 60 / INTRO_BPM; // 0.6s
const BEAT = 60 / FAST_BPM; // 0.4s
const INTRO_END = 10 * INTRO_BEAT; // 6.0s
const MUSIC_END = INTRO_END + 60 * BEAT; // 30.0s
const TOTAL = MUSIC_END + 10; // 40.0s, the last 10s silent

// ── building blocks ──────────────────────────────────────────────────────
interface Crop { x: number; y: number; w: number }

function layer(className = "shot"): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  stage.appendChild(el);
  return el;
}

/** Shows `el` from `at` for `dur` seconds: a hard cut in and a hard cut out. */
function cut(el: HTMLElement, at: number, dur: number) {
  sequence.push([el, { opacity: [0, 1] }, { at, duration: 0.001 }]);
  sequence.push([el, { opacity: [1, 0] }, { at: at + dur, duration: 0.001 }]);
}

function transformFor(c: Crop) {
  const scale = W / c.w;
  return { scale, x: -c.x * scale, y: -c.y * scale };
}

/** A 4:3 crop of width `w` centred on (x, y), kept inside the source. */
function around(x: number, y: number, w: number): Crop {
  const h = w * 0.75;
  return {
    x: Math.min(Math.max(0, x - w / 2), SRC_W - w),
    y: Math.min(Math.max(0, y - h / 2), SRC_H - h),
    w,
  };
}

const zoomIn = (c: Crop, k = 0.86): Crop => around(c.x + c.w / 2, c.y + (c.w * 0.75) / 2, c.w * k);

/** A frame holder that drifts from crop `a` to crop `b`: a slow push-in. */
function framed(a: Crop, b: Crop, at: number, dur: number) {
  const el = layer();
  const box = document.createElement("div");
  box.className = "frame";
  el.appendChild(box);
  const from = transformFor(a);
  const to = transformFor(b);
  sequence.push([box, { scale: [from.scale, to.scale], x: [from.x, to.x], y: [from.y, to.y] }, { at, duration: dur, ease: "linear" }]);
  cut(el, at, dur);
  return { el, box };
}

function setSrc(img: HTMLImageElement, url: string) {
  if (img.dataset.src === url) return;
  img.dataset.src = url;
  img.src = url;
  loading.push(img.decode().catch(() => {}));
}

/** A still screenshot (docs/media/screens). */
function still(name: string, a: Crop, b: Crop, at: number, dur: number) {
  const { box } = framed(a, b, at, dur);
  const img = document.createElement("img");
  img.className = "fill";
  setSrc(img, asset(`docs/media/screens/${name}.png`));
  box.appendChild(img);
}

/**
 * A recorded clip, played from clip time `from` at `speed`, with CATTIPU's
 * cursor drawn where the real pointer was. The cursor lives inside the
 * zoomed frame, so a tight crop makes it giant — the 90s close-up.
 */
function clip(name: string, a: Crop, b: Crop, at: number, dur: number, opts: { from?: number; speed?: number; hand?: boolean } = {}) {
  const c = CLIPS[name];
  if (!c) throw new Error(`clip ${name} was not recorded`);
  const from = opts.from ?? 0;
  const speed = opts.speed ?? 1;
  const { box } = framed(a, b, at, dur);
  const img = document.createElement("img");
  img.className = "fill";
  box.appendChild(img);
  const cursor = document.createElement("img");
  cursor.className = opts.hand ? "cursor hand" : "cursor";
  cursor.src = asset(opts.hand ? "public/cursors/hand.png" : "public/cursors/arrow.png");
  cursor.style.display = c.showCursor ? "block" : "none";
  box.appendChild(cursor);

  const time = motionValue(from);
  time.on("change", (t) => {
    let f = c.frames[0];
    for (const frame of c.frames) { if (frame.t <= t + 1e-6) f = frame; else break; }
    setSrc(img, f.url);
    if (!c.showCursor || c.cursor.length === 0) return;
    let p = c.cursor[0];
    let next = p;
    for (const k of c.cursor) { if (k.t <= t) p = k; else { next = k; break; } }
    const span = Math.max(1e-6, next.t - p.t);
    const k = next.t > p.t ? Math.min(1, Math.max(0, (t - p.t) / span)) : 0;
    const x = p.x + (next.x - p.x) * k;
    const y = p.y + (next.y - p.y) * k;
    const pressed = c.cursor.some((q) => (q.kind === "press" || q.kind === "right") && t >= q.t && t - q.t < 0.14);
    cursor.style.transform = `translate(${x - (opts.hand ? 18 : 2)}px, ${y - 2}px) scale(${pressed ? 0.82 : 1})`;
  });
  sequence.push([time, [from, from + dur * speed], { at, duration: dur, ease: "linear" }]);
  for (const q of c.cursor) {
    if ((q.kind === "press" || q.kind === "right") && q.t >= from && q.t < from + dur * speed) clicks.push(at + (q.t - from) / speed);
  }
}

/** The first real press of a clip (the click the shot is about). */
function pressOf(name: string, n = 0) {
  const presses = CLIPS[name].cursor.filter((q) => q.kind === "press" || q.kind === "right");
  return presses[Math.min(n, presses.length - 1)] ?? CLIPS[name].cursor[0];
}

/** A title card: pixel type on a plate. */
function card(lines: Array<{ text: string; size: number; color: string }>, at: number, dur: number, bg = "#000") {
  const el = layer("shot card");
  el.style.background = bg;
  const stack = document.createElement("div");
  stack.className = "card-stack";
  for (const l of lines) {
    const t = document.createElement("div");
    t.className = "card-text";
    t.textContent = l.text;
    t.style.fontSize = `${l.size}px`;
    t.style.color = l.color;
    stack.appendChild(t);
  }
  el.appendChild(stack);
  sequence.push([stack, { scale: [1.18, 1] }, { at, duration: Math.min(dur, 0.35), ease: "easeOut" }]);
  cut(el, at, dur);
}

/** The circle badge, like a 90s campaign roundel. */
function badge(text: string, at: number, dur: number, colors?: { disc: string; ink: string; plate: string }) {
  const el = layer("shot card");
  el.style.background = colors?.plate ?? "#000";
  const disc = document.createElement("div");
  disc.className = "badge";
  disc.textContent = text;
  if (colors) {
    disc.style.background = colors.disc;
    disc.style.color = colors.ink;
    disc.style.boxShadow = `inset 0 0 0 6px ${colors.ink}`;
  }
  el.appendChild(disc);
  sequence.push([disc, { scale: [0.2, 1.08, 1], rotate: [-12, 3, 0] }, { at, duration: 0.4, ease: "easeOut" }]);
  cut(el, at, dur);
}

/** A wallpaper, full frame, its tile blown up into a bold pattern. */
function wallpaperFlash(index: number, at: number, dur: number) {
  const w = WALLPAPERS[index % WALLPAPERS.length];
  const el = layer("shot");
  const tile = document.createElement("div");
  tile.className = "wall";
  Object.assign(tile.style, w.surface);
  if (w.surface.backgroundImage) tile.style.backgroundImage = w.surface.backgroundImage.replace(/url\("?\/assets\//g, `url("${base}/public/assets/`);
  el.appendChild(tile);
  sequence.push([tile, { scale: [4, 4.6] }, { at, duration: dur, ease: "linear" }]);
  cut(el, at, dur);
}

/** One white frame, the editor's punctuation. */
function flash(at: number) {
  cut(layer("shot flash"), at, 0.04);
}

// ── 0–6s: drums. The headline, then the icons ────────────────────────────
function headline(text: string, at: number, dur: number) {
  const el = layer("shot card");
  el.style.background = "#000";
  const t = document.createElement("div");
  t.className = "headline";
  t.textContent = text;
  el.appendChild(t);
  // Streaks in fast, slows to read, streaks out — blurred while it moves.
  const pos = motionValue(0);
  pos.on("change", (v) => {
    const x = v < 0.25 ? W - (W + 120) * (v / 0.25) * 0.55 : v < 0.75 ? W - (W + 120) * (0.55 + ((v - 0.25) / 0.5) * 0.35) : W - (W + 120) * (0.9 + ((v - 0.75) / 0.25) * 0.9);
    const speed = v < 0.25 || v > 0.75 ? 1 : 0.25;
    t.style.transform = `translateX(${x.toFixed(1)}px)`;
    t.style.filter = `blur(${(speed * 2.2).toFixed(2)}px)`;
    t.style.textShadow = `${(speed * 18).toFixed(0)}px 0 6px rgba(255,30,30,.45), ${(speed * 36).toFixed(0)}px 0 10px rgba(255,30,30,.25)`;
  });
  sequence.push([pos, [0, 1], { at, duration: dur, ease: "linear" }]);
  cut(el, at, dur);
}

const ICONS = ["home", "projects", "architect", "canvas", "forge", "memory", "launch", "explorer", "settings", "folder", "bell", "diagnostics"];
function flyingIcons(at: number, dur: number) {
  const el = layer("shot card");
  el.style.background = "#000";
  ICONS.forEach((name, i) => {
    const icon = document.createElement("img");
    icon.className = "fly";
    icon.src = asset(`public/pixelforge/shell/32/${name}.svg`);
    el.appendChild(icon);
    const angle = (i / ICONS.length) * Math.PI * 2 + 0.4;
    const start = at + (i % 6) * 0.12;
    sequence.push([icon, {
      x: [0, Math.cos(angle) * 420],
      y: [0, Math.sin(angle) * 320],
      scale: [0.1, 3.2],
      opacity: [0, 1, 1],
    }, { at: start, duration: dur - (start - at), ease: "easeIn" }]);
  });
  cut(el, at, dur);
}

headline("What will we build today?", 0.15, 4.05);
flyingIcons(4.2, INTRO_END - 4.2);

// ── 6–30s: fast. Every cut on the beat ───────────────────────────────────
let beatsUsed = 0;
const beat = (n: number) => { const at = INTRO_END + beatsUsed * BEAT; beatsUsed += n; return { at, dur: n * BEAT }; };
/** The widest 4:3 crop of a 16:9 screen. */
const FULL: Crop = { x: 200, y: 0, w: 1200 };

{
  let s = beat(3);
  const bootCrop = around(800, 470, 760);
  clip("boot", bootCrop, zoomIn(bootCrop, 0.8), s.at, s.dur, { from: 2.6, speed: 1.4 });
  flash(s.at);

  s = beat(3);
  const dbl = pressOf("desktop-hand", 0);
  const handCrop = around(dbl.x + 40, dbl.y + 30, 300);
  clip("desktop-hand", around(dbl.x + 60, dbl.y + 60, 520), handCrop, s.at, s.dur, { from: 0.6, speed: 1.6, hand: true });

  s = beat(1);
  wallpaperFlash(1, s.at, BEAT / 2);
  wallpaperFlash(3, s.at + BEAT / 2, BEAT / 2);

  const typeClick = pressOf("architect-type", 0);
  s = beat(3);
  // The typed text starts at the field's left edge (about x 320, y 277).
  clip("architect-type", around(typeClick.x - 40, typeClick.y + 10, 440), around(typeClick.x + 20, typeClick.y + 5, 340), s.at, s.dur, { from: typeClick.t - 0.1, speed: 1.9 });

  const gen = pressOf("architect-type", 1);
  s = beat(2);
  clip("architect-type", around(gen.x - 30, gen.y + 10, 300), around(gen.x - 10, gen.y + 5, 220), s.at, s.dur, { from: gen.t - 0.55, speed: 1 });

  s = beat(2);
  clip("architect-type", { x: 120, y: 60, w: 1200 }, { x: 200, y: 120, w: 1000 }, s.at, s.dur, { from: gen.t + 1.2, speed: 3.5 });

  s = beat(2);
  card([{ text: "CATTIPU helps you", size: 26, color: "#f2ead6" }, { text: "plan", size: 120, color: "#c46bd1" }], s.at, s.dur);
  flash(s.at);

  const right = pressOf("menu", 0);
  s = beat(3);
  clip("menu", around(right.x + 120, right.y + 110, 520), around(right.x + 140, right.y + 130, 440), s.at, s.dur, { from: right.t - 0.15, speed: 1.75 });

  const max = pressOf("maximize", 0);
  s = beat(2);
  clip("maximize", around(max.x - 20, max.y + 20, 240), around(max.x - 10, max.y + 10, 170), s.at, s.dur, { from: max.t - 0.45, speed: 1.2 });

  s = beat(2);
  badge("WHAT WILL WE BUILD TODAY?", s.at, s.dur);

  s = beat(2);
  still("explorer", { x: 100, y: 80, w: 640 }, { x: 110, y: 200, w: 520 }, s.at, s.dur);

  const build = pressOf("forge-build", 0);
  s = beat(3);
  clip("forge-build", around(build.x - 380, build.y + 40, 900), around(build.x - 720, build.y + 80, 440), s.at, s.dur, { from: Math.max(0, build.t - 0.4), speed: 0.85 });

  s = beat(2);
  card([{ text: "build", size: 130, color: "#ff3b30" }], s.at, s.dur);
  flash(s.at);

  const go = pressOf("launch-run", 0);
  s = beat(3);
  clip("launch-run", around(go.x - 390, go.y + 40, 900), around(go.x - 740, go.y + 95, 420), s.at, s.dur, { from: Math.max(0, go.t - 0.4), speed: 0.8 });

  s = beat(3);
  clip("shooter", { x: 0, y: 0, w: 1200 }, { x: 200, y: 60, w: 1000 }, s.at, s.dur, { from: 0.5, speed: 1 });
  s = beat(2);
  clip("paint", { x: 200, y: 0, w: 1200 }, { x: 300, y: 60, w: 1000 }, s.at, s.dur, { from: 1.5, speed: 2.4 });
  s = beat(3);
  clip("habit-app", { x: 200, y: 0, w: 1200 }, { x: 280, y: 40, w: 1040 }, s.at, s.dur, { from: 0.2, speed: 2.1 });

  s = beat(2);
  card([{ text: "CATTIPU helps you", size: 26, color: "#f2ead6" }, { text: "run it", size: 110, color: "#3ccf6e" }], s.at, s.dur);
  flash(s.at);

  s = beat(2);
  clip("tile", FULL, { x: 100, y: 60, w: 1100 }, s.at, s.dur, { from: 0.2, speed: 0.9 });
  s = beat(2);
  clip("wallpapers", { x: 100, y: 0, w: 1200 }, { x: 160, y: 40, w: 1100 }, s.at, s.dur, { from: 0.3, speed: 4 });
  s = beat(2);
  clip("widgets", { x: 1100, y: 70, w: 500 }, { x: 1180, y: 80, w: 420 }, s.at, s.dur, { from: 0.4, speed: 3 });
  s = beat(2);
  clip("notifications", { x: 1050, y: 40, w: 550 }, { x: 1150, y: 60, w: 450 }, s.at, s.dur, { from: 0, speed: 1.4 });
  s = beat(2);
  still("ai-console", { x: 90, y: 160, w: 700 }, { x: 100, y: 200, w: 560 }, s.at, s.dur);
  s = beat(1);
  badge("PLAN. BUILD. RUN.", s.at, s.dur, { disc: "#002A73", ink: "#E9DFC4", plate: "#E9DFC4" });

  // The rapid-fire montage: half a beat each.
  const half = BEAT / 2;
  s = beat(6);
  const items: Array<(at: number) => void> = [
    (at) => still("hero", { x: 0, y: 0, w: 1200 }, { x: 60, y: 30, w: 1080 }, at, half),
    (at) => wallpaperFlash(2, at, half),
    (at) => clip("shooter", { x: 200, y: 0, w: 1200 }, { x: 260, y: 30, w: 1080 }, at, half, { from: 2.2 }),
    (at) => still("architect", { x: 100, y: 80, w: 1100 }, { x: 160, y: 120, w: 980 }, at, half),
    (at) => wallpaperFlash(4, at, half),
    (at) => clip("habit-app", { x: 200, y: 0, w: 1200 }, { x: 260, y: 30, w: 1080 }, at, half, { from: 1.6 }),
    (at) => still("desktop-dark", { x: 300, y: 0, w: 1300 }, { x: 360, y: 30, w: 1180 }, at, half),
    (at) => wallpaperFlash(3, at, half),
    (at) => still("canvas", { x: 200, y: 80, w: 1000 }, { x: 260, y: 120, w: 880 }, at, half),
    (at) => clip("paint", { x: 200, y: 0, w: 1200 }, { x: 260, y: 30, w: 1080 }, at, half, { from: 4 }),
    (at) => still("launch", { x: 300, y: 120, w: 900 }, { x: 340, y: 150, w: 800 }, at, half),
    (at) => clip("shooter", { x: 300, y: 80, w: 1000 }, { x: 360, y: 110, w: 880 }, at, half, { from: 3.0 }),
  ];
  items.forEach((add, i) => add(s.at + i * half));
}
if (Math.abs(INTRO_END + beatsUsed * BEAT - MUSIC_END) > 1e-6) throw new Error(`the fast section is ${beatsUsed} beats, not 60`);
flash(MUSIC_END - 0.04);

// ── 30–40s: silence. One pixel icon at a time, then the line, the logo ──
/** A single PixelForge icon, blown up, alone on a plain plate. */
function iconPlate(name: string, plate: string, at: number, dur: number) {
  const el = layer("shot card");
  el.style.background = plate;
  const icon = document.createElement("img");
  icon.className = "solo";
  icon.src = asset(`public/pixelforge/shell/32/${name}.svg`);
  el.appendChild(icon);
  cut(el, at, dur);
  return { el, icon };
}

{
  // A folder pops open on white.
  const at = MUSIC_END + 0.35;
  const { icon } = iconPlate("folder", "#f4f1ea", at, 1.3);
  sequence.push([icon, { y: [0, -26, 0, -10, 0], scale: [1, 1.04, 0.98, 1.02, 1] }, { at, duration: 0.9, ease: "easeOut" }]);
  const open = motionValue(0);
  open.on("change", (v) => { icon.src = asset(`public/pixelforge/shell/32/${v > 0.5 ? "folderopen" : "folder"}.svg`); });
  sequence.push([open, [0, 1], { at: at + 0.5, duration: 0.02 }]);
}
{
  // The Forge anvil throws sparks on black.
  const at = MUSIC_END + 1.65;
  const { el, icon } = iconPlate("forge", "#000", at, 1.3);
  sequence.push([icon, { y: [0, 6, 0, 6, 0] }, { at, duration: 1.2, ease: "linear" }]);
  for (let i = 0; i < 14; i += 1) {
    const spark = document.createElement("div");
    spark.className = "spark";
    el.appendChild(spark);
    const angle = -Math.PI / 2 + (i / 13 - 0.5) * 2.4;
    const dist = 120 + (i % 4) * 40;
    const t0 = at + (i % 2 === 0 ? 0.08 : 0.68) + (i % 3) * 0.04;
    sequence.push([spark, { x: [0, Math.cos(angle) * dist], y: [0, Math.sin(angle) * dist + 60], opacity: [1, 1, 0] }, { at: t0, duration: 0.5, ease: "easeOut" }]);
  }
}
{
  // The Launch rocket lifts off on engineering paper.
  const at = MUSIC_END + 2.95;
  const { el, icon } = iconPlate("launch", "#E9DFC4", at, 1.3);
  el.classList.add("paper");
  sequence.push([icon, { y: [40, 30, -260] }, { at, duration: 1.25, ease: "easeIn" }]);
}
{
  // "What will we build" typed on a white page, the line left hanging.
  const at = MUSIC_END + 4.25;
  const dur = 2.55;
  const el = layer("shot card page");
  const line = document.createElement("div");
  line.className = "page-text";
  const typed = document.createElement("span");
  const caret = document.createElement("span");
  caret.className = "page-caret";
  caret.textContent = "|";
  line.append(typed, caret);
  el.appendChild(line);
  const text = "What will we build";
  const count = motionValue(0);
  count.on("change", (v) => (typed.textContent = text.slice(0, Math.round(v))));
  sequence.push([count, [0, text.length], { at: at + 0.25, duration: 1.5, ease: "linear" }]);
  const blink = motionValue(0);
  blink.on("change", (v) => (caret.style.opacity = Math.floor(v) % 2 === 0 ? "1" : "0"));
  sequence.push([blink, [0, Math.round(dur * 3.4)], { at, duration: dur, ease: "linear" }]);
  cut(el, at, dur);
}
{
  const at = MUSIC_END + 6.8;
  const dur = 1.1;
  const el = layer("shot card");
  el.style.background = "#000";
  const t = document.createElement("div");
  t.className = "card-text glitch";
  t.textContent = "today?";
  el.appendChild(t);
  const g = motionValue(0);
  g.on("change", (v) => {
    const k = Math.floor(v);
    const jx = Math.sin(k * 12.9898) * 4;
    const red = 3 + Math.abs(Math.sin(k * 3.1)) * 5;
    t.style.transform = `translateX(${jx.toFixed(1)}px)`;
    t.style.textShadow = `${red.toFixed(1)}px 0 rgba(255,40,40,.75), ${(-red).toFixed(1)}px 0 rgba(40,200,255,.45)`;
  });
  sequence.push([g, [0, dur * 25], { at, duration: dur, ease: "linear" }]);
  sequence.push([t, { scale: [1.35, 1] }, { at, duration: 0.25, ease: "easeOut" }]);
  cut(el, at, dur);
}
{
  const at = MUSIC_END + 7.9;
  const dur = TOTAL - at;
  const el = layer("shot end-plate");
  const logo = document.createElement("img");
  logo.src = asset("public/logo/icon-color.png");
  logo.className = "end-logo";
  const name = document.createElement("div");
  name.className = "end-name";
  name.textContent = "CATTIPU OS";
  const tag = document.createElement("div");
  tag.className = "end-tag";
  tag.textContent = "The operating system for software creators.";
  const url = document.createElement("div");
  url.className = "end-url";
  url.textContent = "github.com/anirva09/cattipu-os";
  el.append(logo, name, tag, url);
  sequence.push([logo, { scale: [0.6, 1], opacity: [0, 1] }, { at, duration: 0.4, ease: "easeOut" }]);
  sequence.push([name, { opacity: [0, 1], y: [12, 0] }, { at: at + 0.35, duration: 0.3 }]);
  sequence.push([tag, { opacity: [0, 1] }, { at: at + 0.7, duration: 0.3 }]);
  sequence.push([url, { opacity: [0, 1] }, { at: at + 1.0, duration: 0.3 }]);
  cut(el, at, dur + 0.1);
}

// ── the VHS finish, above every shot ─────────────────────────────────────
const grain = layer("overlay grain");
const band = layer("overlay band");
layer("overlay scan");
layer("overlay vignette");
const tick = motionValue(0);
tick.on("change", (v) => {
  const k = Math.floor(v);
  grain.style.backgroundPosition = `${(k * 37) % 128}px ${(k * 71) % 128}px`;
  band.style.transform = `translateY(${((k * 9) % (H + 120)) - 60}px)`;
});
sequence.push([tick, [0, TOTAL * 25], { at: 0, duration: TOTAL, ease: "linear" }]);

// ── the soundtrack ───────────────────────────────────────────────────────
const RATE = 44100;

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.ceil(RATE * seconds), RATE);
  const d = buf.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < d.length; i += 1) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
  return buf;
}

async function loadSample(ctx: BaseAudioContext, path: string): Promise<AudioBuffer | null> {
  try {
    const bytes = await new Promise<ArrayBuffer>((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("GET", asset(path));
      x.responseType = "arraybuffer";
      x.onload = () => res(x.response as ArrayBuffer);
      x.onerror = rej;
      x.send();
    });
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

async function renderAudio(): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(RATE * TOTAL), RATE);
  const master = ctx.createGain();
  master.gain.value = 0.75;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const noise = noiseBuffer(ctx, 2);
  const click = await loadSample(ctx, "public/sounds/window-open.wav");

  const env = (g: GainNode, t: number, peak: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  };
  const kick = (t: number, v = 1) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 0.95 * v, 0.36); o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
  };
  const noiseHit = (t: number, type: BiquadFilterType, freq: number, peak: number, decay: number) => {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, peak, decay);
    s.connect(f).connect(g).connect(master); s.start(t, (t * 7.3) % 1); s.stop(t + decay + 0.05);
  };
  const snare = (t: number, v = 1) => {
    noiseHit(t, "highpass", 1400, 0.55 * v, 0.17);
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 190; env(g, t, 0.35 * v, 0.1); o.connect(g).connect(master); o.start(t); o.stop(t + 0.12);
  };
  const hat = (t: number, open = false, v = 1) => noiseHit(t, "highpass", 7500, (open ? 0.22 : 0.16) * v, open ? 0.22 : 0.045);
  const crash = (t: number) => noiseHit(t, "highpass", 4500, 0.32, 1.4);
  const tom = (t: number, f0: number) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.22);
    env(g, t, 0.7, 0.28); o.connect(g).connect(master); o.start(t); o.stop(t + 0.3);
  };
  // A crunchy power chord: root, fifth and octave, sawtooth, through a soft clipper.
  const drive = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 6) * 0.9; }
  drive.curve = curve;
  const amp = ctx.createBiquadFilter(); amp.type = "lowpass"; amp.frequency.value = 2600;
  const ampGain = ctx.createGain(); ampGain.gain.value = 0.16;
  drive.connect(amp).connect(ampGain).connect(master);
  const power = (t: number, root: number, dur: number) => {
    for (const f of [root, root * 1.5, root * 2]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
      g.gain.setValueAtTime(0.5, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(drive); o.start(t); o.stop(t + dur + 0.02);
    }
  };
  const clap = (t: number) => { for (const d of [0, 0.011, 0.022]) noiseHit(t + d, "bandpass", 1500, 0.32, 0.09); };
  const synth = (t: number, freq: number, dur: number, type: OscillatorType, peak: number, cutoff: number) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.setValueAtTime(peak, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  };

  // 0–6s: drums alone, 100 BPM, ending in a tom fill.
  for (let b = 0; b < 8; b += 1) {
    const t = b * INTRO_BEAT;
    if (b % 2 === 0) kick(t); else snare(t);
    if (b % 4 === 2) kick(t + INTRO_BEAT * 0.5, 0.7);
    hat(t); hat(t + INTRO_BEAT / 2, b % 4 === 3);
  }
  // Into the drop: toms down the kit, then a snare roll that climbs.
  [300, 260, 220, 190].forEach((f, i) => tom(8 * INTRO_BEAT + i * (INTRO_BEAT / 4), f));
  for (let i = 0; i < 8; i += 1) snare(9 * INTRO_BEAT + i * (INTRO_BEAT / 8), 0.35 + i * 0.09);
  kick(INTRO_END - 0.05, 0.8);

  // 6–30s: fast, 150 BPM, A minor (Am F C G, a chord a bar). Bar 8 is a
  // drum break; the riff joins at bar 3; the arpeggio lifts the last bars.
  const ROOTS = [110, 87.31, 130.81, 98];
  const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  /** The riff's rhythm in eighth notes across one bar: 1 = a chord. */
  const RIFF = [1, 0, 1, 0, 0, 1, 1, 0];
  for (let b = 0; b < 60; b += 1) {
    const t = INTRO_END + b * BEAT;
    const bar = Math.floor(b / 4);
    const inBar = b % 4;
    const brk = bar === 7;
    const late = b >= 40;
    if (b % 16 === 0 || b === 32) crash(t);
    kick(t);
    if (inBar === 1 || inBar === 3) { snare(t); if (!brk) clap(t); }
    for (let s = 0; s < 4; s += 1) hat(t + (s * BEAT) / 4, s === 2 && inBar === 3, s % 2 === 0 ? 1 : 0.7);
    if (brk) {
      if (inBar === 3) for (let i = 0; i < 4; i += 1) snare(t + (i * BEAT) / 4, 0.5 + i * 0.15);
      continue;
    }
    const root = ROOTS[bar % 4];
    synth(t, root, BEAT * 0.45, "sawtooth", 0.2, 700);
    synth(t + BEAT / 2, root * 2, BEAT * 0.4, "sawtooth", 0.14, 900);
    if (bar >= 2) {
      for (let e = 0; e < 2; e += 1) if (RIFF[inBar * 2 + e]) power(t + (e * BEAT) / 2, root, BEAT * 0.42);
    } else if (inBar === 0 || inBar === 2) {
      for (const f of CHORDS[bar % 4]) synth(t + BEAT / 2, f, BEAT * 0.35, "square", 0.05, 2400);
    }
    if (late) {
      const chord = CHORDS[bar % 4];
      for (let s = 0; s < 4; s += 1) synth(t + (s * BEAT) / 4, chord[s % 3] * 2, BEAT / 4.5, "square", 0.04, 3200);
    }
  }
  // The last hit, then nothing: the music stops dead at 30s.
  kick(MUSIC_END - BEAT, 1.1); crash(MUSIC_END - BEAT);
  for (const f of CHORDS[0]) synth(MUSIC_END - BEAT, f, BEAT * 0.9, "square", 0.08, 3000);
  power(MUSIC_END - BEAT, ROOTS[0], BEAT * 0.95);

  // CATTIPU's own click on every real press in the fast section.
  if (click) {
    for (const t of clicks) {
      if (t < INTRO_END || t >= MUSIC_END) continue;
      const s = ctx.createBufferSource(); s.buffer = click;
      const g = ctx.createGain(); g.gain.value = 0.9;
      s.connect(g).connect(master); s.start(t);
    }
  }

  // Hard silence from 30s: cut the master, with a 30ms fade so it does not pop.
  master.gain.setValueAtTime(0.75, MUSIC_END - 0.03);
  master.gain.linearRampToValueAtTime(0, MUSIC_END);
  return ctx.startRendering();
}

const controls = animate(sequence);
controls.pause();
window.__ad = {
  duration: TOTAL,
  musicEnd: MUSIC_END,
  seek: async (time: number) => {
    loading = [];
    controls.time = time;
    await Promise.all(loading);
  },
  renderAudio,
};
