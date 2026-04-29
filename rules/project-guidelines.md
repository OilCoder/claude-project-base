<!-- description: Project-level index of rules, skills, and enforcement strategy -->

# Project Guidelines

This file is the entry point for understanding the project's conventions.

## Four-layer enforcement model

The base operates on four complementary layers:

| Layer | Mechanism | What it does | Example |
|---|---|---|---|
| **Rules** (`.claude/rules/*.md`) | Advisory context loaded into Claude | Guides decisions during code generation | `code-style.md` tells Claude to use Step/Substep comments |
| **Skills** (`.claude/skills/*/SKILL.md`) | On-demand workflows invoked by Claude or user | Executes multi-step procedures consistently | `/checkpoint` runs plan + docs + bitácora + commit |
| **Agents** (`.claude/agents/*.md`) | Specialized assistants in fresh context | Reviews/designs without polluting main context | `code-reviewer` audits a diff before commit |
| **Hooks** (`.claude/settings.json`) | Deterministic shell commands fired on events | Guarantees actions regardless of Claude's state | `ruff check --fix` after every Edit/Write |

Rules guide. Skills orchestrate. Agents review or design in isolation. Hooks enforce.
A behavior critical for production correctness should land in the hardest layer that can express it.

## Rules index

| Rule | Scope | Purpose |
|---|---|---|
| `code-style.md` | Always loaded | Layout, naming, spacing, step/substep structure |
| `file-naming.md` | Always loaded | File naming conventions and execution order |
| `code-change.md` | Always loaded | Scope and safety of edits |
| `logging-policy.md` | Always loaded | Print and logging control |
| `verification.md` | Always loaded | Verification gate before declaring tasks complete |
| `doc-enforcement.md` | Source files (`paths:`) | Docstring requirements and standards |
| `docs-style.md` | Markdown files (`paths:`) | Markdown documentation format |
| `plan-format.md` | `todo/**/*.md` (`paths:`) | Plan file format and update rules |

## Skills index

| Skill | Purpose |
|---|---|
| `/checkpoint` | Combined milestone workflow: plan + docs + bitácora + commit + (push/PR) |
| `/bitacora` | Register work session in `todo/bitacora-YYYY-MM-DD.md` |
| `/plan-writing` | Write and update project plans in `todo/` |
| `/phase-executor` | Read and execute a phase from `PLAN.md` in order, with verification gate |
| `/test` | Create test scripts for modules |
| `/investigate` | Create isolated debug scripts for investigation |
| `/document` | Generate documentation for a module (forked context) |
| `/doc-enforce` | Review and enforce docstrings on existing code (forked context) |
| `/setup` | Bootstrap a new project from the base template (base only) |

## Agents index

| Agent | Purpose |
|---|---|
| `code-reviewer` | Pre-commit review in fresh context — finds what the author missed |
| `security-reviewer` | OWASP-style vulnerability audit on uncommitted or recent changes |
| `architect` | Interview-driven spec writing for non-trivial features → `todo/spec-*.md` |
| `implementer` | Autonomous code writer for self-contained tasks; preloads code-style, verification, doc-enforcement rules |

## Hooks index

The base ships with these hooks in `settings.template.json`. `/setup` copies and customizes them.

| Hook | Event | Purpose |
|---|---|---|
| `statusline` | `StatusLine` | Show branch, dirty state, active phase, bitácora flag |
| `session-start-context` | `SessionStart` | Inject PLAN.md active phase, pending bitácora items, verification commands |
| `stop-suggest-checkpoint` | `Stop` | Suggest `/checkpoint` when work is unrecorded |
| Block `rm -rf` | `PreToolUse` / Bash | Prevent destructive deletes without explicit approval |
| Block force-push | `PreToolUse` / Bash | Prevent `git push --force` and `-f` |
| Block `git reset --hard` | `PreToolUse` / Bash | Prevent discarding uncommitted work |
| Block `--no-verify` | `PreToolUse` / Bash | Prevent skipping pre-commit hooks |
| `check-debug-isolation` | `PostToolUse` / Edit\|Write | Warn if `src/` imports from `debug/` |
| Linter/formatter (stack-specific) | `PostToolUse` / Edit\|Write | Auto-fix style on every save |

## Permissions allowlist

`settings.template.json` includes a `permissions.allow` list with safe read-only
commands pre-approved (git status/log/diff/show/branch, ls, cat, head, tail, wc, pwd,
date, echo, which, printf, mkdir -p). `/setup` adds stack-specific commands
(pytest, ruff, npm test, etc.) so Claude doesn't prompt for approval during routine work.

## Enforcement strategy

- Rules apply automatically to all code generated in this project.
- Skills are invoked on demand by the user or triggered by Claude when relevant.
- Hooks fire deterministically on tool events.
- When in doubt about a convention, check the specific rule file.

## Validation modes

| Mode | Description | Phase |
|---|---|---|
| `suggest` | Recommendations and warnings | Prototype / exploration |
| `warn` | Clear violations flagged but not blocking | Active development |
| `strict` | Enforcement with failures | Production / final |

Default mode: `warn`. Override per project in this section.

## Progressive enforcement

- **Prototype phase**: `suggest` mode. Focus on speed, rules are advisory.
- **Development phase**: `warn` mode. Rules enforced, violations flagged.
- **Production phase**: `strict` mode. All rules enforced, no exceptions.

## Project structure

Defined per project. Replace this section with the actual folder tree:

```
src/          → Source code
tests/        → Test scripts (may be gitignored)
debug/        → Debug scripts (always gitignored)
todo/         → Plans and session logs
docs/         → Technical documentation
data/         → Input data
outputs/      → Generated outputs (may be gitignored)
```

## Tech constraints

Defined per project. Replace this section with actual constraints
(runtime environment, hardware, external services, frameworks).

## Verification commands

Required by `verification.md`. Replace with the actual commands for this project:

```text
test:        <e.g., pytest -q | npm test | cargo test>
type-check:  <e.g., mypy src/ | tsc --noEmit>
lint:        <e.g., ruff check | npx eslint .>
format:      <e.g., ruff format | npx prettier --check .>
```

## Policies

If the project uses immutable principles (e.g., KISS, fail-fast, no-overengineering),
place them in `.claude/policies/` as separate files.

- Policies provide philosophical guidance; rules provide verifiable conventions.
- Policies are optional — not every project needs them.
