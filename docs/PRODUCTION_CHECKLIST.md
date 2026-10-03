# Production Checklist

Run before any release. Every line is a command whose output decides the
box, not a judgement call.

---

## 1. Clean tree

```bash
git status --short          # empty
git shortlog -sne           # owner: anirvamn (earlier: anirva09) <anirvavjit2023@gmail.com>; contributors via merged pull requests only
```

Commits carry no `Co-authored-by` and no AI attribution. `git log -1
--format='%an <%ae> / %cn <%ce>'` must show your identity twice.

## 2. Install and static checks

```bash
npm install                 # npm, never pnpm — see CLAUDE.md
npm run typecheck           # 0 errors
npm run lint                # 0 errors, 0 warnings
npm test                    # 6 suites, 136 assertions
npm run build               # clean
```

A warning is not "passing". The build carried one unused parameter for two
milestones before anyone removed it.

## 3. Behavioural harnesses

```bash
npm run build && npm start -- -p 3321      # one shell
python3 scripts/production-verify.py       # another — 38 checks
```

Then the per-feature harnesses, all of which must stay green:

```bash
for h in m16 m17 m18 m19 m19b boot; do python3 scripts/$h-verify.py; done
```

| Harness | Expected |
|---|---|
| `m16` Living Desktop | 27/27 |
| `m17` File Explorer | 42/42 |
| `m18` Window manager | 40/40 |
| `m19` Templates, clock, responsive, contrast | 31/31 |
| `m19b` Titles, identity, propagation | 18/18 |
| `boot` Boot sequence | 17/17 |
| `production` Release verification | 38/38 |

## 4. Golden Master

Compare the build you are shipping against the build before your change,
**in the same state**, not against the RC2 reference.

```bash
git stash push -u && npm run build && npm start -- -p 3321
# capture before.png at 1600×900, default state, ~4.5s after load
git stash pop && npm run build && npm start -- -p 3321
# capture after.png the same way, then diff
```

Anything beyond the live clock's digits needs an explanation in the
release report. Diffing against RC2 instead mixes intended changes with
regressions and cannot separate them — and a capture taken with a window
open compares nothing useful at all.

## 5. Anti-vacuity

For every assertion added since the last release, **break the thing it
watches and confirm it fails.** A check that cannot fail is not evidence.

Aim the mutation at the exact function under test. A mutation that lands
on a different function reports a pass and proves the same nothing a
vacuous assertion does — harder to spot, because the number looks better
rather than worse.

## 6. Dead weight

Three scans, each of which caught something a directory listing hid.

```bash
# Zero-byte tracked files. Seven "brand plates" were empty for four
# milestones and were described from their filenames the whole time.
git ls-files | while read -r f; do [ -f "$f" ] && [ ! -s "$f" ] && echo "$f"; done

# Duplicate binaries. Content, not names — two identical assets under
# different names look like two assets in every listing.
git ls-files '*.png' '*.svg' '*.wav' '*.gif' |
  while read -r f; do printf "%s  %s\n" "$(sha1sum "$f" | cut -c1-16)" "$f"; done |
  sort | uniq -w16 -D

# Every dependency, against real usage.
node -e "const p=require('./package.json');
  Object.keys(p.dependencies).forEach(d=>console.log(d))" |
  while read -r d; do
    n=$(grep -rl "$d" app components lib hooks design-system store scripts 2>/dev/null | wc -l)
    [ "$n" = "0" ] && echo "unused: $d"
  done
```

A file you moved is not a file you audited. `git mv` preserves contents
you have never looked at.

## 7. Structural debt

```bash
python3 - <<'EOF'   # the reachability script in REPOSITORY_AUDIT.md
EOF
```

Read the unreachable list. Tests are entry points and always appear;
anything else is either newly dead or newly unmounted, and the difference
matters — unmounted work should be finished, dead work should be deleted.

Then ask the two questions the OS layer exists to answer:

- **Is anything stored that could be derived?** Progress, status, build
  state and names have no setters for a reason.
- **Does any fact have two homes?** `useFilesystemStore.wallpaper` had two
  authors and zero readers for four milestones.

## 8. Deploy

```bash
git push origin <branch>          # or open a PR into main
vercel --prod
```

Then verify against the deployed URL rather than assuming it matches
localhost. `production-verify.py` takes a `URL` at the top of the file —
point it at production and run the same 38 checks.

On the live site, by eye: boot runs and hands off, the desktop paints on
engineering paper, all nine rail items open, the tab reads `CATTIPU OS`.

---

## Release gate

Ship only when every one of these is true:

- [ ] typecheck, lint, tests and build clean — no warnings
- [ ] 213 behavioural checks green
- [ ] no zero-byte or duplicate tracked files
- [ ] Golden Master delta explained pixel by pixel
- [ ] every new assertion mutation-tested
- [ ] no unexplained unreachable modules
- [ ] docs updated: README, CHANGELOG, ROADMAP, ARCHITECTURE
- [ ] `git shortlog -sne` shows one identity
- [ ] production URL verified, not assumed
