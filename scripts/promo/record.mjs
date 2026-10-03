// Records the live CATTIPU app as moving clips for the promo spot.
//
//   npm run dev                                   (in one shell)
//   node scripts/promo/record.mjs http://localhost:3000
//
// Every clip is real: CATTIPU running in headless Chrome, driven by real
// mouse and keyboard input (hover highlights, presses and typing really
// happen), captured by Chrome's screencast at every repaint. Demo projects
// are built by Forge and launched by Launch through the app itself. Each
// clip is saved to scripts/promo/.cache/clips/<name>/ as JPEG frames plus
// clip.json: frame timestamps and the cursor path, so the spot can draw
// CATTIPU's pixel cursor exactly where each real click happened.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = join(ROOT, "scripts", "promo", ".cache", "clips");
const W = 1600;
const H = 900;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Warm the server first: a dev server compiles the page on its first
// request, and the boot clip should record the boot, not the compile.
for (let i = 0; i < 3; i += 1) await fetch(APP).then((r) => r.text()).catch(() => "");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const b = await launch({ width: W, height: H, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });

// ── recording ────────────────────────────────────────────────────────────
let current = null;
let mouse = { x: W - 40, y: H - 40 };
b.on("Page.screencastFrame", (p) => {
  void b.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
  if (current) current.frames.push({ t: p.metadata.timestamp, data: p.data });
});
const now = () => Date.now() / 1000;
const note = (down = false, kind = "move") => current?.cursor.push({ t: now(), x: mouse.x, y: mouse.y, down, kind });

async function clip(name, run, { showCursor = true } = {}) {
  current = { frames: [], cursor: [], start: now(), showCursor };
  note();
  await b.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  try {
    await run();
  } finally {
    await b.wait(250);
    await b.send("Page.stopScreencast").catch(() => {});
  }
  const c = current;
  current = null;
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const t0 = c.frames[0]?.t ?? c.start;
  const frames = c.frames.map((f, i) => {
    const file = `${String(i).padStart(4, "0")}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(f.data, "base64"));
    return { file, t: +(f.t - t0).toFixed(3) };
  });
  const cursor = c.cursor.map((k) => ({ ...k, t: +(k.t - t0).toFixed(3) }));
  writeFileSync(join(dir, "clip.json"), JSON.stringify({ name, width: W, height: H, showCursor: c.showCursor, duration: frames.at(-1)?.t ?? 0, frames, cursor }));
  log("clip", name, `${frames.length} frames, ${(frames.at(-1)?.t ?? 0).toFixed(1)}s`);
}

// ── real input ───────────────────────────────────────────────────────────
async function moveTo(x, y, ms = 450) {
  const steps = Math.max(4, Math.round(ms / 16));
  const from = { ...mouse };
  for (let i = 1; i <= steps; i += 1) {
    const k = i / steps;
    const e = 1 - (1 - k) * (1 - k);
    mouse = { x: Math.round(from.x + (x - from.x) * e), y: Math.round(from.y + (y - from.y) * e) };
    await b.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mouse.x, y: mouse.y });
    note();
    await b.wait(ms / steps);
  }
}
async function press(button = "left", clickCount = 1) {
  await b.send("Input.dispatchMouseEvent", { type: "mousePressed", x: mouse.x, y: mouse.y, button, clickCount });
  note(true, button === "right" ? "right" : "press");
  await b.wait(90);
  await b.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mouse.x, y: mouse.y, button, clickCount });
  note(false, "release");
}
async function click(x, y, ms) { await moveTo(x, y, ms); await b.wait(80); await press(); }
async function dblclick(x, y, ms) { await moveTo(x, y, ms); await b.wait(80); await press("left", 1); await b.wait(60); await press("left", 2); }
async function type(text, perChar = 55) {
  for (const ch of text) {
    await b.send("Input.insertText", { text: ch });
    await b.wait(perChar);
  }
}
async function key(k, code, modifiers = 0, keyCode) {
  for (const type of ["rawKeyDown", "keyUp"]) {
    await b.send("Input.dispatchKeyEvent", { type, key: k, code, modifiers, windowsVirtualKeyCode: keyCode });
  }
}

// ── the app ──────────────────────────────────────────────────────────────
const HELPERS = `(() => {
  if (!document.getElementById('promo-style')) {
    const s = document.createElement('style'); s.id = 'promo-style';
    s.textContent = 'nextjs-portal{display:none!important} .cattipu-forge__path{visibility:hidden!important}';
    document.head.appendChild(s);
  }
  let r; window.webpackChunk_N_E.push([[Symbol('promo')], {}, (x) => { r = x; }]);
  const S = (n) => r('(app-pages-browser)/./store/' + n + '.ts')[n];
  const $ = (q) => document.querySelector(q);
  window.__p = {
    S, $,
    center(q) { const el = typeof q === 'string' ? $(q) : q; if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; },
    win: (id) => $('[data-window-id="' + id + '"]'),
    closeAll() { for (const w of document.querySelectorAll('[data-window-id][data-visible="true"]')) w.querySelector('[aria-label="Close window"]')?.click(); },
    project: (name) => S('useProjectStore').getState().projects.find((p) => p.name === name),
    open(name) { S('useProjectStore').getState().openProject(this.project(name).id); },
    btn(root, text) { return [...root.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase() === text.toLowerCase()); },
  };
  return true;
})()`;
const ev = (body) => b.evaluate(`(async () => { const p = window.__p; ${body} })()`);
const at = async (expr) => {
  const c = await ev(`return p.center(${expr});`);
  if (!c) throw new Error(`not on screen: ${expr}`);
  return c;
};
async function ready() {
  for (let i = 0; i < 80; i += 1) {
    if (await b.evaluate("!!window.webpackChunk_N_E && !!document.querySelector('[data-sidebar-item]')").catch(() => false)) break;
    await b.wait(250);
  }
  await b.wait(1200);
  await b.evaluate(HELPERS);
}

const src = (f) => readFileSync(join(ROOT, "scripts", "promo", "apps", f), "utf8");
const page = (title) => `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n<script type="module" src="/src/main.ts"></script>\n</body>\n</html>\n`;
const HABIT = {
  "index.html": '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Habit Tracker</title></head>\n<body>\n<main id="app"></main>\n<script type="module" src="/src/main.ts"></script>\n</body>\n</html>\n',
  "src/style.css": ':root{--bg:#f4efe2;--ink:#1d2a5c;--card:#fffaf0;--ok:#2f7d32}\n.dark{--bg:#14171f;--ink:#e9e4d6;--card:#1f2430;--ok:#7bd88f}\nbody{margin:0;background:var(--bg);color:var(--ink);font:18px/1.4 "Courier New",monospace}\nmain{max-width:620px;margin:56px auto;padding:0 16px}\nh1{font-size:32px;margin:0 0 4px}\n.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}\nbutton{font:inherit;border:2px solid var(--ink);background:var(--card);color:var(--ink);padding:6px 12px;cursor:pointer}\nli{list-style:none;display:flex;justify-content:space-between;align-items:center;background:var(--card);border:2px solid var(--ink);padding:14px 18px;margin-bottom:10px;cursor:pointer}\n.streak{color:var(--ok);font-weight:bold}\nul{padding:0}\n',
  "src/habits.ts": 'export interface Habit { name: string; streak: number; doneToday: boolean }\nexport const START: Habit[] = [\n  { name: "Write code", streak: 12, doneToday: true },\n  { name: "Read 20 pages", streak: 5, doneToday: false },\n  { name: "Walk 30 minutes", streak: 9, doneToday: true },\n  { name: "Drink water", streak: 21, doneToday: false },\n];\n',
  "src/main.ts": 'import "./style.css";\nimport { START, type Habit } from "./habits";\nconst habits: Habit[] = START.map((h) => ({ ...h }));\nconst app = document.getElementById("app") as HTMLElement;\nlet dark = false;\nfunction render(): void {\n  document.body.classList.toggle("dark", dark);\n  app.innerHTML = "";\n  const top = document.createElement("div");\n  top.className = "top";\n  top.innerHTML = "<div><h1>Habit Tracker</h1><small>Built and launched by CATTIPU OS</small></div>";\n  const mode = document.createElement("button");\n  mode.id = "mode";\n  mode.textContent = dark ? "Light mode" : "Dark mode";\n  mode.onclick = () => { dark = !dark; render(); };\n  top.append(mode);\n  const list = document.createElement("ul");\n  for (const h of habits) {\n    const li = document.createElement("li");\n    li.innerHTML = "<span>" + (h.doneToday ? "[x] " : "[ ] ") + h.name + "</span><span class=streak>" + h.streak + " day streak</span>";\n    li.onclick = () => { h.doneToday = !h.doneToday; h.streak += h.doneToday ? 1 : -1; render(); };\n    list.append(li);\n  }\n  app.append(top, list);\n}\nrender();\n',
};

async function makeProject(name, files) {
  await ev(`
    p.closeAll(); p.$('[data-sidebar-item="projects"]').click(); await new Promise((r) => setTimeout(r, 400));
    const input = p.$('input[placeholder="Project name"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    p.btn(p.win('projects'), 'CREATE').click();
    await new Promise((r) => setTimeout(r, 500));
    const files = ${JSON.stringify(Object.entries(files).map(([path, content]) => ({ path, content })))};
    p.S('useFilesystemStore').getState().applyFileWrites(p.project(${JSON.stringify(name)}).id, files);
  `);
}
/** Builds and launches a project through Forge and Launch (not recorded). */
async function buildAndLaunch(name) {
  return ev(`
    const id = p.project(${JSON.stringify(name)}).id;
    await p.S('useForgeStore').getState().build(id, 'web-app', 'production');
    const build = p.S('useProjectStore').getState().projects.find((x) => x.id === id).forge.builds.at(-1);
    if (build.status !== 'success') throw new Error(${JSON.stringify(name)} + ' did not build: ' + build.summary);
    await p.S('useLaunchStore').getState().launch(id, build.id);
    const session = p.S('useLaunchStore').getState().sessions[id];
    if (!session?.runtime) throw new Error(${JSON.stringify(name)} + ' did not launch: ' + (session?.error?.message ?? 'no runtime'));
    return session.runtime.endpoint;
  `);
}
/** Every project this run launched, so the run can stop them all at the end. */
const launched = [];
async function stopAll() {
  for (const projectId of launched) {
    await fetch(`${APP}/api/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", projectId }) }).catch(() => {});
  }
}

// Whatever happens below, stop the apps this run launched and close the browser.
const finish = async () => { await stopAll(); await b.close(); };
try {
// ── 0. boot ──────────────────────────────────────────────────────────────
await clip("boot", async () => {
  await b.send("Page.navigate", { url: APP });
  await b.wait(4200);
}, { showCursor: false });
await ready();

// Demo projects. The game is built and launched now; Habit Tracker is
// built on camera below.
await makeProject("Star Forge", { "index.html": page("Star Forge"), "src/main.ts": src("shooter.ts") });
const shooterUrl = await buildAndLaunch("Star Forge");
await makeProject("Habit Tracker", HABIT);
launched.push(...(await ev(`return ['Star Forge', 'Habit Tracker'].map((n) => p.project(n).id);`)));
log("demo app", shooterUrl);
await ev(`p.closeAll();`);
await b.wait(500);

// ── 1. the giant hand: double-click the project on the desktop ───────────
const folder = await at(`[...document.querySelectorAll('.cattipu-desktop-objects__object')].find((e) => e.textContent.includes('Habit Tracker'))`);
await clip("desktop-hand", async () => {
  await moveTo(folder.x + 260, folder.y + 300, 10);
  await b.wait(150);
  await moveTo(folder.x, folder.y, 900);
  await b.wait(150);
  await dblclick(folder.x, folder.y, 60);
  await b.wait(1300);
});

// ── 2. typing an idea into Architect, then Generate ──────────────────────
await ev(`p.closeAll(); p.open('Habit Tracker'); await new Promise((r) => setTimeout(r, 200)); p.$('[data-sidebar-item="architect"]').click();`);
await b.wait(800);
const prompt = await at(`'textarea[placeholder^="Describe the software"]'`);
const generate = await at(`p.btn(p.win('architect'), 'Generate')`);
await clip("architect-type", async () => {
  await click(prompt.x - 200, prompt.y, 500);
  await b.wait(150);
  await type("A habit tracker with streaks and dark mode", 50);
  await b.wait(200);
  await click(generate.x, generate.y, 450);
  await b.wait(5200);
});

// ── 3. the desktop menu, hovered row by row ──────────────────────────────
await ev(`p.closeAll();`);
await b.wait(400);
await clip("menu", async () => {
  await moveTo(700, 420, 400);
  await press("right");
  await b.wait(250);
  const rows = await ev(`return [...document.querySelectorAll('[role=menu] button')].map((e) => p.center(e));`);
  for (const r of rows.slice(0, 7)) { await moveTo(r.x - 20, r.y, 120); await b.wait(90); }
  const win = await at(`[...document.querySelectorAll('[role=menu] button')].find((e) => e.textContent.startsWith('Window'))`);
  await click(win.x - 20, win.y, 150);
  await b.wait(250);
  const sub = await ev(`return [...document.querySelectorAll('[role=menu] button')].map((e) => p.center(e));`);
  for (const r of sub.slice(0, 4)) { await moveTo(r.x - 20, r.y, 120); await b.wait(110); }
  await b.wait(300);
});
await key("Escape", "Escape", 0, 27);
await key("Escape", "Escape", 0, 27);

// ── 4. window controls: maximize, then restore ───────────────────────────
await ev(`p.closeAll(); p.$('[data-sidebar-item="forge"]').click();`);
await b.wait(700);
await clip("maximize", async () => {
  const max = await at(`p.win('forge').querySelector('[aria-label="Maximize window"]')`);
  await click(max.x, max.y, 500);
  await b.wait(700);
  const again = await at(`p.win('forge').querySelector('[aria-label="Maximize window"]')`);
  await click(again.x, again.y, 300);
  await b.wait(600);
});

// ── 5. Forge: BUILD → BUILDING… → BUILD COMPLETE ─────────────────────────
await clip("forge-build", async () => {
  const build = await at(`'[data-testid="forge-build"]'`);
  await click(build.x, build.y, 450);
  for (let i = 0; i < 30; i += 1) {
    if (await ev(`return p.$('[data-testid=forge]')?.dataset.forgeState;`) === "success") break;
    await b.wait(150);
  }
  await b.wait(900);
});

// ── 6. Launch: LAUNCH → STARTING… → RUNNING ──────────────────────────────
await ev(`p.closeAll(); p.$('[data-sidebar-item="launch"]').click();`);
// LAUNCH is enabled only once Forge confirms the new build's artifact is on disk.
for (let i = 0; i < 60; i += 1) {
  if (await ev(`const k = p.$('[data-testid="launch-launch"]'); return !!k && !k.disabled;`)) break;
  await b.wait(200);
}
await b.wait(400);
let habitUrl = null;
await clip("launch-run", async () => {
  const go = await at(`'[data-testid="launch-launch"]'`);
  await click(go.x, go.y, 450);
  for (let i = 0; i < 80 && !habitUrl; i += 1) {
    habitUrl = await ev(`return p.$('[data-testid=launch]')?.dataset.launchState === 'running' ? p.$('[data-testid=launch-open]')?.getAttribute('href') : null;`);
    if (!habitUrl) await b.wait(150);
  }
  const open = await at(`'[data-testid="launch-open"]'`);
  await moveTo(open.x, open.y, 500);
  await b.wait(500);
});

// ── 7. tile ──────────────────────────────────────────────────────────────
await ev(`for (const id of ['architect', 'canvas', 'memory', 'forge']) { p.$('[data-sidebar-item="' + id + '"]').click(); await new Promise((r) => setTimeout(r, 250)); }`);
await b.wait(500);
await clip("tile", async () => {
  await moveTo(800, 500, 300);
  await b.wait(300);
  await key("t", "KeyT", 1 | 2, 84);
  await b.wait(1200);
}, { showCursor: false });

// ── 8. Explorer: into the project, open the code ─────────────────────────
await ev(`p.closeAll(); p.$('[data-sidebar-item="explorer"]').click();`);
await b.wait(700);
const entry = (label) => `[...p.win('explorer').querySelectorAll('[data-entry-id]')].find((e) => e.textContent.includes(${JSON.stringify(label)}))`;
await clip("explorer", async () => {
  for (const label of ["Habit Tracker", "src", "main.ts"]) {
    const c = await ev(`return p.center(${entry(label)});`);
    if (!c) throw new Error(`Explorer has no "${label}": ` + await ev(`return [...p.win('explorer').querySelectorAll('[data-entry-id]')].map((e) => e.textContent.trim()).join(' | ');`));
    await dblclick(c.x, c.y, 380);
    await b.wait(450);
    // If the real double-click did not open it, send the same event to it.
    await ev(`const el = ${entry(label)}; if (el && ${JSON.stringify(label)} !== 'main.ts') el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));`);
    await b.wait(350);
  }
  await b.wait(700);
});

// ── 9. Wallpaper Studio: wallpapers applied live ─────────────────────────
await ev(`p.closeAll(); p.$('[data-sidebar-item="settings"]').click();`);
await b.wait(800);
await clip("wallpapers", async () => {
  const options = await ev(`return [...document.querySelectorAll('[role=option]')].map((e) => p.center(e));`);
  for (const o of [...options.slice(1), options[0]]) { await dblclick(o.x, o.y, 220); await b.wait(380); }
});

// ── 10. widgets: minimize, close, add back ───────────────────────────────
await ev(`p.closeAll();`);
await b.wait(400);
await clip("widgets", async () => {
  for (const label of ["Minimize Architect Preview", "Minimize Recent Projects", "Close Toolbox"]) {
    const c = await at(`'[aria-label="${label}"]'`);
    await click(c.x, c.y, 300);
    await b.wait(250);
  }
  const add = await at(`'.cattipu-right-widget-stack__add'`);
  await click(add.x, add.y, 350);
  await b.wait(500);
  const item = await at(`[...document.querySelectorAll('[role=menu] button')].find((e) => e.textContent.startsWith('Toolbox'))`);
  await click(item.x, item.y, 300);
  await b.wait(500);
});
await ev(`p.S('useSettingsStore').getState().showAllWidgets();`);

// ── 11. notifications ────────────────────────────────────────────────────
await clip("notifications", async () => {
  const bell = await at(`'button[aria-label^="Notifications"]'`);
  await click(bell.x, bell.y, 450);
  await b.wait(1100);
});
await ev(`p.$('button[aria-label^="Notifications"]').click();`);

// ── 12–13. the apps CATTIPU built, running ───────────────────────────────
/** Centre of an element on a page that is not CATTIPU (a launched app). */
const appAt = async (selector) => b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
if (habitUrl) {
  await b.send("Page.navigate", { url: habitUrl });
  await b.wait(1500);
  await clip("habit-app", async () => {
    const mode = await appAt("#mode");
    await click(mode.x, mode.y, 500);
    await b.wait(500);
    const row = await appAt("li:nth-child(2)");
    await click(row.x, row.y, 400);
    await b.wait(500);
  });
}
await b.send("Page.navigate", { url: shooterUrl });
await b.wait(1500);
await clip("shooter", async () => { await b.wait(3500); }, { showCursor: false });

log("done", OUT);
} finally {
  await finish();
}
