---
name: investigate
description: >
  Create an isolated debug script to investigate a problem.
  Use when the user says "debug this", "investigate this error",
  "I don't understand why X fails", "trace", "exploratory script".
argument-hint: "[module or problem to investigate]"
allowed-tools: Read Write Bash(mkdir:*) Bash(ls:*) Grep Glob
---

# Investigate

Generate an isolated debug script to investigate a specific problem.
The script lives in `debug/` and never modifies production code.

## Procedure

### 1. Identify the problem

- If the user passed `$ARGUMENTS`, use it as the starting point.
- Read the affected module and understand the flow.
- Identify the probable point of failure.

### 2. Create the debug script

- Location: `debug/`
- Name: `dbg_<slug>[_<experiment>].<ext>` (see `file-naming.md` rule)
- If `debug/` does not exist, create it.
- Verify `debug/` is in `.gitignore`. If not, add it.

### 3. Script structure

```python
"""
Debug: <problem description>
Target: <module or function under investigation>
"""

# ----------------------------------------
# Step 1 — Reproduce the problem
# ----------------------------------------
# Load minimum data/state to reproduce

# ----------------------------------------
# Step 2 — Inspect intermediate values
# ----------------------------------------
# Print/log key variables at each step

# ----------------------------------------
# Step 3 — Hypothesis and verification
# ----------------------------------------
# Test the hypothesis about the root cause
```

## Rules

- Each debug script targets a specific module; keep that link explicit in the name.
- The script must be self-contained — executable without modifying source code.
- Use descriptive prints to trace the flow.
- Add inline comments to document findings and dead ends.
- If a bug is discovered, suggest creating a test with the `/test` skill.

## Clean code principle

- Temporary debug code (prints, flags, conditionals) may be added to production files **only during active debugging**.
- Before commit: all debug code must be removed from production files.
- Final production code must be clean, minimal, and production-ready.
- All deep debugging and verbose outputs must live exclusively in `debug/` scripts.

## Isolation and artifacts

- Debug scripts must never be imported by production code.
- Large files or outputs created during debugging go to `debug/.cache/` (also gitignored).
- All debug scripts live in `debug/` which must always be in `.gitignore`.

## Promotion path

If a debug script reveals a real bug worth preserving as a regression check:

1. Create a test with the `/test` skill that captures the bug.
2. Document the fix in the commit message.
3. Remove or archive the original debug script after resolving the bug.

## Feeding a cycle (the baseline)

`/investigate` is also the **opening move of a work cycle** (`planning-format.md` §C):
when a symptom or doubt might deserve a cycle, the investigation runs first and its
numbers decide.

- **The findings decide whether the cycle opens at all.** If the measurement shows
  the problem isn't real (or has a different cause), log one line in the bitácora
  and stop — a phantom cycle avoided is a win, not wasted work.
- **If the cycle opens, copy the findings + the measured baseline into the cycle's
  `## Origin`** before moving on. `debug/` is gitignored: the script is disposable,
  the evidence is not — it lives in the cycle file or nowhere.
- The baseline number becomes the X in the cycle's Objective ("move X → Y") and the
  reference its Close is measured against.
