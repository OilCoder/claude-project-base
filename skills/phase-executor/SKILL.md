---
name: phase-executor
description: >
  Read and execute a phase from the project plan in order.
  Use when the user says "execute the phase", "work on phase N",
  "implement phase N", "run phase", or references a phase by name or number.
argument-hint: "[phase number or name]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Phase Executor

Read `PLAN.md`, present an execution plan, wait for approval, and execute
the phase's tasks in order, updating checkboxes as each one is completed.

## Before writing any code

1. Read `todo/PLAN.md` completely.
2. Identify the requested phase and extract its task list.
3. Present a short plan to the user:
   - Files to create or modify
   - Order of execution
   - Any ambiguity that needs user input
4. **Wait for explicit user approval** before proceeding.

## Execution rules

### Scope

- Only create or modify files listed in the phase tasks.
- Never touch files from other phases.
- If a required file from a previous phase is missing, stop and inform the user before continuing.

### Order

- Execute tasks in the order they appear in `PLAN.md`.
- Complete each task fully before moving to the next.
- Mark each task as `- [x]` in `PLAN.md` immediately after completing it.

### Code

- Follow all rules in `.claude/rules/`.
- Apply the project's style, naming, and logging conventions.
- Respect `doc-enforcement`: docstrings on all public functions.

### Conventions

- Project-specific conventions are respected per `project-guidelines.md`.
- Do not assume conventions — read them from the guidelines file.

## After completing the phase

1. Mark the phase title as `(COMPLETED)` in `PLAN.md`.
2. Report to the user:
   - Files created
   - Functions implemented
   - Decisions made during execution
3. Flag anything that needs user review before starting the next phase.
4. If the `/bitacora` skill is available, suggest logging the session.
