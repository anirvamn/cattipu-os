# Contributing to CATTIPU OS

Thanks for your interest. CATTIPU OS is an MVP-stage, local-first operating
environment for building software, and contributions of every size are
welcome: bug fixes, tests, docs, features, and design work that respects the
visual identity.

## Start here

1. **[`README.md`](README.md)**: what CATTIPU is and how to run it.
2. **[`docs/HANDOFF.md`](docs/HANDOFF.md)**: where the project stands, how
   each part works, and the ordered roadmap (sprints Q → X).
3. **[`PROJECT_CONSTITUTION.md`](PROJECT_CONSTITUTION.md)**: the
   architecture rules. Long, but it explains *why* the code is shaped the way
   it is.
4. **[`docs/DESIGN_CONSTITUTION.md`](docs/DESIGN_CONSTITUTION.md)**: read
   this before any visual change.

Looking for something to pick up? Issues labelled
[`good first issue`](https://github.com/anirvamn/cattipu-os/labels/good%20first%20issue)
are small and self-contained, and
[`help wanted`](https://github.com/anirvamn/cattipu-os/labels/help%20wanted)
marks larger roadmap work.

## Setup

Requires Node 20 or newer.

```bash
git clone https://github.com/<you>/cattipu-os.git
cd cattipu-os
npm install          # use npm, not pnpm: package-lock.json is authoritative
npm run dev          # http://localhost:3000
```

The AI Console works with a local [Ollama](https://ollama.com) model
(`ollama pull qwen2.5-coder:1.5b`) or with Claude (`AI_PROVIDER=claude`,
`ANTHROPIC_API_KEY` in `.env.local`). Neither is needed for most work.
Never commit `.env.local`.

## Making a change

1. **Open an issue first** for anything non-trivial, so we can agree on the
   approach before you write code.
2. Fork, then branch off `main`: `git checkout -b fix/short-description`.
3. Keep the change focused: one logical change per pull request.
4. Add or update tests in `tests/` for behaviour you change.
5. Run the full check. It must pass:

   ```bash
   npm run verify       # typecheck, lint, all test suites
   ```

6. For UI changes, include before/after screenshots in the pull request.
7. Use [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(forge): …`, `fix(explorer): …`, `docs: …`. Commit under **your own**
   name and email.
8. Open the pull request against `main` and fill in the template.

## What keeps a pull request mergeable

CATTIPU has a deliberate design and architecture. These won't be merged,
however good the code:

- **Visual redesigns.** No modern SaaS styling, glassmorphism, gradients,
  pill buttons or rounded cards (2px maximum radius), new colours outside
  `design-system/tokens.ts`, or icon libraries. Icons are PixelForge
  (`design-system/ICON_REGISTRY_v1.0.md`).
- **Second owners.** One window manager, one filesystem, one project store,
  one notification system, one menu component. Extend the existing owner
  rather than adding a parallel one.
- **Provider logic in the UI.** AI providers live behind
  `lib/adapters/ai`; React talks to services, never to a provider.
- **Arbitrary execution.** Forge and Launch run fixed executables with fixed
  arguments. No shell strings, and nothing that runs commands from a
  request, a project file or the AI.
- **Secrets** in code, tests, screenshots or docs.

If you're unsure, ask in the issue. That's what it's for.

## Questions and contact

Open an issue, or reach out to the maintainer,
[@anirvamn](https://github.com/anirvamn), directly (LinkedIn messages are
welcome too).

By contributing you agree that your contributions are licensed under the
project's [MIT License](LICENSE), and that you'll follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
