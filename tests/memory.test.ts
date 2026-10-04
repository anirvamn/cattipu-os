/**
 * MVP-05 (Project Memory + Prompt System).
 *
 *   Memory window / AI Console
 *        ↓ project store (CattipuProject.memory, persisted "cattipu-projects")
 *        ↓ memoryService / promptService (pure rules)
 *   AIService → /api/ai → AIGateway → parseMemoryContext → assembleContext
 *        ↓ provider adapter (separate system blocks)
 *
 * Everything here runs the real stores, services, gateway, adapters and
 * route handler. The only doubles sit at the outside edge: a storage Map
 * standing in for the browser's localStorage (a "reload" is a fresh store
 * module over the same Map), a deferred AIService, and an injected fetch /
 * SDK client in place of a model.
 *
 * Run with: npx tsx tests/memory.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type Anthropic from "@anthropic-ai/sdk";

import type { AIProvider, AIProviderRequest, AIRequest, AIResult, AIService } from "@/lib/contracts/ai";
import type { BuildResult } from "@/lib/contracts/forge";
import type { LaunchRuntime } from "@/lib/contracts/launch";
import { MEMORY_LIMITS, type ProjectMemoryContext } from "@/lib/contracts/memory";
import { PROJECT_SCHEMA_VERSION, createProject, type CattipuProject } from "@/lib/project/types";
import { migrateProject } from "@/lib/project/migrate";
import { activeProject } from "@/lib/os/projects";
import { createAIGateway } from "@/lib/services/ai/aiGateway";
import { assembleContext, parseMemoryContext } from "@/lib/services/ai/contextAssembly";
import { createProviderRegistry } from "@/lib/services/ai/providerRegistry";
import { BUILD_MEMORY_RECORD_ID } from "@/lib/services/forge/buildHistory";
import { LAUNCH_MEMORY_RECORD_ID } from "@/lib/services/launch/launchHistory";
import { memoryService } from "@/lib/services/memory/memoryService";
import { promptService } from "@/lib/services/memory/promptService";
import { createClaudeProvider } from "@/lib/adapters/ai/providers/claude/claudeProvider";
import { createOllamaProvider } from "@/lib/adapters/ai/providers/ollama/ollamaProvider";
import type * as ProjectStoreModule from "@/store/useProjectStore";
import type * as AIStoreModule from "@/store/useAIStore";

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

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

// ── the browser, for a store: storage that outlives a module ───────────

function memoryStorage(data: Map<string, string>): Storage {
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  };
}

interface Stores {
  projects: typeof ProjectStoreModule.useProjectStore;
  ai: typeof AIStoreModule.useAIStore;
  conversationFor: typeof AIStoreModule.conversationFor;
}

/** Fresh store modules over `data` — which is what a page reload is. */
async function session(data: Map<string, string>, run: (stores: Stores) => Promise<void> | void) {
  const g = globalThis as Record<string, unknown>;
  const had = {
    localStorage: Object.getOwnPropertyDescriptor(g, "localStorage"),
    window: Object.getOwnPropertyDescriptor(g, "window"),
  };
  Object.defineProperty(g, "localStorage", { value: memoryStorage(data), configurable: true, writable: true });
  Object.defineProperty(g, "window", { value: globalThis, configurable: true, writable: true });
  const pattern = /[\\/]store[\\/](useProjectStore|useAIStore)\.ts$/;
  const saved = Object.keys(require.cache)
    .filter((key) => pattern.test(key))
    .map((key) => [key, require.cache[key]] as const);
  try {
    for (const [key] of saved) delete require.cache[key];
    /* eslint-disable @typescript-eslint/no-require-imports */
    const projects = (require("@/store/useProjectStore") as typeof ProjectStoreModule).useProjectStore;
    const aiModule = require("@/store/useAIStore") as typeof AIStoreModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    await run({ projects, ai: aiModule.useAIStore, conversationFor: aiModule.conversationFor });
  } finally {
    for (const key of Object.keys(require.cache).filter((k) => pattern.test(k))) delete require.cache[key];
    for (const [key, mod] of saved) require.cache[key] = mod;
    for (const [name, desc] of Object.entries(had)) {
      if (desc) Object.defineProperty(g, name, desc);
      else delete g[name];
    }
  }
}

/** In the past, so opening a project now always makes it the active one. */
const ALPHA_OPENED = "2026-01-02T10:00:00.000Z";
const BETA_OPENED = "2026-01-02T09:00:00.000Z";

const project = (id: string, name: string, lastOpenedAt: string | null = null): CattipuProject => ({
  ...createProject({ name }),
  id,
  lastOpenedAt,
});

const alphaBeta = () => [project("pa", "Alpha", ALPHA_OPENED), project("pb", "Beta", BETA_OPENED)];

const byId = (stores: Stores, id: string) => {
  const found = stores.projects.getState().projects.find((p) => p.id === id);
  assert.ok(found, `project ${id} exists`);
  return found;
};

/** An AIService whose answer is released by the test. */
function deferredService() {
  let release: (result: AIResult) => void = () => {};
  const requests: AIRequest[] = [];
  const service: AIService = {
    status: async () => ({ providerId: "ollama", label: "Local AI", model: "m", configured: true, local: true, setupHint: "" }),
    send: (req) => {
      requests.push(req);
      return new Promise<AIResult>((resolve) => {
        release = resolve;
      });
    },
  };
  return { service, requests, release: (r: AIResult) => release(r) };
}

const answer = (projectId: string, text: string): AIResult => ({
  ok: true,
  response: { projectId, providerId: "ollama", model: "qwen2.5-coder:1.5b", text, stopReason: "stop" },
});

async function converse(stores: Stores, projectId: string, prompt: string, reply: string) {
  const s = deferredService();
  const pending = stores.ai.getState().send(projectId, prompt, s.service);
  s.release(answer(projectId, reply));
  await pending;
  return s.requests[0];
}

// ── 1–2. memory records: creation and update ───────────────────────────

test("1 memory creation: a record gets a kind, trimmed text, timestamps and an id; bad input changes nothing", async () => {
  await session(new Map(), (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    const made = stores.projects.getState().addMemoryRecord("pa", { kind: "api", text: "  REST, JSON, /v1 prefix  " });
    assert.ok(made.ok);
    const record = byId(stores, "pa").memory.records[0];
    assert.equal(record.id, made.ok ? made.value.id : "");
    assert.deepEqual([record.kind, record.text, record.createdAt === record.updatedAt], ["api", "REST, JSON, /v1 prefix", true]);
    assert.match(record.id, /^memory-/);
    const before = byId(stores, "pa").memory;
    for (const [draft, reason] of [
      [{ kind: "context", text: "   " }, "empty-text"],
      [{ kind: "context", text: "x".repeat(MEMORY_LIMITS.maxRecordChars + 1) }, "too-long"],
    ] as const) {
      const result = stores.projects.getState().addMemoryRecord("pa", draft);
      assert.deepEqual(result, { ok: false, reason });
    }
    assert.equal(byId(stores, "pa").memory, before, "a refused change writes nothing");
    assert.deepEqual(stores.projects.getState().addMemoryRecord("nope", { kind: "context", text: "x" }), { ok: false, reason: "not-found" });
    // The memory is bounded: a full project refuses one more record.
    const full = Array.from({ length: MEMORY_LIMITS.maxRecords }, (_, i) => ({ ...record, id: `r${i}` }));
    const capped = memoryService.addRecord({ ...before, records: full }, { kind: "context", text: "one more" }, { id: "x", at: "t" });
    assert.deepEqual(capped, { ok: false, reason: "limit-reached" });
  });
});

test("2 memory update: text and kind change in place, updatedAt moves, createdAt and id do not", async () => {
  await session(new Map(), (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    const made = stores.projects.getState().addMemoryRecord("pa", { kind: "context", text: "Old" });
    assert.ok(made.ok);
    if (!made.ok) return;
    const updated = memoryService.updateRecord(byId(stores, "pa").memory, made.value.id, { kind: "database", text: " Postgres 16 " }, "2030-01-01T00:00:00.000Z");
    assert.ok(updated.ok);
    assert.deepEqual(
      updated.ok && [updated.value.id, updated.value.kind, updated.value.text, updated.value.createdAt, updated.value.updatedAt],
      [made.value.id, "database", "Postgres 16", made.value.createdAt, "2030-01-01T00:00:00.000Z"],
    );
    assert.ok(stores.projects.getState().updateMemoryRecord("pa", made.value.id, { text: "Postgres 16" }).ok);
    assert.equal(byId(stores, "pa").memory.records[0].text, "Postgres 16");
    assert.deepEqual(stores.projects.getState().updateMemoryRecord("pa", "missing", { text: "x" }), { ok: false, reason: "not-found" });
    assert.deepEqual(stores.projects.getState().updateMemoryRecord("pa", made.value.id, { text: " " }), { ok: false, reason: "empty-text" });
    assert.ok(stores.projects.getState().removeMemoryRecord("pa", made.value.id).ok);
    assert.deepEqual(byId(stores, "pa").memory.records, []);
  });
});

// ── 3–4. persistence and isolation of memory ───────────────────────────

test("3 memory persistence + 4 isolation: Alpha and Beta memory survive a reload, each in its own project", async () => {
  const data = new Map<string, string>();
  await session(data, (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    assert.ok(stores.projects.getState().addMemoryRecord("pa", { kind: "context", text: "Alpha project memory" }).ok);
    assert.ok(stores.projects.getState().addMemoryRecord("pb", { kind: "design", text: "Beta project memory" }).ok);
    assert.deepEqual(byId(stores, "pa").memory.records.map((r) => r.text), ["Alpha project memory"]);
    assert.deepEqual(byId(stores, "pb").memory.records.map((r) => r.text), ["Beta project memory"]);
  });
  const stored = JSON.parse(data.get("cattipu-projects") ?? "{}");
  assert.equal(stored.version, PROJECT_SCHEMA_VERSION, "memory is written under the project store's own key and version");
  assert.deepEqual([...data.keys()], ["cattipu-projects"], "no second store: memory has no key of its own");
  await session(data, (stores) => {
    const a = byId(stores, "pa").memory.records;
    const b = byId(stores, "pb").memory.records;
    assert.deepEqual(a.map((r) => [r.kind, r.text]), [["context", "Alpha project memory"]]);
    assert.deepEqual(b.map((r) => [r.kind, r.text]), [["design", "Beta project memory"]]);
  });
});

// ── 5–7. prompts: creation, update, persistence ────────────────────────

test("5 prompt creation: a prompt belongs to its project; the first is the one in use; names are unique per project", async () => {
  await session(new Map(), (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    const made = stores.projects.getState().savePrompt("pa", { name: " Reviewer ", content: " Review like a staff engineer. " });
    assert.ok(made.ok);
    if (!made.ok) return;
    assert.deepEqual(
      [made.value.projectId, made.value.name, made.value.content, made.value.createdAt === made.value.updatedAt],
      ["pa", "Reviewer", "Review like a staff engineer.", true],
    );
    assert.equal(byId(stores, "pa").memory.activePromptId, made.value.id);
    const second = stores.projects.getState().savePrompt("pa", { name: "Terse", content: "One sentence." });
    assert.ok(second.ok);
    assert.equal(byId(stores, "pa").memory.activePromptId, made.value.id, "adding a prompt does not steal the active one");
    assert.deepEqual(stores.projects.getState().savePrompt("pa", { name: "reviewer", content: "x" }), { ok: false, reason: "duplicate-name" });
    assert.deepEqual(stores.projects.getState().savePrompt("pa", { name: " ", content: "x" }), { ok: false, reason: "empty-name" });
    assert.deepEqual(stores.projects.getState().savePrompt("pa", { name: "N", content: " " }), { ok: false, reason: "empty-text" });
    // Same name in another project is a different prompt.
    assert.ok(stores.projects.getState().savePrompt("pb", { name: "Reviewer", content: "Beta rules." }).ok);
    assert.deepEqual(byId(stores, "pb").memory.prompts.map((p) => p.projectId), ["pb"]);
  });
});

test("6 prompt update: edit keeps id and createdAt; choosing, stopping and deleting move the active prompt", async () => {
  await session(new Map(), (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    const a = stores.projects.getState().savePrompt("pa", { name: "Reviewer", content: "v1" });
    const b = stores.projects.getState().savePrompt("pa", { name: "Terse", content: "short" });
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    const edited = promptService.save(byId(stores, "pa").memory, "pa", { id: a.value.id, name: "Reviewer v2", content: "v2" }, { id: "unused", at: "2030-01-01T00:00:00.000Z" });
    assert.ok(edited.ok);
    assert.deepEqual(
      edited.ok && [edited.value.id, edited.value.name, edited.value.content, edited.value.createdAt, edited.value.updatedAt],
      [a.value.id, "Reviewer v2", "v2", a.value.createdAt, "2030-01-01T00:00:00.000Z"],
    );
    assert.ok(stores.projects.getState().savePrompt("pa", { id: a.value.id, name: "Reviewer v2", content: "v2" }).ok);
    assert.equal(byId(stores, "pa").memory.prompts.length, 2, "an edit is not a new prompt");
    assert.deepEqual(stores.projects.getState().savePrompt("pa", { id: "gone", name: "X", content: "y" }), { ok: false, reason: "not-found" });

    assert.ok(stores.projects.getState().setActivePrompt("pa", b.value.id).ok);
    assert.equal(promptService.active(byId(stores, "pa"))?.name, "Terse");
    assert.ok(stores.projects.getState().setActivePrompt("pa", null).ok);
    assert.equal(promptService.active(byId(stores, "pa")), null);
    assert.ok(stores.projects.getState().setActivePrompt("pa", b.value.id).ok);
    assert.ok(stores.projects.getState().removePrompt("pa", b.value.id).ok);
    assert.equal(byId(stores, "pa").memory.activePromptId, null, "deleting the prompt in use leaves none in use");
    assert.deepEqual(stores.projects.getState().setActivePrompt("pa", "gone"), { ok: false, reason: "not-found" });
  });
});

test("7 prompt persistence: prompts and the prompt in use come back after a reload, per project", async () => {
  const data = new Map<string, string>();
  await session(data, (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    assert.ok(stores.projects.getState().savePrompt("pa", { name: "Alpha prompt", content: "Answer as the Alpha architect." }).ok);
    assert.ok(stores.projects.getState().savePrompt("pb", { name: "Beta prompt", content: "Answer as the Beta designer." }).ok);
  });
  await session(data, (stores) => {
    assert.deepEqual(promptService.active(byId(stores, "pa"))?.content, "Answer as the Alpha architect.");
    assert.deepEqual(promptService.active(byId(stores, "pb"))?.content, "Answer as the Beta designer.");
    assert.deepEqual(byId(stores, "pa").memory.prompts.map((p) => p.name), ["Alpha prompt"]);
    assert.deepEqual(byId(stores, "pb").memory.prompts.map((p) => p.name), ["Beta prompt"]);
  });
});

// ── 8–10. conversations: persistence, isolation, reload restoration ────

test("8 conversation persistence: turns keep their roles, text and model across a reload", async () => {
  const data = new Map<string, string>();
  await session(data, async (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    await converse(stores, "pa", "What is Alpha?", "Alpha is a ledger.");
  });
  await session(data, (stores) => {
    const conversation = memoryService.activeConversation(byId(stores, "pa"));
    assert.ok(conversation);
    assert.equal(conversation.projectId, "pa");
    assert.ok(conversation.createdAt && conversation.updatedAt);
    assert.deepEqual(
      conversation.messages.map((m) => [m.role, m.text, m.model ?? null]),
      [["user", "What is Alpha?", null], ["assistant", "Alpha is a ledger.", "qwen2.5-coder:1.5b"]],
    );
    assert.ok(conversation.messages.every((m) => m.id && m.createdAt));
    // In-flight state is not history: a reload never restores "sending".
    assert.deepEqual(stores.ai.getState().sessions, {});
  });
});

test("9 conversation isolation: switching Alpha → Beta → Alpha shows only the active project's turns", async () => {
  await session(new Map(), async (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    await converse(stores, "pa", "Alpha question", "Alpha answer");
    const shown = () => {
      const active = activeProject(stores.projects.getState().projects);
      assert.ok(active);
      return [active.id, stores.conversationFor(active, stores.ai.getState().sessions[active.id]).messages.map((m) => m.text)];
    };
    assert.deepEqual(shown(), ["pa", ["Alpha question", "Alpha answer"]]);
    stores.projects.getState().openProject("pb");
    assert.deepEqual(shown(), ["pb", []], "Beta sees no Alpha conversation");
    await converse(stores, "pb", "Beta question", "Beta answer");
    assert.deepEqual(shown(), ["pb", ["Beta question", "Beta answer"]]);
    stores.projects.getState().openProject("pa");
    assert.deepEqual(shown(), ["pa", ["Alpha question", "Alpha answer"]], "switching back restores Alpha");
    // Clearing Beta's conversation leaves Alpha's.
    stores.ai.getState().clear("pb");
    assert.equal(memoryService.activeConversation(byId(stores, "pb")), null);
    assert.equal(memoryService.activeConversation(byId(stores, "pa"))?.messages.length, 2);
  });
});

test("10 reload restoration: the active project, its memory, prompt and conversation all come back; Beta's too", async () => {
  const data = new Map<string, string>();
  await session(data, async (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    stores.projects.getState().addMemoryRecord("pa", { kind: "context", text: "Alpha project memory" });
    stores.projects.getState().savePrompt("pa", { name: "Alpha prompt", content: "Be Alpha." });
    await converse(stores, "pa", "A1", "A2");
    stores.projects.getState().openProject("pb");
    stores.projects.getState().addMemoryRecord("pb", { kind: "context", text: "Beta project memory" });
    await converse(stores, "pb", "B1", "B2");
  });
  await session(data, (stores) => {
    const active = activeProject(stores.projects.getState().projects);
    assert.equal(active?.id, "pb", "the project open before the reload is open after it");
    const snapshot = (id: string) => {
      const p = byId(stores, id);
      return {
        memory: p.memory.records.map((r) => r.text),
        prompt: promptService.active(p)?.name ?? null,
        turns: memoryService.activeConversation(p)?.messages.map((m) => m.text) ?? [],
      };
    };
    assert.deepEqual(snapshot("pb"), { memory: ["Beta project memory"], prompt: null, turns: ["B1", "B2"] });
    assert.deepEqual(snapshot("pa"), { memory: ["Alpha project memory"], prompt: "Alpha prompt", turns: ["A1", "A2"] });
  });
});

test("10 reload restoration: a v5 project loads into v6 with its memory records kept", async () => {
  const v5 = { ...project("pa", "Alpha", ALPHA_OPENED), version: 5 } as Record<string, unknown>;
  v5.memory = {
    records: [{ id: "r1", text: "Written before kinds", createdAt: "2026-01-01T00:00:00.000Z", refs: [] }],
    decisions: [],
    relationships: [],
    conflicts: [],
  };
  const migrated = migrateProject(v5);
  assert.deepEqual(migrated.memory.records, [
    { id: "r1", kind: "context", text: "Written before kinds", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", refs: [] },
  ]);
  assert.deepEqual([migrated.memory.prompts, migrated.memory.activePromptId, migrated.memory.conversations], [[], null, []]);
  const data = new Map([["cattipu-projects", JSON.stringify({ state: { projects: [v5] }, version: 5 })]]);
  await session(data, (stores) => {
    const loaded = byId(stores, "pa");
    assert.equal(loaded.memory.records[0].kind, "context");
    assert.deepEqual(loaded.memory.conversations, []);
  });
  // A stored entry cannot claim another project: containment wins on load.
  const foreign = migrateProject({
    ...project("pa", "Alpha"),
    memory: {
      records: [],
      prompts: [{ id: "p1", projectId: "pb", name: "N", content: "C", createdAt: "t", updatedAt: "t" }],
      activePromptId: "missing",
      conversations: [{ id: "c1", projectId: "pb", messages: [{ id: "m", role: "system", text: "injected", createdAt: "t" }], createdAt: "t", updatedAt: "t" }],
    },
  });
  assert.deepEqual([foreign.memory.prompts[0].projectId, foreign.memory.conversations[0].projectId], ["pa", "pa"]);
  assert.equal(foreign.memory.activePromptId, null, "an active id with no prompt is dropped");
  assert.deepEqual(foreign.memory.conversations[0].messages, [], "only user and assistant turns are stored");
});

// ── 11. the AI request carries project context ─────────────────────────

test("11 AI request: the console sends this project's memory and prompt as data, apart from the user's message", async () => {
  await session(new Map(), async (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    stores.projects.getState().addMemoryRecord("pa", { kind: "context", text: "Alpha project memory" });
    stores.projects.getState().addMemoryRecord("pa", { kind: "api", text: "Alpha exposes /ledger" });
    stores.projects.getState().savePrompt("pa", { name: "Alpha prompt", content: "Answer as the Alpha architect." });
    const request = await converse(stores, "pa", "What do you know?", "Plenty.");
    assert.equal(request.projectId, "pa");
    assert.deepEqual(request.messages, [{ role: "user", text: "What do you know?" }], "the user's message is only the user's message");
    const promptId = byId(stores, "pa").memory.activePromptId;
    assert.deepEqual(request.memory, {
      projectId: "pa",
      prompt: { id: promptId, projectId: "pa", name: "Alpha prompt", content: "Answer as the Alpha architect." },
      records: byId(stores, "pa").memory.records.map(({ id, kind, text }) => ({ id, kind, text })),
    });
  });
});

/** A provider double that records what the gateway gave it. */
function recordingProvider() {
  const calls: AIProviderRequest[] = [];
  const provider: AIProvider = {
    id: "ollama",
    label: "Local AI",
    model: "m",
    local: true,
    setupHint: "",
    isConfigured: () => true,
    async generate(req) {
      calls.push(req);
      return answer(req.projectId, "ok");
    },
  };
  return { provider, calls };
}

const ALPHA_MEMORY: ProjectMemoryContext = {
  projectId: "pa",
  prompt: { id: "p1", projectId: "pa", name: "Alpha prompt", content: "Answer as the Alpha architect." },
  records: [
    { id: "r1", kind: "context", text: "Alpha project memory" },
    { id: "r2", kind: "api", text: "Alpha exposes /ledger" },
  ],
};

const alphaRequest = (memory: unknown = ALPHA_MEMORY) => ({
  projectId: "pa",
  projectName: "Alpha",
  messages: [{ role: "user", text: "What do you know?" }],
  memory,
});

test("11 AI context: the server assembles system, project prompt and project memory as three separate blocks", async () => {
  const { provider, calls } = recordingProvider();
  const gateway = createAIGateway(createProviderRegistry([provider]), { defaultProvider: () => "ollama" });
  const result = await gateway.handle(alphaRequest());
  assert.equal(result.ok, true);
  const context = calls[0].context;
  assert.deepEqual(context.map((b) => b.source), ["system", "project-prompt", "project-memory"]);
  assert.match(context[0].text, /CATTIPU OS/);
  assert.match(context[0].text, /"Alpha"/);
  assert.match(context[1].text, /Answer as the Alpha architect\./);
  assert.doesNotMatch(context[1].text, /Alpha project memory/, "the prompt block carries the prompt only");
  assert.match(context[2].text, /- \[CONTEXT\] Alpha project memory/);
  assert.match(context[2].text, /- \[API\] Alpha exposes \/ledger/);
  assert.doesNotMatch(context[2].text, /Answer as the Alpha architect/, "the memory block carries memory only");
  assert.deepEqual(calls[0].messages, [{ role: "user", text: "What do you know?" }], "no context is merged into a turn");
  // No memory, no memory blocks; an empty prompt is not a block.
  assert.deepEqual(assembleContext({ projectId: "pa", projectName: "Alpha", messages: [] }).map((b) => b.source), ["system"]);
  assert.deepEqual(
    assembleContext({ projectId: "pa", projectName: "Alpha", messages: [], memory: { projectId: "pa", prompt: null, records: [] } }).length,
    1,
  );
});

test("11 adapters: Ollama gets one system message per block; Claude gets one system text block per block", async () => {
  const request: AIProviderRequest = {
    ...(alphaRequest() as AIRequest),
    providerId: "ollama",
    context: assembleContext(alphaRequest() as AIRequest),
  };
  const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const ollama = createOllamaProvider({
    env: {},
    fetcher: (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ model: "m", message: { content: "ok" }, done_reason: "stop" }), { status: 200 });
    }) as unknown as typeof fetch,
  });
  assert.equal((await ollama.generate(request)).ok, true);
  assert.deepEqual(
    bodies[0].messages.map((m) => m.role),
    ["system", "system", "system", "user"],
  );
  assert.deepEqual(bodies[0].messages.slice(0, 3).map((m) => m.content), request.context.map((b) => b.text));

  const sent: Array<{ system: unknown; messages: unknown }> = [];
  const claude = createClaudeProvider({
    env: { ANTHROPIC_API_KEY: "k" },
    createClient: () =>
      ({
        beta: {
          messages: {
            create: async (args: { system: unknown; messages: unknown }) => {
              sent.push(args);
              return { model: "claude-opus-5", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] };
            },
          },
        },
      }) as unknown as Pick<Anthropic, "beta">,
  });
  assert.equal((await claude.generate({ ...request, providerId: "claude" })).ok, true);
  assert.deepEqual(sent[0].system, request.context.map((b) => ({ type: "text", text: b.text })));
  assert.deepEqual(sent[0].messages, [{ role: "user", content: "What do you know?" }]);
});

// ── 12. no cross-project leakage ───────────────────────────────────────

test("12 leakage: memory or a prompt filed under another project is refused before any provider is asked", async () => {
  const { provider, calls } = recordingProvider();
  const gateway = createAIGateway(createProviderRegistry([provider]), { defaultProvider: () => "ollama" });
  const betaMemory = { projectId: "pb", prompt: null, records: [{ id: "r", kind: "context", text: "Beta project memory" }] };
  const betaPrompt = { ...ALPHA_MEMORY, prompt: { ...ALPHA_MEMORY.prompt, projectId: "pb" } };
  for (const memory of [betaMemory, betaPrompt, { ...ALPHA_MEMORY, projectId: undefined }]) {
    const result = await gateway.handle(alphaRequest(memory));
    assert.equal(!result.ok && result.error.code, "invalid-request");
    assert.match(!result.ok ? result.error.message : "", /different project|project memory/i);
  }
  for (const bad of [
    "text",
    { ...ALPHA_MEMORY, records: [{ id: "r", kind: "secrets", text: "x" }] },
    { ...ALPHA_MEMORY, records: "all" },
    { ...ALPHA_MEMORY, records: [{ id: "r", kind: "context", text: "x".repeat(MEMORY_LIMITS.maxRecordChars + 1) }] },
    { ...ALPHA_MEMORY, prompt: { ...ALPHA_MEMORY.prompt, content: "x".repeat(MEMORY_LIMITS.maxPromptChars + 1) } },
  ]) {
    const result = await gateway.handle(alphaRequest(bad));
    assert.equal(!result.ok && result.error.code, "invalid-request", JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(calls.length, 0, "no refused request reached the provider");
  assert.deepEqual(parseMemoryContext(undefined, "pa"), { ok: true, memory: undefined });
});

test("12 leakage: the real route refuses Beta's memory on an Alpha request", async () => {
  const saved = { AI_PROVIDER: process.env.AI_PROVIDER, OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL };
  process.env.AI_PROVIDER = "ollama";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:9";
  try {
    const route = await import("@/app/api/ai/route");
    const res = await route.POST(
      new Request("http://localhost/api/ai", {
        method: "POST",
        body: JSON.stringify(alphaRequest({ projectId: "pb", prompt: null, records: [] })),
      }),
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as AIResult;
    assert.match(!body.ok ? body.error.message : "", /different project/);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("12 leakage: selection is per project — Alpha's context never holds Beta's entries, whatever is stored", async () => {
  await session(new Map(), async (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    stores.projects.getState().addMemoryRecord("pa", { kind: "context", text: "Alpha project memory" });
    stores.projects.getState().savePrompt("pa", { name: "Alpha prompt", content: "Be Alpha." });
    stores.projects.getState().addMemoryRecord("pb", { kind: "context", text: "Beta project memory" });
    stores.projects.getState().savePrompt("pb", { name: "Beta prompt", content: "Be Beta." });
    await converse(stores, "pa", "Alpha question", "Alpha answer");
    const beta = await converse(stores, "pb", "Beta question", "Beta answer");
    assert.equal(JSON.stringify(beta).includes("Alpha"), false, "Beta's request mentions nothing of Alpha");
    const alphaContext = JSON.stringify(memoryService.contextFor(byId(stores, "pa")));
    assert.equal(alphaContext.includes("Beta"), false);

    // A prompt or conversation that names another project is not used,
    // even if one were ever written into this project.
    const a = byId(stores, "pa");
    const planted: CattipuProject = {
      ...a,
      memory: {
        ...a.memory,
        prompts: a.memory.prompts.map((p) => ({ ...p, projectId: "pb" })),
        conversations: a.memory.conversations.map((c) => ({ ...c, projectId: "pb" })),
      },
    };
    assert.equal(promptService.active(planted), null);
    assert.equal(memoryService.activeConversation(planted), null);
    assert.equal(memoryService.contextFor(planted).prompt, null);
  });
});

test("12 leakage: a duplicated project re-owns the notes and prompts and starts with no conversation", async () => {
  await session(new Map(), async (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    stores.projects.getState().addMemoryRecord("pa", { kind: "context", text: "Alpha project memory" });
    stores.projects.getState().savePrompt("pa", { name: "Alpha prompt", content: "Be Alpha." });
    await converse(stores, "pa", "Q", "A");
    const copy = stores.projects.getState().duplicateProject("pa");
    assert.ok(copy);
    if (!copy) return;
    assert.deepEqual(copy.memory.records.map((r) => r.text), ["Alpha project memory"]);
    assert.deepEqual(copy.memory.prompts.map((p) => p.projectId), [copy.id]);
    assert.equal(promptService.active(copy)?.name, "Alpha prompt");
    assert.deepEqual(copy.memory.conversations, []);
    assert.equal(memoryService.activeConversation(byId(stores, "pa"))?.messages.length, 2, "the source keeps its history");
  });
});

test("12 leakage: a duplicated project starts with no latest-build or latest-launch record and no build history", async () => {
  await session(new Map(), (stores) => {
    stores.projects.setState({ projects: alphaBeta() });
    stores.projects.getState().addMemoryRecord("pa", { kind: "context", text: "Alpha project memory" });

    const buildOf = (projectId: string, buildId: string): BuildResult => ({
      buildId,
      projectId,
      target: "web-app",
      configuration: "production",
      status: "success",
      startedAt: "2026-09-29T00:00:00.000Z",
      completedAt: "2026-09-29T00:00:01.000Z",
      durationMs: 1000,
      summary: "Built",
      diagnostics: [],
      output: "",
      artifact: { reference: `forge://${projectId}/${buildId}`, location: "C:/x", entry: "index.html", files: [], bytes: 1 },
      executed: true,
      sourceFiles: 2,
    });
    const runtime: LaunchRuntime = {
      launchId: "launch-a1",
      projectId: "pa",
      buildId: "build-a1",
      artifact: "forge://pa/build-a1",
      runtime: "local-web",
      status: "stopped",
      endpoint: "http://127.0.0.1:50999",
      port: 50999,
      startedAt: "2026-09-29T00:00:02.000Z",
      readyAt: "2026-09-29T00:00:03.000Z",
      endedAt: "2026-09-29T00:00:04.000Z",
      exitCode: 0,
      reason: null,
    };
    assert.equal(stores.projects.getState().recordForgeBuild("pa", buildOf("pa", "build-a1")), true);
    assert.equal(stores.projects.getState().recordLaunch("pa", runtime), true);
    const source = byId(stores, "pa");
    const ids = (p: CattipuProject) => p.memory.records.map((r) => r.id);
    assert.ok(ids(source).includes(BUILD_MEMORY_RECORD_ID) && ids(source).includes(LAUNCH_MEMORY_RECORD_ID), "the source remembers its latest build and launch");

    const copy = stores.projects.getState().duplicateProject("pa");
    assert.ok(copy);
    if (!copy) return;
    assert.equal(ids(copy).includes(BUILD_MEMORY_RECORD_ID), false, "the copy has no latest-build record");
    assert.equal(ids(copy).includes(LAUNCH_MEMORY_RECORD_ID), false, "the copy has no latest-launch record");
    assert.deepEqual(copy.memory.records.map((r) => r.text), ["Alpha project memory"], "its own notes are kept");
    assert.deepEqual(copy.forge.builds, [], "builds are the source's history, and their artifacts are stored under the source's id");
    assert.deepEqual(copy.launch.runs, []);

    // The source is untouched: duplicating never edits what it copies.
    const after = byId(stores, "pa");
    assert.deepEqual(ids(after), ids(source));
    assert.deepEqual(after.forge.builds.map((b) => b.id), ["build-a1"]);
    assert.deepEqual(after.launch.runs.map((r) => r.id), ["launch-a1"]);

    // The copy's first build of its own is recorded fresh, against its own id.
    assert.equal(stores.projects.getState().recordForgeBuild(copy.id, buildOf(copy.id, "build-c1")), true);
    const built = byId(stores, copy.id);
    assert.deepEqual(built.forge.builds.map((b) => b.id), ["build-c1"]);
    const latest = built.memory.records.filter((r) => r.id === BUILD_MEMORY_RECORD_ID);
    assert.equal(latest.length, 1);
    assert.deepEqual(latest[0].refs, [{ kind: "forge-build", id: "build-c1" }]);
  });
});

test("history: a long persisted conversation sends its latest turns, starting on a user turn", () => {
  const turns = Array.from({ length: MEMORY_LIMITS.maxHistoryMessages + 5 }, (_, i) => ({
    id: `m${i}`,
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    text: `t${i}`,
    createdAt: "t",
  }));
  const history = memoryService.history({ id: "c", projectId: "pa", messages: turns, createdAt: "t", updatedAt: "t" });
  assert.ok(history.length <= MEMORY_LIMITS.maxHistoryMessages);
  assert.equal(history[0].role, "user");
  assert.equal(history[history.length - 1].text, turns[turns.length - 1].text);
  assert.deepEqual(memoryService.history(null), []);
});

// ── UI ─────────────────────────────────────────────────────────────────

type MemoryModule = typeof import("@/components/Memory/MemoryApp");
type ConsoleModule = typeof import("@/components/AIConsole/AIConsole");
/* eslint-disable @typescript-eslint/no-require-imports */
const { MemoryView, EMPTY_PROMPT_DRAFT, EMPTY_RECORD_DRAFT } = require("@/components/Memory/MemoryApp") as MemoryModule;
const { AIConsoleView } = require("@/components/AIConsole/AIConsole") as ConsoleModule;
/* eslint-enable @typescript-eslint/no-require-imports */

const noop = () => {};
const memoryView = (props: Partial<React.ComponentProps<typeof MemoryView>>) =>
  renderToStaticMarkup(
    React.createElement(MemoryView, {
      project: { id: "pa", name: "Alpha" },
      records: [],
      prompts: [],
      activePromptId: null,
      recordDraft: EMPTY_RECORD_DRAFT,
      promptDraft: EMPTY_PROMPT_DRAFT,
      recordError: null,
      promptError: null,
      onRecordDraft: noop,
      onPromptDraft: noop,
      onSaveRecord: noop,
      onSavePrompt: noop,
      onEditRecord: noop,
      onEditPrompt: noop,
      onRemoveRecord: noop,
      onRemovePrompt: noop,
      onUsePrompt: noop,
      ...props,
    }),
  );

test("UI: the Memory window shows the active project's records and prompts, and which prompt is in use", () => {
  const html = memoryView({
    records: [{ id: "r1", kind: "api", text: "Alpha exposes /ledger", createdAt: "t", updatedAt: "t", refs: [] }],
    prompts: [
      { id: "p1", projectId: "pa", name: "Reviewer", content: "Review hard.", createdAt: "t", updatedAt: "t" },
      { id: "p2", projectId: "pa", name: "Terse", content: "Short.", createdAt: "t", updatedAt: "t" },
    ],
    activePromptId: "p1",
  });
  assert.match(html, /data-memory-project="pa"/);
  assert.match(html, /Alpha · PROJECT MEMORY/);
  assert.match(html, /data-kind="api"[\s\S]*?>API<[\s\S]*?Alpha exposes \/ledger/);
  assert.match(html, /Reviewer · IN USE/);
  assert.match(html, /RECORDS 01/);
  assert.match(html, /PROMPTS 02/);
  assert.match(html, /IN USE Reviewer/);
  assert.match(html, /aria-pressed="true"[^>]*>CONTEXT</, "the draft's kind is the pressed switch");
  assert.match(memoryView({}), /Alpha has no prompts/);
  assert.match(memoryView({ project: null }), /data-memory-state="no-project"/);
  assert.match(memoryView({ recordError: "Write something first." }), /role="alert"[^>]*>Write something first\./);
});

test("UI: the AI Console says what memory travels with the next prompt", () => {
  const html = renderToStaticMarkup(
    React.createElement(AIConsoleView, {
      project: { id: "pa", name: "Alpha" },
      provider: { kind: "checking" },
      conversation: { messages: [], status: "idle", error: null },
      memory: { records: 2, prompt: "Alpha prompt" },
      draft: "",
      onDraftChange: noop,
      onSend: noop,
      onClear: noop,
    }),
  );
  assert.match(html, /data-testid="ai-memory"[^>]*>MEMORY 02 · PROMPT Alpha prompt</);
  assert.match(html, /saved with it/);
});

test("UI: the Memory window is the shell's existing Memory window, not a new one", () => {
  const shell = read("components/Shell/CattipuShell.tsx");
  assert.match(shell, /memory: <MemoryApp \/>/);
  assert.doesNotMatch(shell, /<PlaceholderApp/);
});

// ── boundaries ─────────────────────────────────────────────────────────

function listSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const abs = join(ROOT, dir, entry);
    if (statSync(abs).isDirectory()) out.push(...listSource(relative(ROOT, abs)));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, abs).split("\\").join("/"));
  }
  return out;
}

test("boundary: React and the stores never write provider context; only the server assembles it", () => {
  const clientSide = [...listSource("components"), ...listSource("store"), "lib/services/ai/aiService.ts", ...listSource("lib/services/memory")];
  for (const file of clientSide) {
    const src = read(file);
    assert.doesNotMatch(src, /contextAssembly|systemPrompt|assembleContext/, `${file} reaches server context assembly`);
    assert.doesNotMatch(src, /role:\s*["']system["']/, `${file} writes a system turn`);
  }
  // Adapters render the gateway's blocks; they no longer write their own.
  for (const adapter of ["lib/adapters/ai/providers/ollama/ollamaProvider.ts", "lib/adapters/ai/providers/claude/claudeProvider.ts"]) {
    assert.doesNotMatch(read(adapter), /systemPrompt/, `${adapter} builds its own system prompt`);
    assert.match(read(adapter), /request\.context/);
  }
  assert.match(read("lib/services/ai/aiGateway.ts"), /assembleContext\(request\)/);
});

test("boundary: the memory contract is framework- and vendor-free; memory has one owner", () => {
  const contract = read("lib/contracts/memory.ts");
  for (const forbidden of [/from ["']react/, /from ["']next/, /from ["']zustand/, /@anthropic-ai\/sdk/, /process\.env/, /ollama|anthropic/i]) {
    assert.doesNotMatch(contract, forbidden, `${forbidden}`);
  }
  // No second store: nothing but the project store persists project data.
  const persisted = listSource("store").filter((f) => /persist\(/.test(read(f)));
  assert.equal(persisted.includes("store/useAIStore.ts"), false);
  assert.equal(listSource("store").some((f) => /[Mm]emory|[Pp]rompt/.test(f)), false, "no memory or prompt store exists beside the project store");
});

// ── runner ─────────────────────────────────────────────────────────────

async function main() {
  let failed = 0;
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
  console.log(`${tests.length - failed}/${tests.length} passed`);
  if (failed > 0) process.exit(1);
}

void main();
