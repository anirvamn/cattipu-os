# Contributing to CATTIPU OS

Thanks for being here. CATTIPU's agenda is simple: **anyone should be able
to turn an idea into a working app on their own computer, without feeling
overwhelmed.** Contributing should feel the same way, so this page is all
you need to read before your first pull request.

## Your first contribution in four steps

**1. Set it up** (Node 20 or newer):

```bash
git clone https://github.com/<you>/cattipu-os.git
cd cattipu-os
npm install
npm run dev
```

Open <http://localhost:3000>. You don't need an AI model for most changes.
Use `npm`, not `pnpm`: `package-lock.json` is the lockfile.

**2. Pick something.** Issues labelled
[`good first issue`](https://github.com/anirvamn/cattipu-os/labels/good%20first%20issue)
are small and each one says where to look and when it's done. Comment on
the issue so nobody else starts the same thing.

**3. Make the change and check it:**

```bash
npm run verify       # typecheck, lint and all tests; it must pass
```

Add or update a test in `tests/` when you change behaviour. For anything
visible, take a before and after screenshot.

**4. Open a pull request** against `main` and fill in the short template.
A draft pull request is welcome if you're stuck; ask in it.

## The five rules

CATTIPU has a deliberate look and architecture. A pull request that breaks
one of these can't be merged, however good the code is. Everything else is
open to discussion.

1. **Keep the look.** No modern SaaS styling (gradients, glass, pill
   buttons, rounded cards beyond 2px), no colours outside
   `design-system/tokens.ts`, no icon libraries. Icons are PixelForge.
2. **One owner per thing.** One window manager, one filesystem, one project
   store, one notification system, one menu. Extend the existing one rather
   than adding a second.
3. **No AI provider code in React.** Providers live behind
   `lib/adapters/ai`; the UI talks to services.
4. **No arbitrary execution.** Forge and Launch run fixed programs with
   fixed arguments. Nothing runs commands from a request, a project file or
   the AI.
5. **No secrets** in code, tests, screenshots or docs. Never commit
   `.env.local`.

If you're unsure whether something fits, ask in the issue before writing
code. That's what issues are for.

## Which documents do I need?

Usually none beyond this page. When your change needs more,
[`docs/README.md`](docs/README.md) tells you exactly which one to read, for
example the design constitution for visual work. You do **not** need to read
`PROJECT_CONSTITUTION.md`, `CLAUDE.md` or `docs/HANDOFF.md`; those are for
the maintainer and AI sessions, and their commit and identity rules don't
apply to you.

## Commits

- Commit under your own name and email.
- Use [Conventional Commits](https://www.conventionalcommits.org/) where you
  can: `fix(launch): …`, `feat(explorer): …`, `docs: …`.
- Several commits in one pull request are fine.

## Ways to help without writing code

- **Try CATTIPU and tell us where it felt confusing.** Making it easy for
  beginners is the whole point, so "I didn't know what to click" is a
  useful bug report.
- **Report how the local AI ran on your machine**: your RAM, GPU, the model
  and how long answers took. This shapes which models CATTIPU picks
  automatically.
- Improve the docs, or check that the setup steps work on your system.

Use the issue templates for bugs and ideas.

## Bigger work

The roadmap ([`docs/ROADMAP.md`](docs/ROADMAP.md)) is a sequence of sprints.
The larger ones are open as
[`help wanted`](https://github.com/anirvamn/cattipu-os/labels/help%20wanted)
issues. Please comment and agree the approach first, because they touch
several parts of the system.

## Questions and contact

Open an issue, or reach out to the maintainer,
[@anirvamn](https://github.com/anirvamn), directly (LinkedIn messages are
welcome too). Security problems go privately; see [`SECURITY.md`](SECURITY.md).

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE), and that you'll follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
