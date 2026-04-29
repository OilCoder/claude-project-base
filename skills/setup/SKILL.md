---
name: setup
description: >
  Initialize a new project using the base rules and skills template.
  Use when the user says "setup the project", "init the project",
  "bootstrap", "configure the new project".
disable-model-invocation: true
argument-hint: "[project name]"
allowed-tools: Read Write Edit Bash(mkdir:*) Bash(cp:*) Bash(git init:*) Bash(ls:*) Grep Glob
---

# Setup

Initialize a new project by copying and customizing the base rules, skills, hooks, and settings.

## Procedure

### 0. Decide: greenfield or existing project

- **Greenfield** (new repo, no existing CLAUDE.md / AGENTS.md): proceed to step 1.
- **Existing project**: run the bundled `/init` command **first** so Claude
  analyzes the codebase and produces a starting CLAUDE.md from observed
  conventions. Then run `/setup` to layer the base template on top, merging
  intelligently rather than overwriting.

If the project already has `AGENTS.md` from another tool (Cursor, Aider),
plan to import it from `CLAUDE.md` via `@AGENTS.md` (see step 11) instead
of duplicating its content.

### 1. Gather project information

Ask the user (if not provided):

- Project name
- Main stack — must be one of: `python`, `js`, `ts`, `python+js`, `go`, `rust`, `other`
- Short description (one sentence)
- Project folder (path in WSL)
- Has existing `AGENTS.md`? (yes/no — if yes, will be imported via `@AGENTS.md`)

### 2. Create the base structure

```bash
mkdir -p .claude/rules .claude/skills .claude/hooks .claude/agents todo
```

### 3. Copy rules

Copy all rules from the base to `.claude/rules/`:

- `code-style.md`
- `code-change.md`
- `file-naming.md`
- `logging-policy.md`
- `project-guidelines.md`
- `verification.md`
- `doc-enforcement.md` *(loads only when editing source files — has `paths:` frontmatter)*
- `docs-style.md` *(loads only when editing markdown — has `paths:` frontmatter)*
- `plan-format.md` *(loads only when editing `todo/` — has `paths:` frontmatter)*

### 4. Copy skills

Copy applicable skills to `.claude/skills/`. Ask the user which to keep:

- `bitacora/` (recommended always)
- `plan-writing/` (recommended always)
- `phase-executor/` (recommended always)
- `checkpoint/` (recommended always — combined plan/doc/bitácora/commit workflow)
- `test/` (recommended for code projects)
- `investigate/` (recommended for code projects)
- `document/` (optional)
- `doc-enforce/` (optional)

`setup/` is **not** copied — it lives only in the base.

### 5. Copy agents

Copy applicable agents to `.claude/agents/`. All four are stack-agnostic and recommended:

- `code-reviewer.md` — pre-commit review in fresh context
- `security-reviewer.md` — vulnerability audit
- `architect.md` — interview-driven spec writing for non-trivial features
- `implementer.md` — autonomous code writer with rules preloaded

### 6. Copy hooks and settings

```bash
cp settings.template.json .claude/settings.json
cp hooks/check-debug-isolation.sh .claude/hooks/
cp hooks/session-start-context.sh .claude/hooks/
cp hooks/stop-suggest-checkpoint.sh .claude/hooks/
cp hooks/statusline.sh .claude/hooks/
chmod +x .claude/hooks/*.sh
```

The settings file ships with:
- `statusLine` showing branch + active phase + bitácora flag
- `permissions.allow` pre-approving safe read-only commands
- `SessionStart` and `Stop` hooks for context injection and checkpoint suggestion
- `PreToolUse` blocks for destructive operations
- `PostToolUse` debug-isolation check

Remove the `_setup_notes` key from `.claude/settings.json` after the customization in the next step.

### 7. Configure stack-specific permissions and linter/formatter hooks

**Permissions**: append stack-specific safe commands to `permissions.allow` in `.claude/settings.json`:

| Stack | Commands to allow |
|---|---|
| `python` | `Bash(pytest *)`, `Bash(ruff *)`, `Bash(mypy *)`, `Bash(python -m *)`, `Bash(pip *)` |
| `js` / `ts` | `Bash(npm *)`, `Bash(npx *)`, `Bash(node *)`, `Bash(yarn *)`, `Bash(pnpm *)` |
| `go` | `Bash(go *)`, `Bash(gofmt *)` |
| `rust` | `Bash(cargo *)`, `Bash(rustc *)`, `Bash(rustfmt *)` |

**Linter/formatter hook**: append a `PostToolUse` hook to the existing array.

Append a `PostToolUse` hook to `.claude/settings.json` based on the chosen stack. Add the hook **inside** the existing `PostToolUse[0].hooks` array (next to the debug-isolation hook).

#### Python (`python`)

```json
{
  "type": "command",
  "command": "FILE=$(printf '%s' \"$CLAUDE_TOOL_INPUT\" | grep -oE '\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\\.py\"' | sed 's/.*\"\\([^\"]*\\)\".*/\\1/' | head -n1); [[ -n \"$FILE\" ]] && (ruff check --fix \"$FILE\" 2>&1; ruff format \"$FILE\" 2>&1) || true"
}
```

Required: `pip install ruff` (or add to `pyproject.toml`).

#### JavaScript / TypeScript (`js`, `ts`)

```json
{
  "type": "command",
  "command": "FILE=$(printf '%s' \"$CLAUDE_TOOL_INPUT\" | grep -oE '\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\\.(js|jsx|ts|tsx)\"' | sed 's/.*\"\\([^\"]*\\)\".*/\\1/' | head -n1); [[ -n \"$FILE\" ]] && (npx eslint --fix \"$FILE\" 2>&1; npx prettier --write \"$FILE\" 2>&1) || true"
}
```

Required: `eslint` and `prettier` in `package.json` devDependencies.

#### Python + JS (`python+js`)

Add **both** Python and JS hooks (the file extension filter inside each command ensures only matching files trigger the linter).

#### Go (`go`)

```json
{
  "type": "command",
  "command": "FILE=$(printf '%s' \"$CLAUDE_TOOL_INPUT\" | grep -oE '\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\\.go\"' | sed 's/.*\"\\([^\"]*\\)\".*/\\1/' | head -n1); [[ -n \"$FILE\" ]] && (gofmt -w \"$FILE\"; go vet \"$FILE\" 2>&1) || true"
}
```

#### Rust (`rust`)

```json
{
  "type": "command",
  "command": "FILE=$(printf '%s' \"$CLAUDE_TOOL_INPUT\" | grep -oE '\"file_path\"[[:space:]]*:[[:space:]]*\"[^\"]*\\.rs\"' | sed 's/.*\"\\([^\"]*\\)\".*/\\1/' | head -n1); [[ -n \"$FILE\" ]] && rustfmt \"$FILE\" 2>&1 || true"
}
```

#### Other (`other`)

Skip the linter hook. Add a comment in `.claude/settings.json` explaining no linter is configured.

### 8. Customize `project-guidelines.md`

Replace placeholder sections with real project information:

- **PROJECT_STRUCTURE**: actual folder tree
- **TECH_CONSTRAINTS**: actual technical limitations
- **VALIDATION_MODES**: initial mode (`suggest` for prototypes, `warn` for development)
- **RULES_INDEX**: adjust if rules were removed
- **SKILLS_INDEX**: adjust if skills were removed

### 9. Customize `code-style.md`

Based on the stack:

- Set comment language
- Adjust naming convention (`camelCase` for JS/TS, `snake_case` for Python/Go/Rust)
- Naming/length enforcement is delegated to the linter via the hook from step 6

### 10. Customize `doc-enforcement.md` paths

The default `paths:` frontmatter covers most stacks. Trim it to the actual file extensions used in this project to avoid loading the rule when working with unrelated files.

### 11. Generate `CLAUDE.md`

Create the root `CLAUDE.md` (under 200 lines, per official Claude Code guidance) with:

- Project name and description
- Reference to the rules and skills system
- Language conventions (code, comments, plans, logs)
- Stack and environment

If the project has an existing `AGENTS.md`, the first non-comment line of
`CLAUDE.md` should be:

```markdown
@AGENTS.md
```

This imports `AGENTS.md` so Cursor/Aider/Claude Code share a single source.
Add Claude-specific instructions (the rules/skills/hooks references) below
the import.

### 12. Create initial plan

If the user provided phases or tasks, create `todo/PLAN.md` following the `plan-format.md` rule.

### 13. Initialize git (if applicable)

```bash
git init
```

Create `.gitignore` with at minimum:

```
debug/
outputs/
__pycache__/
*.pyc
node_modules/
.venv/
.env
.claude/settings.local.json
```

## Rules

- Do not create extra folders the user did not request.
- Ask before adding or removing rules/skills.
- Respect the structure defined by the user, do not impose your own.
- If the project already has `.claude/`, ask before overwriting.
- The hook scripts require `bash` to be available (true on Linux/WSL, native on macOS, requires Git Bash on Windows).
- After step 6, verify `.claude/settings.json` is valid JSON (`jq . .claude/settings.json` if `jq` is available).
