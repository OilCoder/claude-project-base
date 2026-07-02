# Changelog

All notable changes to claude-project-base.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Two-tier anchor: identity vs architecture** (post-mortem of 3 real projects).
  The Charter now separates `## Invariants` (identity, 2–4 max; litmus test: *if it
  names a tool, library, or topology it is NOT an Invariant*) from a new
  `## Architecture decisions` section — the revisable "how", changed with one logged
  decision line, no ceremony. Lesson: enshrining architecture as Invariants turned
  the blueprint into a straitjacket; the identity invariant survived every pivot.
- **`## Pillars` (decision rails)** in Charter → Implementation Plan → `PLAN.md`
  (verbatim propagation, like Non-goals/Invariants): what Claude never decides ·
  what it builds freely · ambiguous/interpretive → record, never guess. The
  formalization of the goal-run pattern that broke petro-agent's "report theater".
- **Goal-run-ready `## Goal`**: outcome-shaped and measurable — a number the product
  can fail — phrased as a verifiable condition liftable verbatim into a `/goal` run.
- **Cycles (§C in `planning-format.md`)** — project life after the floor. `PLAN.md`
  covers the enumerable floor; afterwards each effort opens
  `planning/cycles/NN_<slug>.md` (Origin · Objective tied to the Goal · ready-to-paste
  **Goal-run command** for `/goal` · tasks · **close = measurement against the Goal**)
  indexed from `PLAN.md`. Opened/closed by `/plan-writing`, kept current by
  `/checkpoint`. Fixes both observed failure modes: the ever-growing plan-as-history
  and the abandoned plan with orphan tasks.
- **Proportional ceremony in `/blueprint`**: a bounded project (hypothesis + dataset +
  protocol knowable today) gets a **charter-lite** (`00` + `09`, one session, or
  `--lite`); only open-ended projects run the full 5-step suite.
- **Re-blueprint as a first-class flow (`/blueprint --v2`)**: freeze the current suite
  (`FROZEN vN`), open `blueprint_v2/` with **full approval gates** (gates are what
  erode during improvised pivots), identity check on which Invariants survive,
  reconcile open cycles.
- **Contact checkpoint**: the seeded plan's first real-data phase carries the task
  "review the blueprint — did any Architecture decision die on contact with real
  data?" — the revisit is scheduled work, not a failure.
- **Anti-theater oracle**: `/phase-executor` (and the loop prompt) re-read the plan's
  `## Goal` before closing a phase — "does this artifact serve the Goal, or is it
  conformant emptiness?" — and **verify COMPLETED against disk** (cited files exist,
  the criterion is demonstrated by running it), never against recollection (lesson D8).
- **Per-tick brakes in `promptloop.sh`**: `--max-turns` (env `MAX_TURNS`, default 50)
  and optional `--max-budget-usd` (env `MAX_BUDGET_USD`); sequence gate now also
  requires `## Pillars`. Header documents the loop map: `promptloop.sh` = floor,
  `/goal` (native) = cycle goal-runs, `/loop` (native) = babysitting long runs.
- **ML honesty checklist** in the `ml-research` pack's evaluation protocol:
  class-balanced headline metric · leakage check · **paired control** (a λ=0-style
  run that must reproduce the baseline) — required sections, not rediscoveries.
- **External-data risk classified day zero** (Charter Constraints): each dataset
  tagged public-no-friction / login-gated / to-digitize; no floor phase may depend
  on data not verified in hand.
- **Design docs (`02`–`04`) are hypotheses**: they open with
  `> Hypothesis — revisit after first contact with real data.`
- **`Done when:` hardened to outcome shape**: a quality of the artifact traceable to
  a Success criterion ("zero Not-computed chapters"), never activity ("wire the
  renderer") — activity-shaped criteria are satisfiable by hollow conformance.

- **Autonomous phase-execution loop** (`templates/promptloop.sh` → `.claude/scripts/`) —
  Ralph-style: a shell `while` loop runs a fresh `claude -p` per iteration against
  `planning/PLAN.md`, driving `/phase-executor` in non-interactive **loop mode**, one
  commit per phase. Fresh context each tick (progress on disk, not in conversation).
  Branch-guarded (refuses main/master and a dirty tree); hard stops on all-COMPLETED,
  any BLOCKED task, max-iterations, or no-progress. Uses `--dangerously-skip-permissions`,
  with the branch guard + still-active PreToolUse blocking hooks + commit-per-phase as the
  safety net. `/phase-executor` gained a **Loop mode (non-interactive)** section: it skips
  only the human approval gate and keeps every automated gate (drift check, verification,
  `Done when:`), failing loudly into a BLOCKED stop rather than guessing.
- **Two-loop project lifecycle.** Loop 1 (planning, `/blueprint`) is now an explicit
  **5-step cycle** — Charter → Context & Interfaces → Design → Implementation Plan →
  Validation & Seed — whose step 5 is a coherence gate that **returns** to a weak step
  instead of advancing, and which closes by seeding `PLAN.md`. Loop 2 (`promptloop.sh`) is
  **gated** on Loop 1: it refuses to run until `PLAN.md` is anchored (Non-goals + Invariants
  + a `Done when:`) and any started blueprint is fully approved. **Feedback edge:** a Loop 2
  block caused by an insufficient plan returns to Loop 1 rather than being patched in code.
  The return carries a **Foundation gap report** (where · gap · why it blocks · 2-3 options
  with a recommendation · the decision needed): the agent diagnoses and proposes alternatives,
  the user decides — never auto-applied.
- **`/blueprint` scaffolding loop** — a human-gated "first loop" that generates a project's
  foundation document suite *before* coding, so the project has a stable, drift-proof anchor.
  One document per iteration, each approved before the next; state lives on disk in
  `planning/blueprint/MANIFEST.md` (resumable), not in the conversation.
  - **`blueprinter`** agent (5th agent): drafts one inception document per invocation in
    fresh context, honoring prior docs' Non-goals/Invariants.
  - Suite adapts by **project kind**: core docs (charter, context/interfaces, implementation
    plan) for every kind, plus packs for `ml-research` and `data-pipeline`; `other`/`--core`
    → core only.
  - The implementation-plan document seeds `PLAN.md` via `/plan-writing` (carrying Non-goals
    and Invariants verbatim).
- **Drift-proof `PLAN.md`** — `planning-format.md` now mandates `## Non-goals` and
  `## Invariants`, a per-phase `Done when:` acceptance criterion, and a 4th task state
  **BLOCKED** (`- [!] … (BLOCKED date: reason)`) as a hard stop. `/phase-executor` checks
  Non-goals/Invariants before writing code and emits BLOCKED instead of skipping silently.

### Changed

- **`todo/` → `planning/`** — the folder outgrew its original "to-do list" meaning; it is now
  the project's planning/design/record hub, reorganized into subfolders: `planning/blueprint/`,
  `planning/specs/` (was `todo/spec-*.md`), `planning/bitacora/` (was `todo/bitacora-*.md`),
  plus `PLAN.md`. The 3 hooks' globs and all references were updated.
- **`plan-format.md` → `planning-format.md`** — renamed and unified into the single authority
  for the whole `planning/` hub (blueprint suite catalog + manifest + PLAN.md format),
  replacing what would have been a separate `blueprint-suite.md` rule.

- **Study material layer (`aprendizaje/`)** — a 5th project folder and the Explanation
  layer (per Diátaxis), distinct from `documentation/` (reference). Captures *all* the
  knowledge applied in the project — software *and* domain (petroleum, geology, ML,
  data engineering, math) — as atomic, didactic concept notes.
  - **`learning-style.md`** rule (path-scoped to `aprendizaje/**/*.md`): one note per
    concept; required structure (intuición → LaTeX formalism → Mermaid flow → domain
    context → applied-in-project with `src/` link → self-test → references); Spanish
    prose + English terms; exported to Obsidian to accumulate cross-project.
  - **`/study`** skill: generates/updates atomic study notes, with **web verification
    of bibliographic references** (never fabricates a citation; marks unverifiable
    sources "por confirmar").
  - **`learn:`** 9th commit prefix for `aprendizaje/` changes (mirrors `site:` for `docs/`).
  - `/checkpoint` now captures study material for new concepts at each milestone.
  - `/setup` creates `aprendizaje/` (now 5 folders) and copies the rule + skill.

### Fixed

- **`stop-suggest-checkpoint` infinite loop**: the Stop hook never read its stdin
  and so ignored the `stop_hook_active` flag. While a working tree had uncommitted
  changes, every Stop re-injected the checkpoint suggestion, which continued the
  session, which triggered another Stop — looping indefinitely. The hook now reads
  stdin and exits early when `stop_hook_active` is `true`, per the Claude Code hook
  spec. First real Stop still suggests a checkpoint; continuations no longer loop.
- **Doc drift after the 0.2.0 `site:` prefix and folder split**:
  - `commit-style.md`, `project-guidelines.md`, `CLAUDE-TEMPLATE.md`, `PERSONALIZAR.md`
    still said "7 prefixes" — corrected to 8 (the `site:` prefix is included).
  - `checkpoint/SKILL.md` step 4 wrote code docs to `docs/` (reserved for GitHub Pages);
    now targets `documentation/`, matching `docs-style.md` and `/document`.
  - `PERSONALIZAR.md` stack examples pointed code docs to `docs/`; now `documentation/`.
  - Rules count corrected to 12: `project-guidelines.md` was missing from its own Rules
    index, and `setup/SKILL.md` final-state said "(11 rules)".
- **Removed references to a non-existent bundled skill**: `/consolidate-memory` is not
  shipped by Claude Code. `memory-policy.md`, `project-guidelines.md`, and `PERSONALIZAR.md`
  now describe manual MEMORY.md review via the `/memory` command instead.
- **`doc-enforce` skill path coverage**: added `.m`, `.cpp`, `.c`, `.h` so the skill's
  `paths:` matches the `doc-enforcement.md` rule (relevant for Octave/petrophysics).
- **`bug-fix` test runners**: `allowed-tools` now also permits `cargo test` and
  `go test`, so the skill runs verification without prompting on Go/Rust projects.
- **Agents no longer rely on skill-only shell injection**: `code-reviewer`,
  `security-reviewer`, and `architect` used `` !`cmd` `` blocks to pre-render git
  context, but that injection runs only in skills — in agent files the literal text
  was passed through unexecuted. They now instruct the agent to run the commands via
  its `Bash` tool instead.

## [0.2.0] — 2026-04-29

### Added

- **Bitácora `Errors` section**: explicit slot for what went wrong this session,
  separate from `Learnings` (specific incidents vs. generalized insight). Both
  required to capture the full learning process.
- **`site:` 8th commit prefix**: dedicated to GitHub Pages landing site (`docs/`)
  changes, separate from `docs:` (code documentation in `documentation/`).
  Solves the ambiguity introduced by the `documentation/` vs `docs/` split.
- **Discarded task convention** in plans: tasks that become obsolete are now
  marked `- ~~task~~ (discarded YYYY-MM-DD: reason)` instead of being deleted.
  Preserves the record of what was considered and why it was dropped — part of
  the user's learning history.

### Changed

- `bitacora/SKILL.md`: template now includes `Errors` section with clear
  Errors-vs-Learnings boundary.
- `memory-policy.md`: example bitácora updated to show the `Errors` section
  and how it pairs with `Learnings`.
- `commit-style.md`: 7 prefixes → 8 prefixes (added `site:`). Decision tree
  updated. Examples added for `site:`.
- `checkpoint/SKILL.md`: prefix-selection table updated to include `site:`
  and clarify `docs:` is now strictly for `documentation/`.
- `plan-format.md`: three task states formalized (pending, completed, discarded).
  Discarded form requires a date and a specific reason.
- `plan-writing/SKILL.md`: new "Discarding tasks" procedure section.
- `phase-executor/SKILL.md`: now skips strikethrough tasks during execution.

## [0.1.0] — 2026-04-29

First versioned release. The base now ships as a Claude Code plugin.

### Added

- Plugin manifest `.claude-plugin/plugin.json` for installation via `/plugin install`.
- README.md with quickstart.
- This CHANGELOG.md.
- **`memory-policy.md`** rule differentiating bitácora (human, narrative) from MEMORY.md (Claude, factual).
- **`commit-style.md`** rule with the Conventional Commits 7-prefix subset (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`).
- **`/bug-fix`** skill: TDD workflow (reproduce → failing test → fix → confirm → bitácora). Always commits with `fix:` prefix.
- **Implementer agent**: autonomous code writer with rules preloaded (`code-style`, `verification`, `doc-enforcement`, `file-naming`, `logging-policy`).
- **`pipeline/`** added to path-scoped rules (`doc-enforcement.md`) and to `check-debug-isolation.sh` source folder detection.
- **Hook robustness pass**: 4 hooks now have timeouts (2-10s), error logging to `.claude/hooks.log`, and graceful fallbacks (never block sessions).

### Changed

- **`/setup` simplified**: now asks only 2 questions (project name, stack). Creates only 4 folders (`.claude/`, `todo/`, `documentation/`, `docs/`). Other folders (`src/`, `pipeline/`, etc.) are created organically by the user when needed.
- **Documentation split fixed**: `documentation/` for code docs (target of `/document`), `docs/` reserved exclusively for GitHub Pages. `docs-style.md`, `/document`, and `/doc-enforce` updated accordingly.
- **`/checkpoint`**: now applies the correct commit prefix automatically based on the dominant nature of changes.
- **`code-style.md`**: removed numeric "40 lines" function length limit (delegated to linters via hooks).
- **All skills**: `allowed-tools` reformatted from comma-separated to space-separated per official spec; Bash permissions granularized per skill.
- **`/debug` renamed to `/investigate`** to avoid collision with bundled Claude Code skills.
- **Rule frontmatter**: `description:` field moved to HTML comments (not a documented rules field).
- **Path-scoped rules**: `docs-style.md`, `plan-format.md`, `doc-enforcement.md` now use `paths:` frontmatter to load only when relevant files are open.

### Fixed

- Skills `allowed-tools` format aligned with official spec (space-separated, granular `Bash(cmd *)`).
- Hooks no longer fail silently — failures log to `.claude/hooks.log` with timestamp.

### Architecture: the four layers

This release formalizes the four-layer enforcement model:

| Layer | Role |
|---|---|
| **Rules** | Advisory context loaded into Claude |
| **Skills** | On-demand workflows (may pre-render shell context) |
| **Agents** | Specialized assistants in fresh context |
| **Hooks** | Deterministic actions on tool events |

`delegation.md` codifies the decision criteria for which layer to use.

---

## [0.0.1] — Initial commit

Initial draft of rules and skills as a copy/paste template (pre-plugin).
