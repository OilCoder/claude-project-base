# Customization Guide

How to adapt the base rules and skills to a new project.

## Quick flow

1. Copy `.claude/` to the new project and rename `CLAUDE-TEMPLATE.md` → `CLAUDE.md` at the project root.
2. Run the `/setup` skill if available, or follow the manual steps below.
3. Customize `project-guidelines.md` (mandatory).
4. Adjust rules for the project language and stack.
5. Choose which skills to keep.
6. Add project-specific rules/skills if needed.

## Rules: what is generic vs what to customize

### code-style.md

| Section | Generic (do not touch) | Customize |
|---|---|---|
| Function structure | Single responsibility, helpers, line limit | Adjust limit (40 by default) |
| Minimalism | No boilerplate, no premature abstractions | — |
| Naming | `snake_case`, descriptive names | Change to `camelCase` for JS/TS |
| Comments and style | Step/Substep + emojis, no trivial comments | Comment language (English/Spanish) |
| Imports | Logical grouping, only used ones | Add framework conventions |
| Scope discipline | Do not solve more than requested | — |

### file-naming.md

| Section | Generic (do not touch) | Customize |
|---|---|---|
| General conventions | `snake_case`, descriptive, no spaces | File name language |
| Execution order | `NN_` numeric prefix or `sNN[x]_` | Choose project pattern |
| Output files | Dedicated output folder concept | Exact pattern (`{id}_{type}.png`, etc.) |
| Test/Debug files | `test_<module>_<case>`, `dbg_<slug>` | — |
| Documentation | `NN_<slug>.md` | Location (`docs/`, `obsidian-vault/`) |

### code-change.md

| Section | Generic (do not touch) | Customize |
|---|---|---|
| Edit scope | Minimal block, no refactor | — |
| Structural integrity | Preserve order, format, separators | — |
| Multi-file changes | Dependency order, read first | — |
| Output format | Only modified code | — |
| Forbidden | No debug code, no new deps | Add project-specific prohibitions |

### logging-policy.md

| Section | Generic (do not touch) | Customize |
|---|---|---|
| Print usage | Temporary in dev, clean before commit | Message language |
| Logging usage | Module-scoped loggers, no debug noise | — |
| Progress output | Visible progress concept | Tools (`tqdm`, MRST indicators) |
| Cleanup | Isolate in `debug/`, disposable scaffolding | — |
| Exceptions | Notebooks and CLI allowed | — |

### doc-enforcement.md

| Section | Generic (do not touch) | Customize |
|---|---|---|
| Docstring required | Public functions, private if nontrivial | — |
| Module header | Module docstring mandatory | — |
| Docstring structure | Args, Returns, Raises | Format (Google Style, NumPy, JSDoc) |
| Enforcement scope | Scope concept | Define files (`src/`, `pipeline/`) |

### docs-style.md

| Section | Generic (do not touch) | Customize |
|---|---|---|
| Required sections | Title, Workflow, I/O, Math, Code Ref | Add/remove sections |
| Style | Concise, current code, no TODOs | — |
| Docs root folder | Dedicated folder concept | Location and bilingual structure |

### plan-format.md

| Section | Generic (do not touch) | Customize |
|---|---|---|
| File format | Goal/Stack/Phases structure | — |
| Writing rules | Flat checkboxes, specific, not vague | — |
| Update rules | Mark `[x]` with date, never delete | — |

### project-guidelines.md

| Section | Action |
|---|---|
| Rules index | Update if rules were removed |
| Skills index | Update if skills were removed |
| Validation modes | Choose initial mode (`suggest`/`warn`/`strict`) |
| Project structure | Replace with actual folder tree |
| Tech constraints | Replace with actual constraints |
| Policies | Add if the project uses immutable principles |

## Skills: which to keep

| Skill | When to keep | When to remove |
|---|---|---|
| bitacora | Always — bridge with Cowork/Obsidian | Never |
| plan-writing | Always — any project needs a plan | Never |
| phase-executor | Projects with defined phases | Very small or exploratory projects |
| test | Projects with code | Documentation-only projects |
| debug | Projects with code | Documentation-only projects |
| document | Projects needing technical docs | Simple projects |
| doc-enforce | Projects with many functions | Short scripts |
| setup | Only in the base — do not copy to projects | — |

## Example: Python ML project

1. **code-style**: comment language = English, limit = 40 lines
2. **file-naming**: `NN_` pattern, outputs = `outputs/{experiment}_{metric}.png`
3. **logging-policy**: progress = `tqdm`, language = English
4. **doc-enforcement**: format = Google Style, scope = `src/`
5. **docs-style**: location = `docs/`, no bilingual
6. **project-guidelines**: mode = `warn`, actual structure, GPU/CUDA constraints
7. **Skills**: all except setup

## Example: static web project

1. **code-style**: naming = `camelCase` for JS, `snake_case` for files
2. **file-naming**: no numeric prefix, fixed names (`index.html`, `style.css`)
3. **logging-policy**: only `console.log` allowed in dev
4. **doc-enforcement**: format = JSDoc, scope = `js/`
5. **docs-style**: location = `docs/`, simplified sections (no Math)
6. **project-guidelines**: mode = `suggest`, browser compatibility constraints
7. **Skills**: bitacora, plan-writing, document. No test/debug/doc-enforce.
