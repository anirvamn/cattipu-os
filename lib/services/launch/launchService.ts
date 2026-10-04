import {
  LAUNCH_HOST,
  LAUNCH_LIMITS,
  describeExit,
  launchEndpoint,
  type LaunchError,
  type LaunchRequest,
  type LaunchResponse,
  type LaunchRuntime,
  type LaunchServerStatus,
  type RuntimeAdapter,
  type RuntimeHandle,
  type StopRequest,
} from "@/lib/contracts/launch";

/**
 * MVP-08 — LaunchService: the lifecycle of a running application, on the
 * server.
 *
 *   validate ids → resolve the build's artifact through Forge → start the
 *   runtime → RUNNING only once it answers → watch it → stop it → STOPPED
 *
 * It owns runtime state and nothing else. It never builds (a build is
 * Forge's), never reads a project's files, and starts processes only
 * through the injected RuntimeAdapter. No React, no HTTP.
 *
 * One runtime per project. Launching the build that is already running
 * returns that runtime; launching another build while one runs is refused
 * until it is stopped — a second process is never started by accident.
 * A project's last runtime is kept after it ends, so the reason it stopped
 * or failed can still be read.
 */

export interface LaunchServiceOptions {
  /** Forge's resolver: the artifact directory of this project's build. */
  locateArtifact: (projectId: string, buildId: string) => Promise<{ directory: string; reference: string } | null>;
  runtime: RuntimeAdapter;
  policy: () => { enabled: boolean; reason: string | null };
  now?: () => Date;
  newLaunchId?: () => string;
}

export interface LaunchService {
  status(): LaunchServerStatus;
  launch(input: unknown): Promise<LaunchResponse>;
  stop(input: unknown): Promise<LaunchResponse>;
  /** Stops every runtime — for this server's own shutdown. */
  stopAll(): Promise<void>;
}

/** The same strict alphabet Forge holds ids to. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;

const failure = (code: LaunchError["code"], message: string): LaunchResponse => ({ ok: false, error: { code, message } });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Narrows untrusted JSON to a LaunchRequest. A `path`, `url`, `command`,
 *  `executable` or anything else a caller adds is dropped: the request
 *  has no way to say what runs or what is served. */
export function parseLaunchRequest(input: unknown): { ok: true; request: LaunchRequest } | { ok: false; response: LaunchResponse } {
  if (!isRecord(input)) return { ok: false, response: failure("invalid-request", "The launch request must be a JSON object.") };
  const { projectId, buildId } = input;
  if (typeof projectId !== "string" || !SAFE_ID.test(projectId)) {
    return { ok: false, response: failure("invalid-request", "A launch must name the project it belongs to.") };
  }
  if (typeof buildId !== "string" || !SAFE_ID.test(buildId)) {
    return { ok: false, response: failure("invalid-request", "A launch must name one of the project's builds.") };
  }
  return { ok: true, request: { projectId, buildId } };
}

export function parseStopRequest(input: unknown): { ok: true; request: StopRequest } | { ok: false; response: LaunchResponse } {
  if (!isRecord(input) || typeof input.projectId !== "string" || !SAFE_ID.test(input.projectId)) {
    return { ok: false, response: failure("invalid-request", "A stop must name the project whose application to stop.") };
  }
  return { ok: true, request: { projectId: input.projectId } };
}

let seq = 0;
const defaultLaunchId = () =>
  `launch-${Date.now().toString(36)}-${(seq += 1).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

interface Entry {
  record: LaunchRuntime;
  handle: RuntimeHandle | null;
}

export function createLaunchService(options: LaunchServiceOptions): LaunchService {
  const now = options.now ?? (() => new Date());
  const newLaunchId = options.newLaunchId ?? defaultLaunchId;
  const entries = new Map<string, Entry>();

  const snapshot = (record: LaunchRuntime): LaunchRuntime => ({ ...record });
  const update = (projectId: string, launchId: string, patch: Partial<LaunchRuntime>) => {
    const entry = entries.get(projectId);
    if (entry && entry.record.launchId === launchId) entry.record = { ...entry.record, ...patch };
    return entry?.record;
  };

  /** A handle whose process has gone is not running, whatever the record
   *  said: its exit is recorded before anything reads the entry. */
  const settle = (entry: Entry) => {
    if (entry.record.status === "running" && entry.handle && !entry.handle.alive()) {
      entry.record = { ...entry.record, status: "failed", endedAt: now().toISOString(), reason: "The application's server is no longer running." };
      entry.handle = null;
    }
    return entry;
  };

  async function stopEntry(projectId: string, entry: Entry): Promise<LaunchRuntime> {
    const { launchId } = entry.record;
    const handle = entry.handle;
    update(projectId, launchId, { status: "stopping" });
    const exit = handle ? await handle.stop(LAUNCH_LIMITS.stopTimeoutMs) : { code: null, signal: null };
    const stopped = update(projectId, launchId, {
      status: "stopped",
      endedAt: now().toISOString(),
      exitCode: exit.code,
      reason: exit.signal === "unconfirmed" ? "Stop requested; the process did not confirm its exit." : "Stopped.",
    });
    const current = entries.get(projectId);
    if (current && current.record.launchId === launchId) current.handle = null;
    return snapshot(stopped ?? entry.record);
  }

  return {
    status() {
      const policy = options.policy();
      return {
        enabled: policy.enabled,
        reason: policy.enabled ? null : policy.reason,
        runtime: { id: options.runtime.id, label: options.runtime.label },
        runtimes: [...entries.values()].map((entry) => snapshot(settle(entry).record)),
      };
    },

    async launch(input) {
      const parsed = parseLaunchRequest(input);
      if (!parsed.ok) return parsed.response;
      const { projectId, buildId } = parsed.request;

      const policy = options.policy();
      if (!policy.enabled) return failure("disabled", policy.reason ?? "Launching is switched off.");

      const previous = entries.get(projectId);
      if (previous) settle(previous);
      if (previous && (previous.record.status === "starting" || previous.record.status === "stopping")) {
        return failure("busy", `This project's application is ${previous.record.status}.`);
      }
      if (previous && previous.record.status === "running") {
        if (previous.record.buildId === buildId) return { ok: true, runtime: snapshot(previous.record) };
        return failure("busy", `Build ${previous.record.buildId} is running. Stop it before launching another build.`);
      }
      const active = [...entries.values()].filter((e) => settle(e).record.status === "running" || e.record.status === "starting");
      if (active.length >= LAUNCH_LIMITS.maxRuntimes) {
        return failure("busy", `${LAUNCH_LIMITS.maxRuntimes} applications are already running. Stop one first.`);
      }

      // Claimed before the first await, so a second request for this
      // project sees "starting" and cannot start a second process.
      const launchId = newLaunchId();
      const record: LaunchRuntime = {
        launchId,
        projectId,
        buildId,
        artifact: `forge://${projectId}/${buildId}`,
        runtime: options.runtime.id,
        status: "starting",
        endpoint: null,
        port: null,
        startedAt: now().toISOString(),
        readyAt: null,
        endedAt: null,
        exitCode: null,
        reason: null,
      };
      entries.set(projectId, { record, handle: null });

      try {
        const located = await options.locateArtifact(projectId, buildId);
        if (!located) {
          if (previous) entries.set(projectId, previous);
          else entries.delete(projectId);
          return failure(
            "build-not-found",
            `This project has no artifact for build ${buildId}: the build failed, never existed, belongs to another project, or its artifact was removed.`,
          );
        }
        update(projectId, launchId, { artifact: located.reference });

        const started = await options.runtime.start({ root: located.directory });
        if (!started.ok) {
          const failed = update(projectId, launchId, { status: "failed", endedAt: now().toISOString(), reason: started.reason });
          return { ok: true, runtime: snapshot(failed ?? record) };
        }

        const { handle } = started;
        const entry = entries.get(projectId);
        if (!entry || entry.record.launchId !== launchId) {
          // Nothing may own a process nobody can see.
          await handle.stop(LAUNCH_LIMITS.stopTimeoutMs);
          return failure("internal", "The launch was superseded while it started.");
        }
        entry.handle = handle;
        const running = update(projectId, launchId, {
          status: "running",
          port: handle.port,
          endpoint: launchEndpoint(handle.port),
          readyAt: now().toISOString(),
        });
        handle.onExit((exit) => {
          const current = entries.get(projectId);
          if (!current || current.record.launchId !== launchId) return;
          current.handle = null;
          // An exit Launch asked for is recorded by stopEntry; any other
          // exit is a failure, and says so.
          if (current.record.status === "running" || current.record.status === "starting") {
            update(projectId, launchId, {
              status: "failed",
              endedAt: now().toISOString(),
              exitCode: exit.code,
              reason:
                exit.code === 3
                  ? "The artifact this application served was removed from disk."
                  : `The application's server exited unexpectedly (${describeExit(exit)}).`,
            });
          }
        });
        return { ok: true, runtime: snapshot(running ?? record) };
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        update(projectId, launchId, { status: "failed", endedAt: now().toISOString(), reason: `Launch failed: ${message}` });
        return failure("internal", `Launch failed: ${message}`);
      }
    },

    async stop(input) {
      const parsed = parseStopRequest(input);
      if (!parsed.ok) return parsed.response;
      const { projectId } = parsed.request;
      const entry = entries.get(projectId);
      if (!entry) return failure("not-running", "This project has no application running.");
      settle(entry);
      if (entry.record.status === "starting" || entry.record.status === "stopping") {
        return failure("busy", `This project's application is ${entry.record.status}.`);
      }
      if (entry.record.status !== "running") return { ok: true, runtime: snapshot(entry.record) };
      return { ok: true, runtime: await stopEntry(projectId, entry) };
    },

    async stopAll() {
      await Promise.all(
        [...entries.entries()]
          .filter(([, entry]) => entry.handle !== null)
          .map(([projectId, entry]) => stopEntry(projectId, entry)),
      );
    },
  };
}

/** Where a running record says its runtime listens — always loopback. */
export function isLoopbackEndpoint(endpoint: string | null): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "http:" && url.hostname === LAUNCH_HOST && Number(url.port) >= 1024;
  } catch {
    return false;
  }
}
