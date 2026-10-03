# CATTIPU OS
# CANONICAL CONTEXT & PROJECT CONSTITUTION v1.0

Status: PERMANENT / CANONICAL / NORMATIVE
Project: CATTIPU OS
Repository: https://github.com/anirvamn/cattipu-os
Canonical Branch: origin/main
Repository Owner: anirvamn (GitHub account; commits are authored as anirvamn, see section 3)

> **Contributing a pull request?** You don't need to read this document.
> [`CONTRIBUTING.md`](CONTRIBUTING.md) has every rule that matters for a
> pull request. This constitution binds the maintainer and AI agents.

This document is the permanent institutional memory and operating constitution
for CATTIPU OS.

It exists so that Claude, ChatGPT, Codex, Gemini, Ollama-assisted agents,
future AI systems, and human contributors can enter the repository without
having to reconstruct years of project decisions from chat history.

This document explains:

- what CATTIPU is,
- what it is not,
- who owns each system,
- how the repository is organized,
- the permanent visual identity,
- architectural decisions already made,
- milestone history,
- project-state ownership,
- AI-provider architecture,
- Git rules,
- development protocol,
- verification rules,
- recovery rules,
- roadmap boundaries,
- and the definition of done.

This document is not permission to redesign the product.

It is a constitution for preserving and extending it.

---

## 0. PRIME DIRECTIVE

You are entering a mature software project.

CATTIPU OS has already been built across many milestones, recovery sessions,
visual refactors, architectural migrations, Git consolidations, production
deployments, and identity-preservation efforts.

DO NOT treat this repository as a new project.

DO NOT rebuild CATTIPU from screenshots.

DO NOT infer architecture from one component.

DO NOT replace established systems because you prefer another architecture.

DO NOT modernize the interface.

DO NOT create parallel systems for functionality that already has an owner.

Your job is to:

1. inspect the current canonical repository,
2. understand what already exists,
3. locate the system that owns the requested behavior,
4. reuse that system,
5. implement the smallest correct change,
6. preserve the Golden Master,
7. preserve architectural ownership,
8. preserve backward compatibility whenever practical,
9. verify the entire sprint,
10. create exactly one sprint commit,
11. document the result,
12. stop.

The repository is the implementation source of truth.

This constitution is the architectural and product source of truth.

---

## 0.1 CANONICAL DOCUMENT MAP

The authoritative documents currently live at these exact paths.
Use these paths, not assumed ones.

```text
PROJECT_CONSTITUTION.md              ← this document (product/architecture law)
docs/DESIGN_CONSTITUTION.md          ← Golden Master visual law
docs/DESIGN_SYSTEM.md                ← design system overview
docs/DESIGN_TOKENS.json              ← token source
docs/TYPOGRAPHY.md                   ← typographic law
docs/FOUNDER_VISION.md               ← product intent
docs/ARCHITECTURE.md                 ← architecture overview
docs/ROADMAP.md                      ← roadmap
docs/DECISIONS.md                    ← decision log
docs/COMPONENT_LIBRARY.md            ← component inventory
docs/HOME_SPEC.md                    ← home/desktop spec
docs/GoldenMaster_Fidelity_Report.md ← Golden Master fidelity audit
docs/GoldenMaster_Comparison.png     ← Golden Master reference image
design-system/ICON_REGISTRY_v1.0.md  ← PixelForge law + icon IDs
design-system/ICON_REGISTRY_v1.0.json← machine-readable icon registry
design-system/tokens.ts              ← runtime tokens
design-system/bevel.css              ← bevel/material CSS
```

Where earlier drafts of this constitution referred to `VISUAL_CONSTITUTION.md`,
the real file is `docs/DESIGN_CONSTITUTION.md`.
Do not create a new `VISUAL_CONSTITUTION.md`. Extend the existing document.

Milestone reports are currently split between the repository root
(`MILESTONE1..12_REPORT.md`, `SPRINT_02/03_REPORT.md`,
`PHASE2_SUBSPRINT_01_REPORT.md`) and `docs/` (`M16..M18_REPORT.md`, plus
`docs/m16/`, `docs/m17/`, `docs/m18/`, `docs/v0.9/`).
This is known structural drift. Consolidate it only during an explicit
documentation-consolidation sprint (see section 17).

---

## 1. SOURCE-OF-TRUTH HIERARCHY

When information conflicts, use this precedence.

### 1.1 Runtime / implementation truth

1. Current `origin/main`
2. Current repository tests
3. Current repository types and schemas
4. Current package scripts/configuration
5. This `PROJECT_CONSTITUTION.md`
6. Current architecture documentation
7. Milestone reports
8. Historical descriptions
9. Old conversation transcripts

Historical hashes are never permanently canonical.

`origin/main` may advance.

Always inspect its current HEAD.

### 1.2 Visual truth

1. Current approved Golden Master
2. Production implementation known to match the Golden Master
3. `docs/DESIGN_CONSTITUTION.md`
4. `design-system/ICON_REGISTRY_v1.0.md`
5. approved PixelForge assets
6. approved historical screenshots
7. this document
8. general design assumptions

Never override the Golden Master because something else feels more modern,
cleaner, or easier to implement.

---

## 2. REPOSITORY IDENTITY

Repository:

```text
https://github.com/anirvamn/cattipu-os
```

Canonical production branch:

```text
origin/main
```

Repository owner (GitHub account, renamed from `anirva09`; the old URL
redirects):

```text
anirvamn
```

Commits are authored as `anirvamn`; see section 3.

The current `origin/main` HEAD is the baseline.
Do not rely on old commit hashes after main advances.

---

## 3. PERMANENT GIT IDENTITY

Every CATTIPU commit must use exactly:

```text
Name: anirvamn
Email: anirvavjit2023@gmail.com
```

Before every commit:

```bash
git config user.name
git config user.email
```

Expected:

```text
anirvamn
anirvavjit2023@gmail.com
```

If repository-local configuration must be corrected:

```bash
git config user.name "anirvamn"
git config user.email "anirvavjit2023@gmail.com"
```

This identity rule binds the owner and any AI agent working for the owner.
**Outside contributors commit under their own name and email** and send
pull requests; see `CONTRIBUTING.md`.

### Forbidden Git attribution

Never add:

- Claude attribution
- Anthropic attribution
- OpenAI attribution
- ChatGPT attribution
- Gemini attribution
- AI-generated attribution
- `Co-authored-by:` AI identities
- alternate contributor identities created by an AI

The AI is an engineering tool.
It is not a repository author.

---

## 4. ONE-SPRINT / ONE-COMMIT RULE

Unless explicitly overridden:

```text
ONE REQUESTED SPRINT
=
ONE VERIFIED COMMIT
```

Never produce a series of cleanup commits for one sprint.
Never begin the next milestone automatically.

Finish the requested scope.
Verify.
Commit once.
Report.
Stop.

---

## 5. REQUIRED REPOSITORY ORIENTATION

Before editing anything:

```bash
git fetch origin

git remote -v
git branch --show-current
git status -sb
git log --oneline --decorate -10
git log --oneline --left-right --graph HEAD...origin/main
```

Inspect:

- current branch,
- working tree,
- local modifications,
- untracked files,
- local commits,
- origin/main divergence.

If unexpected work exists:
STOP before destructive action.
Report what exists.
Never automatically discard it.

---

## 6. DEVELOPER RECOVERY PROTOCOL

Before ANY destructive Git operation:

1. inspect `origin/main`,
2. inspect branch divergence,
3. inspect working tree,
4. inspect untracked files,
5. inspect relevant history,
6. create a backup branch if history will be rewritten,
7. report findings before proceeding.

Never casually run:

```bash
git reset --hard
git clean -fd
git push --force
git rebase --onto ...
git branch -D ...
```

without understanding what will be lost.

If recovery is necessary, investigate first:

```bash
git branch -a
git log --all --oneline --decorate --graph
git log --all -- path/to/file
git reflog
```

Preserve user work.
Never destroy history just to make Git look clean.

---

## 7. WHAT CATTIPU OS IS

CATTIPU is not an IDE with AI.
CATTIPU is an operating system whose primary object is the Project.

CATTIPU is an AI-native operating environment for creating software.
It is not intended to replace Windows, macOS, or Linux as a general-purpose
consumer operating system.

It is a creative operating layer where users can:

- plan software,
- model architecture,
- design interfaces,
- manage project files,
- generate source code,
- inspect systems,
- run builds,
- test applications,
- preview software,
- connect APIs,
- deploy products,
- monitor deployments,
- preserve project memory,

without constantly switching between separate tools.

The operating system owns the project.
AI models are interchangeable workers.

---

## 8. PERMANENT OWNERSHIP HIERARCHY

This ownership model is constitutional.

```text
PROJECT
  owns long-lived product identity and work

FILES
  belong to PROJECTS

WINDOWS
  belong to the SHELL

AI
  belongs to PROJECT MEMORY

DEPLOYMENTS
  belong to LAUNCH
```

Expanded:

```text
CATTIPU OS
│
├── Shell
│   ├── windows
│   ├── desktop
│   ├── navigation
│   ├── command surfaces
│   └── system chrome
│
├── Project
│   ├── files
│   ├── architecture
│   ├── design
│   ├── implementation
│   ├── tasks
│   ├── builds
│   └── memory
│
├── Project Memory
│   └── AI intelligence and long-lived context
│
└── Launch
    └── deployment ownership
```

Every future feature must strengthen this model.
If a proposed implementation creates conflicting ownership, reconsider it.

---

## 9. PROJECT-FIRST PRINCIPLE

The file is not the primary object.
The Project is.

Files are one representation of the Project.

Future architecture should allow CATTIPU to understand a project beyond its
directory tree.

A Project may eventually encompass:

```text
identity
requirements
architecture
design
files
APIs
database
prompts
tasks
bugs
decisions
tests
builds
deployments
AI history
project memory
```

Do not reduce Project semantics to:

```text
folder path + files
```

The Project is the durable operating-system object.

---

## 10. PERMANENT CREATION PIPELINE

The canonical product-development pipeline is:

```text
Architect
   ↓
Canvas
   ↓
Forge
   ↓
Launch
   ↓
Live
```

Meaning:

### Architect

Defines what the system is.

Owns:

- requirements
- services
- entities
- APIs
- architecture
- technical relationships
- system planning

### Canvas

Defines what the product looks and behaves like.

Owns:

- screens
- interface design
- layout
- visual composition
- interaction design

### Forge

Turns plans into implementation.

Owns:

- source generation
- code transformation
- tests
- builds
- implementation tasks
- build execution

### Launch

Owns shipping.

Owns:

- deployment
- deployment configuration
- release actions
- rollback
- production promotion

### Live

Represents the running product.

May include:

- application preview
- runtime console
- logs
- observability
- production state
- runtime inspection

Future work must reinforce this pipeline rather than bypass it.
A feature should not skip ownership boundaries simply because calling an API
directly is easier.

---

## 11. LONG-TERM NORTH STAR

Eventually a user should be able to say:

Build Surang Saathi.

CATTIPU should:

1. create the Project,
2. establish identity,
3. interpret the requirement,
4. plan architecture,
5. define product features,
6. design screens,
7. create filesystem structure,
8. generate implementation,
9. build backend services,
10. connect APIs,
11. run tests,
12. preview locally,
13. record important decisions,
14. commit changes,
15. deploy,
16. monitor deployment,
17. preserve the complete Project Memory.

The user should not have to coordinate a separate IDE, Figma, Git client,
terminal, AI chat, deployment interface, and project-memory system.

---

## 12. AI PROVIDERS ARE WORKERS

CATTIPU may orchestrate:

- Claude
- ChatGPT / OpenAI
- Gemini
- Ollama
- future providers

But no AI provider owns the Project.

Never architect core state around one model vendor.

Canonical conceptual architecture:

```text
Project
   ↓
Project Memory / OS Context
   ↓
CATTIPU AI Service
   ↓
Provider Adapter
   ↓
Claude / OpenAI / Gemini / Ollama / Future Provider
```

Providers must remain replaceable.

---

## 13. PROVIDER ADAPTER RULE

UI components MUST NOT own provider-specific behavior.

Forbidden:

```text
React Component
  ↓
direct Claude API implementation
```

Forbidden:

```text
React Component
  ↓
direct OpenAI-specific project logic
```

Required architecture:

```text
UI
 ↓
CATTIPU Service
 ↓
Provider Adapter
 ↓
External Provider
```

Provider-specific:

- authentication,
- request shaping,
- streaming,
- API compatibility,
- model IDs,

belong in adapters/services.

Product semantics remain provider-independent.

---

## 14. PROJECT MEMORY CONSTITUTION

Project Memory is the future owner of long-lived project intelligence.

Do not implement the entire Project Memory system unless explicitly requested.
However, every related feature must preserve its future ownership.

Conceptual structure:

```text
Project
 ├── identity
 ├── architecture
 ├── design
 ├── APIs
 ├── database
 ├── prompts
 ├── AI conversations
 ├── tasks
 ├── bugs
 ├── decisions
 ├── builds
 └── deployments
```

Likely future additions may include:

```text
requirements
tests
files
runtime incidents
release history
external integrations
```

Do not create competing long-term stores for these concepts when Project Memory
is their intended owner.

---

## 15. PROJECT MEMORY DESIGN PRINCIPLE

Project Memory must eventually let every connected AI understand the same
project.

The target is:

```text
Claude
ChatGPT
Gemini
Ollama
   ↓
same Project Memory
   ↓
same CATTIPU Project
```

Do not store all intelligence as one giant prompt string.
Prefer stable structured relationships.

But do not prematurely invent the final M24 schema before that milestone is
explicitly requested.

---

## 16. PERMANENT REPOSITORY STRUCTURE

Treat this as the canonical organizational target:

```text
app/                → Routing

components/
  Shell/
  Window/
  Desktop/
  Explorer/
  Architect/
  Icons/
  UI/

store/

lib/
  os/
  ai/

design-system/

public/
  logo/
  pixelforge/
  cursors/
  wallpapers/

docs/
  history/
  v0.9/
```

Never invent parallel directories for systems that already have canonical
ownership.

Examples:

Bad:

```text
components/NewWindowSystem/
components/WindowManager2/
lib/filesystem-new/
store/projectV2Alternative/
```

Good:

```text
components/Window/
lib/os/
store/
```

Extend the owner.
Do not duplicate it.

---

## 17. REPOSITORY-STRUCTURE MIGRATION SAFETY

The permanent repository structure is canonical, but do NOT perform a massive
directory migration during an unrelated sprint.

If current `origin/main` contains historical paths that differ:

1. understand them,
2. use existing canonical implementation,
3. document structural drift,
4. migrate only during an explicit consolidation/refactor sprint.

Never create the new canonical path while leaving a second live implementation
at the old path.

The goal is consolidation, not duplication.

---

## 18. EXTENSION CONSTITUTION

Future external capabilities should converge on one extension model.

Every extension should eventually expose concepts equivalent to:

```ts
{
  id,
  name,
  version,
  icon,
  permissions,
  commands,
  panels,
  filesystemAccess,
  aiAccess,
  settings
}
```

Potential extension categories include:

- AI providers
- GitHub
- Vercel
- Figma
- terminals
- databases
- cloud services
- developer tools
- future Marketplace packages

Do not prematurely build the full Extension SDK before its milestone.
But do not hardcode architecture today that makes a future extension system
impossible.

---

## 19. NEVER-DUPLICATE SYSTEM OWNERS

The following have or will have exactly one canonical owner.
Never create second implementations.

- filesystem
- project store
- window manager
- notification system
- icon system
- boot system
- wallpaper owner
- Project Memory owner
- command palette / command center owner

If one is disconnected:
INTEGRATE IT.
Do not rebuild it.

---

## 20. GOLDEN MASTER DESIGN CONSTITUTION

The visual language is established.
It is immutable unless the user explicitly requests a redesign.

CATTIPU should feel like an alternate-universe operating system built around
1998 for engineers and software creators.

Influences include:

- BeOS
- Mac OS 8
- Haiku
- MenuetOS
- industrial CAD systems
- engineering terminals
- molded computer hardware
- workstation software

CATTIPU is not a Windows clone.
It must become recognizable as CATTIPU from a single screenshot.

---

## 21. PERMANENT VISUAL LANGUAGE

Preserve:

- warm cream engineering-paper desktop
- subtle engineering-paper grid/texture
- molded navy system chrome
- molded cream plastic
- square component geometry
- physical bevels
- retro mechanical depth
- PixelForge icons
- original boot sequence
- molded navigation/dock
- CATTIPU window chrome
- physical machine-like controls

Established typography may include:

- Press Start 2P
- Inter
- VT323

Current production code, `docs/DESIGN_CONSTITUTION.md` and
`docs/TYPOGRAPHY.md` determine exact usage.

---

## 22. MATERIAL PHILOSOPHY

Every surface should feel manufactured.

```text
Desktop      = engineering paper
Window       = molded plastic chassis
Button       = physical switch
Panel        = machine enclosure
Title bar    = departmental identification plate
Status bar   = instrumentation
Icon         = small manufactured PixelForge symbol/object
```

Highlights represent light catching an edge.
Shadows represent material depth.
They are not modern elevation decoration.

---

## 23. FORBIDDEN DESIGN DRIFT

Never introduce unless explicitly requested:

- glassmorphism
- translucent cards
- blur
- soft modern shadows
- Material Design
- Vercel-style dashboards
- modern SaaS cards
- excessive rounded corners
- pill buttons
- floating rounded nav bars
- neumorphism
- gradient-heavy visuals
- soft spring animations
- scale-pop transitions
- modern outline icon libraries
- arbitrary spacing
- arbitrary colors
- generic AI sparkle symbolism

Do not "fix" retro spacing because modern design conventions differ.

---

## 24. SEMANTIC COLOR GRAMMAR

The established system uses semantic departmental color.

Conceptually:

```text
Navy      → System
Red       → Projects
Green     → Status / success
Purple    → Architect
Gold      → Welcome / attention
Cream     → chassis
DarkCream → recessed/material secondary
```

Exact current tokens in `design-system/tokens.ts` and `docs/DESIGN_TOKENS.json`
are authoritative.

Use tokens.
Do not scatter duplicate hex values when a token exists.
Never reassign semantic color meaning casually.

---

## 25. PIXELFORGE CONSTITUTION

PixelForge is the permanent CATTIPU icon system.
Do not introduce a second icon family.

The canonical navigation icons establish the visual language.

Read:

```text
design-system/ICON_REGISTRY_v1.0.md
design-system/ICON_REGISTRY_v1.0.json
```

when working on icons.

Core rules include:

```text
32×32 production master
16×16 separately handcrafted compact master
2px structural outline at 32
1px structural outline at 16
1px top-left highlight
1px bottom-right shade
integer pixel geometry
silhouette-first design
optical centering
muted industrial palette
no antialiasing
no gradients
no blur
```

---

## 26. PIXELFORGE MISSING-ASSET RULE

If an icon asset does not exist:

DO NOT substitute:

- Lucide
- Heroicons
- Material Icons
- Font Awesome
- emoji
- generated placeholder artwork

unless the sprint explicitly authorizes icon manufacturing.

Report the missing asset.
A development-only missing-icon marker is preferable to silently creating a
second icon language.

Known drift: `lucide-react` is currently a declared dependency in
`package.json`. Its presence is historical, not a licence to reach for it.
Removing or containing it is a future cleanup sprint, not an inline fix.

---

## 27. BOOT SYSTEM — PROTECTED

The original CATTIPU boot sequence is intentional.

An important historical bug occurred when boot appeared broken.
The boot implementation itself was not the problem.
The issue was stacking/visibility.

Therefore never casually rewrite boot.

Before modifying boot code investigate:

- z-index
- stacking contexts
- shell mounting
- overlays
- opacity
- visibility
- hydration
- route transitions
- layout containment

Preserve:

- visuals
- text
- sequence
- timing
- identity
- transitions

unless boot itself is explicitly in scope.

---

## 28. CORE ARCHITECTURAL PRINCIPLE

CATTIPU is one operating system.
It is not a collection of independent demo widgets.

Before implementing state ask:

Which OS-level system owns this?

Examples:

```text
file          → filesystem
project       → project store/model
window        → WindowManager
notification  → notification system
AI context    → Project Memory
deployment    → Launch
wallpaper     → wallpaper owner
command       → command palette/center
```

Do not create component-local parallel ownership for convenience.

---

## 29. EXISTING SHELL SYSTEM

The repository has historically contained systems equivalent to:

- CattipuShell
- BootScreen
- PixelLogo
- TopBar
- Sidebar
- BottomStatusBar

Exact current filenames may differ.
Search before creating replacements.

The Shell owns windows and operating-system-level presentation.

---

## 30. WINDOW SYSTEM

The project already has an interactive window system.

Concepts include:

- ManagedWindow
- WindowManager
- reducer
- hooks
- active window
- focus
- z-index
- dragging
- minimize
- restore
- maximize
- close
- window persistence

Individual applications must not create their own independent window managers.

---

## 31. DESKTOP SYSTEM

Existing desktop concepts include:

- desktop shortcuts
- desktop objects
- context menu
- Explorer
- Projects Window
- widget stack
- interactive Shell surfaces

Audit current code before modifying them.

---

## 32. ARCHITECT SYSTEM

Architect has already evolved significantly.

Historically M11 replaced the old PlannerPanel with modular architecture.

Early modular panels included:

- SummaryPanel
- FeaturesPanel
- StackPanel

Architect later expanded substantially.
The current repository is authoritative for the full panel set.

Do not reintroduce another architecture-planning system.
Extend Architect.

---

## 33. NOTIFICATION SYSTEM

M12 created a notification architecture and notification store.

Do not create component-local notification mechanisms for new features.
Use the existing notification system.

M22 may later evolve it into a complete Notification Center.

---

## 34. PROJECT FOUNDATION — M14

M14 established:

- project schema
- project types
- migration architecture

The project model became foundational infrastructure.
Do not bypass it with ad-hoc project objects.

---

## 35. LIVING PROJECTS — M15

M15 established the principle that Projects should derive from shared OS state.

Important decisions:

- progress is derived
- status is derived
- duplicate project state is undesirable
- owner information should have one owner
- migrations matter
- hydration consistency matters
- timestamps must remain deterministic

Never return to demo/fake values when canonical project state exists.

---

## 36. DESKTOP EVOLUTION — M16

M16 expanded:

- desktop shortcuts
- desktop behavior
- filesystem integration foundations
- interaction quality

Future desktop work should build on this architecture.

Reference: `docs/M16_REPORT.md`, `docs/m16/`.

---

## 37. SHARED FILESYSTEM — M17

M17 established one of the most important architectural rules.

CATTIPU has a shared filesystem.

Explorer, Desktop, Projects, Forge, and future tools should operate on the same
filesystem representation.

Never create:

```text
desktopFiles[]
explorerFiles[]
forgeFiles[]
```

as independent copies of the same conceptual files.

The filesystem owns files.
Files belong to Projects.

Reference: `docs/M17_REPORT.md`, `docs/m17/`, `lib/os/`.

---

## 38. FILESYSTEM FEATURE PROTOCOL

Before implementing file/folder functionality:

1. inspect filesystem schema,
2. inspect filesystem store,
3. inspect migration/version logic,
4. inspect Explorer,
5. inspect Desktop,
6. inspect Projects integration,
7. inspect existing actions/selectors,
8. reuse canonical operations.

Generated files from Forge must enter the same filesystem.

---

## 39. INTERACTIVE SHELL — M18

M18 established managed production windows.

Expected behavior includes:

- drag by title bar
- bring to front
- z-order
- active/inactive windows
- minimize
- restore
- maximize
- close
- multiple windows
- launcher integration
- persisted state where implemented

Window behavior belongs to WindowManager.

Reference: `docs/M18_REPORT.md`, `docs/m18/`.

---

## 40. BOOT RESTORATION HISTORY

Boot restoration was a significant recovery milestone.

Lesson:

```text
visual disappearance ≠ implementation failure
```

The original boot remained correct.
The surrounding shell stacking was wrong.

This history exists to prevent future agents from unnecessarily replacing
working foundational systems.

---

## 41. M19 SYSTEM POLISH

M19 added important operating-system behavior.

### Live Clock

Rules established:

- local timezone
- browser locale
- minute synchronization
- hydration-safe rendering

### Intelligent Folder Naming

```text
Untitled Folder
Untitled Folder (2)
Untitled Folder (3)
```

### Intelligent Project Naming

```text
Untitled Project
Untitled Project (2)
```

Numbers are derived.
Renaming/deleting can naturally free a number.
Do not use a global permanent counter unless current code explicitly does.

### Dynamic Document Title

Examples:

```text
CATTIPU OS — Banking Platform
CATTIPU OS — AI Agent
```

### Templates

Established templates include:

- Web App
- Mobile App
- API
- AI Agent
- SaaS
- Dashboard
- Chrome Extension
- Desktop App
- CLI Tool
- Game

Templates initialize metadata.
Templates do not inherently mean immediate full code generation.

---

## 42. RESPONSIVE BASELINE

Historically validated viewport targets include:

```text
1366×768
1440×900
1600×900
1920×1080
```

For desktop geometry changes verify relevant sizes.

Do not solve responsiveness by converting CATTIPU into a modern mobile
dashboard.

Preserve the workstation metaphor.

---

## 43. CANONICAL CONSOLIDATION HISTORY

The repository underwent major consolidation.

Work included:

- Git recovery
- branch consolidation
- canonical main
- obsolete branch cleanup
- production deployment
- Vercel migration/deployment
- identity preservation

The desired model is:

```text
ONE CANONICAL PRODUCTION LINE
       ↓
origin/main
```

Do not resurrect obsolete architecture from abandoned branches without a
deliberate recovery reason.

---

## 44. VERCEL / DEPLOYMENT RULE

Production deployment has used Vercel.

Before changing deployment architecture inspect:

- package.json
- package manager
- build scripts
- Next.js configuration
- environment variables
- Vercel configuration
- current production branch
- output mode

Do not migrate framework, host, router, bundler, or package manager during an
unrelated sprint.

### Package manager rule (hard-won, do not relearn)

Dependencies are installed with `npm install`. `package-lock.json` (npm format)
is the tracked, authoritative lockfile.

Scripts may be invoked with `pnpm run <script>` once `node_modules` exists, but
do NOT run `pnpm install` on a fresh clone — it generates a mismatched
`pnpm-lock.yaml` and an incomplete `node_modules` (missing `@eslint/eslintrc`),
which breaks lint.

Do not regenerate or swap lockfiles casually.
If `pnpm-lock.yaml` ever appears, delete it and reinstall with `npm install`.

---

## 45. DEVELOPMENT PHILOSOPHY

The permanent implementation cycle is:

```text
AUDIT
  ↓
REUSE
  ↓
INTEGRATE
  ↓
REMOVE DUPLICATION
  ↓
VERIFY
```

Not:

```text
PROMPT
  ↓
BUILD NEW SYSTEM
```

The most dangerous AI behavior in CATTIPU is duplication.
Prevent it.

---

## 46. REQUIRED PRE-CODING AUDIT

Before writing code:

### A. Search existing implementation

Search for:

- feature name
- components
- hooks
- reducers
- stores
- types
- schemas
- migrations
- services
- adapters
- tests
- selectors
- CSS
- sprint reports

Useful examples:

```bash
find . -maxdepth 4 -type f | sort

rg "RelevantFeature" .
rg "RelevantComponent" .
rg "RelevantStore" .
```

Use actual repository structure.

### B. Determine ownership

Answer:

```text
Who owns this state?
Who owns rendering?
Who owns persistence?
Who owns side effects?
Who owns migrations?
Who owns provider communication?
Who owns OS interaction?
```

### C. Detect duplicates

If two existing implementations overlap:
do not create a third.
Identify the canonical implementation.

### D. Define the minimum change surface

Identify:

```text
files to read
files to modify
files protected from modification
tests affected
visual surfaces affected
persistent data affected
```

---

## 47. SPRINT SCOPE PROTOCOL

Classify the request:

- behavior-only
- visual-only
- integration
- architecture
- state
- migration
- bug fix
- refactor
- infrastructure
- deployment
- recovery
- documentation

Words like:

```text
ONLY
PRESERVE
LOCKED
EXACTLY
DO NOT TOUCH
STOP AFTER
```

are hard constraints.

Never silently expand the sprint.

If unrelated problems are discovered:
document them.
Do not fix them unless necessary for requested scope.

---

## 48. VISUAL-ONLY VS BEHAVIOR-ONLY RULE

### Behavior sprint

Avoid modifying:

- CSS
- dimensions
- colors
- bevels
- typography
- icon artwork
- spacing
- layout

### Visual sprint

Avoid unnecessarily modifying:

- stores
- persistence
- services
- state architecture
- routing
- domain logic

Always choose the smallest layer that solves the requested problem.

---

## 49. STATE MANAGEMENT CONSTITUTION

Before adding writable state:

1. inspect existing store,
2. inspect selectors,
3. inspect derived values,
4. inspect persistence,
5. inspect schema/version,
6. inspect whether another domain already owns it.

Prefer:

```text
canonical state + derived selectors
```

over:

```text
canonical state + duplicated writable copy
```

Store a value only when it genuinely has independent lifecycle or persistence.

---

## 50. MIGRATION CONSTITUTION

CATTIPU contains persisted state.
Never casually break persisted models.

For persisted schema changes:

- identify current schema version,
- create migration,
- preserve old data,
- make migration deterministic,
- test empty state,
- test previous state,
- test current state,
- handle malformed state where appropriate,
- check hydration.

Never make users lose projects because a TypeScript interface changed.

---

## 51. HYDRATION CONSTITUTION

CATTIPU has historically experienced hydration issues.

Treat these carefully:

- Date
- current time
- locale
- timezone
- random numbers
- random IDs
- viewport dimensions
- `window`
- `document`
- localStorage
- sessionStorage

Do not silence hydration warnings.
Fix deterministic ownership.

---

## 52. INTERACTION LANGUAGE

CATTIPU movement is mechanical.

Use:

- short timing
- deterministic movement
- direct manipulation
- physical transitions

Typical duration:

```text
120–150ms
```

unless existing implementation says otherwise.

Avoid:

- spring physics
- bounce
- overshoot
- elastic easing
- scale-pop effects
- floating UI motion

Dragging should track the pointer directly.

---

## 53. CURRENT KNOWN BACKLOG

Do not assume these are unresolved without auditing current main.

### Cursor

Historical issues include:

- oversized cursor
- hotspot alignment
- cursor transitions
- drag cursor
- resize cursor

### Sound

Historical issues include:

- inconsistent playback
- preloading
- mute wiring

### Toolbox

Historical issues include:

- missing integrations
- incomplete actions
- missing PixelForge coverage

### Desktop Polish

Historical issues include:

- focus restoration
- hover reset
- interaction polish

These are backlog items, not permission to expand unrelated work.

---

## 54. ROADMAP GOVERNANCE

Future milestones are reserved.
Do not implement them merely because they are described below.

The newest explicit user request determines current scope.

---

## 55. M20 — NATIVE FEEL POLISH

Likely scope:

- cursor engine
- sound reliability
- Toolbox completion
- desktop native-feel polish

Audit current main first.

---

## 56. M20.5 — DEVELOPER DIAGNOSTICS

Reserved future milestone.

Potential diagnostics:

- Git status
- active branch
- build status
- tests
- lint
- typecheck
- missing assets
- duplicate components
- broken imports

This should ultimately help developers understand CATTIPU health from inside
the system.

Do not implement unless requested.

---

## 57. M21 — WALLPAPER STUDIO

Potential scope:

- wallpaper gallery
- wallpaper upload
- cursor themes
- personalization

Wallpaper ownership must remain centralized.
Do not allow components to independently own wallpapers.

---

## 58. M22 — NOTIFICATION CENTER

Potential scope:

- notification history
- quick settings
- DND
- system controls

Extend the existing notification system.
Do not create another notification store.

---

## 59. M22.5 — COMMAND CENTER

Reserved future milestone.

The existing Command Palette should evolve into the primary OS launcher.

Potential commands:

- New Project
- Deploy
- Open Architect
- Search Files
- Open Figma
- Generate API
- Run Build
- Open Terminal

The Command Center should reuse the command-palette owner.
Do not create a second launcher architecture.

---

## 60. M23 — AI DOCK

Potential integrations:

- Claude
- ChatGPT
- Gemini
- Ollama
- GitHub
- Vercel
- Terminal

The Dock is a gateway.
It does not own Project Memory.
Provider interactions must use adapters.

---

## 61. M24 — PROJECT MEMORY CORE

One of the most strategically important milestones.

Project Memory may eventually store:

- architecture
- design
- prompts
- APIs
- database decisions
- AI conversations
- tasks
- bugs
- decisions
- build history
- deployment history
- rationale

Every provider should operate against the same memory.

Do not implement prematurely.

---

## 62. M24.5 — EXTENSION SDK

Reserved milestone.

Expected architecture may include:

- extension loader
- permissions
- registration
- lifecycle
- sandbox
- commands
- panels
- filesystem permissions
- AI permissions
- settings

Do not implement until explicitly requested.
But preserve extension compatibility in architectural choices.

---

## 63. M25 — ARCHITECT GRAPH

Potential scope:

- draggable services
- entity relationships
- ER diagrams
- deployment topology
- graph connections
- architecture visualization

Must extend Architect.
Must reuse existing Architect state.

---

## 64. M26 — FORGE

Potential scope:

- file generation
- component generation
- API generation
- tests
- builds
- live build progress

Forge writes into the shared Project filesystem.
Generated files must not exist only inside an AI panel.

---

## 65. M26.5 — AI COLLABORATION HUB

Reserved milestone.

Goal:
allow multiple AI providers to collaborate through shared Project Memory.

Not:

```text
isolated Claude chat
isolated OpenAI chat
isolated Gemini chat
```

Instead:

```text
Claude ─┐
OpenAI ─┼── Project Memory ── Project
Gemini ─┤
Ollama ─┘
```

Do not implement before explicitly requested.

---

## 66. M27 — LIVE PREVIEW

Potential scope:

- browser preview
- runtime console
- build playback
- logs
- runtime state
- preview history

Live represents the running product.

---

## 67. M28 — ONE-CLICK SHIP

Potential scope:

- GitHub
- Vercel
- release state
- deployment
- rollback
- production dashboard

Deployment ownership belongs to Launch.

---

## 68. M29 — MARKETPLACE

Reserved long-term ecosystem milestone.

Potential marketplace categories:

- Templates
- Architect blueprints
- Extensions
- PixelForge icon packs
- Themes
- AI workflows
- Deployment recipes

This is intentionally outside current implementation scope.

---

## 69. ARCHITECTURAL DECISION PRINCIPLES

Every implementation decision should favor:

- stronger ownership
- less duplicated state
- canonical systems
- provider independence
- Project-first architecture
- shared filesystem
- Project Memory compatibility
- extension compatibility
- backward compatibility
- Golden Master preservation

When two implementations are both technically valid, choose the one that
strengthens the long-term operating system architecture.

Do not automatically choose the shortest implementation.

---

## 70. TECHNICAL DEBT RULE

Technical debt discovered INSIDE requested scope may be fixed when necessary.

Technical debt outside requested scope must be documented.

Never use:

while I'm here

as justification for uncontrolled refactoring.

---

## 71. EXTERNAL INTEGRATION PRINCIPLE

External systems should connect through explicit service/adapter boundaries.

Preferred:

```text
UI
 ↓
CATTIPU domain/service
 ↓
adapter
 ↓
GitHub / Vercel / Figma / AI / Database
```

Avoid:

```text
random UI component
 ↓
external SDK
```

unless the existing architecture explicitly owns it there.

---

## 72. FILE GENERATION PRINCIPLE

When Forge or AI creates source code:
the files must enter the canonical filesystem.

Expected:

```text
AI / Forge
    ↓
CATTIPU operation
    ↓
Project
    ↓
shared filesystem
    ↓
Explorer / Desktop / Forge all see same file
```

Never build a disconnected generated-file universe.

---

## 73. COMMAND OWNERSHIP PRINCIPLE

Commands should eventually be routable through one command architecture.

Examples:

```text
Open Architect
Deploy Project
Search Files
Create Project
Generate API
Open Terminal
```

Do not hardcode identical command behavior separately into unrelated UI
surfaces.

M22.5 will evolve this further.

---

## 74. WALLPAPER OWNERSHIP PRINCIPLE

Wallpaper configuration has one owner.

Desktop components may consume the wallpaper.
They should not each independently maintain wallpaper state.

M21 will evolve the system.

---

## 75. TESTING PROTOCOL

At the start of every sprint inspect:

```bash
cat package.json
```

Determine the actual repository commands.

The current scripts are:

```text
npm run dev         → next dev
npm run build       → next build
npm run start       → next start
npm run lint        → eslint
npm run typecheck   → tsc --noEmit
npm run test        → tsx lib/project/__tests__ + lib/os/__tests__ suites
npm run verify      → typecheck && lint && test
```

CURRENT package scripts remain authoritative — re-read them each sprint.

Identify available commands for:

- typecheck
- lint
- unit tests
- integration tests
- build
- regression
- end-to-end tests

Never claim a command passed unless you actually ran it against the current
working tree.

---

## 76. REQUIRED BEGINNING-OF-SPRINT CHECK

Unless the user explicitly requests otherwise:

```bash
git fetch origin
git status -sb

npm install
npm run verify
```

If package scripts differ, use the current repository equivalents.

Record baseline failures before coding.
A pre-existing failure is different from a regression introduced by the sprint.

---

## 77. REGRESSION PROTOCOL

For every sprint determine what existing behavior could regress.

Examples:

### Window changes

- dragging
- focus
- z-index
- minimize
- maximize
- restore
- close
- session persistence

### Filesystem changes

- Explorer
- Desktop
- project file visibility
- persistence
- migrations

### Project changes

- templates
- naming
- progress
- status
- hydration

### Visual changes

- Golden Master geometry
- viewport behavior
- icon size
- typography
- spacing

Verify relevant regressions explicitly.

---

## 78. VISUAL REGRESSION PROTOCOL

For visual work compare relevant viewport(s):

```text
1366×768
1440×900
1600×900
1920×1080
```

Check:

- TopBar
- Sidebar
- status bar
- window placement
- borders
- bevel direction
- spacing
- icon geometry
- typography
- background texture
- title bars
- controls

A passing build does not prove visual fidelity.

---

## 79. PIXELFORGE REVIEW PROTOCOL

For any icon change verify:

```text
[ ] permanent registry ID
[ ] correct department
[ ] correct meaning
[ ] approved silhouette grammar
[ ] 32×32 master
[ ] 16×16 handcrafted version where required
[ ] 2px production outline
[ ] 1px highlight
[ ] 1px shadow
[ ] palette compliant
[ ] integer geometry
[ ] optical centering
[ ] sidebar-family visual weight
[ ] readable without label
[ ] no generic icon library
[ ] no gradients
[ ] no blur
[ ] no raster embedding unless deliberately approved
```

---

## 80. SECURITY PRINCIPLE

Future CATTIPU integrations may become powerful.

Never:

- commit secrets,
- expose provider tokens,
- print sensitive environment values,
- store credentials in Project Memory,
- expose deployment credentials to UI unnecessarily,
- execute arbitrary AI-generated shell commands without the intended
  authorization boundary,
- allow provider output to silently overwrite critical files.

Design powerful operations with explicit permissions.

---

## 81. EXTENSION PERMISSION PRINCIPLE

Future extensions may request capabilities such as:

```text
filesystem read
filesystem write
AI access
network access
commands
panels
settings
deployment access
```

Do not assume extensions automatically receive all capabilities.
M24.5 should eventually formalize this.

---

## 82. PERFORMANCE PRINCIPLE

Retro visual design does not justify slow software.

Avoid:

- unnecessary rerenders,
- oversized global subscriptions,
- per-frame React state when refs are suitable,
- repeatedly scanning full filesystem trees,
- unnecessary serialization,
- unbounded event listeners,
- unnecessary client-only rendering.

But never rewrite unrelated architecture for speculative micro-optimization.

---

## 83. ACCESSIBILITY PRINCIPLE

Accessibility should be improved inside CATTIPU's visual identity.

Preserve:

- keyboard usability
- focus semantics
- labels
- ARIA naming
- usable hit areas
- readable contrast
- sensible reduced-motion handling

Do not replace the retro interface with modern controls merely to solve
accessibility.

---

## 84. ERROR-HANDLING RULE FOR AI ENGINEERS

Never hide uncertainty by inventing implementation details.

If something expected does not exist:
SEARCH.

If it genuinely does not exist:
REPORT IT.

If two implementations exist:
identify which is canonical.

If architecture conflicts with the request:
explain the conflict and use the smallest compatible solution.

Never silently create architecture #3.

---

## 85. ARTIFACT / RELEASE BUNDLE RULE

Never treat an exported ZIP as a complete replacement repository unless it is
explicitly documented as one.

A release artifact may omit:

- package.json
- fonts
- Storybook
- tests
- tools
- build config
- lockfiles

Correct logic:

```text
CURRENT CANONICAL REPOSITORY
            +
FINALIZED APPROVED ARTIFACTS
            =
INTEGRATED REPOSITORY
```

Not:

```text
DELETE REPO
COPY ZIP
```

Empty directories in an artifact package never imply deletion of populated
repository systems.

---

## 86. BOOT + UI MERGE RULE

When merging finalized UI artifacts into a repository containing the approved
boot:
preserve the boot.

Integrate the new shell after boot completion through existing boot ownership.

Conceptually:

```tsx
if (!bootComplete) {
  return <BootScreen />;
}

return <CattipuShell />;
```

Do not introduce a second boot state merely to achieve this shape.
Use the existing architecture.

---

## 87. ANTI-DRIFT AUDIT

Before finishing, answer:

**Architecture** — Did I create a system that already existed?

**Project** — Did I violate Project-first ownership?

**Filesystem** — Did I bypass canonical filesystem state?

**Windows** — Did I implement window behavior outside WindowManager?

**AI** — Did I place provider-specific behavior inside UI?

**Memory** — Did I create long-lived intelligence outside the future Project
Memory owner?

**Deployments** — Did I bypass Launch ownership?

**Commands** — Did I create a parallel command system?

**Icons** — Did I introduce non-PixelForge artwork?

**Design** — Did I modernize the Golden Master?

**Git** — Did I preserve identity and history?

**Scope** — Did I change something the user did not request?

If drift exists, correct it.

---

## 88. DEFINITION OF DONE

Before completing any sprint verify all applicable items:

```text
[ ] requested scope complete

[ ] repository baseline audited
[ ] existing architecture reused
[ ] no duplicate system created
[ ] ownership hierarchy preserved
[ ] Project-first model preserved
[ ] creation pipeline preserved

[ ] Golden Master preserved
[ ] PixelForge preserved
[ ] boot preserved unless explicitly in scope

[ ] canonical project model reused
[ ] canonical filesystem reused
[ ] WindowManager reused
[ ] notification system reused
[ ] command owner reused
[ ] provider adapters preserved

[ ] migration provided if needed
[ ] backward compatibility checked
[ ] hydration checked if applicable

[ ] typecheck passed
[ ] lint passed
[ ] tests passed
[ ] build passed
[ ] regression checks passed

[ ] visual regression checked when applicable
[ ] responsive baseline checked when applicable

[ ] git diff reviewed
[ ] git diff --check passed
[ ] no unexpected files changed
[ ] no secrets introduced

[ ] Git identity correct
[ ] no AI attribution
[ ] exactly one sprint commit
[ ] sprint report generated
[ ] working tree clean after commit
```

If mandatory verification fails:
DO NOT SAY DONE.
Report the actual failure.

---

## 89. MILESTONE REPORT STANDARD

Every major sprint should generate:

```text
MXX_REPORT.md
```

or the report filename specified by the user.

Use:

```markdown
# CATTIPU OS — MXX Report

## Objective

Exact sprint objective.

## Baseline

- repository
- branch
- origin/main relationship
- starting verification status

## Audit Findings

What already existed.

## Canonical Ownership

Which existing systems own the changed functionality.

## Changes

Exact implementation changes.

## Existing Systems Reused

Components, stores, hooks, services, adapters, types, schemas, etc.

## Architecture Impact

How the change preserves Project-first ownership.

## Visual Preservation

Golden Master surfaces deliberately not modified.

## Data / Migration Impact

Schema, persistence, compatibility.

## Verification

Commands and real results:

- typecheck
- lint
- tests
- build
- regression
- responsive/visual checks

## Regressions Checked

Existing behavior specifically verified.

## Known Issues

Problems discovered but outside requested scope.

## Git

- branch
- commit
- author
- email
- working-tree status

## Next Milestone

Roadmap context only.

Do not implement the next milestone automatically.
```

---

## 90. COMMIT PROTOCOL

Before committing:

```bash
git diff --check
git status
git diff

git config user.name
git config user.email
```

Review every changed file.

Then make ONE commit.

Commit messages use Conventional Commits, with the milestone as scope or
prefix where a sprint is milestone-numbered.

Examples:

```text
feat(architect): add editable graph
fix(explorer): restore persistence
docs: update roadmap
style(shell): refine chrome
M20: polish native desktop interactions
```

Never include:

```text
Generated by Claude
Generated by ChatGPT
Co-authored-by Claude
Co-authored-by AI
```

After commit:

```bash
git status
git log -1 --format=fuller
```

Verify:

- correct identity,
- exactly one sprint commit,
- clean working tree.

---

## 91. PUBLIC DEPLOYMENT GATE

Before calling a version deployable:

```text
[ ] correct origin/main
[ ] clean install
[ ] typecheck
[ ] lint
[ ] tests
[ ] production build
[ ] no committed secrets
[ ] boot works
[ ] shell appears after boot
[ ] primary windows work
[ ] drag works
[ ] focus works
[ ] minimize works
[ ] maximize works
[ ] restore works
[ ] close works
[ ] project state loads
[ ] filesystem loads
[ ] persistence works
[ ] Golden Master preserved
[ ] responsive baseline checked
[ ] Vercel configuration valid
[ ] deployment preview manually inspected
```

---

## 92. PERMANENT BACKLOG

Reserved future milestones include:

```text
M20    Native Feel Polish
M20.5  Developer Diagnostics
M21    Wallpaper Studio
M22    Notification Center
M22.5  Command Center
M23    AI Dock
M24    Project Memory Core
M24.5  Extension SDK
M25    Architect Graph
M26    Forge
M26.5  AI Collaboration Hub
M27    Live Preview
M28    One-Click Ship
M29    Marketplace
```

Do not implement future milestones without explicit instruction.

---

## 93. CURRENT HISTORICAL BASELINE

CATTIPU development history includes:

```text
M1–M19
Foundation
Living Desktop
Golden Master identity refactor
Architect modularization
Notifications
PixelForge
Project Foundation
Living Projects
Desktop Evolution
Shared Filesystem
Interactive Shell
Boot Restoration
System Polish
Git Recovery
Canonical Consolidation
Vercel / Production Deployment
```

This history explains why systems exist.
Current `origin/main` determines exactly how they are implemented today.

Note: written milestone reports currently present in the repository cover
M1–M12 (root), M16–M18 (`docs/`), plus sprint and phase reports.
Reports for some intermediate milestones are not in the tree.
Their absence is a documentation gap, not evidence the work did not happen.

---

## 94. PERMANENT "NEVER" LIST

Never:

- redesign CATTIPU into a modern dashboard,
- replace the Golden Master without explicit instruction,
- modernize established spacing,
- introduce generic icon libraries,
- create a second PixelForge system,
- create a second filesystem,
- create a second project store,
- create a second WindowManager,
- create a second notification system,
- create a second boot system,
- create a second wallpaper owner,
- create a second Project Memory owner,
- create a second command architecture,
- put provider-specific business logic in UI,
- make AI providers own project state,
- make deployments bypass Launch,
- let generated files bypass the Project filesystem,
- overwrite current main with an old artifact ZIP,
- rely permanently on historical commit hashes,
- force push without explicit authorization,
- destroy unknown working-tree changes,
- rewrite Git history without recovery protocol,
- change repository identity,
- add AI contributor attribution,
- commit secrets,
- claim tests passed without running them,
- claim completion when build fails,
- implement unrelated technical debt,
- begin the next milestone automatically,
- invent missing architecture before searching for it.

---

## 95. PERMANENT "ALWAYS" LIST

Always:

- begin from current origin/main,
- inspect Git state,
- verify Git identity,
- audit before coding,
- search before creating,
- reuse canonical owners,
- strengthen Project-first architecture,
- preserve the Architect → Canvas → Forge → Launch → Live pipeline,
- preserve Golden Master identity,
- preserve PixelForge,
- preserve original boot unless explicitly in scope,
- use shared filesystem,
- use canonical project state,
- use WindowManager,
- use notification owner,
- use command owner,
- keep AI providers interchangeable,
- keep Project Memory as future intelligence owner,
- preserve backward compatibility where practical,
- run verification,
- inspect the diff,
- create exactly one commit,
- generate the sprint report,
- leave the repository clean,
- stop when scope is complete.

---

## 96. HOW TO HANDLE AMBIGUOUS IMPLEMENTATION DECISIONS

When multiple technically valid choices exist, prefer the one that:

1. preserves the Golden Master,
2. reinforces Project ownership,
3. strengthens the canonical creation pipeline,
4. reuses an existing system,
5. reduces duplicate state,
6. preserves provider independence,
7. keeps Project Memory ownership viable,
8. maintains extension compatibility,
9. preserves backward compatibility,
10. minimizes total architectural complexity.

Do not optimize only for shortest code.
Optimize for long-term operating-system coherence.

---

## 97. ENTRY PROTOCOL FOR EVERY NEW AI

Before doing ANY engineering work:

1. Read this entire document.
2. Read `docs/DESIGN_CONSTITUTION.md` if visual work is relevant.
3. Read `design-system/ICON_REGISTRY_v1.0.md` if icon work is relevant.
4. Fetch origin.
5. Inspect current `origin/main`.
6. Inspect current working tree.
7. Verify Git identity.
8. Inspect package scripts.
9. Run baseline verification.
10. Locate the existing implementation.
11. Determine system ownership.
12. Determine minimum files requiring change.
13. Implement only requested scope.
14. Run verification.
15. Perform regression checks.
16. Review Git diff.
17. Generate sprint report.
18. Commit exactly once.
19. Verify commit identity.
20. Verify clean working tree.
21. Stop.

---

## 98. RESPONSE FORMAT AFTER A SPRINT

Return a concise engineering handoff:

```markdown
## Completed

What the sprint accomplished.

## Reused

Canonical systems reused.

## Changed

Exact files changed.

## Preserved

Golden Master / architecture deliberately untouched.

## Verification

Actual results:
- typecheck
- lint
- tests
- build
- regression

## Git

- branch
- commit
- author
- working tree

## Report

Path to sprint report.

## Known Issues

Only unresolved or out-of-scope discoveries.
```

Do not hide failed checks.

---

## 99. INSTITUTIONAL MEMORY RULE

Important project decisions must live in the repository.
Do not let architecture exist only inside one AI conversation.

Documentation authority:

```text
PROJECT_CONSTITUTION.md
        ↓
docs/DESIGN_CONSTITUTION.md
        ↓
design-system/ICON_REGISTRY_v1.0.md
        ↓
docs/ARCHITECTURE.md + docs/DECISIONS.md
        ↓
milestone reports
        ↓
tests / code
```

Chat transcripts are historical evidence, not the canonical knowledge store.

When a major permanent architectural rule changes, deliberately update the
constitution or corresponding authoritative document.

---

## 100. FINAL OPERATING DIRECTIVE

CATTIPU OS already has an identity.
Protect it.

CATTIPU is not an IDE with AI attached to it.
It is a Project-centered operating system for creating software.

The Project is the primary object.
Files belong to Projects.
Windows belong to the Shell.
AI belongs to Project Memory.
Deployments belong to Launch.

The permanent creation pipeline is:

Architect → Canvas → Forge → Launch → Live

Every future feature should make this model stronger.

The correct question is not:

How would I build this feature from scratch?

The correct questions are:

Which CATTIPU system already owns this responsibility?
How does this feature strengthen the Project?
Where does it belong in Architect → Canvas → Forge → Launch → Live?
What is the smallest implementation that preserves the Golden Master and
strengthens the operating-system architecture?

When uncertain: AUDIT.
When functionality exists: REUSE.
When it is disconnected: INTEGRATE.
When duplicate state exists: CONSOLIDATE.
When an asset is missing: REPORT IT.
When visuals conflict: GOLDEN MASTER WINS.
When provider architecture is ambiguous: KEEP PROVIDERS INTERCHANGEABLE.
When long-lived AI intelligence is involved: PRESERVE PROJECT MEMORY OWNERSHIP.
When deployment is involved: LAUNCH OWNS IT.
When Git is dangerous: FOLLOW THE RECOVERY PROTOCOL.
When verification fails: REPORT FAILURE.
When the requested sprint is complete: COMMIT ONCE. DOCUMENT IT. STOP.

---

## UNIVERSAL NEW-SESSION INSTRUCTION

You are now an engineer working on CATTIPU OS.

Repository:

```text
https://github.com/anirvamn/cattipu-os
```

Before making any change:

1. Read `PROJECT_CONSTITUTION.md` completely.
2. Fetch and inspect current `origin/main`.
3. Verify working-tree safety.
4. Verify Git identity is exactly:
   - `anirvamn`
   - `anirvavjit2023@gmail.com`
5. Run the repository baseline verification (`npm run verify`).
6. Audit existing architecture relevant to the request.
7. Identify canonical ownership.
8. Reuse existing systems.
9. Execute only the sprint explicitly requested.
10. Preserve the Golden Master.
11. Preserve PixelForge.
12. Preserve the original boot system.
13. Preserve Project-first ownership.
14. Preserve the pipeline: `Architect → Canvas → Forge → Launch → Live`
15. Keep AI providers behind CATTIPU service/provider adapters.
16. Do not create duplicate systems.
17. Run all applicable verification.
18. Generate the sprint report.
19. Create exactly one commit with the mandated Git identity.
20. Confirm the working tree is clean.
21. Stop.

Do not redesign CATTIPU.
Do not recreate existing systems.
Do not add AI attribution.
Do not begin future milestones unless explicitly requested.

Current `origin/main` is the implementation baseline.
This constitution is the permanent architectural authority.
