---
name: blueprint
description: >
  Scaffolding loop that generates a project's foundation document suite BEFORE
  coding, so the project has a stable, drift-proof anchor. Human-gated: one
  document per iteration, you approve each before the next. Use at project start,
  or run again to resume an unfinished suite. Say "blueprint the project",
  "scaffold the foundation", "start the planning docs".
disable-model-invocation: true
argument-hint: "[ml-research | data-pipeline | other | --core]"
allowed-tools: Read Write Edit Bash(mkdir:*) Bash(ls:*) Bash(date:*) Grep Glob Task AskUserQuestion
---

# Blueprint

Generate the foundation document suite in `planning/blueprint/`, one document at a
time, each gated by explicit user approval. The suite is the **stable anchor** for the
whole project: its final document seeds `PLAN.md`. The format catalog (which documents
per kind, required sections, manifest format) lives in `planning-format.md` — this skill
is the **process** that drives it.

## Pre-rendered context

- **Date**: !`date +%Y-%m-%d`
- **Existing manifest** (if resuming):
```!
[ -f planning/blueprint/MANIFEST.md ] && cat planning/blueprint/MANIFEST.md || echo "(no blueprint yet — fresh start)"
```
- **Existing blueprint files**:
```!
ls -1 planning/blueprint/*.md 2>/dev/null || echo "(none)"
```

## Core principle: human-gated, state-on-disk

The loop never advances on its own. After each document is drafted you **stop and wait**
for explicit approval. Progress lives in `planning/blueprint/MANIFEST.md`, not in this
conversation — so the loop is resumable and cannot silently drift. This directly answers
the risk that an uncontrolled loop turns the project into something it wasn't meant to be.

## Procedure

### 1. Determine the project kind

- If `$ARGUMENTS` names a kind (`ml-research`, `data-pipeline`, `other`), use it.
- If a manifest already exists, read its `Kind:` and **resume** — do not re-ask.
- Otherwise ask with `AskUserQuestion`: which kind? (`ml-research` / `data-pipeline` /
  `other`). `other` (or the `--core` flag on any kind) produces the **core docs only**.

### 2. Derive the document list

Read the catalog for this kind from `planning-format.md` (it defines the ordered document
list, each document's required sections, and the manifest format). The list is always:
the **core** docs (`00_charter`, `01_context_interfaces`, `09_implementation_plan`) plus,
unless `--core`/`other`, the kind's pack (`02`–`04`). Documents are processed in filename
order so `09_implementation_plan` is always last.

### 3. Ensure the manifest

```bash
mkdir -p planning/blueprint
```

If `planning/blueprint/MANIFEST.md` does not exist, create it per `planning-format.md`:
record `Kind:`, today's date (pre-rendered), and the full document checklist with every
entry `[ ]` pending. If it exists, use it as-is (resume).

### 4. The loop — one document per iteration

For the **first non-approved** document in the manifest (markers per `planning-format.md`:
`[x]` approved · `[>]` in progress · `[ ]` pending · `[!]` blocked):

1. Mark it `[>]` in the manifest.
2. **Delegate to the `blueprinter` agent** via `Task`. Pass it: the target filename and
   title, the document's required sections (from `planning-format.md`), the project kind,
   and the paths of all already-**approved** documents to read as context.
3. When the agent returns, **present the draft to the user and STOP**. Ask (plainly or via
   `AskUserQuestion`): **approve**, **revise**, or **stop**.
   - **Approve** → mark `[x] (approved <date>)` in the manifest, advance to the next document.
   - **Revise** → re-invoke the `blueprinter` for the same document with the user's feedback.
   - **Stop** → leave the document `[>]`, exit cleanly. Re-running `/blueprint` resumes here.
4. Repeat until `09_implementation_plan.md` is approved.

Never draft the next document before the current one is approved. Never auto-approve.

### 5. Blocked and scope-change conditions

- **Blocked**: if a document depends on something unresolved (e.g. a data schema not yet
  available), record it in that document's `## Open questions` and mark the manifest line
  `[!] (BLOCKED <date>: reason)`. A blocked document is a **hard stop** — do not skip
  ahead, because later documents depend on it. Surface it to the user.
- **Kind change mid-loop**: never re-scope silently. Stop, log the proposed change in the
  manifest's Decisions section, ask the user to confirm, then re-derive the remaining list.
- **Invariant change**: amend an already-approved Invariant only via a logged manifest
  decision **and** a fresh approval gate on the affected document.

### 6. On completion

When `09_implementation_plan.md` is approved, **stop — do not auto-chain**. Report the
suite is complete and suggest the next human-gated step:

> Foundation suite complete. Run `/plan-writing` to seed `planning/PLAN.md` from
> `09_implementation_plan.md` (it will carry the Non-goals and Invariants verbatim).

## Rules

- One document per iteration; explicit approval between each. No exceptions.
- The catalog and formats are defined once in `planning-format.md` — read them there,
  don't restate them. This skill owns the process, not the format.
- `planning/blueprint/` subfolders and the manifest are created at runtime, never by `/setup`.
- Delegate drafting to the `blueprinter` agent (fresh context) — keep this orchestration
  session lean across what may be a long, multi-document interview.
