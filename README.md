# claude-project-base

A generic Claude Code plugin: rules, skills, agents, and hooks that codify how to write code well, regardless of project type.

Designed for Python / ML / research / LLM-app projects but works for any stack.

## Install

```bash
# In any Claude Code session
/plugin marketplace add OilCoder/claude-project-base
/plugin install claude-project-base
```

Then bootstrap a new project:

```bash
/setup
```

`/setup` asks 2 questions (project name, stack), creates 5 folders (`.claude/`, `todo/`, `documentation/`, `aprendizaje/`, `docs/`), copies all the rules/skills/agents/hooks, and customizes the linter hook + permissions for your stack.

Updates:

```bash
/plugin update claude-project-base
```

## What you get

### 13 rules
9 always loaded (code style, code change, file naming, logging, verification, delegation, memory policy, commit style, project guidelines) + 4 path-scoped (doc enforcement, docs style, learning style, plan format).

### 10 skills
- `/checkpoint` — plan + docs + study + bitácora + commit + (push/PR) in one
- `/bug-fix` — TDD bug fix workflow
- `/bitacora` — session log
- `/plan-writing` — write/update PLAN.md
- `/phase-executor` — execute a plan phase with verification gate
- `/study` — capture project knowledge as didactic study notes in `aprendizaje/`
- `/test`, `/investigate`, `/document`, `/doc-enforce`

### 4 agents
- `code-reviewer` — fresh-context diff review
- `security-reviewer` — OWASP-style audit
- `architect` — interview-driven feature design
- `implementer` — autonomous code writer with rules preloaded

### 5 hooks
- Statusline (branch + active phase + bitácora flag)
- SessionStart (inject PLAN active phase, pending bitácora, verification commands)
- Stop (suggest `/checkpoint` when work is unrecorded)
- PreToolUse blockers (`rm -rf`, force-push, `--no-verify`, `git reset --hard`)
- PostToolUse `check-debug-isolation` + stack-specific linter

### Permissions allowlist
Pre-approved safe read-only commands so Claude doesn't prompt on every git/ls/cat.

## Philosophy

**Four layers:** Rules guide. Skills orchestrate. Agents review or design in isolation. Hooks enforce. Pick the hardest layer that can express the behavior.

**Folder minimum:** Only 5 folders are created at bootstrap. Everything else (`src/`, `pipeline/`, `tests/`, `data/`, etc.) is created when the project demands it.

**`documentation/` vs `docs/`:** Code docs go to `documentation/`. `docs/` is reserved for GitHub Pages.

**`aprendizaje/` (study material):** A distinct layer from `documentation/`. Code docs are *reference* (what the code does); study notes are *explanation* (the concepts and domain knowledge behind it — petroleum, geology, ML, data-eng), written as didactic material with formulas, flowcharts, and verified references, exported to Obsidian to accumulate across projects.

**Verification first:** Per official Claude Code guidance, no task is complete until verification (tests + lint + type-check) passes.

## Documentation

- [`PERSONALIZAR.md`](PERSONALIZAR.md) — full customization guide per rule and skill
- [`CHANGELOG.md`](CHANGELOG.md) — version history
- [`CLAUDE-TEMPLATE.md`](CLAUDE-TEMPLATE.md) — template that becomes `CLAUDE.md` in target projects

## License

MIT
