import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GeneratedArchitecture } from "@/lib/ai/types";
import {
  PROJECT_SCHEMA_VERSION,
  createProject,
  nextProjectId,
  type CanvasArtifacts,
  type CanvasNodePlacement,
  type CattipuProject,
  type ForgeBuild,
  type LaunchRelease,
  type MemoryRecord,
  type ProjectConversation,
  type ProjectIcon,
  type ProjectPrompt,
} from "@/lib/project/types";
import { migrateProjects } from "@/lib/project/migrate";
import { nextProjectName } from "@/lib/os/projects";
import { getTemplate, type ProjectTemplateId } from "@/lib/os/templates";
import { nextNumberedName } from "@/lib/os/filesystem";
import type { CreateProjectResult } from "@/lib/contracts/projects";
import { projectLifecycleService } from "@/lib/services/projects/projectLifecycleService";
import { canvasService } from "@/lib/services/canvas/canvasService";
import type { AIMessage } from "@/lib/contracts/ai";
import type { BuildResult } from "@/lib/contracts/forge";
import { toForgeBuild, withBuild, withLatestBuildMemory } from "@/lib/services/forge/buildHistory";
import type { LaunchRuntime } from "@/lib/contracts/launch";
import {
  reconcileRuns,
  runsNewestFirst,
  toLaunchRun,
  withLatestLaunchMemory,
  withLaunchRun,
} from "@/lib/services/launch/launchHistory";
import type {
  MemoryChange,
  MemoryRecordDraft,
  MemoryStamp,
  PromptDraft,
} from "@/lib/contracts/memory";
import { memoryService } from "@/lib/services/memory/memoryService";
import { promptService } from "@/lib/services/memory/promptService";

/**
 * Milestone 14A (Universal Project Artifact Foundation) — this store now
 * holds `CattipuProject[]` (lib/project/types.ts) instead of the old
 * `Project = metadata + optional GeneratedArchitecture` shape. Existing
 * persisted data (localStorage key "cattipu-projects") is migrated on
 * load — see the `migrate` option below and lib/project/migrate.ts.
 *
 * `ProjectIcon` and the old `Project` name are re-exported here for
 * backward-compatible import paths (ProjectsApp.tsx, FileExplorerApp.tsx,
 * Desktop.tsx, lib/ai/types.ts all import `ProjectIcon` from this file) —
 * only the underlying shape moved, not where callers import it from.
 */
export type { ProjectIcon };
/** @deprecated Use `CattipuProject` (lib/project/types.ts) directly in new
 * code — kept as an alias so no import site needs to change just to pick
 * up the rename. */
export type Project = CattipuProject;

const ICON_COLOR: Record<ProjectIcon, string> = {
  banking: "var(--color-navy)",
  saas: "var(--color-blue)",
  website: "var(--color-purple)",
  generic: "var(--color-green)",
};

interface ProjectState {
  projects: CattipuProject[];
  /** The named project flow used by the Projects window. */
  createProject: (name: string) => CreateProjectResult;
  /** `name` may be omitted — Milestone 19 numbers it from the names in
   *  use, so "New Project" needs no dialog to produce a sane name. */
  addProject: (name?: string) => CattipuProject;
  /** Milestone 19. Creates from a template: the template supplies the
   *  type and icon, which nothing in a project's artifacts could infer. */
  addProjectFromTemplate: (template: ProjectTemplateId) => CattipuProject;
  addProjectFromArchitecture: (data: GeneratedArchitecture) => CattipuProject;
  /** Live sync from Architect's editable store — real persistence, not a
   * snapshot taken only on close. Whoever reopens this project (Explorer,
   * Projects app) gets back exactly what was last edited. */
  updateProjectArchitecture: (id: string, data: GeneratedArchitecture) => void;

  // Milestone 14A — small typed mutation helpers for the four future-app
  // artifact slots, established now so Canvas/Forge/Memory/Launch have an
  // obvious, consistent operation to call instead of reaching into
  // project state by hand. No UI calls these yet (those apps aren't
  // built) — this is the contract, not a feature.
  setCanvasArtifacts: (id: string, canvas: CanvasArtifacts) => void;
  addForgeBuild: (id: string, build: ForgeBuild) => void;
  /**
   * MVP-07 — files a Forge build result under its project: the build in
   * `forge.builds` (bounded history) and the project's one `build` memory
   * record pointed at it. False, and nothing written, when the project does
   * not exist or the result belongs to another project.
   */
  recordForgeBuild: (id: string, result: BuildResult) => boolean;
  appendMemoryRecord: (id: string, record: MemoryRecord) => void;
  addLaunchRelease: (id: string, release: LaunchRelease) => void;
  /**
   * MVP-08 — files what the server reported about one of this project's
   * launches: the run in `launch.runs` (bounded history) and the project's
   * one `launch` memory record pointed at the latest run. False, and
   * nothing written, when the project does not exist or the runtime
   * belongs to another project. A report that changes nothing writes
   * nothing.
   */
  recordLaunch: (id: string, runtime: LaunchRuntime) => boolean;
  /**
   * MVP-08 — brings the project's history in line with the server: `live`
   * is the project's runtime as the server reports it now, or null. Any run
   * the server does not vouch for is recorded as ended.
   */
  reconcileLaunches: (id: string, live: LaunchRuntime | null) => void;

  // ── MVP-03 (Architect → Canvas) ────────────────────────────────────
  // Canvas's visual state lives in the project's `canvas` slot. The rules
  // (grid snapping, placements only for real architecture nodes) belong
  // to canvasService; these persist the result.
  /** False when the project or the node does not exist: nothing moves. */
  placeCanvasNode: (id: string, placement: CanvasNodePlacement) => boolean;
  resetCanvasLayout: (id: string) => void;

  // ── MVP-05 (Project Memory) ────────────────────────────────────────
  // Memory lives in the project's `memory` slot and persists with it. The
  // rules belong to memoryService and promptService; these apply the
  // result to the one project named, and to no other. A project that does
  // not exist is "not-found" and nothing changes.
  addMemoryRecord: (id: string, draft: MemoryRecordDraft) => MemoryChange<MemoryRecord>;
  updateMemoryRecord: (id: string, recordId: string, patch: Partial<MemoryRecordDraft>) => MemoryChange<MemoryRecord>;
  removeMemoryRecord: (id: string, recordId: string) => MemoryChange<null>;
  savePrompt: (id: string, draft: PromptDraft) => MemoryChange<ProjectPrompt>;
  removePrompt: (id: string, promptId: string) => MemoryChange<null>;
  setActivePrompt: (id: string, promptId: string | null) => MemoryChange<ProjectPrompt | null>;
  /** Files one AI turn in the project's conversation (see
   *  memoryService.appendMessage for which one). */
  appendConversationMessage: (
    id: string,
    message: AIMessage,
    conversationId?: string,
  ) => MemoryChange<ProjectConversation>;
  clearConversation: (id: string) => void;

  // ── Milestone 15 (Living Projects) ──────────────────────────────────
  // The verbs the Projects window offers. Every one goes through this
  // store, so a rename in Projects is a rename in Explorer, on the
  // desktop and in Recent - not three copies kept in step by hand.
  //
  // There is deliberately no setProgress or setStatus. Both are derived
  // from artifacts in lib/os/projects.ts, and adding a setter is exactly
  // how a hardcoded percentage gets back in.
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string) => CattipuProject | null;
  removeProject: (id: string) => void;
  /** Marks the project opened. This is what "Last Opened" and the
   *  ordering of Recent are computed from, so it must be called by
   *  whatever actually opens one. */
  openProject: (id: string) => void;
  togglePinned: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
}

function touch(): Pick<CattipuProject, "updatedAt"> {
  return { updatedAt: new Date().toISOString() };
}

/**
 * MVP-05. Reads the one project, asks a memory rule for the change, and
 * writes only that project's memory — in one synchronous step, so a reply
 * arriving late cannot overwrite a newer edit.
 */
function changeMemory<T>(
  get: () => ProjectState,
  set: (update: (s: ProjectState) => Pick<ProjectState, "projects">) => void,
  id: string,
  change: (project: CattipuProject) => MemoryChange<T>,
): MemoryChange<T> {
  const project = get().projects.find((p) => p.id === id);
  if (!project) return { ok: false, reason: "not-found" };
  const result = change(project);
  if (result.ok) {
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, memory: result.memory, ...touch() } : p)),
    }));
  }
  return result;
}

let memorySeq = 0;
/** Id and time for a new memory entry. Time + random, like nextProjectId,
 *  so ids restored from storage are never minted again. */
function memoryStamp(kind: "memory" | "prompt" | "conversation" | "message"): MemoryStamp {
  memorySeq += 1;
  return {
    id: `${kind}-${Date.now().toString(36)}-${memorySeq}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
}

/**
 * MVP-08. Applies a launch-history rule to one project and points its
 * `launch` memory record at the newest run — and writes nothing at all
 * when the rule changed nothing, so polling the server is free.
 */
function applyLaunch(
  get: () => ProjectState,
  set: (update: (s: ProjectState) => Pick<ProjectState, "projects">) => void,
  id: string,
  rule: (launch: CattipuProject["launch"]) => CattipuProject["launch"],
) {
  const project = get().projects.find((p) => p.id === id);
  if (!project) return;
  const launch = rule(project.launch);
  if (launch === project.launch) return;
  const latest = runsNewestFirst({ ...project, launch })[0];
  const at = new Date().toISOString();
  set((s) => ({
    projects: s.projects.map((p) =>
      p.id === id
        ? { ...p, launch, memory: latest ? withLatestLaunchMemory(p.memory, latest, at) : p.memory, ...touch() }
        : p
    ),
  }));
}

/**
 * Fixed, not `new Date()`.
 *
 * `createProject` stamps createdAt/updatedAt from the clock, and this
 * module is evaluated twice - once on the server rendering the page, once
 * in the browser bundle. Two different clocks produced two different
 * timestamps, so the server's "CREATED: 4:34 PM" and the client's
 * disagreed and React threw #418 and discarded the server markup. Seed
 * data is demo content; pinning its timestamps costs nothing and makes
 * the two renders identical by construction.
 */
const SEED_STAMPS = [
  "2026-08-29T12:36:00.000Z",
  "2026-08-28T09:18:00.000Z",
  "2026-08-27T04:52:00.000Z",
] as const;

/**
 * Fixed for the same reason. `nextProjectId()` is clock + random, so the
 * server and the browser each minted their own seed ids and Explorer's
 * `data-entry-id` disagreed on hydration. zustand hydrates from this
 * initial state before applying anything persisted, so the seed has to be
 * identical in both bundles. Persisted projects keep whatever id they were
 * saved with — this only names the demo content a fresh install starts
 * with. The `seed-` segment cannot collide with a minted id, which always
 * starts with a base-36 timestamp.
 */
const SEED_IDS = [
  "project-seed-banking-platform",
  "project-seed-ai-saas-starter",
  "project-seed-cattipu-website",
] as const;

function seed(
  index: number,
  opts: Parameters<typeof createProject>[0],
): CattipuProject {
  const at = SEED_STAMPS[index];
  return { ...createProject(opts), id: SEED_IDS[index], createdAt: at, updatedAt: at };
}

const SEED_PROJECTS: CattipuProject[] = [
  seed(0, { name: "Banking Platform", icon: "banking", color: ICON_COLOR.banking, editedLabel: "Edited 5m ago" }),
  seed(1, { name: "AI SaaS Starter", icon: "saas", color: ICON_COLOR.saas, editedLabel: "Edited 1h ago" }),
  seed(2, { name: "CATTIPU Website", icon: "website", color: ICON_COLOR.website, editedLabel: "Edited 3h ago" }),
];

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: SEED_PROJECTS,

      createProject: (name) => {
        const projects = get().projects;
        const result = projectLifecycleService.createProject(projects, name);
        if (!result.ok) return result;

        // Creation selects the project immediately. `lastOpenedAt` is the
        // one canonical active-project signal used by the shell, Explorer,
        // status bar and filesystem; do not add a second active-id field.
        const selected = projectLifecycleService.selectProject(
          [result.project, ...projects],
          result.project.id,
        );
        const project = selected[0];
        set({ projects: selected });
        return { ok: true, project };
      },

      addProject: (name) => {
        const projects = get().projects;
        const project = createProject({
          name: name?.trim() || nextProjectName(projects),
        });
        set({ projects: [project, ...projects] });
        return project;
      },

      addProjectFromTemplate: (template) => {
        const projects = get().projects;
        const spec = getTemplate(template);
        const project = createProject({
          // Named for the template, numbered like everything else: a
          // second Web App is "Web App (2)", not "Untitled Project (2)".
          // The name is the first thing a person reads in the list, and
          // "Untitled" there wastes the one thing the template knew.
          name: nextNumberedName(
            spec?.label ?? "Untitled Project",
            projects.map((p) => p.name),
          ),
          template,
          type: spec?.type,
          icon: spec?.icon,
          color: spec ? ICON_COLOR[spec.icon] : undefined,
        });
        set({ projects: [project, ...projects] });
        return project;
      },

      addProjectFromArchitecture: (data) => {
        const project = createProject({
          name: data.projectName || "Untitled Project",
          icon: data.projectIcon,
          color: ICON_COLOR[data.projectIcon],
          editedLabel: "Built by Architect · just now",
          idea: { prompt: data.prompt },
          architect: { data },
        });
        set((s) => ({ projects: [project, ...s.projects] }));
        return project;
      },

      updateProjectArchitecture: (id, data) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, architect: { data }, editedLabel: "Edited just now", ...touch() }
              : p
          ),
        }));
      },

      setCanvasArtifacts: (id, canvas) => {
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, canvas, ...touch() } : p)),
        }));
      },

      addForgeBuild: (id, build) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, forge: { ...p.forge, builds: [...p.forge.builds, build] }, ...touch() } : p
          ),
        }));
      },

      recordForgeBuild: (id, result) => {
        if (result.projectId !== id || !get().projects.some((p) => p.id === id)) return false;
        const build = toForgeBuild(result);
        const at = new Date().toISOString();
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, forge: withBuild(p.forge, build), memory: withLatestBuildMemory(p.memory, build, at), ...touch() }
              : p
          ),
        }));
        return true;
      },

      appendMemoryRecord: (id, record) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, memory: { ...p.memory, records: [...p.memory.records, record] }, ...touch() }
              : p
          ),
        }));
      },

      addMemoryRecord: (id, draft) =>
        changeMemory(get, set, id, (p) => memoryService.addRecord(p.memory, draft, memoryStamp("memory"))),

      updateMemoryRecord: (id, recordId, patch) =>
        changeMemory(get, set, id, (p) => memoryService.updateRecord(p.memory, recordId, patch, new Date().toISOString())),

      removeMemoryRecord: (id, recordId) =>
        changeMemory(get, set, id, (p) => memoryService.removeRecord(p.memory, recordId)),

      savePrompt: (id, draft) =>
        changeMemory(get, set, id, (p) => promptService.save(p.memory, p.id, draft, memoryStamp("prompt"))),

      removePrompt: (id, promptId) =>
        changeMemory(get, set, id, (p) => promptService.remove(p.memory, promptId)),

      setActivePrompt: (id, promptId) =>
        changeMemory(get, set, id, (p) => promptService.setActive(p.memory, promptId)),

      appendConversationMessage: (id, message, conversationId) =>
        changeMemory(get, set, id, (p) =>
          memoryService.appendMessage(p.memory, p.id, message, {
            conversationId,
            stamp: memoryStamp("conversation"),
          }),
        ),

      clearConversation: (id) => {
        changeMemory(get, set, id, (p) => ({ ok: true, value: null, memory: memoryService.clearConversation(p.memory) }));
      },

      renameProject: (id, name) => {
        const next = name.trim();
        if (!next) return;              // a blank name is not a rename
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name: next, editedLabel: "Renamed just now", ...touch() } : p
          ),
        }));
      },

      duplicateProject: (id) => {
        const source = get().projects.find((p) => p.id === id);
        if (!source) return null;
        // A copy of the WORK, not of the history: a fresh id and fresh
        // timestamps, never opened. Cloning createdAt would make the
        // duplicate claim an age it does not have, and cloning the id
        // would make two projects the same project.
        const copyId = nextProjectId();
        const copy: CattipuProject = {
          ...structuredClone(source),
          id: copyId,
          // MVP-05: the copy's memory is its own — notes and prompts
          // re-owned by the copy, no conversations (they are history).
          memory: memoryService.forDuplicate(source.memory, copyId),
          // MVP-07: builds are the source's history too. Their artifacts
          // are stored under the source's id, so the copy could not launch
          // them, yet it would show as built.
          forge: { ...structuredClone(source.forge), builds: [] },
          // MVP-08: launches are the source's history; the copy has none.
          launch: { ...structuredClone(source.launch), runs: [] },
          name: `${source.name} copy`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastOpenedAt: null,
          pinned: false,
          favorite: false,
          editedLabel: "Duplicated just now",
        };
        set((s) => ({ projects: [copy, ...s.projects] }));
        return copy;
      },

      removeProject: (id) => {
        set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
      },

      openProject: (id) => {
        set((s) => ({ projects: projectLifecycleService.selectProject(s.projects, id) }));
      },

      togglePinned: (id) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, pinned: !p.pinned, ...touch() } : p
          ),
        }));
      },

      toggleFavorite: (id) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, favorite: !p.favorite, ...touch() } : p
          ),
        }));
      },

      setArchived: (id, archived) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, archived, ...touch() } : p
          ),
        }));
      },

      placeCanvasNode: (id, placement) => {
        const project = get().projects.find((p) => p.id === id);
        const architecture = project?.architect.data;
        if (!project || !architecture) return false;
        const canvas = canvasService.place(project.canvas, architecture, placement);
        if (!canvas) return false;
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, canvas, ...touch() } : p)),
        }));
        return true;
      },

      resetCanvasLayout: (id) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, canvas: canvasService.resetLayout(p.canvas), ...touch() } : p
          ),
        }));
      },

      recordLaunch: (id, runtime) => {
        if (runtime.projectId !== id || !get().projects.some((p) => p.id === id)) return false;
        applyLaunch(get, set, id, (launch) => withLaunchRun(launch, toLaunchRun(runtime)));
        return true;
      },

      reconcileLaunches: (id, live) => {
        if (live && live.projectId !== id) return;
        applyLaunch(get, set, id, (launch) => reconcileRuns(launch, live, new Date().toISOString()));
      },

      addLaunchRelease: (id, release) => {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id
              ? { ...p, launch: { ...p.launch, releases: [...p.launch.releases, release] }, ...touch() }
              : p
          ),
        }));
      },
    }),
    {
      // PROJECT_AUDIT.md Critical-1: this store previously reset on every
      // reload, silently discarding anything built with Architect. Only
      // `projects` needs to survive — Architect's own live-editing state
      // (draft prompt, playback stage, active tab) intentionally stays
      // ephemeral; see SPRINT_02_REPORT.md for why.
      name: "cattipu-projects",
      partialize: (state) => ({ projects: state.projects }),
      // Milestone 14A — a pre-M14A store (no `version` ever configured)
      // persists as version 0 by zustand's own default. Bumping this to
      // PROJECT_SCHEMA_VERSION (1) means any such record fails the
      // version check on load and runs through `migrate` below, which
      // converts every project — including its `architecture`, if any —
      // into the current CattipuProject shape rather than discarding it.
      version: PROJECT_SCHEMA_VERSION,
      migrate: (persistedState) => {
        const state = persistedState as { projects?: unknown } | undefined;
        return { projects: migrateProjects(state?.projects ?? []) };
      },
    }
  )
);
