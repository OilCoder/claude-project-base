# claude-project-base

Base template of rules and skills for projects using Claude Code.

## How to use

1. Copy `rules/` → `.claude/rules/` and `skills/` → `.claude/skills/` in the new project.
2. Rename this file to `CLAUDE.md` and place it at the root of the new project.
3. Read `PERSONALIZAR.md` for guidance on what to adjust in each file.
4. Customize `project-guidelines.md` with the project's structure and stack.
5. Adjust rules for the project language (Python, JS, Octave, etc.).
6. Remove skills that do not apply.
7. Add project-specific rules/skills as needed.

> **Note**: In this repo, `rules/` and `skills/` are at the root for reference.
> In the target project they should go inside `.claude/`.

## Rules (always active — 8)

| Rule | Purpose |
|---|---|
| `code-style` | Layout, naming, spacing, step/substep with emojis |
| `file-naming` | File naming conventions and execution order |
| `code-change` | Scope, edit safety, multi-file changes |
| `logging-policy` | Print and logging control |
| `doc-enforcement` | Mandatory docstrings and standards |
| `docs-style` | Markdown documentation format |
| `plan-format` | Plan file format and update rules |
| `project-guidelines` | Index, enforcement, and validation modes |

## Skills (on demand — 8)

| Skill | Trigger | Purpose |
|---|---|---|
| `/bitacora` | Post-commit or manual | Log session in `todo/bitacora-YYYY-MM-DD.md` |
| `/test` | Manual | Create tests for a module |
| `/debug` | Manual | Create isolated debug scripts with promotion path |
| `/document` | Manual | Generate docs for a module |
| `/doc-enforce` | Manual | Review and generate docstrings |
| `/plan-writing` | Manual | Write/update plan in `todo/PLAN.md` |
| `/phase-executor` | Manual | Execute a plan phase in order |
| `/setup` | On project init | Bootstrap new project from base |

## Conventions

- Code and comments language: defined per project (English by default)
- Plans and session logs language: Spanish (configurable)
- Working folder: `todo/` for plans and logs
- Testing: `tests/` (may be gitignored)
- Debug: `debug/` (always gitignored)
- Docs: location defined per project (`docs/`, `obsidian-vault/`, etc.)

## Validation modes

- **suggest**: recommendations (prototype)
- **warn**: violations flagged (active development)
- **strict**: strict enforcement (production)

## Policies (optional)

If the project needs immutable principles, place them in `.claude/policies/`.
Generic candidates: `kiss-principle`, `fail-fast`, `no-overengineering`.
