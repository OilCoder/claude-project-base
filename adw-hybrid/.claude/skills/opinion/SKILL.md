---
name: opinion
description: Runs a bounded multi-perspective strategy debate and returns an orchestrator synthesis. Use for /opinion or when a decision benefits from competing evidence-based positions.
---

# Opinion workflow

1. Define the decision, constraints, and evidence boundary.
2. Form the initial position in the main session.
3. Write the decision and initial position to a temporary request file, then run
   one Codex cloud critic in read-only mode:

   ```bash
   bash .claude/skills/opinion/scripts/dispatch-opinion-codex.sh <request-file>
   ```

   Read only its `opinion.txt` result and compact summary; do not read
   `events.jsonl` unless the run fails without an actionable reason.
4. Reconcile the decision yourself. State evidence, tradeoffs, rejected option,
   and what would change the decision.

Use a second Codex critic only when the engineer explicitly asks for multiple
perspectives or two genuinely independent evidence searches can run without
duplicating context. Never dispatch the Claude `opinion` agent by default and
do not run cross-rebuttal rounds.

Debate strategy, not disposable implementation detail. Keep every message terse.
