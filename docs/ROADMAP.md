# CATTIPU OS — Roadmap

## The agenda

**Anyone should be able to turn an idea into a working app on their own
computer, without feeling overwhelmed.**

- **Easy first.** One sentence in, a running app out. The workstation's
  depth (Architect, Explorer, Forge, Memory) is there when you want it and
  never in the way.
- **Runs locally.** Projects, code and the AI stay on the user's machine.
  No cloud account, no subscription, works offline.
- **The project remembers.** Project Memory keeps every plan, decision,
  build and run, so every model works with full context.
- **Any model.** Local by default; bring your own key for a frontier model.
  CATTIPU is the harness (memory, starters, build-and-fix loop) that makes
  a small model useful and a large one exceptional.

**North-star test:** a person who has never written code installs CATTIPU
with one click, types one sentence, and has their app running on their own
laptop within minutes, without help.

**Minimum machine we design for:** Windows 10/11, 8 GB RAM, no dedicated
GPU. Anything that only works on a powerful machine is not done.

Each sprint below is one session and one commit, in order. The full scope
and "done when" for every sprint is in [`HANDOFF.md`](HANDOFF.md) §7.

---

## Phase 1 · Foundation (done)

* [x] v0.9 Living Desktop: boot, Golden Master shell, window manager,
      shared filesystem, Explorer, templates, PixelForge icons, wallpapers
* [x] MVP-01 Project creation and persistence
* [x] MVP-02/03 Project workspaces; Architect → Canvas
* [x] MVP-04 Project-scoped AI gateway (Ollama, Claude)
* [x] MVP-05 Project Memory: records, prompts, conversations
* [x] MVP-06 AI proposes files; Explorer edits them
* [x] MVP-07 Forge: real builds and artifacts
* [x] MVP-08 Launch: built apps run locally on 127.0.0.1
* [x] MVP-09 Floating widgets with working controls

## Phase 2 · The finished MVP

Goal: a beginner goes from idea to running app inside CATTIPU.

* [ ] **Q · MVP-10** AI that answers like ChatGPT: streaming, no output cap,
      model picker, Claude verified
* [ ] **R · MVP-11** Projects saved on disk, not just the browser
* [ ] **S · MVP-12** Idea → plan: an AI requirements interview into Architect
* [ ] **T · MVP-13** Real apps: tested React + TypeScript starters, safe npm
      packages
* [ ] **U · MVP-14** The AI builds, fixes and runs the app (agent loop and
      live preview)
* [ ] **V · MVP-15** One guided Create flow for first-time users
* [ ] **W · MVP-16** Consistency sweep: fonts, responsive, truthful labels
* [ ] **X · MVP-17** Showcase: demo projects, export, demo script

## Phase 3 · Production on your own machine → CATTIPU 1.0

Goal: a desktop application people install and trust with their work.
"Production" means installed and reliable, not hosted in the cloud.

* [ ] **Y · MVP-18** Desktop app: a native window (Tauri) with CATTIPU's
      own runtime bundled, projects in a real folder, no Node or terminal
* [ ] **Z · MVP-19** One-click install and model setup: a signed Windows
      installer, hardware check, the right local model picked and
      downloaded automatically, optional bring-your-own key in the OS keychain
* [ ] **AA · MVP-20** Starter apps and reliability: a library of tested
      starters the AI customises, and an evaluation set that measures how
      often an idea becomes a running app
* [ ] **AB · MVP-21** Safety and privacy: confined launched apps,
      reviewable and undoable AI changes, keys never in plain storage,
      verified offline mode, no telemetry
* [ ] **AC · MVP-22** Updates, backup and recovery: auto-update with
      rollback, automatic project backups, crash recovery, a local log users
      can attach to bug reports
* [ ] **AD · 1.0** Release: performance on the minimum machine,
      accessibility, in-app guide and first-run tour, signed release with
      checksums, and five non-coders who each build an app unaided

## After 1.0

* [ ] Live: deploy a launched app, logs and runtime inspection
* [ ] A marketplace for starters, blueprints, extensions and icon packs
* [ ] macOS and Linux builds
* [ ] Collaboration on a shared project
