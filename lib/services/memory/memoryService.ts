import {
  MEMORY_LIMITS,
  type MemoryChange,
  type MemoryFailure,
  type MemoryService,
  type ProjectMemoryContext,
} from "@/lib/contracts/memory";
import type { MemoryArtifacts, MemoryRecord, ProjectConversation } from "@/lib/project/types";
import { BUILD_MEMORY_RECORD_ID } from "@/lib/services/forge/buildHistory";
import { LAUNCH_MEMORY_RECORD_ID } from "@/lib/services/launch/launchHistory";

import { promptService } from "./promptService";

/**
 * MVP-05 — the rules for a project's memory records and conversations.
 *
 * Pure: every function takes the current `MemoryArtifacts` and returns the
 * next one (or why nothing changed). The project store owns the records and
 * persists them; this owns what a valid change is. Ids and times arrive as a
 * stamp, so the same input always produces the same output.
 */

const fail = <T>(reason: MemoryFailure): MemoryChange<T> => ({ ok: false, reason });

/** The records Forge and Launch keep about a project's own latest build and
 *  launch. They belong to the project that made them, so a duplicate leaves
 *  them behind. */
const SOURCE_HISTORY_RECORD_IDS: readonly string[] = [BUILD_MEMORY_RECORD_ID, LAUNCH_MEMORY_RECORD_ID];

function checkText(text: string): MemoryFailure | null {
  if (!text) return "empty-text";
  if (text.length > MEMORY_LIMITS.maxRecordChars) return "too-long";
  return null;
}

export const memoryService: MemoryService = {
  addRecord(memory, draft, stamp) {
    const text = draft.text.trim();
    const problem = checkText(text);
    if (problem) return fail(problem);
    if (memory.records.length >= MEMORY_LIMITS.maxRecords) return fail("limit-reached");
    const record: MemoryRecord = {
      id: stamp.id,
      kind: draft.kind,
      text,
      createdAt: stamp.at,
      updatedAt: stamp.at,
      refs: [],
    };
    return { ok: true, value: record, memory: { ...memory, records: [...memory.records, record] } };
  },

  updateRecord(memory, recordId, patch, at) {
    const current = memory.records.find((r) => r.id === recordId);
    if (!current) return fail("not-found");
    const text = patch.text === undefined ? current.text : patch.text.trim();
    const problem = checkText(text);
    if (problem) return fail(problem);
    const record: MemoryRecord = { ...current, kind: patch.kind ?? current.kind, text, updatedAt: at };
    return {
      ok: true,
      value: record,
      memory: { ...memory, records: memory.records.map((r) => (r.id === recordId ? record : r)) },
    };
  },

  removeRecord(memory, recordId) {
    if (!memory.records.some((r) => r.id === recordId)) return fail("not-found");
    return { ok: true, value: null, memory: { ...memory, records: memory.records.filter((r) => r.id !== recordId) } };
  },

  activeConversation(project) {
    // Owned by the project in hand: an entry that names another project is
    // not this project's conversation, however it got here.
    const own = project.memory.conversations.filter((c) => c.projectId === project.id);
    return own[own.length - 1] ?? null;
  },

  appendMessage(memory, projectId, message, { conversationId, stamp }) {
    const own = memory.conversations.filter((c) => c.projectId === projectId);
    const target = conversationId
      ? own.find((c) => c.id === conversationId)
      : own[own.length - 1];
    if (conversationId && !target) return fail("not-found");
    if (!message.text.trim()) return fail("empty-text");

    const conversation: ProjectConversation = target
      ? { ...target, messages: [...target.messages, message], updatedAt: message.createdAt }
      : { id: stamp.id, projectId, messages: [message], createdAt: stamp.at, updatedAt: message.createdAt };
    const conversations = target
      ? memory.conversations.map((c) => (c.id === target.id ? conversation : c))
      : [...memory.conversations, conversation];
    return { ok: true, value: conversation, memory: { ...memory, conversations } };
  },

  clearConversation(memory) {
    // Clearing ends the console's conversation; the next prompt starts a
    // new one. Earlier conversations are not the console's to delete.
    if (memory.conversations.length === 0) return memory;
    return { ...memory, conversations: memory.conversations.slice(0, -1) };
  },

  history(conversation) {
    if (!conversation) return [];
    const recent = conversation.messages.slice(-MEMORY_LIMITS.maxHistoryMessages);
    const start = recent.findIndex((m) => m.role === "user");
    return start < 0 ? [] : recent.slice(start).map(({ role, text }) => ({ role, text }));
  },

  contextFor(project): ProjectMemoryContext {
    const prompt = promptService.active(project);
    return {
      projectId: project.id,
      prompt: prompt
        ? { id: prompt.id, projectId: prompt.projectId, name: prompt.name, content: prompt.content }
        : null,
      records: project.memory.records
        .filter((r) => r.text.trim())
        .slice(0, MEMORY_LIMITS.maxRecords)
        .map(({ id, kind, text }) => ({ id, kind, text })),
    };
  },

  forDuplicate(memory, projectId): MemoryArtifacts {
    const copy = structuredClone(memory);
    return {
      ...copy,
      // The latest build and launch are the source's history: they point at
      // runs the copy never had. Forge and Launch write them again, in
      // place, when the copy has a build or a launch of its own.
      records: copy.records.filter((r) => !SOURCE_HISTORY_RECORD_IDS.includes(r.id)),
      prompts: memory.prompts.map((p) => ({ ...p, projectId })),
      conversations: [],
    };
  },
};

/** Plain words for a refused change, for the Memory window. */
export function memoryFailureMessage(reason: MemoryFailure): string {
  switch (reason) {
    case "empty-text":
      return "Write something first.";
    case "too-long":
      return `Keep it under ${MEMORY_LIMITS.maxRecordChars} characters (prompts: ${MEMORY_LIMITS.maxPromptChars}).`;
    case "limit-reached":
      return "This project's memory is full. Remove an entry first.";
    case "not-found":
      return "That entry no longer exists.";
    case "empty-name":
      return "Give the prompt a name.";
    case "duplicate-name":
      return "This project already has a prompt with that name.";
  }
}
