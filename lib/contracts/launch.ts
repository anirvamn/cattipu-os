/**
 * MVP-08 — Launch: a successful Forge build, running as a local application.
 *
 *   Launch window ─→ useLaunchStore ─→ LaunchClient ─→ /api/launch
 *                                                        ↓
 *                                                  LaunchService (server)
 *                                                        ↓
 *                          Forge resolves projectId + buildId → artifact directory
 *                                                        ↓
 *                          RuntimeAdapter (local-web) ─→ RuntimeSpawner
 *                                                        ↓
 *                          node + the static server script, bound to 127.0.0.1:<OS port>
 *
 * A request names a project and one of its builds — nothing else. It
 * cannot name a path, a URL, a command or an executable: the server asks
 * Forge where that build's artifact is, and the runtime alone decides what
 * runs. A build that failed, belongs to another project, never existed or
 * whose artifact is gone has no artifact directory, so it cannot launch.
 *
 * Runtime state (starting, running, the port) lives only in the server
 * process that owns the child. The project keeps a history of launches;
 * a stored launch is never read as "running" — only the server says that.
 *
 * Framework-free: no React, no Next, no child_process.
 */

/** The one runtime MVP-08 has: a static web artifact served over HTTP on
 *  the loopback interface. */
export const LAUNCH_RUNTIMES = ["local-web"] as const;
export type LaunchRuntimeId = (typeof LAUNCH_RUNTIMES)[number];

export const LAUNCH_HOST = "127.0.0.1";

export const LAUNCH_LIMITS = {
  /** How long a runtime has to report its port and answer its first request. */
  startTimeoutMs: 10_000,
  /** How long a stopping runtime has to exit before it is killed. */
  stopTimeoutMs: 3_000,
  /** Runtimes this server will keep running at once, across projects. */
  maxRuntimes: 8,
  /** Launches kept in a project's history. */
  maxHistory: 20,
  /** Characters of a runtime's own output kept to explain a failure. */
  maxReasonChars: 300,
} as const;

/**
 * Lifecycle, in the runtime's own words:
 *
 *   stopped → starting → running → stopping → stopped
 *             starting → failed        (never came up)
 *                        running → failed (exited on its own)
 */
export const LAUNCH_STATUSES = ["stopped", "starting", "running", "stopping", "failed"] as const;
export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];

/** What a caller sends to start an application. Ids only. */
export interface LaunchRequest {
  projectId: string;
  buildId: string;
}

/** What a caller sends to stop one. The project names its runtime: there
 *  is at most one per project. */
export interface StopRequest {
  projectId: string;
}

/**
 * One launch, normalised — the LaunchResult. `endpoint` is the address the
 * runtime serves (or served, once it has ended); it is only reachable while
 * `status` is "running".
 */
export interface LaunchRuntime {
  launchId: string;
  projectId: string;
  buildId: string;
  /** Forge's reference for the artifact being served (`forge://…`). */
  artifact: string;
  runtime: LaunchRuntimeId;
  status: LaunchStatus;
  endpoint: string | null;
  port: number | null;
  startedAt: string;
  /** When it answered its first request. */
  readyAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  /** Why it failed or stopped, in plain words. */
  reason: string | null;
}

export type LaunchErrorCode =
  /** The request is malformed: no project, no build, bad ids. */
  | "invalid-request"
  /** Launching is switched off on this server. */
  | "disabled"
  /** The project has no artifact for that build: it failed, belongs to
   *  another project, never existed, or its artifact was removed. */
  | "build-not-found"
  /** The project already has a runtime starting, stopping, or running
   *  another build — or the server is at its runtime limit. */
  | "busy"
  /** Stop was asked of a project with nothing running. */
  | "not-running"
  /** The request never reached Launch. */
  | "network"
  | "internal";

export interface LaunchError {
  code: LaunchErrorCode;
  message: string;
}

/** A runtime that failed to come up is a result (`status: "failed"`), not
 *  an error. Errors are for launches that never started. */
export type LaunchResponse = { ok: true; runtime: LaunchRuntime } | { ok: false; error: LaunchError };

export interface LaunchServerStatus {
  enabled: boolean;
  /** Why launching is unavailable, in plain words; null when it is. */
  reason: string | null;
  runtime: { id: LaunchRuntimeId; label: string };
  /** Every project's current runtime, or the last one it had. */
  runtimes: LaunchRuntime[];
}

/** The client-facing service. React depends on this, never on a process. */
export interface LaunchClient {
  status(): Promise<LaunchServerStatus | LaunchError>;
  launch(request: LaunchRequest): Promise<LaunchResponse>;
  stop(request: StopRequest): Promise<LaunchResponse>;
}

// ── the runtime boundary ───────────────────────────────────────────────

/** One long-lived process: an executable and an argument array. No shell,
 *  no command string, no inherited environment. */
export interface RuntimeProcessSpec {
  executable: string;
  args: readonly string[];
  cwd: string;
}

export interface RuntimeExit {
  code: number | null;
  signal: string | null;
}

/** How an exit reads in a reason. Windows reports a force-killed process as an
 *  unsigned 32-bit code (TerminateProcess's -1 is 4294967295), so a code above
 *  2^31 - 1 is shown as its signed value. */
export function describeExit(exit: RuntimeExit): string {
  if (exit.code !== null) return `code ${exit.code > 0x7fffffff ? exit.code - 0x100000000 : exit.code}`;
  return exit.signal ? `signal ${exit.signal}` : "no exit code";
}

/** A started child, as Launch sees it. */
export interface RuntimeChild {
  pid: number | null;
  /** Every complete line the child writes to stdout. */
  onLine(listener: (line: string) => void): void;
  /** Called once, when the child has exited (or could not start). */
  onExit(listener: (exit: RuntimeExit) => void): void;
  exited(): boolean;
  /** Closes the child's stdin — the runtime's signal to shut down. */
  closeInput(): void;
  kill(): void;
  /** The bounded tail of what it wrote to stderr. */
  errorOutput(): string;
}

/** The process boundary: the one thing tests may replace. */
export type RuntimeSpawner = (spec: RuntimeProcessSpec) => RuntimeChild;

export interface RuntimeHandle {
  pid: number | null;
  host: typeof LAUNCH_HOST;
  port: number;
  alive(): boolean;
  onExit(listener: (exit: RuntimeExit) => void): void;
  /** Asks the runtime to shut down, waits for it, and kills it if it will not. */
  stop(timeoutMs: number): Promise<RuntimeExit>;
}

export type RuntimeStart = { ok: true; handle: RuntimeHandle } | { ok: false; reason: string };

/** Turns an artifact directory into a running application. Launch picks
 *  the adapter; a request cannot. */
export interface RuntimeAdapter {
  id: LaunchRuntimeId;
  label: string;
  start(spec: { root: string }): Promise<RuntimeStart>;
}

export function isLaunchStatus(value: unknown): value is LaunchStatus {
  return typeof value === "string" && (LAUNCH_STATUSES as readonly string[]).includes(value);
}

/** The address a runtime on `port` is reached at. */
export function launchEndpoint(port: number): string {
  return `http://${LAUNCH_HOST}:${port}`;
}
