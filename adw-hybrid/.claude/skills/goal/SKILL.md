---
name: goal
description: Builds and verifies an evidence-backed ADW goal before planning. Use for /goal or when the user asks to define measurable outcomes and done-when criteria.
---

# Goal workflow

1. The main Claude session interprets the engineer request, resolves only
   material ambiguities, and writes the exact request to a temporary text file.
2. Run Codex cloud in the foreground:

   ```bash
   bash .claude/skills/goal/scripts/dispatch-goal-codex.sh <request-file>
   ```

   Codex researches the repository and any necessary external evidence, then
   writes only `adw/goal.md` in an isolated worktree. The adapter validates the
   scope and installs the resulting goal in the main worktree. The document is
   a canonical replacement, not an append-only research log: integrate current
   decisions in place and remove superseded findings, repeated evidence, debate
   transcripts, and historical resolution lists.
3. Claude reads `adw/goal.md` and the compact attempt summary only. It verifies
   pivotal claims, metric completeness, unknowns, and falsifiable done-when
   criteria itself; do not launch a Claude `researcher` or `verifier` by default.
4. If corrections are substantial, rerun Codex once with a request containing
   only the actionable corrections. Claude may make trivial wording corrections
   directly. Escalate unresolved factual or subjective choices to the user.
5. Present the objective, metrics, unknowns, and done-when for approval.

Before presentation, run the shared budget check:

```bash
bash .claude/skills/adw/scripts/check-doc-budgets.sh adw/goal.md
```

The Codex run uses the committed repository snapshot; tell the user when
uncommitted source changes are relevant to the goal. The adapter overlays the
current `adw/goal.md` so correction passes never regress to a stale committed
version. By default it rejects drafts above 3,000 words or 400 lines; raise that
budget only with an explicit engineer decision. Never read its
`events.jsonl` unless the compact summary and final message cannot explain a
failure. Never dispatch two agents to perform the same research. Do not start
ADW planning until the user approves.
