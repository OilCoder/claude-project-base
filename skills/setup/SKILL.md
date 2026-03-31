---
name: setup
description: >
  Initialize a new project using the base rules and skills template.
  Use when the user says "setup the project", "init the project",
  "bootstrap", "configure the new project".
disable-model-invocation: true
argument-hint: "[project name]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Setup

Initialize a new project by copying and customizing the base rules and skills.

## Procedure

### 1. Gather project information

Ask the user (if not provided):

- Project name
- Main stack (Python, JS/TS, Python+Octave, etc.)
- Short description (one sentence)
- Project folder (path in WSL)

### 2. Create the base structure

```bash
mkdir -p .claude/rules .claude/skills todo
```

### 3. Copy rules

Copy all rules from the base to the project:

- `code-style.md`
- `code-change.md`
- `file-naming.md`
- `logging-policy.md`
- `project-guidelines.md`
- `doc-enforcement.md`
- `docs-style.md`
- `plan-format.md`

### 4. Copy skills

Copy the applicable skills. Ask the user which ones they want:

- `bitacora/` (recommended always)
- `plan-writing/` (recommended always)
- `phase-executor/` (recommended always)
- `test/` (recommended for code projects)
- `debug/` (recommended for code projects)
- `document/` (optional)
- `doc-enforce/` (optional)

### 5. Customize `project-guidelines.md`

Replace placeholder sections with real project information:

- **PROJECT_STRUCTURE**: actual folder tree
- **TECH_CONSTRAINTS**: actual technical limitations
- **VALIDATION_MODES**: initial mode (`suggest` for prototypes, `warn` for development)
- **RULES_INDEX**: adjust if rules were removed
- **SKILLS_INDEX**: adjust if skills were removed

### 6. Customize `code-style.md`

Based on the stack:

- Set comment language
- Adjust naming convention if JS/TS (`camelCase`) vs Python (`snake_case`)
- Adjust function line limit if the project requires it

### 7. Generate `CLAUDE.md`

Create the root `CLAUDE.md` file with:

- Project name and description
- Reference to the rules and skills system
- Language conventions
- Stack and environment

### 8. Create initial plan

If the user provided phases or tasks, create `todo/PLAN.md` following
the `plan-format.md` rule.

### 9. Initialize git (if applicable)

```bash
git init
# Create .gitignore with: debug/, outputs/, __pycache__/, etc.
```

## Rules

- Do not create extra folders the user did not request.
- Ask before adding or removing rules/skills.
- Respect the structure defined by the user, do not impose your own.
- If the project already has `.claude/`, ask before overwriting.
