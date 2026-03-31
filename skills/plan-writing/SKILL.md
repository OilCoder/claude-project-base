---
name: plan-writing
description: >
  Write or update the project work plan.
  Use when the user says "write the plan", "update the plan",
  "what's left to do", "create the project phases".
argument-hint: "[phase or context]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Plan Writing

Write or update the work plan in `todo/PLAN.md`.
Follow the format defined in `plan-format.md` rule.

## Procedure

### 1. Check current state

- Read `todo/PLAN.md` if it exists.
- Review recent `todo/bitacora-*.md` files to understand progress.
- Review git log for recent commits.

### 2. Create or update the plan

- If `todo/PLAN.md` does not exist, create it using the template from `plan-format.md`.
- If it exists, update by marking completed tasks and adding new ones.
- If `todo/` does not exist, create it.

### 3. When creating a plan

1. Ask the user for: goal, stack, and rough phases (if not provided).
2. Draft the plan following the format in `plan-format.md`.
3. Show the draft and wait for approval before saving.
4. Save only to `todo/` once approved.

## Rules

- **Flat checkboxes**: no nesting, one level of depth maximum.
- **Independent phases**: each phase is understandable without reading the others.
- **Mark immediately**: when a task is completed, mark `[x]` with the date.
- **Never delete tasks**: completed ones are marked, not removed.
- **Completed phases**: add `(COMPLETED)` to the phase title.
- **Brevity**: one line per task, no long explanations.
- If the user passes `$ARGUMENTS`, use it as context for creating/updating the relevant phase.

## Relationship with bitacora

When updating the plan, check if there are pending items in `todo/bitacora-*.md`
that should be reflected here. Tasks marked `- [ ]` in the log are candidates for the plan.
