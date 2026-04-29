# claude-project-base

Base template of rules, skills, agents, and hooks for projects using Claude Code.

<!--
  If the project also uses AGENTS.md (Cursor, Aider, etc.), uncomment the
  next line so both tools share a single source of truth without duplication.
  Per the official Claude Code docs:
  https://code.claude.com/docs/en/memory#agentsmd
-->
<!-- @AGENTS.md -->

> Keep this file under 200 lines. Per the official Claude Code guidance:
> *"Files over 200 lines consume more context and may reduce adherence."*
> Move detail into `.claude/rules/`, `.claude/skills/`, or hook scripts.

## How to use

1. Copy `rules/` → `.claude/rules/`, `skills/` → `.claude/skills/`, `agents/` → `.claude/agents/`, and `hooks/` → `.claude/hooks/` in the new project.
2. Copy `settings.template.json` → `.claude/settings.json`.
3. Rename this file to `CLAUDE.md` and place it at the project root.
4. Read `PERSONALIZAR.md` for guidance on what to adjust in each file.
5. Run `/setup` (or follow its checklist manually) to:
   - Customize `project-guidelines.md` with the project's structure, stack, and verification commands.
   - Adjust rules for the project language (Python, JS, Octave, etc.).
   - Append a stack-specific linter/formatter hook to `.claude/settings.json`.
   - Remove skills/agents that do not apply.
6. Add project-specific rules/skills/agents/hooks as needed.

> **Note**: In this base repo, `rules/`, `skills/`, `agents/`, `hooks/`, and `settings.template.json` live at the root for reference.
> In the target project they go inside `.claude/`.

## The four layers

| Layer | Where | Behavior |
|---|---|---|
| **Rules** | `.claude/rules/*.md` | Advisory, loaded into context |
| **Skills** | `.claude/skills/*/SKILL.md` | On-demand workflows, may pre-render shell context with `` !`...` `` |
| **Agents** | `.claude/agents/*.md` | Specialized assistants Claude delegates to (fresh context) |
| **Hooks** | `.claude/settings.json` + `.claude/hooks/*.sh` | Deterministic, fired on tool events |

Pick the hardest layer that can express the behavior. Rules guide. Skills orchestrate. Agents review or design in isolation. Hooks enforce.

## Rules (10)

| Rule | Scope | Purpose |
|---|---|---|
| `code-style` | Always | Layout, naming, spacing, step/substep with emojis |
| `file-naming` | Always | File naming conventions and execution order |
| `code-change` | Always | Scope, edit safety, multi-file changes |
| `logging-policy` | Always | Print and logging control |
| `verification` | Always | Verification gate before declaring tasks complete |
| `delegation` | Always | Decide between main session, subagent, or agent team |
| `project-guidelines` | Always | Index, enforcement, validation modes, verification commands |
| `doc-enforcement` | Source files (`paths:`) | Mandatory docstrings and standards |
| `docs-style` | Markdown (`paths:`) | Markdown documentation format |
| `plan-format` | `todo/**/*.md` (`paths:`) | Plan file format and update rules |

## Skills (9)

| Skill | Trigger | Purpose |
|---|---|---|
| `/checkpoint` | At milestones | Combined plan + docs + bitácora + commit + (push/PR) |
| `/bitacora` | Post-commit or manual | Log session in `todo/bitacora-YYYY-MM-DD.md` |
| `/plan-writing` | Manual | Write/update plan in `todo/PLAN.md` |
| `/phase-executor` | Manual | Execute a plan phase, with verification gate |
| `/test` | Manual | Create tests for a module |
| `/investigate` | Manual | Create isolated debug scripts with promotion path |
| `/document` | Manual | Generate docs for a module (runs in forked context) |
| `/doc-enforce` | Manual | Review and generate docstrings (runs in forked context) |
| `/setup` | On project init | Bootstrap new project from base |

## Agents (4)

| Agent | Purpose |
|---|---|
| `code-reviewer` | Reviews uncommitted diff in fresh context — invoke before commits |
| `security-reviewer` | Audits for OWASP-style vulnerabilities |
| `architect` | Interview-driven feature design; outputs spec to `todo/spec-*.md` |
| `implementer` | Autonomous code writer with rules preloaded — for delegating self-contained tasks |

## Hooks and settings

| Hook | Event | Effect |
|---|---|---|
| `statusline` | StatusLine | Branch + dirty flag + active phase + bitácora pending |
| `session-start-context` | SessionStart | Injects PLAN.md active phase, bitácora pending items, verification commands |
| `stop-suggest-checkpoint` | Stop | Suggests `/checkpoint` if there are uncommitted changes or commits since last bitácora |
| Block `rm -rf` | PreToolUse / Bash | Exit 2, blocks the call |
| Block force-push | PreToolUse / Bash | Exit 2, blocks the call |
| Block `git reset --hard` | PreToolUse / Bash | Exit 2, blocks the call |
| Block `--no-verify` | PreToolUse / Bash | Exit 2, blocks the call |
| `check-debug-isolation` | PostToolUse / Edit\|Write | Warns when `src/` imports from `debug/` |
| Linter/formatter | PostToolUse / Edit\|Write | Stack-specific (added by `/setup`) |

`settings.template.json` also ships a `permissions.allow` allowlist of safe read-only
commands (git status/log/diff, ls, cat, etc.) so Claude doesn't prompt for approval
on every routine command. `/setup` extends it with stack-specific commands.

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
