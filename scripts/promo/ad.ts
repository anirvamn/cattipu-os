/**
 * CATTIPU OS — a 90s-style TV spot, built with Motion (framer-motion).
 *
 *   0–2.7s  silence: a red headline streaks across black
 *   2.7–6s  drums enter (90 BPM) as CATTIPU's pixel app icons fly out
 *   6–30s   double time (the same pulse at 180): hard cuts, every one on the beat,
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
const INTRO_BPM = 90;
const FAST_BPM = 180;
const INTRO_BEAT = 60 / INTRO_BPM; // 0.667s
const BEAT = 60 / FAST_BPM; // 0.333s: the same pulse in double time
/** Six beats of silence under the headline, then five of drums. */
const SILENT_BEATS = 6;
const INTRO_END = (SILENT_BEATS + 5) * INTRO_BEAT; // 7.33s
const FAST_BEATS = 72;
const MUSIC_END = INTRO_END + FAST_BEATS * BEAT; // 31.33s
const TOTAL = MUSIC_END + 10; // 41.33s, the last 10s silent

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
  // Like the reference ad: one scroll at a constant speed, right to left,
  // in from beyond the right edge and out past the left. No easing, no
  // stop — the sentence reads as it passes.
  const pos = motionValue(0);
  pos.on("change", (v) => {
    const from = W + 12;
    const to = -t.offsetWidth - 12;
    t.style.transform = `translateX(${(from + (to - from) * v).toFixed(2)}px)`;
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

headline("What will we build today?", 0.05, SILENT_BEATS * INTRO_BEAT - 0.07);
flyingIcons(SILENT_BEATS * INTRO_BEAT, INTRO_END - SILENT_BEATS * INTRO_BEAT);

// ── 6–30s: double time. Every cut on the beat ───────────────────────────────────
let beatsUsed = 0;
const beat = (n: number) => { const at = INTRO_END + beatsUsed * BEAT; beatsUsed += n; return { at, dur: n * BEAT }; };
/** The widest 4:3 crop of a 16:9 screen. */
const FULL: Crop = { x: 200, y: 0, w: 1200 };

{
  let s = beat(4);
  const bootCrop = around(800, 470, 760);
  clip("boot", bootCrop, zoomIn(bootCrop, 0.8), s.at, s.dur, { from: 2.6, speed: 1.4 });
  flash(s.at);

  s = beat(4);
  const dbl = pressOf("desktop-hand", 0);
  const handCrop = around(dbl.x + 40, dbl.y + 30, 300);
  clip("desktop-hand", around(dbl.x + 60, dbl.y + 60, 520), handCrop, s.at, s.dur, { from: 0.6, speed: 1.6, hand: true });

  s = beat(1);
  wallpaperFlash(1, s.at, BEAT / 2);
  wallpaperFlash(3, s.at + BEAT / 2, BEAT / 2);

  const typeClick = pressOf("architect-type", 0);
  s = beat(4);
  // The typed text starts at the field's left edge (about x 320, y 277).
  clip("architect-type", around(typeClick.x - 40, typeClick.y + 10, 440), around(typeClick.x + 20, typeClick.y + 5, 340), s.at, s.dur, { from: typeClick.t - 0.1, speed: 1.9 });

  const gen = pressOf("architect-type", 1);
  s = beat(3);
  clip("architect-type", around(gen.x - 30, gen.y + 10, 300), around(gen.x - 10, gen.y + 5, 220), s.at, s.dur, { from: gen.t - 0.55, speed: 1 });

  s = beat(2);
  clip("architect-type", { x: 120, y: 60, w: 1200 }, { x: 200, y: 120, w: 1000 }, s.at, s.dur, { from: gen.t + 1.2, speed: 3.5 });

  s = beat(3);
  card([{ text: "CATTIPU helps you", size: 26, color: "#f2ead6" }, { text: "plan", size: 120, color: "#c46bd1" }], s.at, s.dur);
  flash(s.at);

  const right = pressOf("menu", 0);
  s = beat(4);
  clip("menu", around(right.x + 120, right.y + 110, 520), around(right.x + 140, right.y + 130, 440), s.at, s.dur, { from: right.t - 0.15, speed: 1.75 });

  const max = pressOf("maximize", 0);
  s = beat(3);
  clip("maximize", around(max.x - 20, max.y + 20, 240), around(max.x - 10, max.y + 10, 170), s.at, s.dur, { from: max.t - 0.45, speed: 1.2 });

  s = beat(2);
  badge("WHAT WILL WE BUILD TODAY?", s.at, s.dur);

  s = beat(2);
  still("explorer", { x: 100, y: 80, w: 640 }, { x: 110, y: 200, w: 520 }, s.at, s.dur);

  const build = pressOf("forge-build", 0);
  s = beat(4);
  clip("forge-build", around(build.x - 380, build.y + 40, 900), around(build.x - 720, build.y + 80, 440), s.at, s.dur, { from: Math.max(0, build.t - 0.4), speed: 0.85 });

  s = beat(3);
  card([{ text: "build", size: 130, color: "#ff3b30" }], s.at, s.dur);
  flash(s.at);

  const go = pressOf("launch-run", 0);
  s = beat(4);
  clip("launch-run", around(go.x - 390, go.y + 40, 900), around(go.x - 740, go.y + 95, 420), s.at, s.dur, { from: Math.max(0, go.t - 0.4), speed: 0.8 });

  s = beat(6);
  clip("shooter", { x: 0, y: 0, w: 1200 }, { x: 260, y: 80, w: 940 }, s.at, s.dur, { from: 0.5, speed: 1 });
  s = beat(4);
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
    (at) => still("built-app-dark", { x: 300, y: 0, w: 1100 }, { x: 350, y: 30, w: 1000 }, at, half),
    (at) => still("launch", { x: 300, y: 120, w: 900 }, { x: 340, y: 150, w: 800 }, at, half),
    (at) => clip("shooter", { x: 300, y: 80, w: 1000 }, { x: 360, y: 110, w: 880 }, at, half, { from: 3.0 }),
  ];
  items.forEach((add, i) => add(s.at + i * half));
}
if (Math.abs(INTRO_END + beatsUsed * BEAT - MUSIC_END) > 1e-6) throw new Error(`the fast section is ${beatsUsed} beats, not ${FAST_BEATS}`);
flash(MUSIC_END - 0.04);

// ── 30–40s: silence. The rocket, then the line, the logo ──
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
  // The Launch rocket lifts off on engineering paper.
  const at = MUSIC_END + 0.35;
  const { el, icon } = iconPlate("launch", "#E9DFC4", at, 2.0);
  el.classList.add("paper");
  sequence.push([icon, { y: [40, 30, -260] }, { at, duration: 1.95, ease: "easeIn" }]);
}
{
  // "What will we build" typed on a white page, the line left hanging.
  const at = MUSIC_END + 2.35;
  const dur = 3.4;
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
  const at = MUSIC_END + 5.75;
  const dur = 1.4;
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
  const at = MUSIC_END + 7.15;
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
  url.textContent = "github.com/anirvamn/cattipu-os";
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

// ── the soundtrack: a 90s PC / TV-ad sound ──────────────────────────────
// Original music, made the way mid-90s computers made it: two-operator FM
// voices (the AdLib / Sound Blaster sound) for the bass, the brass hook and
// the electric piano; the era's orchestra hit; a breakbeat with a gated-
// reverb snare. Rendered at 22,050 Hz through an 8-bit-style crusher and
// a TV-speaker band, so it sounds like it is coming out of a 1996 PC.
const RATE = 22050;

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

  // The output stage: bus → compressor → 8-bit-style crusher → TV band → headroom.
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 5;
  const crush = ctx.createWaveShaper();
  const steps = 96;
  const curve = new Float32Array(4096);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(Math.tanh(x * 1.4) * steps) / steps;
  }
  crush.curve = curve;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 70;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7200;
  // Headroom after the filters: they and the AAC encoder overshoot a little.
  const out = ctx.createGain(); out.gain.value = 0.8;
  master.connect(comp).connect(crush).connect(hp).connect(lp).connect(out).connect(ctx.destination);

  const noise = noiseBuffer(ctx, 2);
  const click = await loadSample(ctx, "public/sounds/window-open.wav");

  // Gated reverb: a short, flat, abruptly cut tail.
  const gate = ctx.createConvolver();
  const ir = ctx.createBuffer(2, Math.round(RATE * 0.16), RATE);
  for (let c = 0; c < 2; c += 1) {
    const d = ir.getChannelData(c);
    let r = 777 + c;
    for (let i = 0; i < d.length; i += 1) { r = (r * 16807) % 2147483647; d[i] = ((r / 2147483647) * 2 - 1) * 0.55; }
  }
  gate.buffer = ir;
  const gateOut = ctx.createGain(); gateOut.gain.value = 0.45;
  gate.connect(gateOut).connect(master);

  const env = (g: GainNode, t: number, peak: number, decay: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  };
  const kick = (t: number, v = 1) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    env(g, t, 1.0 * v, 0.3); o.connect(g).connect(master); o.start(t); o.stop(t + 0.34);
  };
  const noiseHit = (t: number, type: BiquadFilterType, freq: number, peak: number, decay: number, to: AudioNode = master) => {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, peak, decay);
    src.connect(f).connect(g).connect(to); src.start(t, (t * 7.3) % 1); src.stop(t + decay + 0.05);
    return g;
  };
  const snare = (t: number, v = 1) => {
    const g = noiseHit(t, "bandpass", 1900, 0.6 * v, 0.14);
    g.connect(gate);
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.frequency.value = 200; env(og, t, 0.4 * v, 0.08); o.connect(og).connect(master); o.start(t); o.stop(t + 0.1);
  };
  const ghost = (t: number) => noiseHit(t, "bandpass", 2200, 0.12, 0.05);
  const hat = (t: number, open = false, v = 1) => noiseHit(t, "highpass", 6000, (open ? 0.2 : 0.13) * v, open ? 0.18 : 0.035);
  const crash = (t: number) => noiseHit(t, "highpass", 3800, 0.28, 1.1);
  const tom = (t: number, f0: number) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.2);
    env(g, t, 0.75, 0.26); o.connect(g).connect(master); o.connect(gate); o.start(t); o.stop(t + 0.3);
  };

  /** A two-operator FM voice: a modulator sine into the carrier's frequency. */
  const fm = (t: number, freq: number, dur: number, o: { ratio: number; index: number; peak: number; attack?: number; indexEnd?: number; carrier?: OscillatorType }) => {
    const car = ctx.createOscillator(); car.type = o.carrier ?? "sine"; car.frequency.value = freq;
    const mod = ctx.createOscillator(); mod.frequency.value = freq * o.ratio;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(freq * o.index, t);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, freq * (o.indexEnd ?? o.index * 0.2)), t + dur);
    mod.connect(depth).connect(car.frequency);
    const g = ctx.createGain();
    const attack = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.peak, t + attack);
    g.gain.setValueAtTime(o.peak, t + Math.max(attack, dur * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g).connect(master);
    car.start(t); mod.start(t); car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
  };
  const bass = (t: number, f: number, dur: number) => fm(t, f, dur, { ratio: 1, index: 2.6, indexEnd: 0.4, peak: 0.42 });
  const brass = (t: number, f: number, dur: number, peak = 0.16) => fm(t, f, dur, { ratio: 1, index: 3.2, indexEnd: 1.4, peak, attack: 0.025 });
  const epiano = (t: number, f: number, dur: number) => fm(t, f, dur, { ratio: 14, index: 0.9, indexEnd: 0.05, peak: 0.07 });
  /** The 90s orchestra hit: a brassy FM chord over a low octave and a noise bite. */
  const orchHit = (t: number, chord: number[], v = 1) => {
    for (const f of [chord[0] / 2, ...chord, chord[0] * 2]) fm(t, f, 0.42, { ratio: 1, index: 4.5, indexEnd: 0.8, peak: 0.11 * v, attack: 0.003 });
    for (const f of [chord[0] / 2, chord[0]]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const g = ctx.createGain(); env(g, t, 0.12 * v, 0.38); o.connect(g).connect(master); o.connect(gate); o.start(t); o.stop(t + 0.42);
    }
    noiseHit(t, "bandpass", 1200, 0.35 * v, 0.09);
  };

  // 0–2.7s: nothing under the headline. Then a 90 BPM breakbeat: three beats
  // of groove, toms down the kit, a snare roll into the drop.
  for (let b = SILENT_BEATS; b < SILENT_BEATS + 3; b += 1) {
    const t = b * INTRO_BEAT;
    const k = b - SILENT_BEATS;
    if (k === 0) kick(t);
    if (k === 1) { snare(t); kick(t + INTRO_BEAT * 0.75, 0.8); }
    if (k === 2) { kick(t, 0.9); kick(t + INTRO_BEAT * 0.5, 0.7); }
    ghost(t + INTRO_BEAT * 0.75);
    hat(t); hat(t + INTRO_BEAT / 2, k === 2);
  }
  [300, 250, 200, 160].forEach((f, i) => tom((SILENT_BEATS + 3) * INTRO_BEAT + i * (INTRO_BEAT / 4), f));
  for (let i = 0; i < 8; i += 1) snare((SILENT_BEATS + 4) * INTRO_BEAT + i * (INTRO_BEAT / 8), 0.3 + i * 0.09);

  // 6–30s: double time (180), A minor: Am F C G, a chord a bar. Bar 9 is a
  // break of drums and orchestra hits. The FM brass hook enters at bar 3.
  const ROOTS = [110, 87.31, 130.81, 98];
  const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  /** The hook, an eighth note at a time across one bar per chord (0 = rest). */
  const HOOK = [
    [440, 0, 523.25, 0, 659.25, 587.33, 523.25, 0],
    [440, 0, 392, 440, 0, 523.25, 0, 0],
    [659.25, 0, 783.99, 0, 659.25, 587.33, 523.25, 0],
    [587.33, 0, 493.88, 0, 392, 0, 0, 0],
  ];
  /** The slap-bass line in eighths: 1 = root, 2 = octave, 0 = rest. */
  const BASS = [1, 0, 2, 1, 0, 1, 2, 0];
  const E = BEAT / 2;
  orchHit(INTRO_END, CHORDS[0]);
  for (let b = 0; b < FAST_BEATS; b += 1) {
    const t = INTRO_END + b * BEAT;
    const bar = Math.floor(b / 4);
    const inBar = b % 4;
    const brk = bar === 8;
    const chord = CHORDS[bar % 4];
    const root = ROOTS[bar % 4];
    if (b % 16 === 0 && b > 0) crash(t);
    // Breakbeat in double time: kick on 1, the "and" of 2 and 3; snare on 2 and 4.
    if (inBar === 0 || inBar === 2) kick(t);
    if (inBar === 1) kick(t + E, 0.75);
    if (inBar === 1 || inBar === 3) snare(t);
    if (inBar === 2) ghost(t + E);
    hat(t, false, 1); hat(t + E, inBar === 3, 0.75);
    if (brk) {
      if (inBar === 0 || inBar === 2) orchHit(t, chord, 0.9);
      if (inBar === 3) for (let i = 0; i < 4; i += 1) snare(t + (i * BEAT) / 4, 0.45 + i * 0.15);
      continue;
    }
    for (let e = 0; e < 2; e += 1) {
      const n = BASS[inBar * 2 + e];
      if (n) bass(t + e * E, root * n, E * 0.9);
    }
    if (inBar === 1 || inBar === 3) for (const f of chord) epiano(t + E, f, E * 1.6);
    if (inBar === 0 && bar % 2 === 0 && bar > 0) orchHit(t, chord, 0.75);
    if (bar >= 2) {
      const line = HOOK[bar % 4];
      const lift = bar >= 12 ? 2 : 1;
      for (let e = 0; e < 2; e += 1) {
        const f = line[inBar * 2 + e];
        if (f) brass(t + e * E, f * lift, E * 0.95, lift > 1 ? 0.12 : 0.16);
      }
    }
  }

  // The last hit, then nothing: the music stops dead at 30s.
  orchHit(MUSIC_END - BEAT, CHORDS[0], 1.2);
  kick(MUSIC_END - BEAT, 1.1); crash(MUSIC_END - BEAT);

  // CATTIPU's own click on every real press in the fast section.
  if (click) {
    for (const t of clicks) {
      if (t < INTRO_END || t >= MUSIC_END) continue;
      const src = ctx.createBufferSource(); src.buffer = click;
      const g = ctx.createGain(); g.gain.value = 0.8;
      src.connect(g).connect(master); src.start(t);
    }
  }

  // Hard silence from 30s: cut the bus, with a 30ms fade so it does not pop.
  master.gain.setValueAtTime(0.5, MUSIC_END - 0.03);
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
