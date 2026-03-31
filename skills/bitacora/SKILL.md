---
name: bitacora
description: >
  Log the current work session in the project's session log.
  Use after each commit or push, or when the user says
  "log the session", "record what we did", "bitacora", "session log".
argument-hint: "[optional summary message]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Bitacora (Session Log)

Record the work done in the current session as a log entry.
Target file: `todo/bitacora-YYYY-MM-DD.md` inside the project.

## When to run

- After each `git commit` or `git push`
- When the user explicitly requests it
- At the end of a long work session

## Procedure

### 1. Gather context

Run these commands to get session information:

```bash
# Current date
date +%Y-%m-%d

# Today's commits
git log --oneline --since="00:00" --format="%h %s"

# Files modified today
git diff --stat HEAD~$(git log --oneline --since="00:00" | wc -l) HEAD 2>/dev/null || git diff --stat HEAD~1 HEAD

# Current branch
git branch --show-current

# Current status
git status --short
```

### 2. Check if file exists

- If `todo/bitacora-YYYY-MM-DD.md` exists, **append** a new section at the end (do not overwrite).
- If it does not exist, **create** the file with the full template.
- If `todo/` does not exist, create it.

### 3. Write the entry

Each entry follows this structure:

```markdown
## HH:MM — [short summary of what was done]

### Technical changes
- modified_file.py — what changed and why
- new_file.py — what it does, why it was created

### Design decisions
- [Decision made] — [reason / alternatives discarded]

### Pending
- [ ] Task left undone
- [ ] Something to review later

### Learnings
- [Something new discovered during the session]
```

## Rules

- **Language**: Spanish for prose, English for code and file names (configurable per project).
- **Commits**: list short hashes and messages from the day.
- **No fabrication**: only record what actually happened in the session.
- **Accumulate**: a single day can have multiple entries (one per session/commit).
- **Pending items**: mark with `- [ ]` so Cowork can detect them for the daily plan.
- **Brevity**: each section should be concise, not an essay.
- If the user passes a message as argument (`$ARGUMENTS`), use it as the entry summary.

## New file template

```markdown
# Session Log — {readable date}

**Project**: {project name}
**Branch**: {current branch}

---

## HH:MM — {summary}

### Technical changes
- {file} — {description}

### Design decisions
- {decision} — {reason}

### Pending
- [ ] {task}

### Learnings
- {learning}

---
*Day's commits*: {list of hashes}
```

## Cowork integration

This file is read by Cowork to generate the `log-YYYY-MM-DD.md` note in the Obsidian vault.
Cowork enriches the log with wikilinks, Obsidian frontmatter, and connections to projects and daily plans.
