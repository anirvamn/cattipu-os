# CATTIPU OS — Handoff

The single document to read before continuing CATTIPU. Written for a new AI
session or a new contributor who has none of the previous conversations.
It summarises; it does not replace the authorities listed in §2.

Status at writing: **MVP level, local-first**, on `main` at `118a309`
(MVP-09). Next sprint: **Q (MVP-10)**.

---

## 1. What CATTIPU is

CATTIPU OS is an operating environment for building software, made to feel
like a 1998 engineering workstation. The **Project** is the main object, not
the file and not the chat. Every tool in it works on the same project:

```text
Architect  →  Canvas  →  Forge  →  Launch  →  Live
 (plan)       (design)   (build)   (run)      (the running product, future)
```

AI models (local Ollama today, Claude ready) are interchangeable workers
behind adapters. They read the same Project Memory, and none of them owns
the project. The goal for the finished MVP: a newcomer types an idea, answers
a few questions, approves a plan, and CATTIPU writes, builds, fixes and runs
the app inside itself, without the user touching code.

It is a Next.js 15 + TypeScript + zustand app that runs on the user's own
machine. It is **not** deployed to Vercel or any cloud; that is a deliberate
decision by the owner (see §8).

## 2. Read these first, in this order

1. `CLAUDE.md`: agent rules (Git identity, one commit per sprint, no AI
   attribution, npm not pnpm).
2. `PROJECT_CONSTITUTION.md`: the permanent architecture and product law.
   Read all of it.
3. `docs/DESIGN_CONSTITUTION.md` before any visual work, and
   `design-system/ICON_REGISTRY_v1.0.md` before any icon work.
4. The sprint reports `docs/MVP-02_REPORT.md` … `docs/MVP-09_REPORT.md`.
   Each ends with known P2/P3 issues.
5. This file, for where things stand and what comes next.

## 3. How a person uses CATTIPU today

Start it with `npm install` once, then `npm run dev`, and open
<http://localhost:3000>. A short boot sequence resolves into the desktop:
the app rail on the left, the top bar, the window area on the wallpaper,
floating widgets on the right, and the status bar at the bottom.

| To… | Do this |
|---|---|
| Start a project | **Projects** (rail) → type a name → **CREATE**. The project gets a workspace folder and becomes the active project (shown in the top bar). |
| Plan it | **Architect** → describe the software → **Generate**. Today this uses seeded templates rather than an LLM (fixed in sprint S). It fills summary, features, architecture graph, data model, stack, APIs and roadmap. |
| See the design | **Canvas** (rail, or *Open Canvas* in Architect) draws the architecture as a layout you can arrange. |
| Ask the AI | Architect → **Ask AI** opens the AI Console for the active project. It can answer and **propose files**; *Apply* writes them into the project's workspace. |
| Look at / edit files | **Explorer** (rail) → open the project folder → double-click a file to view or edit it. |
| Build | **Forge** (rail) → **Build**. A real esbuild build of the workspace as a web app (`index.html` plus `src/main.ts`, `src/index.ts`, `main.ts` or `.js`). It shows BUILD COMPLETE or BUILD FAILED with diagnostics, the artifact and the history. |
| Run it | **Launch** (rail) → pick a successful build → **Launch**. A real local server starts on `127.0.0.1:<port>`; **Open** opens the running app, **Stop** stops it. |
| Keep notes for the AI | **Memory** (rail): records (context, design, architecture, API, database), prompts and conversations. Forge and Launch add their own latest-build and latest-launch references. |
| Personalise | **Settings** → Wallpaper Studio; right-click the desktop → *Change Wallpaper*. |
| Manage widgets | Each widget's `_` minimises it and `✕` closes it. Closed widgets come back from **ADD WIDGET** at the column's foot or right-click desktop → **Widgets ▸**. |
| Arrange windows | Drag title bars, snap to edges, right-click desktop → *Window ▸ Cascade / Tile / Restore All*, or Ctrl+Alt+C / T / R. |
| See system health | Bell (top bar) for notifications; Settings → Diagnostics for service health. |

The pipeline in one line: **Projects → Architect → Ask AI / Explorer →
Forge → Launch → Open**.

## 4. What is built (all on `main`, all pushed)

| Milestone | Commit | What it delivered |
|---|---|---|
| v0.9 + M-series | (history) | Boot, Golden Master shell, window manager (snap, tile, exact restore), Living Desktop, shared filesystem, Explorer, templates, PixelForge icons, notifications, diagnostics, wallpapers |
| MVP-01 | `b4f3c5a` | Project creation and persistence |
| MVP-02/03 | `a0f84b4` | Project workspaces; Architect → Canvas |
| MVP-04 | `41038c1` | Project-scoped AI gateway (`/api/ai`), Ollama and Claude adapters |
| MVP-05 | `88b2dd6` | Project Memory: records, prompts, conversations |
| MVP-06 | `1e12cf9` | AI proposes files; Apply writes them; Explorer edits them |
| MVP-07 | `5793e20` | Forge: real esbuild builds, artifacts, build history |
| MVP-08 | `77db0d1` | Launch: build artifacts run as real local apps on 127.0.0.1 |
| MVP-09 | `118a309` | Floating widgets over the wallpaper; real minimize, close and add-back |

Verification baseline: `npm run verify` = 23 suites, 489 cases passing;
`npm run build` passing.

## 5. Where things live

| Concern | Owner |
|---|---|
| Contracts (types, errors, boundaries) | `lib/contracts/*.ts` |
| Server services | `lib/services/{ai,forge,launch,memory,filesystem,diagnostics,…}` |
| Native/process/provider adapters | `lib/adapters/{ai,forge,launch}` |
| API routes | `app/api/{ai,forge,launch}/route.ts` |
| Client state (zustand) | `store/use*Store.ts`: projects (persisted), filesystem (persisted), settings (persisted); AI, Forge, Launch (in-flight, not persisted) |
| Project model and migrations | `lib/project/types.ts` (schema v8), `lib/project/migrate.ts` |
| OS registries (pure data) | `lib/os/*.ts`: wallpapers, widgets, templates, filesystem rules |
| Windows | `components/WindowManager` (the one window manager), each app in `components/<App>/` |
| Shell | `components/Shell/CattipuShell.tsx`, `components/InteractiveDesktop` |
| Design system | `design-system/tokens.ts`, `bevel.css`, PixelForge in `components/PixelIcon` |
| Tests | `tests/*.test.ts` (run by `npm test`) |
| Promo spot | `scripts/promo/` (Motion timeline, rendered to `docs/media/`) |

Data today: projects, files and settings live in **browser localStorage**
(`cattipu-projects`, `cattipu-desktop`, `cattipu-settings`). Forge artifacts
live under the OS temp dir (`cattipu-forge/`, override with `FORGE_ROOT`).
Sprint R moves projects to disk.

## 6. Environment notes (owner's Windows machine)

- Use **npm**, never `pnpm install`. Scripts: `npm run dev | build | verify`.
- `.env.local` (gitignored) holds AI settings. **Never print its values.**
  Relevant names: `AI_PROVIDER` (`ollama` or `claude`), `ANTHROPIC_API_KEY`,
  `CATTIPU_CLAUDE_MODEL`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`,
  `OLLAMA_NUM_GPU`, `OLLAMA_TIMEOUT_MS`.
- Ollama is installed at `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` (not on
  PATH in older shells), model `qwen2.5-coder:1.5b`. It is CPU-only: the
  GeForce MX130 crashes Ollama's GPU runner, so `OLLAMA_NUM_GPU` is set. Expect
  slow, short answers until sprint Q.
- Forge and Launch run in `next dev`. In `next start` they are off unless
  `FORGE_ENABLED=1` and `LAUNCH_ENABLED=1`.
- Claude Code desktop: `.claude/launch.json` (git-excluded) defines the
  `dev` preview server on port 3217. A new worktree must recreate it and
  copy `.env.local`.

## 7. The sprint queue (one sprint per session, strictly in order)

Each sprint is one session, named by letter, and ends in **one commit**
(author `anirva09 <anirvavjit2023@gmail.com>`, Conventional Commits, no AI
attribution), a `docs/MVP-XX_REPORT.md`, real-app verification and no push
unless the owner asks. Each one checks that its predecessor is on `main`
first.

| Session | Sprint | Goal | Done when |
|---|---|---|---|
| **Q** | MVP-10 · AI like ChatGPT | Streaming answers end to end; remove the 1,024-token cap; set the context window; an assistant prompt that clarifies before assuming; model and provider picker; stop key; Claude verified; seam for OpenAI and Gemini | "I'd like to build a website" gets a structured, complete answer that starts arriving within seconds |
| **R** | MVP-11 · Projects on disk | Server-side project storage behind the existing stores (one owner, no second store); migrate localStorage; export and import; safe paths | Clearing the browser loses nothing; a project larger than the localStorage cap works |
| **S** | MVP-12 · Idea → plan | An AI requirements interview produces a typed, validated spec; the user approves it; saved to Project Memory and Architect; seeds only as a labelled offline fallback | Three different ideas give three sensible plans |
| **T** | MVP-13 · Real apps | React + TS starter; safe npm packages (no lifecycle scripts, containment kept) | A React app with a small library builds and launches |
| **U** | MVP-14 · AI builds it | Agent loop: AI writes files → Forge builds → AI fixes from diagnostics (capped) → Launch runs; diffs to accept or undo; live preview window | An approved plan becomes a running app without manual fixes in most demo cases |
| **V** | MVP-15 · Easy to use | One guided Create flow (Idea → Questions → Plan → Build → Preview) with one obvious key per step, plus first-run help; left rail untouched | A first-time user builds an app unaided |
| **W** | MVP-16 · Consistency sweep | Fonts locked to role tokens everywhere; responsive fixes at 1366–1920 (and 1536×864); truthful BUILD and MEMORY labels; left rail untouched | Audit table clean, tests enforce it |
| **X** | MVP-17 · Showcase | 3–4 demo projects, "Export app" zip, final README, demo script, full regression | The MVP definition in §1 holds for every demo idea |

The owner has these as session chips in Claude Code desktop. Without them,
paste the row above plus §2 and §6 into a new session.

## 8. The vision after the MVP

**A native Windows application.** CATTIPU becomes an installable desktop app
(Tauri is the intended shell, as `docs/ROADMAP.md` records): its own native
window instead of a browser tab, projects in a real folder on disk, builds and
launched apps as properly managed native processes, system tray and Windows
notifications, an installer (MSI/MSIX) with auto-update, and offline-first
behaviour. The existing `OsObject` filesystem model and the Forge/Launch
process boundaries were designed so this is a host change, not a rewrite.

**LLMs as real collaborators.** One provider-adapter layer for Claude,
OpenAI, Gemini and local models (Ollama, possibly bundled or managed by
CATTIPU), with streaming, a model picker and per-project settings. Project
Memory becomes the shared brain every model reads (decisions, specs,
builds, launches), so switching models never loses context. The agent loop
(sprint U) grows into multi-step work with explicit permissions:
the AI proposes, CATTIPU executes through its own owners, and the user
approves. The AI never runs arbitrary commands.

**Later.** Live (deploy a launched app, logs and runtime inspection),
extensions and a marketplace (templates, blueprints, PixelForge packs),
collaboration. None of this starts before the MVP is finished.

## 9. Known issues carried forward

- System Status and the status bar still say `BUILD: NOT IMPLEMENTED` and
  `MEMORY: NOT IMPLEMENTED` (sprint W).
- Local AI answers are slow and capped at 1,024 tokens (sprint Q).
- Architect generation is seeded, not LLM-driven (sprint S).
- Forge builds only plain web apps with no npm packages (sprint T).
- Data lives in browser localStorage (sprint R).
- Launch: OPEN is a plain link; Forge can prune an artifact that is running
  (the app then fails honestly); nothing polls while the Launch window is
  closed.
- The left rail scrolls when the screen is shorter than its nine keys. The
  owner asked for the rail to be left as it is.
- Full per-sprint lists are at the end of each `docs/MVP-XX_REPORT.md`.

## 10. Media

- `docs/media/screens/`: current screenshots at 1600×900, captured from the
  running app (scenes staged through its own UI, stores and APIs).
- `docs/media/cattipu-ad.mp4`: the 90s-style spot, **silent** and played at
  1.5x (about 27 seconds; the timeline itself is 40s). The owner chose no
  audio. The original retro soundtrack is still in the code (FM-synth bass,
  brass and electric piano, orchestra hits, a gated-reverb breakbeat, a
  22 kHz 8-bit-style finish, CATTIPU's click on every real press). Render
  it with `AD_AUDIO=1`; `AD_SPEED` sets the speed. `cattipu-ad.gif` is a silent
  teaser of its fast section, for the README.
- How it is made, all in `scripts/promo/`:
  - `record.mjs <app url>` drives a running CATTIPU with real mouse and
    keyboard input and records moving clips. It also builds and launches the
    demo game in `scripts/promo/apps/`.
  - `ad.ts` is one Motion timeline: cuts on the beat, zooms onto the real
    clicks, and a synthesized soundtrack.
  - `render-ad.mjs` renders it frame by frame and encodes each frame at its
    exact timestamp with WebCodecs. `mp4.mjs` writes the file, so playback is
    perfectly even. With `AD_AUDIO=1` it records picture and sound together
    instead.
  - The clips are cached in `scripts/promo/.cache/` (gitignored).
