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
│                          bitacora/ (/bitacora), PLAN.md
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

## The two loops (project lifecycle)

A project runs as two sequential loops. The second cannot start until the first finishes.

| | Loop 1 — Planning | Loop 2 — Code |
|---|---|---|
| **Tool** | `/blueprint` (skill) | `.claude/scripts/promptloop.sh` |
| **Nature** | Interactive — interviews you | Autonomous — headless `claude -p` per phase |
| **Produces** | Blueprint suite → seeded `PLAN.md` (Non-goals, Invariants, Done-when) | Code, one committed phase per iteration |
| **Why this shape** | A PRD/charter comes from *your* answers — it can't be headless | The work is already defined in `PLAN.md` — it runs unattended |
| **Ends when** | `PLAN.md` anchor is approved | All phases `(COMPLETED)` / BLOCKED / max-iter |

Loop 1 is the anchor builder; Loop 2 executes against that anchor. `promptloop.sh`
**refuses to run** until Loop 1 has produced an anchored `PLAN.md` (and any started
blueprint is fully approved) — so code never gets written before the foundation exists.

**Loop 1 is a 5-step cycle, not a line:** (1) Charter → (2) Context & Interfaces →
(3) Design → (4) Implementation Plan → (5) Validation & Seed. Step 5 is a coherence gate; a
weak foundation **returns** to the failing step instead of advancing.

**Feedback edge:** if Loop 2 blocks because the *plan* is insufficient (not just a code
bug), it doesn't patch around it — it returns to Loop 1 to strengthen the anchor, then
resumes. Drift is prevented by going back to planning, never by improvising in code.

```
1 → 2 → 3 → 4 → 5 ──(anchor ok)──▶ Loop 2: code  ──phase ok──▶ next phase
        ▲           ▲                   │
        └──(gap)────┘                   └──(BLOCKED: plan gap)──▶ back to Loop 1
```

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
| `planning-format` | `planning/**/*.md` (`paths:`) | `planning/` authority: blueprint suite + PLAN.md format (Non-goals/Invariants/Done-when/BLOCKED) |

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

- **suggest**: recommendations (prototype)
- **warn**: violations flagged (active development)
- **strict**: strict enforcement (production)

## Policies (optional)

If the project needs immutable principles, place them in `.claude/policies/`.
Candidates: `kiss-principle`, `fail-fast`, `no-overengineering`.
