# claude-project-base

Base template of rules, skills, agents, and hooks for projects using Claude Code.

<!--
  If the project also uses AGENTS.md (Cursor, Aider, etc.), uncomment the
  next line so both tools share a single source of truth without duplication.
-->
<!-- @AGENTS.md -->

> Keep this file under 200 lines. Per the official Claude Code guidance:
> *"Files over 200 lines consume more context and may reduce adherence."*
> Move detail into `.claude/rules/`, `.claude/skills/`, or hook scripts.

## How to use

The recommended path is via the plugin:

```
/plugin marketplace add OilCoder/claude-project-base
/plugin install claude-project-base
/setup
```

Alternative manual install: copy `rules/`, `skills/`, `agents/`, `hooks/`, and `settings.template.json` into `.claude/` of the new project, then rename this file to `CLAUDE.md` at the project root.

## Initial folder structure (after `/setup`)

`/setup` creates only these 5 folders. Everything else is grown organically as the project demands it.

```
my-project/
├── .claude/             ← rules, skills, agents, hooks
├── planning/            ← planning hub (subfolders grow on demand):
│                          blueprint/ (/blueprint), specs/ (architect),
│                          cycles/ (/plan-writing), bitacora/ (/bitacora), PLAN.md
├── documentation/       ← code docs (target of /document)
├── aprendizaje/         ← study material (target of /study)
├── docs/                ← reserved for GitHub Pages landing site
├── CLAUDE.md
└── .gitignore
```

`src/`, `pipeline/`, `tests/`, `data/`, `models/`, `experiments/` etc. appear when you actually need them. The base supports any of those layouts via path-scoped rules.

## documentation/ vs docs/ — the split

| Folder | Purpose | Audience |
|---|---|---|
| `documentation/` | Code docs (architecture, modules, APIs) | Developers, future maintainers |
| `docs/` | GitHub Pages landing site | External users, recruiters, demo visitors |

These never overlap. `/document` always writes to `documentation/`. GitHub Pages publishes from `docs/`.

## The four layers

| Layer | Where | Behavior |
|---|---|---|
| **Rules** | `.claude/rules/*.md` | Advisory, loaded into context |
| **Skills** | `.claude/skills/*/SKILL.md` | On-demand workflows; may pre-render shell context with `` !`...` `` |
| **Agents** | `.claude/agents/*.md` | Specialized assistants; fresh context |
| **Hooks** | `.claude/settings.json` + `.claude/hooks/*.sh` | Deterministic, fired on tool events |

Rules guide. Skills orchestrate. Agents review or design in isolation. Hooks enforce.

## The project lifecycle: floor by plan, life by cycles

**The anchor** (from `/blueprint`) is two-tiered: a measurable, goal-run-ready **Goal**
+ **Invariants** (identity, 2–4 max — never a tool/library/topology) + **Pillars**
(decision rails) are constitutional; **Architecture decisions** (the "how") are
revisable via one logged line. Ceremony scales with ambition: bounded projects get a
**charter-lite** (2 docs); open ones the full 5-step cycle. Pivots are a supported
flow (`/blueprint --v2`: freeze the suite, re-blueprint with full gates).

### The floor — two sequential loops

| | Loop 1 — Planning | Loop 2 — Code |
|---|---|---|
| **Tool** | `/blueprint` (skill) | `.claude/scripts/promptloop.sh` |
| **Nature** | Interactive — interviews you | Autonomous — headless `claude -p` per phase |
| **Produces** | Blueprint suite → seeded `PLAN.md` (Goal, Non-goals, Invariants, Pillars, Done-when) | Code, one committed phase per iteration |
| **Ends when** | `PLAN.md` anchor is approved | All phases `(COMPLETED)` / BLOCKED / max-iter |

Loop 1 is a 5-step cycle — (1) Charter → (2) Context → (3) Design → (4) Implementation
Plan → (5) Validation & Seed — whose step 5 **returns** to the weak step on a failed
coherence check. `promptloop.sh` **refuses to run** until the anchor exists, judges
every phase against the Goal (anti-theater: no conformant emptiness), verifies
COMPLETED against disk, and brakes per tick (`--max-turns` / `MAX_BUDGET_USD`).
If Loop 2 blocks on a *plan* gap, it returns to Loop 1 with a Foundation gap report —
never improvises in code.

### The life — cycles (after the floor)

Post-floor work runs in **cycles** (`planning/cycles/NN_<slug>.md`, per
`planning-format.md` §C): doubt → **`/investigate` first** (the numbers say if the
problem is real — phantom-cycle guard — and set the **baseline**) → own branch
`cycle/NN-<slug>` → Objective moves the baseline X→Y → execute → **close with a
measurement and merge (or explicit discard)**. A cycle opens with a number and
closes with a number. Each cycle carries a ready-to-paste **Goal-run command** for
`/goal` (objective + Pillars + stop condition). `/plan-writing` opens/closes them;
`/checkpoint` keeps them current and resolves the branch.

### Which loop when

| Moment | Tool |
|---|---|
| Floor phases, unattended | `promptloop.sh` — fresh context per phase, hard gates |
| Cycles / goal-runs | `/goal` (native) — measurable objective, stops on condition |
| Babysitting long runs (training, batches) | `/loop` (native) on an interval |

## Context discipline (long sessions)

- **One task = one session** — `/checkpoint` is the border; the bitácora is the handoff.
- Statusline `ctx %` past ~60% = dumb zone: close the phase with `/compact <focus>`
  or a fresh session. Never let auto-compaction decide what to remember.
- **When compacting, always preserve**: modified-files list, verification commands,
  decisions + their why, Non-goals/Invariants/Pillars, open BLOCKED items.
- Two corrections on the same thing → context is poisoned: `/clear` + better prompt.

## Rules (13)

| Rule | Scope | Purpose |
|---|---|---|
| `code-style` | Always | Layout, naming, spacing, step/substep markers |
| `file-naming` | Always | File naming conventions |
| `code-change` | Always | Scope, edit safety, multi-file changes |
| `logging-policy` | Always | Print and logging control |
| `verification` | Always | Verification gate before declaring tasks complete |
| `delegation` | Always | Decide between main session, subagent, or agent team |
| `memory-policy` | Always | Differentiate bitácora (human) from MEMORY.md (Claude) |
| `commit-style` | Always | Conventional Commits subset (9 prefixes) |
| `project-guidelines` | Always | Index, enforcement, validation modes |
| `doc-enforcement` | Source files (`paths:`) | Mandatory docstrings |
| `docs-style` | Markdown (`paths:`) | Documentation format; `documentation/` vs `docs/` |
| `learning-style` | `aprendizaje/` (`paths:`) | Study material standard (Explanation layer) |
| `planning-format` | `planning/**/*.md` (`paths:`) | `planning/` authority: blueprint suite (identity vs architecture, Pillars) + PLAN.md floor + cycles |

## Skills (11)

| Skill | Trigger | Purpose |
|---|---|---|
| `/blueprint` | Project start | Scaffolding loop: foundation doc suite in `planning/blueprint/`, gated per document |
| `/checkpoint` | At milestones | Plan + docs + study + bitácora + commit + (push/PR) |
| `/bug-fix` | Bug fix | TDD: reproduce → failing test → fix → confirm |
| `/bitacora` | Post-commit / manual | Session log in `planning/bitacora/YYYY-MM-DD.md` |
| `/plan-writing` | Manual | Write/update `planning/PLAN.md` |
| `/phase-executor` | Manual | Execute a plan phase with verification gate |
| `/test` | Manual / auto on tests/ | Create tests for a module |
| `/investigate` | Manual | Create isolated debug script in `debug/` |
| `/document` | Manual | Generate docs in `documentation/` (forked context) |
| `/doc-enforce` | Auto on source files | Review/generate docstrings (forked context) |
| `/study` | Manual / auto on checkpoint | Capture knowledge as study notes in `aprendizaje/` (forked context) |

(`/setup` lives only in the base — not copied to projects.)

## Agents (5)

| Agent | Purpose |
|---|---|
| `code-reviewer` | Reviews uncommitted diff in fresh context |
| `security-reviewer` | OWASP-style vulnerability audit |
| `architect` | Interview-driven feature design → spec file |
| `blueprinter` | Drafts one project-inception foundation doc → `planning/blueprint/` (driven by `/blueprint`) |
| `implementer` | Autonomous code writer with rules preloaded |

## Hooks and settings

| Hook | Event | Effect |
|---|---|---|
| `statusline` | StatusLine | Branch + dirty flag + active phase + bitácora flag |
| `session-start-context` | SessionStart | Inject PLAN active phase, bitácora pending, verification cmds |
| `stop-suggest-checkpoint` | Stop | Suggest `/checkpoint` when work is unrecorded |
| Block `rm -rf` | PreToolUse / Bash | Exit 2 |
| Block force-push | PreToolUse / Bash | Exit 2 |
| Block `git reset --hard` | PreToolUse / Bash | Exit 2 |
| Block `--no-verify` | PreToolUse / Bash | Exit 2 |
| `check-debug-isolation` | PostToolUse / Edit\|Write | Warns when src/lib/app/pipeline imports from debug/ |
| Linter/formatter | PostToolUse / Edit\|Write | Stack-specific (added by `/setup`) |

`settings.template.json` ships `permissions.allow` with safe read-only commands. `/setup` extends it per stack.

## Conventions

- Code and comments language: configurable per project (English by default)
- Bitácora language: Spanish (configurable)
- `planning/` — plans and bitácora
- `documentation/` — code docs (always)
- `aprendizaje/` — study material, exported to Obsidian (always)
- `docs/` — GitHub Pages (always reserved)
- `tests/` — tests (created when needed)
- `debug/` — debug scripts, gitignored (created when needed)

## Validation modes

`suggest` (prototype) · `warn` (active development) · `strict` (production)

## Policies (optional)

Immutable principles live in `.claude/policies/` — e.g. `kiss-principle`, `fail-fast`.
