<!-- description: Which verification each type of change requires, beyond the automatic Stop gate -->

# Verification

The Stop gate already enforces lint → format → test before any turn can end.
This rule covers what the gate cannot check: whether the verification that ran
is the **right one** for the change.

## Required verification by type of change

| Type of change | Required verification |
|---|---|
| New function or class | A test that exercises it, run successfully |
| Bug fix | A regression test that reproduces the bug **first**, then passes |
| Refactor | Existing test suite passes; no behavioral diff |
| Type changes | Type-check passes (`mypy`, `tsc --noEmit`, etc.) |
| UI changes | Screenshot or visual diff |
| Data pipeline | Run on a sample input; output matches expected shape |

If no verification channel exists for the type of change, **say so explicitly**
rather than claiming the task is done. "The code looks correct" is not verification.

## When the gate blocks

- Treat the failure as part of the task, not a separate problem.
- Address the **root cause**, not the symptom.
- If the failure is outside the scope of the current task, stop and report it
  before continuing.

## Forbidden

- Disabling tests with `@skip`, `xfail`, `it.skip`, or equivalents to make the
  suite green, unless the user explicitly asks for it.
- Deleting or weakening assertions so the test gate passes.
- Disabling linter rules (inline `# noqa`, config edits) to silence the lint gate.
- Bypassing hooks (`--no-verify`, `--no-gpg-sign`).
