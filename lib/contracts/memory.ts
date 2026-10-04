import type { AIMessage, AIRequest } from "./ai";
import type {
  CattipuProject,
  MemoryArtifacts,
  MemoryRecord,
  ProjectConversation,
  ProjectPrompt,
} from "@/lib/project/types";

/**
 * MVP-05 — Project Memory and project prompts.
 *
 * Memory is the project's own long-lived AI context (PROJECT_CONSTITUTION
 * §14). It is stored where every other project artifact is stored — the
 * `memory` slot of `CattipuProject`, persisted by the project store — so
 * there is no second project store and nothing to keep in step. It holds
 * text the project owner wrote and the project's AI conversations; it
 * references Architect, Canvas and files by id (`ArtifactRef`) and never
 * copies them.
 *
 * Framework- and vendor-free: no React, no store, no provider. The rules
 * live in lib/services/memory/; the server turns a `ProjectMemoryContext`
 * into provider context (lib/services/ai/contextAssembly.ts).
 */

/** What a memory record is about. Deliberately small: the subjects a
 *  person can state about a project today without another app's data.
 *  MVP-07 adds `build`: the latest Forge build, written by Forge as a
 *  reference (`forge-build`), never the build's log. MVP-08 adds `launch`:
 *  the latest local launch, written by Launch as a reference
 *  (`launch-run`), never runtime internals. */
export const MEMORY_RECORD_KINDS = ["context", "architecture", "design", "api", "database", "build", "launch"] as const;
export type MemoryRecordKind = (typeof MEMORY_RECORD_KINDS)[number];

/** The kinds a person writes in the Memory window. `build` is Forge's,
 *  `launch` is Launch's. */
export const WRITABLE_MEMORY_RECORD_KINDS = MEMORY_RECORD_KINDS.filter(
  (kind): kind is Exclude<MemoryRecordKind, "build" | "launch"> => kind !== "build" && kind !== "launch",
);

export const MEMORY_RECORD_LABEL: Record<MemoryRecordKind, string> = {
  context: "CONTEXT",
  architecture: "ARCHITECTURE",
  design: "DESIGN",
  api: "API",
  database: "DATABASE",
  build: "BUILD",
  launch: "LAUNCH",
};

export function isMemoryRecordKind(value: unknown): value is MemoryRecordKind {
  return typeof value === "string" && (MEMORY_RECORD_KINDS as readonly string[]).includes(value);
}

/** Bounds shared by the editor (client) and the gateway (server), so what
 *  the Memory window accepts is exactly what an AI request may carry. */
export const MEMORY_LIMITS = {
  maxRecords: 50,
  maxRecordChars: 2_000,
  maxPrompts: 20,
  maxPromptNameChars: 60,
  maxPromptChars: 4_000,
  /** Earlier turns sent with a new prompt. A persisted conversation keeps
   *  growing; the request does not. */
  maxHistoryMessages: 40,
} as const;

/**
 * What one project's memory contributes to one AI request: structured data,
 * never a rendered prompt. The browser selects it from the project; the
 * server validates it against the request's project and renders it. Every
 * part names its project, so a payload filed under the wrong project is
 * refused instead of reaching a model.
 */
export interface ProjectMemoryContext {
  projectId: string;
  /** The project's active prompt, or null when none is chosen. */
  prompt: { id: string; projectId: string; name: string; content: string } | null;
  records: ReadonlyArray<{ id: string; kind: MemoryRecordKind; text: string }>;
}

export type MemoryFailure =
  | "empty-text"
  | "too-long"
  | "limit-reached"
  | "not-found"
  | "empty-name"
  | "duplicate-name";

/** A memory change: the next `MemoryArtifacts` and the thing it made, or
 *  why nothing changed. The input is never mutated. */
export type MemoryChange<T> =
  | { ok: true; memory: MemoryArtifacts; value: T }
  | { ok: false; reason: MemoryFailure };

/** Identity and time for a new entry, passed in so the rules stay pure. */
export interface MemoryStamp {
  id: string;
  at: string;
}

export interface MemoryRecordDraft {
  kind: MemoryRecordKind;
  text: string;
}

export interface PromptDraft {
  /** Present to edit an existing prompt; absent to create one. */
  id?: string;
  name: string;
  content: string;
}

export interface MemoryService {
  addRecord(memory: MemoryArtifacts, draft: MemoryRecordDraft, stamp: MemoryStamp): MemoryChange<MemoryRecord>;
  updateRecord(
    memory: MemoryArtifacts,
    recordId: string,
    patch: Partial<MemoryRecordDraft>,
    at: string,
  ): MemoryChange<MemoryRecord>;
  removeRecord(memory: MemoryArtifacts, recordId: string): MemoryChange<null>;
  /** The conversation the AI Console shows: the project's latest. */
  activeConversation(project: CattipuProject): ProjectConversation | null;
  /**
   * Files one turn under the project. With `conversationId`, only into that
   * conversation (a reply lands where its question was asked, or nowhere if
   * that conversation was cleared); without, into the active conversation,
   * starting one if there is none.
   */
  appendMessage(
    memory: MemoryArtifacts,
    projectId: string,
    message: AIMessage,
    options: { conversationId?: string; stamp: MemoryStamp },
  ): MemoryChange<ProjectConversation>;
  clearConversation(memory: MemoryArtifacts): MemoryArtifacts;
  /** The turns sent with the next prompt: the latest, starting on a user turn. */
  history(conversation: ProjectConversation | null): AIRequest["messages"];
  /** This project's memory as request data. Only this project's entries. */
  contextFor(project: CattipuProject): ProjectMemoryContext;
  /** Memory for a duplicated project: its notes and prompts, re-owned by
   *  the copy; not its conversations, nor its latest-build and
   *  latest-launch records, which are the source's history. */
  forDuplicate(memory: MemoryArtifacts, projectId: string): MemoryArtifacts;
}

export interface PromptService {
  save(memory: MemoryArtifacts, projectId: string, draft: PromptDraft, stamp: MemoryStamp): MemoryChange<ProjectPrompt>;
  remove(memory: MemoryArtifacts, promptId: string): MemoryChange<null>;
  /** Chooses the prompt sent with AI requests; null sends none. */
  setActive(memory: MemoryArtifacts, promptId: string | null): MemoryChange<ProjectPrompt | null>;
  active(project: CattipuProject): ProjectPrompt | null;
}
