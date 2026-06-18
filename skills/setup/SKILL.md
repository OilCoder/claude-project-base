---
name: setup
description: >
  Initialize a new project with the base rules, skills, agents, and hooks.
  Use when the user says "setup the project", "init the project",
  "bootstrap", "configure the new project".
disable-model-invocation: true
argument-hint: "[project name]"
allowed-tools: Read Write Edit Bash(mkdir:*) Bash(cp:*) Bash(chmod:*) Bash(git init:*) Bash(ls:*) Grep Glob
---

# Setup

Initialize a new project by copying the base rules, skills, agents, and hooks,
and configuring stack-specific permissions and linter hooks.

## Philosophy

The base does **not** prescribe folder structure beyond the minimum.
You start with 4 folders and grow organically. `src/`, `pipeline/`, `tests/`,
`data/`, `models/` etc. are created when the project actually needs them, not
as part of bootstrap.

## Procedure

### 0. Decide: greenfield or existing project

- **Greenfield** (new repo, no existing CLAUDE.md / AGENTS.md): proceed.
- **Existing project**: run the bundled `/init` command **first** so Claude
  analyzes the codebase and produces a starting CLAUDE.md from observed
  conventions. Then run `/setup` to layer the base on top.
- **Existing `AGENTS.md`** (Cursor, Aider): plan to import via `@AGENTS.md`
  in the generated `CLAUDE.md`.

### 1. Gather minimum information (2 questions)

Ask the user (if not provided):

1. **Project name** — for `CLAUDE.md` and any default scoping.
2. **Main stack** — one of: `python` (default), `js`, `ts`, `python+js`, `go`, `rust`, `other`.

That's it. No other questions.

### 2. Create the minimum folder structure

Always create these 5 folders, no more:

```bash
mkdir -p .claude/rules .claude/skills .claude/agents .claude/hooks
mkdir -p todo
mkdir -p documentation    # code docs (target of /document)
mkdir -p aprendizaje      # study material (target of /study)
mkdir -p docs             # GitHub Pages landing site (always reserved)
```

Do **not** create `src/`, `pipeline/`, `tests/`, `data/`, `models/`, `experiments/`,
or any other domain-specific folder. The user creates those when they start coding.

### 3. Copy rules

Copy all rules from the base to `.claude/rules/`:

- Always-loaded: `code-style.md`, `code-change.md`, `file-naming.md`,
  `logging-policy.md`, `verification.md`, `delegation.md`, `memory-policy.md`,
  `commit-style.md`, `project-guidelines.md`
- Path-scoped: `doc-enforcement.md`, `docs-style.md`, `learning-style.md`, `plan-format.md`

### 4. Copy skills

Copy applicable skills to `.claude/skills/`. Recommended set for any project:

- `bitacora/`, `plan-writing/`, `phase-executor/`, `checkpoint/`, `bug-fix/`
- `test/`, `investigate/`, `document/`, `doc-enforce/`, `study/`

`setup/` is **not** copied — it lives only in the base.

### 5. Copy agents

Copy all 4 agents to `.claude/agents/` — they are stack-agnostic:

- `code-reviewer.md`, `security-reviewer.md`, `architect.md`, `implementer.md`

### 6. Copy hooks and settings

```bash
cp settings.template.json .claude/settings.json
cp hooks/*.sh .claude/hooks/
chmod +x .claude/hooks/*.sh
```

The settings file ships with:
- `statusLine` (branch + active phase + bitácora flag)
- `permissions.allow` (safe read-only commands)
- `SessionStart` and `Stop` hooks
- `PreToolUse` blocks for destructive operations
- `PostToolUse` debug-isolation check

### 7. Configure stack-specific permissions and linter

**Permissions**: append stack-specific safe commands to `permissions.allow`:

| Stack | Commands to allow |
|---|---|
| `python` | `Bash(pytest *)`, `Bash(ruff *)`, `Bash(mypy *)`, `Bash(python -m *)`, `Bash(pip *)`, `Bash(jupyter *)` |
| `js` / `ts` | `Bash(npm *)`, `Bash(npx *)`, `Bash(node *)`, `Bash(yarn *)`, `Bash(pnpm *)` |
| `python+js` | Both Python and JS commands |
| `go` | `Bash(go *)`, `Bash(gofmt *)` |
| `rust` | `Bash(cargo *)`, `Bash(rustc *)`, `Bash(rustfmt *)` |
| `other` | Skip — user adds manually |

**Linter hook**: append a `PostToolUse` hook for the stack's formatter/linter.
See the per-stack JSON snippets in this skill (Python uses `ruff format` + `ruff check --fix`,
JS/TS uses `eslint --fix` + `prettier --write`, etc.).

After this step, remove the `_setup_notes` key from `.claude/settings.json`.

### 8. Customize `project-guidelines.md`

Replace placeholder sections with real project information:

- **Project structure**: leave as-is (the user will document it as folders are created)
- **Tech constraints**: replace with actual constraints (runtime, hardware, services)
- **Verification commands**: fill in `test:`, `type-check:`, `lint:`, `format:`
- **Validation modes**: choose initial mode (`suggest` for prototypes, `warn` for development)

### 9. Customize `code-style.md` (light touch)

Based on the stack, set the comment language and the naming convention if it
differs from the default (`snake_case` for Python/Go/Rust, `camelCase` for JS/TS).

### 10. Customize `doc-enforcement.md` paths

The default `paths:` covers `src/`, `lib/`, `app/`, `pipeline/` plus generic
extension matches. Trim to the actual extensions used in this project to avoid
loading the rule on unrelated files.

### 11. Generate `CLAUDE.md`

Create the root `CLAUDE.md` (under 200 lines, per official Claude Code guidance) with:

- Project name and one-line description
- Reference to `.claude/rules/` and `.claude/skills/`
- Language conventions (code, comments, plans, logs)
- Stack and environment

If `AGENTS.md` exists in the project, the first non-comment line of `CLAUDE.md` is:

```markdown
@AGENTS.md
```

This imports `AGENTS.md` so Cursor/Aider/Claude Code share a single source.
Add Claude-specific instructions below the import.

### 12. Initialize git and `.gitignore`

```bash
git init
```

Create `.gitignore` with these defaults:

```
# Claude Code
.claude/settings.local.json

# Python (if applicable)
__pycache__/
*.pyc
.venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Node (if applicable)
node_modules/
dist/
build/

# Common
.env
*.key
*.log

# Folders that emerge but are gitignored when present
debug/
outputs/

# OS
.DS_Store
Thumbs.db
```

The user adds project-specific entries (datasets, model weights, secrets) when
they create the corresponding folders.

### 13. (Optional) Create initial plan

If the user provided phases or tasks, create `todo/PLAN.md` per `plan-format.md`.
Otherwise leave `todo/` empty — the user runs `/plan-writing` when ready.

### 14. (Optional) GitHub publishing — Pages + Wiki

The base reserves two publishing targets (see `docs-style.md`):

- **`docs/` → GitHub Pages** — native. The user enables it in *Settings → Pages →
  Deploy from branch → `/docs` folder*. No automation needed.
- **`documentation/` → GitHub Wiki** — not native (the wiki is a separate
  `*.wiki.git` repo). A workflow keeps it in sync.

If the user wants the wiki synced, copy the template:

```bash
mkdir -p .github/workflows
cp templates/sync-wiki.yml .github/workflows/sync-wiki.yml
```

Then tell the user to do the one-time wiki init: open the repo's **Wiki** tab and
create any first page, otherwise `<repo>.wiki.git` does not exist and the workflow
fails on first run.

**About section (repo homepage):** when the project is published, the GitHub repo's
**About** panel must link both surfaces so visitors can reach either:

- **Website** field → the GitHub Pages URL (`https://<user>.github.io/<repo>/`).
- **Description / README** → an explicit link to the Wiki
  (`https://github.com/<user>/<repo>/wiki`).

Remind the user to set these after the first publish. Do not invent the URLs —
derive them from the actual `<user>/<repo>`.

## Final state

After `/setup`, the project looks like this:

```
my-project/
├── .claude/
│   ├── rules/         (13 rules)
│   ├── skills/        (10 skills)
│   ├── agents/        (4 agents)
│   ├── hooks/         (5 hook scripts)
│   └── settings.json
├── todo/              (empty, ready for plans/bitácora)
├── documentation/     (empty, target of /document)
├── aprendizaje/       (empty, target of /study)
├── docs/              (empty, reserved for GitHub Pages)
├── CLAUDE.md
└── .gitignore
```

The user starts coding from here. Folders like `src/`, `pipeline/`, `tests/`,
`data/`, `models/`, `experiments/` appear as the project demands them.

## Rules

- Do not create folders the user did not request beyond the 5-folder minimum.
- Ask before adding or removing rules/skills/agents.
- Respect the structure that emerges from the user's work, do not impose your own.
- If the project already has `.claude/`, ask before overwriting.
- The hook scripts require `bash` (Linux/WSL/macOS native; Windows requires Git Bash or WSL).
- Validate `.claude/settings.json` is valid JSON after step 7 (`jq . .claude/settings.json` if available).
