# CATTIPU OS — Agent Instructions

Before doing anything:

1. Read `/PROJECT_CONSTITUTION.md` completely. It is the permanent
   architectural and product authority.
2. Treat current `origin/main` as the implementation baseline.
3. Read `docs/DESIGN_CONSTITUTION.md` before visual work.
4. Read `design-system/ICON_REGISTRY_v1.0.md` before icon work.
5. Follow the Git identity, audit-first, verification,
   one-sprint/one-commit, and no-AI-attribution rules.
6. Execute only the explicitly requested sprint.
7. Read `docs/HANDOFF.md` for where the project stands, how CATTIPU is used,
   and the ordered sprint queue (Q → X).

Everything below is a summary. The constitution governs.

## Working Rules

Never:

- Redesign working UI.
- Imitate Windows.
- Create unnecessary stores.
- Introduce modern SaaS styling.

Always:

- Reuse existing components.
- Preserve the tactile CATTIPU identity.
- Touch only the requested files.
- Explain every changed file.
- Stop after the requested sprint.

## Tooling

Dependencies are installed with `npm install` — `package-lock.json` (npm-format) is the
tracked, authoritative lockfile. Scripts (`lint`, `build`, `dev`) may be invoked with `pnpm run
<script>`; pnpm is fine for running scripts once `node_modules` exists, but do not run `pnpm
install` on a fresh clone — it generates a mismatched `pnpm-lock.yaml` and an incomplete
`node_modules` (missing `@eslint/eslintrc`), which breaks `pnpm lint`. Do not regenerate or
swap lockfiles casually; if `pnpm-lock.yaml` ever appears, delete it and reinstall with `npm
install`.

Baseline verification for every sprint: `npm run verify`
(`typecheck` → `lint` → `test`).

## Commit Style

Use Conventional Commits. Exactly one commit per sprint.

Examples:

- `feat(architect): add editable graph`
- `fix(explorer): restore persistence`
- `docs: update roadmap`
- `style(shell): refine chrome`

Author must be `anirvamn <anirvavjit2023@gmail.com>`.
No AI attribution, no `Co-authored-by:` AI trailers.
