---
description: Define format and update rules for project plan files in todo/
---

# Plan Format

Every plan lives in `todo/` as a Markdown file.
This rule defines the format; the skill `/plan-writing` handles the procedure.

## Plan location

- General project plan: `todo/PLAN.md`
- Phase-specific plans (if needed): `todo/phase_NN_<name>.md`
- If `todo/` does not exist, create it.

## File format

Use this structure, nothing more:

```markdown
# <Project or Phase Name>

## Goal
One sentence. What does this plan accomplish?

## Stack (only in PLAN.md)
Simple table: Layer | Technology

## Structure (only in PLAN.md)
Folder tree showing key paths and their purpose.

## Phases

### Phase N — <Name>
- [ ] Task description (file or module it targets)
- [ ] Task description
- [x] Task completed (YYYY-MM-DD)

### Phase N+1 — <Name>
- [ ] ...

## Conventions
Short bullet list of naming rules or constraints relevant to this plan.
```

## Writing rules

- Use plain Markdown only. No HTML, no frontmatter, no badges.
- Tasks use `- [ ]` checkboxes. One task = one action.
- Each task should name the file or module it targets.
- No sub-tasks, no nested checkboxes. Keep it flat.
- No status tables, no emoji columns, no progress bars.
- Avoid vague tasks like "improve X" or "refactor Y". Be specific.
- Phases must be independent — a phase should not depend on assumptions from another phase unless explicitly stated.

## Update rules

- Mark completed tasks as `- [x]` immediately after finishing them.
- Add the completion date: `- [x] Task description (YYYY-MM-DD)`.
- Do not delete tasks, even completed ones.
- Do not add new tasks to a phase without user approval.
- If a phase is fully completed, add `(COMPLETED)` to the phase title.
- Never rewrite or reformat existing content — only update checkboxes and phase titles.

## Cross-references

- See `plan-writing/SKILL.md` for the procedure to create and update plans.
- See `phase-executor/SKILL.md` for automated phase execution.
- See `bitacora/SKILL.md` for session logging that feeds into plan updates.
