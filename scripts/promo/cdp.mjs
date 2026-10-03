// A minimal Chrome DevTools Protocol driver for the promo scripts: a headless
// Chrome or Edge in a throwaway profile (never the user's own browser), one
// page, commands, events and real mouse/keyboard input.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSERS = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

export async function launch({ width, height, args = [] }) {
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error("No Chrome or Edge found. Set CHROME=<path to the browser>.");
  const profile = mkdtempSync(join(tmpdir(), "cattipu-promo-"));
  const port = 9500 + Math.floor(Math.random() * 400);
  const proc = spawn(exe, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    `--window-size=${width},${height}`, "--force-device-scale-factor=1", ...args, "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  let target;
  for (let i = 0; i < 75 && !target; i += 1) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
    } catch { /* starting */ }
    if (!target) await new Promise((r) => setTimeout(r, 200));
  }
  if (!target) throw new Error("The browser did not start.");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`)); else p.resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    seq += 1; pending.set(seq, { resolve, reject, method }); ws.send(JSON.stringify({ id: seq, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  return {
    send,
    evaluate,
    on(method, fn) {
      if (!listeners.has(method)) listeners.set(method, []);
      listeners.get(method).push(fn);
      return () => listeners.set(method, listeners.get(method).filter((f) => f !== fn));
    },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    async close() {
      try { ws.close(); } catch { /* closed */ }
      proc.kill();
      await new Promise((r) => setTimeout(r, 1200));
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* left in temp */ }
    },
  };
}
