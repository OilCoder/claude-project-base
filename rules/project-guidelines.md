---
description: Project-level index of rules, skills, and enforcement strategy
---

# Project Guidelines

This file is the entry point for understanding the project's conventions.

## Rules index

| Rule | Purpose |
|---|---|
| `code-style.md` | Layout, naming, spacing, step/substep structure |
| `file-naming.md` | File naming conventions and execution order |
| `code-change.md` | Scope and safety of edits |
| `logging-policy.md` | Print and logging control |
| `doc-enforcement.md` | Docstring requirements and standards |
| `docs-style.md` | Markdown documentation format |
| `plan-format.md` | Plan file format and update rules |

## Skills index

| Skill | Purpose |
|---|---|
| `/bitacora` | Register work session in `todo/bitacora-YYYY-MM-DD.md` |
| `/test` | Create test scripts for modules |
| `/debug` | Create isolated debug scripts for investigation |
| `/document` | Generate documentation for a module |
| `/doc-enforce` | Review and enforce docstrings on existing code |
| `/plan-writing` | Write and update project plans in `todo/` |
| `/phase-executor` | Read and execute a phase from `PLAN.md` in order |
| `/setup` | Bootstrap a new project from the base template |

## Enforcement strategy

- Rules apply automatically to all code generated in this project.
- Skills are invoked on demand by the user or triggered by Claude when relevant.
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

## Policies

If the project uses immutable principles (e.g., KISS, fail-fast, no-overengineering),
place them in `.claude/policies/` as separate files.

- Policies provide philosophical guidance; rules provide verifiable conventions.
- Policies are optional — not every project needs them.
