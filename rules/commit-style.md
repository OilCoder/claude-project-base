<!-- description: Conventional commits subset for this project's git history -->

# Commit Style

All commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(subset of 7 prefixes). The convention is **advisory**, not enforced — but skills
that compose commits (`/checkpoint`, `/bug-fix`) apply it automatically.

## Format

```
<type>(<scope>): <subject>

<body: 2-4 lines explaining the why, not the what>
```

- **type**: one of the 7 prefixes below — required.
- **scope**: optional, in parentheses, names the affected module (`loader`, `api`, `pipeline`).
- **subject**: imperative mood, ≤72 chars, no period at end.
- **body**: blank line then 2-4 lines on the **why**. The diff itself shows the what.

## The 7 prefixes

| Prefix | When to use | Maps to |
|---|---|---|
| `feat:` | New functionality (function, module, feature, capability) | `/phase-executor`, implementation tasks |
| `fix:` | Bug fix that corrects incorrect behavior | `/bug-fix` (always) |
| `docs:` | Documentation only (no code change) | `/document`, `/doc-enforce` |
| `refactor:` | Code restructure with no behavior change | `/simplify` (bundled) |
| `test:` | Adding or modifying tests | `/test` |
| `chore:` | Tooling, configs, dependencies, plugin/hooks/settings | `.claude/` changes, gitignore, version bumps |
| `perf:` | Performance improvement (verifiable benchmark) | when applicable |

That's it. No `style:`, no `ci:`, no `build:`. If unsure, default to `chore:`.

## How to choose

Decision tree:

1. Did the change fix incorrect behavior? → `fix:`
2. Did the change add new functionality? → `feat:`
3. Did the change touch only `tests/`? → `test:`
4. Did the change touch only `documentation/` (or `docs/`)? → `docs:`
5. Did the change restructure code without changing behavior? → `refactor:`
6. Did the change measure faster after with a benchmark? → `perf:`
7. Anything else (configs, deps, tooling, .claude/) → `chore:`

When a single commit spans categories, pick the **dominant** one. Or split into
two commits if the categories are independent.

## Subject rules

- Imperative mood: `add anomaly detector`, not `added anomaly detector` or `adds anomaly detector`.
- ≤72 chars including the type prefix.
- No period at the end.
- Lowercase after the prefix (`feat: add detector`, not `feat: Add detector`).

## Body rules

- Skip the body if the subject is self-explanatory (typos, renames, version bumps).
- When present, focus on the **why** and **what changed in design**, not the literal
  diff. The diff already shows the what.
- 2-4 lines is the sweet spot. Longer bodies usually mean the commit should be split.

## Examples for this kind of work

```
feat(pipeline): add isolation forest anomaly detector

Implements unsupervised anomaly detection on LAS curves using
sklearn IsolationForest. Per-depth scores combined with physical
range rules. Closes Phase 2 of PLAN.md.
```

```
fix(loader): handle LAS files with malformed ~Other section

lasio crashed when ~Other appeared before ~Curve. Added section
re-ordering before parse. Regression test in tests/test_loader_malformed.py.
```

```
docs(api): document predict_curves contract

Adds Args/Returns/Raises and a usage example. Source: src/api/predict.py.
```

```
refactor(model): split forward pass into encoder and decoder helpers

No behavior change. Validated with identical outputs on the
fixture set and full test suite.
```

```
test(loader): cover empty LAS file edge case
```

```
chore: bump ruff to 0.5.7 and update pre-commit hook
```

```
perf(pipeline): vectorize anomaly score combination

Replaces per-row Python loop with numpy ufuncs. Benchmark on
Schaben dataset: 4.2s → 0.18s (23x).
```

## What NOT to do

- ❌ No prefix at all
- ❌ Custom prefixes (`bug:`, `update:`, `change:`)
- ❌ Gitmoji (`✨`, `🐛`)
- ❌ Past tense (`fixed`, `added`)
- ❌ Vague subjects (`update code`, `fix stuff`)
- ❌ Period at end of subject
- ❌ All-caps prefix (`FEAT:`, `FIX:`)

## Multi-author footers

Add `Co-Authored-By:` only when explicitly requested or when committing on behalf
of a real collaborator. Do **not** add automatic AI-coauthor footers unless the
project requires them.

## Cross-references

- See `checkpoint/SKILL.md` for automatic prefix application during a checkpoint.
- See `bug-fix/SKILL.md` for the TDD bug-fix workflow that always uses `fix:`.
- See `delegation.md` for which skill produces which prefix.
