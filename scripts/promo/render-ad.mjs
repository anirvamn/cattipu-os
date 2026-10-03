// Renders the CATTIPU 90s spot (scripts/promo/ad.ts) to video.
//
//   node scripts/promo/record.mjs <app url>     (first: records the clips)
//   node scripts/promo/render-ad.mjs
//
// 1. bundles ad.ts (one Motion timeline) with the repository's own esbuild
// 2. opens it in headless Chrome or Edge (a throwaway profile, never yours)
// 3. seeks the paused Motion sequence frame by frame, waiting for each
//    frame's images, and captures every frame exactly
// 4. records the frames into docs/media/cattipu-ad.mp4 with the browser's
//    MediaRecorder — silent by default
// 5. writes docs/media/cattipu-ad.gif, a teaser of the fast section, with
//    Python + Pillow
//
// Settings (environment variables):
//   AD_SPEED=1.5     playback speed of the whole spot (default 1.5: fast)
//   AD_AUDIO=1       include the synthesized retro soundtrack (default off);
//                    it is played at AD_SPEED too, so it stays in sync
//   AD_FRAMES_DIR=…  keep the individual frames
//
// Needs: Chrome or Edge (or CHROME=<path>), Python 3 with Pillow for the GIF.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { launch } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FPS = 25;
const SPEED = Number(process.env.AD_SPEED ?? 1.5);
const AUDIO = process.env.AD_AUDIO === "1";
if (!(SPEED > 0)) throw new Error("AD_SPEED must be a positive number.");
const W = 640;
const H = 480;
const CLIPS_DIR = join(ROOT, "scripts", "promo", ".cache", "clips");
const OUT_MP4 = join(ROOT, "docs", "media", "cattipu-ad.mp4");
const OUT_GIF = join(ROOT, "docs", "media", "cattipu-ad.gif");
const url = (p) => pathToFileURL(p).href;
const asset = (p) => url(join(ROOT, p));

if (!existsSync(CLIPS_DIR)) throw new Error("No recorded clips. Run: node scripts/promo/record.mjs <app url>");
const clips = {};
for (const name of readdirSync(CLIPS_DIR)) {
  const meta = JSON.parse(readFileSync(join(CLIPS_DIR, name, "clip.json"), "utf8"));
  clips[name] = {
    duration: meta.duration,
    showCursor: meta.showCursor,
    cursor: meta.cursor,
    frames: meta.frames.map((f) => ({ url: url(join(CLIPS_DIR, name, f.file)), t: f.t })),
  };
}

const work = mkdtempSync(join(tmpdir(), "cattipu-ad-"));

// ── 1. the page ──────────────────────────────────────────────────────────
const bundle = await build({
  entryPoints: [join(ROOT, "scripts", "promo", "ad.ts")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  tsconfig: join(ROOT, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const paper = asset("public/assets/cattipu/engineering-paper-8px.png");
const css = `
@font-face { font-family: "Px437"; src: url("${asset("public/fonts/Web437_IBM_VGA_8x16.woff")}"); }
@font-face { font-family: "Ark"; src: url("${asset("public/fonts/ArkPixel-12px-Proportional-Latin.woff2")}"); }
html, body { margin: 0; background: #000; }
#stage { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: #000;
  filter: saturate(1.25) contrast(1.06) blur(0.45px); }
.shot { position: absolute; inset: 0; opacity: 0; overflow: hidden; }
.frame { position: absolute; left: 0; top: 0; width: 1600px; height: 900px; transform-origin: 0 0; }
.fill { position: absolute; left: 0; top: 0; width: 1600px; height: 900px; }
.cursor { position: absolute; left: 0; top: 0; width: 27px; height: 42px; image-rendering: pixelated; transform-origin: 2px 2px; }
.cursor.hand { width: 64px; height: 64px; transform-origin: 18px 2px; }
.card { display: grid; place-items: center; }
.card-stack { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.card-text { font-family: "Px437", monospace; letter-spacing: 1px; text-align: center; padding: 0 28px; line-height: 1;
  text-shadow: 2px 0 rgba(255,60,60,.55), -2px 0 rgba(60,200,255,.35); }
.headline { position: absolute; left: 0; top: 218px; white-space: nowrap; font-family: "Px437", monospace;
  font-size: 44px; line-height: 1; color: #ff1e1e; }
.fly { position: absolute; left: 304px; top: 224px; width: 32px; height: 32px; image-rendering: pixelated; opacity: 0; }
.badge { width: 330px; height: 330px; border-radius: 50%; background: #C6971F; color: #002A73; display: grid;
  place-items: center; text-align: center; font-family: "Px437", monospace; font-size: 40px; line-height: 1.1;
  padding: 40px; box-sizing: border-box; box-shadow: inset 0 0 0 6px #002A73; }
.wall { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; transform-origin: 50% 50%; image-rendering: pixelated; }
.glitch { color: #ff1e1e; font-size: 96px; filter: blur(0.6px); }
.solo { width: 192px; height: 192px; image-rendering: pixelated; }
.paper { background-image: url("${paper}") !important; }
.page { background: #f7f5ef; }
.page-text { font-family: "Ark", serif; font-size: 44px; color: #111; letter-spacing: 0.5px; }
.page-caret { font-family: "Ark", serif; margin-left: 2px; color: #111; }
.flash { background: #fffbe8; }
.end-plate { background: #E9DFC4 url("${paper}"); display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; }
.end-logo { width: 170px; image-rendering: pixelated; }
.end-name { font-family: "Px437", monospace; font-size: 46px; color: #002A73; letter-spacing: 2px; }
.end-tag { font-family: "Ark", monospace; font-size: 24px; color: #1d1d1d; }
.end-url { font-family: "Ark", monospace; font-size: 18px; color: #A40000; }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.scan { background: repeating-linear-gradient(0deg, rgba(0,0,0,.20) 0 1px, transparent 1px 3px); }
.vignette { background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.55) 100%); }
.grain { opacity: .07; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='128' height='128' filter='url(%23n)'/></svg>"); }
.band { height: 26px; inset: auto 0 auto 0; top: 0; background: linear-gradient(transparent, rgba(255,255,255,.10), transparent); }
`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div id="stage"></div><canvas id="out" width="${W}" height="${H}" style="display:none"></canvas>
<script>window.__AD_BASE__ = ${JSON.stringify(url(ROOT))}; window.__CLIPS__ = ${JSON.stringify(clips)};</script>
<script>${bundle.outputFiles[0].text}</script></body></html>`;
const page = join(work, "ad.html");
writeFileSync(page, html);

// ── 2. the browser ───────────────────────────────────────────────────────
const b = await launch({ width: W, height: H, args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"] });
try {
  await b.send("Page.navigate", { url: url(page) });
  for (let i = 0; i < 60; i += 1) {
    if (await b.evaluate("!!window.__ad").catch(() => false)) break;
    await b.wait(200);
  }
  await b.evaluate("document.fonts.ready.then(() => true)");
  const duration = await b.evaluate("window.__ad.duration");
  const musicEnd = await b.evaluate("window.__ad.musicEnd");
  const total = Math.round((duration / SPEED) * FPS);
  console.log(`spot ${duration.toFixed(2)}s at ${SPEED}x = ${(duration / SPEED).toFixed(2)}s, ${total} frames at ${FPS} fps, ${AUDIO ? `sound (music to ${musicEnd}s)` : "silent"}`);

  // ── 3. frame-exact capture ─────────────────────────────────────────────
  const framesDir = process.env.AD_FRAMES_DIR ? resolve(process.env.AD_FRAMES_DIR) : join(work, "frames");
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const frameFile = (f) => join(framesDir, `f${String(f).padStart(4, "0")}.jpg`);
  for (let f = 0; f < total; f += 1) {
    await b.evaluate(`window.__ad.seek(${((f / FPS) * SPEED).toFixed(4)}).then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))`);
    const shot = await b.send("Page.captureScreenshot", { format: "jpeg", quality: 92, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
    writeFileSync(frameFile(f), Buffer.from(shot.data, "base64"));
    if (f % 250 === 0) console.log(`  frame ${f}/${total}`);
  }
  console.log("frames captured");

  // ── 4. MP4 (and, with AD_AUDIO=1, its sound), recorded by the browser ───
  const frameUrls = Array.from({ length: total }, (_, f) => url(frameFile(f)));
  const encoded = await b.evaluate(`(async () => {
    const urls = ${JSON.stringify(frameUrls)};
    const withAudio = ${AUDIO};
    const audioBuffer = withAudio ? await window.__ad.renderAudio() : null;
    const canvas = document.getElementById('out');
    const g = canvas.getContext('2d');
    const cache = new Map();
    const get = (f) => {
      if (!cache.has(f) && f < urls.length) cache.set(f, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = urls[f]; }));
      return cache.get(f);
    };
    for (let f = 0; f < 50; f += 1) get(f);
    g.drawImage(await get(0), 0, 0);
    // The soundtrack is rendered at 22 kHz for its period sound; playback
    // resamples it to the device rate the encoder expects, at the spot's speed.
    const ac = withAudio ? new AudioContext() : null;
    let src = null;
    const tracks = [...canvas.captureStream(${FPS}).getVideoTracks()];
    if (ac) {
      await ac.resume();
      const dest = ac.createMediaStreamDestination();
      src = ac.createBufferSource(); src.buffer = audioBuffer; src.playbackRate.value = ${SPEED}; src.connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
    }
    const stream = new MediaStream(tracks);
    const types = withAudio ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus'] : ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9'];
    const type = types.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, withAudio ? { mimeType: type, videoBitsPerSecond: 6000000, audioBitsPerSecond: 192000 } : { mimeType: type, videoBitsPerSecond: 6000000 });
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    rec.start();
    if (src) src.start();
    const t0 = performance.now();
    for (let f = 0; f < urls.length; f += 1) {
      const img = await get(f);
      if (img) g.drawImage(img, 0, 0);
      cache.delete(f - 2);
      for (let k = 1; k <= 50; k += 1) get(f + k);
      const wait = t0 + (f + 1) * ${1000 / FPS} - performance.now();
      await new Promise((r) => setTimeout(r, Math.max(0, wait)));
    }
    rec.stop(); await done; if (ac) await ac.close();
    const blob = new Blob(chunks, { type });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return type + '|' + btoa(s);
  })()`);
  const cut = encoded.indexOf("|");
  const mime = encoded.slice(0, cut);
  const outVideo = mime.startsWith("video/mp4") ? OUT_MP4 : OUT_MP4.replace(/\.mp4$/, ".webm");
  writeFileSync(outVideo, Buffer.from(encoded.slice(cut + 1), "base64"));
  console.log(`video ${outVideo} (${mime})`);

  // ── 5. GIF teaser for the README: spot time 6–18s, at the spot's speed ──
  const py = spawnSync(process.platform === "win32" ? "python" : "python3", [
    join(ROOT, "scripts", "promo", "frames-to-gif.py"), framesDir, OUT_GIF, String(Math.round((6 / SPEED) * FPS)), String(Math.round((18 / SPEED) * FPS)),
  ], { stdio: "inherit" });
  if (py.status !== 0) console.warn("GIF skipped: Python with Pillow is needed.");
} finally {
  await b.close();
  try { rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* left in temp */ }
}
