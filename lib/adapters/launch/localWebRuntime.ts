import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LAUNCH_HOST,
  LAUNCH_LIMITS,
  describeExit,
  launchEndpoint,
  type RuntimeAdapter,
  type RuntimeChild,
  type RuntimeExit,
  type RuntimeSpawner,
  type RuntimeStart,
} from "@/lib/contracts/launch";

/**
 * MVP-08 — LOCAL WEB ARTIFACT, the one runtime Launch has.
 *
 * It runs the Node binary that is running CATTIPU (`process.execPath`) on
 * the repository's own static server script, with one argument: the
 * artifact directory Forge resolved. Executable, script and the shape of
 * the arguments are fixed here; nothing in them comes from a request.
 *
 * A runtime is RUNNING only after all three hold:
 *   1. the child reported its address on stdout,
 *   2. that address is 127.0.0.1 on a port the OS assigned (1024–65535),
 *   3. an HTTP GET / on it returned 200 with exactly the artifact's
 *      index.html — so the port is this runtime, serving this artifact.
 * Anything short of that kills the child and reports why.
 */

const READY = "CATTIPU-RUNTIME-READY ";

/** Exit codes the static server uses to say why it stopped. */
const EXIT_REASONS: Record<number, string> = {
  2: "The artifact directory does not exist or has no index.html.",
  3: "The artifact this application served was removed from disk.",
};

export interface LocalWebRuntimeOptions {
  spawner: RuntimeSpawner;
  /** The Node binary. Default: the one running this server. */
  node?: string;
  /** The static server program. Default: the repository's own. */
  script?: string;
  /** Where the child runs. Not the artifact: a process's working directory
   *  would stop Forge from ever pruning it on Windows. */
  cwd?: string;
  startTimeoutMs?: number;
}

export function staticServerScript(root: string = process.cwd()): string {
  return join(root, "lib", "adapters", "launch", "staticServer.mjs");
}

export function exitReason(exit: RuntimeExit, stderr: string): string {
  const known = exit.code !== null ? EXIT_REASONS[exit.code] : undefined;
  if (known) return known;
  const tail = stderr.trim().split(/\r?\n/).pop()?.slice(0, LAUNCH_LIMITS.maxReasonChars);
  const how = describeExit(exit);
  return tail ? `The application's server exited (${how}): ${tail}` : `The application's server exited (${how}).`;
}

/** Waits for the child's address line, its exit, or the time limit. */
function awaitReady(child: RuntimeChild, timeoutMs: number): Promise<{ host: string; port: number } | { failed: string }> {
  return new Promise((resolve) => {
    let done = false;
    const settle = (value: { host: string; port: number } | { failed: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => settle({ failed: `The application did not start within ${timeoutMs / 1000}s.` }), timeoutMs);
    child.onLine((line) => {
      if (!line.startsWith(READY)) return;
      try {
        const address = JSON.parse(line.slice(READY.length)) as { host?: unknown; port?: unknown };
        settle({ host: String(address.host), port: Number(address.port) });
      } catch {
        settle({ failed: "The application reported an unreadable address." });
      }
    });
    child.onExit((exit) => settle({ failed: exitReason(exit, child.errorOutput()) }));
  });
}

export function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

/** Stops a child: close its stdin, wait, then kill, then wait again. */
function stopChild(child: RuntimeChild, timeoutMs: number): Promise<RuntimeExit> {
  return new Promise((resolve) => {
    if (child.exited()) {
      child.onExit(resolve);
      return;
    }
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    child.onExit((exit) => {
      for (const timer of timers) clearTimeout(timer);
      resolve(exit);
    });
    child.closeInput();
    timers.push(
      setTimeout(() => {
        child.kill();
        timers.push(setTimeout(() => resolve({ code: null, signal: "unconfirmed" }), timeoutMs));
      }, timeoutMs),
    );
  });
}

export function createLocalWebRuntime(options: LocalWebRuntimeOptions): RuntimeAdapter {
  const node = options.node ?? process.execPath;
  const script = options.script ?? staticServerScript();
  const cwd = options.cwd ?? tmpdir();
  const startTimeoutMs = options.startTimeoutMs ?? LAUNCH_LIMITS.startTimeoutMs;

  return {
    id: "local-web",
    label: "LOCAL WEB",

    async start({ root }): Promise<RuntimeStart> {
      const child = options.spawner({ executable: node, args: [script, root], cwd });
      const fail = async (reason: string): Promise<RuntimeStart> => {
        await stopChild(child, LAUNCH_LIMITS.stopTimeoutMs);
        return { ok: false, reason };
      };

      const ready = await awaitReady(child, startTimeoutMs);
      if ("failed" in ready) return fail(ready.failed);
      if (ready.host !== LAUNCH_HOST) return fail(`The application bound ${ready.host}, not ${LAUNCH_HOST}; it was stopped.`);
      if (!validPort(ready.port)) return fail("The application reported an invalid port.");

      // The first request proves the port is this runtime serving this
      // artifact: the page it returns must be the artifact's own.
      try {
        const expected = await readFile(join(root, "index.html"), "utf8");
        const res = await fetch(`${launchEndpoint(ready.port)}/`, { cache: "no-store", signal: AbortSignal.timeout(startTimeoutMs) });
        const body = await res.text();
        if (res.status !== 200 || body !== expected) return fail(`The application answered HTTP ${res.status} without its index.html.`);
      } catch {
        return fail("The application did not answer on its address.");
      }

      return {
        ok: true,
        handle: {
          pid: child.pid,
          host: LAUNCH_HOST,
          port: ready.port,
          alive: () => !child.exited(),
          onExit: (listener) => child.onExit(listener),
          stop: (timeoutMs) => stopChild(child, timeoutMs),
        },
      };
    },
  };
}
