/**
 * MVP-08 (Launch) — a successful Forge build, really running.
 *
 *   Launch window → useLaunchStore → /api/launch → LaunchService
 *     → Forge resolves projectId + buildId → artifact directory
 *     → local-web runtime: node + staticServer.mjs, 127.0.0.1:<OS port>
 *     → LaunchRuntime → project.launch.runs + one memory reference
 *
 * Everything below is REAL: esbuild builds the artifacts (through the real
 * ForgeService), each launch starts a real Node process, and every claim
 * about serving is checked with a real HTTP request. The process boundary
 * (RuntimeSpawner) is only ever WRAPPED — to capture exactly what would be
 * executed and every pid started, so the suite can prove none is left
 * running — never replaced.
 *
 * Cases are written against the wrong implementations this sprint could
 * plausibly ship: a "launch" that returns a URL nothing answers on (every
 * RUNNING is fetched); a server that serves the wrong project (each
 * endpoint is searched for the other project's marker); a static server
 * that normalises `..` instead of refusing it (raw request paths, not
 * fetch's cleaned ones); a stop that forgets the process (the pid is
 * checked); a stored RUNNING that survives a reload.
 *
 * Run with: npx tsx tests/launch.test.ts
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { FileWrite } from "@/lib/contracts/filesystem";
import type { BuildResult, ForgeClient } from "@/lib/contracts/forge";
import {
  LAUNCH_LIMITS,
  isLaunchStatus,
  type LaunchClient,
  type LaunchResponse,
  type LaunchRuntime,
  type RuntimeProcessSpec,
  type RuntimeSpawner,
} from "@/lib/contracts/launch";
import { runProcess } from "@/lib/adapters/forge/processRunner";
import { resolveEsbuildToolchain } from "@/lib/adapters/forge/esbuildToolchain";
import { createLocalWebRuntime, exitReason, staticServerScript, validPort } from "@/lib/adapters/launch/localWebRuntime";
import { spawnRuntimeProcess } from "@/lib/adapters/launch/runtimeProcess";
import { createForgeService, type ForgeService } from "@/lib/services/forge/forgeService";
import {
  createLaunchService,
  isLoopbackEndpoint,
  parseLaunchRequest,
  parseStopRequest,
  type LaunchService,
} from "@/lib/services/launch/launchService";
import { LAUNCH_MEMORY_RECORD_ID, reconcileRuns, toLaunchRun } from "@/lib/services/launch/launchHistory";
import { launchPolicy } from "@/lib/services/launch/serverLaunch";
import { diagnosticsService } from "@/lib/services/diagnostics/diagnosticsService";
import { createProject, createEmptyLaunchArtifacts, PROJECT_SCHEMA_VERSION } from "@/lib/project/types";
import { migrateProject } from "@/lib/project/migrate";
import { CATTIPU_WINDOW_IDS } from "@/components/WindowManager/windowManager.reducer";
import { useFilesystemStore } from "@/store/useFilesystemStore";
import { useForgeStore } from "@/store/useForgeStore";
import { IDLE_LAUNCH_SESSION, useLaunchStore } from "@/store/useLaunchStore";
import { useProjectStore } from "@/store/useProjectStore";

(globalThis as Record<string, unknown>).React = React;
const loaders = require.extensions as unknown as Record<string, (m: { exports: unknown }) => void>;
loaders[".css"] = (m) => {
  m.exports = {};
};
loaders[".svg"] = (m) => {
  m.exports = { __esModule: true, default: () => null };
};

const tests: Array<[string, () => Promise<void> | void]> = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** A throwaway Forge root for this run, removed at the end. */
const ROOT = join(tmpdir(), `cattipu-launch-test-${process.pid}-${Date.now().toString(36)}`);

// ── fixtures ───────────────────────────────────────────────────────────

let buildIds = 0;
const forge: ForgeService = createForgeService({
  root: ROOT,
  toolchain: () => resolveEsbuildToolchain(),
  runner: runProcess,
  policy: () => ({ enabled: true, reason: null }),
  newBuildId: () => `build-l${(buildIds += 1).toString().padStart(4, "0")}`,
});

const webApp = (marker: string): FileWrite[] => [
  {
    path: "index.html",
    content: `<!doctype html>\n<html>\n<head><title>${marker}</title></head>\n<body>\n<h1 id="title">${marker}</h1>\n<script type="module" src="/src/main.ts"></script>\n</body>\n</html>\n`,
  },
  { path: "src/main.ts", content: `const el: HTMLElement | null = document.getElementById("title");\nif (el) el.dataset.ran = "${marker}-RAN";\nconsole.log("${marker}-BUNDLE");\n` },
];

async function build(projectId: string, files: FileWrite[]): Promise<BuildResult> {
  const response = await forge.build({ projectId, target: "web-app", configuration: "production", files });
  assert.ok(response.ok, response.ok ? "" : response.error.message);
  return response.result;
}

/** Every pid any runtime started, so the suite can prove none survives. */
const pids = new Set<number>();
const specs: RuntimeProcessSpec[] = [];
const recordingSpawner: RuntimeSpawner = (spec) => {
  specs.push(spec);
  const child = spawnRuntimeProcess(spec);
  if (child.pid) pids.add(child.pid);
  return child;
};

const services: LaunchService[] = [];
function launchService(overrides: Partial<Parameters<typeof createLaunchService>[0]> = {}): LaunchService {
  let n = 0;
  const service = createLaunchService({
    locateArtifact: (projectId, buildId) => forge.locateArtifact(projectId, buildId),
    runtime: createLocalWebRuntime({ spawner: recordingSpawner }),
    policy: () => ({ enabled: true, reason: null }),
    newLaunchId: () => `launch-t${(n += 1).toString().padStart(3, "0")}-${services.length}`,
    ...overrides,
  });
  services.push(service);
  return service;
}

function running(response: LaunchResponse): LaunchRuntime {
  assert.ok(response.ok, response.ok ? "" : `${response.error.code}: ${response.error.message}`);
  assert.equal(response.runtime.status, "running", response.runtime.reason ?? "");
  return response.runtime;
}

/** A request sent exactly as written — no URL normalisation — so `..`
 *  reaches the server the way an attacker would send it. */
function raw(port: number, path: string, options: { method?: string; host?: string } = {}): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: options.method ?? "GET", headers: options.host ? { Host: options.host } : undefined },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, type: String(res.headers["content-type"] ?? "") }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function refused(endpoint: string): Promise<boolean> {
  try {
    await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
    return false;
  } catch {
    return true;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}

const statusOf = (service: LaunchService, projectId: string) => service.status().runtimes.find((r) => r.projectId === projectId);

// ── contract & validation ──────────────────────────────────────────────

test("1 LaunchRequest validation: ids only; paths, URLs, commands and executables never survive parsing", () => {
  const bad: Array<[unknown, RegExp]> = [
    [null, /JSON object/],
    [{ buildId: "b1" }, /name the project/],
    [{ projectId: "../pa", buildId: "b1" }, /name the project/],
    [{ projectId: "pa" }, /name one of the project's builds/],
    [{ projectId: "pa", buildId: "../../etc" }, /builds/],
    [{ projectId: "pa", buildId: "C:\\Windows" }, /builds/],
    [{ projectId: "pa", buildId: "http://evil.example/" }, /builds/],
    [{ projectId: "pa", buildId: "b1; rm -rf /" }, /builds/],
  ];
  for (const [input, message] of bad) {
    const parsed = parseLaunchRequest(input);
    assert.equal(parsed.ok, false, JSON.stringify(input));
    if (!parsed.ok && !parsed.response.ok) {
      assert.equal(parsed.response.error.code, "invalid-request");
      assert.match(parsed.response.error.message, message);
    }
  }
  const ok = parseLaunchRequest({ projectId: "pa", buildId: "b1", path: "C:/", url: "http://x", command: "cmd /c evil", executable: "powershell.exe", args: ["-c"] });
  assert.ok(ok.ok);
  assert.deepEqual(Object.keys(ok.request).sort(), ["buildId", "projectId"], "nothing but ids survives");
  assert.equal(parseStopRequest({ projectId: "a/b" }).ok, false);
  assert.deepEqual(parseStopRequest({ projectId: "pa", pid: 4 }), { ok: true, request: { projectId: "pa" } });
});

// ── real launches ──────────────────────────────────────────────────────

let alphaBuild: BuildResult;
let betaBuild: BuildResult;

test("8 + 9 + 2 successful launch: a real process serves the real artifact on a real address", async () => {
  alphaBuild = await build("pa", webApp("ALPHA-MARKER"));
  assert.equal(alphaBuild.status, "success");
  const service = launchService();
  const before = specs.length;
  const runtime = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));

  // LaunchResult contract.
  assert.deepEqual(Object.keys(runtime).sort(), [
    "artifact", "buildId", "endedAt", "endpoint", "exitCode", "launchId", "port", "projectId", "readyAt", "reason", "runtime", "startedAt", "status",
  ]);
  assert.ok(isLaunchStatus(runtime.status));
  assert.deepEqual([runtime.projectId, runtime.buildId, runtime.runtime, runtime.artifact], ["pa", alphaBuild.buildId, "local-web", `forge://pa/${alphaBuild.buildId}`]);
  assert.equal(runtime.endpoint, `http://127.0.0.1:${runtime.port}`);
  assert.ok(isLoopbackEndpoint(runtime.endpoint));
  assert.ok(runtime.readyAt && runtime.endedAt === null && runtime.reason === null);
  assert.equal(specs.length, before + 1, "exactly one process started");

  // A real HTTP response: the artifact's own index.html and its bundle.
  const page = await fetch(`${runtime.endpoint}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
  const html = await page.text();
  assert.equal(html, readFileSync(join(alphaBuild.artifact!.location, "index.html"), "utf8"), "the served page IS the artifact's page");
  assert.match(html, /<script type="module" src="\.\/main\.js"><\/script>/);
  const js = await fetch(`${runtime.endpoint}/main.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type") ?? "", /^text\/javascript/);
  const bundle = await js.text();
  assert.match(bundle, /ALPHA-MARKER-BUNDLE/, "the compiled JavaScript is served");
  assert.doesNotMatch(bundle, /HTMLElement \| null/, "compiled, not source");
  assert.equal((await fetch(`${runtime.endpoint}/index.html`, { method: "HEAD" })).status, 200);

  assert.equal(statusOf(service, "pa")?.status, "running");
  await service.stopAll();
});

test("6 + 7 localhost-only binding and dynamic ports: 127.0.0.1, OS-assigned, never shared", async () => {
  const service = launchService();
  const a = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  betaBuild = await build("pb", webApp("BETA-MARKER"));
  const b = running(await service.launch({ projectId: "pb", buildId: betaBuild.buildId }));
  assert.ok(validPort(a.port!) && validPort(b.port!));
  assert.notEqual(a.port, b.port, "two runtimes, two ports");
  assert.equal(validPort(80), false);
  assert.equal(validPort(70000), false);
  assert.match(read("lib/adapters/launch/staticServer.mjs"), /server\.listen\(0, HOST/);
  assert.match(read("lib/adapters/launch/staticServer.mjs"), /const HOST = "127\.0\.0\.1";/);
  assert.doesNotMatch(read("lib/adapters/launch/staticServer.mjs"), /0\.0\.0\.0|"::"/);

  // Not reachable on this machine's network address.
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  if (lan) {
    const reached = await fetch(`http://${lan}:${a.port}/`, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false);
    assert.equal(reached, false, `the runtime answered on ${lan}`);
  }
  // A name rebound to 127.0.0.1 by another origin is refused.
  assert.equal((await raw(a.port!, "/", { host: "evil.example" })).status, 421);
  assert.equal((await raw(a.port!, "/", { host: `localhost:${a.port}` })).status, 200);
  await service.stopAll();
});

test("14 project isolation: Alpha serves only Alpha, Beta only Beta; stopping Alpha leaves Beta running", async () => {
  const service = launchService();
  const a = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  const b = running(await service.launch({ projectId: "pb", buildId: betaBuild.buildId }));
  const alphaJs = await (await fetch(`${a.endpoint}/main.js`)).text();
  const betaJs = await (await fetch(`${b.endpoint}/main.js`)).text();
  assert.match(alphaJs, /ALPHA-MARKER/);
  assert.doesNotMatch(alphaJs, /BETA-MARKER/);
  assert.match(betaJs, /BETA-MARKER/);
  assert.doesNotMatch(betaJs, /ALPHA-MARKER/);
  // Beta's build id cannot be reached through Alpha's server either.
  assert.equal((await raw(a.port!, `/../${betaBuild.buildId}/main.js`)).status, 404);
  assert.equal((await raw(a.port!, `/../../pb/${betaBuild.buildId}/main.js`)).status, 404);

  const stopped = await service.stop({ projectId: "pa" });
  assert.ok(stopped.ok && stopped.runtime.status === "stopped");
  assert.ok(await refused(a.endpoint!), "Alpha no longer answers");
  assert.equal((await fetch(`${b.endpoint}/`)).status, 200, "Beta is independent");
  assert.equal(statusOf(service, "pb")?.status, "running");
  await service.stopAll();
});

// ── ownership & validation against Forge ──────────────────────────────

test("3 + 4 + 5 only a real successful build of this project, whose artifact exists, can launch", async () => {
  const service = launchService();
  const before = specs.length;
  const failed = await build("pa", [...webApp("X").slice(0, 1), { path: "src/main.ts", content: "const = ;\n" }]);
  assert.equal(failed.status, "failed");
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ projectId: "pa", buildId: failed.buildId }, "a failed build"],
    [{ projectId: "pa", buildId: "build-never-existed" }, "a nonexistent build"],
    [{ projectId: "pb", buildId: alphaBuild.buildId }, "Alpha's build asked for as Beta's"],
    [{ projectId: "pa", buildId: betaBuild.buildId }, "Beta's build asked for as Alpha's"],
  ];
  for (const [input, what] of cases) {
    const response = await service.launch(input);
    assert.equal(response.ok ? "ok" : response.error.code, "build-not-found", what);
  }
  // An artifact removed from disk after the build.
  const gone = await build("pa", webApp("GONE"));
  rmSync(gone.artifact!.location, { recursive: true, force: true });
  const missing = await service.launch({ projectId: "pa", buildId: gone.buildId });
  assert.equal(missing.ok ? "ok" : missing.error.code, "build-not-found");
  assert.equal(specs.length, before, "no process was started for any of them");
  assert.equal(statusOf(service, "pa"), undefined, "and no runtime record claims otherwise");
});

// ── serving: confinement and traversal ─────────────────────────────────

test("15 + 16 + 19 artifact-root confinement: traversal refused, source root and secrets never served", async () => {
  const service = launchService();
  const r = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  const port = r.port!;
  // A dotfile planted in the artifact: hidden names are never served.
  writeFileSync(join(alphaBuild.artifact!.location, ".env"), "ANTHROPIC_API_KEY=sk-should-not-leak\n");
  const attempts = [
    "/../../package.json",
    "/../../../package.json",
    "/%2e%2e/%2e%2e/package.json",
    "/%2E%2E%2F%2E%2E%2Fpackage.json",
    "/..%2f..%2fpackage.json",
    "/..%5c..%5cpackage.json",
    "/..\\..\\package.json",
    "/C:/Windows/win.ini",
    "/C:%5CWindows%5Cwin.ini",
    "/index.html%00.js",
    "/index.html::$DATA",
    "/.env",
    "/%2eenv",
    "/src/main.ts",
    "/package.json",
    "/lib/adapters/launch/staticServer.mjs",
    "/%",
  ];
  for (const path of attempts) {
    const res = await raw(port, path);
    assert.equal(res.status, 404, `${path} → ${res.status}`);
    assert.doesNotMatch(res.body, /"name": "cattipu-os"|sk-should-not-leak|\[fonts\]|ALPHA-MARKER/, path);
  }
  assert.equal((await raw(port, "/", { method: "POST" })).status, 405);
  assert.equal((await raw(port, "/", { method: "DELETE" })).status, 405);
  // What IS served is the artifact, and only the artifact.
  assert.equal((await raw(port, "/")).status, 200);
  assert.equal((await raw(port, "/main.js")).status, 200);
  assert.equal(specs.at(-1)!.args[1], alphaBuild.artifact!.location, "the runtime's root is the exact artifact directory");
  rmSync(join(alphaBuild.artifact!.location, ".env"));
  await service.stopAll();
});

// ── execution boundary ─────────────────────────────────────────────────

test("17 + 18 the only thing executed is Launch's fixed runtime — not a command, an executable or a path from the request", async () => {
  const service = launchService();
  const before = specs.length;
  running(
    await service.launch({ projectId: "pa", buildId: alphaBuild.buildId, command: "powershell -c evil", executable: "C:\\Windows\\System32\\cmd.exe", path: "C:\\", root: "C:\\", args: ["/c", "evil"] }),
  );
  assert.equal(specs.length, before + 1);
  const spec = specs.at(-1)!;
  assert.equal(spec.executable, process.execPath, "the Node binary running CATTIPU");
  assert.deepEqual(spec.args, [staticServerScript(), alphaBuild.artifact!.location]);
  assert.equal(spec.cwd, tmpdir(), "not the artifact: Forge must still be able to prune it");
  assert.doesNotMatch(JSON.stringify(spec), /evil|cmd\.exe|powershell/i);

  const runner = read("lib/adapters/launch/runtimeProcess.ts");
  assert.match(runner, /shell: false/);
  assert.match(runner, /childEnvironment\(\)/, "the same environment allowlist as Forge's builds");
  assert.doesNotMatch(runner, /exec\(|execSync|shell: true|eval\(/);
  for (const file of [
    "app/api/launch/route.ts",
    "lib/services/launch/launchService.ts",
    "lib/services/launch/serverLaunch.ts",
    "lib/services/launch/launchClient.ts",
    "store/useLaunchStore.ts",
    "components/Launch/LaunchApp.tsx",
  ]) {
    assert.doesNotMatch(read(file), /child_process/, `${file} starts processes itself`);
  }
  assert.doesNotMatch(read("lib/adapters/launch/staticServer.mjs"), /child_process|eval\(|new Function/);
  await service.stopAll();
});

// ── lifecycle ──────────────────────────────────────────────────────────

test("10 stop: the right process exits, the address stops answering, the record says STOPPED", async () => {
  const service = launchService();
  const r = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  const pid = [...pids].at(-1)!;
  assert.ok(processAlive(pid));
  const response = await service.stop({ projectId: "pa" });
  assert.ok(response.ok);
  assert.deepEqual([response.runtime.status, response.runtime.reason, response.runtime.exitCode], ["stopped", "Stopped.", 0], "stdin closed; it exited on its own");
  assert.ok(response.runtime.endedAt);
  await until(() => !processAlive(pid));
  assert.ok(await refused(r.endpoint!), "no longer served");
  assert.equal(statusOf(service, "pa")?.status, "stopped");
  // Stopping again is harmless; stopping nothing says so.
  const again = await service.stop({ projectId: "pa" });
  assert.ok(again.ok && again.runtime.status === "stopped");
  const none = await service.stop({ projectId: "nobody" });
  assert.equal(none.ok ? "ok" : none.error.code, "not-running");

  // Relaunch: a new process, a new port-bearing runtime, same build.
  const relaunched = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  assert.notEqual(relaunched.launchId, r.launchId);
  assert.equal((await fetch(`${relaunched.endpoint}/`)).status, 200);
  await service.stopAll();
});

test("11 process exit: a runtime that dies on its own is FAILED, never left RUNNING", async () => {
  const service = launchService();
  const r = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  const pid = [...pids].at(-1)!;
  process.kill(pid);
  await until(() => statusOf(service, "pa")?.status !== "running");
  const after = statusOf(service, "pa")!;
  assert.equal(after.status, "failed");
  assert.match(after.reason ?? "", /exited unexpectedly/);
  assert.ok(after.endedAt);
  assert.ok(await refused(r.endpoint!));

  // Its artifact pruned under it: the next request says so and it ends.
  const pruned = await build("pa", webApp("PRUNED"));
  const p = running(await service.launch({ projectId: "pa", buildId: pruned.buildId }));
  rmSync(pruned.artifact!.location, { recursive: true, force: true });
  assert.equal((await raw(p.port!, "/")).status, 410);
  await until(() => statusOf(service, "pa")?.status === "failed");
  assert.match(statusOf(service, "pa")!.reason ?? "", /removed from disk/);
});

test("11 process exit on Windows: a code above 2^31 reads as its signed value, not an unsigned 32-bit number", async () => {
  // Windows reports a force-killed process (TerminateProcess's -1) as 4294967295.
  const reason = (code: number | null, signal: string | null = null) => exitReason({ code, signal }, "");
  assert.equal(reason(4294967295), "The application's server exited (code -1).");
  assert.equal(reason(3221225477), "The application's server exited (code -1073741819).");
  assert.equal(reason(2147483648), "The application's server exited (code -2147483648).");
  assert.equal(reason(2147483647), "The application's server exited (code 2147483647).");
  assert.equal(reason(1), "The application's server exited (code 1).");
  assert.equal(reason(0), "The application's server exited (code 0).");
  assert.equal(reason(null, "SIGTERM"), "The application's server exited (signal SIGTERM).");
  assert.equal(reason(null), "The application's server exited (no exit code).");

  // The same through a real runtime: kill it and replay the unsigned code a Windows kill reports.
  const windowsKill: RuntimeSpawner = (spec) => {
    const child = recordingSpawner(spec);
    return { ...child, onExit: (listener) => child.onExit(() => listener({ code: 4294967295, signal: null })) };
  };
  const service = launchService({ runtime: createLocalWebRuntime({ spawner: windowsKill }) });
  running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  process.kill([...pids].at(-1)!);
  await until(() => statusOf(service, "pa")?.status !== "running");
  const after = statusOf(service, "pa")!;
  assert.equal(after.status, "failed");
  assert.equal(after.reason, "The application's server exited unexpectedly (code -1).");
});

test("12 failed launch: a runtime that cannot come up is FAILED with its reason, and nothing is left running", async () => {
  const noScript = launchService({ runtime: createLocalWebRuntime({ spawner: recordingSpawner, script: join(ROOT, "no-such-server.mjs") }) });
  const response = await noScript.launch({ projectId: "pa", buildId: alphaBuild.buildId });
  assert.ok(response.ok);
  assert.equal(response.runtime.status, "failed");
  assert.equal(response.runtime.endpoint, null);
  assert.match(response.runtime.reason ?? "", /exited \(code 1\)/);

  // Forge said yes but the directory has no index.html when the runtime looks.
  const empty = join(ROOT, "empty-artifact");
  rmSync(empty, { recursive: true, force: true });
  mkdirSync(empty, { recursive: true });
  const badRoot = launchService({ locateArtifact: async () => ({ directory: empty, reference: "forge://pa/x" }) });
  const bad = await badRoot.launch({ projectId: "pa", buildId: "x" });
  assert.ok(bad.ok && bad.runtime.status === "failed");
  assert.match(bad.runtime.reason ?? "", /no index\.html/);

  // A runtime that never reports an address is stopped at its time limit.
  const silent = join(ROOT, "silent.mjs");
  writeFileSync(silent, "process.stdin.resume(); process.stdin.on('end', () => process.exit(0));\n");
  const slow = launchService({ runtime: createLocalWebRuntime({ spawner: recordingSpawner, script: silent, startTimeoutMs: 400 }) });
  const timedOut = await slow.launch({ projectId: "pa", buildId: alphaBuild.buildId });
  assert.ok(timedOut.ok && timedOut.runtime.status === "failed");
  assert.match(timedOut.runtime.reason ?? "", /did not start within/);
  // A runtime that says it listens somewhere other than loopback is stopped.
  const liar = join(ROOT, "liar.mjs");
  writeFileSync(liar, "process.stdin.resume(); process.stdin.on('end', () => process.exit(0)); console.log('CATTIPU-RUNTIME-READY {\"host\":\"0.0.0.0\",\"port\":5173}');\n");
  const wide = launchService({ runtime: createLocalWebRuntime({ spawner: recordingSpawner, script: liar }) });
  const exposed = await wide.launch({ projectId: "pa", buildId: alphaBuild.buildId });
  assert.ok(exposed.ok && exposed.runtime.status === "failed");
  assert.match(exposed.runtime.reason ?? "", /bound 0\.0\.0\.0/);
  for (const s of [noScript, badRoot, slow, wide]) assert.ok(s.status().runtimes.every((r) => r.status !== "running"));
});

test("13 stale runtimes and duplicates: one process per project; a dead one is never reported RUNNING", async () => {
  const service = launchService();
  const before = specs.length;
  const [one, two] = await Promise.all([
    service.launch({ projectId: "pa", buildId: alphaBuild.buildId }),
    service.launch({ projectId: "pa", buildId: alphaBuild.buildId }),
  ]);
  const outcomes = [one, two].map((r) => (r.ok ? r.runtime.status : r.error.code)).sort();
  assert.deepEqual(outcomes, ["busy", "running"], "a concurrent second launch cannot start a second process");
  assert.equal(specs.length, before + 1);
  const same = running(await service.launch({ projectId: "pa", buildId: alphaBuild.buildId }));
  assert.equal(specs.length, before + 1, "launching the running build returns the running runtime");
  const other = await build("pa", webApp("OTHER"));
  const refusedOther = await service.launch({ projectId: "pa", buildId: other.buildId });
  assert.equal(refusedOther.ok ? "ok" : refusedOther.error.code, "busy");
  assert.match(refusedOther.ok ? "" : refusedOther.error.message, /Stop it/);
  // Killed outside Launch: the next status read reports it failed.
  process.kill([...pids].at(-1)!);
  await until(() => statusOf(service, "pa")?.status === "failed");
  assert.equal(same.status, "running", "a returned snapshot is not a live view…");
  assert.notEqual(statusOf(service, "pa")?.status, "running", "…the service is");
  const limit = launchService({ policy: () => ({ enabled: false, reason: "off here" }) });
  const off = await limit.launch({ projectId: "pa", buildId: alphaBuild.buildId });
  assert.deepEqual(off, { ok: false, error: { code: "disabled", message: "off here" } });
  assert.equal(LAUNCH_LIMITS.maxRuntimes, 8);
});

test("policy: launching runs on a development server, and in production only when switched on", () => {
  assert.equal(launchPolicy({ NODE_ENV: "development" }).enabled, true);
  assert.equal(launchPolicy({ NODE_ENV: "production" }).enabled, false);
  assert.equal(launchPolicy({ NODE_ENV: "production", LAUNCH_ENABLED: "1" }).enabled, true);
  assert.equal(launchPolicy({ NODE_ENV: "development", LAUNCH_ENABLED: "0" }).enabled, false);
});

test("route: the real /api/launch starts, reports and stops a runtime; bad input is refused", async () => {
  process.env.FORGE_ROOT = ROOT;
  const g = globalThis as Record<string, unknown>;
  delete g.__cattipuLaunchService;
  for (const key of Object.keys(require.cache)) {
    if (/[\\/](app[\\/]api[\\/]launch[\\/]route|lib[\\/]services[\\/](launch[\\/]serverLaunch|forge[\\/]serverForge))\.ts$/.test(key)) delete require.cache[key];
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const route = require("@/app/api/launch/route") as typeof import("@/app/api/launch/route");
  const post = (body: unknown) => route.POST(new Request("http://localhost/api/launch", { method: "POST", body: JSON.stringify(body) }));
  try {
    assert.equal((await post({ action: "exec", projectId: "pa" })).status, 400);
    assert.equal((await post({ action: "start", projectId: "pa", buildId: "build-nope" })).status, 404);
    assert.equal((await post({ action: "stop", projectId: "pa" })).status, 409);
    const started = await post({ action: "start", projectId: "pa", buildId: alphaBuild.buildId });
    assert.equal(started.status, 200);
    const body = (await started.json()) as LaunchResponse;
    const runtime = running(body);
    assert.match(await (await fetch(`${runtime.endpoint}/main.js`)).text(), /ALPHA-MARKER/);
    const status = await (await route.GET()).json();
    assert.deepEqual([status.enabled, status.runtime.id], [true, "local-web"]);
    assert.equal(status.runtimes.find((r: LaunchRuntime) => r.projectId === "pa").status, "running");
    assert.doesNotMatch(JSON.stringify(status), /"pid"/, "process identity stays on the server");
    const stopped = await post({ action: "stop", projectId: "pa" });
    assert.equal(((await stopped.json()) as LaunchResponse).ok && stopped.status, 200);
    assert.ok(await refused(runtime.endpoint!));
  } finally {
    const service = g.__cattipuLaunchService as LaunchService | undefined;
    if (service) {
      services.push(service);
      await service.stopAll();
    }
    delete process.env.FORGE_ROOT;
  }
});

// ── the browser half: project history, memory, reload ──────────────────

function freshOS() {
  useForgeStore.setState({ sessions: {} });
  useLaunchStore.setState({ server: { kind: "unknown" }, sessions: {} });
  useProjectStore.setState({
    projects: [
      { ...createProject({ name: "Alpha" }), id: "pa" },
      { ...createProject({ name: "Beta" }), id: "pb" },
    ],
  });
  useFilesystemStore.setState({ objects: [], selectedObjectId: null });
  const fs = useFilesystemStore.getState();
  fs.createProjectWorkspace("pa", "Alpha", []);
  fs.createProjectWorkspace("pb", "Beta", []);
  fs.applyFileWrites("pa", webApp("ALPHA-FS"));
  fs.applyFileWrites("pb", [...webApp("BETA-FS").slice(0, 1), { path: "src/main.ts", content: "const = ;\n" }]);
}

const forgeClientOver = (service: ForgeService): ForgeClient => ({
  status: async () => service.status(),
  build: async (req) => service.build(JSON.parse(JSON.stringify(req))),
  artifact: async (p, b) => service.artifact(p, b),
});

/** A LaunchClient over a real LaunchService — the HTTP hop is the only part left out. */
const clientOver = (service: LaunchService, sent: unknown[] = []): LaunchClient => ({
  status: async () => JSON.parse(JSON.stringify(service.status())),
  launch: async (req) => {
    sent.push(JSON.parse(JSON.stringify(req)));
    return JSON.parse(JSON.stringify(await service.launch(JSON.parse(JSON.stringify(req)))));
  },
  stop: async (req) => JSON.parse(JSON.stringify(await service.stop(JSON.parse(JSON.stringify(req))))),
});

test("20 + 22 persistence: Forge → Launch → project history and memory; failed builds never become requests", async () => {
  freshOS();
  await useForgeStore.getState().build("pa", "web-app", "production", forgeClientOver(forge));
  await useForgeStore.getState().build("pb", "web-app", "production", forgeClientOver(forge));
  const alpha = () => useProjectStore.getState().projects.find((p) => p.id === "pa")!;
  const beta = () => useProjectStore.getState().projects.find((p) => p.id === "pb")!;
  const alphaBuildId = alpha().forge.builds[0].id;
  assert.equal(beta().forge.builds[0].status, "failed");
  const forgeBefore = JSON.stringify([alpha().forge, beta().forge]);

  const service = launchService();
  const sent: unknown[] = [];
  const client = clientOver(service, sent);
  await useLaunchStore.getState().launch("pb", beta().forge.builds[0].id, client);
  assert.equal(sent.length, 0, "a failed build is refused before any request");
  assert.match(useLaunchStore.getState().sessions.pb?.error?.message ?? "", /failed, so it has no artifact/);
  await useLaunchStore.getState().launch("pa", "build-unknown", client);
  assert.equal(sent.length, 0);

  await useLaunchStore.getState().launch("pa", alphaBuildId, client);
  assert.deepEqual(sent, [{ projectId: "pa", buildId: alphaBuildId }], "the request is ids only");
  const live = useLaunchStore.getState().sessions.pa!.runtime!;
  assert.equal(live.status, "running");
  assert.match(await (await fetch(`${live.endpoint}/main.js`)).text(), /ALPHA-FS/, "the project's own files, built, served");
  const [run] = alpha().launch.runs;
  assert.deepEqual([run.id, run.projectId, run.buildId, run.endpoint, run.result, run.endedAt], [live.launchId, "pa", alphaBuildId, live.endpoint, null, null]);
  assert.equal("status" in run, false, "a stored run has no status to claim RUNNING with");
  const memory = alpha().memory.records.find((r) => r.id === LAUNCH_MEMORY_RECORD_ID);
  assert.equal(memory?.kind, "launch");
  assert.deepEqual(memory?.refs, [{ kind: "launch-run", id: run.id }, { kind: "forge-build", id: alphaBuildId }]);
  assert.doesNotMatch(memory?.text ?? "", /pid|<!doctype|stderr/i, "memory holds a reference, not runtime internals");
  assert.equal(beta().launch.runs.length, 0, "Beta's history is untouched");

  await useLaunchStore.getState().stop("pa", client);
  assert.equal(useLaunchStore.getState().sessions.pa!.runtime!.status, "stopped");
  assert.deepEqual([alpha().launch.runs[0].result, alpha().launch.runs.length], ["stopped", 1]);
  assert.match(alpha().memory.records.find((r) => r.id === LAUNCH_MEMORY_RECORD_ID)?.text ?? "", /stopped at/);
  assert.ok(await refused(live.endpoint!));
  assert.equal(JSON.stringify([alpha().forge, beta().forge]), forgeBefore, "Launch never writes Forge's builds");

  // A poll that learns nothing writes nothing.
  const stamp = alpha().updatedAt;
  await useLaunchStore.getState().refresh(client);
  assert.equal(alpha().updatedAt, stamp);
  assert.equal(useProjectStore.getState().recordLaunch("pa", { ...live, projectId: "pb" }), false, "never filed under another project");
  let launch = createEmptyLaunchArtifacts();
  for (let i = 0; i < LAUNCH_LIMITS.maxHistory + 4; i += 1) {
    launch = reconcileRuns(launch, { ...live, launchId: `l${i}`, status: "stopped", startedAt: `2026-09-29T00:${String(i).padStart(2, "0")}:00.000Z`, endedAt: "x" }, "t");
  }
  assert.equal(launch.runs.length, LAUNCH_LIMITS.maxHistory);
});

type ProjectStoreModule = typeof import("@/store/useProjectStore");

function withReload(data: Map<string, string>, run: (store: ProjectStoreModule["useProjectStore"]) => void) {
  const g = globalThis as Record<string, unknown>;
  const had = { localStorage: Object.getOwnPropertyDescriptor(g, "localStorage"), window: Object.getOwnPropertyDescriptor(g, "window") };
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
  Object.defineProperty(g, "localStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(g, "window", { value: globalThis, configurable: true, writable: true });
  const pattern = /[\\/]store[\\/]useProjectStore\.ts$/;
  const saved = Object.keys(require.cache).filter((k) => pattern.test(k)).map((k) => [k, require.cache[k]] as const);
  try {
    for (const [key] of saved) delete require.cache[key];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    run((require("@/store/useProjectStore") as ProjectStoreModule).useProjectStore);
  } finally {
    for (const key of Object.keys(require.cache).filter((k) => pattern.test(k))) delete require.cache[key];
    for (const [key, mod] of saved) require.cache[key] = mod;
    for (const [name, desc] of Object.entries(had)) {
      if (desc) Object.defineProperty(g, name, desc);
      else delete g[name];
    }
  }
}

type LaunchModule = typeof import("@/components/Launch/LaunchApp");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LaunchView, launchState } = require("@/components/Launch/LaunchApp") as LaunchModule;

test("21 reload: no stored launch reads as RUNNING; the server decides, and a vanished runtime is closed as stopped", async () => {
  const live: LaunchRuntime = {
    launchId: "launch-r1", projectId: "pa", buildId: "build-r1", artifact: "forge://pa/build-r1", runtime: "local-web",
    status: "running", endpoint: "http://127.0.0.1:50123", port: 50123, startedAt: "2026-09-29T00:00:00.000Z",
    readyAt: "2026-09-29T00:00:01.000Z", endedAt: null, exitCode: null, reason: null,
  };
  const data = new Map<string, string>();
  withReload(data, (store) => {
    store.setState({ projects: [{ ...createProject({ name: "Alpha" }), id: "pa" }] });
    assert.ok(store.getState().recordLaunch("pa", live));
  });
  assert.match(data.get("cattipu-projects") ?? "", new RegExp(`"version":${PROJECT_SCHEMA_VERSION}`));
  assert.doesNotMatch(data.get("cattipu-projects") ?? "", /"running"/, "RUNNING is never written to storage");

  withReload(data, (store) => {
    const alpha = store.getState().projects.find((p) => p.id === "pa")!;
    assert.deepEqual(alpha.launch.runs.map((r) => [r.id, r.result]), [["launch-r1", null]]);
    // Fresh after reload: the view says CHECKING, not RUNNING.
    const html = renderToStaticMarkup(React.createElement(LaunchView, {
      project: { id: "pa", name: "Alpha" }, server: { kind: "unknown" }, session: IDLE_LAUNCH_SESSION,
      builds: [], presence: {}, selectedBuildId: null, runs: alpha.launch.runs,
      onSelectBuild: () => {}, onLaunch: () => {}, onStop: () => {},
    }));
    assert.match(html, /data-testid="launch-status">CHECKING…</);
    assert.doesNotMatch(html, />RUNNING<|>RUN</);
    // The server has no such runtime (it restarted): the run is closed.
    store.getState().reconcileLaunches("pa", null);
    const closed = store.getState().projects.find((p) => p.id === "pa")!.launch.runs[0];
    assert.deepEqual([closed.result, typeof closed.endedAt], ["stopped", "string"]);
    assert.match(closed.reason ?? "", /no process for this launch/);
    // …but a runtime the server DOES vouch for stays open.
    store.getState().recordLaunch("pa", { ...live, launchId: "launch-r2", startedAt: "2026-09-29T01:00:00.000Z" });
    store.getState().reconcileLaunches("pa", { ...live, launchId: "launch-r2", startedAt: "2026-09-29T01:00:00.000Z" });
    assert.equal(store.getState().projects.find((p) => p.id === "pa")!.launch.runs.find((r) => r.id === "launch-r2")?.result, null);
  });

  assert.equal(launchState({ kind: "unknown" }, IDLE_LAUNCH_SESSION), "checking");
  assert.equal(launchState({ kind: "known", status: { enabled: true, reason: null, runtime: { id: "local-web", label: "LOCAL WEB" } }, observedAt: "t" }, IDLE_LAUNCH_SESSION), "stopped");
  assert.deepEqual(toLaunchRun({ ...live, status: "starting" }).result, null);

  // v7 → v8: no launches invented; malformed entries dropped; re-owned.
  const v7 = { ...createProject({ name: "Old" }), id: "po", version: 7 } as Record<string, unknown>;
  v7.launch = { releases: [], environments: [], preflightChecks: [], deployments: [] };
  assert.deepEqual(migrateProject(v7).launch.runs, []);
  v7.launch = { releases: [], environments: [], preflightChecks: [], deployments: [], runs: [
    { id: "r1", buildId: "b1", startedAt: "2026-01-01T00:00:00.000Z", projectId: "someone-else", status: "running", result: "running" },
    { buildId: "b2", startedAt: "x" },
  ] };
  const migrated = migrateProject(v7).launch.runs;
  assert.deepEqual(migrated.map((r) => [r.id, r.projectId, r.result, r.endedAt]), [["r1", "po", null, null]]);
  assert.equal("status" in migrated[0], false);
});

// ── the window & diagnostics ───────────────────────────────────────────

test("window: Launch is a managed window on the rail's Launch key; the view is honest in every state", () => {
  assert.ok(CATTIPU_WINDOW_IDS.includes("launch"));
  assert.match(read("components/Shell/CattipuShell.tsx"), /launch: <LaunchApp \/>/);
  assert.match(read("components/Sidebar/Sidebar.tsx"), /\{ id: 'launch', label: 'Launch' \}/);
  const ok = { id: "b-ok", status: "success" as const, startedAt: "2026-09-29T00:00:02.000Z", projectId: "pa", target: "web-app", configuration: "production", completedAt: "", durationMs: 1, summary: "Built", diagnostics: [], artifact: { reference: "forge://pa/b-ok", location: "C:/x", entry: "index.html", files: [], bytes: 1 }, executed: true, sourceFiles: 2 };
  const bad = { ...ok, id: "b-bad", status: "failed" as const, artifact: null, startedAt: "2026-09-29T00:00:01.000Z" };
  const gone = { ...ok, id: "b-gone", startedAt: "2026-09-29T00:00:00.000Z" };
  const server = { kind: "known" as const, status: { enabled: true, reason: null, runtime: { id: "local-web" as const, label: "LOCAL WEB" } }, observedAt: "t" };
  const base = {
    project: { id: "pa", name: "Alpha" }, server, session: IDLE_LAUNCH_SESSION, builds: [ok, bad, gone],
    presence: { "b-ok": true, "b-gone": false }, selectedBuildId: "b-ok", runs: [],
    onSelectBuild: () => {}, onLaunch: () => {}, onStop: () => {},
  };
  const render = (props: Partial<React.ComponentProps<typeof LaunchView>>) => renderToStaticMarkup(React.createElement(LaunchView, { ...base, ...props }));

  const stopped = render({});
  assert.match(stopped, /data-testid="launch-status">STOPPED</);
  assert.match(stopped, /<button[^>]*data-testid="launch-launch"[^>]*>Launch<\/button>/);
  assert.doesNotMatch(stopped, /data-testid="launch-launch"[^>]*disabled/);
  assert.match(stopped, /data-build-id="b-bad"[^>]*disabled=""[\s\S]*?FAILED BUILD/);
  assert.match(stopped, /data-build-id="b-gone"[^>]*disabled=""[\s\S]*?NOT ON DISK/);
  assert.doesNotMatch(stopped, /data-testid="launch-open"/);

  const runtime: LaunchRuntime = {
    launchId: "l1", projectId: "pa", buildId: "b-ok", artifact: "forge://pa/b-ok", runtime: "local-web", status: "running",
    endpoint: "http://127.0.0.1:50999", port: 50999, startedAt: "2026-09-29T00:00:00.000Z", readyAt: "2026-09-29T00:00:00.000Z", endedAt: null, exitCode: null, reason: null,
  };
  assert.match(render({ session: { ...IDLE_LAUNCH_SESSION, pending: "starting" } }), /data-testid="launch-status">STARTING…</);
  const up = render({ session: { ...IDLE_LAUNCH_SESSION, runtime } });
  assert.match(up, /data-testid="launch-status">RUNNING</);
  assert.match(up, /data-testid="launch-address">127\.0\.0\.1:50999</);
  assert.match(up, /<a[^>]*href="http:\/\/127\.0\.0\.1:50999"[^>]*>Open<\/a>/, "OPEN is the real address");
  assert.match(up, /data-testid="launch-stop"[^>]*>Stop</);
  assert.match(up, /data-testid="launch-launch"[^>]*disabled/, "no second launch while running");
  assert.match(up, /PORT 50999/);
  const failed = render({ session: { ...IDLE_LAUNCH_SESSION, runtime: { ...runtime, status: "failed", reason: "The application's server exited unexpectedly (code 1)." } } });
  assert.match(failed, /data-testid="launch-status">FAILED</);
  assert.match(failed, /exited unexpectedly/);
  assert.doesNotMatch(failed, /data-testid="launch-open"/);
  assert.match(render({ builds: [] }), /Build it in Forge first/);
  assert.match(render({ server: { kind: "known", status: { ...server.status, enabled: false, reason: "Launching runs on a development server." }, observedAt: "t" } }), /data-testid="launch-launch"[^>]*disabled/);
});

test("diagnostics: the Launch row reports only what the server said — unknown, RUNNING :port, FAILED", async () => {
  useProjectStore.setState({ projects: [{ ...createProject({ name: "Alpha" }), id: "pa" }] });
  useLaunchStore.setState({ server: { kind: "unknown" }, sessions: {} });
  const row = async () => (await diagnosticsService.getSnapshot()).services.find((s) => s.id === "launch")!;
  let launch = await row();
  assert.equal(launch.status, "unknown");
  assert.match(launch.checks![0].message, /not observed/);
  assert.equal(launch.checks!.find((c) => c.id === "launch.deployment")?.status, "not-implemented");

  const server = { kind: "known" as const, status: { enabled: true, reason: null, runtime: { id: "local-web" as const, label: "LOCAL WEB" } }, observedAt: "t" };
  useLaunchStore.setState({ server, sessions: {} });
  launch = await row();
  assert.deepEqual([launch.status, launch.checks![0].message], ["ready", "LAUNCH: STOPPED — no application running"]);

  const runtime = { launchId: "l1", projectId: "pa", buildId: "b1", artifact: "forge://pa/b1", runtime: "local-web" as const, status: "running" as const, endpoint: "http://127.0.0.1:51234", port: 51234, startedAt: "", readyAt: "", endedAt: null, exitCode: null, reason: null };
  useLaunchStore.setState({ server, sessions: { pa: { ...IDLE_LAUNCH_SESSION, runtime } } });
  launch = await row();
  assert.deepEqual([launch.status, launch.checks![0].message], ["ready", "LAUNCH: RUNNING Alpha :51234"]);

  useLaunchStore.setState({ server, sessions: { pa: { ...IDLE_LAUNCH_SESSION, runtime: { ...runtime, status: "failed", reason: "exited" } } } });
  launch = await row();
  assert.equal(launch.status, "degraded");
  assert.match(launch.checks![0].message, /^LAUNCH: FAILED — Alpha: exited/);
  useLaunchStore.setState({ server: { kind: "unknown" }, sessions: {} });
});

test("22 separation: Forge knows nothing of Launch; AI knows nothing of Launch; Launch never builds", () => {
  for (const file of ["lib/services/forge/forgeService.ts", "lib/services/forge/serverForge.ts", "app/api/forge/route.ts", "components/Forge/ForgeApp.tsx", "store/useForgeStore.ts", "lib/adapters/forge/esbuildToolchain.ts"]) {
    assert.doesNotMatch(read(file), /launch|runtime adapter|staticServer/i, `${file} reaches Launch`);
  }
  for (const file of ["lib/services/ai/aiGateway.ts", "lib/services/ai/fileProposals.ts", "store/useAIStore.ts", "components/AIConsole/AIConsole.tsx"]) {
    assert.doesNotMatch(read(file), /useLaunchStore|launchClient|\/api\/launch/, `${file} reaches Launch`);
  }
  for (const file of ["lib/services/launch/launchService.ts", "store/useLaunchStore.ts", "components/Launch/LaunchApp.tsx", "lib/adapters/launch/localWebRuntime.ts"]) {
    const source = read(file);
    assert.doesNotMatch(source, /\.build\(|esbuild|materialize/, `${file} builds`);
  }
});

// ── runner ─────────────────────────────────────────────────────────────

async function main() {
  let failed = 0;
  try {
    for (const [name, fn] of tests) {
      try {
        await fn();
        console.log(`  ok   ${name}`);
      } catch (err) {
        failed += 1;
        console.error(`  FAIL ${name}`);
        console.error(err instanceof Error ? (err.stack ?? err.message) : err);
      }
    }
  } finally {
    for (const service of services) await service.stopAll();
    // Every runtime this suite started has exited — none is left holding a port.
    try {
      await until(() => [...pids].every((pid) => !processAlive(pid)), 5000);
      console.log(`  ok   cleanup: all ${pids.size} runtime processes have exited`);
    } catch {
      failed += 1;
      console.error(`  FAIL cleanup: runtime processes still alive: ${[...pids].filter(processAlive).join(", ")}`);
      for (const pid of pids) if (processAlive(pid)) process.kill(pid);
    }
    rmSync(ROOT, { recursive: true, force: true });
  }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

void main();
